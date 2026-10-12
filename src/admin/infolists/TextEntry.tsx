import type { ReactNode } from 'react';
import { Entry } from './Entry';
import type { RenderContext } from '../forms/Component';
import type { EvalContext, Fn } from '../core/evaluate';
import { Icon } from '../ui/Icon';
import { colorClass, type FilamentColorName } from '../ui/colors';
import { Carbon } from '@/server/lib/carbon';
import { cn } from '@themes/default/components/cn';
import { adminContext, transChoice } from '../context';
import { markdown } from '@/server/markdown';
import { formatNumber, isBlank, limit as strLimit, phpString, words as strWords } from '../tables/columns/TextColumn';
import { CopyableText } from '../tables/client';

type TextSize = 'xs' | 'sm' | 'md' | 'lg' | string;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Filament\Infolists\Components\TextEntry */
export class TextEntry extends Entry {
    protected _badge: Fn<boolean> = false;
    protected _color?: Fn<FilamentColorName | string | null>;
    protected _icon?: Fn<string | null>;
    protected _iconColor?: Fn<FilamentColorName | null>;
    protected _iconPosition: 'before' | 'after' = 'before';
    protected _size?: Fn<TextSize | null>;
    protected _weight?: Fn<string | null>;
    protected _fontFamily?: Fn<string | null>;
    protected _wrap: Fn<boolean> = true;
    protected _lineClamp?: number;
    protected _bulleted = false;
    protected _listWithLineBreaks = false;
    protected _listLimit?: number | null;
    protected _prose = false;
    protected _markdown = false;
    protected _html = false;
    protected _copyable: Fn<boolean> = false;
    protected _copyMessage?: string;
    protected _copyMessageDuration = 2000;
    protected _formatStateUsing?: (ctx: EvalContext) => any;
    protected _characterLimit?: number;
    protected _characterLimitEnd?: string;
    protected _wordLimit?: number;
    protected _wordLimitEnd?: string;
    protected _prefix?: Fn<string | null>;
    protected _suffix?: Fn<string | null>;

    badge(v: Fn<boolean> = true) { this._badge = v; return this; }
    color(v: Fn<FilamentColorName | string | null>) { this._color = v; return this; }
    icon(v: Fn<string | null>, position?: 'before' | 'after') { this._icon = v; if (position) this._iconPosition = position; return this; }
    iconColor(v: Fn<FilamentColorName | null>) { this._iconColor = v; return this; }
    iconPosition(v: 'before' | 'after') { this._iconPosition = v; return this; }
    size(v: Fn<TextSize | null>) { this._size = v; return this; }
    weight(v: Fn<string | null>) { this._weight = v; return this; }
    fontFamily(v: Fn<string | null>) { this._fontFamily = v; return this; }
    wrap(v: Fn<boolean> = true) { this._wrap = v; return this; }
    lineClamp(v: number) { this._lineClamp = v; return this; }
    bulleted(v = true) { this._bulleted = v; return this; }
    listWithLineBreaks(v = true) { this._listWithLineBreaks = v; return this; }
    limitList(v: number | null = 3) { this._listLimit = v; return this; }
    prose(v = true) { this._prose = v; return this; }
    markdown(v = true) { this._markdown = v; return this; }
    html(v = true) { this._html = v; return this; }
    copyable(v: Fn<boolean> = true, message?: string, duration?: number) { this._copyable = v; if (message) this._copyMessage = message; if (duration) this._copyMessageDuration = duration; return this; }
    formatStateUsing(v: (ctx: EvalContext) => any) { this._formatStateUsing = v; return this; }
    limit(n: number, end = '...') { this._characterLimit = n; this._characterLimitEnd = end; return this; }
    words(n: number, end = '...') { this._wordLimit = n; this._wordLimitEnd = end; return this; }
    prefix(v: Fn<string | null>) { this._prefix = v; return this; }
    suffix(v: Fn<string | null>) { this._suffix = v; return this; }

    date(format?: string | null, timezone?: string | null) {
        return this.formatStateUsing(({ state }) => {
            if (isBlank(state)) return null;
            let c = Carbon.parse(state);
            if (timezone) c = c.timezone(timezone);
            return c.format(format ?? 'M j, Y');
        });
    }
    dateTime(format?: string | null, timezone?: string | null) {
        return this.date(format ?? 'M j, Y H:i:s', timezone);
    }
    time(format?: string | null, timezone?: string | null) {
        return this.date(format ?? 'H:i:s', timezone);
    }
    since(timezone?: string | null) {
        return this.formatStateUsing(({ state }) => (isBlank(state) ? null : Carbon.parse(state).timezone(timezone ?? Carbon.now().tz).diffForHumans(null, adminContext().locale)));
    }
    money(currency?: string | null, divideBy = 0) {
        return this.formatStateUsing(({ state }) => {
            if (isBlank(state)) return null;
            if (Number.isNaN(Number(state))) return state;
            let value = Number(state);
            if (divideBy) value /= divideBy;
            return new Intl.NumberFormat(adminContext().locale.replace('_', '-'), { style: 'currency', currency: currency ?? 'USD' }).format(value);
        });
    }
    numeric(decimalPlaces: number | null = null, maxDecimalPlaces: number | null = null) {
        return this.formatStateUsing(({ state }) => (isBlank(state) ? null : Number.isNaN(Number(state)) ? state : formatNumber(Number(state), decimalPlaces, maxDecimalPlaces, adminContext().locale)));
    }

