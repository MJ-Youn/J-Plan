import { differenceInDays, parseISO } from 'date-fns';
import type {
    Accommodation,
    ExpenseCategory,
    ExpenseCurrency,
    ExpenseItem,
    Itinerary,
    ItineraryType,
    Travel,
    TravelExportMeta,
} from '../../types/travel';
import {
    convertToKrw,
    DEFAULT_RATES_TO_KRW,
    formatItineraryCostsMultiline,
    getItineraryCosts,
} from '../expenseService';
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
    costText: string;
    costKrw: number;
}

export interface CombinedReportExpense extends ExpenseItem {
    source: 'itinerary' | 'manual';
    krwAmount: number;
}

export interface ExpenseCategorySummaryItem {
    category: ExpenseCategory;
    krwAmount: number;
    percent: number;
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
    expenseKrw: number;
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
    combinedExpenses: CombinedReportExpense[];
    expenseCategorySummary: ExpenseCategorySummaryItem[];
    totals: {
        itineraries: number;
        meals: number;
        tours: number;
        drivingKm: number;
        totalKm: number;
        toll: number;
        expenseKrw: number;
    };
}

const CATEGORY_ORDER: ExpenseCategory[] = ['식비', '숙박', '교통·렌터카', '관광·쇼핑', '기타'];

function mapItineraryTypeToExpenseCategory(type: ItineraryType): ExpenseCategory {
    if (type === '이동') return '교통·렌터카';
    if (type === '식사') return '식비';
    if (type === '관광') return '관광·쇼핑';
    return '기타';
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
    expenses?: ExpenseItem[];
    rates?: Record<ExpenseCurrency, number>;
    meta?: TravelExportMeta;
}): TravelReportModel {
    const {
        travel,
        itineraries,
        accommodations,
        expenses = [],
        rates = DEFAULT_RATES_TO_KRW,
        meta = travel.exportMeta || {},
    } = params;

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
            const itiCosts = getItineraryCosts(iti);
            const costText = formatItineraryCostsMultiline(itiCosts);
            const costKrw = itiCosts.reduce((sum, c) => sum + convertToKrw(c.amount, c.currency, rates), 0);

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
                costText,
                costKrw,
            };

            unifiedRows.push({
                ...item,
                seq: unifiedSeq++,
            });

            return item;
        });

        const manualDayExpenseKrw = expenses
            .filter((e) => e.dayIndex === dayIndex)
            .reduce((sum, e) => sum + convertToKrw(e.amount, e.currency, rates), 0);
        const itiDayExpenseKrw = rows.reduce((sum, r) => sum + r.costKrw, 0);

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
            expenseKrw: Math.round(itiDayExpenseKrw + manualDayExpenseKrw),
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

    const combinedFromItineraries: CombinedReportExpense[] = itineraries
        .filter((i) => i.travelId === travel.id)
        .flatMap((i) =>
            getItineraryCosts(i).map((c) => ({
                id: `${i.id}:${c.id}`,
                dayIndex: i.dayIndex,
                category: mapItineraryTypeToExpenseCategory(i.type),
                title: c.title && c.title !== i.content ? `${i.content} (${c.title})` : i.content,
                amount: c.amount,
                currency: c.currency,
                paidBy: c.paidBy,
                source: 'itinerary' as const,
                krwAmount: convertToKrw(c.amount, c.currency, rates),
            })),
        );

    const combinedFromManual: CombinedReportExpense[] = expenses.map((e) => ({
        ...e,
        source: 'manual' as const,
        krwAmount: convertToKrw(e.amount, e.currency, rates),
    }));

    const combinedExpenses = [...combinedFromItineraries, ...combinedFromManual].sort((a, b) => a.dayIndex - b.dayIndex);
    const totalExpenseKrw = Math.round(combinedExpenses.reduce((sum, e) => sum + e.krwAmount, 0));

    const catMap = new Map<ExpenseCategory, number>();
    CATEGORY_ORDER.forEach((c) => catMap.set(c, 0));
    for (const exp of combinedExpenses) {
        catMap.set(exp.category, (catMap.get(exp.category) || 0) + exp.krwAmount);
    }
    const expenseCategorySummary: ExpenseCategorySummaryItem[] = CATEGORY_ORDER.map((category) => {
        const krwAmount = Math.round(catMap.get(category) || 0);
        const percent = totalExpenseKrw > 0 ? (krwAmount / totalExpenseKrw) * 100 : 0;
        return { category, krwAmount, percent };
    }).filter((c) => c.krwAmount > 0);

    const totals = {
        itineraries: daySheets.reduce((s, d) => s + d.totalCount, 0),
        meals: daySheets.reduce((s, d) => s + d.mealCount, 0),
        tours: daySheets.reduce((s, d) => s + d.tourCount, 0),
        drivingKm: Math.round(daySheets.reduce((s, d) => s + d.drivingKm, 0) * 10) / 10,
        totalKm: Math.round(daySheets.reduce((s, d) => s + d.totalKm, 0) * 10) / 10,
        toll: daySheets.reduce((s, d) => s + d.toll, 0),
        expenseKrw: totalExpenseKrw,
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
        combinedExpenses,
        expenseCategorySummary,
        totals,
    };
}
