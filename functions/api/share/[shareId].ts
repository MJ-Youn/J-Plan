import { decryptDocumentBuffer } from '../_utils/fileCrypto';
import {
    ensureShareTables,
    saveTravelWithRevisionCheck,
    verifyOptionalUser,
    verifyTurnstileToken,
} from '../_utils/shareDb';

/**
 * 공유 링크(UUID 토큰 또는 레거시 Base64 토큰)로부터 소유자·여행·권한 정보를 해석합니다.
 */
async function resolveShareRecord(db: any, shareId: string): Promise<{
    ownerId: string;
    travelId: string;
    permission: 'view' | 'edit';
    isLegacy: boolean;
} | null> {
    if (db) {
        await ensureShareTables(db);
        const row = await db
            .prepare(
                `SELECT owner_id, travel_id, permission
                 FROM travel_shares
                 WHERE id = ? AND is_active = 1
                 LIMIT 1`,
            )
            .bind(shareId)
            .first();

        if (row) {
            return {
                ownerId: String(row.owner_id),
                travelId: String(row.travel_id),
                permission: row.permission === 'edit' ? 'edit' : 'view',
                isLegacy: false,
            };
        }
    }

    // 레거시 공유 링크(btoa("userId:travelId")) 하위 호환: 읽기 전용으로만 허용
    try {
        const decodedStr = atob(shareId);
        const [userId, travelId] = decodedStr.split(':');
        if (userId && travelId && !userId.includes('/') && !travelId.includes('/')) {
            return {
                ownerId: userId,
                travelId,
                permission: 'view',
                isLegacy: true,
            };
        }
    } catch {
        // Base64가 아니면 무효 토큰으로 처리
    }

    return null;
}

/**
 * 공유된 여행 상세 데이터를 조회하거나, 공동 편집 권한이 있는 경우 수정 사항을 저장합니다.
 * - 읽기 전용('view'): Turnstile 검증 후 데이터 반환
 * - 공동 편집('edit'): Google 로그인 사용자 검증 후 협업자 자동 등록 및 편집/저장 허용
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 15.
 */
