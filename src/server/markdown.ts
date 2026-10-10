import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

/**
 * `Str::markdown()`: CommonMark + GitHub Flavored Markdown (tables, strikethrough,
 * autolinks, task lists). Options mirror league/commonmark's `html_input` and
 * `allow_unsafe_links`.
 */
export interface MarkdownOptions {
    html_input?: 'allow' | 'escape' | 'strip';
    allow_unsafe_links?: boolean;
}

type MD = InstanceType<typeof MarkdownIt>;
const cache = new Map<string, MD>();

function engine(opts: MarkdownOptions): MD {
    const key = `${opts.html_input ?? 'allow'}|${opts.allow_unsafe_links ?? true}`;
    let md = cache.get(key);
    if (md) return md;
    md = new MarkdownIt({
        html: (opts.html_input ?? 'allow') === 'allow',
        linkify: true,
        breaks: false,
        typographer: false,
    });
    md.use(taskLists, { enabled: false });
    if (opts.html_input === 'strip') {
        // drop raw HTML entirely
        md.renderer.rules.html_block = () => '';
        md.renderer.rules.html_inline = () => '';
        md.set({ html: true });
    }
    if (opts.allow_unsafe_links === false) {
        const validate = md.validateLink;
        md.validateLink = (url: string) => validate(url) && !/^\s*(javascript|vbscript|data):/i.test(url);
    }
    cache.set(key, md);
    return md;
}

export function markdown(text: string, options: MarkdownOptions = {}): string {
    return engine(options).render(text ?? '');
}
