import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http, type HttpResponse } from '@/server/http';
import { randomPassword } from '@/server/lib/ids';
import { Domain } from '@/server/rules/Domain';
import type { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';

type Bag = Record<string, any>;

/** PHP `(int) $value` */
const toInt = (v: unknown) => Number.parseInt(String(v ?? ''), 10) || 0;

export default class Enhance extends Server {
    static meta = {
        name: 'Enhance',
        description: 'Enhance server extension',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/enhance',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHZpZXdib3g9IjAgMCA4OCA4OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBjbGFzcz0iaG92ZXI6c2NhbGUtMTIwIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHNpemUtMTggcm91bmRlZC14bCBwLTQgYmctWyMyMTE0NTFdIHJpbmctNiByaW5nLVsjNzM2M2FmXS80MCI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik01MC44ODc3IDQwLjYwNjFDNDguNjUwMyA0MC41OTYyIDQ2LjQ3MzggNDEuMzM0MyA0NC43MDM5IDQyLjcwMzFDNDIuOTM0IDQ0LjA3MTggNDEuNjcyMiA0NS45OTI4IDQxLjExOTEgNDguMTYwN0M0MC41NzU2IDUwLjMyNiA0MC43NzcxIDUyLjYxMTEgNDEuNjkxMSA1NC42NDc4QzQyLjYwNTEgNTYuNjg0NSA0NC4xNzg0IDU4LjM1NDEgNDYuMTU3MyA1OS4zODc0QzQ4LjE0MDEgNjAuNDMwOCA1MC40MTM0IDYwLjc4NTkgNTIuNjIgNjAuMzk2OUM1NC44MjY1IDYwLjAwNzggNTYuODQxMyA1OC44OTY3IDU4LjM0NzggNTcuMjM4Mkg4Ny4wOTJDODguMDcyNyA1MS45NjE4IDg3Ljg3MjcgNDYuNTMzOCA4Ni41MDYyIDQxLjM0NEM4NS4xMzk4IDM2LjE1NDIgODIuNjQwOSAzMS4zMzE1IDc5LjE4OTEgMjcuMjIyMkM3NS43MjI2IDIzLjA4ODEgNzEuMzkyMSAxOS43NjQgNjYuNTAyNCAxNy40ODM5QzYxLjYxMjggMTUuMjAzNyA1Ni4yODI4IDE0LjAyMjkgNTAuODg3NyAxNC4wMjQ2VjAuNzMyNDIyQzIzLjE0MjQgMC43MzI0MjIgMC42NTEzNjcgMjMuMDUwNyAwLjY1MTM2NyA1MC41ODI2SDE0LjA0MzRDMTQuMDQzNCA2Ni43NjkyIDI0Ljc3MDUgODEuMDE5OCA0MC40MDkgODUuNjIwNkM1Ni4wNTAxIDkwLjIyMTQgNzIuODczOCA4NC4wNzYyIDgxLjc2NDkgNzAuNTE5NUg2Mi45NjIxQzU5LjQgNzIuNjQwOSA1NS4zNDE4IDczLjc4NjMgNTEuMTk2MyA3My44NDAzQzQ3LjA1MDcgNzMuODk0NCA0Mi45NjQgNzIuODU1MSAzOS4zNDc5IDcwLjgyNzNDMzUuNzQzNiA2OC44MTQ5IDMyLjc0MDYgNjUuODc4NSAzMC42NDc5IDYyLjMyMDNDMjguNTU1MSA1OC43NjIxIDI3LjQ0ODEgNTQuNzEwNiAyNy40NDA4IDUwLjU4MjZIMTQuMDQzNEMxNC4wNDM0IDMwLjM5MiAzMC41Mzc3IDE0LjAyNDYgNTAuODg1IDE0LjAyNDZWMjcuMzE0QzYxLjI1MDMgMjcuMzI0OCA3MC4zODcxIDM0LjA4MjkgNzMuMzU0NCA0My45Mzc5SDU4LjM0MjRDNTcuNDAzNCA0Mi44ODk2IDU2LjI1MzkgNDIuMDUxIDU0Ljk2ODkgNDEuNDc2OUM1My42ODM5IDQwLjkwMjggNTIuMjkyNCA0MC42MDYxIDUwLjg4NSA0MC42MDYxSDUwLjg4NzdaIiBmaWxsPSIjMDBCRUQ5Ij48L3BhdGg+PC9zdmc+',
        extensionId: 'unknown',
    };

    private async request(url: string, method: 'get' | 'post' | 'patch' | 'delete' = 'get', data: Bag = {}): Promise<HttpResponse> {
        // Trim any leading slashes from the base url and add the path URL to it
        const reqUrl = String(this.config('host')).replace(/\/+$/, '') + '/api' + url;
        const response = await Http.withHeaders({
            Authorization: 'Bearer ' + this.config('apikey'),
            Accept: 'application/json',
        })[method](reqUrl, data);

        if (!response.successful()) {
            const body = response.body();
            throw new Error('An error occurred, got status code ' + response.status() + ' on ' + url + (body ? ' | Response: ' + body : ''));
        }

        return response;
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                type: 'text',
                label: 'Hostname',
                validation: 'url:http,https',
                required: true,
                placeholder: 'https://domain.com',
            },
            {
                name: 'apikey',
                type: 'text',
                label: 'API key',
                required: true,
                placeholder: '2cd0079b...',
            },
            {
                name: 'orgId',
                type: 'text',
                label: 'Organization ID',
                required: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Bag = {}): Promise<ConfigDefinition[]> {
        const plans = (await this.request('/orgs/' + this.config('orgId') + '/plans')).json();
        const options = plans['items'].map((plan: Bag) => ({
            value: plan['id'],
            label: plan['name'] + ' (' + plan['planType'] + ')',
        }));

        return [
            {
                name: 'plan',
                type: 'select',
                options,
                label: 'Enhance package ID',
                required: true,
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
            await this.request('/orgs/' + this.config('orgId'));

            return true;
        } catch (e: any) {
            return e.message;
        }
    }

    private async userOrgId(service: Service): Promise<any> {
        return (await (await service.rel('user'))!.relation('properties').where('key', 'enhance_orgId').first())!.value;
    }

    private async fetchUserOrg(user: User) {
        const existing = await user.relation('properties').where('key', 'enhance_orgId').first();
        if (existing) {
            return existing.value;
        }
        const name = await user.name();
        const response = (
            await this.request('/orgs/' + this.config('orgId') + '/customers', 'post', {
                name,
            })
        ).json();

        if (response['id'] !== undefined) {
            await user.relation('properties').create({
                key: 'enhance_orgId',
                value: response['id'],
                name: 'Enhance Org ID',
            });
        }

        // Create Login
        const loginResponse = (
            await this.request('/logins?orgId=' + response['id'], 'post', {
                email: user.email,
                name,
                password: randomPassword(),
            })
        ).json();

        // Create Org member
        await this.request('/orgs/' + response['id'] + '/members', 'post', {
            loginId: loginResponse['id'],
            roles: ['Owner'],
        });

        return response['id'];
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Bag, properties: Bag) {
        if (properties['subscription_id'] !== undefined) {
            throw new Error('Service has already been created');
        }
        const user = await this.fetchUserOrg((await service.rel('user'))!);

        settings = { ...settings, ...properties };

        const response = (
            await this.request('/orgs/' + this.config('orgId') + '/customers/' + user + '/subscriptions', 'post', {
                planId: toInt(settings['plan']),
            })
        ).json();

        if (response['id'] !== undefined) {
            await service.relation('properties').updateOrCreate(
                {
                    key: 'subscription_id',
                },
                {
                    name: 'Enhance Subscription ID',
                    value: response['id'],
                },
            );
        }

        const data: Bag = {
            domain: settings['domain'],
            subscriptionId: response['id'],
        };

        // Allow serverGroupId (uuid)
        if (settings['location'] !== undefined && settings['location'] !== null && settings['location'] !== '') {
            data['serverGroupId'] = await this.findServerGroup(settings['location']);
        }

        // Add domain
        await this.request('/orgs/' + user + '/websites', 'post', data);

        return true;
    }

    private async findServerGroup(serverGroupName: string) {
        const response = (await this.request('/servers/groups', 'get')).json();

        for (const group of response['items']) {
            if (group['name'] === serverGroupName || group['id'] === serverGroupName) {
                return group['id'];
            }
        }

        throw new Error('Server group not found');
    }

    private async assertCreated(service: Service, properties: Bag) {
        if (properties['subscription_id'] === undefined) {
            throw new Error('Service does not exist');
        }

        if (!(await service.relation('properties').where('key', 'subscription_id').exists())) {
            throw new Error('Missing user organization ID');
        }
    }

    /**
     * Suspend a server
     */
    async suspendServer(service: Service, _settings: Bag, properties: Bag) {
        await this.assertCreated(service, properties);

        await this.request('/orgs/' + (await this.userOrgId(service)) + '/subscriptions/' + properties['subscription_id'], 'patch', {
            isSuspended: true,
        });

        return true;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(service: Service, _settings: Bag, properties: Bag) {
        await this.assertCreated(service, properties);

        await this.request('/orgs/' + (await this.userOrgId(service)) + '/subscriptions/' + properties['subscription_id'], 'patch', {
            isSuspended: false,
        });

        return true;
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        await this.assertCreated(service, properties);

        await this.request('/orgs/' + (await this.userOrgId(service)) + '/subscriptions/' + properties['subscription_id'], 'delete');

        await service.relation('properties').where('key', 'subscription_id').delete();

        return true;
    }

    /**
     * Upgrade a server
     */
    async upgradeServer(service: Service, settings: Bag, properties: Bag) {
        await this.assertCreated(service, properties);

        await this.request('/orgs/' + (await this.userOrgId(service)) + '/subscriptions/' + properties['subscription_id'], 'patch', {
            planId: toInt(properties['plan'] ?? settings['plan']),
        });

        return true;
    }

    async getActions(service: Service, _settings: Bag, _properties: Bag) {
        if (!(await service.relation('properties').where('key', 'subscription_id').exists())) {
            throw new Error('Missing subscription ID');
        }

        return [
            {
                type: 'button' as const,
                label: 'Login Control Panel',
                function: 'ssoLink',
            },
        ];
    }

    async ssoLink(service: Service): Promise<string> {
        if (!(await service.relation('properties').where('key', 'subscription_id').exists())) {
            throw new Error('Missing user organization ID');
        }

        const orgId = await this.userOrgId(service);
        const members = (await this.request('/orgs/' + orgId + '/members', 'get')).json();

        // Find user where roles contains 'Owner' and loginId is equal to the user's loginId
        const member = members['items'].find((item: Bag) => (item['roles'] as string[]).includes('Owner'));

        return (await this.request('/orgs/' + orgId + '/members/' + member['id'] + '/sso', 'get')).json();
    }
}
