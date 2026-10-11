export type SettingType =
    | 'text'
    | 'select'
    | 'tags'
    | 'checkbox'
    | 'email'
    | 'password'
    | 'number'
    | 'time'
    | 'textarea'
    | 'markdown'
    | 'color'
    | 'file'
    | 'placeholder'
    | 'radio'
    | 'toggle';

export type Getter = (key: string) => any;

/**
 * Declarative description of one setting / extension config field. This is the
 * data that `FilamentInput::convert()` turned into form components in the PHP
 * app; the admin form renderer consumes the same shape.
 */
export interface SettingDefinition {
    name: string;
    label?: string;
    type: SettingType | string;
    default?: any;
    options?: Record<string, string> | string[] | Array<{ value: string; label: string }>;
    required?: boolean | ((get: Getter) => boolean);
    /** config() key that the stored value overrides, e.g. `app.name` */
    override?: string;
    /** how the value is stored in the `settings.type` column */
    database_type?: 'string' | 'boolean' | 'integer' | 'float' | 'array';
    description?: string;
    descriptionHtml?: boolean;
    validation?: string | string[];
    nested_validation?: string[];
    multiple?: boolean;
    live?: boolean;
    encrypted?: boolean;
    file_name?: string;
    accept?: string[];
    action?: string;
    link?: string;
    placeholder?: string;
    disable_toolbar?: boolean;
    hint?: string;
    suffix?: string;
    prefix?: string;
    disabled?: boolean;
    min_value?: number;
    max_value?: number;
    seconds?: boolean;
    color_mode?: 'hsl' | 'rgb' | 'hex';
    disk?: string;
    visibility?: string;
    preserve_filenames?: boolean;
    /** options/default computed at runtime (languages, themes) */
    dynamic?: 'app_language' | 'allowed_languages' | 'theme';
    [key: string]: any;
}
