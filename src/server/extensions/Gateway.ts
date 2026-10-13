import type { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import type { Invoice } from '@/server/models/Invoice';
import type { BillingAgreement } from '@/server/models/BillingAgreement';
import type { User } from '@/server/models/User';
import type { Service } from '@/server/models/Service';
import { Extension } from './Extension';
import type { ExtensionView } from './types';

/** Port of App\Classes\Extension\Gateway. */
export abstract class Gateway extends Extension {
    abstract pay(invoice: Invoice, total: number): Promise<ExtensionView> | ExtensionView;

    supportsBillingAgreements(): boolean {
        return false;
    }

    async createBillingAgreement(_user: User): Promise<ExtensionView> {
        throw new Error('Not implemented');
    }

    async cancelBillingAgreement(_billingAgreement: BillingAgreement): Promise<boolean> {
        throw new Error('Not implemented');
    }

    async charge(_invoice: Invoice, _total: number, _billingAgreement: BillingAgreement): Promise<boolean> {
        throw new Error('Not implemented');
    }

    /** Whether the gateway can refund its transactions (see `refund()`). */
    supportsRefunds(): boolean {
        return false;
    }

    /** Refund `amount` of the given transaction at the payment provider. Return false (or throw) when it fails. */
    async refund(_transaction: InvoiceTransaction, _amount: number): Promise<boolean> {
        throw new Error('Not implemented');
    }

    /** optional: restrict the gateway for certain carts / invoices */
    canUseGateway?(total: number, currency: string, type: string, items?: unknown[]): Promise<boolean> | boolean;
    cancelSubscription?(service: Service): Promise<boolean | void> | boolean | void;
}
