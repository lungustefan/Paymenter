'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { useFieldValue, useInvalidClass } from './runtime';
import { richIcons } from '../ui/rich-icons.generated';
import { useAdminActions } from '../actions/client';
import { uploadAdminFile } from '../upload';
import { cn } from '@themes/default/components/cn';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

function RichIcon({ name }: { name: string }) {
    const icon = richIcons[name];
    if (!icon) return null;
    // `stroke-width` -> `strokeWidth`
    const extra = Object.fromEntries(Object.entries(icon.extra).map(([k, v]) => [k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()), v]));
    return <svg className="fi-icon fi-size-md" xmlns="http://www.w3.org/2000/svg" viewBox={icon.viewBox} fill={icon.fill} {...extra} aria-hidden="true" data-slot="icon" dangerouslySetInnerHTML={{ __html: icon.inner }} />;
}

interface Button {
    name: string;
    label: string;
    icon: string;
    /** `isActive()` arguments */
    active?: (e: Editor) => boolean;
    run: (e: Editor, helpers: { link: () => void; attach: () => void; table: () => void }) => void;
    }

const BUTTONS: Record<string, Omit<Button, 'name'>> = {
    bold: { label: 'Bold', icon: 'Bold', active: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
    italic: { label: 'Italic', icon: 'Italic', active: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
    underline: { label: 'Underline', icon: 'Underline', active: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
    strike: { label: 'Strikethrough', icon: 'Strikethrough', active: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
    subscript: { label: 'Subscript', icon: 'Subscript', active: (e) => e.isActive('subscript'), run: (e) => e.chain().focus().toggleSubscript().run() },
    superscript: { label: 'Superscript', icon: 'Superscript', active: (e) => e.isActive('superscript'), run: (e) => e.chain().focus().toggleSuperscript().run() },
    link: { label: 'Link', icon: 'Link', active: (e) => e.isActive('link'), run: (_e, h) => h.link() },
    h1: { label: 'Heading 1', icon: 'Heading 2', active: (e) => e.isActive('heading', { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    h2: { label: 'Heading 2', icon: 'Heading 2', active: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    h3: { label: 'Heading 3', icon: 'Heading 3', active: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    alignStart: { label: 'Align start', icon: 'Align start', active: (e) => e.isActive({ textAlign: 'start' }), run: (e) => e.chain().focus().setTextAlign('start').run() },
    alignCenter: { label: 'Align center', icon: 'Align center', active: (e) => e.isActive({ textAlign: 'center' }), run: (e) => e.chain().focus().setTextAlign('center').run() },
    alignEnd: { label: 'Align end', icon: 'Align end', active: (e) => e.isActive({ textAlign: 'end' }), run: (e) => e.chain().focus().setTextAlign('end').run() },
    blockquote: { label: 'Blockquote', icon: 'Blockquote', active: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
    codeBlock: { label: 'Code block', icon: 'Code block', active: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
    bulletList: { label: 'Bullet list', icon: 'Bullet list', active: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
    orderedList: { label: 'Numbered list', icon: 'Numbered list', active: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
    table: { label: 'Table', icon: 'Table', active: (e) => e.isActive('table'), run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    attachFiles: { label: 'Attach files', icon: 'Attach files', active: (e) => e.isActive('image'), run: (_e, h) => h.attach() },
    undo: { label: 'Undo', icon: 'Undo', run: (e) => e.chain().focus().undo().run() },
    redo: { label: 'Redo', icon: 'Redo', run: (e) => e.chain().focus().redo().run() },
};

const TABLE_BUTTONS: Array<{ label: string; icon: string; run: (e: Editor) => void }> = [
    { label: 'Add column before', icon: 'Add column before', run: (e) => e.chain().focus().addColumnBefore().run() },
    { label: 'Add column after', icon: 'Add column after', run: (e) => e.chain().focus().addColumnAfter().run() },
    { label: 'Delete column', icon: 'Delete column', run: (e) => e.chain().focus().deleteColumn().run() },
    { label: 'Add row above', icon: 'Add row above', run: (e) => e.chain().focus().addRowBefore().run() },
    { label: 'Add row below', icon: 'Add row below', run: (e) => e.chain().focus().addRowAfter().run() },
    { label: 'Delete row', icon: 'Delete row', run: (e) => e.chain().focus().deleteRow().run() },
    { label: 'Merge cells', icon: 'Merge cells', run: (e) => e.chain().focus().mergeCells().run() },
    { label: 'Split cell', icon: 'Split cell', run: (e) => e.chain().focus().splitCell().run() },
    { label: 'Toggle header row', icon: 'Toggle header row', run: (e) => e.chain().focus().toggleHeaderRow().run() },
    { label: 'Toggle header cell', icon: 'Toggle header cell', run: (e) => e.chain().focus().toggleHeaderCell().run() },
    { label: 'Delete table', icon: 'Delete table', run: (e) => e.chain().focus().deleteTable().run() },
];

/** `richEditorFormComponent`: the TipTap editor of Filament's rich editor, with its toolbar */
export function RichEditorControl({
    path,
    id,
    labelId,
    label,
    disabled,
    placeholder,
    toolbar,
    live,
    acceptedFileTypes,
    maxFileSize,
    directory,
    messages,
    className,
}: {
    path: string;
    id: string;
    labelId: string;
    label: string;
    disabled?: boolean;
    placeholder?: string;
    toolbar: string[][];
    live?: Live;
    acceptedFileTypes: string[];
    maxFileSize: number;
    directory: string;
    messages: { uploading: string; invalidType: string; tooLarge: string; linkPrompt: string };
    className: string;
}) {
    const [value, setValue] = useFieldValue(path);
    const invalid = useInvalidClass(path);
    const [, force] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [fileMessage, setFileMessage] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const { dispatch } = useAdminActions();
    void dispatch;
    const last = useRef<string | null>(typeof value === 'string' ? value : null);

    const editor = useEditor({
        immediatelyRender: false,
        editable: !disabled,
        content: typeof value === 'string' ? value : '',
        extensions: [
            StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
            Subscript,
            Superscript,
            TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['start', 'center', 'end', 'justify'], defaultAlignment: 'start' }),
            Image,
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
        ],
        editorProps: { attributes: { role: 'textbox', 'aria-label': label, translate: 'no', tabindex: '0' } },
        onUpdate: ({ editor: e }) => {
            const html = e.isEmpty ? null : e.getHTML();
            last.current = html;
            setValue(html, live ? { ...live } : undefined);
        },
        onTransaction: () => force((n) => n + 1),
    });

    // state changed from the outside (a live refresh, reset)
    useEffect(() => {
        if (!editor) return;
        const incoming = typeof value === 'string' ? value : null;
        if (incoming !== last.current) {
            last.current = incoming;
            editor.commands.setContent(incoming ?? '', { emitUpdate: false });
        }
    }, [value, editor]);

    const helpers = useMemo(
        () => ({
            link: () => {
                if (!editor) return;
                const previous = editor.getAttributes('link').href as string | undefined;
                const url = window.prompt(messages.linkPrompt, previous ?? 'https://');
                if (url === null) return;
                if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
                else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            },
            attach: () => fileInput.current?.click(),
            table: () => undefined,
        }),
        [editor, messages.linkPrompt],
    );

    const onFile = async (file: File | undefined) => {
        if (!file || !editor) return;
        setFileMessage('');
        if (acceptedFileTypes.length && !acceptedFileTypes.includes(file.type)) return setFileMessage(messages.invalidType);
        if (file.size > maxFileSize * 1024) return setFileMessage(messages.tooLarge);
        setUploading(true);
        try {
            const data = new FormData();
            data.append('file', file);
            data.append('directory', directory);
            const result = await uploadAdminFile(data);
            if (result.url) editor.chain().focus().setImage({ src: result.url }).run();
        } finally {
            setUploading(false);
        }
    };

    return (
        <div aria-labelledby={labelId} id={id} role="group" className={cn(uploading && 'fi-fo-rich-editor-uploading-file') || undefined}>
            {!disabled && (
                <div className="fi-fo-rich-editor-toolbar" aria-label="Editor toolbar">
                    {toolbar.map((group, gi) => (
                        <div key={gi} className="fi-fo-rich-editor-toolbar-group">
                            {group.map((name) => {
                                const b = BUTTONS[name];
                                if (!b) return null;
                                const active = editor && b.active ? b.active(editor) : false;
                                const isToggle = !!b.active;
                                return (
                                    <button
                                        key={name}
                                        tabIndex={-1}
                                        type="button"
                                        aria-label={b.label}
                                        title={b.label}
                                        aria-pressed={isToggle ? (active ? 'true' : 'false') : undefined}
                                        className={cn('fi-fo-rich-editor-tool', active && 'fi-active')}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => editor && b.run(editor, helpers)}
                                    >
                                        <RichIcon name={b.icon} />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
            {uploading && (
                <div className="fi-fo-rich-editor-uploading-file-message">
                    <span>{messages.uploading}</span>
                </div>
            )}
            {!uploading && fileMessage && (
                <div className="fi-fo-rich-editor-file-validation-message">
                    <span>{fileMessage}</span>
                </div>
            )}
            <div className="fi-fo-rich-editor-main">
                <div className={cn('fi-fo-rich-editor-content fi-prose', invalid && 'fi-invalid')}>
                    {editor?.isActive('table') && !disabled && (
                        <div className="fi-fo-rich-editor-floating-toolbar fi-not-prose">
                            {TABLE_BUTTONS.map((b) => (
                                <button key={b.label} tabIndex={-1} type="button" aria-label={b.label} title={b.label} className="fi-fo-rich-editor-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => b.run(editor)}>
                                    <RichIcon name={b.icon} />
                                </button>
                            ))}
                        </div>
                    )}
                    <EditorContent editor={editor} className={className || undefined} />
                </div>
            </div>
            <input ref={fileInput} type="file" hidden accept={acceptedFileTypes.join(',')} onChange={(e) => void onFile(e.target.files?.[0]).then(() => (e.target.value = ''))} />
        </div>
    );
}
