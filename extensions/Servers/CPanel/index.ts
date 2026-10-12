import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomString } from '@/server/lib/ids';
import { Domain } from '@/server/rules/Domain';
import type { Service } from '@/server/models/Service';

export default class CPanel extends Server {
    static meta = {
        name: 'cPanel',
        description: 'cPanel server extension',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/cpanel',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA0IiBoZWlnaHQ9IjcwIiB2aWV3Ym94PSIwIDAgMTA0IDcwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJob3ZlcjpzY2FsZS0xMjAgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgc2l6ZS0xOCByb3VuZGVkLXhsIHAtNCBiZy1bI0ZGNkMyQ10gcmluZy02IHJpbmctWyNGRjZDMkNdLzMwIj48cGF0aCBkPSJNMjYuMjI2IDE3LjQ0OTRINDUuODQwN0w0Mi44MDYgMjkuMDc5NEM0Mi4zODg4IDMwLjYzMTEgNDEuNDc0MSAzMi4wMDMxIDQwLjIwMjIgMzIuOTg1QzM4LjkzNzUgMzMuOTY2IDM3LjM3NjIgMzQuNDg2NCAzNS43NzU5IDM0LjQ2MDVIMjYuNjU5OUMyNC42NzQ5IDM0LjQzMyAyMi43Mzg1IDM1LjA3NTEgMjEuMTYzMiAzNi4yODMxQzE5LjU0OTIgMzcuNTMyNSAxOC4zNzgxIDM5LjI2NjMgMTcuODIxNyA0MS4yMzAyQzE3LjQxOTkgNDIuNjczMiAxNy4zNzUyIDQ0LjE5MjMgMTcuNjkxNSA0NS42NTY1QzE3Ljk4MjIgNDYuOTkxOSAxOC41NTUzIDQ4LjI0OTYgMTkuMzcyNCA0OS4zNDUxQzIwLjIwMDMgNTAuNDMwMiAyMS4yNzAyIDUxLjMwNyAyMi40OTY5IDUxLjkwNTRDMjMuNzkxMSA1Mi41NDY5IDI1LjIxODQgNTIuODc0IDI2LjY2MjggNTIuODYwMUgzMi4yMTc0QzMyLjcxMzUgNTIuODUxNiAzMy4yMDQ0IDUyLjk2MTMgMzMuNjQ5NiA1My4xODAxQzM0LjA5NDkgNTMuMzk4OSAzNC40ODE2IDUzLjcyMDcgMzQuNzc3OCA1NC4xMTg2QzM1LjEwMjMgNTQuNTAyOSAzNS4zMjUzIDU0Ljk2MjUgMzUuNDI2NCA1NS40NTUzQzM1LjUyNzUgNTUuOTQ4IDM1LjUwMzQgNTYuNDU4MyAzNS4zNTY0IDU2LjkzOTNMMzEuODg0OCA2OS43ODQ0SDI1LjgwOTRDMjEuODEwNSA2OS44MjQzIDE3Ljg2MjYgNjguODg1OCAxNC4zMDk2IDY3LjA1MDVDMTAuODk3NSA2NS4zMDg5IDcuOTEyOTMgNjIuODM0MSA1LjU2OTczIDU5LjgwMzRDMy4yNDY1IDU2Ljc3NTggMS42MzAzIDUzLjI2NjYgMC44Mzk2MTcgNDkuNTMzMkMwLjAwMDc4NzIyOCA0NS42MTA5IDAuMTA1ODk0IDQxLjU0NTQgMS4xNDYyOCAzNy42NzE3TDEuNDkzNDQgMzYuMzY5OUMyLjk2MTU4IDMwLjkzMjIgNi4xNzgxNyAyNi4xMjg2IDEwLjY0NyAyMi43MDAzQzEyLjgzODUgMjEuMDM4NiAxNS4yNzk3IDE5LjczNSAxNy44Nzk2IDE4LjgzODFDMjAuNTYzNCAxNy45MDc1IDIzLjM4NTQgMTcuNDM4IDI2LjIyNiAxNy40NDk0WiIgZmlsbD0id2hpdGUiPjwvcGF0aD48cGF0aCBkPSJNMzYuMTIwMSA2OS43ODM2TDUzLjIyMDggNS43MzE4NUM1My42MzggNC4xODAxNiA1NC41NTI3IDIuODA4MTYgNTUuODI0NiAxLjgyNjI2QzU3LjA4OCAwLjg0NTA5OSA1OC42NDg1IDAuMzI0NTg4IDYwLjI0OCAwLjM1MDgxMUg3OC4zOTAyQzgyLjM4OSAwLjMxMTIzMiA4Ni4zMzY5IDEuMjQ5NzggODkuODkgMy4wODQ3M0M5My4yOTg2IDQuODIzNzQgOTYuMjc3OCA3LjI5ODkzIDk4LjYxMTkgMTAuMzMxMUMxMDAuOTQ2IDEzLjM2MzMgMTAyLjU3NyAxNi44NzY1IDEwMy4zODYgMjAuNjE2NUMxMDQuMjU1IDI0LjUzOCAxMDQuMTM1IDI4LjYxMzkgMTAzLjAzOSAzMi40Nzc5TDEwMi42OTIgMzMuNzc5OEMxMDEuOTYgMzYuNTExOSAxMDAuNzg3IDM5LjEwNjMgOTkuMjIwMSA0MS40NjA4Qzk2LjkwMTEgNDQuOTUxNyA5My43NTMgNDcuODEzNCA5MC4wNTc0IDQ5Ljc4OTlDODYuMzYxOCA1MS43NjY0IDgyLjIzNCA1Mi43OTYyIDc4LjA0MzEgNTIuNzg3SDYyLjMzMzlMNjUuNDU4NCA0MS4wNzAyQzY1Ljg5MjYgMzkuNTUwMiA2Ni44MDU3IDM4LjIxMDkgNjguMDYyMSAzNy4yNTE0QzY5LjMyNjggMzYuMjcwNSA3MC44ODgxIDM1Ljc1IDcyLjQ4ODQgMzUuNzc2SDc3LjUyMjNDNzkuNTQ5NyAzNS43NzgyIDgxLjUyMDIgMzUuMTA1NiA4My4xMjMxIDMzLjg2NDFDODQuNzI2IDMyLjYyMjcgODUuODcwMSAzMC44ODMgODYuMzc1IDI4LjkxOTVDODYuNzc0NCAyNy41Mjk5IDg2LjgxNDIgMjYuMDYxNSA4Ni40OTA3IDI0LjY1MjNDODYuMTk2NiAyMy4zMTYgODUuNjE5NSAyMi4wNTgyIDg0Ljc5ODMgMjAuOTYzN0M4My45NjM3IDE5Ljg3MzkgODIuODk2MiAxOC45ODQzIDgxLjY3MzggMTguMzU5OUM4MC4zOTIxIDE3LjY5MzYgNzguOTY2OCAxNy4zNTEgNzcuNTIyMyAxNy4zNjE4SDY3LjgwMTdMNTUuMTMwMiA2NC40ODkzQzU0LjY5NiA2Ni4wMDk0IDUzLjc4MjkgNjcuMzQ4NyA1Mi41MjY1IDY4LjMwODFDNTEuMjkgNjkuMjc5NSA0OS43NTkyIDY5Ljc5OTkgNDguMTg3IDY5Ljc4MzZIMzYuMTIwMVoiIGZpbGw9IndoaXRlIj48L3BhdGg+PC9zdmc+',
        extensionId: 'unknown',
    };

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
