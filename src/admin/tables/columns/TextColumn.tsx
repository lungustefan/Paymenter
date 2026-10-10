import type { ReactNode } from 'react';
import { Column, type ColumnContext, type CFn } from './Column';
import { Icon } from '../../ui/Icon';
import { colorClass, type FilamentColorName } from '../../ui/colors';
import { cn } from '@themes/default/components/cn';
import { Carbon } from '@/server/lib/carbon';
import { adminContext, trans, transChoice } from '../../context';
import { CopyableText } from '../client';

type Maybe<T> = T | null | undefined;

/** PHP's string conversion of a value (`true` -> `1`, `false` / `null` -> ``) */
export const phpString = (v: unknown): string => (v === null || v === undefined || v === false ? '' : v === true ? '1' : typeof v === 'object' ? JSON.stringify(v) : String(v));

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** `Str::limit()` */
const limit = (value: string, n: number, end = '...') => (value.length <= n ? value : `${value.slice(0, n).trimEnd()}${end}`);
/** `Str::words()` */
const words = (value: string, n: number, end = '...') => {
    const m = value.match(new RegExp(`^\\s*(?:\\S+\\s*){1,${n}}`));
    return !m || m[0].length === value.length ? value : `${m[0].trimEnd()}${end}`;
};

/** `Number::format()` */
export function formatNumber(value: number, decimals: number | null = null, maxDecimals: number | null = null, locale = 'en'): string {
    const options: Intl.NumberFormatOptions = {};
    if (decimals !== null) {
        options.minimumFractionDigits = decimals;
        options.maximumFractionDigits = decimals;
    } else if (maxDecimals !== null) options.maximumFractionDigits = maxDecimals;
    return new Intl.NumberFormat(locale.replace('_', '-'), options).format(value);
}

type TextSize = 'xs' | 'sm' | 'md' | 'lg' | string;

/** Filament\Tables\Columns\TextColumn */
export class TextColumn extends Column {
    protected _badge: CFn<boolean> = false;
    protected _color?: CFn<FilamentColorName | string | null>;
    protected _icon?: CFn<string | null>;
    protected _iconColor?: CFn<FilamentColorName | null>;
    protected _iconPosition: 'before' | 'after' = 'before';
    protected _size?: CFn<TextSize | null>;
    protected _weight?: CFn<string | null>;
    protected _fontFamily?: CFn<string | null>;
    protected _wrap: CFn<boolean> = false;
    protected _lineClamp?: number;
    protected _bulleted = false;
    protected _listWithLineBreaks = false;
    protected _listLimit?: number;
    protected _expandableLimitedList = false;
    protected _separator?: string;
    protected _copyable: CFn<boolean> = false;
    protected _copyableState?: CFn<string | null>;
    protected _copyMessage?: string;
    protected _copyMessageDuration = 2000;
    protected _description?: { above?: CFn<string | null>; below?: CFn<string | null> };
    protected _formatStateUsing?: (ctx: ColumnContext) => any;
    protected _characterLimit?: number;
    protected _characterLimitEnd?: string;
    protected _wordLimit?: number;
    protected _wordLimitEnd?: string;
    protected _prefix?: CFn<string | null>;
    protected _suffix?: CFn<string | null>;
    protected _html = false;
    protected _isDateTime = false;
    protected _emptyTooltip?: string;

