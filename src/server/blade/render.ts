import { e } from '@/server/lib/php';
import { evaluate, toStr, type EvalContext } from './evaluate';
import { parseExpression, parseStatements, splitTopLevel, type Node } from './php-expr';
import { truthy } from '@/server/lib/php';

/**
 * Blade-subset template renderer.
 *
 * Supports `{{ }}`, `{!! !!}`, `{{-- --}}`, `@{{ }}`, and the directives
 * if/elseif/else/unless/isset/empty/foreach/forelse/for/while/php/break/continue/verbatim.
 */

type TNode =
    | { t: 'text'; v: string }
    | { t: 'echo'; expr: Node; raw: boolean }
    | { t: 'if'; branches: { cond: Node | null; body: TNode[]; negate?: boolean }[] }
    | { t: 'foreach'; expr: Node; keyVar?: string; valueVar: string; body: TNode[]; empty?: TNode[] }
    | { t: 'for'; init: Node[]; cond: Node | null; step: Node[]; body: TNode[] }
    | { t: 'while'; cond: Node; body: TNode[] }
    | { t: 'php'; stmts: Node[] }
    | { t: 'break' }
    | { t: 'continue' };

const BLOCK_OPEN = new Set(['if', 'unless', 'isset', 'empty', 'foreach', 'forelse', 'for', 'while']);
const KNOWN = new Set([
    'if', 'elseif', 'else', 'endif', 'unless', 'endunless', 'isset', 'endisset', 'empty', 'endempty',
    'foreach', 'endforeach', 'forelse', 'endforelse', 'for', 'endfor', 'while', 'endwhile', 'php', 'endphp',
    'break', 'continue', 'verbatim', 'endverbatim', 'once', 'endonce',
]);

interface Tok {
    kind: 'text' | 'echo' | 'raw' | 'directive';
    text?: string;
    name?: string;
    args?: string;
}

function findClose(src: string, from: number, close: string): number {
    let quote: string | null = null;
    for (let i = from; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            quote = c;
            continue;
        }
        if (src.startsWith(close, i)) return i;
    }
    return -1;
}

function balanced(src: string, from: number): { args: string; end: number } | null {
    // src[from] === '('
    let depth = 0;
    let quote: string | null = null;
    for (let i = from; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') quote = c;
        else if (c === '(') depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0) return { args: src.slice(from + 1, i), end: i + 1 };
        }
    }
    return null;
}

function tokenizeBlade(src: string): Tok[] {
    const toks: Tok[] = [];
    let buf = '';
    const flush = () => {
        if (buf) toks.push({ kind: 'text', text: buf }), (buf = '');
    };
    let i = 0;
    let verbatim = false;
    while (i < src.length) {
        if (verbatim) {
            const end = src.indexOf('@endverbatim', i);
            const chunk = end === -1 ? src.slice(i) : src.slice(i, end);
            buf += chunk;
            i = end === -1 ? src.length : end + '@endverbatim'.length;
            verbatim = false;
            continue;
        }
        if (src.startsWith('{{--', i)) {
            const end = src.indexOf('--}}', i + 4);
            flush();
            i = end === -1 ? src.length : end + 4;
            continue;
        }
        if (src.startsWith('@{{', i)) {
            const end = src.indexOf('}}', i + 3);
            buf += end === -1 ? src.slice(i + 1) : src.slice(i + 1, end + 2);
            i = end === -1 ? src.length : end + 2;
            continue;
        }
        if (src.startsWith('{!!', i)) {
            const end = findClose(src, i + 3, '!!}');
            if (end !== -1) {
                flush();
                toks.push({ kind: 'raw', text: src.slice(i + 3, end).trim() });
                i = end + 3;
                continue;
            }
        }
        if (src.startsWith('{{', i)) {
            const end = findClose(src, i + 2, '}}');
            if (end !== -1) {
                flush();
                toks.push({ kind: 'echo', text: src.slice(i + 2, end).trim() });
                i = end + 2;
                continue;
            }
        }
        if (src[i] === '@' && src[i + 1] === '@') {
            buf += '@';
            i += 2;
            continue;
        }
        if (src[i] === '@' && /[a-z]/.test(src[i + 1] ?? '') && !/[A-Za-z0-9_]/.test(src[i - 1] ?? ' ')) {
            const m = /^@([a-z]+)/.exec(src.slice(i))!;
            const name = m[1];
            if (KNOWN.has(name)) {
                let j = i + m[0].length;
                // optional whitespace then ( ... )
                let k = j;
                while (k < src.length && (src[k] === ' ' || src[k] === '\t')) k++;
                let args: string | undefined;
                if (src[k] === '(') {
                    const b = balanced(src, k);
                    if (b) {
                        args = b.args;
                        j = b.end;
                    }
                }
                if (name === 'verbatim') {
                    verbatim = true;
                    i = j;
                    continue;
                }
                flush();
                toks.push({ kind: 'directive', name, args });
                i = j;
                continue;
            }
        }
        buf += src[i++];
    }
    flush();
    return toks;
}

