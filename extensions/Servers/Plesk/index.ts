import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomPassword } from '@/server/lib/ids';
import { Domain } from '@/server/rules/Domain';
import type { Service } from '@/server/models/Service';

type Bag = Record<string, any>;

export default class Plesk extends Server {
    private async request(endpoint: string, method: 'get' | 'post' | 'put' | 'delete' = 'get', data: Bag = {}) {
        const host = String(this.config('host')).replace(/\/+$/, '');
        const response = await Http.withHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
        })
            .withBasicAuth(this.config<string>('username') as string, this.config<string>('password') as string)
            .withoutVerifying()
            [method](host + '/api/v2' + endpoint, data);

        return response.throw();
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                label: 'Host',
                type: 'text',
                required: true,
                description: 'The IP address or domain name of the Plesk server (with http:// or https://)',
            },
            {
                name: 'username',
                label: 'Username',
                type: 'text',
                required: true,
                description: 'The username of the Plesk server',
            },
            {
                name: 'password',
                label: 'Password',
                type: 'password',
                required: true,
                description: 'The password of the Plesk server',
            },
        ];
    }

    /**
     * Get product config
     */
    getProductConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'plan',
                type: 'text',
                label: 'Plan',
                required: true,
                description: 'The plan name of the wanted service plan',
            },
        ];
    }

    /**
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        try {
            (await this.request('/server', 'get')).json();

            return true;
        } catch (e: any) {
            return e.message;
        }
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
    async createServer(service: Service, settings: Bag, properties: Bag) {
        const owner = (await service.rel('user'))!;
        const ownerName = await owner.name();
        const returnData: Bag = {
            domain: properties['domain'],
            username: ownerName.replace(/[^A-Za-z0-9\-]/g, '').toLowerCase(),
            ftp_password: randomPassword(12),
        };

        const pleskCustomerId = (await owner.rel('properties')).find((p) => p.key === 'plesk_id');

        let user: Bag;
        try {
            // Check if user exists (a missing property is an error like in the PHP release)
            if (!pleskCustomerId) throw new Error('Attempt to read property "value" on null');
            user = (await this.request('/clients/' + pleskCustomerId.value)).json();
        } catch {
            returnData['password'] = randomPassword(12);

            user = (
                await this.request('/clients', 'post', {
                    username: returnData['username'],
                    email: owner.email,
                    password: returnData['password'],
                    name: ownerName,
                    login: returnData['username'],
                    type: 'customer',
                    external_id: owner.id,
                })
            ).json();

            await owner.relation('properties').create({
                key: 'plesk_id',
                name: 'Plesk ID',
                value: user['id'],
            });
        }

        returnData['client_id'] = user['id'];

        const response = (
            await this.request('/domains', 'post', {
                name: properties['domain'],
                external_id: service.id,
                owner_client: {
                    id: returnData['client_id'],
                    login: 'owner',
                    guid: user['guid'],
                    external_id: owner.id,
                },
                hosting_type: 'virtual',
                hosting_settings: {
                    ftp_login: returnData['username'],
                    ftp_password: returnData['ftp_password'],
                },
                plan: {
                    name: settings['plan'],
                },
            })
        ).json();

        await service.relation('properties').updateOrCreate(
            {
                key: 'domain_id',
            },
            {
                name: 'Plesk Domain ID',
                value: response['id'],
            },
        );

        return returnData;
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['domain_id'] === undefined) {
            throw new Error('Service has not been created');
        }

        await this.request('/domains/' + properties['domain_id'] + '/status', 'put', {
            status: 'suspended',
        });

        return true;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['domain_id'] === undefined) {
            throw new Error('Service has not been created');
        }

        await this.request('/domains/' + properties['domain_id'] + '/status', 'put', {
            status: 'active',
        });

        return true;
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        if (properties['domain_id'] === undefined) {
            throw new Error('Service has not been created');
        }

        await this.request('/domains/' + properties['domain_id'], 'delete');

        await service.relation('properties').where('key', 'domain_id').delete();

        return true;
    }
}
