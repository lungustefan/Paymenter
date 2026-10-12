import { Select, type OptionsInput } from './fields/Select';
import { TextInput } from './fields/TextInput';
import { Textarea } from './fields/Textarea';
import { Checkbox } from './fields/Checkbox';
import { Toggle } from './fields/Toggle';
import { TagsInput } from './fields/TagsInput';
import { DatePicker, TimePicker } from './fields/DateTimePicker';
import { MarkdownEditor } from './fields/MarkdownEditor';
import { ColorPicker } from './fields/ColorPicker';
import { FileUpload } from './fields/FileUpload';
import { Radio } from './fields/Radio';
import { Placeholder } from '../infolists';
import { Component } from './Component';
import type { SettingDefinition } from '@/server/settings/types';
import { settingActions } from '../actions/SettingsActions';

/** `Arr::first` style normalisation of the `options` of a setting (see `FilamentInput::convert()`) */
export function configOptions(options: SettingDefinition['options']): Array<[string, string]> {
    if (!options) return [];
    const out: Array<[string, string]> = [];
    if (Array.isArray(options)) {
        for (const value of options as any[]) {
            if (value !== null && typeof value === 'object') out.push([String(value.value), String(value.label)]);
            else out.push([String(value), String(value)]);
        }
        return out;
    }
    for (const [key, value] of Object.entries(options as Record<string, any>)) {
        if (value !== null && typeof value === 'object') out.push([String(value.value), String(value.label)]);
        else out.push([key, String(value)]);
    }
    return out;
}

const rulesOf = (validation: SettingDefinition['validation']): string[] => (Array.isArray(validation) ? validation : validation ? String(validation).split('|') : []);

/**
 * Port of App\Classes\FilamentInput::convert(): a declarative setting / extension option becomes a
 * form component. An object that already is a component is returned as it is.
 */
