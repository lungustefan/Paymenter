import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { Hook } from '@/components/Hook';
import { markdown } from '@/server/markdown';
import { themeSetting } from '@/server/themes';
import { route, relativeUrl, storageUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Category } from '@/server/models/Category';
import { PrimaryButton } from '../components/Button';
import { cn } from '../components/cn';

/** Port of views/home.blade.php */
export default async function Home({ categories }: { categories: Category[] }) {
    const t = makeTranslator(await getLocale()).t;
    const smallImages = themeSetting('small_images', false);
    const welcome = markdown(themeSetting<string>('home_page_text', 'Welcome to Paymenter'), { allow_unsafe_links: false, soft_break: '<br>' });

    /* eslint-disable @next/next/no-img-element */
    return (
        <div>
            <div className="flex flex-col gap-6">
                <div className="w-full bg-background-secondary p-14 rounded-md border-b border-neutral">
                    <div className="container">
                        <article className="prose dark:prose-invert max-w-full " dangerouslySetInnerHTML={{ __html: welcome }} />
                    </div>
                </div>

                <div className="container mt-4 flex flex-col gap-5">
                    <h2 className="text-xl font-semibold">Services</h2>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mb-4">
                        {categories.map((category) => (
                            <div key={category.id} className="flex flex-col bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                                {smallImages ? (
                                    <div className="flex gap-x-3 items-center">
                                        {category.image ? <img src={storageUrl(category.image)} alt={category.name} className="aspect-square rounded-md w-14 h-fit" /> : null}
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xl font-semibold">{category.name}</h3>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {category.image ? <img src={storageUrl(category.image)} alt={category.name} className="aspect-square rounded-md w-full object-cover object-center" /> : null}
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xl font-semibold">{category.name}</h3>
                                        </div>
                                    </>
                                )}
                                {themeSetting('show_category_description', true) && (
                                    <article className="prose dark:prose-invert mt-2" dangerouslySetInnerHTML={{ __html: category.description ?? '' }} />
                                )}
                                <Link href={relativeUrl(route('category.show', { category: category.slug }))} className="mt-auto pt-2">
                                    <PrimaryButton>
                                        {t('common.button.view_all')}
                                        <Ri name="arrow-right-fill" className="size-5" />
                                    </PrimaryButton>
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <Hook name="pages.home" />
        </div>
    );
}
void cn;
