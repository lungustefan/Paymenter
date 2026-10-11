/** Templates for `app:extension:create` (port of app/Console/Commands/Extension/stubs). */
export function extensionStub(type: string, className: string): string {
    if (type === 'gateway') {
        return `import { Gateway } from '@/server/extensions/Gateway';
import type { Invoice } from '@/server/models/Invoice';

export default class ${className} extends Gateway {
    static meta = {
        name: '${className}',
        description: 'Describe your gateway',
        version: '1.0.0',
        author: 'You',
    };

    /** Get all the configuration for the extension */
    getConfig(_values: Record<string, any> = {}) {
        return [];
    }

    /** Return a view, html or a redirect */
    pay(_invoice: Invoice, _total: number) {
        return '';
    }
}
`;
    }
    if (type === 'server') {
        return `import { Server } from '@/server/extensions/Server';
import type { Service } from '@/server/models/Service';

export default class ${className} extends Server {
    static meta = {
        name: '${className}',
        description: 'Describe your server integration',
        version: '1.0.0',
        author: 'You',
    };

    /** Configuration of the extension itself (API URL, keys ...) */
    getConfig(_values: Record<string, any> = {}) {
        return [];
    }

    /** Configuration of a product that uses this server */
    getProductConfig(_values: Record<string, any> = {}) {
        return [];
    }

    async createServer(_service: Service, _settings: Record<string, any>, _properties: Record<string, any>) {
        return {};
    }

    async suspendServer(_service: Service, _settings: Record<string, any>, _properties: Record<string, any>) {
        return {};
    }

    async unsuspendServer(_service: Service, _settings: Record<string, any>, _properties: Record<string, any>) {
        return {};
    }

    async terminateServer(_service: Service, _settings: Record<string, any>, _properties: Record<string, any>) {
        return {};
    }
}
`;
    }
    return `import { Extension } from '@/server/extensions/Extension';

export default class ${className} extends Extension {
    static meta = {
        name: '${className}',
        description: 'Describe your extension',
        version: '1.0.0',
        author: 'You',
    };

    getConfig(_values: Record<string, any> = {}) {
        return [];
    }

    /** Register listeners and routes */
    boot() {}
}
`;
}
