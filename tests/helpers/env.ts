/** Environment of the test run (shared by vitest.config.ts and the global setup). */
export const testEnv: Record<string, string> = {
    APP_ENV: 'testing',
    APP_URL: 'http://localhost',
    // Never point the tests at a real database: override with DB_* variables (CI does), the name must contain "test".
    DB_CONNECTION: process.env.DB_CONNECTION ?? 'mariadb',
    DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.DB_PORT ?? '3306',
    DB_DATABASE: process.env.TEST_DB_DATABASE ?? (process.env.DB_DATABASE?.includes('test') ? process.env.DB_DATABASE : 'paymenter_test'),
    DB_USERNAME: process.env.DB_USERNAME ?? 'paymenter',
    DB_PASSWORD: process.env.DB_PASSWORD ?? 'paymenter',
    APP_KEY: process.env.APP_KEY ?? 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    CACHE_STORE: 'array',
    QUEUE_CONNECTION: 'database',
    TELEMETRY_ENABLED: 'false',
    MAIL_MAILER: 'log',
};

if (!/test/i.test(testEnv.DB_DATABASE)) {
    throw new Error(`Refusing to run the tests against database "${testEnv.DB_DATABASE}": its name must contain "test".`);
}
