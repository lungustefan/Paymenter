'use client';

import { useRef, useState } from 'react';
import { useT } from './Providers';
import { cn } from './cn';

/** The drag and drop attachment picker of the ticket forms (Alpine `selectedFiles`). */
export function FileDropzone({ files, onChange, error }: { files: File[]; onChange: (files: File[]) => void; error?: string[] }) {
    const { t } = useT();
    const input = useRef<HTMLInputElement>(null);
    const [drop, setDrop] = useState(false);

    const setFiles = (list: FileList | File[] | null) => {
        onChange(list ? Array.from(list) : []);
    };

    return (
        <div>
            <div
                className={cn('flex justify-center rounded-lg bg-background-secondary border border-dashed border-neutral px-6 py-2', drop && 'bg-background-secondary/50')}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDrop(true);
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    setDrop(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDrop(false);
                    if (e.dataTransfer.files.length > 0) setFiles(e.dataTransfer.files);
                }}
            >
                {files.length === 0 ? (
                    <div className="text-center">
                        <div className="flex text-sm text-primary-100">
                            <label htmlFor="attachments" className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80">
                                <span>{t('ticket.upload_attachments')}</span>
                            </label>
                            <p className="pl-1 text-base/80">{t('ticket.or_drag_and_drop')}</p>
                        </div>
                        <p className="text-xs/5 text-base/50">{t('ticket.files_max')}</p>
                    </div>
                ) : (
                    <div className="mt-2">
                        <h4 className="text-sm font-semibold">{t('ticket.selected_files')}:</h4>
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                            {files.map((file) => (
                                <div key={file.name} className="text-sm rounded-md bg-gray-100 flex items-center gap-2 dark:bg-gray-800 p-1 py-0 w-fit">
                                    <span className="flex-1">{file.name}</span>
                                    <button
                                        type="button"
                                        className="text-red-500 hover:text-red-700 text-lg h-fit"
                                        onClick={() => {
                                            setFiles(files.filter((f) => f !== file));
                                            if (input.current) input.current.value = '';
                                        }}
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <input id="attachments" type="file" multiple name="attachments[]" className="sr-only" ref={input} onChange={(e) => setFiles(e.target.files)} />
            {error?.[0] && <p className="text-sm text-red-500 mt-1">{error[0]}</p>}
        </div>
    );
}
