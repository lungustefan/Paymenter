export const InvoiceTransactionStatus = {
    Processing: 'processing',
    Succeeded: 'succeeded',
    Failed: 'failed',
} as const;
export type InvoiceTransactionStatus = (typeof InvoiceTransactionStatus)[keyof typeof InvoiceTransactionStatus];

export const NotificationEnabledStatus = {
    Force: 'force',
    ChoiceOn: 'choice_on',
    ChoiceOff: 'choice_off',
    Never: 'never',
} as const;
export type NotificationEnabledStatus = (typeof NotificationEnabledStatus)[keyof typeof NotificationEnabledStatus];
