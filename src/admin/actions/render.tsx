import { Fragment, type ReactNode } from 'react';
import { Action, ActionGroup, type ActionContext, type ActionStyle } from './Action';
import { ActionTrigger, ActionDropdown } from './client';
import { Icon } from '../ui/Icon';
import { badgeClass, buttonClass, iconButtonClass, linkClass, type Size } from '../ui/classes';
import { colorClass } from '../ui/colors';
import { cn } from '@themes/default/components/cn';

export interface RenderActionOptions {
    /** the style used when the action does not pick one (`->button()`, `->link()`, ...) */
    defaultStyle?: ActionStyle;
    defaultSize?: Size | null;
    /** table actions prefer `tableIcon()` */
    useTableIcon?: boolean;
    /** arguments sent along when the action is mounted */
    args?: Record<string, any>;
    /** a bulk action: the selected record keys of the table are sent along */
    bulk?: boolean;
    /** the element is inside a dropdown list */
    grouped?: boolean;
    /** key used for the DOM (React) */
    key?: string;
}

const joinClass = (...parts: Array<string | undefined | null | false>) => cn(...parts);

/** `Action::toHtml()`: the button / link / icon button / dropdown item of an action. */
export async function renderActionItem(item: Action | ActionGroup, ctx: ActionContext, id: string, opts: RenderActionOptions = {}): Promise<ReactNode> {
    if (item instanceof ActionGroup) return renderActionGroup(item, ctx, id, opts);

    const action = item;
    const c = { ...ctx, action };
    const style: ActionStyle = opts.grouped ? 'grouped' : (action.getStyle() ?? opts.defaultStyle ?? 'button');
    const size = (action.getSize() ?? opts.defaultSize ?? 'md') as Size;
    const color = await action.getColor(c);
    const label = await action.getLabel(c);
    const url = await action.getUrl(c);
    const disabled = await action.isDisabled(c);
    const tooltip = await action.getTooltip(c);
    const badge = await action.getBadge(c);

    let icon = await action.getIcon(c);
    if (style === 'grouped') icon = action.getGroupedIcon() ?? icon;
    else if (opts.useTableIcon) icon = action.getTableIcon() ?? icon;

    const mode: 'link' | 'mount' | 'call' = url ? 'link' : action.shouldOpenModal() ? 'mount' : 'call';
    const extra = action.getExtraAttributes();
    const { class: extraClass, ...extraAttrs } = extra as Record<string, any>;
    const iconPosition = action.getIconPosition();
    const iconSizeName = action.getIconSize();

    const common = {
        actionId: id,
        mode,
        args: { ...action.getArguments(), ...(opts.args ?? {}) },
        bulk: opts.bulk ?? action.isBulk(),
        href: url ?? undefined,
        newTab: action.shouldOpenUrlInNewTab(),
        disabled,
        title: tooltip ?? undefined,
        keyBindings: action.getKeyBindings(),
        attrs: extraAttrs,
    };

    if (style === 'grouped') {
        return (
            <ActionTrigger {...common} tag={url ? 'a' : 'button'} className={joinClass('fi-ac-grouped-action', 'fi-dropdown-list-item', disabled && 'fi-disabled', colorClass('dropdownItem', color), extraClass)}>
                {icon && <Icon icon={icon} className={colorClass('dropdownItemIcon', color)} />}
                <span className="fi-dropdown-list-item-label">{label}</span>
                {badge && (
                    <span className="fi-dropdown-list-item-badge-ctn">
                        <span className={badgeClass({ color: action.getBadgeColor(), size: 'xs' })}>
                            <span className="fi-badge-label-ctn">
                                <span className="fi-badge-label">{badge}</span>
                            </span>
                        </span>
                    </span>
                )}
            </ActionTrigger>
        );
    }

    if (style === 'link') {
        const iconSize = (iconSizeName as any) ?? (size === 'xs' || size === 'sm' ? 'sm' : null);
        const iconEl = icon ? <Icon icon={icon} size={iconSize} /> : null;
        return (
            <ActionTrigger {...common} tag={url ? 'a' : 'button'} className={joinClass(linkClass({ color, size, disabled, extra: undefined }), 'fi-ac-link-action', extraClass)}>
                {iconPosition === 'before' && iconEl}
                {!action.isLabelHidden() && <span className="fi-link-label">{label}</span>}
                {iconPosition === 'after' && iconEl}
            </ActionTrigger>
        );
    }

    if (style === 'iconButton') {
        const iconSize = (iconSizeName as any) ?? (size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null);
        return (
            <ActionTrigger {...common} tag={url ? 'a' : 'button'} title={tooltip ?? label} ariaLabel={label} className={joinClass(iconButtonClass({ color, size, disabled }), 'fi-ac-icon-btn-action', extraClass)}>
                {icon && <Icon icon={icon} size={iconSize} />}
                {badge && (
                    <div className="fi-icon-btn-badge-ctn">
                        <span className={badgeClass({ color: action.getBadgeColor(), size: 'xs' })}>
                            <span className="fi-badge-label-ctn">
                                <span className="fi-badge-label">{badge}</span>
                            </span>
                        </span>
                    </div>
                )}
            </ActionTrigger>
        );
    }

    // button
    const iconSize = (iconSizeName as any) ?? (size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null);
    const iconEl = icon ? <Icon icon={icon} size={iconSize} /> : null;
    return (
        <ActionTrigger {...common} tag={url ? 'a' : 'button'} className={joinClass(buttonClass({ color, outlined: action.isOutlined(), size, disabled, labeledFrom: action.getLabeledFrom() }), 'fi-ac-btn-action', extraClass)}>
            {iconPosition === 'before' && iconEl}
            {label}
            {iconPosition === 'after' && iconEl}
            {badge && (
                <div className="fi-btn-badge-ctn">
                    <span className={badgeClass({ color: action.getBadgeColor(), size: 'xs' })}>
                        <span className="fi-badge-label-ctn">
                            <span className="fi-badge-label">{badge}</span>
                        </span>
                    </span>
                </div>
            )}
        </ActionTrigger>
    );
}

