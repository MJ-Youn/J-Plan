import type { TravelExportData } from '../types/travel';

/**
 * 여행 데이터 JSON 유효성 검사 결과 인터페이스
 */
export interface JsonValidationResult {
    isValid: boolean;
    error?: string;
    data?: TravelExportData;
}

/**
 * JSON 텍스트 또는 객체의 유효성을 검사하고 J-Plan 스키마에 맞는지 확인합니다.
 *
 * @param jsonInput 검사할 JSON 문자열 또는 파싱된 객체
 * @returns 유효성 검사 결과
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export function validateTravelJson(jsonInput: string | unknown): JsonValidationResult {
    if (!jsonInput) {
        return { isValid: false, error: 'JSON 내용이 비어 있습니다.' };
    }

    let parsed: unknown;
    if (typeof jsonInput === 'string') {
        const trimmed = jsonInput.trim();
        if (!trimmed) {
            return { isValid: false, error: 'JSON 내용이 비어 있습니다.' };
        }

        try {
            parsed = JSON.parse(trimmed);
        } catch (err: unknown) {
            let errorMsg = '유효한 JSON 형식이 아닙니다.';
            if (err instanceof Error) {
                errorMsg = `JSON 구문 오류: ${err.message}`;
            }
            return { isValid: false, error: errorMsg };
        }
    } else {
        parsed = jsonInput;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { isValid: false, error: 'JSON의 최상위는 객체({ ... }) 형태여야 합니다.' };
    }

    const obj = parsed as Record<string, unknown>;

    // travel 필수 필드 확인
    if (!obj.travel || typeof obj.travel !== 'object' || Array.isArray(obj.travel)) {
        return { isValid: false, error: '여행 기본 정보("travel") 객체가 누락되었습니다.' };
    }

    const travelObj = obj.travel as Record<string, unknown>;
    if (!travelObj.name || typeof travelObj.name !== 'string' || !travelObj.name.trim()) {
        return { isValid: false, error: '여행 이름("travel.name")이 누락되었거나 올바르지 않습니다.' };
    }

    if (!travelObj.startDate || typeof travelObj.startDate !== 'string') {
        return { isValid: false, error: '여행 시작일("travel.startDate")이 누락되었습니다. (형식: YYYY-MM-DD)' };
    }

    if (!travelObj.endDate || typeof travelObj.endDate !== 'string') {
        return { isValid: false, error: '여행 종료일("travel.endDate")이 누락되었습니다. (형식: YYYY-MM-DD)' };
    }

    // 기본 보정
    const sanitizedData: TravelExportData = {
        version: typeof obj.version === 'string' ? obj.version : '1.0',
        travel: {
            id: typeof travelObj.id === 'string' && travelObj.id.trim()
                ? travelObj.id.trim()
                : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `travel_${Date.now()}`),
            name: travelObj.name.trim(),
            region: typeof travelObj.region === 'string' ? travelObj.region : '',
            startDate: travelObj.startDate,
            endDate: travelObj.endDate,
        },
        itineraries: Array.isArray(obj.itineraries) ? (obj.itineraries as TravelExportData['itineraries']) : [],
        accommodations: Array.isArray(obj.accommodations) ? (obj.accommodations as TravelExportData['accommodations']) : [],
    };

    return {
        isValid: true,
        data: sanitizedData,
    };
}
