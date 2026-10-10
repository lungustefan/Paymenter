import type { ReactNode } from 'react';
import { FormProvider, SchemaSlot } from '../../forms/runtime';
import { FormActionButton, FormCancelButton, FormSubmitButton } from '../../forms/FormActions';
import { SchemaGrid } from '../../forms/Schema';
import { buttonClass } from '../../ui/classes';
import type { FormTarget } from '../../protocol';
import { gridColumnProps } from '../../ui/grid';

/** `<div class="fi-grid-col"><div class="fi-sc-component">…` - a cell of the page's content schema */
export function ContentCell({ children, hidden, id }: { children?: ReactNode; hidden?: boolean; id?: string }) {
    const col = gridColumnProps({ default: 1 }, {}, {}, !!hidden);
    return (
        <div id={id} className={col.className} style={col.style}>
            {!hidden && <div className="fi-sc-component">{children}</div>}
        </div>
    );
}

/** the content schema of a resource page: a single column grid */
export function ContentGrid({ children }: { children: ReactNode }) {
    return (
        <SchemaGrid columns={{ default: 1 }} gap>
            {children}
        </SchemaGrid>
    );
}

export interface FormFooterAction {
    kind: 'submit' | 'extra' | 'cancel';
    label: string;
    binding?: string;
    args?: Record<string, any>;
    url?: string;
    color?: 'primary' | 'gray';
}

/** `<form id="form">` with the schema in it and the form actions below (`Form::make([EmbeddedSchema::make('form')])->footer([Actions…])`) */
export function PageForm({
    initialState,
    schema,
    target,
    actions,
    formId = 'form',
}: {
    initialState: Record<string, any>;
    schema: ReactNode;
    target: FormTarget;
    actions: FormFooterAction[];
    formId?: string;
}) {
    const cell = (node: ReactNode, key: string) => <ContentCell key={key}>{node}</ContentCell>;
    return (
        <ContentGrid>
            <ContentCell>
                <FormProvider formId={formId} initialState={initialState} schema={schema} target={target} className="fi-sc-form">
                    <ContentGrid>{cell(<SchemaSlot />, 'form')}</ContentGrid>
                    <ContentGrid>
                        {cell(
                            <div id="content.form-actions" className="fi-sc-actions">
                                <div className="fi-ac fi-align-start">
                                    {actions.map((a) =>
                                        a.kind === 'submit' ? (
                                            <FormSubmitButton
                                                key={a.label}
                                                className={buttonClass({
                                                    color: 'primary',
                                                    size: 'md',
                                                    extra: 'fi-ac-btn-action',
                                                })}
                                                binding={a.binding}
                                            >
                                                {a.label}
                                            </FormSubmitButton>
                                        ) : a.kind === 'extra' ? (
                                            <FormActionButton
                                                key={a.label}
                                                className={buttonClass({
                                                    color: 'gray',
                                                    size: 'md',
                                                    extra: 'fi-ac-btn-action',
                                                })}
                                                binding={a.binding}
                                                args={a.args ?? {}}
                                            >
                                                {a.label}
                                            </FormActionButton>
                                        ) : (
                                            <FormCancelButton
                                                key={a.label}
                                                className={buttonClass({
                                                    color: 'gray',
                                                    size: 'md',
                                                    extra: 'fi-ac-btn-action',
                                                })}
                                                url={a.url ?? '/admin'}
                                            >
                                                {a.label}
                                            </FormCancelButton>
                                        ),
                                    )}
                                </div>
                            </div>,
                            'actions',
                        )}
                    </ContentGrid>
                </FormProvider>
            </ContentCell>
        </ContentGrid>
    );
}