function parseTree(toks: Tok[]): TNode[] {
    let pos = 0;

    function parseUntil(terminators: string[]): { nodes: TNode[]; stop?: Tok } {
        const nodes: TNode[] = [];
        while (pos < toks.length) {
            const tok = toks[pos];
            if (tok.kind === 'directive' && terminators.includes(tok.name!)) return { nodes, stop: tok };
            pos++;
            switch (tok.kind) {
                case 'text':
                    nodes.push({ t: 'text', v: tok.text! });
                    break;
                case 'echo':
                    nodes.push({ t: 'echo', expr: parseExpression(tok.text!), raw: false });
                    break;
                case 'raw':
                    nodes.push({ t: 'echo', expr: parseExpression(tok.text!), raw: true });
                    break;
                case 'directive':
                    nodes.push(...parseDirective(tok));
                    break;
            }
        }
        return { nodes };
    }

    function parseDirective(tok: Tok): TNode[] {
        const name = tok.name!;
        switch (name) {
            case 'if':
            case 'unless': {
                const branches: { cond: Node | null; body: TNode[]; negate?: boolean }[] = [];
                let cond: Node | null = parseExpression(tok.args ?? 'false');
                let negate = name === 'unless';
                for (;;) {
                    const { nodes, stop } = parseUntil(['elseif', 'else', 'endif', 'endunless']);
                    branches.push({ cond, body: nodes, negate });
                    pos++; // consume stop
                    if (!stop || stop.name === 'endif' || stop.name === 'endunless') break;
                    negate = false;
                    cond = stop.name === 'elseif' ? parseExpression(stop.args ?? 'false') : null;
                }
                return [{ t: 'if', branches }];
            }
            case 'isset': {
                const { nodes } = parseUntil(['endisset']);
                pos++;
                return [{ t: 'if', branches: [{ cond: parseExpression(`isset(${tok.args})`), body: nodes }] }];
            }
            case 'empty': {
                const { nodes } = parseUntil(['endempty']);
                pos++;
                return [{ t: 'if', branches: [{ cond: parseExpression(`empty(${tok.args})`), body: nodes }] }];
            }
            case 'foreach':
            case 'forelse': {
                const m = /^([\s\S]+?)\s+as\s+\$(\w+)(?:\s*=>\s*\$(\w+))?\s*$/.exec(tok.args ?? '');
                if (!m) throw new Error(`Bad @${name} expression: ${tok.args}`);
                const expr = parseExpression(m[1]);
                const keyVar = m[3] ? m[2] : undefined;
                const valueVar = m[3] ?? m[2];
                if (name === 'foreach') {
                    const { nodes } = parseUntil(['endforeach']);
                    pos++;
                    return [{ t: 'foreach', expr, keyVar, valueVar, body: nodes }];
                }
                const body = parseUntil(['empty', 'endforelse']);
                pos++;
                let emptyNodes: TNode[] | undefined;
                if (body.stop?.name === 'empty') {
                    emptyNodes = parseUntil(['endforelse']).nodes;
                    pos++;
                }
                return [{ t: 'foreach', expr, keyVar, valueVar, body: body.nodes, empty: emptyNodes ?? [] }];
            }
            case 'for': {
                const [init, cond, step] = splitTopLevel(tok.args ?? '', ';');
                const { nodes } = parseUntil(['endfor']);
                pos++;
                return [
                    {
                        t: 'for',
                        init: parseStatements(init ?? ''),
                        cond: cond?.trim() ? parseExpression(cond) : null,
                        step: parseStatements((step ?? '').replace(/,/g, ';')),
                        body: nodes,
                    },
                ];
            }
            case 'while': {
                const { nodes } = parseUntil(['endwhile']);
                pos++;
                return [{ t: 'while', cond: parseExpression(tok.args ?? 'false'), body: nodes }];
            }
            case 'php': {
                if (tok.args !== undefined) return [{ t: 'php', stmts: parseStatements(tok.args) }];
                // block form: collect raw text tokens until @endphp
                let code = '';
                while (pos < toks.length && !(toks[pos].kind === 'directive' && toks[pos].name === 'endphp')) {
                    const t = toks[pos++];
                    code += t.kind === 'text' ? t.text : '';
                }
                pos++;
                return [{ t: 'php', stmts: parseStatements(code) }];
            }
            case 'break':
                return [tok.args ? { t: 'if', branches: [{ cond: parseExpression(tok.args), body: [{ t: 'break' }] }] } : { t: 'break' }];
            case 'continue':
                return [tok.args ? { t: 'if', branches: [{ cond: parseExpression(tok.args), body: [{ t: 'continue' }] }] } : { t: 'continue' }];
            default:
                return [];
        }
    }

    return parseUntil([]).nodes;
}