/** `ActionGroup`: the dropdown with the actions inside */
export async function renderActionGroup(group: ActionGroup, ctx: ActionContext, id: string, opts: RenderActionOptions = {}): Promise<ReactNode> {
    const items: ReactNode[] = [];
    let index = 0;
    for (const sub of group.actions) {
        const visible = sub instanceof ActionGroup ? await sub.isVisible(ctx) : await sub.isVisible({ ...ctx, action: sub });
        if (!visible) {
            index++;
            continue;
        }
        const subId = sub instanceof Action ? `${id}.${sub.getName()}` : `${id}.g${index}`;
        items.push(<Fragment key={subId}>{await renderActionItem(sub, ctx, subId, { ...opts, grouped: true, bulk: opts.bulk })}</Fragment>);
        index++;
    }
    const color = group.getColor();
    const label = group.getLabel();
    const icon = group.getIcon();
    const trigger = group.isButton() ? (
        <button type="button" className={buttonClass({ color, size: (group.getSize() as Size) ?? 'md', extra: 'fi-ac-btn-group' })}>
            {icon && <Icon icon={icon} />}
            {label}
        </button>
    ) : (
        <button type="button" title={group.getTooltip() ?? label ?? undefined} className={iconButtonClass({ color, size: (group.getSize() as Size) ?? 'md', extra: 'fi-ac-btn-group' })}>
            <Icon icon={icon} />
        </button>
    );
    return (
        <ActionDropdown trigger={trigger}>
            <div className="fi-dropdown-list">{items}</div>
        </ActionDropdown>
    );
}

/**
 * `<div class="fi-ac fi-align-start">…</div>`: a row of actions (page header, form footer, table toolbar).
 * Returns `null` when no action is visible.
 */
export async function renderActionsGroup(actions: Array<Action | ActionGroup>, ctx: ActionContext, idPrefix: string, opts: RenderActionOptions & { alignment?: string; className?: string } = {}): Promise<ReactNode> {
    const rendered: ReactNode[] = [];
    let index = 0;
    for (const item of actions) {
        const visible = item instanceof ActionGroup ? await item.isVisible(ctx) : await item.isVisible({ ...ctx, action: item });
        if (visible) {
            const id = item instanceof Action ? `${idPrefix}.${item.getName()}` : `${idPrefix}.g${index}`;
            rendered.push(<Fragment key={id}>{await renderActionItem(item, ctx, id, opts)}</Fragment>);
        }
        index++;
    }
    if (rendered.length === 0) return null;
    return <div className={cn('fi-ac', opts.alignment !== '' && `fi-align-${opts.alignment ?? 'start'}`, opts.className)}>{rendered}</div>;
}
