import type { TransportMode } from '../types/travel';

export interface RouteCalcResult {
    duration: string;
    distance: string;
}

export interface RouteCalcParams {
    originAddress: string;
    destAddress: string;
    transportMode?: TransportMode | string;
    routesLib: google.maps.RoutesLibrary;
    geocodingLib: google.maps.GeocodingLibrary;
}

/**
 * 출발지와 도착지 주소 및 이동수단을 기반으로 소요 시간(duration)과 거리(distance)를 계산합니다.
 * - 한국 내 (자동차, 도보, 자전거): Kakao Mobility Directions API 사용
 * - 해외 또는 대중교통: Google Maps DistanceMatrixService 사용
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export const calculateRouteInfo = async ({ originAddress, destAddress, transportMode = 'DRIVING', routesLib, geocodingLib }: RouteCalcParams): Promise<RouteCalcResult | null> => {
    if (!originAddress?.trim() || !destAddress?.trim() || !routesLib || !geocodingLib) {
        return null;
    }

    // 기차 또는 항공은 도로/대중교통 네비게이션 단일 API로 정확한 소요 시간을 얻기 어려우므로 건너뜁니다
    if (transportMode === 'TRAIN' || transportMode === 'FLIGHT') {
        return null;
    }

    try {
        const geocoder = new geocodingLib.Geocoder();

        // 1. 출발지/도착지 좌표 및 국가 정보 조회 (병렬 처리)
        const [originRes, destRes] = await Promise.all([geocoder.geocode({ address: originAddress, language: 'ko' }), geocoder.geocode({ address: destAddress, language: 'ko' })]);

        if (!originRes.results?.[0] || !destRes.results?.[0]) {
            return { duration: '위치 찾을 수 없음', distance: '' };
        }

        const isKR = (res: google.maps.GeocoderResponse) => res.results[0].address_components.some((c) => c.types.includes('country') && c.short_name === 'KR');

        const startLoc = originRes.results[0].geometry.location;
        const endLoc = destRes.results[0].geometry.location;
        const originStr = `${startLoc.lng()},${startLoc.lat()}`;
        const destStr = `${endLoc.lng()},${endLoc.lat()}`;

        // 2. 한국 여부에 따른 분기 처리
        if (isKR(originRes) && isKR(destRes) && (transportMode === 'DRIVING' || transportMode === 'WALKING' || transportMode === 'BICYCLING')) {
            // [한국 - 자동차/도보/자전거] Kakao Mobility 호출
            const KAKAO_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;
            let data: any;

            if (import.meta.env.DEV && KAKAO_KEY) {
                // 로컬 개발 환경: 프록시 없이 직접 호출 (Vite 환경)
                const res = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${originStr}&destination=${destStr}`, {
                    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
                });
                if (!res.ok) {
                    throw new Error('Kakao Direct API Error');
                }
                data = await res.json();
            } else {
                // 운영 환경: Cloudflare Worker 프록시 경유
                const res = await fetch(`/api/geo/kakao-directions?origin=${originStr}&destination=${destStr}`);
                if (!res.ok) {
                    throw new Error('Kakao Proxy Error');
                }
                data = await res.json();
            }

            if (data.routes && data.routes[0]) {
                const summary = data.routes[0].summary;
                const distanceMeters = summary.distance; // 미터 단위
                const distanceText = distanceMeters < 1000 ? `${distanceMeters}m` : `${(distanceMeters / 1000).toFixed(1)}km`;

                let durationText = '';
                if (transportMode === 'DRIVING') {
                    // 자동차는 Kakao가 주는 duration(초) 사용
                    const mins = Math.round(summary.duration / 60);
                    durationText = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
                } else if (transportMode === 'WALKING') {
                    // 도보는 도로 거리 기준 분당 80m 계산 (4.8km/h)
                    const mins = Math.round(distanceMeters / 80);
                    durationText = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
                } else if (transportMode === 'BICYCLING') {
                    // 자전거는 도로 거리 기준 분당 250m 계산 (15km/h)
                    const mins = Math.round(distanceMeters / 250);
                    durationText = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
                }

                return {
                    duration: durationText,
                    distance: distanceText,
                };
            } else {
                return {
                    duration: '경로 찾을 수 없음',
                    distance: '',
                };
            }
        } else {
            // [해외 또는 대중교통] Google Distance Matrix 사용
            const service = new routesLib.DistanceMatrixService();
            const travelModeKey = (transportMode as keyof typeof google.maps.TravelMode) || 'DRIVING';
            const googleMode = google.maps.TravelMode[travelModeKey] ?? google.maps.TravelMode.DRIVING;

            const response = await service.getDistanceMatrix({
                origins: [startLoc],
                destinations: [endLoc],
                travelMode: googleMode,
            });

            const element = response.rows[0].elements[0];
            if (element.status === 'OK') {
                let durationText = element.duration.text;
                // 영문을 한글로 번역 (hour -> 시간, min -> 분, day -> 일)
                durationText = durationText
                    .replace(/hours?/g, '시간')
                    .replace(/mins?/g, '분')
                    .replace(/days?/g, '일')
                    .replace(/\s+/g, ' ')
                    .trim();

                return {
                    duration: durationText,
                    distance: element.distance.text,
                };
            } else if (element.status === 'ZERO_RESULTS') {
                return {
                    duration: '경로 찾을 수 없음',
                    distance: '',
                };
            } else {
                return {
                    duration: '계산 실패',
                    distance: '',
                };
            }
        }
    } catch (error) {
        console.error('[routeCalculator] calculateRouteInfo failed:', error);
        return {
            duration: '연동 오류',
            distance: '',
        };
    }
};
