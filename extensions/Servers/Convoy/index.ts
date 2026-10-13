import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomPassword } from '@/server/lib/ids';
import { truthy } from '@/server/lib/php';
import type { Product } from '@/server/models/Product';
import type { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';
import { Hostname } from './Rules/Hostname';

type Bag = Record<string, any>;

/** PHP `(int) $value` */
const toInt = (v: unknown) => Number.parseInt(String(v ?? ''), 10) || 0;
/** `a ?? b` over two possibly missing values */
const pick = (a: Bag, b: Bag, key: string) => a[key] ?? b[key];

export default class Convoy extends Server {
    static meta = {
        name: 'Convoy',
        description: 'Convoy server extension',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/convoy',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODciIGhlaWdodD0iODgiIHZpZXdib3g9IjAgMCA4NyA4OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBjbGFzcz0iaG92ZXI6c2NhbGUtMTIwIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHNpemUtMTggcm91bmRlZC14bCBwLTQgYmctWyMxQjFCMUJdIHJpbmctNiByaW5nLXdoaXRlLzEwIj48ZyBjbGlwLXBhdGg9InVybCgjY2xpcDBfNzA1XzEzNzApIj48cGF0aCBkPSJNNjQuNzM3NCA0LjU2NjcxQzYxLjc1ODkgNy40NzU5NiA2MC41MjAzIDExLjQ2MzUgNjEuMDIzMiAxNS4yNzA1TDQzLjE3NDUgMTEuNDkzOUM0MC45NzkxIDExLjA1NjggMzguNjA5OCAxMS42NzExIDM2Ljg5NyAxMy4zNDM0QzM0LjE2NDkgMTYuMDEzIDM0LjE0MTMgMjAuMzYzNCAzNi44NDQ3IDIzLjA2QzM3LjgxNSAyNC4wMjg2IDM5LjAwNjQgMjQuNjQ2MyA0MC4yNTg1IDI0LjkyNDdWMjQuOTI5OEw0MC40MjM5IDI0Ljk2NTJDNDAuNDIzOSAyNC45NjUyIDQwLjQyNTYgMjQuOTY1MiA0MC40MjcyIDI0Ljk2NTJMNTEuMzc1NyAyNy4yODIxTDE3LjkwNTkgNTkuOTg1OUMxMy44MzczIDUzLjA1MDMgMTMuMTM1MyA0NC43MjQxIDE1Ljc4NjQgMzcuMzExSDE1Ljc4M0MxNy4xMTk1IDMzLjY5NDYgMTUuMjc2NyAyOS43MDg4IDExLjY2NzIgMjguNDA3N0M4LjA1NzYyIDI3LjEwNjYgNC4wNDY0NCAyOC45ODE1IDIuNzA5OTQgMzIuNTk2MUMtMi40NzkxMyA0Ni45NDY2IDAuNjk2NzQ3IDYzLjU5NzEgMTIuMjc2NCA3NS4xNTE1QzIzLjkwMzIgODYuNzU0NyA0MC44MjA0IDkwLjA0MzYgNTUuNDQ5NCA4NC45ODQ1Vjg0Ljk3OTRDNTkuMTI5OCA4My43MTg5IDYxLjA5NTcgNzkuNzkwNCA1OS44MzY5IDc2LjIwNjFDNTguNTc4IDcyLjYyMDIgNTQuNTczNiA3MC43MzUzIDUwLjg4OTcgNzEuOTk1OEM0My4yODkyIDc0LjY0MTggMzQuNzUzOSA3My44OTA5IDI3LjY5MzQgNjkuNzU0OEw2MS4xMzQ2IDM3LjA4MzFMNjMuMzg0IDQ4LjAwOTdMNjMuNDIyOCA0OC4wMDEzQzYzLjY4NDQgNDkuMjYwMSA2NC4zMDM3IDUwLjQ2MzMgNjUuMjg3NSA1MS40NDU1QzY3Ljk5MDkgNTQuMTQzOCA3Mi4zOTY5IDU0LjE2NTcgNzUuMTI5IDUxLjQ5NzhDNzcuMDM0MiA0OS42MzY1IDc3LjYxODEgNDYuOTU4NCA3Ni44ODIzIDQ0LjU5NDJMNzMuMTIyNiAyNi4zMjg3Qzc2LjYyMjQgMjYuNTExIDgwLjE4NDcgMjUuMjkwOSA4Mi44NzI5IDIyLjY2NTFDODcuOTMzNyAxNy43MjA4IDg3Ljk3NzYgOS42NjEyNyA4Mi45NjkxIDQuNjYyOUM3Ny45NjA2IC0wLjMzMzc5MiA2OS43OTgyIC0wLjM3NzY2NiA2NC43Mzc0IDQuNTY2NzFaTTc4LjQwMjcgMTguMjA1MUM3NS44MzYxIDIwLjcxMjcgNzEuNjk2NiAyMC42OTA4IDY5LjE1NjkgMTguMTU2MUM2Ni42MTcyIDE1LjYyMTUgNjYuNjM5MiAxMS41MzQ0IDY5LjIwNTkgOS4wMjUwOEM3MS43NzI2IDYuNTE3NDYgNzUuOTEyIDYuNTM5NCA3OC40NTE3IDkuMDc0MDJDODAuOTkxNCAxMS42MDg2IDgwLjk2OTQgMTUuNjk1OCA3OC40MDI3IDE4LjIwNTFaIiBmaWxsPSJ1cmwoI3BhaW50MF9yYWRpYWxfNzA1XzEzNzApIj48L3BhdGg+PC9nPjxkZWZzPjxyYWRpYWxHcmFkaWVudCBpZD0icGFpbnQwX3JhZGlhbF83MDVfMTM3MCIgY3g9IjAiIGN5PSIwIiByPSIxIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgZ3JhZGllbnRUcmFuc2Zvcm09InRyYW5zbGF0ZSg3My43MzY4IDEzLjAzNjMpIHNjYWxlKDgzLjczODggODMuNzM4OCkiPjxzdG9wIG9mZnNldD0iMC4xMyIgc3RvcC1jb2xvcj0iI0YyNzY4MiI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC4yNSIgc3RvcC1jb2xvcj0iI0NCNkU4RiI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC4zOCIgc3RvcC1jb2xvcj0iI0E1NjY5RCI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC40OSIgc3RvcC1jb2xvcj0iIzhFNjFBNSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC41NiIgc3RvcC1jb2xvcj0iIzg2NjBBOSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC42MyIgc3RvcC1jb2xvcj0iIzcxNkVCNCI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC43OCIgc3RvcC1jb2xvcj0iIzRBOEJDOSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC45IiBzdG9wLWNvbG9yPSIjMzE5Q0Q3Ij48L3N0b3A+PHN0b3Agb2Zmc2V0PSIwLjk3IiBzdG9wLWNvbG9yPSIjMjlBM0RDIj48L3N0b3A+PC9yYWRpYWxHcmFkaWVudD48Y2xpcFBhdGggaWQ9ImNsaXAwXzcwNV8xMzcwIj48cmVjdCB3aWR0aD0iODYuNCIgaGVpZ2h0PSI4Ni40IiBmaWxsPSJ3aGl0ZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4yOTY4NzUgMC44ODY3MTkpIj48L3JlY3Q+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+',
        extensionId: 'unknown',
    };

    async request(url: string, method: 'get' | 'post' | 'patch' | 'delete' = 'get', data: Bag = {}): Promise<Bag> {
        // Trim any leading slashes from the base url and add the path URL to it
        const reqUrl = String(this.config('host')).replace(/\/+$/, '') + '/api/application/' + url;
        const response = await Http.withHeaders({
            Authorization: 'Bearer ' + this.config('api_key'),
            Accept: 'application/json',
        })[method](reqUrl, data);

        if (!response.successful()) {
            throw new Error(response.json()['message']);
        }

        return response.json() ?? [];
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
                required: true,
                validation: 'url:http,https',
            },
            {
                name: 'api_key',
                type: 'text',
                label: 'API Key',
                required: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Bag = {}): Promise<ConfigDefinition[]> {
        const nodes = await this.request('nodes');
        const options: Record<string, string> = {};
        for (const node of nodes['data']) {
            options[node['id']] = node['name'];
        }

        return [
            {
                name: 'cpu',
                type: 'text',
                label: 'CPU Cores',
                required: true,
            },
            {
                name: 'ram',
                type: 'text',
                label: 'RAM (MiB)',
                required: true,
            },
            {
                name: 'disk',
                type: 'text',
                label: 'Disk (MiB)',
                required: true,
            },
            {
                name: 'bandwidth',
                type: 'text',
                label: 'Bandwidth (MiB)',
                required: false,
            },
            {
                name: 'snapshot',
                type: 'text',
                label: 'Amount of snapshots',
                required: true,
            },
            {
                name: 'backups',
                type: 'text',
                label: 'Amount of backups',
                required: true,
            },
            {
                name: 'node',
                type: 'select',
                label: 'Nodes',
                required: true,
                options,
            },
            {
                name: 'auto_assign_ip',
                type: 'checkbox',
                label: 'Auto assign IP from pool',
                required: false,
            },
            {
                name: 'ipv4',
                type: 'number',
                label: 'Amount of IPv4 addresses',
                required: false,
            },
            {
                name: 'ipv6',
                type: 'number',
                label: 'Amount of IPv6 addresses',
                required: false,
            },
            {
                name: 'start_on_create',
                type: 'checkbox',
                label: 'Start Server After Completing Installation',
                required: false,
            },
        ];
    }

    async getCheckoutConfig(product: Product): Promise<ConfigDefinition[]> {
        const node = (await product.relation('settings').where('key', 'node').first())!.value;

        const os = await this.request('nodes/' + node + '/template-groups');
        const options: Record<string, string> = {};
        for (const group of os['data']) {
            for (const template of Object.values<Bag>(group['templates'])) {
                for (const template1 of Object.values<Bag>(template)) {
                    options[template1['uuid']] = template1['name'];
                }
            }
        }

        return [
            {
                name: 'os',
                type: 'select',
                label: 'Operating System',
                required: true,
                options,
            },
            {
                name: 'hostname',
                type: 'text',
                label: 'Hostname',
                placeholder: 'server.example.com',
                required: true,
                validation: ['required', 'string', 'max:40', Hostname()] as any,
            },
        ];
    }

    /**
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        try {
            await this.request('servers');

            return true;
        } catch (e: any) {
            return e.message;
        }
    }

    // Convoy is reallyy strict (The account password must contain 8 - 50 characters, 1 uppercase, 1 lowercase, 1 number and 1 special character.)
    private createPassword() {
        let password = randomPassword();
        while (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,50}$/.test(password)) {
            password = randomPassword();
        }

        return password;
    }

    async getOrCreateUser(user: User): Promise<Bag> {
        const users = await this.request('users', 'get', { 'filter[email]': user.email });

        if (users['data'].length > 0) {
            return {
                created: false,
                id: users['data'][0]['id'],
            };
        }

        const password = this.createPassword();
        const created = await this.request('users', 'post', {
            email: user.email,
            name: await user.name(),
            password,
            root_admin: false,
        });

        return {
            created: true,
            id: created['data']['id'],
            password,
        };
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Bag, properties: Bag) {
        const node = pick(properties, settings, 'node');
        const os = properties['os'];
        const hostname = properties['hostname'];
        const password = properties['password'] ?? this.createPassword();
        const cpu = pick(properties, settings, 'cpu');
        const ram = pick(properties, settings, 'ram');
        const disk = pick(properties, settings, 'disk');
        const bandwidth = pick(properties, settings, 'bandwidth');
        const snapshot = pick(properties, settings, 'snapshot');
        const backups = pick(properties, settings, 'backups');
        const ipv4 = pick(properties, settings, 'ipv4');
        const ipv6 = pick(properties, settings, 'ipv6');

        let ips: any[] = [];
        if (Number(ipv4) > 0) {
            const ip = await this.request('nodes/' + node + '/addresses', 'get', { 'filter[server_id]': '', 'filter[type]': 'ipv4', per_page: ipv4 });
            ips = ips.concat(ip['data'].map((a: Bag) => a['id']));
        }
        if (Number(ipv6) > 0) {
            const ip = await this.request('nodes/' + node + '/addresses', 'get', { 'filter[server_id]': '', 'filter[type]': 'ipv6', per_page: ipv6 });
            ips = ips.concat(ip['data'].map((a: Bag) => a['id']));
        }

        const owner = (await service.rel('user'))!;
        const user = await this.getOrCreateUser(owner);

        const data = {
            node_id: toInt(node),
            user_id: user['id'],
            // The server name must not be greater than 40 characters
            name: [...(hostname + ' ' + (await owner.name()))].slice(0, 40).join(''),
            hostname,
            vmid: null,
            limits: {
                cpu: toInt(cpu),
                memory: Number(ram) * 1024 * 1024,
                disk: Number(disk) * 1024 * 1024,
                snapshots: toInt(snapshot),
                bandwidth: toInt(bandwidth) == 0 ? null : toInt(bandwidth) * 1024 * 1024,
                backups: toInt(backups),
                address_ids: ips,
            },
            account_password: password,
            template_uuid: os,
            should_create_server: true,
            start_on_completion: properties['start_on_create'] !== undefined && properties['start_on_create'] !== null ? truthy(properties['start_on_create']) : truthy(settings['start_on_create']),
        };

        const server = await this.request('servers', 'post', data);

        if (server['data'] === undefined) {
            throw new Error('Failed to create server');
        }

        await service.relation('properties').updateOrCreate(
            {
                key: 'server_uuid',
            },
            {
                name: 'Convoy Server UUID',
                value: server['data']['uuid'],
            },
        );

        return {
            user,
            password,
            server: server['data'],
        };
    }

    async upgradeServer(_service: Service, settings: Bag, properties: Bag) {
        if (properties['server_uuid'] === undefined) {
            throw new Error('Server does not exist');
        }

        const currentData = await this.request('servers/' + properties['server_uuid']);

        const data: Bag = {
            address_ids: [],
            snapshot_limit: toInt(pick(properties, settings, 'snapshot')),
            backup_limit: toInt(pick(properties, settings, 'backups')),
            bandwidth_limit: toInt(pick(properties, settings, 'bandwidth')) * 1024 * 1024,
            cpu: toInt(pick(properties, settings, 'cpu')),
            memory: toInt(pick(properties, settings, 'ram')) * 1024 * 1024,
            disk: toInt(pick(properties, settings, 'disk')) * 1024 * 1024,
        };

        const limitIpv4 = toInt(pick(properties, settings, 'ipv4'));
        const limitIpv6 = toInt(pick(properties, settings, 'ipv6'));
        const addresses = currentData['data']['limits']['addresses'];
        const ids = (list: Bag[]) => Object.values(list).map((a: Bag) => a['id']);
        // Check if IPv4 has increased
        if (limitIpv4 && limitIpv4 > Object.keys(addresses['ipv4']).length) {
            const ip = await this.request('nodes/' + currentData['data']['node_id'] + '/addresses', 'get', {
                'filter[server_id]': '',
                'filter[type]': 'ipv4',
                per_page: limitIpv4 - Object.keys(addresses['ipv4']).length,
            });
            data['address_ids'] = [...ids(addresses['ipv4']), ...ip['data'].map((a: Bag) => a['id'])];
        } else {
            data['address_ids'] = ids(addresses['ipv4']);
        }
        // Check if IPv6 has increased
        if (limitIpv6 && limitIpv6 > Object.keys(addresses['ipv6']).length) {
            const ip = await this.request('nodes/' + currentData['data']['node_id'] + '/addresses', 'get', {
                'filter[server_id]': '',
                'filter[type]': 'ipv6',
                per_page: limitIpv6 - Object.keys(addresses['ipv6']).length,
            });
            data['address_ids'] = [...data['address_ids'], ...ip['data'].map((a: Bag) => a['id'])];
        } else {
            data['address_ids'] = [...data['address_ids'], ...ids(addresses['ipv6'])];
        }
        data['address_ids'] = [...new Set(data['address_ids'])];

        // Update server
        const server = await this.request('servers/' + properties['server_uuid'] + '/settings/build', 'patch', data);
        if (server['data'] === undefined) {
            throw new Error('Failed to update server');
        }

        return {
            server: server['data'],
        };
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_uuid'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('servers/' + properties['server_uuid'] + '/settings/suspend', 'post');
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_uuid'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('servers/' + properties['server_uuid'] + '/settings/unsuspend', 'post');
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_uuid'] === undefined) {
            throw new Error('Server does not exist');
        }

        await this.request('servers/' + properties['server_uuid'], 'delete');

        // Remove the server_uuid property
        await service.relation('properties').where('key', 'server_uuid').delete();
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
        const data = await this.request('users/' + (await this.getOrCreateUser((await service.rel('user'))!))['id'] + '/generate-sso-token', 'post');

        return String(this.config('host')).replace(/\/+$/, '') + '/authenticate?token=' + data['data']['token'];
    }
}
