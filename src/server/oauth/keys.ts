import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';
import { envString } from '@/server/env';

const generateKeyPairAsync = promisify(generateKeyPair);

/** `Passport::keyPath()` - the keys live in `storage/` exactly like in the PHP release. */
export const keyPath = (file: string) => path.join(process.cwd(), 'storage', file);

function readKey(type: 'private' | 'public'): string {
    // `PASSPORT_PRIVATE_KEY` / `PASSPORT_PUBLIC_KEY` take precedence (config/passport.php)
    const fromEnv = envString(`PASSPORT_${type.toUpperCase()}_KEY`).replace(/\\n/g, '\n');
    if (fromEnv) return fromEnv;
    const file = keyPath(`oauth-${type}.key`);
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        throw new Error(`Key path "file://${file}" does not exist or is not readable`);
    }
}

export const privateKey = () => readKey('private');
export const publicKey = () => readKey('public');

/**
 * Creates the 4096 bit RSA keypair (`storage/oauth-public.key` 0660, `storage/oauth-private.key` 0600)
 * when neither file exists - the check CreateOauthClient.php performs before creating a client.
 */
export async function ensureOauthKeys(): Promise<void> {
    const pub = keyPath('oauth-public.key');
    const priv = keyPath('oauth-private.key');
    if (fs.existsSync(pub) || fs.existsSync(priv)) return;
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.mkdirSync(path.dirname(pub), { recursive: true });
    fs.writeFileSync(pub, publicKey);
    fs.writeFileSync(priv, privateKey);
    if (process.platform !== 'win32') {
        fs.chmodSync(pub, 0o660);
        fs.chmodSync(priv, 0o600);
    }
}
