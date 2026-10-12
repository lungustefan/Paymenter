import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition } from '@/server/extensions/types';
import { Http } from '@/server/http';
import { randomPassword, randomString } from '@/server/lib/ids';
import { empty } from '@/server/lib/php';
import type { Product } from '@/server/models/Product';
import type { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';

type Bag = Record<string, any>;

/** `isset($a[$key]) ? $a[$key] : $b[$key]` */
const issetOr = (a: Bag, key: string, fallback: unknown) => (a[key] !== undefined && a[key] !== null ? a[key] : fallback);
/** first element of an array / object (`$a[key($a)]`) */
const first = (v: Bag | any[]) => Object.values(v)[0];

export default class Virtualizor extends Server {
    static meta = {
        name: 'Virtualizor',
        description: 'Virtualizor server extension',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/virtualizor',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjciIGhlaWdodD0iODAiIHZpZXdib3g9IjAgMCA2NyA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBjbGFzcz0iaG92ZXI6c2NhbGUtMTIwIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHNpemUtMTggcm91bmRlZC14bCBwLTQgYmctd2hpdGUgcmluZy02IHJpbmctd2hpdGUvMjAiPjxwYXRoIGQ9Ik0wIDE5TDYxIDgwSDBWMTlaIiBmaWxsPSJ1cmwoI3BhaW50MF9saW5lYXJfOTAzXzM4MDApIj48L3BhdGg+PHBhdGggZD0iTTY3IDYxTDYgMEg2N1Y2MVoiIGZpbGw9InVybCgjcGFpbnQxX2xpbmVhcl85MDNfMzgwMCkiPjwvcGF0aD48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5lYXJfOTAzXzM4MDAiIHgxPSIzMSIgeTE9IjUwIiB4Mj0iMCIgeTI9IjgwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agc3RvcC1jb2xvcj0iIzUzNjY4RSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzJEMzg0RSI+PC9zdG9wPjwvbGluZWFyR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJwYWludDFfbGluZWFyXzkwM18zODAwIiB4MT0iNjciIHkxPSItNS40ODM2M2UtMDYiIHgyPSIzNyIgeTI9IjMxIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agc3RvcC1jb2xvcj0iI0ZGOUIwMCI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI0Y3N0MwMiI+PC9zdG9wPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjwvc3ZnPg==',
        extensionId: 'unknown',
    };

    private async request(act: string, method: 'get' | 'post' = 'get', data: Bag = {}, clientApi = false): Promise<Bag> {
        let url: string;
        if (clientApi) {
            url = 'https://' + this.config('ip') + ':' + this.config('client_port') + '/index.php?api=json&adminapikey=' + this.config('key') + '&adminapipass=' + this.config('password') + '&act=' + act;
        } else {
            url = 'https://' + this.config('ip') + ':' + this.config('port') + '/index.php?api=json&adminapikey=' + this.config('key') + '&adminapipass=' + this.config('password') + '&act=' + act;
        }

        let response;
        if (method == 'get') {
            url += '&' + new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)])).toString();
            response = (await Http.withoutVerifying().get(url)).throw();
        } else {
            response = (await Http.withoutVerifying().asForm().post(url, data)).throw();
        }

        if (!response.successful()) {
            throw new Error('Failed to connect to Virtualizor API');
        }

        return response.json();
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'key',
                type: 'text',
                label: 'API Key',
                required: true,
            },
            {
                name: 'password',
                type: 'text',
                label: 'API Password',
                required: true,
            },
            {
                name: 'ip',
                type: 'text',
                label: 'IP Address',
                required: true,
            },
            {
                name: 'port',
                type: 'text',
                label: 'Port',
                required: true,
                default: '4085',
            },
            {
                name: 'client_port',
                type: 'text',
                label: 'Client Port (normally 4083)',
                default: '4083',
                required: true,
            },
        ];
    }

    /**
     * Get product config
     */
    async getProductConfig(_values: Bag = {}): Promise<ConfigDefinition[]> {
        // Get Plan list
        const plans = await this.request('plans');
        const allplans: Record<string, string> = {};
        for (const plan of Object.values<Bag>(plans['plans'])) {
            allplans[plan['plan_name']] = plan['plan_name'];
        }

        return [
            {
                name: 'virt',
                label: 'Virtualizon Type',
                type: 'select',
                required: true,
                options: (await this.request('config'))['globals']['virts'],
            },
            {
                name: 'planname',
                label: 'Plan Name',
                type: 'select',
                required: true,
                options: allplans,
            },
        ];
    }

    async getCheckoutConfig(product: Product): Promise<ConfigDefinition[]> {
        const os = await this.request('os');
        const virt = (await product.relation('settings').where('key', 'virt').first())!.value as string;
        if (os['oslist']?.[virt] === undefined) {
            throw new Error('Invalid OS');
        }
        const allOs: Record<string, string> = {};
        for (const o of Object.values<Bag>(os['oslist'][virt])) {
            for (const [osId, osName] of Object.entries<Bag>(o)) {
                allOs[osId] = osName['name'];
            }
        }

        return [
            {
                name: 'hostname',
                type: 'text',
                validation: 'regex:/^(?!:\\/\\/)(?=.{1,255}$)((.{1,63}\\.){1,127}(?![0-9]*$)[a-z0-9-]+\\.?)$/i',
                label: 'Hostname',
                placeholder: 'example.com',
                required: true,
            },
            {
                name: 'os',
                type: 'select',
                friendlyName: 'Operating System',
                required: true,
                options: allOs,
            },
        ];
    }

    /**
     * Check if currenct configuration is valid
     */
    async testConfig(): Promise<boolean | string> {
        try {
            await this.request('users');
        } catch (e: any) {
            return e.message;
        }

        return true;
    }

    private async getUser(user: User): Promise<Bag> {
        let users = await this.request('users', 'get', { email: user.email });
        if (!empty(users['users'])) {
            return first(users['users']) as Bag;
        }
        const password = randomPassword(16);
        // Create user
        const data = {
            adduser: 1,
            priority: 0,
            newpass: password,
            newemail: user.email,
            fname: user.first_name,
            lname: user.last_name,
        };
        const response = await this.request('adduser', 'post', data);

        if (!response['done']) {
            throw new Error('Failed to create user');
        }

        users = await this.request('users', 'get', { email: user.email });
        const created = { ...(first(users['users']) as Bag) };
        created['password'] = password;

        return created;
    }

    /**
     * Create a server
     *
     * @param settings (product settings)
     * @param properties (checkout options)
     */
    async createServer(service: Service, settings: Bag, properties: Bag) {
        settings = { ...settings, ...properties };
        let data: Bag = {
            planname: settings['planname'],
            ptype: settings['virt'],
        };
        const plans = await this.request('plans', 'get', data);
        // Check if plan exists
        if (empty(plans['plans'])) {
            throw new Error('Invalid plan OR Virtualization type');
        }
        const plan = first(plans['plans']) as Bag;
        const password = randomString(12);

        // Create user
        const user = await this.getUser((await service.rel('user'))!);

        data = {
            addvps: 1,
            node_select: 1,
            virt: settings['virt'],
            uid: user['uid'],
            osid: settings['os'],
            hostname: settings['hostname'],
            rootpass: password,
            num_ips6: issetOr(settings, 'ips6', plan['ips6']),
            num_ips6_subnet: issetOr(settings, 'ips6_subnet', plan['ips6_subnet']),
            num_ips: issetOr(settings, 'ips', plan['ips']),
            ram: issetOr(settings, 'ram', plan['ram']),
            swapram: issetOr(settings, 'swap', plan['swap']),
            bandwidth: issetOr(settings, 'bandwidth', plan['bandwidth']),
            network_speed: issetOr(settings, 'network_speed', plan['network_speed']),
            cpu: issetOr(settings, 'cpu', plan['cpu']),
            cores: issetOr(settings, 'cores', plan['cores']),
            cpu_percent: issetOr(settings, 'cpu_percent', plan['cpu_percent']),
            vnc: issetOr(settings, 'vnc', plan['vnc']),
            kvm_cache: plan['kvm_cache'],
            io_mode: plan['io_mode'],
            vnc_keymap: plan['vnc_keymap'],
            nic_type: plan['nic_type'],
            osreinstall_limit: issetOr(settings, 'osreinstall_limit', plan['osreinstall_limit']),
            space: issetOr(settings, 'space', plan['space']),
            plid: plan['plid'],
        };

        const response = await this.request('addvs', 'post', data);

        if (response['error'] !== undefined && !empty(response['error'])) {
            throw new Error('Failed to create server with error: ' + Object.values(response['error']).join(', '));
        }

        await service.relation('properties').updateOrCreate(
            {
                key: 'server_id',
            },
            {
                name: 'Virtualizor Server ID',
                value: response['newvs']['vpsid'],
            },
        );

        return {
            vps: response['newvs'],
            user,
        };
    }

    /**
     * Suspend a server
     */
    async suspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        // Suspend server
        await this.request('vs', 'get', { suspend: properties['server_id'] });

        return true;
    }

    /**
     * Unsuspend a server
     */
    async unsuspendServer(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        // Unsuspend server
        await this.request('vs', 'get', { unsuspend: properties['server_id'] });

        return true;
    }

    /**
     * Terminate a server
     */
    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        // Terminate server
        const request = await this.request('vs', 'post', { delete: properties['server_id'] });

        if (empty(request['done']) || !request['done']) {
            throw new Error('Failed to terminate server');
        }

        // Remove server id
        await service.relation('properties').where('key', 'server_id').delete();

        return true;
    }

    getActions(_service: Service, _settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            return [];
        }

        return [
            {
                type: 'button' as const,
                label: 'Go to Server',
                function: 'ssoLink',
            },
        ];
    }

    async ssoLink(_service: Service, _settings: Bag, properties: Bag): Promise<string> {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        const response = await this.request('sso', 'get', { svs: properties['server_id'] }, true);

        if (response['sid'] === undefined) {
            throw new Error('Failed to get VNC link');
        }

        return 'https://' + this.config('ip') + ':' + this.config('client_port') + '/' + response['token_key'] + '/?as=' + response['sid'] + '&svs=' + properties['server_id'];
    }

    async upgradeServer(_service: Service, settings: Bag, properties: Bag) {
        if (properties['server_id'] === undefined) {
            throw new Error('Server does not exist');
        }

        settings = { ...settings, ...properties };

        // Get plid from planname
        const plans = await this.request('plans');
        let plid: any = null;
        for (const plan of Object.values<Bag>(plans['plans'])) {
            if (plan['plan_name'] === settings['planname']) {
                plid = plan['plid'];
                break;
            }
        }
        if (!plid) {
            throw new Error('Plan not found');
        }

        const editData = {
            vpsid: properties['server_id'],
            plid,
            theme_edit: 1, // Boolean
            editvps: 1, // Boolean
        };

        const response = await this.request('managevps', 'post', editData);

        if (empty(response['done'])) {
            throw new Error('Failed to upgrade server');
        }

        return true;
    }
}
