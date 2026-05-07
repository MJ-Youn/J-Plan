/**
 * 개별 여행의 상세 데이터를 조회, 수정, 삭제하는 핸들러입니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026-05-06
 */
export async function onRequestGet(context: any) {
    const { env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;

    const key = `users/${userId}/travels/${travelId}.json`;
    const object = await bucket.get(key);

    if (!object) {
        return new Response(JSON.stringify({ error: 'Travel not found' }), { status: 404 });
    }

    const travelData = await object.json();
    return new Response(JSON.stringify(travelData), {
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequestPut(context: any) {
    const { request, env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;

    const updatedData = await request.json();
    const key = `users/${userId}/travels/${travelId}.json`;

    // R2 상세 데이터 업데이트
    await bucket.put(key, JSON.stringify(updatedData));

    // 인덱스(목록) 정보도 업데이트가 필요한 경우 (예: 여행 이름 변경)
    const indexKey = `users/${userId}/index.json`;
    const indexObject = await bucket.get(indexKey);
    if (indexObject) {
        let travels = await indexObject.json();
        travels = travels.map((t: any) => (t.id === travelId ? updatedData.travel : t));
        await bucket.put(indexKey, JSON.stringify(travels));
    }

    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context: any) {
    const { env, data, params } = context;
    const userId = data.user.sub;
    const travelId = params.id;
    const bucket = env.STORAGE;

    // 1. 상세 데이터 삭제
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

    return new Response(JSON.stringify({ success: true }));
}
