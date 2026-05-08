import { jwtVerify } from 'jose';

export async function onRequestGet(context: any) {
    const { request, env } = context;
    const cookieHeader = request.headers.get('Cookie');

    if (!cookieHeader || !cookieHeader.includes('auth_token=')) {
        return new Response(JSON.stringify({ user: null }), { status: 401 });
    }

    const token = cookieHeader.split('auth_token=')[1].split(';')[0];

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET || 'default_secret_key_for_dev');
        const { payload } = await jwtVerify(token, secret);

        // DB에서 최신 사용자 정보 조회 (옵션, 현재는 JWT payload 신뢰)
        const db = env.DB;
        const { results } = await db.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).all();

        if (!results || results.length === 0) {
            return new Response(JSON.stringify({ user: null }), { status: 401 });
        }

        return new Response(JSON.stringify({ user: results[0] }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('[Auth Me] JWT verification failed:', err);
        return new Response(JSON.stringify({ user: null }), { status: 401 });
    }
}
