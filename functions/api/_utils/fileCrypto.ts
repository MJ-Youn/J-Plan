/**
 * 여행 필수 서류(바우처, e-티켓, 여권 사본 등)의 저장 시 암호화(AES-256-GCM) 및
 * 업로드 파일/링크 보안 검증을 담당하는 유틸리티입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB 제한

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);

/**
 * 환경 변수 키로부터 AES-256-GCM CryptoKey를 파생합니다.
 */
async function deriveAesKey(env: any): Promise<CryptoKey> {
    const rawSecret = env.FILE_ENCRYPTION_KEY || env.JWT_SECRET || 'default_secret_key_for_dev';
    const secretBytes = new TextEncoder().encode(String(rawSecret));
    const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);

    return crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
    );
}

function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * 파일 바이너리를 AES-256-GCM으로 암호화합니다.
 */
export async function encryptDocumentBuffer(plainBuffer: ArrayBuffer, env: any): Promise<{
    encrypted: ArrayBuffer;
    ivBase64: string;
}> {
    const key = await deriveAesKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuffer);
    return {
        encrypted,
        ivBase64: uint8ToBase64(iv),
    };
}

/**
 * 암호화된 파일 바이너리를 AES-256-GCM으로 복호화합니다.
 */
export async function decryptDocumentBuffer(encryptedBuffer: ArrayBuffer, ivBase64: string, env: any): Promise<ArrayBuffer> {
    const key = await deriveAesKey(env);
    const iv = base64ToUint8(ivBase64);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, encryptedBuffer);
}

/**
 * 외부 링크(Google Drive 등)가 안전한 http(s) URL인지 검증합니다. (javascript: / data: XSS 차단)
 */
export function validateSafeExternalUrl(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    const trimmed = rawUrl.trim();
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * 업로드 파일의 MIME 타입과 크기를 검증합니다.
 */
export function validateUploadedFile(file: File): { ok: true } | { ok: false; error: string } {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
        return {
            ok: false,
            error: '지원하지 않는 파일 형식입니다. PDF, JPG, PNG, WEBP 파일만 업로드할 수 있습니다.',
        };
    }
    if (file.size <= 0 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
        return {
            ok: false,
            error: '파일 크기는 10MB 이하여야 합니다.',
        };
    }
    return { ok: true };
}
