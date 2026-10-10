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
