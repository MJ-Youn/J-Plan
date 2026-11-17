import { sanitizeInternalRedirect } from '../_utils/shareDb';

/**
 * Turnstile 검증 후 Google OAuth 로그인 페이지로 리다이렉트합니다.
 * redirect 쿼리 파라미터가 전달되면 state에 실어 로그인 완료 후 해당 경로로 복귀시킵니다.
 */
export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cfToken = url.searchParams.get('cf_token');
  const safeRedirect = sanitizeInternalRedirect(url.searchParams.get('redirect'));

  // 1. Turnstile 검증
  if (!cfToken) {
    return new Response('Missing Turnstile Token', { status: 400 });
  }

  try {
    const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: cfToken,
      }),
    });

    const turnstileData: any = await turnstileRes.json();
    if (!turnstileData.success) {
      return new Response('Turnstile verification failed', { status: 403 });
    }
  } catch {
    return new Response('Error verifying turnstile', { status: 500 });
  }

  // 2. Google OAuth URL 생성
  const clientId = env.GOOGLE_CLIENT_ID;
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  if (!clientId) {
    return new Response('Missing GOOGLE_CLIENT_ID', { status: 500 });
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'email profile openid');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', safeRedirect);

  return Response.redirect(authUrl.toString(), 302);
}
