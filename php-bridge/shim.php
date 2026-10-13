<?php
/**
 * Laravel compatibility shim for third-party Paymenter (PHP) extensions.
 *
 * This is NOT Laravel. It implements the small slice of the framework that
 * extensions written against Paymenter v1.5.x actually use (Http, Cache, Log,
 * Route, Event, Str/Arr/Collection, route()/config()/settings() ...) and talks to
 * the Node.js panel through `host()` (see bridge.php) for everything that needs
 * the database, the settings or the network.
 */

namespace Paymenter\Bridge {
    /** JSON-RPC callback into the panel (set by bridge.php) */
    function host(string $method, array $params = []) {
        return \PaymenterBridge::host($method, $params);
    }

    class Unsupported extends \RuntimeException {}

    /** marshal PHP values for the panel */
    function export($v) {
        if ($v instanceof \Illuminate\Database\Eloquent\Model) return $v->toArray();
        if ($v instanceof \Illuminate\Support\Collection) return array_map(__NAMESPACE__ . '\\export', $v->all());
        if ($v instanceof \Illuminate\Support\HtmlString) return (string) $v;
        if ($v instanceof \DateTimeInterface) return $v->format('Y-m-d H:i:s');
        if ($v instanceof \Illuminate\Contracts\View\View) return ['__unsupported' => 'view', 'name' => $v->name];
        if ($v instanceof \Illuminate\Http\Response) return ['__response' => true, 'status' => $v->status, 'headers' => $v->headers, 'body' => $v->content];
        if ($v instanceof \JsonSerializable) return export($v->jsonSerialize());
        if ($v instanceof \Stringable) return (string) $v;
        if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = export($x); return $v; }
        if (is_object($v)) return export(get_object_vars($v));
        return $v;
    }

    /** turn panel data back into objects: `{__model: "Service", ...}` becomes App\Models\Service */
    function import($v) {
        if (is_array($v)) {
            if (isset($v['__model']) && is_string($v['__model'])) {
                $cls = 'App\\Models\\' . preg_replace('/[^A-Za-z0-9_]/', '', $v['__model']);
                $attrs = $v['attributes'] ?? [];
                $rels = [];
                foreach (($v['relations'] ?? []) as $k => $r) $rels[$k] = import($r);
                return (new $cls)->hydrate($attrs, $rels, $v['changes'] ?? [], $v['original'] ?? [])->setRouteKey($v['routeKey'] ?? null);
            }
            foreach ($v as $k => $x) $v[$k] = import($x);
        }
        return $v;
    }
}

namespace App\Attributes {
    #[\Attribute(\Attribute::TARGET_CLASS)]
    class ExtensionMeta {
        public function __construct(public string $name = '', public string $description = '', public string $version = '', public string $author = '', public string $url = '', public string $icon = '') {}
    }
}

namespace App\Classes\Extension {
    class Extension {
        public function __construct(public $config = []) {}
        public function config($key) { return $this->config[$key] ?? null; }
        public function getConfig($values = []) { return []; }
        public function installed() {}
        public function uninstalled() {}
        public function upgraded($oldVersion = null) {}
        public function boot() {}
    }
    class Gateway extends Extension {
        public function supportsBillingAgreements(): bool { return false; }
        public function createBillingAgreement($user) { throw new \Exception('Not implemented'); }
        public function cancelBillingAgreement($billingAgreement): bool { throw new \Exception('Not implemented'); }
        public function charge($invoice, $total, $billingAgreement) { throw new \Exception('Not implemented'); }
    }
    class Server extends Extension {}
}

namespace App\Helpers {
    use function Paymenter\Bridge\host;
    class ExtensionHelper {
        public static function addPayment($invoice, $gateway, $amount, $fee = null, $transactionId = null, $status = 'succeeded', $isCreditTransaction = false) {
            return host('addPayment', ['invoice' => is_object($invoice) ? $invoice->id : $invoice, 'gateway' => $gateway, 'amount' => $amount, 'fee' => $fee, 'transactionId' => $transactionId, 'status' => $status, 'isCredit' => $isCreditTransaction]);
        }
        public static function addProcessingPayment($invoice, $gateway, $amount, $fee = null, $transactionId = null) {
            return self::addPayment($invoice, $gateway, $amount, $fee, $transactionId, 'processing');
        }
        public static function addFailedPayment($invoice, $gateway, $amount, $fee = null, $transactionId = null) {
            return self::addPayment($invoice, $gateway, $amount, $fee, $transactionId, 'failed');
        }
        public static function addPaymentFee($transactionId, $fee) { return host('addPaymentFee', ['transactionId' => $transactionId, 'fee' => $fee]); }
        public static function makeBillingAgreement($user, $gateway, $name, $externalReference, $type = null, $expiry = null) {
            return host('makeBillingAgreement', ['user' => is_object($user) ? $user->id : $user, 'gateway' => $gateway, 'name' => $name, 'externalReference' => $externalReference, 'type' => $type, 'expiry' => $expiry instanceof \DateTimeInterface ? $expiry->format('Y-m-d H:i:s') : $expiry]);
        }
    }
}

namespace Illuminate\Contracts\View { interface View {} }

namespace Illuminate\View {
    class View implements \Illuminate\Contracts\View\View {
        public function __construct(public string $name = '', public array $data = []) {}
        public function with($k, $v = null) { return $this; }
    }
}

