import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/helpers/env';

const root = import.meta.dirname;

export default defineConfig({
    resolve: {
        alias: {
            '@themes': path.join(root, 'themes'),
            '@extensions': path.join(root, 'extensions'),
            '@': path.join(root, 'src'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        globalSetup: ['tests/helpers/global-setup.ts'],
        setupFiles: ['tests/helpers/setup.ts'],
        // every file shares one database, so files run one after another
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 120_000,
        env: testEnv,
    },
});
