import { differenceInDays, parseISO } from 'date-fns';
import type { Accommodation, Itinerary, ItineraryType, Travel, TravelExportMeta } from '../../types/travel';
import {
    buildGoogleMapsSearchUrl,
    findDayAccommodation,
    formatDaySheetName,
    formatDescriptionForExcel,
    formatTransportLabel,
    getDayDateInfo,
    parseDistanceToKm,
    resolveItineraryDuration,
    sortAndNormalizeDayItineraries,
    summarizeDayTheme,
} from './excelHelpers';

export interface ReportRowItem {
    id: string;
    seq: number;
    dayIndex: number;
    dayLabel: string;
    time: string;
    endTime: string;
    duration: string;
    type: ItineraryType;
    content: string;
    description: string;
    originAddress: string;
    originMapUrl: string | null;
    destAddress: string;
    destMapUrl: string | null;
    transportLabel: string;
    distanceKm: number;
}

export interface DaySheetModel {
    dayIndex: number;
    sheetName: string;
    dateInfo: ReturnType<typeof getDayDateInfo>;
    theme: string;
    accLabel: string;
    rows: ReportRowItem[];
    totalCount: number;
    mealCount: number;
    tourCount: number;
    drivingKm: number;
    totalKm: number;
    toll: number;
    memo: string;
}

export interface AccommodationReportItem {
    id: string;
    dayIndex: number;
    checkInDate: string;
    name: string;
    phone: string;
    address: string;
    mapUrl: string | null;
    description: string;
}

export interface TravelReportModel {
    travel: Travel;
    totalDays: number;
    periodSummary: string;
    startInfo: ReturnType<typeof getDayDateInfo>;
    endInfo: ReturnType<typeof getDayDateInfo>;
    airportInfo: string;
    vehicleInfo: string;
    currencyUnit: string;
    daySheets: DaySheetModel[];
    unifiedRows: ReportRowItem[];
    accommodations: AccommodationReportItem[];
    totals: {
        itineraries: number;
        meals: number;
        tours: number;
        drivingKm: number;
        totalKm: number;
        toll: number;
    };
}

/**
 * 여행 데이터를 Excel 내보내기 및 화면 표 미리보기에서 공통으로 사용하는
 * 구조화된 보고서 모델(TravelReportModel)로 변환합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export function buildTravelReportModel(params: {
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    meta?: TravelExportMeta;
}): TravelReportModel {
    const { travel, itineraries, accommodations, meta = travel.exportMeta || {} } = params;

    const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1);
    const nightCount = Math.max(0, totalDays - 1);
    const periodSummary = nightCount > 0 ? `${nightCount}박 ${totalDays}일` : '당일치기';
    const startInfo = getDayDateInfo(travel.startDate, 1);
    const endInfo = getDayDateInfo(travel.startDate, totalDays);
    const currencyUnit = meta.currencyLabel?.trim() || '원';

    const daySheets: DaySheetModel[] = [];
    const unifiedRows: ReportRowItem[] = [];
    let unifiedSeq = 1;

    for (let dayIndex = 1; dayIndex <= totalDays; dayIndex++) {
        const sheetName = formatDaySheetName(dayIndex, travel.startDate);
        const dateInfo = getDayDateInfo(travel.startDate, dayIndex);
        const dayLabel = `${dayIndex}일차 (${dateInfo.shortLabel})`;
        const normalized = sortAndNormalizeDayItineraries(itineraries, dayIndex);
        const dayAcc = findDayAccommodation(accommodations, dayIndex);
        const isLastDay = dayIndex === totalDays;
        const accLabel = dayAcc ? dayAcc.name : isLastDay ? '귀가 / 귀국일' : '-';
        const theme = meta.dayThemes?.[dayIndex]?.trim() || summarizeDayTheme(normalized);
        const toll = meta.dayTolls?.[dayIndex] ?? 0;
        const memo = meta.dayMemos?.[dayIndex]?.trim() || '주요 이동 경로 및 주차/예약 확인';

        let drivingKm = 0;
        let totalKm = 0;

        const rows: ReportRowItem[] = normalized.map((iti, idx) => {
            const km = parseDistanceToKm(iti.distance);
            const transportLabel = formatTransportLabel(iti);
            totalKm += km;
            if (transportLabel.includes('DRIVING')) {
                drivingKm += km;
            }

            const originAddress = iti.address?.trim() || '-';
            const destAddress = iti.type === '이동' && iti.arrivalAddress?.trim() ? iti.arrivalAddress.trim() : '-';

            const item: ReportRowItem = {
                id: iti.id,
                seq: idx + 1,
                dayIndex,
                dayLabel,
                time: iti.time || '-',
                endTime: iti.effectiveEndTime || '-',
                duration: resolveItineraryDuration(iti, iti.effectiveEndTime),
                type: iti.type,
                content: iti.content || '-',
                description: formatDescriptionForExcel(iti.description),
                originAddress,
                originMapUrl: buildGoogleMapsSearchUrl(originAddress, iti.lat, iti.lng),
                destAddress,
                destMapUrl: buildGoogleMapsSearchUrl(destAddress, iti.arrivalLat, iti.arrivalLng),
                transportLabel,
                distanceKm: km,
            };

            unifiedRows.push({
                ...item,
                seq: unifiedSeq++,
            });

            return item;
        });

        daySheets.push({
            dayIndex,
            sheetName,
            dateInfo,
            theme,
            accLabel,
            rows,
            totalCount: rows.length,
            mealCount: rows.filter((r) => r.type === '식사').length,
            tourCount: rows.filter((r) => r.type === '관광').length,
            drivingKm: Math.round(drivingKm * 10) / 10,
            totalKm: Math.round(totalKm * 10) / 10,
            toll,
            memo,
        });
    }

    const sortedAccs: AccommodationReportItem[] = [...accommodations]
        .sort((a, b) => a.dayIndex - b.dayIndex)
        .map((acc) => {
            const dateInfo = getDayDateInfo(travel.startDate, acc.dayIndex);
            const addr = acc.address?.trim() || acc.name || '-';
            return {
                id: acc.id,
                dayIndex: acc.dayIndex,
                checkInDate: dateInfo.koreanCheckInDate,
                name: acc.name || '-',
                phone: acc.phone || '-',
                address: addr,
                mapUrl: buildGoogleMapsSearchUrl(addr),
                description: formatDescriptionForExcel(acc.description),
            };
        });

    const totals = {
        itineraries: daySheets.reduce((s, d) => s + d.totalCount, 0),
        meals: daySheets.reduce((s, d) => s + d.mealCount, 0),
        tours: daySheets.reduce((s, d) => s + d.tourCount, 0),
        drivingKm: Math.round(daySheets.reduce((s, d) => s + d.drivingKm, 0) * 10) / 10,
        totalKm: Math.round(daySheets.reduce((s, d) => s + d.totalKm, 0) * 10) / 10,
        toll: daySheets.reduce((s, d) => s + d.toll, 0),
    };

    return {
        travel,
        totalDays,
        periodSummary,
        startInfo,
        endInfo,
        airportInfo: meta.airportInfo?.trim() || '-',
        vehicleInfo: meta.vehicleInfo?.trim() || '-',
        currencyUnit,
        daySheets,
        unifiedRows,
        accommodations: sortedAccs,
        totals,
    };
}