namespace Illuminate\Support {
    class HtmlString implements \Stringable {
        public function __construct(protected $html = '') {}
        public function toHtml() { return $this->html; }
        public function __toString(): string { return (string) $this->html; }
    }

    class Collection implements \ArrayAccess, \IteratorAggregate, \Countable, \JsonSerializable {
        public function __construct(protected $items = []) { $this->items = $items instanceof self ? $items->all() : (array) $items; }
        public static function make($items = []) { return new static($items); }
        public function all() { return $this->items; }
        public function toArray() { return array_map(fn ($v) => $v instanceof self ? $v->toArray() : $v, $this->items); }
        public function jsonSerialize(): mixed { return $this->toArray(); }
        public function getIterator(): \ArrayIterator { return new \ArrayIterator($this->items); }
        public function count(): int { return count($this->items); }
        public function offsetExists(mixed $k): bool { return isset($this->items[$k]); }
        public function offsetGet(mixed $k): mixed { return $this->items[$k]; }
        public function offsetSet(mixed $k, mixed $v): void { if ($k === null) $this->items[] = $v; else $this->items[$k] = $v; }
        public function offsetUnset(mixed $k): void { unset($this->items[$k]); }
        public function isEmpty() { return empty($this->items); }
        public function isNotEmpty() { return !empty($this->items); }
        public function has($k) { foreach ((array) $k as $key) if (!array_key_exists($key, $this->items)) return false; return true; }
        public function get($k, $default = null) { return array_key_exists($k, $this->items) ? $this->items[$k] : (is_callable($default) ? $default() : $default); }
        public function put($k, $v) { $this->items[$k] = $v; return $this; }
        public function push(...$v) { foreach ($v as $x) $this->items[] = $x; return $this; }
        public function keys() { return new static(array_keys($this->items)); }
        public function values() { return new static(array_values($this->items)); }
        public function first($cb = null, $default = null) {
            foreach ($this->items as $k => $v) if ($cb === null || $cb($v, $k)) return $v;
            return is_callable($default) ? $default() : $default;
        }
        public function last($cb = null, $default = null) { return (new static(array_reverse($this->items, true)))->first($cb, $default); }
        public function map(callable $cb) { $k = array_keys($this->items); return new static(array_combine($k, array_map($cb, $this->items, $k))); }
        public function each(callable $cb) { foreach ($this->items as $k => $v) if ($cb($v, $k) === false) break; return $this; }
        public function mapWithKeys(callable $cb) { $r = []; foreach ($this->items as $k => $v) foreach ($cb($v, $k) as $mk => $mv) $r[$mk] = $mv; return new static($r); }
        public function filter(?callable $cb = null) { return new static($cb ? array_filter($this->items, $cb, ARRAY_FILTER_USE_BOTH) : array_filter($this->items)); }
        public function reject(callable $cb) { return $this->filter(fn ($v, $k) => !$cb($v, $k)); }
        public function where($key, $op = null, $value = null) {
            if (func_num_args() === 2) { $value = $op; $op = '='; }
            return $this->filter(function ($item) use ($key, $op, $value) {
                $a = \data_get($item, $key);
                return match ($op) { '=', '==' => $a == $value, '===' => $a === $value, '!=', '<>' => $a != $value, '>' => $a > $value, '>=' => $a >= $value, '<' => $a < $value, '<=' => $a <= $value, default => false };
            });
        }
        public function whereIn($key, $values) { return $this->filter(fn ($i) => in_array(\data_get($i, $key), (array) $values)); }
        public function pluck($value, $key = null) {
            $r = [];
            foreach ($this->items as $i) { if ($key === null) $r[] = \data_get($i, $value); else $r[\data_get($i, $key)] = \data_get($i, $value); }
            return new static($r);
        }
        public function sortBy($cb, $flags = SORT_REGULAR, $desc = false) {
            $f = is_callable($cb) ? $cb : fn ($i) => \data_get($i, $cb);
            $items = $this->items; uasort($items, fn ($a, $b) => $desc ? $f($b) <=> $f($a) : $f($a) <=> $f($b)); return new static($items);
        }
        public function sort($cb = null) { $i = $this->items; $cb ? uasort($i, $cb) : asort($i); return new static($i); }
        public function sum($cb = null) { return array_sum($cb ? array_map(is_callable($cb) ? $cb : fn ($i) => \data_get($i, $cb), $this->items) : $this->items); }
        public function reduce(callable $cb, $init = null) { return array_reduce($this->items, $cb, $init); }
        public function contains($v, $op = null, $val = null) {
            if (is_callable($v) && !is_string($v)) return $this->first($v) !== null;
            return in_array($v, $this->items);
        }
        public function implode($glue, $sep = null) { return $sep === null ? implode($glue, $this->items) : implode($sep, $this->pluck($glue)->all()); }
        public function unique() { return new static(array_unique($this->items, SORT_REGULAR)); }
        public function merge($o) { return new static(array_merge($this->items, $o instanceof self ? $o->all() : (array) $o)); }
        public function flatten() { $r = []; array_walk_recursive($this->items, function ($v) use (&$r) { $r[] = $v; }); return new static($r); }
        public function flip() { return new static(array_flip($this->items)); }
        public function take($n) { return new static($n < 0 ? array_slice($this->items, $n, null, true) : array_slice($this->items, 0, $n, true)); }
        public function slice($o, $l = null) { return new static(array_slice($this->items, $o, $l, true)); }
        public function reverse() { return new static(array_reverse($this->items, true)); }
        public function random($n = null) {
            if (empty($this->items)) { if ($n === null) throw new \InvalidArgumentException('You requested 1 items, but there are only 0 items available.'); return new static; }
            if ($n === null) return $this->items[array_rand($this->items)];
            return new static(array_map(fn ($k) => $this->items[$k], (array) array_rand($this->items, min($n, count($this->items)))));
        }
        public function toJson($o = 0) { return json_encode($this->jsonSerialize(), $o); }
        public function pipe(callable $cb) { return $cb($this); }
        public function tap(callable $cb) { $cb($this); return $this; }
        public function __get($k) { throw new \Exception("Property [$k] does not exist on this collection instance."); }
    }

