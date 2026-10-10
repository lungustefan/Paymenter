import { setting } from '@/server/config';
import { numberFormat } from '@/server/lib/php';
import type { TaxRate } from '@/server/models/TaxRate';

/**
 * Port of App\Classes\Price: money value + currency formatting + tax handling.
 *
 * The PHP constructor resolves the tax rate itself (`Settings::tax()` hits the
 * database), so here the tax rate is resolved up front by the async
 * `Price.make()` factory; the constructor stays synchronous.
 */

export interface CurrencyLike {
    code?: string;
    format: string;
    prefix?: string | null;
    suffix?: string | null;
    name?: string;
}

export interface PriceInput {
    /** a plain number, or a model/object that has `price` and optionally `setup_fee` */
    price?: number | string | null | { price?: number | string | null; setup_fee?: number | string | null };
    setup_fee?: number | string | null;
    currency?: CurrencyLike | null;
    tax?: TaxRate | null;
}

export interface PriceOptions {
    free?: boolean;
    dontShowUnavailablePrice?: boolean;
    apply_exclusive_tax?: boolean;
    /** pre-resolved tax rate (null = no tax) */
    tax?: { rate: number; name?: string; country?: string } | null;
}

export interface PriceFormatted {
    total: string;
    price: string;
    setup_fee: string;
    tax: string;
    setup_fee_tax: string;
    total_tax: string;
}

function num(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** PHP's `number_format($x, 2, '.', '')` then back to a number - what the original stores in `$this->tax` etc. */
function r2(v: number): number {
    return Number(numberFormat(v, 2, '.', ''));
}

export class Price {
    price: number = 0;
    currency: CurrencyLike | null = null;
    setup_fee: number | null = null;
    has_setup_fee = false;
    is_free = false;
    dontShowUnavailablePrice = false;
    formatted!: PriceFormatted;
    tax = 0;
    setup_fee_tax = 0;
    discount = 0;
    original_price: number | null = null;
    original_setup_fee: number | null = null;

    constructor(input: PriceInput | null = null, options: PriceOptions = {}) {
        const { free = false, dontShowUnavailablePrice = false, apply_exclusive_tax = false } = options;
        this.dontShowUnavailablePrice = dontShowUnavailablePrice;

        if (free) {
            this.price = 0;
            this.currency = input?.currency ?? null;
            this.is_free = true;
            this.formatted = {
                price: this.format(this.price),
                setup_fee: this.format(this.setup_fee),
                tax: this.format(this.tax),
                setup_fee_tax: this.format(this.setup_fee_tax),
                total: this.format(this.total),
                total_tax: this.format(this.total_tax),
            };
            return;
        }

        const raw = input ?? {};
        const p = raw.price;
        this.price = num(p !== null && typeof p === 'object' ? (p.price ?? null) : p);
        this.currency = (raw.currency ?? null) as CurrencyLike | null;
        this.setup_fee = num(p !== null && typeof p === 'object' && p.setup_fee !== undefined && p.setup_fee !== null ? p.setup_fee : raw.setup_fee);

        // Original values are kept to be able to revert when removing a coupon
        this.original_price = this.price;
        this.original_setup_fee = this.setup_fee;

        // Calculate taxes
        if (setting('tax_enabled', false)) {
            const tax = options.tax ?? null;
            if (tax) {
                const rate = Number(tax.rate);
                if (setting('tax_type', 'inclusive') === 'inclusive' || !apply_exclusive_tax) {
                    // Inclusive has the tax included in the price
                    this.tax = r2(this.price - this.price / (1 + rate / 100));
                    if (this.setup_fee) this.setup_fee_tax = r2(this.setup_fee - this.setup_fee / (1 + rate / 100));
                } else {
                    // Exclusive has the tax added to the price as an extra
                    this.tax = r2((this.price * rate) / 100);
                    this.original_price = this.price + this.tax;
                    this.price = r2(this.price + this.tax);
                    if (this.setup_fee) {
                        this.setup_fee_tax = r2((this.setup_fee * rate) / 100);
                        this.original_setup_fee = this.setup_fee + this.setup_fee_tax;
                        this.setup_fee = r2(this.setup_fee + this.setup_fee_tax);
                    }
                }
            }
        }

        this.has_setup_fee = this.setup_fee !== null ? this.setup_fee > 0 : false;
        this.formatted = {
            total: this.format(this.total),
            price: this.format(this.price),
            setup_fee: this.format(this.setup_fee),
            tax: this.format(this.tax),
            setup_fee_tax: this.format(this.setup_fee_tax),
            total_tax: this.format(this.total_tax),
        };
    }

    /**
     * Async factory that resolves the tax rate the way `new Price(...)` does in
     * PHP: an explicit `tax` on the input wins, otherwise `Settings::tax()`
     * (the current user's country) is used when taxes are enabled.
     */
    static async make(input: PriceInput | null = null, options: Omit<PriceOptions, 'tax'> & { tax?: PriceOptions['tax'] | undefined } = {}): Promise<Price> {
        let tax = options.tax;
        if (tax === undefined && !options.free && setting('tax_enabled', false)) {
            tax = input?.tax ?? (await (await import('./Settings')).Settings.tax());
        }
        return new Price(input, { ...options, tax: tax ?? null });
    }

    setDiscount(discount: number) {
        this.discount = discount;
    }

    hasDiscount(): boolean {
        return this.discount > 0;
    }

    format(price: number | string | null | undefined): string {
        if (this.is_free) return 'Free';
        if (!this.currency) {
            if (this.dontShowUnavailablePrice) return '';
            return 'Not available in your currency';
        }
        const value = Number(price ?? 0);
        let formatted: string;
        switch (this.currency.format) {
            case '1.000,00':
                formatted = numberFormat(value, 2, ',', '.');
                break;
            case '1,000.00':
                formatted = numberFormat(value, 2, '.', ',');
                break;
            case '1 000,00':
                formatted = numberFormat(value, 2, ',', ' ');
                break;
            case '1 000.00':
                formatted = numberFormat(value, 2, '.', ' ');
                break;
            default:
                formatted = String(value);
        }
        return `${this.currency.prefix ?? ''}${formatted}${this.currency.suffix ?? ''}`;
    }

    /* ---- magic properties from __get ---- */

    get total(): string {
        return numberFormat(this.price + (this.setup_fee ?? 0), 2, '.', '');
    }

    get total_tax(): string {
        return numberFormat(this.tax + this.setup_fee_tax, 2, '.', '');
    }

    get subtotal(): string {
        return numberFormat(this.price + (this.setup_fee ?? 0) - (this.tax + this.setup_fee_tax), 2, '.', '');
    }

    get available(): boolean {
        return !!(this.currency || this.is_free);
    }

    toString(): string {
        return this.formatted.total;
    }

    toJSON() {
        return {
            price: this.price,
            currency: this.currency,
            setup_fee: this.setup_fee,
            has_setup_fee: this.has_setup_fee,
            is_free: this.is_free,
            dontShowUnavailablePrice: this.dontShowUnavailablePrice,
            tax: this.tax,
            setup_fee_tax: this.setup_fee_tax,
            discount: this.discount,
            original_price: this.original_price,
            original_setup_fee: this.original_setup_fee,
            formatted: this.formatted,
        };
    }
}
