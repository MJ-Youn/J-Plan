/**
 * 여행 목록을 조회하거나 새로운 여행을 생성하는 핸들러입니다.
 * Cloudflare R2를 저장소로 사용합니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026-05-06
 */
export async function onRequestGet(context: any) {
    const { env, data } = context;
    const userId = data.user.sub;
    const bucket = env.STORAGE;

    if (!bucket) {
        return new Response(JSON.stringify({ error: 'Storage binding missing' }), { status: 500 });
    }

    const key = `users/${userId}/index.json`;
    const object = await bucket.get(key);

    if (!object) {
        return new Response(JSON.stringify({ travels: [] }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const travels = await object.json();
    return new Response(JSON.stringify({ travels }), {
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
        travel: newTravel,
        itineraries: [],
        accommodations: [],
    };
    await bucket.put(detailKey, JSON.stringify(initialData));

    return new Response(JSON.stringify({ success: true, travel: newTravel }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