    class Str {
        public static function random($length = 16) {
            $s = ''; while (strlen($s) < $length) $s .= preg_replace('/[^a-zA-Z0-9]/', '', base64_encode(random_bytes($length)));
            return substr($s, 0, $length);
        }
        public static function password($length = 32, $letters = true, $numbers = true, $symbols = true, $spaces = false) {
            $pool = ($letters ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' : '') . ($numbers ? '0123456789' : '') . ($symbols ? '~!#$%^&*()-_.,<>?/\\{}[]|:;' : '') . ($spaces ? ' ' : '');
            $r = ''; for ($i = 0; $i < $length; $i++) $r .= $pool[random_int(0, strlen($pool) - 1)];
            return $r;
        }
        public static function transliterate($s, $unknown = '?', $strict = false) {
            if (function_exists('transliterator_transliterate')) { $t = transliterator_transliterate('Any-Latin; Latin-ASCII', (string) $s); if ($t !== false) return $t; }
            $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string) $s); return $t === false ? $unknown : $t;
        }
        public static function contains($h, $n, $ignoreCase = false) { foreach ((array) $n as $x) if ($x !== '' && ($ignoreCase ? stripos($h, $x) : strpos($h, $x)) !== false) return true; return false; }
        public static function startsWith($h, $n) { foreach ((array) $n as $x) if ($x !== '' && str_starts_with($h, $x)) return true; return false; }
        public static function endsWith($h, $n) { foreach ((array) $n as $x) if ($x !== '' && str_ends_with($h, $x)) return true; return false; }
        public static function doesntEndWith($h, $n) { return !self::endsWith($h, $n); }
        public static function substr($s, $start, $length = null) { return mb_substr($s, $start, $length, 'UTF-8'); }
        public static function lower($s) { return mb_strtolower($s, 'UTF-8'); }
        public static function upper($s) { return mb_strtoupper($s, 'UTF-8'); }
        public static function length($s) { return mb_strlen($s, 'UTF-8'); }
        public static function limit($s, $limit = 100, $end = '...') { return mb_strlen($s) <= $limit ? $s : rtrim(mb_substr($s, 0, $limit)) . $end; }
        public static function ucfirst($s) { return mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1); }
        public static function before($s, $x) { return $x === '' ? $s : (explode($x, $s)[0]); }
        public static function after($s, $x) { return $x === '' ? $s : (str_contains($s, $x) ? substr($s, strpos($s, $x) + strlen($x)) : $s); }
        public static function replace($search, $replace, $subject) { return str_replace($search, $replace, $subject); }
        public static function slug($s, $sep = '-') { $s = self::lower(self::transliterate($s)); $s = preg_replace('/[^a-z0-9]+/', $sep, $s); return trim($s, $sep); }
        public static function snake($s, $d = '_') { return strtolower(preg_replace('/(.)(?=[A-Z])/u', '$1' . $d, preg_replace('/\s+/u', '', ucwords($s)))); }
        public static function studly($s) { return str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $s))); }
        public static function camel($s) { return lcfirst(self::studly($s)); }
        public static function title($s) { return mb_convert_case($s, MB_CASE_TITLE, 'UTF-8'); }
        public static function uuid() { $d = random_bytes(16); $d[6] = chr(ord($d[6]) & 0x0f | 0x40); $d[8] = chr(ord($d[8]) & 0x3f | 0x80); return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4)); }
        public static function is($pattern, $value) { return (bool) preg_match('/^' . str_replace('\*', '.*', preg_quote($pattern, '/')) . '\z/u', $value); }
        public static function mask($s, $c, $i, $l = null) { $seg = mb_substr($s, $i, $l); return mb_substr($s, 0, $i) . str_repeat($c, mb_strlen($seg)) . mb_substr($s, $i + mb_strlen($seg)); }
    }

    class Arr {
        public static function get($a, $k, $d = null) { return \data_get($a, $k, $d); }
        public static function has($a, $k) { foreach ((array) $k as $key) { $c = $a; foreach (explode('.', $key) as $p) { if (!is_array($c) || !array_key_exists($p, $c)) return false; $c = $c[$p]; } } return true; }
        public static function first($a, $cb = null, $d = null) { foreach ($a as $k => $v) if ($cb === null || $cb($v, $k)) return $v; return $d; }
        public static function last($a, $cb = null, $d = null) { return self::first(array_reverse($a, true), $cb, $d); }
        public static function only($a, $k) { return array_intersect_key($a, array_flip((array) $k)); }
        public static function except($a, $k) { return array_diff_key($a, array_flip((array) $k)); }
        public static function wrap($v) { return $v === null ? [] : (is_array($v) ? $v : [$v]); }
        public static function pluck($a, $v, $k = null) { return (new Collection($a))->pluck($v, $k)->all(); }
        public static function flatten($a) { return (new Collection($a))->flatten()->all(); }
        public static function where($a, $cb) { return array_filter($a, $cb, ARRAY_FILTER_USE_BOTH); }
        public static function isAssoc($a) { return array_keys($a) !== range(0, count($a) - 1); }
        public static function set(&$a, $key, $value) { $c = &$a; foreach (explode('.', $key) as $p) { if (!isset($c[$p]) || !is_array($c[$p])) $c[$p] = []; $c = &$c[$p]; } $c = $value; return $a; }
    }

    class Carbon extends \DateTime {
        public static function now($tz = null) { return new static('now', $tz ? new \DateTimeZone($tz) : null); }
        public static function parse($s, $tz = null) { return new static($s, $tz ? new \DateTimeZone($tz) : null); }
        public static function createFromTimestamp($ts, $tz = null) { return (new static('@' . (int) $ts))->setTimezone(new \DateTimeZone($tz ?: date_default_timezone_get())); }
        public static function createFromDate($y = null, $m = null, $d = null, $tz = null) { $n = static::now($tz); return $n->setDate($y ?? (int) $n->format('Y'), $m ?? (int) $n->format('n'), $d ?? (int) $n->format('j')); }
        public static function today() { return static::now()->startOfDay(); }
        public function startOfDay() { return $this->setTime(0, 0, 0); }
        public function endOfDay() { return $this->setTime(23, 59, 59); }
        public function __call($m, $a) {
            if (preg_match('/^(add|sub)(Second|Minute|Hour|Day|Week|Month|Year)s?$/', $m, $x)) { $this->modify(($x[1] === 'add' ? '+' : '-') . (int) ($a[0] ?? 1) . ' ' . strtolower($x[2])); return $this; }
            throw new \BadMethodCallException("Carbon::$m is not supported by the compatibility shim");
        }
        public function __get($n) { return match ($n) { 'timestamp' => $this->getTimestamp(), 'year' => (int) $this->format('Y'), 'month' => (int) $this->format('n'), 'day' => (int) $this->format('j'), 'hour' => (int) $this->format('G'), 'minute' => (int) $this->format('i'), 'second' => (int) $this->format('s'), default => null }; }
        public function timestamp() { return $this->getTimestamp(); }
        public function toDateTimeString() { return $this->format('Y-m-d H:i:s'); }
        public function toDateString() { return $this->format('Y-m-d'); }
        public function toIso8601String() { return $this->format(DATE_ATOM); }
        public function toISOString() { return $this->format('Y-m-d\TH:i:s.v\Z'); }
        public function isPast() { return $this->getTimestamp() < time(); }
        public function isFuture() { return $this->getTimestamp() > time(); }
        public function diffInDays($o = null, $abs = true) { $o ??= static::now(); return (int) floor(($o->getTimestamp() - $this->getTimestamp()) / 86400 * ($abs ? 1 : 1)) * 1; }
        public function copy() { return clone $this; }
        public function __toString(): string { return $this->toDateTimeString(); }
    }
}

