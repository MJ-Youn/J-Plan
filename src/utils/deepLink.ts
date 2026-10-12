import type { TravelExportData } from '../types/travel';
import { validateTravelJson } from './jsonValidator';

/**
 * UTF-8 문자열을 안전하게 Base64로 인코딩합니다.
 */
export function utf8ToBase64(str: string): string {
    return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
        }),
    );
}

/**
 * Base64 문자열을 안전하게 UTF-8 문자열로 디코딩합니다.
 */
export function base64ToUtf8(base64: string): string {
    return decodeURIComponent(
        Array.prototype.map
            .call(atob(base64), (c: string) => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join(''),
    );
}

/**
 * 여행 데이터를 방안 B 형식의 딥링크 URL(해시 프래그먼트)로 생성합니다.
 *
 * @param data 여행 데이터
 * @param origin 베이스 URL (생략 시 window.location.origin)
 * @returns 완성된 딥링크 URL
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export function createTravelDeepLink(data: TravelExportData, origin?: string): string {
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
    const jsonStr = JSON.stringify(data);
    const b64 = utf8ToBase64(jsonStr);
    return `${base}/import#b64=${encodeURIComponent(b64)}`;
}

/**
 * 현재 브라우저의 URL(해시 또는 쿼리 파라미터)에서 여행 데이터를 파싱합니다.
 *
 * 지원 포맷:
 * 1. #b64=... (Base64 인코딩된 UTF-8 JSON)
 * 2. #data=... 또는 #json=... (URL 인코딩된 JSON)
 * 3. ?b64=... 또는 ?data=... (쿼리 파라미터 대체 경로)
 *
 * @param hashOrSearch URL 해시 또는 쿼리 문자열 (예: window.location.hash || window.location.search)
 * @returns 파싱 및 검증 완료된 TravelExportData 또는 null
 */
export function parseTravelFromHashOrSearch(hashOrSearch: string): TravelExportData | null {
    if (!hashOrSearch) return null;

    // 앞쪽의 '#' 또는 '?' 제거
    const raw = hashOrSearch.replace(/^[#?]/, '').trim();
    if (!raw) return null;

    const params = new URLSearchParams(raw);

    // 1. b64 파라미터 확인
    const b64Val = params.get('b64');
    if (b64Val) {
        try {
            const decodedJson = base64ToUtf8(decodeURIComponent(b64Val));
            const validation = validateTravelJson(decodedJson);
            if (validation.isValid && validation.data) {
                return validation.data;
            }
        } catch (err) {
            console.error('[DeepLink] b64 디코딩 실패:', err);
        }
    }

    // 2. data 또는 json 파라미터 확인
    const dataVal = params.get('data') || params.get('json');
    if (dataVal) {
        try {
            const decodedJson = decodeURIComponent(dataVal);
            const validation = validateTravelJson(decodedJson);
            if (validation.isValid && validation.data) {
                return validation.data;
            }
        } catch (err) {
            console.error('[DeepLink] data 디코딩 실패:', err);
        }
    }

    // 3. 파라미터 키 없이 바로 b64 문자열이 온 경우 처리 (#eyJ...)
    if (raw.startsWith('eyJ')) {
        try {
            const decodedJson = base64ToUtf8(raw);
            const validation = validateTravelJson(decodedJson);
            if (validation.isValid && validation.data) {
                return validation.data;
            }
        } catch (err) {
            console.warn('[DeepLink] 직접 b64 디코딩 실패:', err);
        }
    }

    return null;
}
