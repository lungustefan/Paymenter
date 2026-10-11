/**
 * A small PHP expression parser + async evaluator - enough for the Blade
 * templates stored in the database (notification/email templates, mail
 * header/footer): variables, property/method access, arrays, string
 * interpolation, operators, ternaries, arrow functions and calls to an
 * allow-listed set of helpers.
 */

type Tok =
    | { t: 'num'; v: number }
    | { t: 'str'; v: string; interp: boolean }
    | { t: 'var'; v: string }
    | { t: 'id'; v: string }
    | { t: 'op'; v: string }
    | { t: 'eof' };

const OPS = [
    '===', '!==', '<=>', '**=', '...', '?->', '??=',
    '==', '!=', '<>', '<=', '>=', '&&', '||', '??', '?:', '->', '=>', '::', '++', '--', '+=', '-=', '.=', '*=', '/=',
    '+', '-', '*', '/', '%', '.', '<', '>', '=', '!', '?', ':', '(', ')', '[', ']', ',', '{', '}', '&', '|', '^', '~', ';', '@',
];

function tokenize(src: string): Tok[] {
    const toks: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c === '$' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
            let j = i + 1;
            while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
            toks.push({ t: 'var', v: src.slice(i + 1, j) });
            i = j;
            continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
            const m = /^(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(src.slice(i))!;
            toks.push({ t: 'num', v: Number(m[0]) });
            i += m[0].length;
            continue;
        }
        if (c === "'" || c === '"') {
            let j = i + 1;
            let out = '';
            while (j < src.length && src[j] !== c) {
                if (src[j] === '\\') {
                    const n = src[j + 1];
                    if (c === "'") {
                        if (n === "'" || n === '\\') {
                            out += n;
                            j += 2;
                        } else {
                            out += '\\';
                            j++;
                        }
                    } else {
                        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', $: '\u0000$' };
                        if (n in map) {
                            out += map[n];
                            j += 2;
                        } else {
                            out += '\\';
                            j++;
                        }
                    }
                } else {
                    out += src[j++];
                }
            }
            toks.push({ t: 'str', v: out, interp: c === '"' });
            i = j + 1;
            continue;
        }
        if (/[A-Za-z_\\]/.test(c)) {
            let j = i;
            while (j < src.length && /[A-Za-z0-9_\\]/.test(src[j])) j++;
            toks.push({ t: 'id', v: src.slice(i, j) });
            i = j;
            continue;
        }
        const op = OPS.find((o) => src.startsWith(o, i));
        if (!op) throw new Error(`Unexpected character "${c}" in expression: ${src}`);
        toks.push({ t: 'op', v: op });
        i += op.length;
    }
    toks.push({ t: 'eof' });
    return toks;
}

export type Node =
    | { k: 'lit'; v: any }
    | { k: 'interp'; parts: (string | Node)[] }
    | { k: 'var'; name: string }
    | { k: 'array'; items: { key?: Node; value: Node; spread?: boolean }[] }
    | { k: 'prop'; obj: Node; name: string | Node; nullsafe: boolean }
    | { k: 'index'; obj: Node; index: Node | null }
    | { k: 'call'; callee: Node; args: Node[] }
    | { k: 'fn'; name: string; args: Node[] }
    | { k: 'method'; obj: Node; name: string; args: Node[]; nullsafe: boolean }
    | { k: 'static'; cls: string; name: string; args: Node[] | null }
    | { k: 'const'; name: string }
    | { k: 'unary'; op: string; arg: Node }
    | { k: 'bin'; op: string; l: Node; r: Node }
    | { k: 'tern'; cond: Node; yes: Node | null; no: Node }
    | { k: 'assign'; target: Node; op: string; value: Node }
    | { k: 'arrow'; params: string[]; body: Node }
    | { k: 'cast'; type: string; arg: Node }
    | { k: 'isset'; args: Node[] }
    | { k: 'empty'; arg: Node }
    | { k: 'instanceof'; l: Node; cls: string }
    | { k: 'new'; cls: string; args: Node[] };

