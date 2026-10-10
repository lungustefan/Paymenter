'use server';

import { requireAdminUser } from './server/auth';
import { storePublicFile, deletePublicFile } from '@/server/storage';
import { storageUrl } from '@/server/routes';

export interface UploadResult {
    ok: boolean;
    path?: string;
    url?: string;
    name?: string;
    size?: number;
    error?: string;
}

/** The temporary upload endpoint of Livewire (`<input type=file wire:model>`): files go straight to the public disk. */
export async function uploadAdminFile(data: FormData): Promise<UploadResult> {
    await requireAdminUser();
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file' };
    const directory = String(data.get('directory') ?? '').replace(/\.\.+/g, '');
    const preserve = data.get('preserve') === '1';
    const fixedName = data.get('name') ? String(data.get('name')) : undefined;
    const disk = data.get('disk') === 'local' ? 'local' : 'public';
    const relative = await storePublicFile(file, directory, fixedName ?? (preserve ? file.name.replace(/[^\w.\- ]+/g, '_') : undefined), disk);
    return { ok: true, path: relative, url: disk === 'local' ? undefined : storageUrl(relative), name: file.name, size: file.size };
}

export async function deleteAdminFile(relative: string, disk: 'public' | 'local' = 'public'): Promise<boolean> {
    await requireAdminUser();
    return deletePublicFile(relative, disk === 'local' ? 'local' : 'public');
}
