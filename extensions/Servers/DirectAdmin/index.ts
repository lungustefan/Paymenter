import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http, type HttpResponse } from '@/server/http';
import { htmlEntityDecode, parseStr, strShuffle } from '@/server/lib/php';
import { Domain } from '@/server/rules/Domain';
import type { Service } from '@/server/models/Service';

type Bag = Record<string, any>;

export default class DirectAdmin extends Server {
    private async request(endpoint: string, method: 'get' | 'post' = 'get', data: Bag = {}, parse = false): Promise<any> {
        const host = String(this.config('host')).replace(/\/+$/, '');
        const url = host + endpoint;

        const response = (
            await Http.withBasicAuth(this.config<string>('username') as string, this.config<string>('password') as string)
                .withHeaders({
                    'Content-Type': 'application/json',
                })
                [method](url, data)
        ).throw();

        if (parse) {
            return this.parse(response);
        }

        return response;
    }

    private parse(response: HttpResponse): any {
        const body = htmlEntityDecode(response.body());
        const parsed = parseStr(body);
        if (Array.isArray(parsed['list'])) {
            return parsed['list'];
        }

        return parsed;
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                label: 'DirectAdmin URL',
                type: 'text',
                required: true,
                validation: 'url',
            },
            {
                name: 'username',
                label: 'DirectAdmin User name',
                type: 'text',
                required: true,
            },
            {
                name: 'password',
                label: 'DirectAdmin Password',
                type: 'password',
                required: true,
                encrypted: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Bag = {}): Promise<ConfigDefinition[]> {
        const userPackages = Object.values<string>(await this.request('/CMD_API_PACKAGES_USER', 'get', {}, true));
        // Map to label => value pairs
        const upackages = userPackages.map((pkg) => ({ label: pkg, value: pkg }));

        let rpackages: { label: string; value: string }[];
        try {
            // If you are a reseller you won't have access to reseller packages
            // Merge user packages with reseller packages
            rpackages = Object.values<string>(await this.request('/CMD_API_PACKAGES_RESELLER', 'get', {}, true)).map((pkg) => ({ label: pkg + ' (reseller)', value: pkg }));
        } catch {
            rpackages = [];
        }

        const packages = [...upackages, ...rpackages];

        const ips = await this.request('/CMD_API_SHOW_RESELLER_IPS', 'get', {}, true);

        return [
            {
                name: 'package',
                type: 'select',
                label: 'Package',
                required: true,
                options: packages,
            },
            {
                name: 'ip',
                type: 'select',
                label: 'IP Address',
                required: false,
                options: ips,
            },
        ];
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
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        try {
            (await this.request('/CMD_API_SHOW_USERS')).body();

            return true;
        } catch (e: any) {
            return e.message;
        }
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Bag, properties: Bag) {
        const password = strShuffle('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ(!@.$%').slice(1, 13);
        const username = strShuffle('abcdefghijklmnopqrstuvwxyz').slice(1, 9);
        settings = { ...settings, ...properties };

        let ip: string | null;
        if (settings['ip'] !== undefined && settings['ip'] !== null) {
            ip = settings['ip'];
        } else {
            ip = (await this.request('/CMD_API_SHOW_RESELLER_IPS', 'get', {}, true))[0] ?? null;

            if (!ip) {
                throw new Error('No IP address available for the server');
            }
        }

        const response = await this.request(
            '/CMD_API_ACCOUNT_USER',
            'post',
            {
                action: 'create',
                add: 'Submit',
                username,
                email: (await service.rel('user'))!.email,
                passwd: password,
                passwd2: password,
                package: settings['package'],
                ip,
                domain: properties['domain'] ?? '',
                notify: 'yes',
            },
            true,
        );

        if (response['error'] != '0') {
            throw new Error('Error creating DirectAdmin account: ' + response['text']);
        }

        await service.relation('properties').updateOrCreate(
            {
                key: 'directadmin_username',
            },
            {
                name: 'DirectAdmin username',
                value: username,
            },
        );

        await service.relation('properties').updateOrCreate(
            {
                key: 'directadmin_password',
            },
            {
                name: 'DirectAdmin password',
                value: password,
            },
        );

        return {
            username,
            password,
            domain: properties['domain'] ?? '',
            ip,
        };
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['directadmin_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request(
            '/CMD_API_SELECT_USERS',
            'post',
            {
                location: 'CMD_SELECT_USERS',
                suspend: 'suspend',
                select0: properties['directadmin_username'],
            },
            true,
        );

        if (response['error'] != '0') {
            throw new Error('Error suspending DirectAdmin account: ' + response['text']);
        }

        return true;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['directadmin_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request(
            '/CMD_API_SELECT_USERS',
            'post',
            {
                location: 'CMD_SELECT_USERS',
                suspend: 'unsuspend',
                select0: properties['directadmin_username'],
            },
            true,
        );

        if (response['error'] != '0') {
            throw new Error('Error unsuspending DirectAdmin account: ' + response['text']);
        }

        return true;
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        if (properties['directadmin_username'] === undefined) {
            throw new Error('Service has not been created');
        }

        const response = await this.request(
            '/CMD_API_SELECT_USERS',
            'post',
            {
                confirmed: 'Confirm',
                delete: 'yes',
                select0: properties['directadmin_username'],
            },
            true,
        );

        if (response['error'] != '0') {
            throw new Error('Error terminating DirectAdmin account: ' + response['text']);
        }

        // Delete the properties
        await service.relation('properties').where('key', 'directadmin_username').delete();

        return true;
    }

    getActions(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['directadmin_username'] === undefined || properties['directadmin_password'] === undefined) {
            return [];
        }

        return [
            {
                label: 'Access DirectAdmin',
                type: 'button' as const,
                function: 'ssoLink',
            },
        ];
    }

    async ssoLink(_service: Service, _settings: Bag, properties: Bag): Promise<string> {
        if (properties['directadmin_username'] === undefined || properties['directadmin_password'] === undefined) {
            return '';
        }

        const raw = (
            await Http.withBasicAuth(properties['directadmin_username'], properties['directadmin_password']).post(String(this.config('host')).replace(/\/+$/, '') + '/CMD_API_LOGIN_KEYS', {
                action: 'create',
                type: 'one_time_url',
                expiry: '5m',
            })
        ).throw();

        const response = this.parse(raw);

        if (response['error'] === undefined) {
            throw new Error('Unexpected DirectAdmin response while creating SSO link');
        }

        if (response['error'] != '0') {
            throw new Error('Error creating DirectAdmin SSO link: ' + (response['text'] ?? 'Unknown error'));
        }

        return response['details'] ?? '';
    }
}
