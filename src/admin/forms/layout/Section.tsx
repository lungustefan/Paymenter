import type { ReactNode } from 'react';
import { Layout } from './Layout';
import type { RenderContext } from '../Component';
import { renderItems, type SchemaItem } from '../Schema';
import { SectionShell } from './client';
import { Icon } from '../../ui/Icon';
import { colorClass, type FilamentColorName } from '../../ui/colors';
import { trans } from '../../context';
import type { Fn } from '../../core/evaluate';
import { cn } from '@themes/default/components/cn';

/** Filament\Schemas\Components\Section */
export class Section extends Layout {
    protected _heading?: Fn<string | null>;
    protected _description?: Fn<string | null>;
    protected _icon?: Fn<string | null>;
    protected _iconColor?: FilamentColorName;
    protected _iconSize?: string;
    protected _aside: Fn<boolean> = false;
    protected _collapsible: Fn<boolean> = false;
    protected _collapsed: Fn<boolean> = false;
    protected _persistCollapsed = false;
    protected _compact: Fn<boolean> = false;
    protected _contained: Fn<boolean> = true;
    protected _divided: Fn<boolean> = false;
    protected _secondary: Fn<boolean> = false;
    protected _headerActions: SchemaItem[] = [];
    protected _footerActions: SchemaItem[] = [];
    protected _footerAlignment: 'start' | 'end' | 'center' | 'between' = 'start';
    protected _headingTag = 'h2';

    static make(heading: Fn<string | null> | SchemaItem[] | null = null): Section {
        const s = new Section();
        if (Array.isArray(heading)) s.schema(heading);
        else s._heading = heading ?? undefined;
        return s;
    }

    heading(v: Fn<string | null>) { this._heading = v; return this; }
    description(v: Fn<string | null>) { this._description = v; return this; }
    icon(v: Fn<string | null>) { this._icon = v; return this; }
    iconColor(v: FilamentColorName) { this._iconColor = v; return this; }
    aside(v: Fn<boolean> = true) { this._aside = v; return this; }
    collapsible(v: Fn<boolean> = true) { this._collapsible = v; return this; }
    collapsed(v: Fn<boolean> = true) { this._collapsed = v; this._collapsible = true; return this; }
    persistCollapsed(v = true) { this._persistCollapsed = v; return this; }
    compact(v: Fn<boolean> = true) { this._compact = v; return this; }
    contained(v: Fn<boolean> = true) { this._contained = v; return this; }
    divided(v: Fn<boolean> = true) { this._divided = v; return this; }
    secondary(v: Fn<boolean> = true) { this._secondary = v; return this; }
    headerActions(v: SchemaItem[]) { this._headerActions = v; return this; }
    footerActions(v: SchemaItem[]) { this._footerActions = v; return this; }
    footerActionsAlignment(v: 'start' | 'end' | 'center' | 'between') { this._footerAlignment = v; return this; }

    override getLabel(): Promise<string | null> {
        return Promise.resolve(null);
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const heading = (await this.ev(this._heading, rc)) ?? null;
        const description = (await this.ev(this._description, rc)) ?? null;
        const icon = (await this.ev(this._icon, rc)) ?? null;
        const aside = (await this.ev(this._aside, rc)) === true;
        const collapsible = (await this.ev(this._collapsible, rc)) === true && !aside;
        const collapsed = (await this.ev(this._collapsed, rc)) === true;
        const hasAfterHeader = this._headerActions.length > 0;
        const hasHeader = !!icon || !!heading || !!description || collapsible || hasAfterHeader;
        const content = await this.renderSchema(rc, { className: 'fi-section-content' });
        const footer = this._footerActions.length
            ? await renderItems(rc, this._footerActions, { inline: true, alignment: this._footerAlignment === 'start' ? 'start' : this._footerAlignment, columns: null, gap: true, className: '' })
            : null;
        const afterHeader = hasAfterHeader ? await renderItems(rc, this._headerActions, { inline: true, alignment: 'end', columns: null }) : null;
        const id = this.domId(rc, heading, 'section');
        const hasContent = !!content;
        const sectionId = this._id ?? id;
        const contentId = sectionId && (hasContent || footer) ? `${sectionId}-content` : undefined;
        const headingId = sectionId && heading ? `${sectionId}-heading` : undefined;
        const descriptionId = sectionId && description ? `${sectionId}-description` : undefined;

        const classes = cn(
            'fi-section',
            !(await this.ev(this._contained, rc)) && 'fi-section-not-contained',
            hasHeader && 'fi-section-has-header',
            aside && 'fi-aside',
            (await this.ev(this._compact, rc)) && 'fi-compact',
            collapsible && 'fi-collapsible',
            (await this.ev(this._divided, rc)) && 'fi-divided',
            (await this.ev(this._secondary, rc)) && 'fi-secondary',
        );

        const header = hasHeader ? (
            <>
                {icon && <Icon icon={icon} size="lg" className={colorClass('sectionIcon', this._iconColor ?? 'gray')} />}
                {(heading || description) && (
                    <div className="fi-section-header-text-ctn">
                        {heading && (
                            <h2 id={headingId} className="fi-section-header-heading">
                                {heading}
                            </h2>
                        )}
                        {description && (
                            <p id={descriptionId} className="fi-section-header-description">
                                {description}
                            </p>
                        )}
                    </div>
                )}
                {afterHeader && <div className="fi-section-header-after-ctn">{afterHeader}</div>}
            </>
        ) : null;

        const body =
            hasContent || footer ? (
                <>
                    {content}
                    {footer && <footer className="fi-section-footer">{footer}</footer>}
                </>
            ) : null;

        return (
            <div id={sectionId} {...(this._extraAttributes as any)} className="fi-sc-section">
                <SectionShell
                    className={classes}
                    collapsible={collapsible}
                    initiallyCollapsed={collapsed}
                    persistKey={this._persistCollapsed ? `section-${sectionId}-isCollapsed` : undefined}
                    contentId={contentId}
                    hasContent={!!body}
                    header={header}
                    labelledBy={headingId}
                    describedBy={descriptionId}
                    collapseLabel={trans('filament-schemas::components.section.actions.collapse.label')}
                    expandLabel={trans('filament-schemas::components.section.actions.expand.label')}
                >
                    {body}
                </SectionShell>
            </div>
        );
    }
}
