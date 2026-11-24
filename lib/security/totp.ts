// lib/security/totp.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 unambiguous chars (power of 2)

export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ISSUER = 'Greenville DIY Archive';
export const TOTP_DEFAULT_ACCOUNT = 'curator@greenvillediyarchive.org';

const HKDF_SALT = 'gvl-diy-archive-totp-salt-v1';
const HKDF_INFO = 'gvl-diy-archive-totp-aes-256-gcm-v1';

const globalForTotpKey = globalThis as unknown as {
  __gvlEphemeralMfaSecret?: Buffer;
};

function getMfaMasterKeyMaterial(): Buffer {
  const envSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return Buffer.from(envSecret, 'utf8');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ADMIN_SESSION_SECRET (>= 32 chars) is required in production for MFA encryption.'
    );
  }
  if (!globalForTotpKey.__gvlEphemeralMfaSecret) {
    globalForTotpKey.__gvlEphemeralMfaSecret = randomBytes(32);
  }
  return globalForTotpKey.__gvlEphemeralMfaSecret;
}

function deriveAes256GcmKey(): Buffer {
  const ikm = getMfaMasterKeyMaterial();
  const derived = hkdfSync('sha256', ikm, HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(derived);
}

/**
 * Encodes raw bytes into unpadded uppercase RFC 4648 Base32 (A-Z, 2-7).
 */
export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 secret (ignoring spaces, hyphens, and '=' padding).
 */
export function decodeBase32(rawBase32: string): Buffer {
  const cleaned = String(rawBase32 || '')
    .toUpperCase()
    .replace(/[\s\-=]+/g, '');

  if (!cleaned || !/^[A-Z2-7]+$/.test(cleaned)) {
    throw new Error('Invalid RFC 4648 Base32 secret');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) {
      throw new Error('Invalid Base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a 20-byte (160-bit) CSPRNG secret encoded as 32-char uppercase unpadded Base32.
 */
export function generateTotpSecretBase32(): string {
  return encodeBase32(randomBytes(20));
}

/**
 * Formats a Base32 secret into copy-friendly 4-character blocks (XXXX XXXX ...).
 */
export function formatBase32ManualKey(secretBase32: string): string {
  const clean = secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Constructs a cross-platform otpauth:// URI compatible with Microsoft Authenticator
 * and Google Authenticator (HMAC-SHA1, 6 digits, 30-second period).
 */
export function buildTotpOtpauthUri(
  secretBase32: string,
  accountName = TOTP_DEFAULT_ACCOUNT,
  issuer = TOTP_ISSUER
): string {
  const cleanSecret = secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  // Decode first to guarantee valid Base32 before emitting URI
  decodeBase32(cleanSecret);

  const encodedIssuerLabel = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  const encodedIssuerParam = encodeURIComponent(issuer);

  return `otpauth://totp/${encodedIssuerLabel}:${encodedAccount}?secret=${cleanSecret}&issuer=${encodedIssuerParam}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SEC}`;
}

/**
 * Renders an otpauth:// URI strictly server-side into an SVG string.
 */
export async function renderTotpQrSvg(uri: string): Promise<string> {
  return QRCode.toString(uri, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Renders an otpauth:// URI strictly server-side into a CSP-safe data:image/svg+xml;base64 URI.
 */
export async function renderTotpQrSvgDataUri(uri: string): Promise<string> {
  const svgMarkup = await renderTotpQrSvg(uri);
  return `data:image/svg+xml;base64,${Buffer.from(svgMarkup, 'utf8').toString('base64')}`;
}

/**
 * Computes an RFC 4226 / RFC 6238 6-digit HMAC-SHA1 code for a specific 30s time-step integer.
 */
export function computeTotpAtStep(secretBase32: string, timeStep: number): string {
  const keyBytes = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(Math.max(0, Math.floor(timeStep))), 0);

  const digest = createHmac('sha1', keyBytes).update(counterBuf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return String(otp).padStart(TOTP_DIGITS, '0');
}

/**
 * Validates a 6-digit TOTP code across [currentStep - 1, currentStep, currentStep + 1]
 * using constant-time comparison and returns the matched time-step integer.
 */
export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  nowMs = Date.now()
): { valid: boolean; matchedStep: number | null } {
  const cleanCode = String(submittedCode || '').replace(/[\s-]+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false, matchedStep: null };
  }

  let keyCheckOk = false;
  try {
    decodeBase32(secretBase32);
    keyCheckOk = true;
  } catch {
    keyCheckOk = false;
  }
  if (!keyCheckOk) {
    return { valid: false, matchedStep: null };
  }

  const currentStep = Math.floor(nowMs / (TOTP_PERIOD_SEC * 1000));
  const candidateSteps = [currentStep - 1, currentStep, currentStep + 1];
  const submittedBuf = Buffer.from(cleanCode, 'utf8');

  let matchedStep: number | null = null;

  for (const step of candidateSteps) {
    if (step < 0) continue;
    const expected = computeTotpAtStep(secretBase32, step);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      expectedBuf.length === submittedBuf.length &&
      timingSafeEqual(expectedBuf, submittedBuf)
    ) {
      matchedStep = step;
    }
  }

  return {
    valid: matchedStep !== null,
    matchedStep,
  };
}

/**
 * Encrypts a Base32 TOTP secret at rest with AES-256-GCM (12-byte random IV + 16-byte auth tag).
 */
export function encryptTotpSecret(plainSecretBase32: string): string {
  const normalized = plainSecretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  decodeBase32(normalized);

  const key = deriveAes256GcmKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret. Returns null if tampered or key changed.
 */
export function decryptTotpSecret(encryptedPayload: string | null | undefined): string | null {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    return null;
  }
  const parts = encryptedPayload.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return null;
  }

  const [, ivHex, tagHex, ctHex] = parts;
  if (
    !ivHex ||
    !tagHex ||
    !ctHex ||
    ivHex.length !== 24 ||
    tagHex.length !== 32 ||
    !/^[0-9a-f]+$/i.test(ivHex) ||
    !/^[0-9a-f]+$/i.test(tagHex) ||
    !/^[0-9a-f]+$/i.test(ctHex)
  ) {
    return null;
  }

  try {
    const key = deriveAes256GcmKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ctHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    decodeBase32(decrypted);
    return decrypted;
  } catch {
    return null;
  }
}

export function normalizeRecoveryCode(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(raw: string): string {
  const normalized = normalizeRecoveryCode(raw);
  return createHash('sha256').update(`gvl-recovery-v1:${normalized}`).digest('hex');
}

/**
 * Generates 8 single-use XXXX-XXXX backup recovery codes and their SHA-256 hashes.
 */
export function generateBackupRecoveryCodes(count = 8): {
  plainCodes: string[];
  hashes: string[];
} {
  const plainCodes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < count; i++) {
    const rand = randomBytes(8);
    let chars = '';
    for (let j = 0; j < 8; j++) {
      chars += RECOVERY_ALPHABET[rand[j]! & 31];
    }
    const formatted = `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
    plainCodes.push(formatted);
    hashes.push(hashRecoveryCode(formatted));
  }

  return { plainCodes, hashes };
}

/**
 * Constant-time verification of a single-use XXXX-XXXX recovery code against SHA-256 hashes.
 */
export function verifyRecoveryCodeConstantTime(
  submittedCode: string,
  storedHashes: string[]
): { valid: boolean; matchedIndex: number } {
  const normalized = normalizeRecoveryCode(submittedCode);
  if (normalized.length !== 8 || !/^[A-Z0-9]{8}$/.test(normalized)) {
    return { valid: false, matchedIndex: -1 };
  }

  const candidateBuf = Buffer.from(hashRecoveryCode(normalized), 'hex');
  let matchedIndex = -1;

  for (let i = 0; i < storedHashes.length; i++) {
    const storedHex = storedHashes[i] || '';
    if (!/^[0-9a-f]{64}$/i.test(storedHex)) continue;
    const storedBuf = Buffer.from(storedHex, 'hex');
    if (
      storedBuf.length === candidateBuf.length &&
      timingSafeEqual(storedBuf, candidateBuf)
    ) {
      matchedIndex = i;
    }
  }

  return {
    valid: matchedIndex !== -1,
    matchedIndex,
  };
}

/**
 * Reads optional read-only ADMIN_TOTP_SECRET Base32 fallback from environment variables.
 */
export function getEnvTotpFallbackSecret(): string | null {
  const raw = process.env.ADMIN_TOTP_SECRET?.trim().replace(/^["']|["']$/g, '') || '';
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[\s\-=]+/g, '');
  if (cleaned.length < 16) return null;
  try {
    decodeBase32(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}
