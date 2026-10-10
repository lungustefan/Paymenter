import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import type { Service } from '@/server/models/Service';

type Bag = Record<string, any>;

export default class Virtfusion extends Server {
    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                type: 'text',
                label: 'Hostname',
                required: true,
                validation: 'url',
            },
            {
                name: 'apikey',
                type: 'text',
                label: 'API key',
                required: true,
                encrypted: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Bag = {}): Promise<ConfigDefinition[]> {
        const apiPackages = await this.request('/packages');
        const packages: Record<string, string> = {};
        for (const pkg of apiPackages['data']) {
            packages[pkg['id']] = pkg['name'];
        }

        // We need to wait for a virtfusion update to get hypervisors
        const apiHypervisors = await this.request('/compute/hypervisors/groups');
        const hypervisors: Record<string, string> = {};
        for (const hypervisor of apiHypervisors['data']) {
            hypervisors[hypervisor['id']] = hypervisor['name'];
        }

        return [
            {
                name: 'package',
                type: 'select',
                label: 'Package',
                required: true,
                options: packages,
            },
            {
                name: 'hypervisor',
                type: 'select',
                label: 'Hypervisor Group ID',
                required: true,
                description: 'The default Hypervisor group ID',
                options: hypervisors,
            },
            {
                name: 'ipv4',
                type: 'number',
                label: 'Default IPv4',
                description: 'The default amount of IPv4 addresses to assign to the server',
                required: true,
                validation: 'integer|min:1',
            },
        ];
    }

    /**
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        try {
            await this.request('/connect');
        } catch (e: any) {
            return e.message;
        }

        return true;
    }

    /**
     * Do a request to the Virtfusion API
     */
    async request(url: string, method: 'get' | 'post' | 'delete' = 'get', data: Bag = {}): Promise<Bag> {
        // Trim any leading slashes from the base url and add the path URL to it
        const reqUrl = String(this.config('host')).replace(/\/+$/, '') + '/api/v1' + url;
        const response = await Http.withHeaders({
            Authorization: 'Bearer ' + this.config('apikey'),
            Accept: 'application/json',
        })[method](reqUrl, data);

        if (!response.successful()) {
            throw new Error('An error occurred, got status code ' + response.status() + ' on ' + reqUrl);
        }

        return response.json() ?? [];
    }

    /**
     * Get or create a user on VirtFusion
     */
    async getUser(service: Service): Promise<string> {
        const user = (await service.rel('user'))!;
        let response: Bag;
        try {
            response = await this.request('/users/' + user.id + '/byExtRelation');
        } catch {
            try {
                response = await this.request('/users', 'post', {
                    email: user.email,
                    name: await user.name(),
                    extRelationId: user.id,
                });
            } catch {
                throw new Error('Failed to create user, this is probably due to a wrong extRelationId');
            }
        }

        return String(response?.data?.id ?? '');
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Bag, properties: Bag) {
        if (properties['server_id'] !== undefined) {
            throw new Error('Server already exists');
        }

        let data: Bag = {
            packageId: settings['package'],
            userId: await this.getUser(service),
            hypervisorId: settings['hypervisor'],
            ipv4: settings['ipv4'],
        };
        // Allowed data to be overwritten
        const allowed = ['ipv4', 'packageId', 'hypervisorId', 'storage', 'memory', 'traffic', 'networkSpeedInbound', 'networkSpeedOutbound', 'cpuCores', 'networkProfile', 'storageProfile'];
        const merged = { ...settings, ...properties };
        const overrides = Object.fromEntries(Object.entries(merged).filter(([key]) => allowed.includes(key)));
        data = { ...data, ...overrides };

        const response = await this.request('/servers', 'post', data);

        await service.relation('properties').updateOrCreate(
            {
                key: 'server_id',
            },
            {
                name: 'VirtFusion Server ID',
                value: response['data']['id'],
            },
        );

        return response['data'];
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('/servers/' + properties['server_id'] + '/suspend', 'post');

        return true;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('/servers/' + properties['server_id'] + '/unsuspend', 'post');

        return true;
    }

    /**
     * Terminate a server
     */
    async terminateServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('/servers/' + properties['server_id'], 'delete');

        return true;
    }

    getActions(_service: Service) {
        return [
            {
                type: 'button' as const,
                label: 'Go to Server',
                function: 'ssoLink',
            },
        ];
    }

    async ssoLink(service: Service): Promise<string> {
        const user = (await service.rel('user'))!;
        const data = await this.request('/users/' + user.id + '/authenticationTokens', 'post');

        return String(this.config('host')).replace(/\/+$/, '') + data['data']['authentication']['endpoint_complete'];
    }
}