namespace Carbon { class Carbon extends \Illuminate\Support\Carbon {} }

namespace Illuminate\Http\Client {
    class RequestException extends \Exception {
        public function __construct(public $response) { parent::__construct('HTTP request returned status code ' . $response->status() . ':' . "\n" . substr($response->body(), 0, 500)); }
    }
    class ConnectionException extends \Exception {}

    class Response implements \ArrayAccess {
        private $decoded = null; private $didDecode = false;
        public function __construct(private int $status, private array $headers, private string $body) {}
        public function status() { return $this->status; }
        public function body() { return $this->body; }
        public function headers() { return $this->headers; }
        public function header($n) { foreach ($this->headers as $k => $v) if (strcasecmp($k, $n) === 0) return $v; return ''; }
        public function json($key = null, $default = null) {
            if (!$this->didDecode) { $this->decoded = json_decode($this->body, true); $this->didDecode = true; }
            return $key === null ? $this->decoded : \data_get($this->decoded, $key, $default);
        }
        public function object() { return json_decode($this->body); }
        public function collect($key = null) { return new \Illuminate\Support\Collection($this->json($key) ?? []); }
        public function successful() { return $this->status >= 200 && $this->status < 300; }
        public function ok() { return $this->status === 200; }
        public function failed() { return $this->status >= 400; }
        public function redirect() { return $this->status >= 300 && $this->status < 400; }
        public function clientError() { return $this->status >= 400 && $this->status < 500; }
        public function serverError() { return $this->status >= 500; }
        public function throw($cb = null) { if ($this->failed()) { $e = new RequestException($this); if ($cb) $cb($this, $e); throw $e; } return $this; }
        public function throwIf($c) { return $c ? $this->throw() : $this; }
        public function __toString(): string { return $this->body; }
        public function offsetExists(mixed $k): bool { return isset($this->json()[$k]); }
        public function offsetGet(mixed $k): mixed { return $this->json()[$k] ?? null; }
        public function offsetSet(mixed $k, mixed $v): void {}
        public function offsetUnset(mixed $k): void {}
    }