const PREC: Record<string, number> = {
    '||': 3, '&&': 4,
    '==': 8, '!=': 8, '===': 8, '!==': 8, '<>': 8, '<=>': 8,
    '<': 9, '<=': 9, '>': 9, '>=': 9,
    '.': 10, '+': 11, '-': 11, '*': 12, '/': 12, '%': 12, '**': 13,
};

class Parser {
    private p = 0;
    constructor(private toks: Tok[]) {}

    private get cur() {
        return this.toks[this.p];
    }
    private next() {
        return this.toks[this.p++];
    }
    private isOp(v: string) {
        return this.cur.t === 'op' && this.cur.v === v;
    }
    private isId(v: string) {
        return this.cur.t === 'id' && this.cur.v.toLowerCase() === v;
    }
    private expectOp(v: string) {
        if (!this.isOp(v)) throw new Error(`Expected "${v}"`);
        this.p++;
    }
    done() {
        return this.cur.t === 'eof';
    }

    parseExpression(): Node {
        return this.parseAssign();
    }

    private parseAssign(): Node {
        const left = this.parseTernary();
        if (this.cur.t === 'op' && ['=', '+=', '-=', '.=', '*=', '/=', '??='].includes(this.cur.v)) {
            const op = (this.next() as any).v;
            return { k: 'assign', target: left, op, value: this.parseAssign() };
        }
        return left;
    }

    private parseTernary(): Node {
        let cond = this.parseCoalesce();
        while (this.isOp('?') || this.isOp('?:')) {
            if (this.isOp('?:')) {
                this.p++;
                cond = { k: 'tern', cond, yes: null, no: this.parseCoalesce() };
                continue;
            }
            this.p++;
            if (this.isOp(':')) {
                this.p++;
                cond = { k: 'tern', cond, yes: null, no: this.parseCoalesce() };
            } else {
                const yes = this.parseAssign();
                this.expectOp(':');
                cond = { k: 'tern', cond, yes, no: this.parseAssign() };
            }
        }
        return cond;
    }

    private parseCoalesce(): Node {
        const left = this.parseBinary(0);
        if (this.isOp('??')) {
            this.p++;
            return { k: 'bin', op: '??', l: left, r: this.parseCoalesce() };
        }
        return left;
    }

    private parseBinary(min: number): Node {
        let left = this.parseUnary();
        for (;;) {
            let op: string | null = null;
            if (this.cur.t === 'op' && PREC[this.cur.v] !== undefined) op = this.cur.v;
            else if (this.cur.t === 'id' && ['and', 'or', 'xor'].includes(this.cur.v.toLowerCase())) op = this.cur.v.toLowerCase() === 'and' ? '&&' : '||';
            else if (this.isId('instanceof')) {
                this.p++;
                const cls = (this.next() as any).v as string;
                left = { k: 'instanceof', l: left, cls };
                continue;
            }
            if (!op || PREC[op] < min) break;
            this.p++;
            const right = this.parseBinary(PREC[op] + 1);
            left = { k: 'bin', op, l: left, r: right };
        }
        return left;
    }

    private parseUnary(): Node {
        if (this.isOp('!')) {
            this.p++;
            return { k: 'unary', op: '!', arg: this.parseUnary() };
        }
        if (this.isOp('-') || this.isOp('+')) {
            const op = (this.next() as any).v;
            return { k: 'unary', op, arg: this.parseUnary() };
        }
        if (this.isOp('@')) {
            this.p++;
            return this.parseUnary();
        }
        // cast: (int) $x
        if (this.isOp('(') && this.toks[this.p + 1]?.t === 'id' && this.toks[this.p + 2]?.t === 'op' && (this.toks[this.p + 2] as any).v === ')') {
            const t = (this.toks[this.p + 1] as any).v.toLowerCase();
            if (['int', 'integer', 'float', 'double', 'string', 'bool', 'boolean', 'array', 'object'].includes(t)) {
                this.p += 3;
                return { k: 'cast', type: t, arg: this.parseUnary() };
            }
        }
        return this.parsePostfix(this.parsePrimary());
    }

