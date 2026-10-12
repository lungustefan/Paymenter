/** Tiny class-name joiner (`class="a {{ $x ? 'b' : '' }}"` in the Blade views). */
export function cn(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
