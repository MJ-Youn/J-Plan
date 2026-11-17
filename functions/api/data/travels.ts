import { ensureShareTables } from '../_utils/shareDb';

/**
 * 여행 목록(본인 소유 + 공유받은 공동 작업 여행)을 조회하거나 새로운 여행을 생성하는 핸들러입니다.
 * Cloudflare R2(목록/상세 JSON)와 D1(공유/협업 메타데이터)을 함께 사용합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026-05-06
 */
export async function onRequestGet(context: any) {
    const { env, data } = context;
    const userId = data.user.sub;
    const bucket = env.STORAGE;
    const db = env.DB;

    if (!bucket) {
        return new Response(JSON.stringify({ error: 'Storage binding missing' }), { status: 500 });
    }

    // 1. 본인 소유 여행 목록 조회
    const key = `users/${userId}/index.json`;
    const object = await bucket.get(key);
    const ownTravels: any[] = object ? await object.json() : [];

    // 2. 공유받은 공동 작업 여행 목록 조회 (D1)
    const sharedTravels: any[] = [];
    if (db) {
        try {
            await ensureShareTables(db);
            const { results: collabRows } = await db
                .prepare(
                    `SELECT c.travel_id, c.owner_id, u.name AS owner_name
                     FROM travel_collaborators c
                     LEFT JOIN users u ON u.id = c.owner_id
                     JOIN travel_shares s
                       ON s.owner_id = c.owner_id
                      AND s.travel_id = c.travel_id
                      AND s.permission = 'edit'
                      AND s.is_active = 1
                     WHERE c.user_id = ?`,
                )
                .bind(userId)
                .all();

            if (collabRows && collabRows.length > 0) {
                // 동일 소유자의 index.json 중복 조회를 막기 위해 캐싱
                const ownerIndexCache = new Map<string, any[]>();
                for (const row of collabRows as Array<{ travel_id: string; owner_id: string; owner_name?: string }>) {
                    if (row.owner_id === userId) {
                        continue;
                    }
                    let ownerTravels = ownerIndexCache.get(row.owner_id);
                    if (!ownerTravels) {
                        const ownerIndexObj = await bucket.get(`users/${row.owner_id}/index.json`);
                        ownerTravels = ownerIndexObj ? await ownerIndexObj.json() : [];
                        ownerIndexCache.set(row.owner_id, ownerTravels!);
                    }

                    const found = ownerTravels!.find((t: any) => t.id === row.travel_id);
                    if (found) {
                        sharedTravels.push({
                            ...found,
                            isShared: true,
                            ownerId: row.owner_id,
                            ownerName: row.owner_name || '공유자',
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[Travels GET] Failed to load shared travels:', err);
        }
    }

    return new Response(JSON.stringify({ travels: [...ownTravels, ...sharedTravels] }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequestPost(context: any) {
    const { request, env, data } = context;
    const userId = data.user.sub;
    const bucket = env.STORAGE;

    if (!bucket) {
        return new Response(JSON.stringify({ error: 'Storage binding missing' }), { status: 500 });
    }

    const newTravel = await request.json();
    const key = `users/${userId}/index.json`;

    // 1. 기존 목록 조회
    const object = await bucket.get(key);
    let travels = [];
    if (object) {
        travels = await object.json();
    }

    // 2. 새 여행 추가
    travels.push(newTravel);

    // 3. R2 저장
    await bucket.put(key, JSON.stringify(travels));

    // 4. 상세 데이터 초기 파일 생성
    const detailKey = `users/${userId}/travels/${newTravel.id}.json`;
    const initialData = {
        version: '1.0',
        revision: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: data.user.name || data.user.email || '',
        travel: newTravel,
        itineraries: [],
        accommodations: [],
    };
    await bucket.put(detailKey, JSON.stringify(initialData));

    return new Response(JSON.stringify({ success: true, travel: newTravel }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
