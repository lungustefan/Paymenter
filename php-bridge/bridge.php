<?php
/**
 * Paymenter PHP bridge worker: a long-lived `php` CLI process that speaks
 * newline-delimited JSON-RPC style messages over stdin/stdout with the Node.js panel.
 *
 *   panel -> worker   {"id":1,"method":"call","params":{...}}      -> {"id":1,"result":...} | {"id":1,"error":{...}}
 *   worker -> panel   {"hid":7,"host":"http","params":{...}}       <- {"hid":7,"result":...} | {"hid":7,"error":"..."}
 *
 * The worker only ever loads PHP from the extensions directory it is started with
 * (argv[1]); extension / class names coming over the wire are validated against a
 * strict whitelist pattern and resolved below that directory.
 */

error_reporting(E_ALL & ~E_DEPRECATED);
ini_set('display_errors', '0');

// stray output of extensions (echo/print/warnings) must never corrupt the protocol channel
ob_start(function ($chunk) { if ($chunk !== '') fwrite(STDERR, $chunk); return ''; }, 1);

require __DIR__ . '/shim.php';

final class PaymenterBridge {
    public static string $root;
    public static $request = null;
    private static array $pending = [];
    private static int $hid = 0;
    private static array $booted = [];

    public static function out(array $msg): void {
        fwrite(STDOUT, json_encode($msg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
        fflush(STDOUT);
    }

    /** blocking call into the panel; incoming requests are served re-entrantly while waiting */
    public static function host(string $method, array $params = []) {
        $id = ++self::$hid;
        self::out(['hid' => $id, 'host' => $method, 'params' => $params]);
        while (!array_key_exists($id, self::$pending)) {
            if (!self::readOne()) throw new \RuntimeException('The panel closed the PHP bridge');
        }
        $r = self::$pending[$id]; unset(self::$pending[$id]);
        if (isset($r['error'])) {
            if (is_array($r['error']) && ($r['error']['kind'] ?? '') === 'abort') throw new \Symfony\Component\HttpKernel\Exception\HttpException((int) $r['error']['status'], (string) $r['error']['message']);
            throw new \Exception(is_array($r['error']) ? ($r['error']['message'] ?? 'host error') : (string) $r['error']);
        }
        return $r['result'] ?? null;
    }

    private static function readOne(): bool {
        $line = fgets(STDIN);
        if ($line === false) return false;
        $line = trim($line);
        if ($line === '') return true;
        $msg = json_decode($line, true);
        if (!is_array($msg)) return true;
        if (isset($msg['hid'])) { self::$pending[$msg['hid']] = $msg; return true; }
        if (isset($msg['method'])) self::dispatch($msg);
        return true;
    }

    public static function run(): void {
        while (self::readOne()) {}
    }

    private static function dispatch(array $msg): void {
        $id = $msg['id'] ?? null;
        try {
            $result = self::handle($msg['method'], $msg['params'] ?? []);
            self::out(['id' => $id, 'result' => \Paymenter\Bridge\export($result)]);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            self::out(['id' => $id, 'error' => ['kind' => 'http', 'status' => $e->getStatusCode(), 'message' => $e->getMessage()]]);
        } catch (\Throwable $e) {
            $kind = $e instanceof \Paymenter\Bridge\Unsupported || $e instanceof \Error ? 'unsupported' : 'exception';
            self::out(['id' => $id, 'error' => ['kind' => $kind, 'class' => get_class($e), 'message' => $e->getMessage(), 'trace' => $e->getFile() . ':' . $e->getLine()]]);
        }
    }

    /** `Gateways|Servers|Others` + class name: only letters, digits and underscores */
    private static function target(array $p): array {
        $type = $p['type'] ?? '';
        $name = $p['name'] ?? '';
        $dir = ['gateway' => 'Gateways', 'server' => 'Servers', 'other' => 'Others', 'extension' => 'Others'][$type] ?? null;
        if ($dir === null || !is_string($name) || !preg_match('/^[A-Za-z][A-Za-z0-9_]*$/', $name)) throw new \InvalidArgumentException('Invalid extension');
        $file = self::$root . "/$dir/$name/$name.php";
        if (!is_file($file)) throw new \RuntimeException("Extension \"$name\" not found");
        return [$dir, $name, "Paymenter\\Extensions\\$dir\\$name\\$name"];
    }

    private static function instance(array $p) {
        [, , $cls] = self::target($p);
        if (!class_exists($cls)) throw new \RuntimeException("Extension class $cls not found");
        $i = new $cls(\Paymenter\Bridge\import($p['config'] ?? []));
        \Illuminate\Support\Facades\Event::$current = $p['name'];
        return $i;
    }

    private static function handle(string $method, array $p) {
        switch ($method) {
            case 'ping': return 'pong';
            case 'describe': return self::describe($p);
            case 'call': return self::callMethod($p);
            case 'boot': return self::boot($p);
            case 'route': return self::route($p);
            case 'event': return self::event($p);
        }
        throw new \InvalidArgumentException("Unknown method $method");
    }

    private static function describe(array $p): array {
        [, , $cls] = self::target($p);
        if (!class_exists($cls)) throw new \RuntimeException("Extension class $cls not found");
        $ref = new \ReflectionClass($cls);
        $meta = null;
        foreach ($ref->getAttributes(\App\Attributes\ExtensionMeta::class) as $a) { $meta = get_object_vars($a->newInstance()); }
        $base = [\App\Classes\Extension\Extension::class, \App\Classes\Extension\Gateway::class, \App\Classes\Extension\Server::class];
        $methods = [];
        foreach ($ref->getMethods(\ReflectionMethod::IS_PUBLIC) as $m) {
            if ($m->isStatic() || $m->isConstructor() || str_starts_with($m->getName(), '__')) continue;
            // methods of the shim base classes (installed(), charge()...) only count when the extension overrides them
            if (in_array($m->getDeclaringClass()->getName(), $base, true)) continue;
            $methods[] = $m->getName();
        }
        return ['meta' => $meta, 'methods' => $methods, 'class' => $cls, 'parent' => get_parent_class($cls)];
    }

    private static function callMethod(array $p) {
        $fn = $p['fn'] ?? '';
        if (!is_string($fn) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $fn) || str_starts_with($fn, '__')) throw new \InvalidArgumentException('Invalid function');
        $i = self::instance($p);
        if (!method_exists($i, $fn) || !(new \ReflectionMethod($i, $fn))->isPublic()) throw new \RuntimeException('Function not found');
        $args = \Paymenter\Bridge\import($p['args'] ?? []);
        $result = $i->$fn(...array_values($args));
        if (in_array($fn, ['getConfig', 'getProductConfig', 'getCheckoutConfig'], true) && is_array($result)) {
            // HtmlString hints/descriptions become `hintHtml` / `descriptionHtml` flags of the panel's form DSL
            foreach ($result as $k => $field) {
                if (!is_array($field)) continue;
                foreach (['hint', 'description'] as $key) if (($field[$key] ?? null) instanceof \Illuminate\Support\HtmlString) $result[$k][$key . 'Html'] = true;
            }
        }
        return $result;
    }

    /** run boot(): collects routes + listeners registered by the extension */
    private static function boot(array $p): array {
        $name = $p['name'];
        $i = self::instance($p);
        \Illuminate\Support\Facades\Route::$routes = [];
        \Illuminate\Support\Facades\Event::$listeners[$name] = [];
        self::$booted[$name] = ['routes' => [], 'config' => $p['config'] ?? [], 'type' => $p['type']];
        $i->boot();
        $routes = [];
        foreach (\Illuminate\Support\Facades\Route::$routes as $idx => $r) {
            $key = "$name:$idx";
            self::$booted[$name]['routes'][$key] = $r;
            $routes[] = ['key' => $key, 'methods' => $r->methods, 'path' => $r->path, 'name' => $r->routeName, 'auth' => (bool) array_intersect(['auth', 'auth:web', 'verified'], array_map('strval', $r->middleware)), 'where' => $r->where];
        }
        return ['routes' => $routes, 'events' => array_keys(\Illuminate\Support\Facades\Event::$listeners[$name] ?? [])];
    }

    private static function route(array $p) {
        $name = $p['name'];
        $r = self::$booted[$name]['routes'][$p['key']] ?? null;
        if (!$r) throw new \RuntimeException('Unknown route');
        $req = new \Illuminate\Http\Request($p['request'] ?? []);
        self::$request = $req;
        $action = $r->action;
        $params = $p['request']['params'] ?? [];
        if ($action instanceof \Closure) { $fn = new \ReflectionFunction($action); $callee = $action; }
        elseif (is_array($action)) {
            $inst = new $action[0](\Paymenter\Bridge\import($p['config'] ?? []));
            $fn = new \ReflectionMethod($inst, $action[1]); $callee = [$inst, $action[1]];
        } else throw new \RuntimeException('Unsupported route action');
        $args = [];
        foreach ($fn->getParameters() as $prm) {
            $t = $prm->getType() instanceof \ReflectionNamedType ? $prm->getType()->getName() : null;
            if ($t && is_a($t, \Illuminate\Http\Request::class, true)) $args[] = $req;
            elseif ($t && str_starts_with($t, 'App\\Models\\')) $args[] = $t::query()->where('id', $params[$prm->getName()] ?? null)->firstOrFail();
            elseif (array_key_exists($prm->getName(), $params)) $args[] = $params[$prm->getName()];
            elseif ($prm->isDefaultValueAvailable()) $args[] = $prm->getDefaultValue();
            else $args[] = null;
        }
        try { $res = $callee(...$args); } finally { self::$request = null; }
        if ($res instanceof \Illuminate\Http\Response) return ['__response' => true, 'status' => $res->status, 'headers' => $res->headers, 'body' => (string) $res->content];
        if ($res === null) return ['__response' => true, 'status' => 200, 'headers' => [], 'body' => ''];
        if ($res instanceof \Illuminate\Contracts\View\View) throw new \Paymenter\Bridge\Unsupported("Route returned the Blade view \"{$res->name}\"; Blade views cannot be rendered by the Node.js panel");
        if (is_string($res) || $res instanceof \Stringable) return ['__response' => true, 'status' => 200, 'headers' => ['Content-Type' => 'text/html; charset=utf-8'], 'body' => (string) $res];
        return ['__response' => true, 'status' => 200, 'headers' => ['Content-Type' => 'application/json'], 'body' => json_encode(\Paymenter\Bridge\export($res))];
    }

    private static function event(array $p) {
        $name = $p['name'];
        $event = ltrim($p['event'], '\\');
        $payload = \Paymenter\Bridge\import($p['payload'] ?? []);
        $obj = new \stdClass();
        foreach ($payload as $k => $v) $obj->$k = $v;
        $config = \Paymenter\Bridge\import($p['config'] ?? self::$booted[$name]['config'] ?? []);
        foreach (\Illuminate\Support\Facades\Event::$listeners[$name][$event] ?? [] as $l) {
            if ($l instanceof \Closure) $l($obj);
            elseif (is_array($l)) (is_object($l[0]) ? $l[0] : new $l[0]($config))->{$l[1]}($obj);
            elseif (is_string($l) && str_contains($l, '@')) { [$c, $m] = explode('@', $l, 2); (new $c($config))->$m($obj); }
            elseif (is_string($l) && class_exists($l)) (new $l($config))->handle($obj);
            elseif (is_callable($l)) $l($obj);
        }
        return null;
    }
}

PaymenterBridge::$root = rtrim(realpath($argv[1] ?? '') ?: '', '/');
if (PaymenterBridge::$root === '') { fwrite(STDERR, "usage: php bridge.php <extensions-dir>\n"); exit(2); }

// PSR-4: Paymenter\Extensions\ -> <extensions dir>/ ; App\Models\X and App\Events\X are generated on demand
spl_autoload_register(function ($class) {
    $prefix = 'Paymenter\\Extensions\\';
    if (str_starts_with($class, $prefix)) {
        $rel = substr($class, strlen($prefix));
        if (!preg_match('/^[A-Za-z0-9_\\\\]+$/', $rel)) return;
        $file = PaymenterBridge::$root . '/' . str_replace('\\', '/', $rel) . '.php';
        if (is_file($file)) require_once $file;
        return;
    }
    if (preg_match('/^App\\\\Models\\\\([A-Za-z0-9_]+)$/', $class, $m)) { eval("namespace App\\Models; class {$m[1]} extends \\Illuminate\\Database\\Eloquent\\Model {}"); return; }
    if (preg_match('/^App\\\\Admin\\\\Resources\\\\([A-Za-z0-9_]+)Resource$/', $class, $m)) {
        eval("namespace App\\Admin\\Resources; class {$m[1]}Resource { public static function getUrl(\$page = 'index', \$params = []) { \$r = \$params['record'] ?? null; return \\Paymenter\\Bridge\\host('admin.resource', ['resource' => '{$m[1]}Resource', 'page' => \$page, 'record' => is_object(\$r) ? \$r->getKey() : \$r]); } public static function getModelLabel() { return \\Paymenter\\Bridge\\host('admin.label', ['resource' => '{$m[1]}Resource']); } }");
        return;
    }
    if (preg_match('/^App\\\\Events\\\\([A-Za-z0-9_\\\\]+)$/', $class)) {
        $ns = substr($class, 0, strrpos($class, '\\')); $n = substr($class, strrpos($class, '\\') + 1);
        eval("namespace $ns; class $n { public function __construct(...\$a) {} }"); return;
    }
});

PaymenterBridge::run();
