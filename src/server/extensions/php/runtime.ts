import path from 'node:path';
import { PhpBridge } from './bridge';
import { registerHostHandlers } from './host';
import { extensionsRoot } from './discovery';

let bridge: PhpBridge | null = null;

export function getPhpBridge(): PhpBridge {
    if (!bridge) {
        // turbopackIgnore: runtime-only paths
        const root = process.cwd();
        bridge = new PhpBridge(extensionsRoot(), path.join(/* turbopackIgnore: true */ root, 'php-bridge', 'bridge.php'));
        registerHostHandlers(bridge);
    }
    return bridge;
}

export function stopPhpBridge() {
    bridge?.stop();
    bridge = null;
}
