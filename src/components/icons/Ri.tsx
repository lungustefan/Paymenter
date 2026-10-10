import type { SVGProps } from 'react';
import { remixIcons } from './remix-icons';

/**
 * `<x-ri-home-2-line class="size-5" />` -> `<Ri name="home-2-line" className="size-5" />`.
 * Renders exactly the markup blade-remix-icon produced.
 */
export function Ri({ name, ...props }: { name: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
    const inner = remixIcons[name.replace(/^ri-/, '')] ?? '';
    return <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props} dangerouslySetInnerHTML={{ __html: inner }} />;
}
