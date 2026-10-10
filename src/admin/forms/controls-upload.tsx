'use client';

import { useEffect, useRef, useState } from 'react';
import { useFieldValue, useInvalidClass } from './runtime';
import { uploadAdminFile, deleteAdminFile } from '../upload';
import { cn } from '@themes/default/components/cn';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

export interface ExistingFile {
    path: string;
    name: string;
    size: number;
    type: string;
    url: string;
}

/** `fileUploadFormComponent`: FilePond bound to a state path; files are uploaded to the public disk right away */
export function FileUploadControl({
    path,
    id,
    labelId,
    existing,
    multiple,
    disabled,
    acceptedFileTypes,
    maxSize,
    minSize,
    maxFiles,
    directory,
    preserveFilenames,
    fileName,
    previewable,
    reorderable,
    imagePreviewHeight,
    panelLayout,
    live,
    alignClass,
    isAvatar,
    messages,
}: {
    path: string;
    id: string;
    labelId: string;
    existing: ExistingFile[];
    multiple: boolean;
    disabled?: boolean;
    acceptedFileTypes: string[];
    maxSize: number | null;
    minSize: number | null;
    maxFiles: number | null;
    directory: string;
    preserveFilenames: boolean;
    fileName: string | null;
    previewable: boolean;
    reorderable: boolean;
    imagePreviewHeight: number | null;
    panelLayout: string | null;
    live?: Live;
    alignClass: string;
    isAvatar: boolean;
    messages: { uploading: string };
}) {
    const [value, setValue] = useFieldValue(path);
    const invalid = useInvalidClass(path);
    const input = useRef<HTMLInputElement>(null);
    const pondRef = useRef<any>(null);
    const [error, setError] = useState('');
    const valueRef = useRef(value);
    valueRef.current = value;
    const setter = useRef(setValue);
    setter.current = setValue;

    useEffect(() => {
        let destroyed = false;
        let pond: any;
        (async () => {
            const FilePond = await import('filepond');
            const [{ default: ImagePreview }, { default: ValidateType }, { default: ValidateSize }] = await Promise.all([import('filepond-plugin-image-preview'), import('filepond-plugin-file-validate-type'), import('filepond-plugin-file-validate-size')]);
            FilePond.registerPlugin(ImagePreview, ValidateType, ValidateSize);
            if (destroyed || !input.current) return;

            const byPath = new Map(existing.map((f) => [f.path, f]));
            const sync = () => {
                const paths = (pond.getFiles() as any[])
                    .filter((f) => f.status === 5 || f.origin === 1 || f.origin === 3)
                    .map((f) => (f.serverId as string) || (typeof f.source === 'string' ? f.source : null))
                    .filter(Boolean) as string[];
                setter.current(multiple ? paths : (paths[0] ?? null), live ? { ...live, debounce: 0 } : undefined);
            };

            pond = FilePond.create(input.current, {
                allowMultiple: multiple,
                allowReorder: reorderable,
                allowPaste: true,
                allowImagePreview: previewable,
                credits: false as any,
                disabled: !!disabled,
                acceptedFileTypes: acceptedFileTypes.length ? acceptedFileTypes : undefined,
                maxFileSize: maxSize ? `${maxSize}KB` : null,
                minFileSize: minSize ? `${minSize}KB` : null,
                maxFiles: multiple ? maxFiles : 1,
                itemInsertLocation: 'after',
                imagePreviewHeight: imagePreviewHeight ?? undefined,
                stylePanelLayout: (panelLayout ?? (isAvatar ? 'compact circle' : 'compact')) as any,
                styleButtonRemoveItemPosition: 'left',
                styleButtonProcessItemPosition: 'right',
                styleLoadIndicatorPosition: 'right',
                styleProgressIndicatorPosition: 'right',
                labelFileProcessing: messages.uploading,
                files: existing.map((f) => ({ source: f.path, options: { type: 'local', file: { name: f.name, size: f.size, type: f.type }, metadata: { url: f.url } } })) as any,
                server: {
                    load: (source: string, load: any, error: any) => {
                        const known = byPath.get(source);
                        fetch(known?.url ?? `/storage/${source}`)
                            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('load'))))
                            .then(load)
                            .catch(() => error('Error during load'));
                    },
                    process: (_field: string, file: File, _meta: any, load: (id: string) => void, error: (msg: string) => void, progress: (...a: any[]) => void) => {
                        const data = new FormData();
                        data.append('file', file, file.name);
                        data.append('directory', directory);
                        if (preserveFilenames) data.append('preserve', '1');
                        if (fileName) data.append('name', fileName);
                        progress(false, 0, 1);
                        uploadAdminFile(data)
                            .then((r) => (r.ok && r.path ? load(r.path) : error(r.error ?? 'Upload failed')))
                            .catch(() => error('Upload failed'));
                        return { abort: () => undefined };
                    },
                    revert: (uniqueFileId: string, load: () => void) => {
                        void deleteAdminFile(uniqueFileId).finally(load);
                    },
                    remove: (_source: string, load: () => void) => load(),
                } as any,
                onprocessfile: (err: any) => {
                    if (err) setError(err.body ?? 'Upload failed');
                    else {
                        setError('');
                        sync();
                    }
                },
                onremovefile: () => sync(),
                onreorderfiles: () => sync(),
                onerror: (e: any) => setError(e?.body ?? ''),
                onaddfile: (err: any) => {
                    if (err) setError(err.body ?? '');
                },
            } as any);
            pondRef.current = pond;
        })();
        return () => {
            destroyed = true;
            if (pond) pond.destroy();
        };
        // the pond is created once; later state changes come from the pond itself
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div aria-labelledby={labelId} id={id} role="group" className={cn('fi-fo-file-upload', alignClass, invalid && 'fi-invalid')}>
            <div className="fi-fo-file-upload-input-ctn">
                <input ref={input} aria-labelledby={labelId} type="file" multiple={multiple} disabled={disabled} />
            </div>
            {error && (
                <div role="alert" className="fi-fo-file-upload-error-message">
                    {error}
                </div>
            )}
        </div>
    );
}
