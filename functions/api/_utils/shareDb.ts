import { jwtVerify } from 'jose';

/**
 * 인증된 JWT 페이로드 사용자 타입
 */
export interface AuthUserPayload {
    sub: string;
    email?: string;
    name?: string;
    avatar_url?: string;
}

let shareTablesEnsured = false;

/**
 * D1 데이터베이스에 공유 및 협업 테이블이 존재하는지 확인하고, 없으면 생성합니다.
 * Cloudflare Pages 자동 배포 시 수동 마이그레이션 누락으로 인한 장애를 방지합니다.
 *
 * @param db Cloudflare D1 바인딩 객체
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function ensureShareTables(db: any): Promise<void> {
    if (!db || shareTablesEnsured) {
        return;
    }

    await db.batch([
        db.prepare(`
            CREATE TABLE IF NOT EXISTS travel_shares (
                id TEXT PRIMARY KEY,
                travel_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                permission TEXT NOT NULL DEFAULT 'view',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(owner_id, travel_id, permission)
            )
        `),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_travel_shares_travel ON travel_shares(owner_id, travel_id)`),
        db.prepare(`
            CREATE TABLE IF NOT EXISTS travel_collaborators (
                id TEXT PRIMARY KEY,
                travel_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_email TEXT,
                user_name TEXT,
                user_avatar_url TEXT,
                role TEXT NOT NULL DEFAULT 'editor',
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(owner_id, travel_id, user_id)
            )
        `),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_travel_collab_user ON travel_collaborators(user_id)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_travel_collab_travel ON travel_collaborators(owner_id, travel_id)`),
        db.prepare(`
            CREATE TABLE IF NOT EXISTS travel_files (
                id TEXT PRIMARY KEY,
                travel_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                uploader_id TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '기타',
                title TEXT NOT NULL,
                reservation_number TEXT,
                provider TEXT,
                storage_type TEXT NOT NULL DEFAULT 'r2',
                r2_key TEXT,
                external_url TEXT,
                file_name TEXT,
                mime_type TEXT,
                file_size INTEGER,
                iv TEXT,
                visibility TEXT NOT NULL DEFAULT 'collaborators',
                day_index INTEGER,
                memo TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_travel_files_travel ON travel_files(owner_id, travel_id)`),
    ]);

    shareTablesEnsured = true;
}

/**
 * 요청 사용자가 해당 여행의 소유자 또는 공동 작업자인지 확인하고 실제 ownerId를 반환합니다.
 */
export async function resolveTravelAccess(params: {
    bucket: any;
    db: any;
    userId: string;
    travelId: string;
    hintOwnerId?: string | null;
}): Promise<{ ownerId: string; isOwner: boolean } | null> {
    const { bucket, db, userId, travelId, hintOwnerId } = params;

    if (!hintOwnerId || hintOwnerId === userId) {
        const ownHead = await bucket.head(`users/${userId}/travels/${travelId}.json`);
        if (ownHead) {
            return { ownerId: userId, isOwner: true };
        }
    }

    if (db) {
        await ensureShareTables(db);
        const row = await db
            .prepare(
                `SELECT c.owner_id
                 FROM travel_collaborators c
                 JOIN travel_shares s
                   ON s.owner_id = c.owner_id
                  AND s.travel_id = c.travel_id
                  AND s.permission = 'edit'
                  AND s.is_active = 1
                 WHERE c.user_id = ? AND c.travel_id = ?
                 LIMIT 1`,
            )
            .bind(userId, travelId)
            .first();

        if (row && row.owner_id) {
            return { ownerId: String(row.owner_id), isOwner: false };
        }
    }

    return null;
}

/**
 * 요청 쿠키에서 auth_token 값을 안전하게 추출합니다.
 *
 * @param request HTTP 요청 객체
 * @returns 추출된 JWT 문자열 또는 null
 */
export function extractAuthToken(request: Request): string | null {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
        const trimmed = part.trim();
        if (trimmed.startsWith('auth_token=')) {
            return trimmed.slice('auth_token='.length);
        }
    }
    return null;
}

/**
 * 선택적 사용자 인증을 수행합니다. 토큰이 없거나 유효하지 않으면 null을 반환합니다.
 *
 * @param request HTTP 요청 객체
 * @param env Cloudflare 환경 변수 객체
 * @returns 검증된 사용자 페이로드 또는 null
 */
