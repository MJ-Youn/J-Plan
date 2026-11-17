import { addDays, format, parseISO } from 'date-fns';
import type { Accommodation, Itinerary } from '../../types/travel';
import { formatDuration, getTransportInfo } from '../../types/travel';

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 거리 문자열(예: "18.4 km", "500 m", "1,240km")을 km 단위 숫자로 변환합니다.
 * Excel SUM / SUMIFS 수식 계산을 위해 숫자값을 반환합니다.
 */
export function parseDistanceToKm(distance?: string): number {
    if (!distance) return 0;
    const cleaned = distance.replace(/,/g, '').trim().toLowerCase();
    const match = cleaned.match(/([\d.]+)\s*(km|m)?/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    if (Number.isNaN(value)) return 0;

    const unit = match[2];
    if (unit === 'm') {
        return Math.round((value / 1000) * 100) / 100;
    }
    return Math.round(value * 10) / 10;
}

/**
 * 시작일과 일차를 기준으로 날짜 객체와 한국어 포맷 문자열을 생성합니다.
 */
export function getDayDateInfo(startDate: string, dayIndex: number): {
    isoDate: string;
    koreanFullDate: string;
    koreanCheckInDate: string;
    shortLabel: string;
} {
    const baseDate = parseISO(startDate);
    const targetDate = addDays(baseDate, dayIndex - 1);
    const weekday = KOREAN_WEEKDAYS[targetDate.getDay()];

    return {
        isoDate: format(targetDate, 'yyyy-MM-dd'),
        koreanFullDate: `${format(targetDate, 'yyyy년 M월 d일')} (${weekday})`,
        koreanCheckInDate: `${format(targetDate, 'yyyy-MM-dd')} (${weekday})`,
        shortLabel: `${format(targetDate, 'MM.dd')} ${weekday}`,
    };
}

/**
 * Excel 시트 이름 규칙(31자 이내, 금지 문자 제거)을 준수하여 일차별 시트명을 생성합니다.
 * 예: "1일차 (11.19 목)"
 */
export function formatDaySheetName(dayIndex: number, startDate: string): string {
    const { shortLabel } = getDayDateInfo(startDate, dayIndex);
    const raw = `${dayIndex}일차 (${shortLabel})`;
    return raw.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
}

/**
 * 시트명을 Excel 수식에서 안전하게 참조할 수 있도록 작은따옴표로 감쌉니다.
 */
export function quoteSheetName(sheetName: string): string {
    return `'${sheetName.replace(/'/g, "''")}'`;
}

/**
 * HH:mm 문자열 두 개의 시간 차이를 한국어 소요시간 문자열로 계산합니다.
 */
export function calculateTimeDiffKorean(startTime?: string, endTime?: string): string {
    if (!startTime || !endTime || startTime === '-' || endTime === '-') return '-';
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return '-';

    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff <= 0) return '-';

    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
    if (hours > 0) return `${hours}시간`;
    return `${mins}분`;
}

/**
 * 일정의 표시용 소요시간 문자열을 반환합니다.
 */
export function resolveItineraryDuration(iti: Itinerary, effectiveEndTime?: string): string {
    if (iti.duration && iti.duration.trim()) {
        return formatDuration(iti.duration);
    }
    return calculateTimeDiffKorean(iti.time, effectiveEndTime || iti.endTime);
}

/**
 * 일정의 이동수단 표시 문자열을 생성합니다. (SUMIFS "*DRIVING*" 매칭 호환)
 */
export function formatTransportLabel(iti: Itinerary): string {
    if (iti.transportMode) {
        const info = getTransportInfo(iti.transportMode);
        const label = iti.transportMode === 'DRIVING' ? '차량 이동' : iti.transportMode === 'WALKING' ? '도보/현지체류' : info.label;
        return `${label} (${iti.transportMode})`;
    }
    if (iti.type === '이동') {
        return '차량 이동 (DRIVING)';
    }
    return '도보/현지체류 (WALKING)';
}

/**
 * Google 지도 검색 하이퍼링크 URL을 생성합니다.
 */
