'use client';

import { useEffect, useRef } from 'react';
import { useFieldValue } from './runtime';
import { uploadAdminFile } from '../upload';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

/** `markdownEditorFormComponent`: EasyMDE bound to a state path */
export function MarkdownEditorControl({
    path,
    id,
    labelId,
    label,
    disabled,
    placeholder,
    minHeight,
    maxHeight,
    toolbar,
    titles,
    attachmentsDirectory,
    live,
}: {
    path: string;
    id: string;
    labelId: string;
    label: string;
    disabled?: boolean;
    placeholder?: string;
    minHeight: string;
    maxHeight?: string | null;
    toolbar: string[][];
    titles: Record<string, string>;
    attachmentsDirectory: string;
    live?: Live;
}) {
    const [value, setValue] = useFieldValue(path);
    const area = useRef<HTMLTextAreaElement>(null);
    const editorRef = useRef<any>(null);
    const latest = useRef<string>(typeof value === 'string' ? value : '');
    const setter = useRef(setValue);
    setter.current = setValue;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const EasyMDE = (await import('easymde')).default;
            if (cancelled || !area.current) return;
            // modals animate in: let the layout settle so CodeMirror measures correctly
            if (area.current.closest('.fi-modal')) await new Promise((r) => setTimeout(r, 300));
            if (cancelled || !area.current) return;

            const buttons: Record<string, any> = {
                bold: { name: 'bold', action: EasyMDE.toggleBold, title: titles.bold },
                italic: { name: 'italic', action: EasyMDE.toggleItalic, title: titles.italic },
                strike: { name: 'strikethrough', action: EasyMDE.toggleStrikethrough, title: titles.strike },
                link: { name: 'link', action: EasyMDE.drawLink, title: titles.link },
                heading: { name: 'heading', action: EasyMDE.toggleHeadingSmaller, title: titles.heading },
                blockquote: { name: 'quote', action: EasyMDE.toggleBlockquote, title: titles.blockquote },
                codeBlock: { name: 'code', action: EasyMDE.toggleCodeBlock, title: titles.code_block },
                bulletList: { name: 'unordered-list', action: EasyMDE.toggleUnorderedList, title: titles.bullet_list },
                orderedList: { name: 'ordered-list', action: EasyMDE.toggleOrderedList, title: titles.ordered_list },
                table: { name: 'table', action: EasyMDE.drawTable, title: titles.table },
                undo: { name: 'undo', action: EasyMDE.undo, title: titles.undo },
                redo: { name: 'redo', action: EasyMDE.redo, title: titles.redo },
                attachFiles: { name: 'upload-image', title: titles.attach_files },
            };
            const items: any[] = [];
            for (const group of toolbar) {
                for (const name of group) if (buttons[name]) items.push(buttons[name]);
                if (group.length > 0) items.push('|');
            }
            if (items[items.length - 1] === '|') items.pop();

            const editor = new EasyMDE({
                autoDownloadFontAwesome: false,
                autoRefresh: true,
                autoSave: undefined,
                element: area.current,
                initialValue: latest.current,
                maxHeight: maxHeight ?? undefined,
                minHeight,
                placeholder,
                previewImagesInEditor: true,
                spellChecker: false,
                status: ['upload-image'],
                uploadImage: toolbar.some((g) => g.includes('attachFiles')),
                imageAccept: 'image/png, image/jpeg, image/gif, image/avif, image/webp',
                imageUploadFunction: (file: File, onSuccess: (url: string) => void, onError: (message: string) => void) => {
                    const data = new FormData();
                    data.append('file', file, file.name);
                    data.append('directory', attachmentsDirectory);
                    uploadAdminFile(data)
                        .then((r) => (r.ok && r.url ? onSuccess(r.url) : onError(r.error ?? 'Upload failed')))
                        .catch(() => onError('Upload failed'));
                },
                imageTexts: { sbInit: '', sbOnDragEnter: '', sbOnDrop: '', sbProgress: '', sbOnUploaded: '', sizeUnits: ',,' },
                toolbar: items.length ? items : false,
            } as any);
            editorRef.current = editor;
            const input = editor.codemirror.getInputField();
            if (input && label) input.setAttribute('aria-label', label);
            if (disabled) editor.codemirror.setOption('readOnly', 'nocursor');
            editor.codemirror.on('change', (_cm: any, change: any) => {
                if (change.origin === 'setValue') return;
                latest.current = editor.value();
                setter.current(latest.current === '' ? null : latest.current, live && !live.onBlur ? { debounce: live.debounce ?? 300 } : undefined);
            });
            if (live && live.onBlur) editor.codemirror.on('blur', () => setter.current(latest.current === '' ? null : latest.current, { ...live }));
        })();
        return () => {
            cancelled = true;
            editorRef.current?.toTextArea?.();
            editorRef.current = null;
        };
        // created once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // state changed from the outside
    useEffect(() => {
        const incoming = typeof value === 'string' ? value : '';
        if (editorRef.current && incoming !== editorRef.current.value()) {
            latest.current = incoming;
            editorRef.current.value(incoming);
        } else latest.current = incoming;
    }, [value]);

    return (
        <div aria-labelledby={labelId} id={id} role="group">
            <textarea ref={area} defaultValue={typeof value === 'string' ? value : ''} />
        </div>
    );
}