    /* ---- fluent configuration ---- */
    badge(v: CFn<boolean> = true) { this._badge = v; return this; }
    color(v: CFn<FilamentColorName | string | null>) { this._color = v; return this; }
    icon(v: CFn<string | null>, position?: 'before' | 'after') { this._icon = v; if (position) this._iconPosition = position; return this; }
    iconColor(v: CFn<FilamentColorName | null>) { this._iconColor = v; return this; }
    iconPosition(v: 'before' | 'after') { this._iconPosition = v; return this; }
    size(v: CFn<TextSize | null>) { this._size = v; return this; }
    weight(v: CFn<string | null>) { this._weight = v; return this; }
    fontFamily(v: CFn<string | null>) { this._fontFamily = v; return this; }
    wrap(v: CFn<boolean> = true) { this._wrap = v; return this; }
    lineClamp(v: number) { this._lineClamp = v; return this; }
    bulleted(v = true) { this._bulleted = v; return this; }
    listWithLineBreaks(v = true) { this._listWithLineBreaks = v; return this; }
    limitList(v: number, expandable = false) { this._listLimit = v; this._expandableLimitedList = expandable; return this; }
    separator(v: string) { this._separator = v; return this; }
    copyable(v: CFn<boolean> = true, message?: string, duration?: number) { this._copyable = v; if (message) this._copyMessage = message; if (duration) this._copyMessageDuration = duration; return this; }
    copyableState(v: CFn<string | null>) { this._copyableState = v; return this; }
    description(v: CFn<string | null>, position: 'above' | 'below' = 'below') { this._description = { ...(this._description ?? {}), [position]: v }; return this; }
    formatStateUsing(v: (ctx: ColumnContext) => any) { this._formatStateUsing = v; return this; }
    limit(n: number, end = '...') { this._characterLimit = n; this._characterLimitEnd = end; return this; }
    words(n: number, end = '...') { this._wordLimit = n; this._wordLimitEnd = end; return this; }
    prefix(v: CFn<string | null>) { this._prefix = v; return this; }
    suffix(v: CFn<string | null>) { this._suffix = v; return this; }
    html(v = true) { this._html = v; return this; }
    emptyTooltip(v: string) { this._emptyTooltip = v; return this; }

