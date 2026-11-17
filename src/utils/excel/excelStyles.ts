import type { Borders, Fill, Font, Worksheet } from 'exceljs';
import type { ItineraryType } from '../../types/travel';

/**
 * Excel 내보내기용 컬러 팔레트 및 공통 스타일 정의 (일정체크.xlsx 디자인 기반)
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export const EXCEL_COLORS = {
    navyBanner: 'FF1E3A5F',
    blueHeader: 'FF2E5B88',
    subBannerBg: 'FFEDF2F7',
    zebraEvenBg: 'FFF8FAFC',
    white: 'FFFFFFFF',
    totalRowBg: 'FFE2E8F0',
    borderThin: 'FFCBD5E1',
    borderMedium: 'FF1E3A5F',
    textDark: 'FF0F172A',
    textBody: 'FF1E293B',
    textMuted: 'FF475569',
} as const;

export const THIN_BORDER: Partial<Borders> = {
    top: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
    bottom: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
    left: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
    right: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
};

export const HEADER_BORDER: Partial<Borders> = {
    top: { style: 'medium', color: { argb: EXCEL_COLORS.navyBanner } },
    bottom: { style: 'medium', color: { argb: EXCEL_COLORS.navyBanner } },
    left: { style: 'thin', color: { argb: 'FF4A77A8' } },
    right: { style: 'thin', color: { argb: 'FF4A77A8' } },
};

export const TOTAL_BORDER: Partial<Borders> = {
    top: { style: 'medium', color: { argb: EXCEL_COLORS.navyBanner } },
    bottom: { style: 'double', color: { argb: EXCEL_COLORS.navyBanner } },
    left: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
    right: { style: 'thin', color: { argb: EXCEL_COLORS.borderThin } },
};

export const FONT_FAMILY = 'Malgun Gothic';

export function makeFill(argb: string): Fill {
    return {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb },
    };
}

export function makeFont(options: { size?: number; bold?: boolean; color?: string } = {}): Partial<Font> {
    return {
        name: FONT_FAMILY,
        size: options.size ?? 10,
        bold: options.bold ?? false,
        color: { argb: options.color ?? EXCEL_COLORS.textBody },
    };
}

/**
 * 일정 구분('이동', '식사', '관광', '기타')에 따른 뱃지 배경/글자 색상 반환
 */
export function getCategoryBadgeStyle(type: ItineraryType): { bg: string; text: string } {
    switch (type) {
        case '이동':
            return { bg: 'FFE0F2FE', text: 'FF0369A1' };
        case '식사':
            return { bg: 'FFFEF3C7', text: 'FFB45309' };
        case '관광':
            return { bg: 'FFDCFCE7', text: 'FF15803D' };
        default:
            return { bg: 'FFF1F5F9', text: 'FF334155' };
    }
}

/**
 * A4 가로 인쇄 최적화 설정을 워크시트에 적용합니다.
 * - 가로 1페이지 맞춤 (fitToWidth = 1)
 * - 인쇄 반복 제목 행 (printTitlesRow) 지원
 * - 페이지 번호 푸터 자동 삽입
 */
export function applyPrintOptimizedPageSetup(
    sheet: Worksheet,
    options: {
        title: string;
        printTitlesRow?: string;
        fitToOnePage?: boolean;
        freezeRow?: number;
    },
): void {
    const { title, printTitlesRow, fitToOnePage = false, freezeRow } = options;

    sheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: fitToOnePage ? 1 : 0,
        horizontalCentered: true,
        margins: {
            left: 0.3,
            right: 0.3,
            top: 0.45,
            bottom: 0.45,
            header: 0.2,
            footer: 0.2,
        },
        ...(printTitlesRow ? { printTitlesRow } : {}),
    };

    sheet.headerFooter = {
        oddFooter: `&L${title}&R&P / &N 페이지`,
    };

    if (freezeRow && freezeRow > 0) {
        sheet.views = [{ state: 'frozen', ySplit: freezeRow }];
    }
}
