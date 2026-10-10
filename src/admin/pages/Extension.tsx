import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ReactNode } from 'react';
import { AdminPage } from '../core/Page';
import { ExtensionsCluster, ExtensionResource, GatewayResource, ServerResource } from '../resources/ExtensionResources';
import { Action } from '../actions/Action';
import { Schema, FileUpload } from '../forms';
import { Notification } from '../Notification';
import { renderActionItem } from '../actions/render';
import { Icon } from '../ui/Icon';
import { ExtensionTabs, LoadMore, MarketplaceFilters } from './extension-client';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Extension as ExtensionModel } from '@/server/models/Extension';
import { uploadExtension } from '@/server/extensions/upload';
import { hasPermission } from '@/server/policies';
import { cacheRemember } from '@/server/cache';
import { appVersion } from '@/server/version';
import type { User } from '@/server/models/User';
import type { ActionRef } from '../core/host';

const PER_PAGE = 12;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** `<x-extension-card>` */
function ExtensionCard({ extension }: { extension: Record<string, any> }) {
    const price = extension.price > 0 ? `$${Number(extension.price).toFixed(2)}` : 'Free';
    const author = extension.author === 'CorwinDev' ? 'Paymenter' : extension.author;
    const downloads = extension.download_count >= 1000 ? `${Math.round((extension.download_count / 1000) * 10) / 10}k` : extension.download_count;
    return (
        <a href={extension.url} target="_blank" rel="noopener noreferrer" className="flex flex-col overflow-hidden transition-all duration-300 bg-white border border-gray-300 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg hover:border-primary-500 dark:hover:border-primary-500">
            <div className="relative h-48 bg-gray-200 dark:bg-gray-700">
                <img src={extension.image_url} alt={extension.name} className="object-cover w-full h-full" />
                <span className="absolute px-2 py-1 text-xs font-semibold text-white capitalize rounded-full top-2 right-2 bg-primary-600">{extension.type}</span>
            </div>
            <div className="flex flex-col flex-grow p-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{extension.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">By {author}</p>
                <p className="flex-grow mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{extension.tag_line}</p>
                <div className="flex items-center justify-between pt-3 mt-4 text-sm text-gray-500 border-t border-gray-200 dark:border-gray-700 dark:text-gray-400">
                    <div className="flex items-center space-x-4">
                        {extension.review_count > 0 && (
                            <div className="flex items-center gap-1" title="Rating">
                                <Icon icon="ri-star-fill" size={null} className="w-4 h-4 text-yellow-400" />
                                <span>{`${extension.review_average} (${extension.review_count})`}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1" title="Downloads">
                            <Icon icon="ri-download-fill" size={null} className="w-4 h-4" />
                            <span>{downloads}</span>
                        </div>
                    </div>
                    <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{price}</div>
                </div>
            </div>
        </a>
    );
}

const box = 'p-4 text-center text-gray-500 bg-white border border-gray-300 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400';

/** App\Admin\Pages\Extension: the marketplace and the extensions that are ready to install */
export class Extension extends AdminPage {
    static slug = 'extension';
    static title = 'Extension';
    static cluster = ExtensionsCluster;
    static navigationIcon = 'ri-download-2-line';
    static activeNavigationIcon = 'ri-download-2-fill';
    static navigationLabel = 'Available Extensions';

    static override async canAccess(user: User | null) {
        return !!user && (await hasPermission(user, 'admin.extensions.viewAny')) && (await hasPermission(user, 'admin.extensions.install'));
    }

    private uploadAction?: Action;
    private upload() {
        return (this.uploadAction ??= Action.make('upload')
            .label('Upload Extension')
            .icon('ri-upload-2-line')
            .form(() => Schema.make().components([FileUpload.make('file').label('Extension File').required().acceptedFileTypes(['application/zip', 'application/x-zip-compressed']).directory('extensions/uploaded').preserveFilenames().maxSize(10240)]))
            .action(async ({ data }: any) => {
                try {
                    const result = uploadExtension(path.join(process.cwd(), 'storage', 'app', String(data.file)));
                    // the registry has to know the new files before the next build
                    spawn('node', ['scripts/generate-registry.mjs'], { cwd: process.cwd(), stdio: 'ignore' });
                    const link = (url: string, label: string) => `Please go to the ${label} page (${url}) to install the new ${result.type} extension.`;
                    const body =
                        result.type === 'server' ? link(ServerResource.getUrl(), 'Servers') : result.type === 'gateway' ? link(GatewayResource.getUrl(), 'Gateways') : 'It should be available on the "Ready to Install" tab after the application has been rebuilt (pnpm build) or restarted.';
                    await Notification.make().title('Extension uploaded successfully').body(`${result.type === 'other' ? '' : 'Rebuild or restart the application first. '}${body}`).success().send();
                } catch (e: any) {
                    await Notification.make().title('Failed to upload extension').body(e.message).danger().send();
                }
            }));
    }

    private installAction(name: string, type: string) {
        return Action.make(`install.${name}`)
            .label('Install')
            .requiresConfirmation()
            .action(async () => {
                const extension = new ExtensionModel();
                extension.fill({ name, type, extension: name });
                await extension.save();
                await ExtensionHelper.call(extension, 'installed', [], true);
                await Notification.make().title('Extension Installed').body('The extension has been successfully installed.').success().send();
            })
            .successRedirectUrl(async () => {
                const extension = await ExtensionModel.query().where('extension', name).first();
                return ExtensionResource.getUrl('edit', { record: extension! });
            });
    }

    override async findAction(id: string, state?: Record<string, any>): Promise<ActionRef | null> {
        if (id === 'page.upload') return { action: this.upload(), ctx: this.actionContext({ action: this.upload() }) };
        if (id.startsWith('page.install.')) {
            const name = id.slice('page.install.'.length);
            const found = (await ExtensionHelper.getInstallableExtensions()).find((e) => e.name === name);
            if (!found) return null;
            const action = this.installAction(found.name, found.type);
            return { action, ctx: this.actionContext({ action }) };
        }
        return super.findAction(id, state);
    }

    private async marketplace(): Promise<{ list: any[] | null; error: string | null }> {
        try {
            const list = await cacheRemember('paymenter_marketplace_extensions', 6 * 3600, async () => {
                const res = await fetch('https://api.paymenter.org/extensions?limit=999', { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': `Paymenter/${appVersion()} (https://paymenter.org)` } });
                if (!res.ok) {
                    console.error('Paymenter Marketplace API request failed', res.status);
                    return null;
                }
                return ((await res.json()) as any).extensions ?? [];
            });
            return list === null ? { list: null, error: 'The Paymenter Marketplace is currently unavailable. Please try again later.' } : { list, error: null };
        } catch (e: any) {
            console.error('Paymenter Marketplace API connection failed:', e.message);
            return { list: null, error: "Failed to connect to the Paymenter Marketplace. Please check your server's internet connection." };
        }
    }

    async render(): Promise<ReactNode> {
        const tab = first(this.searchParams.tab) === 'installable' ? 'installable' : 'marketplace';
        return (
            <ExtensionTabs active={tab}>
                <div>{tab === 'marketplace' ? await this.renderMarketplace() : await this.renderInstallable()}</div>
            </ExtensionTabs>
        );
    }

    private async renderMarketplace() {
        const search = first(this.searchParams.q);
        const filter = first(this.searchParams.filter) || 'all';
        const loaded = Math.max(PER_PAGE, Number(first(this.searchParams.n)) || PER_PAGE);
        const { list, error } = await this.marketplace();
        const filtered = (list ?? []).filter((e) => (!search || String(e.name).toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || e.type === filter));
        return (
            <div>
                <MarketplaceFilters search={search} filter={filter} searchIcon={<Icon icon="ri-search-line" size={null} className="w-5 h-5 text-gray-400" />} />
                <div className="mt-6">
                    {error ? (
                        <div className={box}>
                            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Something went wrong</h3>
                            <p className="mt-2">{error}</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className={box}>
                            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">No extensions found</h3>
                            <p className="mt-2">Try adjusting your search or filter criteria.</p>
                        </div>
                    ) : (
                        <div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {filtered.slice(0, loaded).map((e) => (
                                    <ExtensionCard key={e.name} extension={e} />
                                ))}
                            </div>
                            {filtered.length > loaded && <LoadMore next={loaded + PER_PAGE} />}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    private async renderInstallable() {
        const rows = await ExtensionHelper.getInstallableExtensions();
        const ctx = this.actionContext();
        const actions = await Promise.all(
            rows.map(async (row) => {
                const action = this.installAction(row.name, row.type);
                return renderActionItem(action, { ...ctx, action }, `page.install.${row.name}`, { defaultStyle: 'link', defaultSize: 'sm' });
            }),
        );
        return (
            <div className="fi-ta">
                <div className="fi-ta-ctn fi-ta-ctn-with-header">
                    <div className="fi-ta-main">
                        <div className="fi-ta-header-ctn">
                            <div className="fi-ta-header">
                                <div>
                                    <p className="fi-ta-header-description">List of available extensions (not gateway or server extensions) that can be installed.</p>
                                </div>
                                <div className="fi-ta-actions fi-align-end">{await renderActionItem(this.upload(), { ...ctx, action: this.upload() }, 'page.upload', { defaultStyle: 'button' })}</div>
                            </div>
                        </div>
                        <div className="fi-ta-content-ctn">
                            <table className="fi-ta-table">
                                <thead>
                                    <tr>
                                        {['Icon', 'Extension Name', 'Description'].map((h) => (
                                            <th key={h} className="fi-ta-header-cell">
                                                <span className="fi-ta-header-cell-label">{h}</span>
                                            </th>
                                        ))}
                                        <th className="fi-ta-header-cell" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => {
                                        const meta: any = row.meta;
                                        return (
                                            <tr key={row.name} className="fi-ta-row">
                                                <td className="fi-ta-cell">
                                                    <div className="fi-ta-col">{meta?.icon ? <img src={meta.icon} alt="" className="fi-ta-image-item" /> : <Icon icon="ri-puzzle-fill" />}</div>
                                                </td>
                                                <td className="fi-ta-cell">
                                                    <div className="fi-ta-col">
                                                        <div className="fi-ta-text fi-ta-text-item">{meta ? `${meta.name} (${meta.author})` : row.name}</div>
                                                    </div>
                                                </td>
                                                <td className="fi-ta-cell">
                                                    <div className="fi-ta-col">
                                                        <div className="fi-ta-text fi-ta-text-item">{meta?.description ?? ''}</div>
                                                    </div>
                                                </td>
                                                <td className="fi-ta-cell fi-ta-actions-cell">{actions[index]}</td>
                                            </tr>
                                        );
                                    })}
                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="fi-ta-cell">
                                                <div className="fi-ta-empty-state-content">No records found</div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