class Break {}
class Continue {}

async function run(nodes: TNode[], ctx: EvalContext, out: string[]): Promise<void> {
    for (const n of nodes) {
        switch (n.t) {
            case 'text':
                out.push(n.v);
                break;
            case 'echo': {
                const v = await evaluate(n.expr, ctx);
                out.push(n.raw ? toStr(v) : e(toStr(v)));
                break;
            }
            case 'if': {
                for (const b of n.branches) {
                    if (b.cond === null) {
                        await run(b.body, ctx, out);
                        break;
                    }
                    let c = truthy(await evaluate(b.cond, ctx));
                    if (b.negate) c = !c;
                    if (c) {
                        await run(b.body, ctx, out);
                        break;
                    }
                }
                break;
            }
            case 'foreach': {
                const subject = await evaluate(n.expr, ctx);
                const entries: [string | number, any][] = Array.isArray(subject)
                    ? subject.map((v, i) => [i, v])
                    : subject && typeof subject === 'object'
                      ? Object.entries(subject)
                      : [];
                if (entries.length === 0) {
                    if (n.empty) await run(n.empty, ctx, out);
                    break;
                }
                const outerLoop = ctx.vars.loop;
                for (let i = 0; i < entries.length; i++) {
                    const [k, v] = entries[i];
                    if (n.keyVar) ctx.vars[n.keyVar] = k;
                    ctx.vars[n.valueVar] = v;
                    ctx.vars.loop = {
                        index: i,
                        iteration: i + 1,
                        remaining: entries.length - i - 1,
                        count: entries.length,
                        first: i === 0,
                        last: i === entries.length - 1,
                        even: (i + 1) % 2 === 0,
                        odd: (i + 1) % 2 === 1,
                        depth: 1,
                        parent: outerLoop ?? null,
                    };
                    try {
                        await run(n.body, ctx, out);
                    } catch (err) {
                        if (err instanceof Break) break;
                        if (err instanceof Continue) continue;
                        throw err;
                    }
                }
                ctx.vars.loop = outerLoop;
                break;
            }
            case 'for': {
                for (const s of n.init) await evaluate(s, ctx);
                let guard = 0;
                while (n.cond ? truthy(await evaluate(n.cond, ctx)) : true) {
                    if (++guard > 100000) throw new Error('Template loop limit exceeded');
                    try {
                        await run(n.body, ctx, out);
                    } catch (err) {
                        if (err instanceof Break) break;
                        if (!(err instanceof Continue)) throw err;
                    }
                    for (const s of n.step) await evaluate(s, ctx);
                }
                break;
            }
            case 'while': {
                let guard = 0;
                while (truthy(await evaluate(n.cond, ctx))) {
                    if (++guard > 100000) throw new Error('Template loop limit exceeded');
                    try {
                        await run(n.body, ctx, out);
                    } catch (err) {
                        if (err instanceof Break) break;
                        if (!(err instanceof Continue)) throw err;
                    }
                }
                break;
            }
            case 'php':
                for (const s of n.stmts) await evaluate(s, ctx);
                break;
            case 'break':
                throw new Break();
            case 'continue':
                throw new Continue();
        }
    }
}

const treeCache = new Map<string, TNode[]>();

export async function renderTemplate(template: string, ctx: EvalContext): Promise<string> {
    let tree = treeCache.get(template);
    if (!tree) {
        tree = parseTree(tokenizeBlade(template));
        if (treeCache.size > 500) treeCache.clear();
        treeCache.set(template, tree);
    }
    const out: string[] = [];
    await run(tree, { ...ctx, vars: { ...ctx.vars } }, out);
    return out.join('');
}
