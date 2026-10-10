'use client';

import { updateAccountAction } from '@/actions/account';
import { Input } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { Properties } from '../../components/Properties';
import type { CustomPropertyDef } from '../../components/propertiesData';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

/** Port of views/client/account/index.blade.php + Livewire\Client\Account (client state) */
export function AccountForm({
    initial,
    customProperties,
    initialProperties,
    breadcrumb,
}: {
    initial: { first_name: string; last_name: string; email: string };
    customProperties: CustomPropertyDef[];
    initialProperties: Record<string, any>;
    breadcrumb: React.ReactNode;
}) {
    const { t } = useT();
    const form = useForm({ ...initial, properties: initialProperties });
    // `wire:dirty.class="!border-yellow-600"`
    const dirty = (key: keyof typeof initial) => (form.data[key] !== initial[key] ? '!border-yellow-600' : '');

    return (
        <div className="container mt-14">
            {breadcrumb}
            <div className="px-2">
                <div className="grid md:grid-cols-2 gap-3">
                    <Input type="text" label={t('general.input.first_name')} placeholder={t('general.input.first_name_placeholder')} required className={dirty('first_name')} {...form.bind('first_name')} />
                    <Input type="text" label={t('general.input.last_name')} placeholder={t('general.input.last_name_placeholder')} required className={dirty('last_name')} {...form.bind('last_name')} />

                    <Input type="email" label={t('general.input.email')} placeholder={t('general.input.email_placeholder')} required className={dirty('email')} {...form.bind('email')} />

                    <Properties
                        customProperties={customProperties}
                        properties={form.data.properties}
                        onChange={(key, value) => form.set('properties', { ...form.data.properties, [key]: value })}
                        errors={form.errors}
                    />
                </div>

                <PrimaryButton onClick={() => form.run(() => updateAccountAction(form.data))} className="w-full mt-4" disabled={form.pending}>
                    {t('general.update')}
                </PrimaryButton>
            </div>
        </div>
    );
}
