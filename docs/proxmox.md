# Proxmox VE server extension

`extensions/Servers/Proxmox` provisions **QEMU virtual machines** on a Proxmox VE node by cloning a cloud-init template. It is written in TypeScript (no PHP bridge) and talks to the Proxmox REST API (`/api2/json`).

> Status: tested only against an in-repo mock of the Proxmox API (`tests/helpers/mockProxmox.ts`), never against a real Proxmox VE. Try it on a staging cluster first. LXC containers are not supported.

## Proxmox preparation

1. Create a template VM: install an OS image with cloud-init and the QEMU guest agent, add a **cloud-init drive**, convert it to a template. Note its VM ID.
2. Create an API token (Datacenter > Permissions > API Tokens) for a user such as `billing@pve`. Uncheck "Privilege Separation" or grant the token the same role. The role needs at least `VM.Allocate, VM.Clone, VM.Config.*, VM.PowerMgmt, VM.Snapshot, VM.Audit, VM.Console, Datastore.AllocateSpace, Datastore.Audit, Pool.Allocate (when pools are used), Sys.Audit` on `/vms`, `/storage`, `/pool` and `/nodes`.
3. Make sure the panel can reach `https://<host>:8006`.

## Extension settings (Admin > Servers)

| Setting | Meaning |
| --- | --- |
| Host / Port | Address of the Proxmox web interface/API (`https://` is assumed, default port 8006) |
| Authentication | `API token` (username `user@realm`, token ID, token secret) or `ticket` (username + password; the ticket and CSRF token are fetched on demand and renewed after a 401) |
| Verify TLS certificate | Turn off for the self-signed default certificate |
| Console base URL | Optional public URL for the console link |

"Test" calls `GET /nodes`.

## Product settings

Node, template VM (listed from the node), clone mode (**full** or **linked**), target storage, resource pool, cores, sockets, memory (MB), disk (GB, the boot disk is grown, never shrunk), boot disk device, bridge, NIC model, VLAN tag, rate limit, firewall flag; IP handling (**DHCP** or **IP pool** with addresses/ranges, gateway, prefix); DNS servers and search domain; cloud-init user, default SSH public keys, package upgrade on first boot; start after creation; snapshot limit; whether clients may change DNS/search domain.

Checkout options: hostname and root password (an optional checkout field with an empty value cannot be stored by the panel, so SSH keys come from the product defaults or the client area). The same names as config options (`cores`, `memory`, `disk`, `sockets`, `nameserver`, `searchdomain`) override the product values, which is how upgrades change resources.

## Lifecycle

* **Create**: `GET /cluster/nextid`, clone the template (`POST /nodes/{node}/qemu/{template}/clone`), wait for the task, set cores/memory, `net0`, `ipconfig0`, `nameserver`, `searchdomain`, `ciuser`, `cipassword`, `sshkeys`, `ciupgrade`, `agent`, `onboot`, resize the disk, start. Service properties `vmid`, `node`, `ip_address`, `vm_hostname` are stored. Pool addresses already used by another service are skipped; an exhausted pool fails the creation.
* **Suspend**: `onboot=0` and stop. **Unsuspend**: `onboot=1` and start.
* **Terminate**: stop, delete with `purge=1&destroy-unreferenced-disks=1`; a VM that is already gone is not an error.
* **Upgrade**: cores/sockets/memory and disk growth (applied to the config; CPU/RAM changes need a reboot).

## Client area

The service page gets a **Server** tab: live status (polled every 5 s), start / shutdown / reboot / stop, a console link (opens the Proxmox noVNC console; the client needs a Proxmox login there), cloud-init changes (hostname, password, SSH keys, optionally DNS and search domain), **reinstall** (destroys the VM and clones the template again under the same VM ID and IP) and, when the snapshot limit is above 0, snapshot create / rollback / delete. The tab talks to `/extensions/proxmox/{service}/...` routes that check that the service belongs to the logged in user and is active.

## Not included

LXC containers, backups (vzdump), embedded VNC, IPv6 pools, firewall rule editing, usage graphs.

## Tests

`pnpm test` runs `tests/Unit/ProxmoxClient.test.ts` and `tests/Feature/ProxmoxExtension.test.ts` against the mock. `pnpm tsx tests/helpers/mock-proxmox-server.ts 18006` runs the mock standalone (token `root@pam!paymenter=secret-uuid`, password `pve-pass`, template VM 9000, node `pve1`).
