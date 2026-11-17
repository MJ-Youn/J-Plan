import { SignJWT } from 'jose';
import { sanitizeInternalRedirect } from '../_utils/shareDb';

/**
 * Google OAuth 콜백을 처리하고 JWT 쿠키를 발급한 뒤 원래 경로(또는 /travels)로 리다이렉트합니다.
 */
export async function onRequestGet(context: any) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const redirectTarget = sanitizeInternalRedirect(url.searchParams.get('state'));

    if (!code) {
        return new Response('Missing code', { status: 400 });
    }

    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/callback`;

    // 1. 인증 코드를 액세스 토큰으로 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok) {
        return new Response('Failed to get token', { status: 500 });
    }

    // 2. Google 사용자 프로필 조회
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData: any = await userRes.json();

    if (!userRes.ok) {
        return new Response('Failed to get user info', { status: 500 });
    }

    const db = env.DB;

    // 3. D1 사용자 정보 Upsert
    await db
        .prepare(
            `
    INSERT INTO users (id, email, name, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      avatar_url = excluded.avatar_url
  `,
        )
        .bind(userData.id, userData.email, userData.name, userData.picture)
        .run();

    // 4. JWT 토큰 생성
    const secret = new TextEncoder().encode(env.JWT_SECRET || 'default_secret_key_for_dev');
    const jwt = await new SignJWT({
        sub: userData.id,
        email: userData.email,
        name: userData.name,
        avatar_url: userData.picture,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);

    // 5. 쿠키 설정 및 대상 페이지로 리다이렉트
    const headers = new Headers();
    headers.set('Location', redirectTarget);
    headers.set('Set-Cookie', `auth_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`);

    return new Response(null, {
        status: 302,
        headers,
    });
}
