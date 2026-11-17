import { ensureShareTables } from '../../../_utils/shareDb';

/**
 * 특정 여행의 공유 링크(읽기 전용 / 공동 편집)와 공동 작업자 목록을 조회, 생성, 비활성화하는 핸들러입니다.
 * /api/data/* 하위에 위치하므로 JWT 미들웨어에 의해 보호됩니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function onRequestGet(context: any) {
    const { env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: 'Database binding missing' }), { status: 500 });
    }

    // 본인 소유 여행인지 검증
    const ownHead = await bucket.head(`users/${userId}/travels/${travelId}.json`);
    if (!ownHead) {
        return new Response(JSON.stringify({ error: '소유한 여행만 공유 설정을 관리할 수 있습니다.' }), { status: 403 });
    }

    await ensureShareTables(db);

    const { results: shareRows } = await db
        .prepare(
            `SELECT id, travel_id, permission, is_active, created_at
             FROM travel_shares
             WHERE owner_id = ? AND travel_id = ?`,
        )
        .bind(userId, travelId)
        .all();

    const { results: collabRows } = await db
        .prepare(
            `SELECT user_id, user_email, user_name, user_avatar_url, role, joined_at
             FROM travel_collaborators
             WHERE owner_id = ? AND travel_id = ?
             ORDER BY joined_at ASC`,
        )
        .bind(userId, travelId)
        .all();

    const shares = (shareRows || []).map((row: any) => ({
        id: row.id,
        travelId: row.travel_id,
        permission: row.permission,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
    }));

    const collaborators = (collabRows || []).map((row: any) => ({
        userId: row.user_id,
        email: row.user_email,
        name: row.user_name,
        avatarUrl: row.user_avatar_url,
        role: row.role,
        joinedAt: row.joined_at,
    }));

    return new Response(JSON.stringify({ shares, collaborators }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequestPost(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: 'Database binding missing' }), { status: 500 });
    }

    const ownHead = await bucket.head(`users/${userId}/travels/${travelId}.json`);
    if (!ownHead) {
        return new Response(JSON.stringify({ error: '소유한 여행만 공유 링크를 생성할 수 있습니다.' }), { status: 403 });
    }

    const body = (await request.json()) as { permission?: 'view' | 'edit'; regenerate?: boolean };
    const permission = body.permission === 'edit' ? 'edit' : 'view';
    const regenerate = Boolean(body.regenerate);

    await ensureShareTables(db);

    const existing = await db
        .prepare(
            `SELECT id, is_active FROM travel_shares
             WHERE owner_id = ? AND travel_id = ? AND permission = ?
             LIMIT 1`,
        )
        .bind(userId, travelId, permission)
        .first();

    let shareId: string;
    if (!existing) {
        shareId = crypto.randomUUID();
        await db
            .prepare(
                `INSERT INTO travel_shares (id, travel_id, owner_id, permission, is_active)
                 VALUES (?, ?, ?, ?, 1)`,
            )
            .bind(shareId, travelId, userId, permission)
            .run();
    } else if (regenerate) {
        shareId = crypto.randomUUID();
        await db
            .prepare(
                `UPDATE travel_shares
                 SET id = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
                 WHERE owner_id = ? AND travel_id = ? AND permission = ?`,
            )
            .bind(shareId, userId, travelId, permission)
            .run();
    } else {
        shareId = String(existing.id);
        await db
            .prepare(
                `UPDATE travel_shares
                 SET is_active = 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
            )
            .bind(shareId)
            .run();
    }

    return new Response(
        JSON.stringify({
            share: {
                id: shareId,
                travelId,
                permission,
                isActive: true,
            },
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

export async function onRequestDelete(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: 'Database binding missing' }), { status: 500 });
    }

    await ensureShareTables(db);

    const url = new URL(request.url);
    const permission = url.searchParams.get('permission');
    const collaboratorId = url.searchParams.get('collaboratorId');
    const leave = url.searchParams.get('leave');

    // 공동 작업자가 스스로 공유된 여행에서 나가기
    if (leave === '1') {
        await db
            .prepare('DELETE FROM travel_collaborators WHERE travel_id = ? AND user_id = ?')
            .bind(travelId, userId)
            .run();
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 소유자가 특정 공동 작업자 권한 제거
    if (collaboratorId) {
        await db
            .prepare('DELETE FROM travel_collaborators WHERE owner_id = ? AND travel_id = ? AND user_id = ?')
            .bind(userId, travelId, collaboratorId)
            .run();
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 소유자가 특정 공유 링크 비활성화
    if (permission === 'view' || permission === 'edit') {
        await db
            .prepare(
                `UPDATE travel_shares
                 SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                 WHERE owner_id = ? AND travel_id = ? AND permission = ?`,
            )
            .bind(userId, travelId, permission)
            .run();
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ error: 'Invalid delete parameters' }), { status: 400 });
}
