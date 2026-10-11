import Link from 'next/link';
import { currentPath } from '@/server/request';
import { cn } from './cn';

type Range = number[];

const range = (from: number, to: number): Range => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Laravel's `UrlWindow` (onEachSide = 3): the elements `$paginator->links()` hands to the view. */
export function paginationElements(current: number, last: number): (Range | '...')[] {
    const onEachSide = 3;
    if (last < onEachSide * 2 + 8) return [range(1, last)];

    const window = onEachSide + 4;
    let first: Range;
    let slider: Range | null = null;
    let end: Range;
    if (current <= window) {
        first = range(1, window + onEachSide);
        end = range(last - 1, last);
    } else if (current > last - window) {
        first = range(1, 2);
        end = range(last - (window + (onEachSide - 1)), last);
    } else {
        first = range(1, 2);
        slider = range(current - onEachSide, current + onEachSide);
        end = range(last - 1, last);
    }
    const out: (Range | '...')[] = [first];
    if (slider) out.push('...', slider);
    out.push('...', end);
    return out;
}

/** Port of components/pagination.blade.php (page links instead of Livewire `wire:click`) */
export async function Pagination({ paginator }: { paginator: { current_page: number; last_page: number } }) {
    if (paginator.last_page <= 1) return <div className="flex justify-center"></div>;
    const path = await currentPath();
    const href = (page: number) => `${path}?page=${page}`;
    const { current_page: current, last_page: last } = paginator;
    const base = 'bg-background-secondary text-white px-4 py-2 rounded-lg';

    return (
        <div className="flex justify-center">
            <nav role="navigation" aria-label="Pagination Navigation" className="flex gap-2 items-center">
                <span>
                    {current <= 1 ? (
                        <span className={cn(base, 'cursor-not-allowed')}>Previous</span>
                    ) : (
                        <Link href={href(current - 1)} scroll={false} rel="prev" className={base}>
                            Previous
                        </Link>
                    )}
                </span>

                {paginationElements(current, last).map((element, i) =>
                    Array.isArray(element) ? (
                        element.map((page) =>
                            page === current || page <= 2 || page > last - 2 || Math.abs(current - page) <= 1 ? (
                                <span key={`${i}-${page}`}>
                                    <Link href={href(page)} scroll={false} className={cn(page === current ? 'bg-background-secondary/30 text-white' : 'bg-background-secondary text-white', 'px-4 py-2 rounded-lg cursor-pointer')}>
                                        {page}
                                    </Link>
                                </span>
                            ) : page === 3 || page === last - 3 ? (
                                <span key={`${i}-${page}`} className={base}>
                                    <span>...</span>
                                </span>
                            ) : null,
                        )
                    ) : (
                        <span key={i} className={base}>
                            <span>...</span>
                        </span>
                    ),
                )}

                <span>
                    {current >= last ? (
                        <span className={cn(base, 'cursor-not-allowed')}>Next</span>
                    ) : (
                        <Link href={href(current + 1)} scroll={false} rel="next" className={base}>
                            Next
                        </Link>
                    )}
                </span>
            </nav>
        </div>
    );
}
