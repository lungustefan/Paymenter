import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { appKeys } from '@/server/lib/crypto';

/**
 * defuse/php-encryption (V2) `encryptWithPassword` / `decryptWithPassword`, which league/oauth2-server
 * uses for authorization codes and refresh tokens. Passport passes the raw Laravel `APP_KEY` bytes as
 * the "password", so values issued by the PHP release decrypt here and the other way around.
 */
const pbkdf2Async = promisify(pbkdf2);

const VERSION = Buffer.from([0xde, 0xf5, 0x02, 0x00]);
const SALT = 32;
const IV = 16;
const MAC = 32;
const MIN_SIZE = VERSION.length + SALT + IV + MAC;

export class WrongKeyOrModifiedCiphertextException extends Error {}

export const tokenEncryptionKey = (): Buffer => appKeys()[0];

async function deriveKeys(password: Buffer, salt: Buffer) {
    const prehash = createHash('sha256').update(password).digest();
    const prekey = await pbkdf2Async(prehash, salt, 100000, 32, 'sha256');
    const akey = Buffer.from(hkdfSync('sha256', prekey, salt, 'DefusePHP|V2|KeyForAuthentication', 32));
    const ekey = Buffer.from(hkdfSync('sha256', prekey, salt, 'DefusePHP|V2|KeyForEncryption', 32));
    return { akey, ekey };
}

export async function encryptWithPassword(plaintext: string, password: Buffer = tokenEncryptionKey()): Promise<string> {
    const salt = randomBytes(SALT);
    const iv = randomBytes(IV);
    const { akey, ekey } = await deriveKeys(password, salt);
    const cipher = createCipheriv('aes-256-ctr', ekey, iv);
    const body = Buffer.concat([VERSION, salt, iv, cipher.update(plaintext, 'utf8'), cipher.final()]);
    const mac = createHmac('sha256', akey).update(body).digest();
    return Buffer.concat([body, mac]).toString('hex');
}

export async function decryptWithPassword(ciphertext: string, password: Buffer = tokenEncryptionKey()): Promise<string> {
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(ciphertext)) throw new WrongKeyOrModifiedCiphertextException('Ciphertext has invalid hex encoding.');
    const raw = Buffer.from(ciphertext, 'hex');
    if (raw.length < MIN_SIZE) throw new WrongKeyOrModifiedCiphertextException('Ciphertext is too short.');
    if (!raw.subarray(0, 4).equals(VERSION)) throw new WrongKeyOrModifiedCiphertextException('Bad version header.');
    const salt = raw.subarray(4, 4 + SALT);
    const iv = raw.subarray(4 + SALT, 4 + SALT + IV);
    const mac = raw.subarray(raw.length - MAC);
    const encrypted = raw.subarray(4 + SALT + IV, raw.length - MAC);
    const { akey, ekey } = await deriveKeys(password, salt);
    const expected = createHmac('sha256', akey).update(raw.subarray(0, raw.length - MAC)).digest();
    if (expected.length !== mac.length || !timingSafeEqual(expected, mac)) throw new WrongKeyOrModifiedCiphertextException('Integrity check failed.');
    const decipher = createDecipheriv('aes-256-ctr', ekey, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