    /** `->date('M j, Y')` */
    date(format?: string | null, timezone?: string | null) {
        this.formatStateUsing(({ state }) => {
            if (isBlank(state)) return null;
            let c = Carbon.parse(state);
            if (timezone) c = c.timezone(timezone);
            return c.format(format ?? 'M j, Y');
        });
        return this;
    }
    dateTime(format?: string | null, timezone?: string | null) {
        this._isDateTime = true;
        return this.date(format ?? 'M j, Y H:i:s', timezone);
    }
    time(format?: string | null, timezone?: string | null) {
        return this.date(format ?? 'H:i:s', timezone);
    }
    since(timezone?: string | null) {
        this.formatStateUsing(({ state }) => (isBlank(state) ? null : Carbon.parse(state).timezone(timezone ?? Carbon.now().tz).diffForHumans(null, adminContext().locale)));
        return this;
    }
    dateTooltip(format = 'M j, Y') {
        this._tooltip = ({ state }: ColumnContext) => (isBlank(state) ? null : Carbon.parse(state).format(format));
        return this;
    }
    /** `->money('EUR', divideBy: 100)` */
    money(currency?: CFn<string | null>, divideBy: number = 0, locale?: string | null, decimalPlaces?: number | null) {
        this.formatStateUsing(async (ctx) => {
            const { state } = ctx;
            if (isBlank(state)) return null;
            if (Number.isNaN(Number(state))) return state;
            const cur = ((await this.ev(currency, ctx)) as string | null) ?? 'USD';
            let value = Number(state);
            if (divideBy) value /= divideBy;
            const options: Intl.NumberFormatOptions = { style: 'currency', currency: cur };
            if (decimalPlaces !== null && decimalPlaces !== undefined) {
                options.minimumFractionDigits = decimalPlaces;
                options.maximumFractionDigits = decimalPlaces;
            }
            return new Intl.NumberFormat((locale ?? adminContext().locale).replace('_', '-'), options).format(value);
        });
        return this;
    }
    numeric(decimalPlaces: number | null = null, decimalSeparator?: string, thousandsSeparator?: string, maxDecimalPlaces: number | null = null, locale?: string | null) {
        this.formatStateUsing(({ state }) => {
            if (isBlank(state)) return null;
            if (Number.isNaN(Number(state))) return state;
            if (decimalSeparator !== undefined || thousandsSeparator !== undefined) {
                const fixed = Number(state).toFixed(decimalPlaces ?? 0);
                const [int, frac] = fixed.split('.');
                return int.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator ?? ',') + (frac ? (decimalSeparator ?? '.') + frac : '');
            }
            return formatNumber(Number(state), decimalPlaces, maxDecimalPlaces, locale ?? adminContext().locale);
        });
        return this;
    }

    /* ---- rendering ---- */
    protected async formatState(state: any, ctx: ColumnContext): Promise<{ text: string; html: boolean }> {
        let value: any = state;
        let isHtml = this._html;
        if (this._formatStateUsing) {
            value = await this._formatStateUsing({ ...ctx, state });
        }
        if (Array.isArray(value)) value = JSON.stringify(value);
        if (!isHtml) {
            let text = phpString(value);
            if (this._characterLimit) text = limit(text, this._characterLimit, this._characterLimitEnd);
            if (this._wordLimit) text = words(text, this._wordLimit, this._wordLimitEnd);
            const prefix = this._prefix ? await this.ev(this._prefix, ctx) : null;
            const suffix = this._suffix ? await this.ev(this._suffix, ctx) : null;
            return { text: `${prefix ?? ''}${text}${suffix ?? ''}`, html: false };
        }
        const prefix = this._prefix ? await this.ev(this._prefix, ctx) : null;
        const suffix = this._suffix ? await this.ev(this._suffix, ctx) : null;
        isHtml = true;
        return { text: `${prefix ?? ''}${phpString(value)}${suffix ?? ''}`, html: isHtml };
    }

    override async render(record: any, meta: { recordKey: string; rowLoop: ColumnContext['rowLoop'] }): Promise<ReactNode> {
        const base = this.ctx(record, { recordKey: meta.recordKey, rowLoop: meta.rowLoop });
        let state = await this.getState(record);
        const alignment = await this.getAlignment(record);
        const alignClass = alignment ? (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(alignment) ? `fi-align-${alignment}` : alignment) : '';
        const isBadge = (await this.ev(this._badge, { ...base, state })) === true;

        // blank
        if (isBlank(state) || state === false && false) {
            const placeholder = this._placeholder ? await this.ev(this._placeholder, base) : null;
            return (
                <div className={cn('fi-ta-text', this._inline && 'fi-inline', alignClass)}>
                    {placeholder ? <p className="fi-ta-placeholder">{placeholder}</p> : null}
                </div>
            );
        }

        const url = await this.getUrl(record, state);
        const items: any[] = Array.isArray(state) ? state : [state];
        const wrap = (await this.ev(this._wrap, base)) === true;
        const lineClamp = this._lineClamp;
        const descAbove = this._description?.above ? await this.ev(this._description.above, { ...base, state }) : null;
        const descBelow = this._description?.below ? await this.ev(this._description.below, { ...base, state }) : null;
        const hasDescriptions = !!descAbove || !!descBelow;

        const linkNode = (inner: ReactNode, itemUrl: string | null) =>
            itemUrl ? (
                <a href={itemUrl} {...(this._openUrlInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {inner}
                </a>
            ) : (
                inner
            );

        const textNode = (formatted: { text: string; html: boolean }): ReactNode => (formatted.html ? <span dangerouslySetInnerHTML={{ __html: formatted.text }} /> : formatted.text);

        // the optimized path: a single plain value
        const hasExtras = !!(this._icon || this._copyable !== false || this._tooltip || this._weight || this._fontFamily || lineClamp || this._size || hasDescriptions || this._wrap !== false || this._bulleted || this._listWithLineBreaks || Object.keys(this._extraAttributes).length);
        if (!Array.isArray(state) && !hasExtras && typeof state !== 'object') {
            const formatted = await this.formatState(state, { ...base, state });
            const color = this._color ? await this.ev(this._color, { ...base, state }) : null;
            let inner: ReactNode = textNode(formatted);
            if (url) inner = linkNode(inner, url);
            if (isBadge) {
                const badgeColor = (color as string | null) || 'primary';
                inner = <span className={cn('fi-badge', 'fi-size-sm', colorClass('badge', badgeColor))}>{inner}</span>;
            }
            const cls = isBadge ? 'fi-ta-text fi-ta-text-item fi-ta-text-has-badges' : cn('fi-ta-text fi-ta-text-item fi-size-sm', color ? colorClass('textColumnItem', color as string) : '');
            return <div className={cn(cls, this._inline && 'fi-inline', alignClass)}>{inner}</div>;
        }

        // the full path
        let list = items.filter((i) => i !== undefined);
        const listLimit = this._listLimit ?? list.length;
        const overLimit = list.length > listLimit ? list.length - listLimit : 0;
        if (overLimit && (!this._listWithLineBreaks || !this._expandableLimitedList)) list = list.slice(0, listLimit);

        let collapsed = false;
        let formattedItems: Array<{ state: any; formatted: { text: string; html: boolean } | null }> = [];
        if (list.length > 1 && !this._listWithLineBreaks && !isBadge) {
            const parts: string[] = [];
            for (const item of list) {
                const f = await this.formatState(item, { ...base, state: item });
                const itemUrl = await this.getUrl(record, item);
                parts.push(itemUrl ? `<a href="${itemUrl}">${escapeHtml(f.text)}</a>` : escapeHtml(f.text));
            }
            list = [parts.join(this._separator ?? ', ')];
            collapsed = true;
        }
        for (const item of list) formattedItems.push({ state: item, formatted: collapsed ? { text: String(item), html: true } : await this.formatState(item, { ...base, state: item }) });

        const itemAttrs = async (item: any) => {
            const ic = { ...base, state: item };
            const color = ((await this.ev(this._color, ic)) as string | null) ?? (isBadge ? 'primary' : null);
            const iconColor = (await this.ev(this._iconColor, ic)) as FilamentColorName | null;
            const size = (await this.ev(this._size, ic)) as string | null;
            const weight = (await this.ev(this._weight, ic)) as string | null;
            const family = (await this.ev(this._fontFamily, ic)) as string | null;
            const icon = (await this.ev(this._icon, ic)) as string | null;
            const copyable = (await this.ev(this._copyable, ic)) === true;
            const tooltip = this._tooltip ? await this.ev(this._tooltip, ic) : null;
            const iconSize = size === 'md' ? 'md' : size === 'lg' ? 'lg' : 'sm';
            const iconNode = icon ? <Icon icon={icon} size={iconSize as any} className={iconColor ? colorClass('textColumnItemIcon', iconColor) : undefined} aria-hidden="true" /> : null;
            const className = cn(
                'fi-ta-text-item',
                family && (['sans', 'serif', 'mono'].includes(family) ? `fi-font-${family}` : family),
                !isBadge && size && `fi-size-${size}`,
                !isBadge && weight && `fi-font-${weight}`,
                !isBadge && color && colorClass('textColumnItem', color),
            );
            const contentClass = isBadge || copyable || tooltip ? cn(copyable && 'fi-copyable', isBadge && 'fi-badge', isBadge && size && `fi-size-${size}`, isBadge && colorClass('badge', color ?? 'primary')) : null;
            const style = !isBadge && lineClamp ? ({ '--line-clamp': lineClamp } as any) : undefined;
            return { className, contentClass, iconNode, copyable, tooltip, style, ic };
        };

        const renderItem = async (entry: { state: any; formatted: { text: string; html: boolean } | null }, key: number, Tag: 'div' | 'p' | 'li', extraClass = ''): Promise<ReactNode> => {
            const a = await itemAttrs(entry.state);
            const itemUrl = collapsed ? null : await this.getUrl(record, entry.state);
            const body = (
                <>
                    {this._iconPosition === 'before' && a.iconNode}
                    {collapsed ? <span dangerouslySetInnerHTML={{ __html: entry.formatted!.text }} /> : linkNode(textNode(entry.formatted!), itemUrl)}
                    {this._iconPosition === 'after' && a.iconNode}
                </>
            );
            const wrapped = a.contentClass !== null ? (
                a.copyable ? (
                    <CopyableText className={a.contentClass} text={(this._copyableState ? ((await this.ev(this._copyableState, a.ic)) as string) : null) ?? entry.formatted?.text ?? ''} message={this._copyMessage ?? trans('filament-tables::table.columns.text.actions.copy.message')} duration={this._copyMessageDuration}>
                        {body}
                    </CopyableText>
                ) : (
                    <span className={a.contentClass} title={a.tooltip ?? undefined}>{body}</span>
                )
            ) : (
                body
            );
            return (
                <Tag key={key} className={cn(a.className, extraClass)} style={a.style}>
                    {wrapped}
                </Tag>
            );
        };

        const wrapperClass = cn('fi-ta-text', this._inline && 'fi-inline', alignClass, isBadge && 'fi-ta-text-has-badges', wrap && 'fi-wrapped');

        if (formattedItems.length === 1 && !this._bulleted && !hasDescriptions && !lineClamp) {
            const a = await itemAttrs(formattedItems[0].state);
            const itemUrl = collapsed ? null : await this.getUrl(record, formattedItems[0].state);
            const body = (
                <>
                    {this._iconPosition === 'before' && a.iconNode}
                    {collapsed ? <span dangerouslySetInnerHTML={{ __html: formattedItems[0].formatted!.text }} /> : linkNode(textNode(formattedItems[0].formatted!), itemUrl)}
                    {this._iconPosition === 'after' && a.iconNode}
                </>
            );
            const wrapped = a.contentClass !== null ? (
                a.copyable ? (
                    <CopyableText className={a.contentClass} text={(this._copyableState ? ((await this.ev(this._copyableState, a.ic)) as string) : null) ?? formattedItems[0].formatted?.text ?? ''} message={this._copyMessage ?? trans('filament-tables::table.columns.text.actions.copy.message')} duration={this._copyMessageDuration}>
                        {body}
                    </CopyableText>
                ) : (
                    <span className={a.contentClass} title={a.tooltip ?? undefined}>{body}</span>
                )
            ) : (
                body
            );
            return (
                <div className={cn(wrapperClass, a.className)} style={a.style}>
                    {wrapped}
                </div>
            );
        }

        const listClass = cn(wrapperClass, this._bulleted && 'fi-bulleted', this._listWithLineBreaks && 'fi-ta-text-has-line-breaks');
        if (hasDescriptions || overLimit) {
            return (
                <div className={cn(listClass, hasDescriptions && 'fi-ta-text-has-descriptions', !!overLimit && 'fi-ta-text-list-limited')}>
                    {descAbove && <p className="fi-ta-text-description">{descAbove}</p>}
                    {formattedItems.length === 1 && !this._bulleted ? (
                        await renderItem(formattedItems[0], 0, 'p')
                    ) : (
                        <ul>{await Promise.all(formattedItems.map((e, i) => renderItem(e, i, 'li')))}</ul>
                    )}
                    {overLimit > 0 && <div className="fi-ta-text-list-limited-message">{transChoice('filament-tables::table.columns.text.more_list_items', overLimit, { count: overLimit })}</div>}
                    {descBelow && <p className="fi-ta-text-description">{descBelow}</p>}
                </div>
            );
        }
        return <ul className={listClass}>{await Promise.all(formattedItems.map((e, i) => renderItem(e, i, 'li')))}</ul>;
    }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export type { Maybe };
