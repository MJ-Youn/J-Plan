import { decryptDocumentBuffer } from '../../../../_utils/fileCrypto';
import { ensureShareTables, resolveTravelAccess } from '../../../../_utils/shareDb';

/**
 * 개별 여행 서류를 복호화하여 안전하게 스트리밍하거나 메타데이터를 수정·삭제하는 핸들러입니다.
 * 응답 시 no-store 및 nosniff 보안 헤더를 강제합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function onRequestGet(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const fileId = params.fileId;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!db || !bucket) {
        return new Response(JSON.stringify({ error: 'Storage or Database binding missing' }), { status: 500 });
    }

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');
    const isDownload = url.searchParams.get('download') === '1';

    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });
    if (!resolved) {
        return new Response(JSON.stringify({ error: '접근 권한이 없습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);

    const row = await db
        .prepare('SELECT * FROM travel_files WHERE id = ? AND owner_id = ? AND travel_id = ? LIMIT 1')
        .bind(fileId, resolved.ownerId, travelId)
        .first();

    if (!row) {
        return new Response(JSON.stringify({ error: '파일을 찾을 수 없습니다.' }), { status: 404 });
    }

    if (!resolved.isOwner && row.visibility === 'owner_only') {
        return new Response(JSON.stringify({ error: '소유자 전용 비공개 서류입니다.' }), { status: 403 });
    }

    if (row.storage_type !== 'r2' || !row.r2_key || !row.iv) {
        return new Response(JSON.stringify({ error: '직접 업로드된 파일이 아닙니다.' }), { status: 400 });
    }

    const object = await bucket.get(String(row.r2_key));
    if (!object) {
        return new Response(JSON.stringify({ error: '저장소에서 파일을 찾을 수 없습니다.' }), { status: 404 });
    }

    const encryptedBuf = await object.arrayBuffer();
    const decryptedBuf = await decryptDocumentBuffer(encryptedBuf, String(row.iv), env);

    const fileName = encodeURIComponent(String(row.file_name || row.title || 'document'));
    const disposition = isDownload ? 'attachment' : 'inline';

    return new Response(decryptedBuf, {
        headers: {
            'Content-Type': String(row.mime_type || 'application/octet-stream'),
            'Content-Disposition': `${disposition}; filename*=UTF-8''${fileName}`,
            'Content-Security-Policy': "default-src 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store, max-age=0',
        },
    });
}

export async function onRequestPatch(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const fileId = params.fileId;
    const bucket = env.STORAGE;
    const db = env.DB;

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');
    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });

    if (!resolved) {
        return new Response(JSON.stringify({ error: '수정 권한이 없습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);
    const row = await db
        .prepare('SELECT * FROM travel_files WHERE id = ? AND owner_id = ? AND travel_id = ? LIMIT 1')
        .bind(fileId, resolved.ownerId, travelId)
        .first();

    if (!row) {
        return new Response(JSON.stringify({ error: '서류를 찾을 수 없습니다.' }), { status: 404 });
    }
    if (!resolved.isOwner && row.uploader_id !== userId) {
        return new Response(JSON.stringify({ error: '소유자 또는 등록자만 수정할 수 있습니다.' }), { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const nextVisibility =
        body.visibility === 'owner_only' || body.visibility === 'collaborators' || body.visibility === 'all_shared'
            ? body.visibility
            : String(row.visibility);

    await db
        .prepare('UPDATE travel_files SET visibility = ? WHERE id = ?')
        .bind(nextVisibility, fileId)
        .run();

    return new Response(JSON.stringify({ success: true, visibility: nextVisibility }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequestDelete(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const fileId = params.fileId;
    const bucket = env.STORAGE;
    const db = env.DB;

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');
    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });

    if (!resolved) {
        return new Response(JSON.stringify({ error: '삭제 권한이 없습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);
    const row = await db
        .prepare('SELECT * FROM travel_files WHERE id = ? AND owner_id = ? AND travel_id = ? LIMIT 1')
        .bind(fileId, resolved.ownerId, travelId)
        .first();

    if (!row) {
        return new Response(JSON.stringify({ error: '서류를 찾을 수 없습니다.' }), { status: 404 });
    }
    if (!resolved.isOwner && row.uploader_id !== userId) {
        return new Response(JSON.stringify({ error: '소유자 또는 등록자만 삭제할 수 있습니다.' }), { status: 403 });
    }

    if (row.storage_type === 'r2' && row.r2_key && bucket) {
        await bucket.delete(String(row.r2_key));
    }

    await db.prepare('DELETE FROM travel_files WHERE id = ?').bind(fileId).run();

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
