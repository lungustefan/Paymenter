import fs from 'node:fs';
import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, setPath, type RenderContext } from '../Component';
import { FileUploadControl, type ExistingFile } from '../controls-upload';
import { diskPath, mimeFor } from '@/server/storage';
import { storageUrl } from '@/server/routes';
import { trans } from '../../context';
import type { Fn } from '../../core/evaluate';
import type { Rule } from '@/server/validation';

/** Filament\Forms\Components\FileUpload (FilePond) */
export class FileUpload extends Field {
    protected _multiple: Fn<boolean> = false;
    protected _accepted: string[] = [];
    protected _maxSize?: number;
    protected _minSize?: number;
    protected _maxFiles?: number;
    protected _directory: Fn<string> = '';
    protected _preserveFilenames = false;
    protected _fileName?: (ctx: any) => string;
    protected _previewable = true;
    protected _reorderable = false;
    protected _imagePreviewHeight?: number;
    protected _panelLayout?: string;
    protected _avatar = false;
    protected _image = false;
    protected _downloadable = false;
    protected _openable = false;
    protected _alignment?: string;
    protected _private = false;
    protected _namesIn?: string;

    multiple(v: Fn<boolean> = true) { this._multiple = v; return this; }
    acceptedFileTypes(v: string[]) { this._accepted = v; return this; }
    image() { this._image = true; if (!this._accepted.length) this._accepted = ['image/*']; return this; }
    avatar() { this._avatar = true; return this.image(); }
    maxSize(v: number) { this._maxSize = v; return this; }
    minSize(v: number) { this._minSize = v; return this; }
    maxFiles(v: number) { this._maxFiles = v; return this; }
    directory(v: Fn<string>) { this._directory = v; return this; }
    disk(_v: string) { return this; }
    visibility(v: string) { this._private = v === 'private'; return this; }
    /** `storeFileNamesIn('attachment_names')` */
    storeFileNamesIn(v: string) { this._namesIn = v; return this; }
    preserveFilenames(v = true) { this._preserveFilenames = v; return this; }
    getUploadedFileNameForStorageUsing(fn: (ctx: any) => string) { this._fileName = fn; return this; }
    previewable(v = true) { this._previewable = v; return this; }
    reorderable(v = true) { this._reorderable = v; return this; }
    imagePreviewHeight(v: number | string) { this._imagePreviewHeight = Number(v); return this; }
    panelLayout(v: string) { this._panelLayout = v; return this; }
    downloadable(v = true) { this._downloadable = v; return this; }
    openable(v = true) { this._openable = v; return this; }
    deletable(_v = true) { return this; }
    alignment(v: string) { this._alignment = v; return this; }
    imageEditor(_v = true) { return this; }
    imageResizeMode(_v: string) { return this; }
    imageCropAspectRatio(_v: string) { return this; }
    imageResizeTargetWidth(_v: string) { return this; }
    imageResizeTargetHeight(_v: string) { return this; }

    protected override emptyState(rc: RenderContext) {
        return this._multiple === true || (typeof this._multiple === 'function' && false) ? [] : null;
    }

    private async isMultiple(rc: RenderContext) {
        return (await this.ev(this._multiple, rc)) === true;
    }

    override async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true) {
        await super.hydrateDefaults(rc, state, applyDefaults);
        const path = this.getStatePath(rc);
        const value = getPath(state, path);
        // an empty string default (config inputs) is no file
        if (value === '') setPath(state, path, (await this.isMultiple(rc)) ? [] : null);
        else if ((await this.isMultiple(rc)) && value === null) setPath(state, path, []);
        else if (!(await this.isMultiple(rc)) && Array.isArray(value)) setPath(state, path, value[0] ?? null);
    }

    protected override implicitRules(): Rule[] {
        return [];
    }

    private async existingFiles(rc: RenderContext): Promise<ExistingFile[]> {
        const value = getPath(rc.state, this.getStatePath(rc));
        const list: string[] = (Array.isArray(value) ? value : value ? [value] : []).filter((v: any) => typeof v === 'string');
        const out: ExistingFile[] = [];
        for (const rel of list) {
            const full = diskPath(this._private ? 'local' : 'public', rel);
            let size = 0;
            if (full && fs.existsSync(full)) size = fs.statSync(full).size;
            else continue;
            out.push({ path: rel, name: rel.split('/').pop() ?? rel, size, type: mimeFor(rel), url: this._private ? '' : storageUrl(rel) });
        }
        return out;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const align = this._alignment ? `fi-align-${this._alignment}` : 'fi-align-start';
        const control = (
            <FileUploadControl
                path={path}
                id={id}
                labelId={`${id}-label`}
                existing={await this.existingFiles(rc)}
                multiple={await this.isMultiple(rc)}
                disabled={await this.isDisabled(rc)}
                acceptedFileTypes={this._accepted}
                maxSize={this._maxSize ?? null}
                minSize={this._minSize ?? null}
                maxFiles={this._maxFiles ?? null}
                directory={String((await this.ev(this._directory, rc)) ?? '')}
                preserveFilenames={this._preserveFilenames}
                fileName={this._fileName ? this._fileName(this.evalCtx(rc)) : null}
                previewable={this._previewable}
                reorderable={this._reorderable}
                imagePreviewHeight={this._imagePreviewHeight ?? null}
                panelLayout={this._panelLayout ?? null}
                live={this._live}
                alignClass={align}
                isAvatar={this._avatar}
                disk={this._private ? 'local' : 'public'}
                namesPath={this._namesIn}
                messages={{ uploading: trans('filament-forms::components.file_upload.uploading_message') }}
            />
        );
        return this.wrap(rc, control, { labelTag: 'div' });
    }
}
