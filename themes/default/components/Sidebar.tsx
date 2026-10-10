import { SidebarLinks } from './SidebarLinks';

/** Port of components/navigation/sidebar.blade.php */
export function Sidebar() {
    return (
        <aside id="main-aside" className="mt-14 w-64 h-screen md:flex hidden flex-col justify-between border-e border-neutral bg-background-secondary fixed top-0 left-0 rtl:right-0 z-10">
            <SidebarLinks />
        </aside>
    );
}
