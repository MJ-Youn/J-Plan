export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cfToken = url.searchParams.get('cf_token');
  
  // 1. Turnstile Verification
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
  } catch (error) {
    return new Response('Error verifying turnstile', { status: 500 });
  }

  // 2. Proceed to Google OAuth
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

  return Response.redirect(authUrl.toString(), 302);
}
