import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomString } from '@/server/lib/ids';
import { Domain } from '@/server/rules/Domain';
import type { Service } from '@/server/models/Service';

export default class CPanel extends Server {
    private async request(endpoint: string, method: 'get' | 'post' = 'get', data: Record<string, any> = {}) {
        const host = String(this.config('host')).replace(/\/+$/, '');
        const response = await Http.withHeaders({
            Authorization: 'whm ' + this.config('username') + ':' + this.config('apikey'),
        })[method](host + '/json-api' + endpoint, data);

        return response.throw();
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                type: 'text',
                label: 'Hostname',
                placeholder: 'https://example.com:2087',
                validation: 'url:http,https',
                required: true,
            },
            {
                name: 'username',
                type: 'text',
                placeholder: 'johndoe',
                label: 'Username',
                required: true,
            },
            {
                name: 'apikey',
                type: 'text',
                placeholder: '1234567890abcdef',
                label: 'API key',
                required: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Record<string, any> = {}): Promise<ConfigDefinition[]> {
        // Get all the packages
        const packages = (await this.request('/listpkgs')).json();
        const packageOptions: { value: string; label: string }[] = [];
        for (const pkg of packages['package']) {
            packageOptions.push({
                value: pkg['name'],
                label: pkg['name'],
            });
        }

        return [
            {
                name: 'package',
                type: 'select',
                label: 'Package',
                options: packageOptions,
                required: true,
            },
        ];
    }

    /**
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        const request = await this.request('/listaccts');
        if (!request.successful()) {
            return request.json('statusmsg');
        }

        return true;
    }

    getCheckoutConfig(): ConfigDefinition[] {
        return [
            {
                name: 'domain',
                type: 'text',
                label: 'Domain',
                required: true,
                validation: [Domain(), 'required'] as any,
                placeholder: 'domain.com',
            },
        ];
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Record<string, any>, properties: Record<string, any>) {
        let username = randomString();
        // If first one is a number, add a letter
        if (/^[0-9]/.test(username)) {
            username = 'a' + username.slice(1);
        }

        const response = await this.request('/createacct', 'get', {
            'api.version': 1,
            username,
            contactemail: (await service.rel('user'))!.email,
            domain: properties['domain'],
            plan: properties['package'] ?? settings['package'],
        });

        if (response.json()['metadata']['result'] === 1) {
            await service.relation('properties').updateOrCreate(
                {
                    key: 'cpanel_username',
                },
                {
                    name: 'cPanel username',
                    value: username.toLowerCase(),
                },
            );
        }

        return true;
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Record<string, any>, properties: Record<string, any>) {
        if (properties['cpanel_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request('/suspendacct', 'get', {
            'api.version': 1,
            user: properties['cpanel_username'],
        });

        if (response.json()['metadata']['result'] === 1) {
            return true;
        }

        return false;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Record<string, any>, properties: Record<string, any>) {
        if (properties['cpanel_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request('/unsuspendacct', 'get', {
            'api.version': 1,
            user: properties['cpanel_username'],
        });

        if (response.json()['metadata']['result'] === 1) {
            return true;
        }

        return false;
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Record<string, any>, properties: Record<string, any>) {
        if (properties['cpanel_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request('/removeacct', 'get', {
            'api.version': 1,
            user: properties['cpanel_username'],
        });

        if (response.json()['metadata']['result'] === 1) {
            // Delete the properties
            await service.relation('properties').where('key', 'cpanel_username').delete();

            return true;
        }

        return false;
    }

    async upgradeServer(_service: Service, settings: Record<string, any>, properties: Record<string, any>) {
        if (properties['cpanel_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request('/modifyacct', 'get', {
            'api.version': 1,
            user: properties['cpanel_username'],
            plan: settings['package'],
        });

        if (response.json()['metadata']['result'] === 1) {
            return true;
        }

        return false;
    }

    async getLoginUrl(_service: Service, _settings: Record<string, any>, properties: Record<string, any>): Promise<string> {
        if (properties['cpanel_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = (
            await this.request('/create_user_session', 'post', {
                'api.version': 1,
                user: properties['cpanel_username'],
                service: 'cpaneld',
            })
        ).json();

        if (response?.data?.url !== undefined) {
            return response['data']['url'];
        }

        throw new Error('Unable to generate cPanel login URL');
    }

    getActions(_service: Service, _settings: Record<string, any>, properties: Record<string, any>) {
        if (properties['cpanel_username'] === undefined) {
            return [];
        }

        return [
            {
                label: 'Access cPanel',
                type: 'button' as const,
                function: 'getLoginUrl',
            },
        ];
    }
}
