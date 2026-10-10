import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { route, relativeUrl, storageUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Category } from '@/server/models/Category';
import type { Product } from '@/server/models/Product';
import { PrimaryButton, SecondaryButton } from '../../components/Button';
import { cn } from '../../components/cn';

/** Port of views/products/show.blade.php */
export default async function Show({ category, product }: { category: Category; product: Product }) {
    const t = makeTranslator(await getLocale()).t;
    const price = await product.price();
    const buyable = product.stock !== 0 && price.available;

    /* eslint-disable @next/next/no-img-element */
    return (
        <div className="container mt-14">
            <div className={cn('flex flex-col', product.image && 'md:grid grid-cols-2 gap-16 bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg')}>
                {product.image ? <img src={storageUrl(product.image)} alt={product.name as string} className="w-full h-96 object-contain object-center rounded-md" /> : null}
                <div className="flex flex-col">
                    {product.stock === 0 ? (
                        <span className="text-xs font-medium me-2 px-2.5 py-0.5 rounded bg-red-900 text-red-300 w-fit mb-3">{t('product.out_of_stock', { product: product.name })}</span>
                    ) : product.stock !== null && (product.stock as number) > 0 ? (
                        <span className="text-xs font-medium me-2 px-2.5 py-0.5 rounded bg-green-900 text-green-300 w-fit mb-3">{t('product.in_stock')}</span>
                    ) : null}
                    <div className="flex flex-row justify-between">
                        <div>
                            <h2 className="text-3xl font-bold">{product.name}</h2>
                            <h3 className="text-xl font-semibold">{price.formatted.price}</h3>
                        </div>
                        {buyable && (
                            <div>
                                <SecondaryButton>
                                    <Ri name="shopping-bag-4-fill" className="size-6" />
                                </SecondaryButton>
                            </div>
                        )}
                    </div>
                    <article className="my-4 prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: product.description ?? '' }} />

                    {buyable && (
                        <Link href={relativeUrl(route('products.checkout', { category: category.slug, product: product.slug }))}>
                            <PrimaryButton>{t('product.add_to_cart')}</PrimaryButton>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