    private parseArgs(): Node[] {
        const args: Node[] = [];
        this.expectOp('(');
        while (!this.isOp(')')) {
            // named arguments `name: value` -> treated positionally
            if (this.cur.t === 'id' && this.toks[this.p + 1]?.t === 'op' && (this.toks[this.p + 1] as any).v === ':' && !(this.toks[this.p + 2]?.t === 'op' && (this.toks[this.p + 2] as any).v === ':')) {
                this.p += 2;
            }
            if (this.isOp('...')) this.p++;
            args.push(this.parseExpression());
            if (this.isOp(',')) this.p++;
        }
        this.expectOp(')');
        return args;
    }

    private parsePostfix(node: Node): Node {
        for (;;) {
            if (this.isOp('->') || this.isOp('?->')) {
                const nullsafe = (this.next() as any).v === '?->';
                let name: string | Node;
                if (this.cur.t === 'id') name = (this.next() as any).v;
                else if (this.cur.t === 'var') name = { k: 'var', name: (this.next() as any).v };
                else if (this.isOp('{')) {
                    this.p++;
                    name = this.parseExpression();
                    this.expectOp('}');
                } else throw new Error('Bad property access');
                if (this.isOp('(') && typeof name === 'string') {
                    node = { k: 'method', obj: node, name, args: this.parseArgs(), nullsafe };
                } else node = { k: 'prop', obj: node, name, nullsafe };
                continue;
            }
            if (this.isOp('[')) {
                this.p++;
                if (this.isOp(']')) {
                    this.p++;
                    node = { k: 'index', obj: node, index: null };
                } else {
                    const idx = this.parseExpression();
                    this.expectOp(']');
                    node = { k: 'index', obj: node, index: idx };
                }
                continue;
            }
            if (this.isOp('(') && (node.k === 'var' || node.k === 'call' || node.k === 'index' || node.k === 'prop')) {
                node = { k: 'call', callee: node, args: this.parseArgs() };
                continue;
            }
            if (this.isOp('++') || this.isOp('--')) {
                const op = (this.next() as any).v === '++' ? '+=' : '-=';
                node = { k: 'assign', target: node, op, value: { k: 'lit', v: 1 } };
                continue;
            }
            return node;
        }
    }

    private parseArray(close: string): Node {
        const items: { key?: Node; value: Node; spread?: boolean }[] = [];
        while (!this.isOp(close)) {
            if (this.isOp('...')) {
                this.p++;
                items.push({ value: this.parseExpression(), spread: true });
            } else {
                const first = this.parseExpression();
                if (this.isOp('=>')) {
                    this.p++;
                    items.push({ key: first, value: this.parseExpression() });
                } else items.push({ value: first });
            }
            if (this.isOp(',')) this.p++;
        }
        this.expectOp(close);
        return { k: 'array', items };
    }

