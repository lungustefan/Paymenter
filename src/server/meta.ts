import type { Metadata } from 'next';
import { config } from './config';

/** `<title>`, og:* and description tags the layout derives from `$title`, `$description`, `$image`. */
export function pageMeta(title?: string | null, description?: string | null, image?: string | null): Metadata {
    const app = config<string>('app.name', 'Paymenter');
    const full = title ? `${app} - ${title}` : app;
    const meta: Metadata = { title: full };
    const other: Record<string, string> = {};
    if (title) {
        meta.openGraph = { title: full };
        other.title = full;
    }
    if (description) {
        meta.description = description;
        meta.openGraph = { ...meta.openGraph, description };
    }
    if (image) {
        meta.openGraph = { ...meta.openGraph, images: [image] };
        other.image = image;
    }
    if (Object.keys(other).length) meta.other = other;
    return meta;
}
