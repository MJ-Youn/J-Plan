import { ensureShareTables, resolveTravelAccess, saveTravelWithRevisionCheck } from '../../_utils/shareDb';

/**
 * 개별 여행의 상세 데이터를 조회, 수정, 삭제하는 핸들러입니다.
 * 소유자뿐 아니라 공동 작업 권한이 부여된 사용자도 조회 및 수정할 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026-05-06
 */
export async function onRequestGet(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');

    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });
    if (!resolved) {
        return new Response(JSON.stringify({ error: 'Travel not found' }), { status: 404 });
    }

    const key = `users/${resolved.ownerId}/travels/${travelId}.json`;
    const object = await bucket.get(key);

    if (!object) {
        return new Response(JSON.stringify({ error: 'Travel not found' }), { status: 404 });
    }

    const travelData = await object.json();
    return new Response(
        JSON.stringify({
            ...travelData,
            isOwner: resolved.isOwner,
            ownerId: resolved.ownerId,
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

export async function onRequestPut(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    const url = new URL(request.url);
    const hintOwnerId = url.searchParams.get('ownerId');

    const resolved = await resolveTravelAccess({ bucket, db, userId, travelId, hintOwnerId });
    if (!resolved) {
        return new Response(JSON.stringify({ error: 'Travel not found or permission denied' }), { status: 403 });
    }

    const updatedData = await request.json();
    const editorName = data.user.name || data.user.email || '';

    const result = await saveTravelWithRevisionCheck({
        bucket,
        ownerId: resolved.ownerId,
        travelId,
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

export async function onRequestDelete(context: any) {
    const { env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    // 1. 상세 데이터 삭제 (소유자 본인 경로만 삭제 가능)
    const key = `users/${userId}/travels/${travelId}.json`;
    await bucket.delete(key);

    // 2. 인덱스 목록에서 제거
    const indexKey = `users/${userId}/index.json`;
    const indexObject = await bucket.get(indexKey);
    if (indexObject) {
        let travels = await indexObject.json();
        travels = travels.filter((t: any) => t.id !== travelId);
        await bucket.put(indexKey, JSON.stringify(travels));
    }

    // 3. 관련 공유 링크, 협업자 및 첨부 서류 정리
    if (db) {
        try {
            await ensureShareTables(db);
            const { results: fileRows } = await db
                .prepare('SELECT r2_key FROM travel_files WHERE owner_id = ? AND travel_id = ? AND r2_key IS NOT NULL')
                .bind(userId, travelId)
                .all();
            if (fileRows && fileRows.length > 0) {
                for (const fr of fileRows as Array<{ r2_key?: string }>) {
                    if (fr.r2_key) {
                        await bucket.delete(fr.r2_key);
                    }
                }
            }
            await db.batch([
                db.prepare('DELETE FROM travel_shares WHERE owner_id = ? AND travel_id = ?').bind(userId, travelId),
                db.prepare('DELETE FROM travel_collaborators WHERE owner_id = ? AND travel_id = ?').bind(userId, travelId),
                db.prepare('DELETE FROM travel_files WHERE owner_id = ? AND travel_id = ?').bind(userId, travelId),
            ]);
        } catch (err) {
            console.error('[Travel DELETE] Failed to cleanup share rows:', err);
        }
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