export async function verifyOptionalUser(request: Request, env: any): Promise<AuthUserPayload | null> {
    const token = extractAuthToken(request);
    if (!token) {
        return null;
    }

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET || 'default_secret_key_for_dev');
        const { payload } = await jwtVerify(token, secret);
        if (!payload.sub) {
            return null;
        }
        return {
            sub: String(payload.sub),
            email: payload.email ? String(payload.email) : undefined,
            name: payload.name ? String(payload.name) : undefined,
            avatar_url: payload.avatar_url ? String(payload.avatar_url) : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Cloudflare Turnstile 토큰을 검증합니다.
 *
 * @param cfToken 클라이언트에서 전달한 Turnstile 토큰
 * @param env Cloudflare 환경 변수 객체
 * @param remoteIp 클라이언트 IP 주소
 * @returns 검증 성공 여부 및 실패 시 오류 메시지
 */
export async function verifyTurnstileToken(cfToken: string | null, env: any, remoteIp: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    if (!env.TURNSTILE_SECRET_KEY) {
        return { ok: true };
    }
    if (!cfToken) {
        return { ok: false, status: 400, error: 'Turnstile verification token is missing' };
    }

    const formData = new FormData();
    formData.append('secret', env.TURNSTILE_SECRET_KEY);
    formData.append('response', cfToken);
    formData.append('remoteip', remoteIp);

    const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
    });
    const turnstileData = (await turnstileRes.json()) as { success?: boolean };

    if (!turnstileData.success) {
        return { ok: false, status: 403, error: 'Invalid Turnstile token' };
    }
    return { ok: true };
}

/**
 * 리다이렉트 경로가 내부 상대 경로인지 검증합니다 (오픈 리다이렉트 방지).
 *
 * @param rawPath 검증할 경로 문자열
 * @returns 안전한 내부 경로 또는 기본값 '/travels'
 */
export function sanitizeInternalRedirect(rawPath: string | null | undefined): string {
    if (!rawPath) {
        return '/travels';
    }
    const trimmed = rawPath.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
        return '/travels';
    }
    return trimmed;
}

/**
 * 소유자의 여행 목록 인덱스(index.json) 내 메타데이터를 최신 여행 정보로 동기화합니다.
 *
 * @param bucket R2 버킷 바인딩
 * @param ownerId 여행 소유자 ID
 * @param travelId 여행 ID
 * @param updatedTravel 갱신된 여행 메타 객체
 */
export async function syncOwnerTravelIndex(bucket: any, ownerId: string, travelId: string, updatedTravel: any): Promise<void> {
    if (!updatedTravel) {
        return;
    }
    const indexKey = `users/${ownerId}/index.json`;
    const indexObject = await bucket.get(indexKey);
    if (!indexObject) {
        return;
    }

    const travels = (await indexObject.json()) as any[];
    const nextTravels = travels.map((t: any) => (t.id === travelId ? updatedTravel : t));
    await bucket.put(indexKey, JSON.stringify(nextTravels));
}

/**
 * 낙관적 잠금(Revision) 검증 후 R2 상세 데이터를 안전하게 저장합니다.
 *
 * @param params 저장에 필요한 파라미터 객체
 * @returns 저장 결과 (성공 여부, 새 리비전 또는 409 충돌 데이터)
 */
export async function saveTravelWithRevisionCheck(params: {
    bucket: any;
    ownerId: string;
    travelId: string;
    updatedData: any;
    editorName?: string;
}): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string; serverData?: any }> {
    const { bucket, ownerId, travelId, updatedData, editorName } = params;
    const key = `users/${ownerId}/travels/${travelId}.json`;

    const existingObj = await bucket.get(key);
    let currentRevision = 0;
    let existingData: any = null;

    if (existingObj) {
        existingData = await existingObj.json();
        currentRevision = typeof existingData.revision === 'number' ? existingData.revision : 0;
    }

    const baseRevision = typeof updatedData.baseRevision === 'number' ? updatedData.baseRevision : undefined;
    if (baseRevision !== undefined && baseRevision !== currentRevision) {
        return {
            ok: false,
            status: 409,
            error: '다른 사용자가 먼저 일정을 수정했습니다. 최신 내용을 확인해 주세요.',
            serverData: existingData,
        };
    }

    // 내부 전송용 임시 필드(baseRevision)를 제거하고 새 리비전 메타를 기록
    const cleanData = { ...updatedData };
    delete cleanData.baseRevision;

    const nextData = {
        ...cleanData,
        version: cleanData.version || '1.0',
        revision: currentRevision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: editorName || cleanData.updatedBy || '',
    };

    await bucket.put(key, JSON.stringify(nextData));
    await syncOwnerTravelIndex(bucket, ownerId, travelId, nextData.travel);

    return { ok: true, data: nextData };
}
