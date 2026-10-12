import { colorClasses, type FilamentColorName } from './colors.generated';

export type { FilamentColorName };

/** `->color(Component::class, $color)`: the `fi-color-*` classes Filament puts on an element. */
export function colorClass(component: keyof typeof colorClasses, color: FilamentColorName | null | undefined): string {
    if (!color) return '';
    const known = colorClasses[component]?.[color];
    if (known !== undefined) return known;
    // custom colors only get the base classes
    return `fi-color fi-color-${color.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
