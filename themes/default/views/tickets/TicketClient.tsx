'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeTicketAction, createTicketAction, replyTicketAction } from '@/actions/tickets';
import { PrimaryButton, DangerButton } from '../../components/Button';
import { Input, SelectField } from '../../components/Form';
import { EasyMdeEditor } from '../../components/EasyMdeEditor';
import { FileDropzone } from '../../components/FileDropzone';
import { useForm } from '../../components/useForm';
import { useConfirm, useT } from '../../components/Providers';

/** `wire:poll.10s` */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
    const router = useRouter();
    useEffect(() => {
        const id = setInterval(() => router.refresh(), seconds * 1000);
        return () => clearInterval(id);
    }, [router, seconds]);
    return null;
}

/** `x-init="$nextTick(() => $el.scrollIntoView({ block: 'end' }))"` on the last message */
export function ScrollToLast() {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        ref.current?.parentElement?.scrollIntoView({ block: 'end' });
    }, []);
    return <span ref={ref} hidden />;
}

/** Reply form + close button of views/tickets/show.blade.php */
export function ReplyForm({ ticketId, canClose }: { ticketId: number; canClose: boolean }) {
    const { t } = useT();
    const confirm = useConfirm();
    const form = useForm({ message: '', attachments: [] as File[] });
    const [saved, setSaved] = useState(0);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('message', form.data.message);
        for (const f of form.data.attachments) fd.append('attachments', f);
        form.run(
            () => replyTicketAction(ticketId, fd),
            (result) => {
                if (result.ok) {
                    form.set('message', '');
                    form.set('attachments', []);
                    setSaved((n) => n + 1);
                }
            },
        );
    };

    return (
        <div className="mt-4">
            <form onSubmit={submit}>
                <label htmlFor="editor" className="block text-sm font-medium text-primary-100">
                    {t('ticket.reply')}
                </label>
                <EasyMdeEditor onChange={(v) => form.set('message', v)} resetKey={saved} />
                {form.error('message') && <p className="text-sm text-red-500 mt-1">{form.error('message')![0]}</p>}
                <label htmlFor="attachments" className="block text-sm font-medium text-primary-100 mt-2">
                    {t('ticket.attachments')}
                </label>
                <FileDropzone files={form.data.attachments} onChange={(files) => form.set('attachments', files)} error={form.error('attachments.0') ?? form.error('attachments')} />
                <div className="mt-2 flex flex-col sm:flex-row gap-2 justify-end">
                    {canClose && (
                        <DangerButton
                            type="button"
                            className="sm:!w-fit order-2 sm:order-1"
                            onClick={() =>
                                confirm({
                                    title: t('ticket.close_ticket'),
                                    message: t('ticket.close_ticket_confirmation'),
                                    confirmText: t('common.confirm'),
                                    cancelText: t('common.cancel'),
                                    callback: async () => {
                                        form.apply(await closeTicketAction(ticketId));
                                    },
                                })
                            }
                        >
                            {t('ticket.close_ticket')}
                        </DangerButton>
                    )}
                    <PrimaryButton type="submit" className="sm:!w-fit order-1 sm:order-2" pending={form.pending}>
                        {t('ticket.reply')}
                    </PrimaryButton>
                </div>
            </form>
        </div>
    );
}

export interface ServiceOption {
    id: number;
    label: string;
}

/** Port of views/tickets/create.blade.php + Livewire\Tickets\Create (client state) */
export function CreateTicketForm({ departments, services }: { departments: string[]; services: ServiceOption[] }) {
    const { t } = useT();
    const form = useForm({ subject: '', department: '', priority: '', service: '', message: '', attachments: [] as File[] });
    const [saved, setSaved] = useState(0);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('subject', form.data.subject);
        fd.set('department', form.data.department);
        fd.set('priority', form.data.priority);
        if (form.data.service) fd.set('service', form.data.service);
        fd.set('message', form.data.message);
        for (const f of form.data.attachments) fd.append('attachments', f);
        form.run(
            () => createTicketAction(fd),
            (result) => result.ok && setSaved((n) => n + 1),
        );
    };

    return (
        <div className="bg-primary-800 p-6 rounded-lg mt-2">
            <h1 className="text-2xl font-semibold mb-2">{t('ticket.create_ticket')}</h1>
            <div className="grid grid-cols-2 gap-4">
                <Input label={t('ticket.subject')} required {...form.bind('subject')} />
                {departments.length > 0 && (
                    <SelectField label={t('ticket.department')} required {...form.bind('department')}>
                        <option value="">{t('ticket.select_department')}</option>
                        {departments.map((department) => (
                            <option key={department} value={department}>
                                {department}
                            </option>
                        ))}
                    </SelectField>
                )}
                <SelectField label={t('ticket.priority')} required {...form.bind('priority')}>
                    <option value="">{t('ticket.select_priority')}</option>
                    <option value="low">{t('ticket.low')}</option>
                    <option value="medium">{t('ticket.medium')}</option>
                    <option value="high">{t('ticket.high')}</option>
                </SelectField>
                {/* Select the product */}
                <SelectField label={t('ticket.service')} {...form.bind('service')}>
                    <option value="">{t('ticket.select_service')}</option>
                    {services.map((service) => (
                        <option key={service.id} value={service.id}>
                            {service.label}
                        </option>
                    ))}
                </SelectField>
                <div className="col-span-2">
                    <div className="mt-4">
                        <form onSubmit={submit}>
                            <label htmlFor="editor" className="block text-sm font-medium text-primary-100">
                                {t('ticket.reply')}
                            </label>
                            <EasyMdeEditor placeholder="Initial message" onChange={(v) => form.set('message', v)} resetKey={saved} />
                            {form.error('message') && <p className="text-sm text-red-500 mt-1">{form.error('message')![0]}</p>}

                            <label htmlFor="attachments" className="block text-sm font-medium text-primary-100 mt-2">
                                {t('ticket.attachments')}
                            </label>
                            <FileDropzone files={form.data.attachments} onChange={(files) => form.set('attachments', files)} error={form.error('attachments.0')} />
                            <PrimaryButton className="mt-2 !w-fit float-right" pending={form.pending}>
                                {t('ticket.create')}
                            </PrimaryButton>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
