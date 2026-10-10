import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { MarkdownEditorControl } from '../controls-markdown';
import { trans } from '../../context';
import type { Fn } from '../../core/evaluate';

const DEFAULT_TOOLBAR: string[][] = [['bold', 'italic', 'strike', 'link'], ['heading'], ['blockquote', 'codeBlock', 'bulletList', 'orderedList'], ['table', 'attachFiles'], ['undo', 'redo']];

/** Filament\Forms\Components\MarkdownEditor (EasyMDE) */
export class MarkdownEditor extends Field {
    protected _toolbar: string[][] | null = null;
    protected _disabledButtons: string[] = [];
    protected _disableAll = false;
    protected _minHeight: Fn<string | null> = '11.25rem';
    protected _maxHeight: Fn<string | null> = null;

    toolbarButtons(v: Array<string | string[]>) { this._toolbar = v.map((g) => (Array.isArray(g) ? g : [g])); return this; }
    disableToolbarButtons(v: string[]) { this._disabledButtons = v; return this; }
    disableAllToolbarButtons(v: Fn<boolean> | boolean = true) { this._disableAll = v === true; return this; }
    minHeight(v: Fn<string | null>) { this._minHeight = v; return this; }
    maxHeight(v: Fn<string | null>) { this._maxHeight = v; return this; }
    protected _attachmentsDirectory: string = 'attachments';
    fileAttachmentsDisk(_v: string) { return this; }
    fileAttachmentsDirectory(v: string) { this._attachmentsDirectory = v; return this; }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const toolbar = this._disableAll ? [] : (this._toolbar ?? DEFAULT_TOOLBAR).map((g) => g.filter((b) => !this._disabledButtons.includes(b))).filter((g) => g.length);
        const label = (await this.getLabel(rc)) ?? '';
        const control = (
            <MarkdownEditorControl
                path={path}
                id={id}
                labelId={`${id}-label`}
                label={label}
                disabled={await this.isDisabled(rc)}
                placeholder={(await this.ev(this._placeholder, rc)) ?? undefined}
                minHeight={(await this.ev(this._minHeight, rc)) ?? '11.25rem'}
                maxHeight={(await this.ev(this._maxHeight, rc)) ?? null}
                toolbar={toolbar}
                titles={{
                    bold: trans('filament-forms::components.markdown_editor.tools.bold'),
                    italic: trans('filament-forms::components.markdown_editor.tools.italic'),
                    strike: trans('filament-forms::components.markdown_editor.tools.strike'),
                    link: trans('filament-forms::components.markdown_editor.tools.link'),
                    heading: trans('filament-forms::components.markdown_editor.tools.heading'),
                    blockquote: trans('filament-forms::components.markdown_editor.tools.blockquote'),
                    code_block: trans('filament-forms::components.markdown_editor.tools.code_block'),
                    bullet_list: trans('filament-forms::components.markdown_editor.tools.bullet_list'),
                    ordered_list: trans('filament-forms::components.markdown_editor.tools.ordered_list'),
                    table: trans('filament-forms::components.markdown_editor.tools.table'),
                    undo: trans('filament-forms::components.markdown_editor.tools.undo'),
                    redo: trans('filament-forms::components.markdown_editor.tools.redo'),
                    attach_files: trans('filament-forms::components.markdown_editor.tools.attach_files'),
                }}
                attachmentsDirectory={this._attachmentsDirectory}
                live={this._live}
            />
        );
        return this.wrap(rc, await this.wrapInput(rc, control, 'fi-fo-markdown-editor'), { labelTag: 'div' });
    }
}