    class PendingRequest {
        private const BUILDERS = ['withHeaders', 'withHeader', 'withToken', 'withBasicAuth', 'accept', 'acceptJson', 'contentType', 'asJson', 'asForm', 'asMultipart', 'withBody', 'timeout', 'baseUrl', 'retry', 'withoutVerifying'];
        private const VERBS = ['get', 'head', 'post', 'put', 'patch', 'delete'];
        private $calls = [];
        public function __call($m, $a) {
            // PHP method names are case-insensitive: `$http->GET()` works in Laravel
            foreach (array_merge(self::BUILDERS, self::VERBS) as $known) if (strcasecmp($known, $m) === 0) { $m = $known; break; }
            if (in_array($m, self::BUILDERS, true)) { $this->calls[] = [$m, $a]; return $this; }
            if (in_array($m, self::VERBS, true)) return $this->send($m, $a[0] ?? '', $a[1] ?? null);
            if (in_array($m, ['withOptions', 'withUserAgent', 'connectTimeout', 'throw', 'dd'], true)) return $this;
            throw new \Paymenter\Bridge\Unsupported("Http::$m() is not supported by the Paymenter PHP compatibility shim");
        }
        public function send($method, $url, $data = null) {
            $r = \Paymenter\Bridge\host('http', ['calls' => \Paymenter\Bridge\export($this->calls), 'method' => $method, 'url' => $url, 'data' => \Paymenter\Bridge\export($data)]);
            if (!empty($r['connectionError'])) throw new ConnectionException($r['connectionError']);
            return new Response($r['status'], $r['headers'] ?? [], $r['body'] ?? '');
        }
    }
}

namespace Illuminate\Http {
    class Request {
        public function __construct(public array $data = []) {}
        public static function fromPanel(array $d) { return new static($d); }
        public function method() { return $this->data['method'] ?? 'GET'; }
        public function isMethod($m) { return strcasecmp($this->method(), $m) === 0; }
        public function all($keys = null) { $a = $this->data['all'] ?? []; return $keys ? \Illuminate\Support\Arr::only($a, (array) $keys) : $a; }
        public function input($key = null, $default = null) { return $key === null ? $this->all() : \data_get($this->all(), $key, $default); }
        public function get($key, $default = null) { return $this->input($key, $default); }
        public function query($key = null, $default = null) { $q = $this->data['query'] ?? []; return $key === null ? $q : \data_get($q, $key, $default); }
        public function post($key = null, $default = null) { return $this->input($key, $default); }
        public function has($key) { return \Illuminate\Support\Arr::has($this->all(), $key); }
        public function filled($key) { $v = $this->input($key); return $v !== null && $v !== '' && $v !== []; }
        public function only($keys) { return \Illuminate\Support\Arr::only($this->all(), is_array($keys) ? $keys : func_get_args()); }
        public function except($keys) { return \Illuminate\Support\Arr::except($this->all(), is_array($keys) ? $keys : func_get_args()); }
        public function json($key = null, $default = null) { $j = json_decode($this->getContent(), true) ?? []; return $key === null ? $j : \data_get($j, $key, $default); }
        public function getContent() { return $this->data['body'] ?? ''; }
        public function header($key = null, $default = null) { $h = array_change_key_case($this->data['headers'] ?? [], CASE_LOWER); return $key === null ? $h : ($h[strtolower($key)] ?? $default); }
        public function bearerToken() { $h = $this->header('authorization', ''); return str_starts_with($h, 'Bearer ') ? substr($h, 7) : null; }
        public function ip() { return $this->data['ip'] ?? null; }
        public function url() { return strtok($this->data['url'] ?? '', '?'); }
        public function fullUrl() { return $this->data['url'] ?? ''; }
        public function path() { return ltrim(parse_url($this->data['url'] ?? '', PHP_URL_PATH) ?? '', '/'); }
        public function route($name = null) { $p = $this->data['params'] ?? []; return $name === null ? $p : ($p[$name] ?? null); }
        public function user() { return \Illuminate\Support\Facades\Auth::user(); }
        public function expectsJson() { return str_contains($this->header('accept', ''), 'json'); }
        public function wantsJson() { return $this->expectsJson(); }
        public function __get($k) { return $this->input($k); }
    }

    class Response implements \Stringable {
        public function __construct(public $content = '', public int $status = 200, public array $headers = []) {}
        public function header($k, $v) { $this->headers[$k] = $v; return $this; }
        public function setStatusCode($s) { $this->status = $s; return $this; }
        public function __toString(): string { return (string) $this->content; }
    }
    class JsonResponse extends Response {
        public function __construct($data = [], int $status = 200, array $headers = []) { parent::__construct(json_encode(\Paymenter\Bridge\export($data)), $status, $headers + ['Content-Type' => 'application/json']); }
    }
    class RedirectResponse extends Response {
        public function __construct(string $url, int $status = 302) { parent::__construct('', $status, ['Location' => $url]); }
        public function with(...$a) { return $this; }
    }
}

