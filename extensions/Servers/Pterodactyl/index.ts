import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomString } from '@/server/lib/ids';
import { transliterate, truthy } from '@/server/lib/php';
import type { Service } from '@/server/models/Service';

type Bag = Record<string, any>;

/** PHP `(int) $value` */
const toInt = (v: unknown) => Number.parseInt(String(v ?? ''), 10) || 0;
/** `isset($value)` */
const isset = (v: unknown): boolean => v !== undefined && v !== null;
/** loose `==` between a port number and a configured port */
const samePort = (a: unknown, b: unknown) => String(a) === String(b);

interface Allocation {
    port: number;
    id: number;
}

/**
 * Class Pterodactyl
 */
export default class Pterodactyl extends Server {
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'host',
                label: 'Pterodactyl URL',
                type: 'text',
                description: 'Pterodactyl URL',
                required: true,
                validation: 'url',
            },
            {
                name: 'api_key',
                label: 'Pterodactyl API Key',
                type: 'text',
                description: 'Pterodactyl API Key',
                required: true,
                encrypted: true,
            },
        ];
    }

    async testConfig(): Promise<boolean | string> {
        try {
            await this.request('/api/application/servers', 'GET');
        } catch (e: any) {
            return e.message;
        }

        return true;
    }

    async request(url: string, method: string = 'get', data: Bag = {}): Promise<Bag> {
        // Trim any leading slashes from the base url and add the path URL to it
        const reqUrl = String(this.config('host')).replace(/\/+$/, '') + url;
        const response = await (
            Http.withHeaders({
                Authorization: 'Bearer ' + this.config('api_key'),
                Accept: 'application/json',
            }) as any
        )[method.toLowerCase()](reqUrl, data);

        if (!response.successful()) {
            throw new Error(response.json()['errors'][0]['detail']);
        }

        return response.json() ?? [];
    }

    async getProductConfig(values: Bag = {}): Promise<ConfigDefinition[]> {
        const nodes = await this.request('/api/application/nodes');
        const nodeList: Record<string, string> = {};
        for (const node of nodes['data']) {
            nodeList[node['attributes']['id']] = node['attributes']['name'];
        }

        const location = await this.request('/api/application/locations');
        const locationList: Record<string, string> = {};
        for (const loc of location['data']) {
            locationList[loc['attributes']['id']] = loc['attributes']['short'];
        }

        const nests = await this.request('/api/application/nests');
        const nestList: Record<string, string> = {};
        for (const nest of nests['data']) {
            nestList[nest['attributes']['id']] = nest['attributes']['name'];
        }

        const eggList: Record<string, string> = {};
        if (isset(values['nest_id']) && values['nest_id'] !== '') {
            try {
                const eggs = await this.request('/api/application/nests/' + values['nest_id'] + '/eggs');
                for (const egg of eggs['data']) {
                    eggList[egg['attributes']['id']] = egg['attributes']['name'];
                }
            } catch {
                /* ignored */
            }
        }

        const usingPortArray = isset(values['port_array']) && values['port_array'] !== '';

        return [
            {
                name: 'location_ids',
                label: 'Location(s)',
                type: 'select',
                description: 'Location(s) where the server will be installed',
                options: locationList,
                multiple: true,
                database_type: 'array',
                required: false,
            },
            {
                name: 'node',
                label: 'Node',
                type: 'select',
                description: 'Fill in to install the server on a specific node',
                options: nodeList,
            },
            {
                name: 'nest_id',
                label: 'Nest ID',
                type: 'select',
                options: nestList,
                description: 'Nest ID to fetch the eggs from',
                required: true,
                // Lets fetch the eggs every time the nest id changes
                live: true,
            },
            {
                name: 'egg_id',
                label: 'Egg ID',
                type: 'select',
                options: eggList,
                required: true,
            },
            {
                name: 'memory',
                label: 'Memory',
                type: 'number',
                suffix: 'MiB',
                required: true,
                validation: 'numeric',
                min_value: 0,
                description: 'Set to 0 for unlimited',
            },
            {
                name: 'swap',
                label: 'Swap',
                type: 'number',
                min_value: -1,
                suffix: 'MiB',
                required: true,
                description: 'Set to -1 for unlimited, or to 0 to disable swap',
            },
            {
                name: 'disk',
                label: 'Disk',
                type: 'number',
                suffix: 'MiB',
                required: true,
                min_value: 0,
                description: 'Set to 0 for unlimited',
            },
            {
                name: 'io',
                label: 'IO Weight',
                type: 'number',
                required: true,
                default: 500,
                min_value: 10,
                max_value: 1000,
                description: 'The IO Weight is the priority given to this server for disk access.',
                hint: '<a href="https://docs.docker.com/engine/reference/run/#block-io-bandwidth-blkio-constraint" target="_blank">Documentation</a>',
                hintHtml: true,
            },
            {
                name: 'cpu',
                label: 'CPU Limit',
                type: 'number',
                required: true,
                min_value: 0,
                suffix: '%',
                description: 'Set to 0 for unlimited',
            },
            {
                name: 'cpu_pinning',
                label: 'CPU Pinning',
                type: 'text',
                description: 'Leave empty for no pinning. Used to specify what threads should be used. Example: 0,2-4,5,6',
                validation: 'regex:/^[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*$/',
            },
            {
                name: 'databases',
                label: 'Databases',
                type: 'number',
                required: true,
                min_value: 0,
            },
            {
                name: 'backups',
                label: 'Backups',
                type: 'number',
                required: true,
                min_value: 0,
            },
            {
                name: 'additional_allocations',
                label: 'Additional Allocations',
                type: 'number',
                required: true,
                min_value: 0,
            },
            {
                name: 'port_array',
                label: 'Port Array',
                type: 'text',
                description: 'Used to assign ports to egg variables.',
                hint: '<a href="https://paymenter.org/docs/extensions/pterodactyl#port-array" target="_blank">Documentation</a>',
                hintHtml: true,
                live: true,
                validation: 'json',
            },
            {
                name: 'port_range',
                label: 'Port ranges',
                type: 'tags',
                description: '',
                database_type: 'array',
                required: false,
                disabled: usingPortArray,
            },
            {
                name: 'skip_scripts',
                label: 'Skip Egg Install Script',
                description: 'If the selected Egg has an install script attached to it, the script will run during the install. If you would like to skip this step, check this box.',
                type: 'checkbox',
            },
            {
                name: 'dedicated_ip',
                label: 'Dedicated IP',
                description: 'Assigns the server an allocation whose IP is not being used by any other server.',
                type: 'checkbox',
                disabled: usingPortArray,
            },
            {
                name: 'start_on_completion',
                label: 'Start on completion',
                description: 'Start server automatically after installation.',
                type: 'checkbox',
            },
            {
                name: 'oom_killer',
                label: 'Enable OOM Killer',
                description: 'Terminates the server if it breaches the memory limits. Enabling OOM killer may cause server processes to exit unexpectedly.',
                type: 'checkbox',
            },
        ];
    }

    async createServer(service: Service, settings: Bag, properties: Bag) {
        if (await this.getServer(service.id, false)) {
            throw new Error('Server already exists');
        }
        // Smash the properties into the settings
        settings = { ...settings, ...properties };

        const eggData = await this.request('/api/application/nests/' + settings['nest_id'] + '/eggs/' + settings['egg_id'], 'get', { include: 'variables' });
        if (!isset(eggData['attributes'])) {
            throw new Error('Could not fetch egg data');
        }
        const environment: Bag = {};
        for (const variable of eggData['attributes']['relationships']['variables']['data']) {
            environment[variable['attributes']['env_variable']] = settings[variable['attributes']['env_variable']] ?? variable['attributes']['default_value'];
        }

        const orderUser = (await service.rel('user'))!;
        // Get the user id if one already exists...
        let user: any = (await this.request('/api/application/users', 'get', { filter: { email: orderUser.email } }))['data']?.[0]?.['attributes']?.['id'] ?? null;

        // Otherwise create a new user
        if (!truthy(user)) {
            user = (
                await this.request('/api/application/users', 'post', {
                    email: orderUser.email,
                    username: transliterate(await orderUser.name()).toLowerCase().replace(/[^a-zA-Z0-9]/g, '') + '_' + randomString(4),
                    first_name: orderUser.first_name ?? '',
                    last_name: orderUser.last_name ?? '',
                })
            )['attributes']['id'];
        }

        if (isset(settings['location'])) {
            settings['location_ids'] = [settings['location']];
        }

        const deploymentData = await this.generateDeploymentData(settings, environment);

        const product = (await service.rel('product'))!;
        const serverCreationData: Bag = {
            external_id: String(service.id),
            name: isset(settings['servername']) ? settings['servername'] : product.name + ' #' + service.id,
            user: toInt(user),
            egg: settings['egg_id'],
            docker_image: isset(settings['docker_image']) ? settings['docker_image'] : eggData['attributes']['docker_image'],
            startup: eggData['attributes']['startup'],
            environment: deploymentData['environment'],
            skip_scripts: settings['skip_scripts'] ?? false,
            oom_disabled: !truthy(settings['oom_killer'] ?? false),
            limits: {
                memory: toInt(settings['memory']),
                swap: toInt(settings['swap']),
                disk: toInt(settings['disk']),
                io: toInt(settings['io']),
                threads: settings['cpu_pinning'] ?? null,
                cpu: toInt(settings['cpu']),
            },
            feature_limits: {
                databases: toInt(settings['databases']),
                allocations: deploymentData['allocations_needed'] + toInt(settings['additional_allocations']),
                backups: toInt(settings['backups']),
            },
            start_on_completion: settings['start_on_completion'] ?? false,
        };
        if (deploymentData['auto_deploy']) {
            serverCreationData['deploy'] = {
                // (array) cast
                locations: Array.isArray(settings['location_ids']) ? settings['location_ids'] : isset(settings['location_ids']) ? [settings['location_ids']] : [],
                dedicated_ip: settings['dedicated_ip'] ?? false,
                port_range: settings['port_range'] ?? [],
            };
        } else {
            serverCreationData['allocation'] = deploymentData['allocation'];
        }

        const server = await this.request('/api/application/servers', 'post', serverCreationData);

        return {
            server: server['attributes']['id'],
            link: this.config('host') + '/server/' + server['attributes']['identifier'],
        };
    }

    /** the free allocations of a node: `[{ port, id }]` */
    private availablePorts(node: Bag): Allocation[] {
        return (node['relationships']['allocations']['data'] as Bag[])
            .filter((port) => !truthy(port['attributes']['assigned']))
            .map((port) => ({
                port: port['attributes']['port'],
                id: port['attributes']['id'],
            }));
    }

    private async deployableNodes(settings: Bag): Promise<Bag[]> {
        const nodes = await this.request('/api/application/nodes/deployable', 'get', {
            memory: settings['memory'],
            disk: settings['disk'],
            location_ids: settings['location_ids'] ?? [],
            include: ['allocations'],
        });
        return nodes['data'];
    }

    private async generateDeploymentData(settings: Bag, environment: Bag): Promise<Bag> {
        if (!isset(settings['port_array']) || settings['port_array'] === '') {
            if (truthy(settings['node'])) {
                // Only get one allocation from the node
                const nodes = await this.deployableNodes(settings);
                const nodesById = new Map<string, Bag>(nodes.map((node) => [String(node['attributes']['id']), node['attributes']]));

                if (!nodesById.has(String(settings['node']))) {
                    throw new Error('Node is not suitable for deployment.');
                }
                const node = nodesById.get(String(settings['node']))!;
                const availablePorts = this.availablePorts(node);
                if (availablePorts.length === 0) {
                    throw new Error('No available allocations found on the selected node.');
                }
                const allocation = availablePorts[0];
                environment['SERVER_PORT'] = allocation['port'];

                // Return the allocation id for the SERVER_PORT
                return {
                    auto_deploy: false,
                    environment,
                    allocations_needed: 1,
                    allocation: {
                        default: allocation['id'],
                        additional: [],
                    },
                };
            }

            return {
                auto_deploy: true,
                environment,
                allocations_needed: 1,
            };
        }

        let portArray: any;
        try {
            // Example: {"SERVER_PORT": 7777, "NONE": [7778, 7779], "QUERY_PORT": 2701, "RCON_PORT": 27020}
            portArray = JSON.parse(settings['port_array']);
        } catch {
            throw new Error('Invalid JSON in port array');
        }

        if (portArray === null || typeof portArray !== 'object') {
            throw new Error('Port array must be an array');
        }

        const nodes = await this.deployableNodes(settings);
        const nodesById = new Map<string, Bag>(nodes.map((node) => [String(node['attributes']['id']), node['attributes']]));

        const freeAllocationsNeeded = (Object.values(portArray) as any[]).reduce((sum: number, value) => sum + (Array.isArray(value) ? value.length : 1), 0);

        let availablePorts: Allocation[] = [];
        if (truthy(settings['node'])) {
            // If the product's node id is not in the deployable nodes array, throw error.
            if (!nodesById.has(String(settings['node']))) {
                throw new Error('Node is not suitable for deployment.');
            }

            const node = nodesById.get(String(settings['node']))!;
            availablePorts = this.availablePorts(node);

            if (availablePorts.length < freeAllocationsNeeded) {
                throw new Error(`Not enough allocations found for deployment. Found: ${availablePorts.length}, Required: ${freeAllocationsNeeded}`);
            }
        } else {
            for (let index = 0; index < nodes.length; index++) {
                availablePorts = this.availablePorts(nodes[index]['attributes']);

                if (availablePorts.length < freeAllocationsNeeded) {
                    // If this was last viable node, throw error
                    if (index == nodes.length - 1) {
                        throw new Error('No nodes with suitable allocations found for deployment');
                    }

                    // Else move onto next viable node
                    continue;
                }
                break;
            }
        }

        const take = (port: unknown): Allocation => {
            let allocation = availablePorts.find((p) => samePort(p.port, port));
            if (!allocation) {
                // try to assign a higher port, if that fails try a random port
                allocation = availablePorts.find((p) => Number(p.port) > Number(port));
                if (!allocation) {
                    if (availablePorts.length === 0) throw new Error('You requested 1 items, but there are only 0 items available.');
                    allocation = availablePorts[Math.floor(Math.random() * availablePorts.length)];
                }
            }
            // Remove the port from the available ports
            availablePorts = availablePorts.filter((p) => p.id != allocation!.id);
            return allocation;
        };

        const allocations: Record<string, Allocation | Allocation[]> = {};
        for (const [key, value] of Object.entries<any>(portArray)) {
            if (Array.isArray(value)) {
                for (const port of value) {
                    const allocation = take(port);
                    ((allocations[key] ??= []) as Allocation[]).push(allocation);
                }
            } else {
                allocations[key] = take(value);
            }
        }

        const allocationIds: number[] = [];

        for (const [key, value] of Object.entries(allocations)) {
            // Assign the allocations to the environment
            if (key !== 'NONE') {
                if (isset(environment[key])) {
                    // (`$value['port']` on a list of allocations is an undefined key error)
                    if (Array.isArray(value)) throw new Error('Undefined array key "port"');
                    environment[key] = value['port'];
                }
            }

            // Set allocations to a array with only the ids
            if (key !== 'SERVER_PORT') {
                if (Array.isArray(value) && isset(value[0])) {
                    for (const v of value) {
                        allocationIds.push(v['id']);
                    }
                } else {
                    allocationIds.push((value as Allocation)['id']);
                }
            }
        }

        return {
            auto_deploy: false,
            allocations_needed: freeAllocationsNeeded,
            environment,
            allocation: {
                default: (allocations['SERVER_PORT'] as Allocation)['id'],
                additional: allocationIds,
            },
        };
    }

    private async getServer(id: unknown, failIfNotFound = true, raw = false): Promise<any> {
        let response: Bag;
        try {
            response = await this.request('/api/application/servers/external/' + id);
        } catch {
            if (failIfNotFound) {
                throw new Error('Server not found');
            } else {
                return false;
            }
        }
        if (raw) {
            return response;
        }

        return response['attributes']?.['id'] ?? false;
    }

    async suspendServer(service: Service, _settings: Bag, _properties: Bag) {
        const server = await this.getServer(service.id);

        await this.request('/api/application/servers/' + server + '/suspend', 'post');

        return true;
    }

    async unsuspendServer(service: Service, _settings: Bag, _properties: Bag) {
        const server = await this.getServer(service.id);

        await this.request('/api/application/servers/' + server + '/unsuspend', 'post');

        return true;
    }

    async terminateServer(service: Service, _settings: Bag, _properties: Bag) {
        const server = await this.getServer(service.id);

        await this.request('/api/application/servers/' + server, 'delete');

        return true;
    }

    async upgradeServer(service: Service, settings: Bag, properties: Bag) {
        const server = await this.getServer(service.id, true, true);

        settings = { ...settings, ...properties };

        let updateServerData: Bag = {
            allocation: server['attributes']['allocation'],
            memory: toInt(settings['memory']),
            swap: toInt(settings['swap']),
            disk: toInt(settings['disk']),
            io: toInt(settings['io']),
            cpu: toInt(settings['cpu']),
            threads: settings['cpu_pinning'] ?? null,
            feature_limits: {
                databases: settings['databases'],
                allocations: settings['additional_allocations'],
                backups: settings['backups'],
            },
        };

        await this.request('/api/application/servers/' + server['attributes']['id'] + '/build', 'patch', updateServerData);

        const eggData = await this.request('/api/application/nests/' + settings['nest_id'] + '/eggs/' + settings['egg_id'], 'get', { include: 'variables' });

        if (!isset(eggData['attributes'])) {
            throw new Error('Could not fetch egg data');
        }

        const environment: Bag = {};

        for (const variable of eggData['attributes']['relationships']['variables']['data']) {
            const name = variable['attributes']['env_variable'];
            // Check if variable has been set on server
            if (isset(server['attributes']['container']?.['environment']?.[name])) {
                environment[name] = server['attributes']['container']['environment'][name];
            } else {
                environment[name] = settings[name] ?? variable['attributes']['default_value'];
            }
        }

        updateServerData = {
            environment,
            skip_scripts: settings['skip_scripts'] ?? false,
            oom_disabled: !truthy(settings['oom_killer'] ?? false),
            egg: settings['egg_id'],
            image: server['attributes']['container']?.['image'] ?? eggData['attributes']['docker_image'],
            startup: server['attributes']['container']?.['startup_command'] ?? settings['startup'] ?? eggData['attributes']['startup'],
        };

        await this.request('/api/application/servers/' + server['attributes']['id'] + '/startup', 'patch', updateServerData);

        return true;
    }

    async getActions(service: Service) {
        const server = await this.getServer(service.id, true, true);

        return [
            {
                type: 'button' as const,
                label: 'Go to server',
                url: this.config('host') + '/server/' + server['attributes']['identifier'],
            },
        ];
    }
}
