import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    agentRules: false,
    poweredByHeader: false,
    // Themes and extensions live in the project root (like the PHP release) and are picked up at build time.
    transpilePackages: [],
    serverExternalPackages: ['mysql2', 'bcryptjs', 'nodemailer', 'tsx'],
    experimental: {
        authInterrupts: true,
        serverActions: { bodySizeLimit: '16mb' },
    },
};

export default nextConfig;
