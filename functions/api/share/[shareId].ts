/**
 * 공유된 여행 상세 데이터를 조회하는 핸들러입니다.
 * Turnstile 인증 토큰 검증 후, 권한 없이 읽기 전용 데이터를 반환합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 15.
 */
export async function onRequestGet(context: any) {
    const { request, env, params } = context;
    const shareIdBase64 = params.shareId;
    const url = new URL(request.url);
    const cfToken = url.searchParams.get('cf_token');

    // 1. 개발 환경이 아닌 경우 Turnstile 토큰 필수 확인
    // 개발 모드 판단 (보통 env에 특정 값이 있거나, JWT_SECRET이 default_secret_key_for_dev 일 때 등)
    // 안전하게 cfToken이 없으면 오류 반환. 단 개발환경 테스트를 위해 TURNSTILE_SECRET_KEY가 없으면 패스 허용
    if (env.TURNSTILE_SECRET_KEY) {
        if (!cfToken) {
            return new Response(JSON.stringify({ error: 'Turnstile verification token is missing' }), { status: 400 });
        }

        const formData = new FormData();
        formData.append('secret', env.TURNSTILE_SECRET_KEY);
        formData.append('response', cfToken);
        formData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

        const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        });
        const turnstileData = await turnstileRes.json() as any;

        if (!turnstileData.success) {
            return new Response(JSON.stringify({ error: 'Invalid Turnstile token' }), { status: 403 });
        }
    }

    // 2. shareId 디코딩 (userId:travelId)
    let decodedStr = '';
    try {
        decodedStr = atob(shareIdBase64);
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid Share ID format' }), { status: 400 });
    }

    const [userId, travelId] = decodedStr.split(':');
    if (!userId || !travelId) {
        return new Response(JSON.stringify({ error: 'Invalid Share ID' }), { status: 400 });
    }

    // 3. R2 버킷에서 데이터 조회
    const bucket = env.STORAGE;
    const key = `users/${userId}/travels/${travelId}.json`;
    const object = await bucket.get(key);

    if (!object) {
        return new Response(JSON.stringify({ error: 'Travel not found or sharing disabled' }), { status: 404 });
    }

    const travelData = await object.json();
    return new Response(JSON.stringify(travelData), {
        headers: { 'Content-Type': 'application/json' },
    });
}
