import { createSign, createVerify } from 'node:crypto';

/** Minimal RS256 JWT, compatible with the tokens lcobucci/jwt signs for Passport. */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(claims: Record<string, unknown>, privateKeyPem: string): string {
    const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256' }));
    const body = b64url(JSON.stringify(claims));
    const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKeyPem);
    return `${head}.${body}.${b64url(sig)}`;
}

export interface VerifiedJwt {
    header: Record<string, any>;
    claims: Record<string, any>;
}

/** Parses the token, verifies signature + `iat`/`nbf`/`exp` (League's `LooseValidAt` + `SignedWith`). Returns null when invalid. */
export function verifyJwt(token: string, publicKeyPem: string, now = Date.now() / 1000): VerifiedJwt | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[2]) return null;
    let header: Record<string, any>;
    let claims: Record<string, any>;
    try {
        header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!header || header.alg !== 'RS256' || !claims || typeof claims !== 'object') return null;
    try {
        const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(publicKeyPem, Buffer.from(parts[2], 'base64url'));
        if (!ok) return null;
    } catch {
        return null;
    }
    // LooseValidAt: a missing claim is accepted
    if (claims.iat !== undefined && Number(claims.iat) > now) return null;
    if (claims.nbf !== undefined && Number(claims.nbf) > now) return null;
    if (claims.exp !== undefined && Number(claims.exp) <= now) return null;
    return { header, claims };
}
