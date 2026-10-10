import type { Product } from '@/server/models/Product';
import type { Service } from '@/server/models/Service';
import type { ConfigDefinition, ExtensionView } from './types';
import { Extension } from './Extension';

export type ServiceProperties = Record<string, any>;
export type ProductSettings = Record<string, any>;

export interface ServerAction {
    type: 'button' | 'view';
    label: string;
    function?: string;
    name?: string;
    [key: string]: unknown;
}

/** Port of App\Classes\Extension\Server (the PHP class is empty; this documents the optional hooks). */
export class Server extends Extension {
    getProductConfig?(values?: Record<string, any>): Promise<ConfigDefinition[]> | ConfigDefinition[];
    getCheckoutConfig?(product: Product, values: Record<string, any>, settings: ProductSettings): Promise<ConfigDefinition[]> | ConfigDefinition[];
    createServer?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<any> | any;
    suspendServer?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<any> | any;
    unsuspendServer?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<any> | any;
    terminateServer?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<any> | any;
    upgradeServer?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<any> | any;
    getActions?(service: Service, settings: ProductSettings, properties: ServiceProperties): Promise<ServerAction[]> | ServerAction[];
    getView?(service: Service, settings: ProductSettings, properties: ServiceProperties, view: string): Promise<ExtensionView> | ExtensionView;
    [fn: string]: any;
}
