import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { themeSetting } from '@/server/themes';
import { route, relativeUrl, storageUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Category } from '@/server/models/Category';
import type { Product } from '@/server/models/Product';
import { PrimaryButton, SecondaryButton } from '../../components/Button';
import { cn } from '../../components/cn';

/* eslint-disable @next/next/no-img-element */
function CardImage({ src, alt, small }: { src?: string | null; alt: string; small: boolean }) {
    if (!src) return null;
    return <img src={storageUrl(src)} alt={alt} className={cn('aspect-square rounded-md', small ? 'w-14 h-fit' : 'w-full object-cover object-center')} />;
}

/** Port of views/products/index.blade.php */
export default async function Index({
    category,
    categories,
    childCategories,
    products,
}: {
    category: Category;
    categories: Category[];
    childCategories: Category[];
    products: Product[];
}) {
    const t = makeTranslator(await getLocale()).t;
    const small = !!themeSetting('small_images', false);
    const direct = !!themeSetting('direct_checkout', false);
    const showDescription = !!themeSetting('show_category_description', true);

    const rows = await Promise.all(
        products.map(async (product) => {
            const price = await product.price();
            return { product, price };
        }),
    );

    return (
        <div className="container mt-14">
            <div className="flex flex-col md:grid md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-2">
                    <div className="mx-auto container">
                        <h1 className="text-3xl font-bold">{category.name}</h1>
                        <article className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: category.description ?? '' }} />
                    </div>
                    <div className="flex flex-col bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                        {categories.map((ccategory) => (
                            <Link key={ccategory.id} href={relativeUrl(route('category.show', { category: ccategory.slug }))} className={category.id === ccategory.id ? 'font-bold' : undefined}>
                                {ccategory.name}
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-6 col-span-3">
                    {childCategories.length >= 1 && (
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 h-fit">
                            {childCategories.map((child) => (
                                <div key={child.id} className="flex flex-col bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                                    {small ? (
                                        <div className="flex gap-x-3 items-center">
                                            <CardImage src={child.image} alt={child.name as string} small />
                                            <h2 className="text-xl font-bold">{child.name}</h2>
                                        </div>
                                    ) : (
                                        <>
                                            <CardImage src={child.image} alt={child.name as string} small={false} />
                                            <h2 className="text-xl font-bold">{child.name}</h2>
                                        </>
                                    )}
                                    {showDescription && <article className="mt-2 prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: child.description ?? '' }} />}
                                    <Link href={relativeUrl(route('category.show', { category: child.slug }))} className="mt-2">
                                        <PrimaryButton>{t('common.button.view')}</PrimaryButton>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 h-fit">
                        {rows.map(({ product, price }) => {
                            const buyable = product.stock !== 0 && price.available;
                            const productCategory = category;
                            return (
                                <div key={product.id} className="flex flex-col bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                                    {small ? (
                                        <div className="flex gap-x-3 items-center">
                                            <CardImage src={product.image} alt={product.name as string} small />
                                            <h2 className="text-xl font-bold">{product.name}</h2>
                                        </div>
                                    ) : (
                                        <>
                                            <CardImage src={product.image} alt={product.name as string} small={false} />
                                            <h2 className="text-xl font-bold">{product.name}</h2>
                                        </>
                                    )}
                                    {direct && product.description && <article className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: product.description }} />}
                                    <h3 className="text-lg font-semibold mb-2">{price.formatted.price}</h3>
                                    <div className="mt-auto pt-2 flex items-center gap-2">
                                        {buyable && direct ? (
                                            <Link href={relativeUrl(route('products.checkout', { category: productCategory.slug, product: product.slug }))} className="flex-grow">
                                                <PrimaryButton className="w-full">{t('product.add_to_cart')}</PrimaryButton>
                                            </Link>
                                        ) : (
                                            <>
                                                <Link href={relativeUrl(route('products.show', { category: productCategory.slug, product: product.slug }))} className="flex-grow">
                                                    <PrimaryButton className="w-full">{t('common.button.view')}</PrimaryButton>
                                                </Link>
                                                {buyable && (
                                                    <Link href={relativeUrl(route('products.checkout', { category: category.slug, product: product.slug }))}>
                                                        <SecondaryButton>
                                                            <Ri name="shopping-bag-4-fill" className="size-6" />
                                                        </SecondaryButton>
                                                    </Link>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
