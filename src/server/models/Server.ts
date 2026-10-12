import { Extension } from './Extension';

/** Extensions of type `server` (shares the `extensions` table). */
export class Server extends Extension {
    static morphName = 'App\\Models\\Server';
    static globalScopes = [(q: any) => q.where('type', 'server')];
}
export interface Server extends Extension {}
