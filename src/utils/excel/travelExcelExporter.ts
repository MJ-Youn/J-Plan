import { differenceInDays, parseISO } from 'date-fns';
import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { Accommodation, ExpenseCurrency, ExpenseItem, Itinerary, Travel, TravelExportMeta } from '../../types/travel';
import { convertToKrw, DEFAULT_RATES_TO_KRW, formatItineraryCostsMultiline, getItineraryCosts } from '../expenseService';
import { generateDistanceChartPng, generateExpenseChartPng, type DayDistanceChartItem } from './chartImageGenerator';
import { buildTravelReportModel } from './excelDataBuilder';
import {
    buildGoogleMapsSearchUrl,
    estimateRowHeight,
    findDayAccommodation,
    formatDaySheetName,
    formatDescriptionForExcel,
    formatTransportLabel,
    getDayDateInfo,
    parseDistanceToKm,
    quoteSheetName,
    resolveItineraryDuration,
    sortAndNormalizeDayItineraries,
    summarizeDayTheme,
} from './excelHelpers';
import {
    applyPrintOptimizedPageSetup,
    EXCEL_COLORS,
    getCategoryBadgeStyle,
    HEADER_BORDER,
    makeFill,
    makeFont,
    THIN_BORDER,
    TOTAL_BORDER,
} from './excelStyles';

export interface ExcelExportOptions {
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    expenses?: ExpenseItem[];
    rates?: Record<ExpenseCurrency, number>;
    meta?: TravelExportMeta;
    includeUnifiedSheet?: boolean;
    includeChartImage?: boolean;
}

/**
 * Uint8Array 바이너리를 base64 문자열로 변환합니다. (브라우저 Buffer 비의존)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/**
 * 주소 셀에 텍스트와 Google Maps 검색 하이퍼링크를 함께 설정합니다.
 */
function setAddressCellValue(cell: Cell, addressText: string, lat?: number, lng?: number): boolean {
    const trimmed = addressText?.trim();
    if (!trimmed || trimmed === '-') {
        cell.value = '-';
        return false;
    }

    const mapUrl = buildGoogleMapsSearchUrl(trimmed, lat, lng);
    if (mapUrl) {
        cell.value = {
            text: trimmed,
            hyperlink: mapUrl,
            tooltip: 'Google 지도에서 위치 열기',
        };
        return true;
    }

    cell.value = trimmed;
    return false;
}

/**
 * 최종 결정된 여행 일정을 인쇄 최적화된 보고서형 Excel(.xlsx) 파일로 생성 및 다운로드합니다.
 * 시트 구성:
 * 1. 전체요약_숙소 (여행 메타 + 일차별 수식 요약 + 숙소 상세 + 주행거리 차트 + 메모)
 * 2. N일차 (MM.DD 요일) 시트들 (일차별 타임라인 표 + 합계 수식)
 * 3. 전체일정_통합 (필터/정렬 가능 통합 일정표)
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function exportTravelToExcel(options: ExcelExportOptions): Promise<void> {
    const {
        travel,
        itineraries,
        accommodations,
        expenses = [],
        rates,
        meta = travel.exportMeta || {},
        includeUnifiedSheet = true,
        includeChartImage = true,
    } = options;

    // 초기 번들 사이즈 최적화를 위해 exceljs 동적 로드 (ESM/CJS 인터롭 안전 처리)
    const ExcelJSModule = (await import('exceljs')) as unknown as {
        Workbook?: new () => Workbook;
        default?: {
            Workbook?: new () => Workbook;
            default?: { Workbook?: new () => Workbook };
        };
    };
    const WorkbookCtor =
        ExcelJSModule.Workbook ??
        ExcelJSModule.default?.Workbook ??
        ExcelJSModule.default?.default?.Workbook;
    if (!WorkbookCtor) {
        throw new Error('ExcelJS Workbook 생성자를 로드할 수 없습니다.');
    }
    const workbook = new WorkbookCtor();

    workbook.creator = 'J-Plan';
    workbook.created = new Date();
    workbook.modified = new Date();

    const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1);
    const daySheetNames = Array.from({ length: totalDays }, (_, i) => formatDaySheetName(i + 1, travel.startDate));

    // 1. 요약 시트 선점 (탭 첫 번째 위치 고정)
    const summarySheet = workbook.addWorksheet('전체요약_숙소');

    // 2. 일차별 시트 먼저 채워서 요약 시트 수식이 참조할 정확한 행 범위 확보
    const dayRowRanges: Array<{ startRow: number; endRow: number; drivingKm: number; totalKm: number }> = [];
    for (let i = 0; i < totalDays; i++) {
        const dayIndex = i + 1;
        const sheet = workbook.addWorksheet(daySheetNames[i]);
        const rangeInfo = buildDayDetailSheet({
            sheet,
            travel,
            dayIndex,
            totalDays,
            itineraries,
            accommodations,
            meta,
            rates,
        });
        dayRowRanges.push(rangeInfo);
    }

    // 3. 요약 시트 구성 (수식 + 숙소 + 차트)
    await buildSummarySheet({
        workbook,
        sheet: summarySheet,
        travel,
        totalDays,
        daySheetNames,
        dayRowRanges,
        itineraries,
        accommodations,
        meta,
        includeUnifiedSheet,
        includeChartImage,
    });

    // 4. 전체일정_통합 시트 구성 (옵션)
    if (includeUnifiedSheet) {
        const unifiedSheet = workbook.addWorksheet('전체일정_통합');
        buildUnifiedSheet({
            sheet: unifiedSheet,
            travel,
            totalDays,
            itineraries,
            rates,
        });
    }

    // 5. 경비_지출분석 시트 구성 (경비가 있는 경우)
    const expenseReport = buildTravelReportModel({
        travel,
        itineraries,
        accommodations,
        expenses,
        rates,
        meta,
    });
    if (expenseReport.combinedExpenses.length > 0) {
        const expenseSheet = workbook.addWorksheet('경비_지출분석');
        await buildExpenseAnalysisSheet({
            workbook,
            sheet: expenseSheet,
            travel,
            report: expenseReport,
            includeChartImage,
        });
    }

    // 5. 브라우저 파일 다운로드 트리거 (모바일 Safari/Android 호환성을 위해 DOM 부착 및 지연 해제)
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const safeFileName = (travel.name || 'jplan_schedule').replace(/[\\/:*?"<>|]/g, '_').trim() || 'jplan_schedule';
    const fileName = `${safeFileName}_일정표.xlsx`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
    }, 10000);
}

/**
 * 시트 1: 전체요약_숙소 시트를 생성합니다.
 */
