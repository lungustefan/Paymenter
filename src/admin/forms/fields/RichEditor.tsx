import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { RichEditorControl } from '../controls-rich';
import { trans } from '../../context';
import type { Fn } from '../../core/evaluate';

const DEFAULT_TOOLBAR: string[][] = [
    ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'],
    ['h2', 'h3'],
    ['alignStart', 'alignCenter', 'alignEnd'],
    ['blockquote', 'codeBlock', 'bulletList', 'orderedList'],
    ['table', 'attachFiles'],
    ['undo', 'redo'],
];

/** Filament\Forms\Components\RichEditor (TipTap) */
export class RichEditor extends Field {
    protected _toolbar: string[][] | null = null;
    protected _disabledButtons: string[] = [];
    protected _disableAll = false;
    protected _directory = '';
    protected _maxLength?: Fn<number | null>;
    protected _minLength?: Fn<number | null>;

    toolbarButtons(v: Array<string | string[]>) {
        this._toolbar = v.map((g) => (Array.isArray(g) ? g : [g]));
        return this;
    }
    disableToolbarButtons(v: string[]) { this._disabledButtons = v; return this; }
    disableAllToolbarButtons(v = true) { this._disableAll = v; return this; }
    fileAttachmentsDirectory(v: string) { this._directory = v; return this; }
    fileAttachmentsDisk(_v: string) { return this; }
    fileAttachmentsVisibility(_v: string) { return this; }
    maxLength(v: Fn<number | null>) { this._maxLength = v; return this; }
    minLength(v: Fn<number | null>) { this._minLength = v; return this; }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const toolbar = this._disableAll
            ? []
            : (this._toolbar ?? DEFAULT_TOOLBAR).map((g) => g.filter((b) => !this._disabledButtons.includes(b))).filter((g) => g.length);
        const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        const maxSize = 12288;
        const control = (
            <RichEditorControl
                path={path}
                id={id}
                labelId={`${id}-label`}
                label={(await this.getLabel(rc)) ?? ''}
                disabled={await this.isDisabled(rc)}
                placeholder={(await this.ev(this._placeholder, rc)) ?? undefined}
                toolbar={toolbar}
                live={this._live}
                acceptedFileTypes={types}
                maxFileSize={maxSize}
                directory={this._directory}
                messages={{
                    uploading: trans('filament-forms::components.rich_editor.uploading_file_message'),
                    invalidType: trans('filament-forms::components.rich_editor.file_attachments_accepted_file_types_message', { values: types.join(', ') }),
                    tooLarge: trans('filament-forms::components.rich_editor.file_attachments_max_size_message', { max: maxSize }),
                    linkPrompt: trans('filament-forms::components.rich_editor.actions.link.modal.form.url.label'),
                }}
                className=""
            />
        );
        return this.wrap(rc, await this.wrapInput(rc, control, 'fi-fo-rich-editor'), { labelTag: 'div' });
    }
}
