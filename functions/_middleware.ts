import { jwtVerify } from 'jose';

/**
 * API 요청에 대한 인증을 처리하는 미들웨어입니다.
 * /api/data/* 경로에 대해 JWT 토큰을 검증합니다.
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026-05-06
 */
export const onRequest = async (context: any) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 데이터 관련 API만 보호
  if (!url.pathname.startsWith('/api/data/')) {
    return next();
  }

  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader || !cookieHeader.includes('auth_token=')) {
    return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = cookieHeader.split('auth_token=')[1].split(';')[0];

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET || 'default_secret_key_for_dev');
    const { payload } = await jwtVerify(token, secret);
    
    // 사용자 정보를 data 객체에 저장하여 핸들러에서 접근 가능하게 함
    context.data = context.data || {};
    context.data.user = payload;
    
    return next();
  } catch (err) {
    return new Response(JSON.stringify({ error: '유효하지 않은 세션입니다.' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