    private async format(rc: RenderContext, item: any): Promise<{ text: string; html: boolean }> {
        let value: any = item;
        if (this._formatStateUsing) value = await this._formatStateUsing({ ...this.evalCtx(rc), state: item });
        if (Array.isArray(value)) value = JSON.stringify(value);
        const prefix = (await this.evalWith(this._prefix, rc, item)) ?? '';
        const suffix = (await this.evalWith(this._suffix, rc, item)) ?? '';
        if (this._markdown) return { text: markdown(phpString(value)), html: true };
        if (this._html) return { text: `${prefix}${phpString(value)}${suffix}`, html: true };
        let text = phpString(value);
        if (this._characterLimit) text = strLimit(text, this._characterLimit, this._characterLimitEnd);
        if (this._wordLimit) text = strWords(text, this._wordLimit, this._wordLimitEnd);
        return { text: `${prefix}${text}${suffix}`, html: false };
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const state = await this.getState(rc);
        const isBadge = (await this.evalWith(this._badge, rc, state)) === true;
        const wrapped = (await this.evalWith(this._wrap, rc, state)) !== false;
        const align = this.alignClass();

        if (isBlank(state)) {
            const placeholder = await this.evalWith(this._placeholder, rc, state);
            return this.wrapEntry(rc, <div className={cn('fi-in-text', align)}>{placeholder ? <p className="fi-in-placeholder">{placeholder}</p> : null}</div>, state);
        }

        let items: any[] = Array.isArray(state) ? state : [state];
        const isList = items.length > 1;
        const asLineBreaks = this._listWithLineBreaks || this._bulleted;
        const limitN = this._listLimit ?? items.length;
        const over = items.length > limitN ? items.length - limitN : 0;
        if (over) items = items.slice(0, limitN);

        let collapsedText: string | null = null;
        if (items.length > 1 && !asLineBreaks && !isBadge) {
            const parts: string[] = [];
            for (const it of items) parts.push(esc((await this.format(rc, it)).text));
            collapsedText = parts.join(', ');
        }

        const itemAttrs = async (item: any) => {
            const color = ((await this.evalWith(this._color, rc, item)) as string | null) ?? (isBadge ? 'primary' : null);
            const iconColor = (await this.evalWith(this._iconColor, rc, item)) as FilamentColorName | null;
            const size = ((await this.evalWith(this._size, rc, item)) as string | null) || 'sm';
            const weight = (await this.evalWith(this._weight, rc, item)) as string | null;
            const family = (await this.evalWith(this._fontFamily, rc, item)) as string | null;
            const icon = (await this.evalWith(this._icon, rc, item)) as string | null;
            const copyable = (await this.evalWith(this._copyable, rc, item)) === true;
            const tooltip = this._tooltip ? await this.evalWith(this._tooltip, rc, item) : null;
            const iconNode = icon ? <Icon icon={icon} size={size === 'md' ? 'md' : size === 'lg' ? 'lg' : 'sm'} className={iconColor ? colorClass('textEntryItemIcon', iconColor) : undefined} /> : null;
            return {
                className: cn('fi-in-text-item', (this._prose || this._markdown) && 'fi-prose', family && (['sans', 'serif', 'mono'].includes(family) ? `fi-font-${family}` : family), !isBadge && `fi-size-${size}`, !isBadge && weight && `fi-font-${weight}`, !isBadge && color && colorClass('textEntryItem', color)),
                style: !isBadge && this._lineClamp ? ({ '--line-clamp': this._lineClamp } as any) : undefined,
                contentClass: isBadge || copyable || tooltip ? cn(copyable && 'fi-copyable', isBadge && 'fi-badge', isBadge && `fi-size-${size}`, isBadge && colorClass('badge', color ?? 'primary')) : null,
                copyable,
                tooltip,
                iconNode,
                color,
            };
        };

        const body = async (item: any, a: Awaited<ReturnType<typeof itemAttrs>>): Promise<ReactNode> => {
            const formatted = collapsedText !== null ? ({ text: collapsedText, html: true } as const) : await this.format(rc, item);
            const url = await this.evalWith(this._url, rc, item);
            void url;
            const text = formatted.html ? <span dangerouslySetInnerHTML={{ __html: formatted.text }} /> : formatted.text;
            const inner = (
                <>
                    {this._iconPosition === 'before' && a.iconNode}
                    {text}
                    {this._iconPosition === 'after' && a.iconNode}
                </>
            );
            if (a.copyable) {
                return (
                    <CopyableText className={a.contentClass ?? ''} text={formatted.text} message={this._copyMessage ?? 'Copied'} duration={this._copyMessageDuration}>
                        {inner}
                    </CopyableText>
                );
            }
            return a.contentClass ? (
                <span className={a.contentClass} title={a.tooltip ?? undefined}>
                    {inner}
                </span>
            ) : (
                inner
            );
        };

        const wrapperClass = cn('fi-in-text', isBadge && 'fi-in-text-has-badges', wrapped && 'fi-wrapped', align);

        if (items.length === 1 || collapsedText !== null) {
            const item = items[0];
            const a = await itemAttrs(item);
            return this.wrapEntry(
                rc,
                <div className={cn(wrapperClass, a.className)} style={a.style}>
                    {await body(item, a)}
                </div>,
                state,
            );
        }

        const lis: ReactNode[] = [];
        let i = 0;
        for (const item of items) {
            const a = await itemAttrs(item);
            lis.push(
                <li key={i++} className={a.className} style={a.style}>
                    {await body(item, a)}
                </li>,
            );
        }
        void isList;
        return this.wrapEntry(
            rc,
            <div className={cn(wrapperClass, this._bulleted && 'fi-bulleted', asLineBreaks && 'fi-in-text-has-line-breaks', over > 0 && 'fi-in-text-list-limited')}>
                <ul>{lis}</ul>
                {over > 0 && <div className="fi-in-text-list-limited-message">{transChoice('filament-infolists::components.entries.text.more_list_items', over, { count: over })}</div>}
            </div>,
            state,
        );
    }
}
