import type { Itinerary, TransportMode } from '../types/travel';

export type NavProvider = 'google' | 'apple' | 'naver' | 'kakao';

export interface NavLinkItem {
    provider: NavProvider;
    label: string;
    url: string;
    isPrimary?: boolean;
}

function mapGoogleTravelMode(mode?: TransportMode): string {
    switch (mode) {
        case 'WALKING':
            return 'walking';
        case 'BICYCLING':
            return 'bicycling';
        case 'TRANSIT':
        case 'TRAIN':
            return 'transit';
        default:
            return 'driving';
    }
}

function mapAppleDirFlag(mode?: TransportMode): string {
    switch (mode) {
        case 'WALKING':
            return 'w';
        case 'TRANSIT':
        case 'TRAIN':
            return 'r';
        default:
            return 'd';
    }
}

/**
 * 일정(장소 또는 출발지→도착지)을 기반으로 외부 지도/내비게이션 앱 딥링크 목록을 생성합니다.
 * 해외 여행 기준 Google Maps를 기본(1순위)으로 제공합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export function buildNavigationLinks(iti: Pick<Itinerary, 'type' | 'address' | 'arrivalAddress' | 'lat' | 'lng' | 'arrivalLat' | 'arrivalLng' | 'transportMode'>): NavLinkItem[] {
    const isMove = iti.type === '이동' && Boolean(iti.arrivalAddress?.trim());
    const destQuery = isMove
        ? iti.arrivalAddress!.trim()
        : iti.address?.trim() || (typeof iti.lat === 'number' && typeof iti.lng === 'number' ? `${iti.lat},${iti.lng}` : '');

    if (!destQuery) {
        return [];
    }

    const originQuery = isMove && iti.address?.trim() ? iti.address.trim() : '';
    const googleMode = mapGoogleTravelMode(iti.transportMode);
    const appleFlag = mapAppleDirFlag(iti.transportMode);

    const googleParams = new URLSearchParams({
        api: '1',
        destination: destQuery,
        travelmode: googleMode,
    });
    if (originQuery) {
        googleParams.set('origin', originQuery);
    }

    const appleParams = new URLSearchParams({
        daddr: destQuery,
        dirflg: appleFlag,
    });
    if (originQuery) {
        appleParams.set('saddr', originQuery);
    }

    return [
        {
            provider: 'google',
            label: 'Google 지도 (기본)',
            url: `https://www.google.com/maps/dir/?${googleParams.toString()}`,
            isPrimary: true,
        },
        {
            provider: 'apple',
            label: 'Apple 지도',
            url: `https://maps.apple.com/?${appleParams.toString()}`,
        },
        {
            provider: 'naver',
            label: '네이버 지도',
            url: `https://map.naver.com/v5/search/${encodeURIComponent(destQuery)}`,
        },
        {
            provider: 'kakao',
            label: '카카오맵',
            url: `https://map.kakao.com/link/search/${encodeURIComponent(destQuery)}`,
        },
    ];
}