export function buildGoogleMapsSearchUrl(address?: string, lat?: number, lng?: number): string | null {
    const trimmed = address?.trim();
    if (trimmed && trimmed !== '-') {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
    }
    if (typeof lat === 'number' && typeof lng === 'number') {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return null;
}

/**
 * 상세 설명(description) 텍스트를 Excel 셀에서 가독성 좋게 여러 줄로 표시되도록 정제합니다.
 * - 기존 줄바꿈(\n) 유지
 * - 인라인 구분 기호(ㄴ, 🅿️, ※, •, ▶) 앞 자동 줄바꿈
 * - 긴 문장은 마침표(. ) 기준으로 자연스럽게 줄바꿈
 */
export function formatDescriptionForExcel(raw?: string): string {
    if (!raw || !raw.trim()) return '-';

    let text = raw.replace(/\r\n/g, '\n').trim();

    // 문장 중간에 등장하는 안내 기호 앞에 줄바꿈 추가
    text = text.replace(/([^\n])\s+(?=(?:ㄴ\s|🅿️|※|•|▶|✓))/g, '$1\n');

    // 한 줄이 긴 경우 마침표 뒤 공백에서 자연스럽게 줄바꿈
    const lines = text.split('\n').map((line) => {
        const trimmed = line.trim();
        if (trimmed.length <= 45) return trimmed;
        return trimmed.replace(/([.!?])\s+(?=[^\n])/g, '$1\n');
    });

    return lines.join('\n');
}

/**
 * 해당 일차의 일정 목록을 바탕으로 주요 방문지/테마 요약 문자열을 자동 생성합니다.
 */
export function summarizeDayTheme(dayItineraries: Itinerary[]): string {
    const highlights = dayItineraries
        .filter((i) => i.type === '관광' || i.type === '식사')
        .map((i) => i.content.replace(/^\[.*?\]\s*/, '').trim())
        .filter(Boolean);

    const unique = Array.from(new Set(highlights));
    if (unique.length > 0) {
        return unique.slice(0, 3).join(' · ');
    }

    const fallback = dayItineraries
        .map((i) => i.content.trim())
        .filter(Boolean)
        .slice(0, 2);
    return fallback.length > 0 ? fallback.join(' · ') : '자유 일정';
}

/**
 * 해당 일차에 연결된 숙소 정보를 찾습니다.
 */
export function findDayAccommodation(accommodations: Accommodation[], dayIndex: number): Accommodation | undefined {
    return accommodations.find((a) => a.dayIndex === dayIndex);
}

/**
 * 한글(전각) 문자 폭을 고려하여 줄바꿈 기준 예상 행 높이를 계산합니다.
 * 인쇄 시 텍스트가 잘리지 않도록 여유 패딩을 포함합니다.
 */
export function estimateRowHeight(
    cells: Array<{ text: string; colWidth: number }>,
    minHeight = 30,
    lineHeight = 15.5,
): number {
    let maxLines = 1;

    for (const { text, colWidth } of cells) {
        if (!text) continue;
        const effectiveWidth = Math.max(8, colWidth - 3);
        const paragraphs = text.split('\n');
        let lines = 0;

        for (const p of paragraphs) {
            if (!p) {
                lines += 1;
                continue;
            }
            // 한글/이모지/한자 등 전각 문자는 영문(0 기준 폭) 대비 약 2.05배 폭을 차지하므로 보정
            let visualLen = 0;
            for (const ch of p) {
                visualLen += /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF]/.test(ch) ? 2.05 : 1.05;
            }
            lines += Math.max(1, Math.ceil(visualLen / effectiveWidth));
        }
        if (lines > maxLines) {
            maxLines = lines;
        }
    }

    return Math.max(minHeight, Math.ceil(maxLines * lineHeight + 12));
}

/**
 * 일차별 일정 목록에 종료 시간이 비어 있는 항목이 있으면 다음 일정 시작 시간으로 보정합니다.
 */
export function sortAndNormalizeDayItineraries(itineraries: Itinerary[], dayIndex: number): Array<Itinerary & { effectiveEndTime: string }> {
    const sorted = itineraries
        .filter((i) => i.dayIndex === dayIndex)
        .sort((a, b) => a.time.localeCompare(b.time));

    return sorted.map((iti, idx) => {
        let effectiveEnd = iti.endTime?.trim() || '';
        if (!effectiveEnd && idx + 1 < sorted.length) {
            effectiveEnd = sorted[idx + 1].time;
        }
        return {
            ...iti,
            effectiveEndTime: effectiveEnd || '-',
        };
    });
}
