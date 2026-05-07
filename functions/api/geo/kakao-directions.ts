/**
 * Kakao Mobility Directions API 프록시 핸들러입니다.
 * 클라이언트의 CORS 문제를 해결하고 API 키를 보호합니다.
 * 
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
export async function onRequestGet(context: any) {
    const { request, env } = context;
    const url = new URL(request.url);
    const origin = url.searchParams.get('origin');
    const destination = url.searchParams.get('destination');
    const priority = url.searchParams.get('priority') || 'RECOMMEND';

    const KAKAO_KEY = env.KAKAO_REST_API_KEY;

    if (!KAKAO_KEY) {
        return new Response(JSON.stringify({ error: 'Kakao API Key가 설정되지 않았습니다.' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!origin || !destination) {
        return new Response(JSON.stringify({ error: 'origin과 destination 파라미터가 필요합니다.' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const kakaoUrl = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=${priority}`;

    try {
        const res = await fetch(kakaoUrl, {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_KEY}`
            }
        });
        
        const data = await res.json();
        return new Response(JSON.stringify(data), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // Worker 환경에 따라 필요 시 조절
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Kakao API 호출 중 오류가 발생했습니다.' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
