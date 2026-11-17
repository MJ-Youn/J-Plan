import { encryptDocumentBuffer, validateSafeExternalUrl, validateUploadedFile } from '../../../_utils/fileCrypto';
import { ensureShareTables, resolveTravelAccess } from '../../../_utils/shareDb';

/**
 * D1 travel_files 행을 프론트엔드 응답 DTO 형태로 변환합니다.
 */
function mapFileRow(row: any, requestUserId: string) {
    return {
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
        canDelete: row.owner_id === requestUserId || row.uploader_id === requestUserId,
    };
}

/**
 * 여행 필수 서류(바우처, e-티켓, Google Drive 링크 등) 목록을 조회하거나 새로 등록하는 핸들러입니다.
 * R2 업로드는 AES-256-GCM으로 암호화되어 저장되며, 퍼블릭 URL 없이 인증된 API로만 열람할 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function onRequestGet(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: 'Database binding missing' }), { status: 500 });
    }

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');
    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });

    if (!resolved) {
        return new Response(JSON.stringify({ error: '접근 권한이 없습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);

    const query = resolved.isOwner
        ? `SELECT * FROM travel_files WHERE owner_id = ? AND travel_id = ? ORDER BY day_index ASC, created_at DESC`
        : `SELECT * FROM travel_files WHERE owner_id = ? AND travel_id = ? AND visibility IN ('collaborators', 'all_shared') ORDER BY day_index ASC, created_at DESC`;

    const { results } = await db.prepare(query).bind(resolved.ownerId, travelId).all();
    const files = (results || []).map((row: any) => mapFileRow(row, userId));

    return new Response(JSON.stringify({ files, isOwner: resolved.isOwner }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequestPost(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!db || !bucket) {
        return new Response(JSON.stringify({ error: 'Storage or Database binding missing' }), { status: 500 });
    }

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');
    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });

    if (!resolved) {
        return new Response(JSON.stringify({ error: '업로드 권한이 없습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);
    const contentType = request.headers.get('content-type') || '';
    const fileId = crypto.randomUUID();

    // 1. JSON 요청: Google Drive 등 외부 링크 첨부
    if (contentType.includes('application/json')) {
        const body = (await request.json()) as Record<string, unknown>;
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const safeUrl = validateSafeExternalUrl(typeof body.externalUrl === 'string' ? body.externalUrl : null);

        if (!title || !safeUrl) {
            return new Response(JSON.stringify({ error: '문서 제목과 유효한 http(s) 링크를 입력해 주세요.' }), { status: 400 });
        }

        const category = typeof body.category === 'string' ? body.category : '기타';
        const reservationNumber = typeof body.reservationNumber === 'string' ? body.reservationNumber.trim() : '';
        const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
        const visibility =
            body.visibility === 'owner_only' || body.visibility === 'all_shared' ? body.visibility : 'collaborators';
        const dayIndex = typeof body.dayIndex === 'number' && body.dayIndex > 0 ? body.dayIndex : null;
        const memo = typeof body.memo === 'string' ? body.memo.trim() : '';

        await db
            .prepare(
                `INSERT INTO travel_files (
                    id, travel_id, owner_id, uploader_id, category, title, reservation_number,
                    provider, storage_type, external_url, visibility, day_index, memo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'link', ?, ?, ?, ?)`,
            )
            .bind(fileId, travelId, resolved.ownerId, userId, category, title, reservationNumber, provider, safeUrl, visibility, dayIndex, memo)
            .run();

        const created = await db.prepare('SELECT * FROM travel_files WHERE id = ?').bind(fileId).first();
        return new Response(JSON.stringify({ file: mapFileRow(created, userId) }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Multipart 요청: R2 AES-256-GCM 암호화 파일 업로드
    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const uploaded = formData.get('file');
        if (!(uploaded instanceof File)) {
            return new Response(JSON.stringify({ error: '업로드할 파일이 누락되었습니다.' }), { status: 400 });
        }

        const validation = validateUploadedFile(uploaded);
        if (!validation.ok) {
            return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
        }

        const title = String(formData.get('title') || uploaded.name).trim();
        const category = String(formData.get('category') || '기타');
        const reservationNumber = String(formData.get('reservationNumber') || '').trim();
        const provider = String(formData.get('provider') || '').trim();
        const rawVis = String(formData.get('visibility') || 'collaborators');
        const visibility = rawVis === 'owner_only' || rawVis === 'all_shared' ? rawVis : 'collaborators';
        const rawDay = Number(formData.get('dayIndex'));
        const dayIndex = Number.isFinite(rawDay) && rawDay > 0 ? rawDay : null;
        const memo = String(formData.get('memo') || '').trim();

        const plainBuffer = await uploaded.arrayBuffer();
        const { encrypted, ivBase64 } = await encryptDocumentBuffer(plainBuffer, env);
        const r2Key = `users/${resolved.ownerId}/travels/${travelId}/files/${fileId}.enc`;

        await bucket.put(r2Key, encrypted);

        await db
            .prepare(
                `INSERT INTO travel_files (
                    id, travel_id, owner_id, uploader_id, category, title, reservation_number,
                    provider, storage_type, r2_key, file_name, mime_type, file_size, iv,
                    visibility, day_index, memo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'r2', ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                fileId,
                travelId,
                resolved.ownerId,
                userId,
                category,
                title,
                reservationNumber,
                provider,
                r2Key,
                uploaded.name,
                uploaded.type,
                uploaded.size,
                ivBase64,
                visibility,
                dayIndex,
                memo,
            )
            .run();

        const created = await db.prepare('SELECT * FROM travel_files WHERE id = ?').bind(fileId).first();
        return new Response(JSON.stringify({ file: mapFileRow(created, userId) }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ error: '지원하지 않는 요청 형식입니다.' }), { status: 400 });
}