async function buildSummarySheet(params: {
    workbook: Workbook;
    sheet: Worksheet;
    travel: Travel;
    totalDays: number;
    daySheetNames: string[];
    dayRowRanges: Array<{ startRow: number; endRow: number; drivingKm: number; totalKm: number }>;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    meta: TravelExportMeta;
    includeUnifiedSheet: boolean;
    includeChartImage: boolean;
}): Promise<void> {
    const {
        workbook,
        sheet,
        travel,
        totalDays,
        daySheetNames,
        dayRowRanges,
        itineraries,
        accommodations,
        meta,
        includeUnifiedSheet,
        includeChartImage,
    } = params;

    const currencyUnit = meta.currencyLabel || '원';

    // 열 너비 설정 (A~I, 가로 A4 1페이지 출력에 최적화된 비율)
    sheet.columns = [
        { width: 10 }, // A: 일차
        { width: 21 }, // B: 날짜
        { width: 34 }, // C: 주요 방문지 및 테마
        { width: 12 }, // D: 전체 일정수
        { width: 11 }, // E: 식사 횟수
        { width: 11 }, // F: 관광 횟수
        { width: 16 }, // G: 차량 주행(km)
        { width: 15 }, // H: 예상 통행료
        { width: 32 }, // I: 숙박지
    ];

    // ── 상단 타이틀 배너 (1행) ──
    const nightCount = Math.max(0, totalDays - 1);
    const periodSummary = nightCount > 0 ? `${nightCount}박 ${totalDays}일` : '당일치기';
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${travel.name} — 일정 및 숙소 종합 안내`;
    titleCell.font = makeFont({ size: 15, bold: true, color: EXCEL_COLORS.white });
    titleCell.fill = makeFill(EXCEL_COLORS.navyBanner);
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 36;
    sheet.getRow(2).height = 10;

    // ── 기본 정보 메타 표 (3~5행) ──
    const startInfo = getDayDateInfo(travel.startDate, 1);
    const endInfo = getDayDateInfo(travel.startDate, totalDays);
    const metaRows: Array<[string, string, string, string]> = [
        ['여행명', travel.name, '여행 기간', `${startInfo.koreanFullDate} ~ ${endInfo.koreanFullDate} (${periodSummary})`],
        ['방문 지역', travel.region || '-', '출도착 공항/편', meta.airportInfo?.trim() || '-'],
        [
            '이동 수단',
            meta.vehicleInfo?.trim() || '-',
            '시트 구성',
            `1~${totalDays}일차 일자별 시트${includeUnifiedSheet ? ' + 전체일정 통합표' : ''} + 숙소 요약`,
        ],
    ];

    metaRows.forEach(([l1, v1, l2, v2], idx) => {
        const r = 3 + idx;
        sheet.mergeCells(`B${r}:D${r}`);
        sheet.mergeCells(`F${r}:I${r}`);
        sheet.getRow(r).height = 24;

        const cA = sheet.getCell(`A${r}`);
        cA.value = l1;
        cA.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        cA.fill = makeFill(EXCEL_COLORS.subBannerBg);
        cA.alignment = { horizontal: 'center', vertical: 'middle' };

        const cB = sheet.getCell(`B${r}`);
        cB.value = v1;
        cB.font = makeFont({ color: EXCEL_COLORS.textDark });
        cB.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };

        const cE = sheet.getCell(`E${r}`);
        cE.value = l2;
        cE.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        cE.fill = makeFill(EXCEL_COLORS.subBannerBg);
        cE.alignment = { horizontal: 'center', vertical: 'middle' };

        const cF = sheet.getCell(`F${r}`);
        cF.value = v2;
        cF.font = makeFont({ color: EXCEL_COLORS.textDark });
        cF.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };

        for (let col = 1; col <= 9; col++) {
            sheet.getCell(r, col).border = THIN_BORDER;
        }
    });

    sheet.getRow(6).height = 12;

    // ── 섹션 1: 일차별 주요 테마 및 이동·일정 요약 ──
    sheet.mergeCells('A7:I7');
    const sec1Title = sheet.getCell('A7');
    sec1Title.value = '1. 일차별 주요 테마 및 이동·일정 요약';
    sec1Title.font = makeFont({ size: 12, bold: true, color: EXCEL_COLORS.navyBanner });
    sec1Title.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(7).height = 24;

    const summaryHeaders = [
        '일차',
        '날짜',
        '주요 방문지 및 테마',
        '전체 일정수',
        '식사 횟수',
        '관광 횟수',
        '차량 주행(km)',
        `예상 통행료(${currencyUnit})`,
        '숙박지',
    ];
    const headerRow = sheet.getRow(8);
    headerRow.height = 28;
    summaryHeaders.forEach((text, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = text;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = HEADER_BORDER;
    });

    const summaryStartRow = 9;
    const chartData: DayDistanceChartItem[] = [];

    for (let i = 0; i < totalDays; i++) {
        const dayIndex = i + 1;
        const r = summaryStartRow + i;
        const row = sheet.getRow(r);
        const dayItis = itineraries.filter((it) => it.dayIndex === dayIndex);
        const dayAcc = findDayAccommodation(accommodations, dayIndex);
        const dateInfo = getDayDateInfo(travel.startDate, dayIndex);
        const themeText = meta.dayThemes?.[dayIndex]?.trim() || summarizeDayTheme(dayItis);
        const tollVal = meta.dayTolls?.[dayIndex] ?? 0;

        const qSheet = quoteSheetName(daySheetNames[i]);
        const { startRow: dStart, endRow: dEnd, drivingKm, totalKm } = dayRowRanges[i];
        const hasEvents = dEnd >= dStart;
        const isLastDay = dayIndex === totalDays;
        const accDisplay = dayAcc ? dayAcc.name : isLastDay ? '귀가 / 귀국일' : '-';

        const rowBg = i % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;
        chartData.push({ label: `${dayIndex}일차`, drivingKm, totalKm });

        row.getCell(1).value = `${dayIndex}일차`;
        row.getCell(1).font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = dateInfo.koreanFullDate;
        row.getCell(2).font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(3).value = themeText;
        row.getCell(3).font = makeFont({ color: EXCEL_COLORS.textBody });
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };

        row.getCell(4).value = hasEvents ? { formula: `COUNTA(${qSheet}!F${dStart}:F${dEnd})`, result: dayItis.length } : 0;
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).numFmt = '#,##0';

        row.getCell(5).value = hasEvents ? { formula: `COUNTIF(${qSheet}!E${dStart}:E${dEnd},"식사")`, result: dayItis.filter((x) => x.type === '식사').length } : 0;
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).numFmt = '#,##0';

        row.getCell(6).value = hasEvents ? { formula: `COUNTIF(${qSheet}!E${dStart}:E${dEnd},"관광")`, result: dayItis.filter((x) => x.type === '관광').length } : 0;
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).numFmt = '#,##0';

        row.getCell(7).value = hasEvents ? { formula: `SUMIFS(${qSheet}!K${dStart}:K${dEnd},${qSheet}!J${dStart}:J${dEnd},"*DRIVING*")`, result: drivingKm } : 0;
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(7).numFmt = '#,##0.0';

        row.getCell(8).value = tollVal;
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).numFmt = '#,##0';

        row.getCell(9).value = accDisplay;
        row.getCell(9).font = makeFont({ color: EXCEL_COLORS.textBody });
        row.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };

        for (let col = 1; col <= 9; col++) {
            const cell = row.getCell(col);
            cell.fill = makeFill(rowBg);
            cell.border = THIN_BORDER;
            if (col >= 4 && col <= 8) {
                cell.font = makeFont({ color: EXCEL_COLORS.textBody });
            }
        }
        row.height = estimateRowHeight(
            [
                { text: themeText, colWidth: 34 },
                { text: accDisplay, colWidth: 32 },
            ],
            28,
        );
    }

    // 합계 행
    const summaryEndRow = summaryStartRow + totalDays - 1;
    const totalRowNum = summaryEndRow + 1;
    const totalRow = sheet.getRow(totalRowNum);
    totalRow.height = 27;

    totalRow.getCell(1).value = '합계';
    totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(3).value = `${periodSummary} 전체 일정 종합`;
    totalRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    totalRow.getCell(4).value = { formula: `SUM(D${summaryStartRow}:D${summaryEndRow})`, result: itineraries.length };
    totalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0';

    totalRow.getCell(5).value = {
        formula: `SUM(E${summaryStartRow}:E${summaryEndRow})`,
        result: itineraries.filter((x) => x.type === '식사').length,
    };
    totalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(5).numFmt = '#,##0';

    totalRow.getCell(6).value = {
        formula: `SUM(F${summaryStartRow}:F${summaryEndRow})`,
        result: itineraries.filter((x) => x.type === '관광').length,
    };
    totalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(6).numFmt = '#,##0';

    totalRow.getCell(7).value = {
        formula: `SUM(G${summaryStartRow}:G${summaryEndRow})`,
        result: chartData.reduce((sum, d) => sum + d.drivingKm, 0),
    };
    totalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(7).numFmt = '#,##0.0';

    totalRow.getCell(8).value = {
        formula: `SUM(H${summaryStartRow}:H${summaryEndRow})`,
        result: Object.values(meta.dayTolls || {}).reduce((sum, v) => sum + (v || 0), 0),
    };
    totalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(8).numFmt = '#,##0';

    for (let col = 1; col <= 9; col++) {
        const cell = totalRow.getCell(col);
        cell.fill = makeFill(EXCEL_COLORS.totalRowBg);
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        cell.border = TOTAL_BORDER;
    }

    // ── 섹션 2: 숙소 예약 및 체크인·주차 상세 안내 ──
    const accSecTitleRow = totalRowNum + 2;
    sheet.getRow(totalRowNum + 1).height = 12;
    sheet.mergeCells(`A${accSecTitleRow}:I${accSecTitleRow}`);
    const accTitleCell = sheet.getCell(`A${accSecTitleRow}`);
    accTitleCell.value = '2. 숙소 예약 및 체크인·안내 상세 (주소 클릭 시 Google 지도 연결)';
    accTitleCell.font = makeFont({ size: 12, bold: true, color: EXCEL_COLORS.navyBanner });
    accTitleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(accSecTitleRow).height = 24;

    const accHeaderRowNum = accSecTitleRow + 1;
    sheet.getRow(accHeaderRowNum).height = 26;
    sheet.mergeCells(`C${accHeaderRowNum}:D${accHeaderRowNum}`);
    sheet.mergeCells(`F${accHeaderRowNum}:G${accHeaderRowNum}`);
    sheet.mergeCells(`H${accHeaderRowNum}:I${accHeaderRowNum}`);

    const accHeaderSpecs: Array<[string, string]> = [
        [`A${accHeaderRowNum}`, '숙박일차'],
        [`B${accHeaderRowNum}`, '체크인 날짜'],
        [`C${accHeaderRowNum}`, '숙소명'],
        [`E${accHeaderRowNum}`, '전화번호'],
        [`F${accHeaderRowNum}`, '주소 (Google 지도 검색)'],
        [`H${accHeaderRowNum}`, '체크인·주차 및 상세 메모'],
    ];
    accHeaderSpecs.forEach(([ref, label]) => {
        const cell = sheet.getCell(ref);
        cell.value = label;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    for (let col = 1; col <= 9; col++) {
        sheet.getCell(accHeaderRowNum, col).border = HEADER_BORDER;
    }

    const sortedAccs = [...accommodations].sort((a, b) => a.dayIndex - b.dayIndex);
    let cursorRow = accHeaderRowNum + 1;

    if (sortedAccs.length === 0) {
        sheet.mergeCells(`A${cursorRow}:I${cursorRow}`);
        const emptyCell = sheet.getCell(`A${cursorRow}`);
        emptyCell.value = '등록된 숙소 정보가 없습니다.';
        emptyCell.font = makeFont({ color: EXCEL_COLORS.textMuted });
        emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let col = 1; col <= 9; col++) {
            sheet.getCell(cursorRow, col).border = THIN_BORDER;
        }
        sheet.getRow(cursorRow).height = 28;
        cursorRow += 1;
    } else {
        sortedAccs.forEach((acc, idx) => {
            const r = cursorRow + idx;
            const dateInfo = getDayDateInfo(travel.startDate, acc.dayIndex);
            const rowBg = idx % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;

            sheet.mergeCells(`C${r}:D${r}`);
            sheet.mergeCells(`F${r}:G${r}`);
            sheet.mergeCells(`H${r}:I${r}`);

            const cA = sheet.getCell(`A${r}`);
            cA.value = `${acc.dayIndex}일차`;
            cA.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
            cA.alignment = { horizontal: 'center', vertical: 'middle' };

            const cB = sheet.getCell(`B${r}`);
            cB.value = dateInfo.koreanCheckInDate;
            cB.font = makeFont({ color: EXCEL_COLORS.textDark });
            cB.alignment = { horizontal: 'center', vertical: 'middle' };

            const cC = sheet.getCell(`C${r}`);
            cC.value = acc.name || '-';
            cC.font = makeFont({ bold: true, color: EXCEL_COLORS.textDark });
            cC.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

            const cE = sheet.getCell(`E${r}`);
            cE.value = acc.phone || '-';
            cE.font = makeFont({ color: EXCEL_COLORS.textDark });
            cE.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

            const cF = sheet.getCell(`F${r}`);
            const accAddrText = acc.address?.trim() ? acc.address.trim() : acc.name || '-';
            const hasAccLink = setAddressCellValue(cF, accAddrText);
            cF.font = makeFont({ color: hasAccLink ? 'FF1D4ED8' : EXCEL_COLORS.textDark });
            cF.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

            const cH = sheet.getCell(`H${r}`);
            const descFormatted = formatDescriptionForExcel(acc.description);
            cH.value = descFormatted;
            cH.font = makeFont({ color: EXCEL_COLORS.textDark });
            cH.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

            for (let col = 1; col <= 9; col++) {
                const cell = sheet.getCell(r, col);
                cell.fill = makeFill(rowBg);
                cell.border = THIN_BORDER;
            }

            sheet.getRow(r).height = estimateRowHeight(
                [
                    { text: acc.name || '', colWidth: 46 },
                    { text: accAddrText, colWidth: 27 },
                    { text: descFormatted, colWidth: 47 },
                ],
                36,
            );
        });
        cursorRow += sortedAccs.length;
    }

    // ── 하단 섹션: 차트 이미지(좌) & 일차별 주요 메모 박스(우) ──
    const bottomRow = cursorRow + 1;
    sheet.getRow(cursorRow).height = 14;

    // 우측 메모 박스 (F~I열)
    sheet.mergeCells(`F${bottomRow}:I${bottomRow}`);
    const memoTitleCell = sheet.getCell(`F${bottomRow}`);
    memoTitleCell.value = '📌 여행 중 주요 유료 도로·주차·준비물 메모';
    memoTitleCell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
    memoTitleCell.fill = makeFill(EXCEL_COLORS.blueHeader);
    memoTitleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(bottomRow).height = 25;

    for (let i = 0; i < totalDays; i++) {
        const dayIndex = i + 1;
        const r = bottomRow + 1 + i;
        const dateInfo = getDayDateInfo(travel.startDate, dayIndex);
        const mmdd = dateInfo.shortLabel.split(' ')[0].replace('.', '/');
        const memoText = meta.dayMemos?.[dayIndex]?.trim() || '주요 이동 경로 및 주차/예약 확인';

        sheet.mergeCells(`G${r}:I${r}`);
        const cF = sheet.getCell(`F${r}`);
        cF.value = `${dayIndex}일차 (${mmdd})`;
        cF.font = makeFont({ size: 9, bold: true, color: EXCEL_COLORS.navyBanner });
        cF.fill = makeFill(EXCEL_COLORS.subBannerBg);
        cF.alignment = { horizontal: 'center', vertical: 'middle' };

        const cG = sheet.getCell(`G${r}`);
        cG.value = memoText;
        cG.font = makeFont({ size: 9, color: EXCEL_COLORS.textBody });
        cG.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        for (let col = 6; col <= 9; col++) {
            sheet.getCell(r, col).border = THIN_BORDER;
        }
        sheet.getRow(r).height = estimateRowHeight([{ text: memoText, colWidth: 62 }], 28, 14);
    }

    // 좌측 주행거리 차트 이미지 삽입 (A~E열)
    if (includeChartImage) {
        try {
            const pngBytes = await generateDistanceChartPng(chartData);
            if (pngBytes) {
                const imageId = workbook.addImage({
                    base64: uint8ArrayToBase64(pngBytes),
                    extension: 'png',
                });
                sheet.addImage(imageId, {
                    tl: { col: 0, row: bottomRow - 1 },
                    ext: { width: 500, height: 220 },
                });
            }
        } catch (chartErr) {
            console.warn('[travelExcelExporter] 주행거리 차트 이미지 삽입 건너뜀:', chartErr);
        }
    }

    // 요약 시트는 가로 A4 1페이지에 깔끔히 출력되도록 설정
    applyPrintOptimizedPageSetup(sheet, {
        title: `${travel.name} — 종합 안내`,
        fitToOnePage: true,
    });
}

/**
 * 시트 2~N: 일차별 상세 일정 시트를 생성합니다. (위/경도 열 제외, 주소는 Google 지도 검색 링크 포함)
 */
function buildDayDetailSheet(params: {
    sheet: Worksheet;
    travel: Travel;
    dayIndex: number;
    totalDays: number;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    meta: TravelExportMeta;
    rates?: Record<ExpenseCurrency, number>;
}): { startRow: number; endRow: number; drivingKm: number; totalKm: number } {
    const { sheet, travel, dayIndex, totalDays, itineraries, accommodations, meta, rates = DEFAULT_RATES_TO_KRW } = params;

    const maxCol = 12;
    const lastColLetter = 'L';

    const colWidths = [
        6, // A: 순번
        9.5, // B: 시작시간
        9.5, // C: 종료시간
        12, // D: 소요시간
        9, // E: 구분
        28, // F: 일정명
        52, // G: 상세 내용 및 이용 팁 (여러 줄 가독성 확보를 위해 확장)
        32, // H: 장소 / 출발지 주소 (Google 지도 검색)
        32, // I: 도착지 주소 (Google 지도 검색)
        18, // J: 이동수단
        11, // K: 거리(km)
        24, // L: 경비
    ];
    sheet.columns = colWidths.map((w) => ({ width: w }));

    const dayItis = sortAndNormalizeDayItineraries(itineraries, dayIndex);
    const dayAcc = findDayAccommodation(accommodations, dayIndex);
    const dateInfo = getDayDateInfo(travel.startDate, dayIndex);
    const themeText = meta.dayThemes?.[dayIndex]?.trim() || summarizeDayTheme(dayItis);
    const isLastDay = dayIndex === totalDays;
    const accLabel = dayAcc ? dayAcc.name : isLastDay ? '귀가 / 귀국일' : '미정';

    // ── 1행: 타이틀 배너 ──
    sheet.mergeCells(`A1:${lastColLetter}1`);
    const banner = sheet.getCell('A1');
    banner.value = `${travel.name}  |  ${dayIndex}일 차: ${themeText}`;
    banner.font = makeFont({ size: 14, bold: true, color: EXCEL_COLORS.white });
    banner.fill = makeFill(EXCEL_COLORS.navyBanner);
    banner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 34;

    // ── 2행: 일자 / 숙박 / 차량 요약 바 ──
    sheet.mergeCells(`A2:${lastColLetter}2`);
    const subBanner = sheet.getCell('A2');
    const vehiclePart = meta.vehicleInfo?.trim() ? `    |    🚗 차량: ${meta.vehicleInfo.trim()}` : '';
    subBanner.value = `📅 일자: ${dateInfo.koreanFullDate}    |    🏨 숙박: ${accLabel}${vehiclePart}`;
    subBanner.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
    subBanner.fill = makeFill(EXCEL_COLORS.subBannerBg);
    subBanner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(2).height = 24;
    sheet.getRow(3).height = 10;

    // ── 4행: 테이블 헤더 ──
    const headers = [
        '순번',
        '시작시간',
        '종료시간',
        '소요시간',
        '구분',
        '일정명',
        '상세 내용 및 이용 팁',
        '장소 / 출발지 주소 (Google 지도)',
        '도착지 주소 (Google 지도)',
        '이동수단',
        '거리(km)',
        '경비',
    ];
    const headerRow = sheet.getRow(4);
    headerRow.height = 28;
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = HEADER_BORDER;
    });

    // ── 5행~: 일정 데이터 행 ──
    const startRow = 5;
    let totalKm = 0;
    let drivingKm = 0;
    let totalCostKrw = 0;

    if (dayItis.length === 0) {
        const row = sheet.getRow(startRow);
        sheet.mergeCells(`A${startRow}:${lastColLetter}${startRow}`);
        const cell = row.getCell(1);
        cell.value = '등록된 세부 일정이 없습니다.';
        cell.font = makeFont({ color: EXCEL_COLORS.textMuted });
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let col = 1; col <= maxCol; col++) {
            row.getCell(col).border = THIN_BORDER;
        }
        row.height = 30;
        applyPrintOptimizedPageSetup(sheet, {
            title: `${travel.name} (${dayIndex}일차)`,
            printTitlesRow: '1:4',
            freezeRow: 4,
        });
        return { startRow, endRow: startRow - 1, drivingKm: 0, totalKm: 0 };
    }

    dayItis.forEach((iti, idx) => {
        const r = startRow + idx;
        const row = sheet.getRow(r);
        const rowBg = idx % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;
        const badge = getCategoryBadgeStyle(iti.type);

        const km = parseDistanceToKm(iti.distance);
        totalKm += km;
        const transportText = formatTransportLabel(iti);
        if (transportText.includes('DRIVING')) {
            drivingKm += km;
        }

        const durationText = resolveItineraryDuration(iti, iti.effectiveEndTime);
        const descText = formatDescriptionForExcel(iti.description);
        const originAddrText = iti.address?.trim() || '-';
        const destAddrText = iti.type === '이동' && iti.arrivalAddress?.trim() ? iti.arrivalAddress.trim() : '-';

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = iti.time || '-';
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(3).value = iti.effectiveEndTime || '-';
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(4).value = durationText;
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        row.getCell(5).value = iti.type;
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(6).value = iti.content || '-';
        row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        row.getCell(7).value = descText;
        row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        const hasOriginLink = setAddressCellValue(row.getCell(8), originAddrText, iti.lat, iti.lng);
        row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        const hasDestLink = setAddressCellValue(row.getCell(9), destAddrText, iti.arrivalLat, iti.arrivalLng);
        row.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        row.getCell(10).value = transportText;
        row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        row.getCell(11).value = km;
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(11).numFmt = '#,##0.0';

        const itiCosts = getItineraryCosts(iti);
        const costText = formatItineraryCostsMultiline(itiCosts);
        itiCosts.forEach((c) => {
            totalCostKrw += convertToKrw(c.amount, c.currency, rates);
        });
        row.getCell(12).value = costText;
        row.getCell(12).alignment = { horizontal: itiCosts.length > 1 ? 'left' : 'right', vertical: 'middle', wrapText: true };

        for (let col = 1; col <= maxCol; col++) {
            const cell = row.getCell(col);
            cell.border = THIN_BORDER;

            if (col === 5) {
                cell.fill = makeFill(badge.bg);
                cell.font = makeFont({ bold: true, color: badge.text });
            } else if (col === 6) {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ bold: true, color: EXCEL_COLORS.textDark });
            } else if ((col === 8 && hasOriginLink) || (col === 9 && hasDestLink)) {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ color: 'FF1D4ED8' });
            } else {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ color: EXCEL_COLORS.textBody });
            }
        }

        row.height = estimateRowHeight(
            [
                { text: iti.content || '', colWidth: 28 },
                { text: descText, colWidth: 52 },
                { text: originAddrText, colWidth: 32 },
                { text: destAddrText, colWidth: 32 },
                { text: costText, colWidth: 24 },
            ],
            34,
        );
    });

    // ── 합계 행 ──
    const endRow = startRow + dayItis.length - 1;
    const totalRowNum = endRow + 1;
    const totalRow = sheet.getRow(totalRowNum);
    totalRow.height = 26;

    totalRow.getCell(1).value = '합계';
    totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    totalRow.getCell(6).value = {
        formula: `COUNTA(F${startRow}:F${endRow})&"개 세부 일정"`,
        result: `${dayItis.length}개 세부 일정`,
    };
    totalRow.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };

    totalRow.getCell(7).value = {
        formula: `"차량 주행: "&TEXT(SUMIFS(K${startRow}:K${endRow},J${startRow}:J${endRow},"*DRIVING*"),"#,##0.0")&" km"`,
        result: `차량 주행: ${drivingKm.toFixed(1)} km`,
    };
    totalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

    totalRow.getCell(10).value = '총 이동거리';
    totalRow.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };

    totalRow.getCell(11).value = { formula: `SUM(K${startRow}:K${endRow})`, result: totalKm };
    totalRow.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(11).numFmt = '#,##0.0';

    totalRow.getCell(12).value = totalCostKrw > 0 ? `₩${Math.round(totalCostKrw).toLocaleString()}` : '-';
    totalRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };

    for (let col = 1; col <= maxCol; col++) {
        const cell = totalRow.getCell(col);
        cell.fill = makeFill(EXCEL_COLORS.totalRowBg);
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        cell.border = TOTAL_BORDER;
    }

    // 인쇄 최적화 (1~4행 매 페이지 반복 + 가로 A4 1폭 맞춤)
    applyPrintOptimizedPageSetup(sheet, {
        title: `${travel.name} (${dayIndex}일차)`,
        printTitlesRow: '1:4',
        freezeRow: 4,
    });

    return {
        startRow,
        endRow,
        drivingKm: Math.round(drivingKm * 10) / 10,
        totalKm: Math.round(totalKm * 10) / 10,
    };
}

/**
 * 마지막 시트: 전체일정_통합 시트를 생성합니다. (위/경도 열 제외, 주소 Google 지도 링크 포함)
 */
function buildUnifiedSheet(params: {
    sheet: Worksheet;
    travel: Travel;
    totalDays: number;
    itineraries: Itinerary[];
    rates?: Record<ExpenseCurrency, number>;
}): void {
    const { sheet, travel, totalDays, itineraries, rates = DEFAULT_RATES_TO_KRW } = params;

    const maxCol = 13;
    const lastColLetter = 'M';

    const colWidths = [
        15, // A: 일차
        6, // B: 순번
        9.5, // C: 시작시간
        9.5, // D: 종료시간
        12, // E: 소요시간
        9, // F: 구분
        28, // G: 일정명
        52, // H: 상세 내용 및 이용 팁
        32, // I: 장소 / 출발지 주소
        32, // J: 도착지 주소
        18, // K: 이동수단
        11, // L: 거리(km)
        24, // M: 경비
    ];
    sheet.columns = colWidths.map((w) => ({ width: w }));

    // 1행: 배너
    sheet.mergeCells(`A1:${lastColLetter}1`);
    const banner = sheet.getCell('A1');
    banner.value = `${travel.name} — 전체 일정 통합표 (필터 및 일괄 인쇄용)`;
    banner.font = makeFont({ size: 14, bold: true, color: EXCEL_COLORS.white });
    banner.fill = makeFill(EXCEL_COLORS.navyBanner);
    banner.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 34;

    // 2행: 헤더
    const headers = [
        '일차',
        '순번',
        '시작시간',
        '종료시간',
        '소요시간',
        '구분',
        '일정명',
        '상세 내용 및 이용 팁',
        '장소 / 출발지 주소 (Google 지도)',
        '도착지 주소 (Google 지도)',
        '이동수단',
        '거리(km)',
        '경비',
    ];
    const headerRow = sheet.getRow(2);
    headerRow.height = 28;
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = HEADER_BORDER;
    });

    // 일차별로 정렬/보정된 전체 일정 병합
    const allNormalized: Array<Itinerary & { effectiveEndTime: string; dayLabel: string }> = [];
    for (let day = 1; day <= totalDays; day++) {
        const dateInfo = getDayDateInfo(travel.startDate, day);
        const dayLabel = `${day}일차 (${dateInfo.shortLabel})`;
        const dayList = sortAndNormalizeDayItineraries(itineraries, day);
        dayList.forEach((item) => {
            allNormalized.push({ ...item, dayLabel });
        });
    }

    const startRow = 3;
    let totalKm = 0;
    let totalCostKrw = 0;

    allNormalized.forEach((iti, idx) => {
        const r = startRow + idx;
        const row = sheet.getRow(r);
        const rowBg = idx % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;
        const badge = getCategoryBadgeStyle(iti.type);

        const km = parseDistanceToKm(iti.distance);
        totalKm += km;

        const durationText = resolveItineraryDuration(iti, iti.effectiveEndTime);
        const descText = formatDescriptionForExcel(iti.description);
        const originAddrText = iti.address?.trim() || '-';
        const destAddrText = iti.type === '이동' && iti.arrivalAddress?.trim() ? iti.arrivalAddress.trim() : '-';

        row.getCell(1).value = iti.dayLabel;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = idx + 1;
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(3).value = iti.time || '-';
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(4).value = iti.effectiveEndTime || '-';
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(5).value = durationText;
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        row.getCell(6).value = iti.type;
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(7).value = iti.content || '-';
        row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        row.getCell(8).value = descText;
        row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        const hasOriginLink = setAddressCellValue(row.getCell(9), originAddrText, iti.lat, iti.lng);
        row.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        const hasDestLink = setAddressCellValue(row.getCell(10), destAddrText, iti.arrivalLat, iti.arrivalLng);
        row.getCell(10).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        row.getCell(11).value = formatTransportLabel(iti);
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        row.getCell(12).value = km;
        row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(12).numFmt = '#,##0.0';

        const itiCosts = getItineraryCosts(iti);
        const costText = formatItineraryCostsMultiline(itiCosts);
        itiCosts.forEach((c) => {
            totalCostKrw += convertToKrw(c.amount, c.currency, rates);
        });
        row.getCell(13).value = costText;
        row.getCell(13).alignment = { horizontal: itiCosts.length > 1 ? 'left' : 'right', vertical: 'middle', wrapText: true };

        for (let col = 1; col <= maxCol; col++) {
            const cell = row.getCell(col);
            cell.border = THIN_BORDER;

            if (col === 6) {
                cell.fill = makeFill(badge.bg);
                cell.font = makeFont({ bold: true, color: badge.text });
            } else if (col === 7) {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ bold: true, color: EXCEL_COLORS.textDark });
            } else if ((col === 9 && hasOriginLink) || (col === 10 && hasDestLink)) {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ color: 'FF1D4ED8' });
            } else {
                cell.fill = makeFill(rowBg);
                cell.font = makeFont({ color: EXCEL_COLORS.textBody });
            }
        }

        row.height = estimateRowHeight(
            [
                { text: iti.content || '', colWidth: 28 },
                { text: descText, colWidth: 52 },
                { text: originAddrText, colWidth: 32 },
                { text: destAddrText, colWidth: 32 },
                { text: costText, colWidth: 24 },
            ],
            34,
        );
    });

    if (allNormalized.length > 0) {
        const endRow = startRow + allNormalized.length - 1;
        const totalRowNum = endRow + 1;
        const totalRow = sheet.getRow(totalRowNum);
        totalRow.height = 26;

        totalRow.getCell(1).value = '전체 합계';
        totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        totalRow.getCell(7).value = {
            formula: `COUNTA(G${startRow}:G${endRow})&"개 전체 일정"`,
            result: `${allNormalized.length}개 전체 일정`,
        };
        totalRow.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };

        totalRow.getCell(12).value = { formula: `SUM(L${startRow}:L${endRow})`, result: totalKm };
        totalRow.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
        totalRow.getCell(12).numFmt = '#,##0.0';

        totalRow.getCell(13).value = totalCostKrw > 0 ? `₩${Math.round(totalCostKrw).toLocaleString()}` : '-';
        totalRow.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };

        for (let col = 1; col <= maxCol; col++) {
            const cell = totalRow.getCell(col);
            cell.fill = makeFill(EXCEL_COLORS.totalRowBg);
            cell.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
            cell.border = TOTAL_BORDER;
        }

        // 자동 필터 설정
        sheet.autoFilter = {
            from: { row: 2, column: 1 },
            to: { row: endRow, column: maxCol },
        };
    }

    applyPrintOptimizedPageSetup(sheet, {
        title: `${travel.name} — 전체 일정 통합표`,
        printTitlesRow: '1:2',
        freezeRow: 2,
    });
}

/**
 * 시트 4: 경비_지출분석 시트를 생성합니다.
 * 카테고리별 지출 요약 + 상세 내역표(SUM 수식) + 도넛/막대 그래프 이미지를 포함합니다.
 */
async function buildExpenseAnalysisSheet(params: {
    workbook: Workbook;
    sheet: Worksheet;
    travel: Travel;
    report: ReturnType<typeof buildTravelReportModel>;
    includeChartImage: boolean;
}): Promise<void> {
    const { workbook, sheet, travel, report, includeChartImage } = params;

    sheet.columns = [
        { width: 10 }, // A: 일차
        { width: 16 }, // B: 구분
        { width: 34 }, // C: 지출 내역
        { width: 14 }, // D: 원본 금액
        { width: 10 }, // E: 통화
        { width: 18 }, // F: 원화 환산액(KRW)
        { width: 14 }, // G: 결제자
        { width: 14 }, // H: 출처
    ];

    // 1행: 배너
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${travel.name} — 경비 · 지출 분석 리포트`;
    titleCell.font = makeFont({ size: 15, bold: true, color: EXCEL_COLORS.white });
    titleCell.fill = makeFill(EXCEL_COLORS.navyBanner);
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 34;

    // 2행: 카테고리 요약 섹션 헤더
    sheet.mergeCells('A2:H2');
    const catHeader = sheet.getCell('A2');
    catHeader.value = '1. 항목별 지출 요약 (KRW 환산 기준)';
    catHeader.font = makeFont({ size: 11, bold: true, color: EXCEL_COLORS.navyBanner });
    catHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(2).height = 24;

    const catHeaders = ['구분', '원화 환산액 (KRW)', '비중 (%)'];
    const catTableHeaderRow = sheet.getRow(3);
    catTableHeaderRow.height = 24;
    catHeaders.forEach((h, i) => {
        const cell = catTableHeaderRow.getCell(i + 1);
        cell.value = h;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = HEADER_BORDER;
    });

    let currentRow = 4;
    report.expenseCategorySummary.forEach((cat, idx) => {
        const row = sheet.getRow(currentRow);
        row.height = 22;
        row.getCell(1).value = cat.category;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = cat.krwAmount;
        row.getCell(2).numFmt = '#,##0';
        row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(3).value = Math.round(cat.percent * 10) / 1000;
        row.getCell(3).numFmt = '0.0%';
        row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

        const bg = idx % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;
        for (let c = 1; c <= 3; c++) {
            const cell = row.getCell(c);
            cell.fill = makeFill(bg);
            cell.border = THIN_BORDER;
            cell.font = makeFont({ bold: c === 1 });
        }
        currentRow++;
    });

    // 카테고리 합계 행
    const catTotalRow = sheet.getRow(currentRow);
    catTotalRow.height = 24;
    catTotalRow.getCell(1).value = '총 지출 합계';
    catTotalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    catTotalRow.getCell(2).value = {
        formula: report.expenseCategorySummary.length > 0 ? `SUM(B4:B${currentRow - 1})` : '0',
        result: report.totals.expenseKrw,
    };
    catTotalRow.getCell(2).numFmt = '#,##0';
    catTotalRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    catTotalRow.getCell(3).value = 1;
    catTotalRow.getCell(3).numFmt = '0.0%';
    catTotalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    for (let c = 1; c <= 3; c++) {
        const cell = catTotalRow.getCell(c);
        cell.fill = makeFill(EXCEL_COLORS.totalRowBg);
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
        cell.border = TOTAL_BORDER;
    }

    // 그래프 이미지 삽입 (카테고리 도넛 + 일차별 막대)
    let chartBottomRow = currentRow + 1;
    if (includeChartImage) {
        try {
            const chartPng = await generateExpenseChartPng({
                categories: report.expenseCategorySummary,
                dailyTotals: report.daySheets.map((d) => ({ label: `${d.dayIndex}일차`, krwAmount: d.expenseKrw })),
                totalKrw: report.totals.expenseKrw,
            });
            if (chartPng) {
                const imgId = workbook.addImage({
                    base64: uint8ArrayToBase64(chartPng),
                    extension: 'png',
                });
                sheet.addImage(imgId, {
                    tl: { col: 3.2, row: 2.2 },
                    ext: { width: 520, height: 192 },
                });
                chartBottomRow = Math.max(chartBottomRow, 13);
            }
        } catch (chartErr) {
            console.warn('[travelExcelExporter] 경비 차트 이미지 삽입 건너뜀:', chartErr);
        }
    }

    // 2. 전체 지출 상세 내역표
    const listTitleRowNum = chartBottomRow + 1;
    sheet.mergeCells(`A${listTitleRowNum}:H${listTitleRowNum}`);
    const listTitle = sheet.getCell(`A${listTitleRowNum}`);
    listTitle.value = '2. 전체 지출 상세 내역 (일정 연동 + 직접 입력)';
    listTitle.font = makeFont({ size: 11, bold: true, color: EXCEL_COLORS.navyBanner });
    listTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(listTitleRowNum).height = 24;

    const listHeaderRowNum = listTitleRowNum + 1;
    const listHeaders = ['일차', '구분', '지출 내역', '금액', '통화', '원화 환산액 (KRW)', '결제자', '출처'];
    const listHeaderRow = sheet.getRow(listHeaderRowNum);
    listHeaderRow.height = 25;
    listHeaders.forEach((h, i) => {
        const cell = listHeaderRow.getCell(i + 1);
        cell.value = h;
        cell.font = makeFont({ bold: true, color: EXCEL_COLORS.white });
        cell.fill = makeFill(EXCEL_COLORS.blueHeader);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = HEADER_BORDER;
    });

    const dataStartRow = listHeaderRowNum + 1;
    report.combinedExpenses.forEach((exp, idx) => {
        const r = sheet.getRow(dataStartRow + idx);
        r.height = 22;
        r.getCell(1).value = `${exp.dayIndex}일차`;
        r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        r.getCell(2).value = exp.category;
        r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        r.getCell(3).value = exp.title;
        r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        r.getCell(4).value = exp.amount;
        r.getCell(4).numFmt = '#,##0.##';
        r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

        r.getCell(5).value = exp.currency;
        r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

        r.getCell(6).value = Math.round(exp.krwAmount);
        r.getCell(6).numFmt = '#,##0';
        r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

        r.getCell(7).value = exp.paidBy || '-';
        r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

        r.getCell(8).value = exp.source === 'itinerary' ? '일정 연동' : '직접 입력';
        r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

        const bg = idx % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebraEvenBg;
        for (let c = 1; c <= 8; c++) {
            const cell = r.getCell(c);
            cell.fill = makeFill(bg);
            cell.border = THIN_BORDER;
            cell.font = makeFont({ bold: c === 3 || c === 6 });
        }
    });

    if (report.combinedExpenses.length > 0) {
        const dataEndRow = dataStartRow + report.combinedExpenses.length - 1;
        const totalRow = sheet.getRow(dataEndRow + 1);
        totalRow.height = 26;
        totalRow.getCell(1).value = '합계';
        totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        totalRow.getCell(3).value = `총 ${report.combinedExpenses.length}건`;
        totalRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        totalRow.getCell(6).value = {
            formula: `SUM(F${dataStartRow}:F${dataEndRow})`,
            result: report.totals.expenseKrw,
        };
        totalRow.getCell(6).numFmt = '#,##0';
        totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
        for (let c = 1; c <= 8; c++) {
            const cell = totalRow.getCell(c);
            cell.fill = makeFill(EXCEL_COLORS.totalRowBg);
            cell.font = makeFont({ bold: true, color: EXCEL_COLORS.navyBanner });
            cell.border = TOTAL_BORDER;
        }
    }

    applyPrintOptimizedPageSetup(sheet, {
        title: `${travel.name} — 경비 · 지출 분석`,
        printTitlesRow: '1:1',
        freezeRow: 1,
    });
}
