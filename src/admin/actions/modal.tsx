import type { ReactNode } from 'react';
import type { Action, ActionContext } from './Action';
import type { Host, ActionRef } from '../core/host';
import { ModalCancelButton, ModalCloseButton, ModalExtraButton, ModalFrame, ModalSubmitButton } from './modal-client';
import { FormProvider, SchemaSlot } from '../forms/runtime';
import { Schema } from '../forms/Schema';
import { fillForm, makeRenderContext } from '../forms/process';
import { Icon } from '../ui/Icon';
import { buttonClass, iconButtonClass } from '../ui/classes';
import { colorClass } from '../ui/colors';
import { cn } from '@themes/default/components/cn';
import { trans } from '../context';

const hash = (s: string) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
};

/** the schema (form) of an action's modal and its filled state */
export async function buildActionForm(host: Host, ref: ActionRef, state?: Record<string, any>) {
    const { action, ctx } = ref;
    const components = await action.getFormComponents(ctx);
    const schema = Schema.make().components(components).operation('create').model(ctx.record ?? ctx.model);
    const columns = (action as any).formColumns;
    if (columns) schema.columns(columns);
    const rc = makeRenderContext({ state: state ?? {}, operation: 'create', record: ctx.record ?? null, model: ctx.model, user: host.user, livewire: host, formId: 'mountedActionSchema0', extra: { arguments: ctx.arguments ?? {}, ownerRecord: (ctx as any).ownerRecord } });
    return { schema, rc, components };
}

/** `<x-filament::modal>` of a mounted action (`action-modal.blade.php`) */
export async function renderActionModal({ host, ref, actionId, args, records }: { host: Host; ref: ActionRef; actionId: string; args: Record<string, any>; records?: Array<string | number> }): Promise<ReactNode> {
    const { action } = ref;
    const ctx: ActionContext = { ...ref.ctx, arguments: args, action };
    const { schema, rc, components } = await buildActionForm(host, { action, ctx });
    const hasSchema = components.length > 0;
    const filled = action.hasForm() ? await action.getFilledFormState(ctx) : null;
    const state = hasSchema ? await fillForm(schema, rc, filled && Object.keys(filled).length ? filled : null) : {};
    const node = hasSchema ? await schema.render(rc) : null;

    const heading = await action.getModalHeading(ctx);
    const description = await action.getModalDescription(ctx);
    const content = await action.getModalContent(ctx);
    const footerContent = await action.getModalFooterContent(ctx);
    const icon = action.getModalIcon();
    const iconColor = await action.getModalIconColor(ctx);
    const alert = action.hasConfirmation();
    const width = action.getModalWidth();
    const alignment = action.getModalAlignment();
    const slideOver = action.isSlideOver();
    const sticky = slideOver;
    const id = `fi-${hash(host.pathname)}-action-0`;
    const headingId = `${id}.heading`;
    const hasDescription = !!description;
    const descriptionId = hasDescription ? `${id}.description` : undefined;

    // footer: submit, extra actions, cancel (reversed when centered)
    const submitColor = ((await action.getColor(ctx)) === 'gray' ? 'primary' : await action.getColor(ctx)) as any;
    type Footer = { key: string; node: ReactNode };
    let footer: Footer[] = [];
    if (action.hasModalSubmitAction()) {
        footer.push({
            key: 'submit',
            node: (
                <ModalSubmitButton key="submit" className={buttonClass({ color: submitColor, size: 'md', extra: 'fi-ac-btn-action' })}>
                    {await action.getModalSubmitActionLabel(ctx)}
                </ModalSubmitButton>
            ),
        });
    }
    for (const extra of await action.getExtraModalFooterActions(ctx)) {
        if (!(await extra.isVisible({ ...ctx, action: extra }))) continue;
        footer.push({
            key: extra.getName(),
            node: (
                <ModalExtraButton key={extra.getName()} className={buttonClass({ color: (await extra.getColor({ ...ctx, action: extra })) as any, size: 'md', extra: 'fi-ac-btn-action' })} args={extra.getArguments()}>
                    {await extra.getLabel({ ...ctx, action: extra })}
                </ModalExtraButton>
            ),
        });
    }
    if (action.hasModalCancelAction()) {
        footer.push({
            key: 'cancel',
            node: (
                <ModalCancelButton key="cancel" className={buttonClass({ color: 'gray', size: 'md', extra: 'fi-ac-btn-action' })}>
                    {action.getModalCancelActionLabel()}
                </ModalCancelButton>
            ),
        });
    }
    const footerAlignment = action.getModalFooterActionsAlignment();
    if (footerAlignment === 'center') footer = footer.reverse();
    const hasFooter = footer.length > 0 || !!footerContent;
    const hasContent = hasSchema || !!content || !!footerContent;
    const hasIcon = !!icon;

    return (
        <ModalFrame
            id={id}
            alert={alert}
            closeByClickingAway={action.shouldCloseModalByClickingAway()}
            ariaLabelledby={heading ? headingId : undefined}
            ariaDescribedby={descriptionId}
            className={cn('fi-modal', 'fi-absolute-positioning-context', 'fi-modal-open', slideOver && 'fi-modal-slide-over', slideOver && 'fi-modal-slide-over-from-end', sticky && 'fi-modal-has-sticky-header', sticky && 'fi-modal-has-sticky-footer', width === 'screen' && 'fi-width-screen')}
        >
            <FormProvider
                formId="mountedActionSchema0"
                initialState={state}
                schema={node}
                target={{ kind: 'action', action: actionId, args, records }}
                className={cn('fi-modal-window', 'fi-modal-window-has-close-btn', hasContent && 'fi-modal-window-has-content', hasFooter && 'fi-modal-window-has-footer', hasIcon && 'fi-modal-window-has-icon', `fi-align-${alignment}`, `fi-width-${width}`)}
            >
                {heading ? (
                    <div className={cn('fi-modal-header', hasIcon && !!heading && !hasDescription && alignment === 'start' && 'fi-vertical-align-center')}>
                        <ModalCloseButton className={iconButtonClass({ color: 'gray', size: 'md', extra: 'fi-modal-close-btn' })} label={trans('filament::components/modal.actions.close.label')}>
                            <Icon icon="heroicon-o-x-mark" size="lg" />
                        </ModalCloseButton>
                        {hasIcon && (
                            <div className="fi-modal-icon-ctn">
                                <div className={cn(colorClass('modalIcon', iconColor), 'fi-modal-icon-bg')}>
                                    <Icon icon={icon!} size="lg" />
                                </div>
                            </div>
                        )}
                        <div>
                            <h2 id={headingId} className="fi-modal-heading">
                                {heading}
                            </h2>
                            {hasDescription && (
                                <p id={descriptionId} className="fi-modal-description">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                ) : null}
                {hasContent && (
                    <div className="fi-modal-content">
                        {content}
                        {hasSchema && <SchemaSlot />}
                        {footerContent}
                    </div>
                )}
                {hasFooter && (
                    <div className={cn('fi-modal-footer', footerAlignment && `fi-align-${footerAlignment}`)}>
                        <div className="fi-modal-footer-actions">{footer.map((f) => f.node)}</div>
                    </div>
                )}
            </FormProvider>
        </ModalFrame>
    );
}

export type { Action };
