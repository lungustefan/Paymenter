import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { config } from '@/server/config';

/** Two factor authentication - same parameters as RobThree\Auth\TwoFactorAuth (6 digits, 30 s, SHA1, ±1 period). */
authenticator.options = { digits: 6, step: 30, window: 1 };

export function createSecret(): string {
    // 160 bits of randomness, base32 encoded (32 characters), like RobThree
    return authenticator.generateSecret(20);
}

export function verifyCode(secret: string, code: string): boolean {
    try {
        return authenticator.verify({ token: String(code), secret });
    } catch {
        return false;
    }
}

/** Data URI of the QR code for the authenticator app (`getQRCodeImageAsDataUri`). */
export async function qrCodeDataUri(email: string, secret: string): Promise<string> {
    const issuer = String(config('app.name'));
    const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&algorithm=SHA1&digits=6`;
    return QRCode.toDataURL(uri, { margin: 4, width: 200 });
}