namespace Symfony\Component\HttpKernel\Exception {
    class HttpException extends \RuntimeException {
        public function __construct(public int $statusCode = 500, string $message = '', public array $headers = []) { parent::__construct($message, $statusCode); }
        public function getStatusCode() { return $this->statusCode; }
    }
    class NotFoundHttpException extends HttpException { public function __construct(string $m = '') { parent::__construct(404, $m); } }
}

namespace Illuminate\Foundation\Http\Middleware { class VerifyCsrfToken {} }

namespace Illuminate\Database\Eloquent {
    /** read-only record received from the panel; relations are loaded lazily through the panel */
    class Model implements \ArrayAccess, \JsonSerializable {
        protected array $attributes = [];
        protected array $relations = [];
        protected array $changes = [];
        protected array $original = [];
        public function hydrate(array $attrs, array $rels = [], array $changes = [], array $original = []) { $this->attributes = $attrs; $this->relations = $rels; $this->changes = $changes; $this->original = $original ?: $attrs; return $this; }
        public function getChanges() { return $this->changes; }
        public function wasChanged($k = null) { return $k === null ? !empty($this->changes) : (bool) array_intersect((array) $k, array_keys($this->changes)); }
        public function getOriginal($k = null, $d = null) { return $k === null ? $this->original : ($this->original[$k] ?? $d); }
        public function getAttribute($k) { return $this->$k; }
        public function getAttributes() { return $this->attributes; }
        public function getKey() { return $this->attributes['id'] ?? null; }
        protected $routeKey = null;
        public function getRouteKey() { return $this->routeKey ?? $this->getKey(); }
        public function setRouteKey($k) { $this->routeKey = $k; return $this; }
        public function toArray() {
            $a = $this->attributes;
            foreach ($this->relations as $k => $r) $a[$k] = $r instanceof self ? $r->toArray() : ($r instanceof \Illuminate\Support\Collection ? $r->toArray() : $r);
            return $a;
        }
        public function jsonSerialize(): mixed { return $this->toArray(); }
        public function __get($k) {
            if (array_key_exists($k, $this->relations)) return $this->relations[$k];
            if (array_key_exists($k, $this->attributes)) return $this->attributes[$k];
            if ($this->getKey() === null || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $k)) return null;
            $r = \Paymenter\Bridge\host('relation', ['model' => class_basename($this), 'id' => $this->getKey(), 'name' => $k]);
            if (!is_array($r) || !array_key_exists('found', $r) || !$r['found']) return $this->relations[$k] = null;
            $v = \Paymenter\Bridge\import($r['value']);
            return $this->relations[$k] = (is_array($v) && !isset($v['__model']) && array_is_list($v) ? new \Illuminate\Support\Collection($v) : $v);
        }
        public function __isset($k) { return $this->__get($k) !== null; }
        public function __set($k, $v) { $this->attributes[$k] = $v; }
        public function offsetExists(mixed $k): bool { return isset($this->$k); }
        public function offsetGet(mixed $k): mixed { return $this->$k; }
        public function offsetSet(mixed $k, mixed $v): void { $this->$k = $v; }
        public function offsetUnset(mixed $k): void { unset($this->attributes[$k]); }
        // minimal read-only query support: Model::find($id), Model::where('col', 'val')->first()
        public static function find($id) { return static::query()->where('id', $id)->first(); }
        public static function query() { return new Builder(class_basename(static::class)); }
        public static function where(...$a) { return static::query()->where(...$a); }
        public static function all() { return static::query()->get(); }
    }
    class Builder {
        private $wheres = [];
        public function __construct(private string $model) {}
        public function where($col, $op = null, $val = null) {
            if (func_num_args() === 2) { $val = $op; $op = '='; }
            if ($op !== '=') throw new \Paymenter\Bridge\Unsupported('Only equality where() clauses are supported on models in the PHP compatibility shim');
            $this->wheres[$col] = $val; return $this;
        }
        public function first() { $r = \Paymenter\Bridge\host('query', ['model' => $this->model, 'wheres' => $this->wheres, 'op' => 'first']); return $r ? \Paymenter\Bridge\import($r) : null; }
        public function firstOrFail() { return $this->first() ?? throw new \Exception('No query results for model [' . $this->model . '].'); }
        public function get() { return new \Illuminate\Support\Collection(array_map('Paymenter\\Bridge\\import', \Paymenter\Bridge\host('query', ['model' => $this->model, 'wheres' => $this->wheres, 'op' => 'get']) ?? [])); }
    }
}

namespace Illuminate\Support\Facades {
    use function Paymenter\Bridge\host;
    use function Paymenter\Bridge\export;

