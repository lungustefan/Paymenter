import { Fragment, type ReactNode } from 'react';
import { Column, type CFn, type ColumnContext } from './Column';
import { Icon, type IconSize } from '../../ui/Icon';
import { colorClass, type FilamentColorName } from '../../ui/colors';
import { cn } from '@themes/default/components/cn';
import { trans } from '../../context';

const isBlank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Filament\Tables\Columns\IconColumn */
export class IconColumn extends Column {
    protected _boolean: CFn<boolean> | undefined;
    protected _icon?: CFn<string | null>;
    protected _icons?: Record<string, string>;
    protected _color?: CFn<FilamentColorName | null>;
    protected _colors?: Record<string, FilamentColorName>;
    protected _trueIcon?: CFn<string | false | null>;
    protected _falseIcon?: CFn<string | false | null>;
    protected _trueColor?: CFn<FilamentColorName | null>;
    protected _falseColor?: CFn<FilamentColorName | null>;
    protected _size?: CFn<string | null>;
    protected _listWithLineBreaks = false;
    protected _wrap = false;

    boolean(v: CFn<boolean> = true) { this._boolean = v; return this; }
    icon(v: CFn<string | null>) { this._icon = v; return this; }
    icons(v: Record<string, string>) { this._icons = v; return this; }
    options(v: Record<string, string>) { return this.icons(v); }
    color(v: CFn<FilamentColorName | null>) { this._color = v; return this; }
    colors(v: Record<string, FilamentColorName>) { this._colors = v; return this; }
    trueIcon(v: CFn<string | false | null>) { this._boolean = true; this._trueIcon = v; return this; }
    falseIcon(v: CFn<string | false | null>) { this._boolean = true; this._falseIcon = v; return this; }
    trueColor(v: CFn<FilamentColorName | null>) { this._boolean = true; this._trueColor = v; return this; }
    falseColor(v: CFn<FilamentColorName | null>) { this._boolean = true; this._falseColor = v; return this; }
    size(v: CFn<string | null>) { this._size = v; return this; }
    listWithLineBreaks(v = true) { this._listWithLineBreaks = v; return this; }
    wrap(v = true) { this._wrap = v; return this; }

    private async isBoolean(ctx: ColumnContext) {
        if (this._boolean === undefined) return false;
        return (await this.ev(this._boolean, ctx)) === true;
    }

    private async iconOf(state: unknown, ctx: ColumnContext): Promise<string | null> {
        const sctx = { ...ctx, state };
        const base = this._icon !== undefined ? await this.ev(this._icon, sctx) : this._icons ? this._icons[String(state)] : null;
        if (base) return base;
        if (!(await this.isBoolean(ctx)) || state === null || state === undefined) return null;
        if (state) {
            const icon = await this.ev(this._trueIcon, sctx);
            return icon === false ? null : (icon ?? 'heroicon-o-check-circle');
        }
        const icon = await this.ev(this._falseIcon, sctx);
        return icon === false ? null : (icon ?? 'heroicon-o-x-circle');
    }

    private async colorOf(state: unknown, ctx: ColumnContext): Promise<string | null> {
        const sctx = { ...ctx, state };
        const base = this._color !== undefined ? await this.ev(this._color, sctx) : this._colors ? this._colors[String(state)] : null;
        if (base) return base;
        if (!(await this.isBoolean(ctx)) || state === null || state === undefined) return null;
        if (state) return ((await this.ev(this._trueColor, sctx)) as string | null) ?? 'success';
        return ((await this.ev(this._falseColor, sctx)) as string | null) ?? 'danger';
    }

    override async render(record: any, rc: { recordKey: string; rowLoop: ColumnContext['rowLoop'] }): Promise<ReactNode> {
        const ctx = this.ctx(record, rc);
        let state = await this.getState(record);
        const alignment = await this.getAlignment(record);
        const alignClass = alignment ? (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(alignment) ? `fi-align-${alignment}` : alignment) : '';
        if (state && typeof state === 'object' && !Array.isArray(state)) state = Object.values(state);
        const placeholder = await this.ev(this._placeholder, ctx);

        if (isBlank(state)) {
            return <div className={cn('fi-ta-icon', this._inline && 'fi-inline', alignClass)}>{placeholder ? <p className="fi-ta-placeholder">{placeholder}</p> : null}</div>;
        }

        const items = Array.isArray(state) ? state : [state];
        const rendered: ReactNode[] = [];
        let i = 0;
        for (const item of items) {
            const icon = await this.iconOf(item, ctx);
            if (!icon) continue;
            const color = await this.colorOf(item, ctx);
            const size = (await this.ev(this._size, { ...ctx, state: item })) as string | null | undefined;
            const tooltip = await this.getTooltip(record, item);
            const alt = tooltip ?? ((await this.isBoolean(ctx)) ? trans(`filament-tables::table.columns.icon.boolean.${item ? 'true' : 'false'}`) : typeof item === 'string' || typeof item === 'number' ? String(item) : null);
            const url = await this.getUrl(record, item);
            const node = (
                <>
                    <Icon icon={icon} size={(size === 'base' ? null : (size as IconSize | null | undefined)) ?? 'lg'} className={color ? colorClass('iconColumnIcon', color) : undefined} />
                    {alt ? <span className="fi-sr-only">{String(alt).replace(/<[^>]*>/g, '').trim()}</span> : null}
                </>
            );
            rendered.push(
                url ? (
                    <a key={i++} href={url} target={this._openUrlInNewTab ? '_blank' : undefined} rel={this._openUrlInNewTab ? 'noopener noreferrer' : undefined}>
                        {node}
                    </a>
                ) : (
                    <Fragment key={i++}>{node}</Fragment>
                ),
            );
        }
        return <div className={cn('fi-ta-icon', this._inline && 'fi-inline', alignClass, this._listWithLineBreaks && 'fi-ta-icon-has-line-breaks', this._wrap && 'fi-wrapped')}>{rendered}</div>;
    }
}
