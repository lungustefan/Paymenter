'use client';

import { Input, Checkbox, Textarea, SelectField } from './Form';
import { useT } from './Providers';
import type { CustomPropertyDef } from './propertiesData';

/** Port of components/form/properties.blade.php */
export function Properties({
    customProperties,
    properties,
    onChange,
    errors,
}: {
    customProperties: CustomPropertyDef[];
    properties: Record<string, any>;
    onChange: (key: string, value: any) => void;
    errors: Record<string, string[]>;
}) {
    const { t } = useT();
    return (
        <>
            {customProperties.map((property) => {
                const name = `properties.${property.key}`;
                const value = properties[property.key];
                const locked = property.non_editable && value !== undefined && value !== null;
                const error = errors[name];
                switch (property.type) {
                    case 'date':
                    case 'string':
                    case 'number':
                        return (
                            <Input
                                key={property.key}
                                type={property.type}
                                name={name}
                                label={property.name}
                                required={property.required}
                                value={value ?? ''}
                                disabled={locked}
                                onChange={(e) => onChange(property.key, e.target.value)}
                                error={error}
                            />
                        );
                    case 'checkbox':
                        return (
                            <Checkbox
                                key={property.key}
                                name={name}
                                label={property.name}
                                required={property.required}
                                checked={!!value && value !== '0'}
                                disabled={locked}
                                onChange={(e) => onChange(property.key, e.target.checked)}
                                error={error}
                            />
                        );
                    case 'radio':
                        return (
                            <div key={property.key}>
                                {property.allowed_values.map((v) => (
                                    <div className="flex items-center" key={v}>
                                        <input
                                            type="radio"
                                            value={v}
                                            name={name}
                                            checked={value === v}
                                            required={property.required}
                                            disabled={locked}
                                            onChange={() => onChange(property.key, v)}
                                            className="form-radio size-4 text-primary rounded-full focus:ring-secondary hover:bg-secondary ring-offset-primary-800 focus:ring-2 bg-background-secondary border-neutral"
                                        />
                                        <label className="ml-2 text-sm text-primary-100" htmlFor={name}>
                                            {v}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        );
                    case 'select':
                        return (
                            <SelectField
                                key={property.key}
                                name={name}
                                label={property.name}
                                className="has-[option:disabled:checked]:text-muted"
                                required={property.required}
                                disabled={property.non_editable && !!value}
                                value={value ?? ''}
                                onChange={(e) => onChange(property.key, e.target.value)}
                                error={error}
                            >
                                <option disabled value="" style={{ color: 'hsl(var(--color-muted))' }}>
                                    {t('common.select.placeholder', { name: property.name })}
                                </option>
                                {property.allowed_values.map((v) => (
                                    <option style={{ color: 'hsl(var(--color-base))' }} value={v} key={v}>
                                        {v}
                                    </option>
                                ))}
                            </SelectField>
                        );
                    case 'text':
                        return (
                            <Textarea
                                key={property.key}
                                name={name}
                                label={property.name}
                                required={property.required}
                                disabled={locked}
                                value={value ?? ''}
                                onChange={(e) => onChange(property.key, e.target.value)}
                                error={error}
                            />
                        );
                    default:
                        return null;
                }
            })}
        </>
    );
}