    class Http {
        public static function __callStatic($m, $a) { return (new \Illuminate\Http\Client\PendingRequest)->$m(...$a); }
    }
    class Log {
        public static function __callStatic($level, $a) { host('log', ['level' => $level, 'message' => is_string($a[0] ?? '') ? ($a[0] ?? '') : json_encode(export($a[0])), 'context' => export($a[1] ?? [])]); }
    }
    class Cache {
        public static function get($k, $d = null) { $r = host('cache.get', ['key' => $k]); return $r['hit'] ? $r['value'] : (is_callable($d) ? $d() : $d); }
        public static function has($k) { return host('cache.get', ['key' => $k])['hit']; }
        public static function put($k, $v, $ttl = null) { host('cache.put', ['key' => $k, 'value' => export($v), 'ttl' => $ttl instanceof \DateTimeInterface ? max(1, $ttl->getTimestamp() - time()) : $ttl]); return true; }
        public static function forever($k, $v) { return self::put($k, $v, null); }
        public static function forget($k) { host('cache.forget', ['key' => $k]); return true; }
        public static function remember($k, $ttl, $cb) { $r = host('cache.get', ['key' => $k]); if ($r['hit']) return $r['value']; $v = $cb(); self::put($k, $v, $ttl); return $v; }
        public static function pull($k, $d = null) { $v = self::get($k, $d); self::forget($k); return $v; }
    }
    class Config {
        public static function get($k, $d = null) { return \config($k, $d); }
    }
    class URL {
        public static function to($p = '/') { return \url($p); }
        public static function route($n, $p = [], $abs = true) { return \route($n, $p, $abs); }
    }
    class Auth {
        public static function user() { $r = host('auth', []); return $r ? \Paymenter\Bridge\import($r) : null; }
        public static function id() { return self::user()?->id; }
        public static function check() { return self::user() !== null; }
        public static function guest() { return self::user() === null; }
    }
    class Event {
        public static $listeners = [];
        public static $current = 'unknown';
        public static function listen($event, $listener = null) {
            if ($listener === null) throw new \Paymenter\Bridge\Unsupported('Event::listen() needs an explicit listener');
            foreach ((array) $event as $e) self::$listeners[self::$current][ltrim($e, '\\')][] = $listener;
        }
        public static function dispatch($event, $payload = []) { return host('event.dispatch', ['event' => is_object($event) ? get_class($event) : $event, 'payload' => export(is_object($event) ? get_object_vars($event) : $payload)]); }
    }
    class Route {
        public static $routes = [];
        public static $stack = [];
        public static function __callStatic($m, $a) {
            if (in_array(strtolower($m), ['get', 'post', 'put', 'patch', 'delete', 'any', 'match'])) {
                $methods = strtolower($m) === 'match' ? array_map('strtoupper', (array) array_shift($a)) : (strtolower($m) === 'any' ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] : [strtoupper($m)]);
                return self::add($methods, $a[0], $a[1] ?? null);
            }
            if (in_array($m, ['middleware', 'prefix', 'name', 'group', 'withoutMiddleware', 'where', 'controller', 'domain'])) return (new RouteGroup)->$m(...$a);
            throw new \Paymenter\Bridge\Unsupported("Route::$m() is not supported by the Paymenter PHP compatibility shim");
        }
        public static function has($name) { return host('route.has', ['name' => $name]); }
        public static function add($methods, $path, $action) {
            $ctx = array_merge(['prefix' => '', 'middleware' => [], 'name' => '', 'controller' => null, 'where' => []], self::$stack ? end(self::$stack) : []);
            $r = new RouteDef($methods, '/' . trim($ctx['prefix'] . '/' . trim($path, '/'), '/'), $action, $ctx);
            if (is_string($action) && $ctx['controller']) $r->action = [$ctx['controller'], $action];
            return self::$routes[] = $r;
        }
    }
    class RouteGroup {
        public $ctx = [];
        public function middleware($m) { $this->ctx['middleware'] = array_merge($this->ctx['middleware'] ?? [], (array) $m); return $this; }
        public function withoutMiddleware($m) { return $this; }
        public function prefix($p) { $this->ctx['prefix'] = ($this->ctx['prefix'] ?? '') . '/' . trim($p, '/'); return $this; }
        public function name($n) { $this->ctx['name'] = ($this->ctx['name'] ?? '') . $n; return $this; }
        public function where($w) { $this->ctx['where'] = $w; return $this; }
        public function controller($c) { $this->ctx['controller'] = $c; return $this; }
        public function domain($d) { return $this; }
        public function group($cb) {
            $parent = Route::$stack ? end(Route::$stack) : ['prefix' => '', 'middleware' => [], 'name' => '', 'controller' => null, 'where' => []];
            $ctx = $this->ctx + [];
            Route::$stack[] = ['prefix' => $parent['prefix'] . ($ctx['prefix'] ?? ''), 'middleware' => array_merge($parent['middleware'], $ctx['middleware'] ?? []), 'name' => $parent['name'] . ($ctx['name'] ?? ''), 'controller' => $ctx['controller'] ?? $parent['controller'], 'where' => ($ctx['where'] ?? []) + $parent['where']];
            try { is_string($cb) ? require $cb : $cb(); } finally { array_pop(Route::$stack); }
            return $this;
        }
    }
    class RouteDef {
        public $routeName = null; public $where = []; public $middleware = [];
        public function __construct(public $methods, public $path, public $action, $ctx) { $this->middleware = $ctx['middleware']; $this->where = $ctx['where']; $this->prefixName = $ctx['name']; }
        public $prefixName = '';
        public function name($n) { $this->routeName = $this->prefixName . $n; return $this; }
        public function middleware($m) { $this->middleware = array_merge($this->middleware, (array) $m); return $this; }
        public function withoutMiddleware($m) { return $this; }
        public function where($k, $v = null) { $this->where = is_array($k) ? $k + $this->where : [$k => $v] + $this->where; return $this; }
    }
    class View {
        public static function addNamespace($ns, $path) {}
        public static function make($n, $d = []) { return \view($n, $d); }
    }
    class Storage {
        public static function __callStatic($m, $a) { throw new \Paymenter\Bridge\Unsupported('Storage is not available in the Paymenter PHP compatibility shim'); }
    }
    class Schema {
        public static function __callStatic($m, $a) { throw new \Paymenter\Bridge\Unsupported('PHP migrations (Schema::) cannot run; ship raw .sql files in database/migrations/ instead'); }
    }
    class Notification {
        public static function make($t = null) { return new class { public function __call($m, $a) { return $this; } }; }
    }
}

