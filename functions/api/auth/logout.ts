export async function onRequestPost() {
  const headers = new Headers();
  // auth_token 쿠키 만료
  headers.set(
    'Set-Cookie',
    'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
}
