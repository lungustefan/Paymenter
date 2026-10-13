/** Runs the mock Proxmox API standalone (for manual / browser testing): `tsx tests/helpers/mock-proxmox-server.ts [port]` */
import { MockProxmox } from './mockProxmox';

const mock = await new MockProxmox().start(Number(process.argv[2] ?? 18006));
console.log('mock Proxmox listening on', mock.url);