namespace {
    use function Paymenter\Bridge\host;
    use Illuminate\Support\Collection;

    function class_basename($c) { $c = is_object($c) ? get_class($c) : $c; return basename(str_replace('\\', '/', $c)); }
    function collect($v = []) { return new Collection($v); }
    function now($tz = null) { return \Illuminate\Support\Carbon::now($tz); }
    function today() { return \Illuminate\Support\Carbon::today(); }
    function data_get($target, $key, $default = null) {
        if ($key === null) return $target;
        foreach (is_array($key) ? $key : explode('.', (string) $key) as $seg) {
            if ($target instanceof Collection) $target = $target->all();
            if (is_array($target) && array_key_exists($seg, $target)) $target = $target[$seg];
            elseif (is_object($target) && (isset($target->$seg) || property_exists($target, $seg))) $target = $target->$seg;
            else return $default instanceof Closure ? $default() : $default;
        }
        return $target;
    }
    function value($v, ...$a) { return $v instanceof Closure ? $v(...$a) : $v; }
    function tap($v, $cb = null) { if ($cb) $cb($v); return $v; }
    function optional($v = null) { return $v ?? new class { public function __get($k) { return null; } public function __call($m, $a) { return null; } }; }
    function blank($v) { return $v === null || (is_string($v) && trim($v) === '') || (is_countable($v) && count($v) === 0); }
    function filled($v) { return !blank($v); }
    function report($e) { host('log', ['level' => 'error', 'message' => $e->getMessage(), 'context' => []]); }
    function rescue(callable $cb, $rescue = null, $report = true) { try { return $cb(); } catch (\Throwable $e) { if ($report) report($e); return value($rescue, $e); } }
    function config($key = null, $default = null) { $r = host('config', ['key' => $key]); return $r === null ? $default : $r; }
    function settings($key = null, $default = null) { $r = host('setting', ['key' => $key]); return $r === null ? $default : $r; }
    function setting($key, $default = null) { return settings($key, $default); }
    function route($name, $params = [], $absolute = true) {
        $p = \Paymenter\Bridge\export($params instanceof \Illuminate\Database\Eloquent\Model ? $params->getRouteKey() : (is_array($params) ? array_map(fn ($x) => $x instanceof \Illuminate\Database\Eloquent\Model ? $x->getRouteKey() : $x, $params) : $params));
        return host('route', ['name' => $name, 'params' => $p, 'absolute' => $absolute]);
    }
    function url($path = '/') { return host('url', ['path' => $path]); }
    function __($key = null, $replace = [], $locale = null) { $r = host('trans', ['key' => $key, 'replace' => $replace]); return $r ?? $key; }
    function trans($key = null, $replace = []) { return __($key, $replace); }
    function abort($code, $message = '', $headers = []) { throw new \Symfony\Component\HttpKernel\Exception\HttpException($code, $message, $headers); }
    function abort_if($c, $code, $m = '') { if ($c) abort($code, $m); }
    function abort_unless($c, $code, $m = '') { if (!$c) abort($code, $m); }
    function view($name = null, $data = []) { return new \Illuminate\View\View((string) $name, (array) $data); }
    function request($key = null, $default = null) { $r = \PaymenterBridge::$request ?? new \Illuminate\Http\Request([]); return $key === null ? $r : $r->input($key, $default); }
    function redirect($to = null, $status = 302) { return new \Illuminate\Http\RedirectResponse((string) $to, $status); }
    function response($content = '', $status = 200, $headers = []) {
        return new class($content, $status, $headers) extends \Illuminate\Http\Response {
            public function json($data = [], $status = 200, $headers = []) { return new \Illuminate\Http\JsonResponse($data, $status, $headers); }
            public function noContent($status = 204) { return new \Illuminate\Http\Response('', $status); }
            public function make($c = '', $s = 200, $h = []) { return new \Illuminate\Http\Response($c, $s, $h); }
        };
    }
    function logger($m = null, $c = []) { if ($m !== null) host('log', ['level' => 'debug', 'message' => $m, 'context' => $c]); }
    function cache($key = null, $default = null) { return $key === null ? new \Illuminate\Support\Facades\Cache : \Illuminate\Support\Facades\Cache::get($key, $default); }
    function str($s = null) { return $s; }
    function e($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }

    // Facade aliases Laravel provides globally (`\Str::random()`, `\Http::get()` ...)
    foreach (['Http', 'Log', 'Cache', 'Config', 'URL', 'Auth', 'Event', 'Route', 'View', 'Storage', 'Schema', 'Notification'] as $f) class_alias('Illuminate\\Support\\Facades\\' . $f, $f);
    class_alias(\Illuminate\Support\Str::class, 'Str');
    class_alias(\Illuminate\Support\Arr::class, 'Arr');
    class_alias(\Illuminate\Support\Carbon::class, 'Carbon');
}