export async function onRequestGet(context: any) {
    const { request, env, params } = context;
    const shareId = params.shareId;
    const url = new URL(request.url);
    const cfToken = url.searchParams.get('cf_token');
    const mode = url.searchParams.get('mode'); // 'revision'이면 리비전 메타만 경량 반환

    const db = env.DB;
    const bucket = env.STORAGE;

    // 1. 로그인 사용자 확인 (이미 로그인된 경우 단발성 Turnstile 재검증 생략 가능)
    const user = await verifyOptionalUser(request, env);

    // 2. 비로그인 접근이면서 리비전 폴링/파일 요청이 아닌 경우 Turnstile 검증 수행
    if (!user && mode !== 'revision' && mode !== 'files' && mode !== 'file') {
        const turnstileCheck = await verifyTurnstileToken(cfToken, env, request.headers.get('CF-Connecting-IP') || '');
        if (!turnstileCheck.ok) {
            return new Response(JSON.stringify({ error: turnstileCheck.error }), {
                status: turnstileCheck.status || 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // 3. shareId 해석
    const shareRecord = await resolveShareRecord(db, shareId);
    if (!shareRecord) {
        return new Response(JSON.stringify({ error: '유효하지 않거나 만료된 공유 링크입니다.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. R2 버킷에서 데이터 조회
    const key = `users/${shareRecord.ownerId}/travels/${shareRecord.travelId}.json`;
    const object = await bucket.get(key);

    if (!object) {
        return new Response(JSON.stringify({ error: '여행 데이터를 찾을 수 없거나 삭제되었습니다.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const travelData = (await object.json()) as any;

    // 5. 공동 편집('edit') 링크인 경우 로그인 필수 검증 및 협업자 자동 등록
    if (shareRecord.permission === 'edit') {
        if (!user) {
            return new Response(
                JSON.stringify({
                    requiresAuth: true,
                    permission: 'edit',
                    travelName: travelData.travel?.name || '공유된 여행',
                }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        // 소유자 본인이 아니면 D1 travel_collaborators에 등록 (내 여행 목록에서도 바로 접근 가능)
        if (db && user.sub !== shareRecord.ownerId) {
            await db
                .prepare(
                    `INSERT INTO travel_collaborators (id, travel_id, owner_id, user_id, user_email, user_name, user_avatar_url, role)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'editor')
                     ON CONFLICT(owner_id, travel_id, user_id) DO UPDATE SET
                       user_email = excluded.user_email,
                       user_name = excluded.user_name,
                       user_avatar_url = excluded.user_avatar_url`,
                )
                .bind(
                    `${shareRecord.ownerId}:${shareRecord.travelId}:${user.sub}`,
                    shareRecord.travelId,
                    shareRecord.ownerId,
                    user.sub,
                    user.email || '',
                    user.name || '',
                    user.avatar_url || '',
                )
                .run();
        }
    }

    // 리비전 확인 전용 경량 응답
    if (mode === 'revision') {
        return new Response(
            JSON.stringify({
                revision: typeof travelData.revision === 'number' ? travelData.revision : 0,
                updatedAt: travelData.updatedAt || null,
                updatedBy: travelData.updatedBy || null,
            }),
            { headers: { 'Content-Type': 'application/json' } },
        );
    }

    // 공유 화면에서 허용된 서류 목록 조회
    if (mode === 'files' && db) {
        const isOwner = user ? user.sub === shareRecord.ownerId : false;
        const sql = isOwner
            ? `SELECT * FROM travel_files WHERE owner_id = ? AND travel_id = ? ORDER BY day_index ASC, created_at DESC`
            : shareRecord.permission === 'edit' && user
              ? `SELECT * FROM travel_files WHERE owner_id = ? AND travel_id = ? AND visibility IN ('collaborators', 'all_shared') ORDER BY day_index ASC, created_at DESC`
              : `SELECT * FROM travel_files WHERE owner_id = ? AND travel_id = ? AND visibility = 'all_shared' ORDER BY day_index ASC, created_at DESC`;

        const { results } = await db.prepare(sql).bind(shareRecord.ownerId, shareRecord.travelId).all();
        const files = (results || []).map((row: any) => ({
            id: String(row.id),
            travelId: String(row.travel_id),
            ownerId: String(row.owner_id),
            category: String(row.category || '기타'),
            title: String(row.title),
            reservationNumber: row.reservation_number ? String(row.reservation_number) : undefined,
            provider: row.provider ? String(row.provider) : undefined,
            storageType: row.storage_type === 'link' ? 'link' : 'r2',
            externalUrl: row.external_url ? String(row.external_url) : undefined,
            fileName: row.file_name ? String(row.file_name) : undefined,
            mimeType: row.mime_type ? String(row.mime_type) : undefined,
            fileSize: typeof row.file_size === 'number' ? row.file_size : undefined,
            visibility: String(row.visibility || 'collaborators'),
            dayIndex: typeof row.day_index === 'number' ? row.day_index : undefined,
            memo: row.memo ? String(row.memo) : undefined,
            createdAt: row.created_at ? String(row.created_at) : undefined,
            canDelete: user ? row.owner_id === user.sub || row.uploader_id === user.sub : false,
        }));
        return new Response(JSON.stringify({ files }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 공유 화면에서 허용된 개별 파일 미리보기/다운로드
    if (mode === 'file' && db) {
        const fileId = url.searchParams.get('fileId');
        if (!fileId) {
            return new Response(JSON.stringify({ error: 'fileId is required' }), { status: 400 });
        }
        const row = await db
            .prepare('SELECT * FROM travel_files WHERE id = ? AND owner_id = ? AND travel_id = ? LIMIT 1')
            .bind(fileId, shareRecord.ownerId, shareRecord.travelId)
            .first();
        if (!row) {
            return new Response(JSON.stringify({ error: '파일을 찾을 수 없습니다.' }), { status: 404 });
        }

        const isOwner = user ? user.sub === shareRecord.ownerId : false;
        const allowed =
            isOwner ||
            row.visibility === 'all_shared' ||
            (shareRecord.permission === 'edit' && Boolean(user) && row.visibility === 'collaborators');

        if (!allowed) {
            return new Response(JSON.stringify({ error: '열람 권한이 없는 서류입니다.' }), { status: 403 });
        }
        if (row.storage_type !== 'r2' || !row.r2_key || !row.iv) {
            return new Response(JSON.stringify({ error: '업로드된 파일이 아닙니다.' }), { status: 400 });
        }

        const fileObj = await bucket.get(String(row.r2_key));
        if (!fileObj) {
            return new Response(JSON.stringify({ error: '저장소에 파일이 없습니다.' }), { status: 404 });
        }
        const decryptedBuf = await decryptDocumentBuffer(await fileObj.arrayBuffer(), String(row.iv), env);
        const isDownload = url.searchParams.get('download') === '1';
        const fileName = encodeURIComponent(String(row.file_name || row.title || 'document'));

        return new Response(decryptedBuf, {
            headers: {
                'Content-Type': String(row.mime_type || 'application/octet-stream'),
                'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${fileName}`,
                'Content-Security-Policy': "default-src 'none'",
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store, max-age=0',
            },
        });
    }

    return new Response(
        JSON.stringify({
            ...travelData,
            revision: typeof travelData.revision === 'number' ? travelData.revision : 0,
            permission: shareRecord.permission,
            ownerId: shareRecord.ownerId,
            isOwner: user ? user.sub === shareRecord.ownerId : false,
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

export async function onRequestPut(context: any) {
    const { request, env, params } = context;
    const shareId = params.shareId;
    const db = env.DB;
    const bucket = env.STORAGE;

    // 1. 로그인 사용자 필수 검증
    const user = await verifyOptionalUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '공동 작업을 저장하려면 로그인이 필요합니다.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. 공유 링크 및 편집 권한 검증
    const shareRecord = await resolveShareRecord(db, shareId);
    if (!shareRecord || shareRecord.permission !== 'edit') {
        return new Response(JSON.stringify({ error: '편집 권한이 없거나 비활성화된 공유 링크입니다.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. 낙관적 잠금(Revision) 검증 후 저장
    const updatedData = await request.json();
    const editorName = user.name || user.email || '';

    const result = await saveTravelWithRevisionCheck({
        bucket,
        ownerId: shareRecord.ownerId,
        travelId: shareRecord.travelId,
        updatedData,
        editorName,
    });

    if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error, serverData: result.serverData }), {
            status: result.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result.data }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