    private parsePrimary(): Node {
        const t = this.cur;
        if (t.t === 'num') {
            this.p++;
            return { k: 'lit', v: t.v };
        }
        if (t.t === 'str') {
            this.p++;
            return t.interp ? parseInterpolation(t.v) : { k: 'lit', v: t.v };
        }
        if (t.t === 'var') {
            this.p++;
            return { k: 'var', name: t.v };
        }
        if (t.t === 'op') {
            if (t.v === '(') {
                this.p++;
                const e = this.parseExpression();
                this.expectOp(')');
                return e;
            }
            if (t.v === '[') {
                this.p++;
                return this.parseArray(']');
            }
        }
        if (t.t === 'id') {
            const lower = t.v.toLowerCase();
            this.p++;
            if (lower === 'true') return { k: 'lit', v: true };
            if (lower === 'false') return { k: 'lit', v: false };
            if (lower === 'null') return { k: 'lit', v: null };
            if (lower === 'array' && this.isOp('(')) {
                this.p++;
                return this.parseArray(')');
            }
            if (lower === 'isset') {
                return { k: 'isset', args: this.parseArgs() };
            }
            if (lower === 'empty') {
                return { k: 'empty', arg: this.parseArgs()[0] };
            }
            if (lower === 'new') {
                const cls = (this.next() as any).v as string;
                return { k: 'new', cls, args: this.isOp('(') ? this.parseArgs() : [] };
            }
            if (lower === 'fn' || lower === 'function') {
                this.expectOp('(');
                const params: string[] = [];
                while (!this.isOp(')')) {
                    if (this.cur.t === 'id') this.p++; // type hint
                    const v = this.next();
                    if (v.t === 'var') params.push(v.v);
                    if (this.isOp(',')) this.p++;
                }
                this.expectOp(')');
                this.expectOp('=>');
                return { k: 'arrow', params, body: this.parseExpression() };
            }
            // Class::member
            if (this.isOp('::')) {
                this.p++;
                const m = this.next();
                if (m.t === 'id') {
                    if (this.isOp('(')) return { k: 'static', cls: t.v, name: m.v, args: this.parseArgs() };
                    return { k: 'static', cls: t.v, name: m.v, args: null };
                }
                if (m.t === 'var') return { k: 'static', cls: t.v, name: m.v, args: null };
                throw new Error('Bad static access');
            }
            if (this.isOp('(')) return { k: 'fn', name: t.v, args: this.parseArgs() };
            return { k: 'const', name: t.v };
        }
        throw new Error(`Unexpected token ${JSON.stringify(t)}`);
    }
}

/** "Hello $name, {$user->name}" */
function parseInterpolation(s: string): Node {
    const parts: (string | Node)[] = [];
    let buf = '';
    let i = 0;
    while (i < s.length) {
        if (s[i] === '\u0000' && s[i + 1] === '$') {
            buf += '$';
            i += 2;
            continue;
        }
        if (s[i] === '{' && s[i + 1] === '$') {
            let depth = 1;
            let j = i + 1;
            while (j < s.length && depth > 0) {
                if (s[j] === '{') depth++;
                else if (s[j] === '}') depth--;
                j++;
            }
            if (buf) parts.push(buf), (buf = '');
            parts.push(parseExpression(s.slice(i + 1, j - 1)));
            i = j;
            continue;
        }
        if (s[i] === '$' && /[A-Za-z_]/.test(s[i + 1] ?? '')) {
            let j = i + 1;
            while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
            let node: Node = { k: 'var', name: s.slice(i + 1, j) };
            // simple syntax: $a->b and $a[key]
            const arrow = /^->([A-Za-z_][A-Za-z0-9_]*)/.exec(s.slice(j));
            if (arrow) {
                node = { k: 'prop', obj: node, name: arrow[1], nullsafe: false };
                j += arrow[0].length;
            }
            if (buf) parts.push(buf), (buf = '');
            parts.push(node);
            i = j;
            continue;
        }
        buf += s[i++];
    }
    if (buf) parts.push(buf);
    return { k: 'interp', parts };
}

const exprCache = new Map<string, Node>();

export function parseExpression(src: string): Node {
    const key = src;
    const hit = exprCache.get(key);
    if (hit) return hit;
    const p = new Parser(tokenize(src));
    const node = p.parseExpression();
    // allow trailing `;`
    if (!p.done()) {
        // tolerate a trailing semicolon only
    }
    exprCache.set(key, node);
    return node;
}

/** Parse a statement list (`@php ... @endphp`): `a = 1; b = 2;` */
export function parseStatements(src: string): Node[] {
    const out: Node[] = [];
    const parts = splitTopLevel(src, ';');
    for (const part of parts) if (part.trim()) out.push(parseExpression(part.trim()));
    return out;
}

export function splitTopLevel(src: string, sep: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let cur = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            cur += c;
            if (c === '\\') cur += src[++i] ?? '';
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            quote = c;
            cur += c;
            continue;
        }
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) depth--;
        if (c === sep && depth === 0) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += c;
    }
    out.push(cur);
    return out;
}
