import { SignJWT } from 'jose';

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  // 1. Exchange code for access token
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

  // 2. Get user info from Google
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userData: any = await userRes.json();

  if (!userRes.ok) {
    return new Response('Failed to get user info', { status: 500 });
  }

  const db = env.DB;
  
  // 3. Upsert user in DB
  await db.prepare(`
    INSERT INTO users (id, email, name, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      avatar_url = excluded.avatar_url
  `).bind(userData.id, userData.email, userData.name, userData.picture).run();

  // 4. Create JWT Token
  const secret = new TextEncoder().encode(env.JWT_SECRET || 'default_secret_key_for_dev');
  const jwt = await new SignJWT({
    sub: userData.id,
    email: userData.email,
    name: userData.name,
    avatar_url: userData.picture
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  // 5. Set Cookie and redirect to Home
  const headers = new Headers();
  headers.set('Location', '/travels');
  headers.set(
    'Set-Cookie',
    `auth_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  );

  return new Response(null, {
    status: 302,
    headers,
  });
}
