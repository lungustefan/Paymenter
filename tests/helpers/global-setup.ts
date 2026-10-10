import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { testEnv } from './env';

/** Creates the test database schema once per run with the real CLI (`paymenter migrate:fresh --seed`). */
export default function setup() {
    const root = path.resolve(import.meta.dirname, '..', '..');
    const env = { ...process.env, ...testEnv };
    execFileSync(path.join(root, 'node_modules', '.bin', 'tsx'), ['src/cli/index.ts', 'migrate:fresh', '--seed'], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
}