export function convertInput(setting: SettingDefinition | Component): Component {
    if (setting instanceof Component) return setting;
    const s = setting;
    const label = s.label ?? s.name;
    const required = typeof s.required === 'function' ? ({ get }: any) => (s.required as (g: (k: string) => any) => boolean)((key) => get(key)) : (s.required ?? false);
    const apply = <T extends any>(field: T): T => {
        const f = field as any;
        f.label(label);
        if (s.description !== undefined && s.description !== null) f.helperText(s.description);
        if (s.hint) f.hint(s.hint).hintColor('primary');
        if ((s as any).action && settingActions[(s as any).action]) f.hintActions([settingActions[(s as any).action]()]);
        return field;
    };

    switch (s.type) {
        case 'select': {
            const field = Select.make(s.name)
                .options(() => configOptions(s.options) as unknown as OptionsInput)
                .multiple(s.multiple ?? false)
                .required(required)
                .default(s.default ?? '')
                .disabled(s.disabled ?? false)
                .rules(rulesOf(s.validation));
            apply(field);
            if (s.live) field.live();
            if (s.suffix) field.suffix(s.suffix);
            if (s.prefix) field.prefix(s.prefix);
            return field;
        }
        case 'tags': {
            const field = TagsInput.make(s.name).placeholder(s.placeholder ?? '').required(required).disabled(s.disabled ?? false).rules(rulesOf(s.validation));
            return apply(field);
        }
        case 'text':
        case 'password':
        case 'email':
        case 'number': {
            const field = TextInput.make(s.name)
                .placeholder(s.placeholder ?? s.default ?? '')
                .required(required)
                .default(s.default ?? '')
                .disabled(s.disabled ?? false)
                .rules(rulesOf(s.validation));
            apply(field);
            if (s.type === 'password') field.password().revealable();
            if (s.type === 'email') field.email();
            if (s.type === 'number') {
                field.numeric();
                if (s.min_value !== undefined && s.min_value !== null) field.minValue(s.min_value);
                if (s.max_value !== undefined && s.max_value !== null) field.maxValue(s.max_value);
            }
            if (s.live) field.live();
            if (s.suffix) field.suffix(s.suffix);
            if (s.prefix) field.prefix(s.prefix);
            return field;
        }
        case 'time': {
            const field = TimePicker.make(s.name)
                .placeholder(s.placeholder ?? s.default ?? '')
                .required(required)
                .default(s.default ?? null)
                .disabled(s.disabled ?? false)
                .rules(rulesOf(s.validation))
                .seconds(s.seconds ?? false);
            apply(field);
            if (s.live) field.live();
            if (s.suffix) field.suffix(s.suffix);
            if (s.prefix) field.prefix(s.prefix);
            return field;
        }
        case 'textarea': {
            const field = Textarea.make(s.name)
                .placeholder(s.placeholder ?? s.default ?? '')
                .required(required)
                .default(s.default ?? '')
                .rules(rulesOf(s.validation))
                .disabled(s.disabled ?? false);
            apply(field);
            if (s.live) field.live();
            return field;
        }
        case 'markdown': {
            const field = MarkdownEditor.make(s.name)
                .placeholder(s.placeholder ?? s.default ?? '')
                .required(required)
                .default(s.default ?? '')
                .disableAllToolbarButtons(s.disable_toolbar ?? false)
                .rules(rulesOf(s.validation))
                .disabled(s.disabled ?? false);
            apply(field);
            if (s.live) field.live();
            return field;
        }
        case 'color': {
            const mode = (s.color_mode ?? 'hsl') as 'hex' | 'hsl' | 'rgb';
            const field = ColorPicker.make(s.name)
                .placeholder(s.placeholder ?? s.default ?? '')
                .required(required)
                .default(s.default ?? '')
                .disabled(s.disabled ?? false)
                .rules(rulesOf(s.validation));
            apply(field);
            field.live(false);
            if (s.live ?? true) field.live();
            if (s.suffix) field.suffix(s.suffix);
            if (s.prefix) field.prefix(s.prefix);
            field[mode]();
            field.afterStateUpdated(({ state, set }) => {
                const normalized = normalizeColor(String(state ?? ''), mode);
                if (normalized !== null) set(s.name, normalized);
            });
            return field;
        }
        case 'file': {
            const field = FileUpload.make(s.name)
                .required(required)
                .acceptedFileTypes(s.accept ?? [])
                .default(s.default ?? '')
                .disk(s.disk ?? 'public')
                .preserveFilenames(s.preserve_filenames ?? true)
                .disabled(s.disabled ?? false)
                .visibility(s.visibility ?? 'private')
                .downloadable()
                .rules(rulesOf(s.validation));
            apply(field);
            if (s.live) field.live();
            if (s.file_name) field.getUploadedFileNameForStorageUsing(() => String(s.file_name));
            return field;
        }
        case 'checkbox': {
            const field = Checkbox.make(s.name).required(required).default(s.default ?? '').disabled(s.disabled ?? false).rules(rulesOf(s.validation));
            apply(field);
            if (s.live) field.live();
            return field;
        }
        case 'toggle': {
            const field = Toggle.make(s.name).required(required).default(s.default ?? false).disabled(s.disabled ?? false).rules(rulesOf(s.validation));
            apply(field);
            if (s.live) field.live();
            return field;
        }
        case 'radio': {
            const field = Radio.make(s.name)
                .options(() => configOptions(s.options) as unknown as OptionsInput)
                .required(required)
                .default(s.default ?? null)
                .disabled(s.disabled ?? false)
                .rules(rulesOf(s.validation));
            apply(field);
            if (s.live) field.live();
            return field;
        }
        case 'placeholder': {
            const field = Placeholder.make(s.name);
            field.state(() => s.label ?? null);
            if (s.description) field.helperText(s.description);
            return field;
        }
        default:
            throw new Error(`Unknown input type: ${s.type}`);
    }
}

/** the colour as `hsl(...)`, `rgb(...)` or `#hex`, like `Spatie\Color` does; `null` when it cannot be parsed */
export function normalizeColor(value: string, mode: 'hex' | 'hsl' | 'rgb'): string | null {
    const rgb = parseColor(value.trim());
    if (!rgb) return null;
    const [r, g, b] = rgb;
    if (mode === 'rgb') return `rgb(${r}, ${g}, ${b})`;
    if (mode === 'hex') return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const [h, s, l] = rgbToHsl(r, g, b);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

function parseColor(v: string): [number, number, number] | null {
    let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (m) {
        let hex = m[1];
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(v);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    m = /^hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(v);
    if (m) return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
    return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
