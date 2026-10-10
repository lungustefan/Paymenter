'use client';

import { useEffect, useRef } from 'react';

/** Port of components/easymde-editor.blade.php: EasyMDE on a textarea, value reported through `onChange`. */
export function EasyMdeEditor({ id = 'editor', placeholder, onChange, resetKey }: { id?: string; placeholder?: string; onChange: (value: string) => void; resetKey?: number }) {
    const el = useRef<HTMLTextAreaElement>(null);
    const editor = useRef<any>(null);
    const handler = useRef(onChange);
    handler.current = onChange;

    useEffect(() => {
        let disposed = false;
        (async () => {
            const { default: EasyMDE } = await import('easymde');
            if (disposed || !el.current) return;
            const instance = new EasyMDE({
                element: el.current,
                spellChecker: false,
                previewImagesInEditor: true,
                autoDownloadFontAwesome: false,
                status: [{ className: 'upload-image', defaultValue: '' }] as any,
                toolbar: [
                    { name: 'bold', action: EasyMDE.toggleBold },
                    { name: 'italic', action: EasyMDE.toggleItalic },
                    { name: 'strikethrough', action: EasyMDE.toggleStrikethrough },
                    { name: 'link', action: EasyMDE.drawLink },
                    '|',
                    { name: 'heading', action: EasyMDE.toggleHeadingSmaller },
                    '|',
                    { name: 'quote', action: EasyMDE.toggleBlockquote },
                    { name: 'code', action: EasyMDE.toggleCodeBlock },
                    { name: 'unordered-list', action: EasyMDE.toggleUnorderedList },
                    { name: 'ordered-list', action: EasyMDE.toggleOrderedList },
                    '|',
                    { name: 'undo', action: EasyMDE.undo },
                    { name: 'redo', action: EasyMDE.redo },
                ] as any,
            });
            instance.codemirror.on('change', () => handler.current(instance.value()));
            editor.current = instance;
        })();
        return () => {
            disposed = true;
            editor.current?.toTextArea?.();
            editor.current = null;
        };
    }, []);

    // `$wire.on('saved')`: clear the editor after a successful submit
    useEffect(() => {
        if (resetKey === undefined || resetKey === 0) return;
        editor.current?.clearAutosavedValue?.();
        editor.current?.value('');
    }, [resetKey]);

    return (
        <div>
            {/* loaded after the theme stylesheet, like the original easymde-entry asset */}
            <link rel="stylesheet" href="/build/vendor/easymde.css" precedence="default" />
            <textarea id={id} ref={el} placeholder={placeholder}></textarea>
        </div>
    );
}
