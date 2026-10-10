import { Extension } from './Extension';

/** Extensions of type `gateway` (shares the `extensions` table). */
export class Gateway extends Extension {
    static morphName = 'App\\Models\\Gateway';
    static globalScopes = [(q: any) => q.where('type', 'gateway')];
}
export interface Gateway extends Extension {}
