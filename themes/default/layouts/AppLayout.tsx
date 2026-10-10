import type { ReactNode } from 'react';
import { Navigation } from '../components/Navigation';
import { Sidebar } from '../components/Sidebar';
import { Footer } from '../components/Footer';
import { Impersonating } from '../components/Impersonating';
import { cn } from '../components/cn';

/** Port of layouts/app.blade.php (the part inside <body>) */
export function AppLayout({ sidebar, children }: { title?: string; sidebar?: boolean; children?: ReactNode }) {
    return (
        <>
            <Navigation hasAside={!!sidebar} />
            <div className="w-full flex flex-grow">
                {sidebar && <Sidebar />}
                <div className={cn(sidebar && 'md:ml-64 rtl:ml-0 rtl:md:mr-64', 'flex flex-col flex-grow overflow-auto')}>
                    <main className="mt-16 grow">{children}</main>
                    <div className="flex">
                        <Footer />
                    </div>
                </div>
                <Impersonating />
            </div>
        </>
    );
}
