import type { ReactNode } from 'react';
import { Layout, slug } from './Layout';
import type { RenderContext } from '../Component';
import { TabPanel, TabsRoot, type TabItem } from './client';
import { Badge } from '../../ui/Badge';
import type { Fn } from '../../core/evaluate';
import type { FilamentColorName } from '../../ui/colors';

/** Filament\Schemas\Components\Tabs\Tab */
export class Tab extends Layout {
    protected _label2?: Fn<string | null>;
    protected _icon?: string;
    protected _iconPosition: 'before' | 'after' = 'before';
    protected _badge?: Fn<string | number | null>;
    protected _badgeColor?: FilamentColorName;

    static make(label?: Fn<string | null>): Tab {
        const t = new Tab();
        t._label2 = label;
        return t;
    }

    override canConcealComponents() { return true; }
    override label(v: Fn<string | null | false>) { this._label2 = v as any; return this; }
    icon(v: string) { this._icon = v; return this; }
    iconPosition(v: 'before' | 'after') { this._iconPosition = v; return this; }
    badge(v: Fn<string | number | null>) { this._badge = v; return this; }
    badgeColor(v: FilamentColorName) { this._badgeColor = v; return this; }

    override async getLabel(rc: RenderContext): Promise<string | null> {
        return ((await this.ev(this._label2, rc)) as string | null | undefined) ?? null;
    }

    async tabKey(rc: RenderContext) {
        return `${slug((await this.getLabel(rc)) ?? '')}::${rc.extra.domStatePath ?? 'data'}::tab`;
    }

    async item(rc: RenderContext): Promise<TabItem> {
        const badge = await this.ev(this._badge, rc);
        return {
            key: await this.tabKey(rc),
            label: (await this.getLabel(rc)) ?? '',
            icon: this._icon,
            iconPosition: this._iconPosition,
            badge: badge !== undefined && badge !== null && badge !== '' ? <Badge color={this._badgeColor ?? 'primary'} size="sm">{badge}</Badge> : undefined,
        };
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const items = await this.getItems(rc);
        if (items.length === 0) return null;
        const key = await this.tabKey(rc);
        const inner = await this.renderSchema(rc, { columns: this.getColumns() ?? { default: 1 } });
        return (
            <TabPanel tabKey={key} id={`${rc.formId}.${key}`} extra={this._extraAttributes}>
                {inner}
            </TabPanel>
        );
    }
}

/** Filament\Schemas\Components\Tabs */
export class Tabs extends Layout {
    protected _label2?: Fn<string | null>;
    protected _activeTab = 1;
    protected _persistInQueryString: Fn<boolean> = false;
    protected _queryStringKey = 'tab';
    protected _persist = false;
    protected _contained = true;
    protected _vertical = false;

    static make(label?: Fn<string | null>): Tabs {
        const t = new Tabs();
        t._label2 = label;
        return t;
    }

    tabs(v: Fn<Tab[]>) { return this.schema(v as any); }
    override label(v: Fn<string | null | false>) { this._label2 = v as any; return this; }
    activeTab(v: number) { this._activeTab = v; return this; }
    persistTabInQueryString(key = 'tab') { this._persistInQueryString = true; this._queryStringKey = key; return this; }
    persistTab(v = true) { this._persist = v; return this; }
    contained(v = true) { this._contained = v; return this; }
    vertical(v = true) { this._vertical = v; return this; }

    override async getLabel(rc: RenderContext): Promise<string | null> {
        return ((await this.ev(this._label2, rc)) as string | null | undefined) ?? null;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const label = await this.getLabel(rc);
        const all = (await this.getItems(rc)).filter((t): t is Tab => t instanceof Tab);
        const visible: Tab[] = [];
        for (const t of all) if (await t.isVisible(rc)) visible.push(t);
        const items = await Promise.all(visible.map((t) => t.item(rc)));
        const panels: ReactNode[] = [];
        for (const t of visible) {
            t.containerColumns = this.containerColumns;
            panels.push(<Fragment2 key={await t.tabKey(rc)}>{await t.render(rc)}</Fragment2>);
        }
        const id = this._id ?? (label ? `${rc.formId}.${slug(label)}::${rc.extra.domStatePath ?? 'data'}::tabs` : undefined);
        return (
            <TabsRoot id={id} tabs={items} activeIndex={this._activeTab} persistInQueryString={(await this.ev(this._persistInQueryString, rc)) === true} queryStringKey={this._queryStringKey} persist={this._persist} contained={this._contained} vertical={this._vertical} label={label} extra={this._extraAttributes}>
                {panels}
            </TabsRoot>
        );
    }
}

const Fragment2 = ({ children }: { children?: ReactNode }) => <>{children}</>;
