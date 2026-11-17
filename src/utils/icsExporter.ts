import { addDays, format, parseISO } from 'date-fns';
import type { Itinerary, Travel } from '../types/travel';

/**
 * RFC 5545 iCalendar 텍스트 이스케이프 처리
 */
function escapeIcsText(text?: string): string {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\r\n|\r|\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

function parseHhMmToMins(timeStr?: string): number {
    if (!timeStr) return 9 * 60;
    const [h, m] = timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 9 * 60;
    return Math.max(0, Math.min(23 * 60 + 59, h * 60 + m));
}

function formatIcsDateTime(baseDate: Date, dayIndex: number, mins: number): string {
    const targetDate = addDays(baseDate, dayIndex - 1);
    const datePart = format(targetDate, 'yyyyMMdd');
    const hh = Math.floor(mins / 60)
        .toString()
        .padStart(2, '0');
    const mm = (mins % 60).toString().padStart(2, '0');
    return `${datePart}T${hh}${mm}00`;
}

/**
 * 여행 일정을 표준 iCalendar(.ics) 파일로 변환하여 다운로드합니다.
 * Google 캘린더, Apple 캘린더, Outlook 등에 바로 가져올 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export function exportTravelToIcs(travel: Travel, itineraries: Itinerary[]): void {
    const baseDate = parseISO(travel.startDate);
    const nowStamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

    const sorted = [...itineraries].sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.time.localeCompare(b.time);
    });

    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//J-Plan//Travel Itinerary//KO',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeIcsText(travel.name)}`,
    ];

    sorted.forEach((iti, idx) => {
        const startMins = parseHhMmToMins(iti.time);
        let endMins = iti.endTime ? parseHhMmToMins(iti.endTime) : startMins + 60;
        if (endMins <= startMins) {
            endMins = Math.min(23 * 60 + 59, startMins + 30);
        }

        const dtStart = formatIcsDateTime(baseDate, iti.dayIndex, startMins);
        const dtEnd = formatIcsDateTime(baseDate, iti.dayIndex, endMins);
        const location =
            iti.type === '이동' && iti.arrivalAddress
                ? `${iti.address} -> ${iti.arrivalAddress}`
                : iti.address || '';

        const descParts = [
            iti.description?.trim(),
            iti.duration ? `소요시간: ${iti.duration}` : '',
            iti.distance ? `거리: ${iti.distance}` : '',
        ].filter(Boolean);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${iti.id || `jplan-${idx}`}@j-plan.app`);
        lines.push(`DTSTAMP:${nowStamp}`);
        lines.push(`DTSTART:${dtStart}`);
        lines.push(`DTEND:${dtEnd}`);
        lines.push(`SUMMARY:${escapeIcsText(`[${iti.type}] ${iti.content}`)}`);
        if (location) {
            lines.push(`LOCATION:${escapeIcsText(location)}`);
        }
        if (descParts.length > 0) {
            lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
        }
        lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');

    const content = lines.join('\r\n');
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = travel.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'jplan_calendar';
    a.href = url;
    a.download = `${safeName}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}
