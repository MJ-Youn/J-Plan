import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, ExternalLink, FileSpreadsheet, Search, SlidersHorizontal, Loader2 } from 'lucide-react';
import type { Accommodation, ExpenseCurrency, Itinerary, ItineraryType, Travel } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useTravelStore } from '../../../store/travelStore';
import { DEFAULT_RATES_TO_KRW, resolveTravelExchangeRates } from '../../../utils/expenseService';
import { buildTravelReportModel, type ReportRowItem } from '../../../utils/excel/excelDataBuilder';
import { exportTravelToExcel } from '../../../utils/excel/travelExcelExporter';
import ExpenseCharts from './ExpenseCharts';

interface ExcelPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    onOpenExportOptions?: () => void;
}

const getBadgeClass = (type: ItineraryType) => {
    switch (type) {
        case '이동':
            return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300';
        case '식사':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
        case '관광':
            return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
        default:
            return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
};

/**
 * Excel 내보내기 형태(전체요약_숙소 / N일차 시트 / 전체일정_통합)를
 * 브라우저 화면에서 즉시 표 형태로 열람하고 검색·지도 연결·다운로드할 수 있는 모달입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ExcelPreviewModal: React.FC<ExcelPreviewModalProps> = (props) => {
    useEscapeKey(props.isOpen, props.onClose);
    if (!props.isOpen) return null;
    return <ExcelPreviewContent {...props} />;
};

const ExcelPreviewContent: React.FC<ExcelPreviewModalProps> = ({
    onClose,
    travel,
    itineraries,
    accommodations,
    onOpenExportOptions,
}) => {
    const { expenses } = useTravelStore();
    const [rates, setRates] = useState<Record<ExpenseCurrency, number>>(DEFAULT_RATES_TO_KRW);

    useEffect(() => {
        let cancelled = false;
        resolveTravelExchangeRates(travel).then((res) => {
            if (!cancelled) setRates(res.rates);
        });
        return () => {
            cancelled = true;
        };
    }, [travel]);

    const model = useMemo(
        () => buildTravelReportModel({ travel, itineraries, accommodations, expenses, rates }),
        [travel, itineraries, accommodations, expenses, rates],
    );

    // 'summary' | 'day-1' ... | 'unified' | 'expenses'
    const [activeSheet, setActiveSheet] = useState<string>('summary');
    const [typeFilter, setTypeFilter] = useState<ItineraryType | 'ALL'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDirectDownload = async () => {
        setIsDownloading(true);
        try {
            await exportTravelToExcel({
                travel,
                itineraries,
                accommodations,
                expenses,
                rates,
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const renderAddressCell = (text: string, mapUrl: string | null) => {
        if (!mapUrl || text === '-') {
            return <span className="text-gray-500 dark:text-gray-400">{text}</span>;
        }
        return (
            <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 dark:text-blue-400 hover:underline inline-flex items-start gap-1 break-all"
                title="Google 지도에서 열기"
            >
                <span>{text}</span>
                <ExternalLink size={11} className="shrink-0 mt-1 opacity-70" />
            </a>
        );
    };

    const renderScheduleTable = (rows: ReportRowItem[], showDayCol: boolean, footerLabel: string, drivingKm?: number) => {
        const totalKm = Math.round(rows.reduce((s, r) => s + r.distanceKm, 0) * 10) / 10;
        const totalCostKrw = Math.round(rows.reduce((s, r) => s + r.costKrw, 0));

        return (
            <div className="overflow-x-auto border border-slate-300 dark:border-zinc-700 rounded-lg shadow-sm">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="bg-[#2E5B88] text-white font-bold text-center">
                            {showDayCol && <th className="p-2.5 border border-[#4A77A8] whitespace-nowrap">일차</th>}
                            <th className="p-2.5 border border-[#4A77A8] w-12 whitespace-nowrap">순번</th>
                            <th className="p-2.5 border border-[#4A77A8] w-16 whitespace-nowrap">시작</th>
                            <th className="p-2.5 border border-[#4A77A8] w-16 whitespace-nowrap">종료</th>
                            <th className="p-2.5 border border-[#4A77A8] w-20 whitespace-nowrap">소요시간</th>
                            <th className="p-2.5 border border-[#4A77A8] w-16 whitespace-nowrap">구분</th>
                            <th className="p-2.5 border border-[#4A77A8] min-w-[180px]">일정명</th>
                            <th className="p-2.5 border border-[#4A77A8] min-w-[260px]">상세 내용 및 이용 팁</th>
                            <th className="p-2.5 border border-[#4A77A8] min-w-[190px]">장소 / 출발지 (Google 지도)</th>
                            <th className="p-2.5 border border-[#4A77A8] min-w-[190px]">도착지 (Google 지도)</th>
                            <th className="p-2.5 border border-[#4A77A8] w-32 whitespace-nowrap">이동수단</th>
                            <th className="p-2.5 border border-[#4A77A8] w-20 whitespace-nowrap">거리(km)</th>
                            <th className="p-2.5 border border-[#4A77A8] w-28 whitespace-nowrap">경비</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={showDayCol ? 13 : 12}
                                    className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-zinc-900"
                                >
                                    표시할 일정이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, idx) => (
                                <tr
                                    key={row.id}
                                    className={idx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/50'}
                                >
                                    {showDayCol && (
                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center font-semibold text-[#1E3A5F] dark:text-sky-300 whitespace-nowrap">
                                            {row.dayLabel}
                                        </td>
                                    )}
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center text-gray-600 dark:text-gray-400">{row.seq}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center whitespace-nowrap">{row.time}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center whitespace-nowrap">{row.endTime}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center whitespace-nowrap">{row.duration}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${getBadgeClass(row.type)}`}>
                                            {row.type}
                                        </span>
                                    </td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 font-bold text-slate-900 dark:text-gray-100">{row.content}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                        {row.description}
                                    </td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700">{renderAddressCell(row.originAddress, row.originMapUrl)}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700">{renderAddressCell(row.destAddress, row.destMapUrl)}</td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center whitespace-nowrap text-slate-600 dark:text-gray-400">
                                        {row.transportLabel}
                                    </td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center font-medium">
                                        {row.distanceKm.toFixed(1)}
                                    </td>
                                    <td className="p-2 border border-slate-200 dark:border-zinc-700 text-right whitespace-pre-wrap font-medium text-emerald-700 dark:text-emerald-400">
                                        {row.costText}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot>
                            <tr className="bg-slate-200 dark:bg-zinc-800 font-bold text-[#1E3A5F] dark:text-sky-300">
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">{footerLabel}</td>
                                {showDayCol && <td className="p-2.5 border border-slate-300 dark:border-zinc-700" />}
                                <td colSpan={4} className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700">{rows.length}개 세부 일정</td>
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right">
                                    {drivingKm !== undefined ? `차량 주행: ${drivingKm.toFixed(1)} km` : ''}
                                </td>
                                <td colSpan={2} className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">총 이동거리</td>
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">{totalKm.toFixed(1)}</td>
                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right whitespace-nowrap">
                                    {totalCostKrw > 0 ? `₩${totalCostKrw.toLocaleString()}` : '-'}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        );
    };

    const filteredUnifiedRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return model.unifiedRows.filter((row) => {
            if (typeFilter !== 'ALL' && row.type !== typeFilter) return false;
            if (!q) return true;
            return (
                row.content.toLowerCase().includes(q) ||
                row.description.toLowerCase().includes(q) ||
                row.originAddress.toLowerCase().includes(q) ||
                row.destAddress.toLowerCase().includes(q)
            );
        });
    }, [model.unifiedRows, typeFilter, searchQuery]);

    const maxDrivingKm = Math.max(10, ...model.daySheets.map((d) => d.drivingKm));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-[96vw] h-[92vh] flex flex-col overflow-hidden">
                {/* 상단 헤더 */}
                <div className="px-3.5 sm:px-6 py-3 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 bg-gray-50 dark:bg-zinc-950">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                            <FileSpreadsheet size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">일정표 Excel 스타일 보기</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">내보내기될 시트 구조를 화면에서 바로 확인하고 Google 지도로 이동할 수 있습니다.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {onOpenExportOptions && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenExportOptions();
                                }}
                                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                            >
                                <SlidersHorizontal size={14} />
                                <span className="hidden sm:inline">옵션 설정</span>
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={isDownloading}
                            onClick={handleDirectDownload}
                            className="flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            <span>{isDownloading ? '생성 중...' : '다운로드'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200/70 dark:hover:bg-zinc-800 shrink-0"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 본문 시트 영역 */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 sm:space-y-6 bg-slate-100/60 dark:bg-zinc-950/60">
                    {activeSheet === 'summary' && (
                        <div className="space-y-6">
                            {/* 상단 배너 + 메타 표 */}
                            <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
                                <div className="bg-[#1E3A5F] text-white px-5 py-3.5 text-base sm:text-lg font-bold">
                                    {model.travel.name} — 일정 및 숙소 종합 안내
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 text-xs border-t border-slate-200 dark:border-zinc-700">
                                    <div className="flex border-b border-slate-200 dark:border-zinc-700">
                                        <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                            여행명
                                        </div>
                                        <div className="p-2.5 font-medium text-slate-900 dark:text-gray-100">{model.travel.name}</div>
                                    </div>
                                    <div className="flex border-b border-slate-200 dark:border-zinc-700">
                                        <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                            여행 기간
                                        </div>
                                        <div className="p-2.5 text-slate-800 dark:text-gray-200">
                                            {model.startInfo.koreanFullDate} ~ {model.endInfo.koreanFullDate} ({model.periodSummary})
                                        </div>
                                    </div>
                                    <div className="flex border-b border-slate-200 dark:border-zinc-700">
                                        <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                            방문 지역
                                        </div>
                                        <div className="p-2.5 text-slate-800 dark:text-gray-200">{model.travel.region || '-'}</div>
                                    </div>
                                    <div className="flex border-b border-slate-200 dark:border-zinc-700">
                                        <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                            출도착 공항/편
                                        </div>
                                        <div className="p-2.5 text-slate-800 dark:text-gray-200">{model.airportInfo}</div>
                                    </div>
                                    <div className="flex md:col-span-2">
                                        <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                            이동 수단
                                        </div>
                                        <div className="p-2.5 text-slate-800 dark:text-gray-200">{model.vehicleInfo}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 섹션 1: 일차별 요약표 */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-[#1E3A5F] dark:text-sky-300">1. 일차별 주요 테마 및 이동·일정 요약</h4>
                                <div className="overflow-x-auto border border-slate-300 dark:border-zinc-700 rounded-lg shadow-sm">
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-[#2E5B88] text-white font-bold text-center">
                                                <th className="p-2.5 border border-[#4A77A8]">일차</th>
                                                <th className="p-2.5 border border-[#4A77A8]">날짜</th>
                                                <th className="p-2.5 border border-[#4A77A8]">주요 방문지 및 테마</th>
                                                <th className="p-2.5 border border-[#4A77A8]">전체 일정</th>
                                                <th className="p-2.5 border border-[#4A77A8]">식사</th>
                                                <th className="p-2.5 border border-[#4A77A8]">관광</th>
                                                <th className="p-2.5 border border-[#4A77A8]">차량 주행(km)</th>
                                                <th className="p-2.5 border border-[#4A77A8]">예상 통행료({model.currencyUnit})</th>
                                                <th className="p-2.5 border border-[#4A77A8]">일차별 경비(KRW)</th>
                                                <th className="p-2.5 border border-[#4A77A8]">숙박지</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {model.daySheets.map((d, idx) => (
                                                <tr
                                                    key={d.dayIndex}
                                                    onClick={() => setActiveSheet(`day-${d.dayIndex}`)}
                                                    className={`cursor-pointer hover:bg-amber-50/70 dark:hover:bg-amber-950/20 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/50'}`}
                                                >
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center font-bold text-[#1E3A5F] dark:text-sky-300">
                                                        {d.dayIndex}일차
                                                    </td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center font-semibold whitespace-nowrap">
                                                        {d.dateInfo.koreanFullDate}
                                                    </td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700">{d.theme}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center">{d.totalCount}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center">{d.mealCount}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center">{d.tourCount}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-right font-medium">{d.drivingKm.toFixed(1)}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-right">{d.toll.toLocaleString()}</td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-right font-medium text-emerald-700 dark:text-emerald-400">
                                                        {d.expenseKrw > 0 ? `₩${d.expenseKrw.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-2.5 border border-slate-200 dark:border-zinc-700">{d.accLabel}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-200 dark:bg-zinc-800 font-bold text-[#1E3A5F] dark:text-sky-300">
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">합계</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700">{model.periodSummary} 전체 일정 종합</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">{model.totals.itineraries}</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">{model.totals.meals}</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">{model.totals.tours}</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right">{model.totals.drivingKm.toFixed(1)}</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right">{model.totals.toll.toLocaleString()}</td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right text-emerald-700 dark:text-emerald-400">
                                                    {model.totals.expenseKrw > 0 ? `₩${model.totals.expenseKrw.toLocaleString()}` : '-'}
                                                </td>
                                                <td className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {/* 섹션 2: 숙소 상세표 */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-[#1E3A5F] dark:text-sky-300">2. 숙소 예약 및 체크인·안내 상세</h4>
                                <div className="overflow-x-auto border border-slate-300 dark:border-zinc-700 rounded-lg shadow-sm">
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-[#2E5B88] text-white font-bold text-center">
                                                <th className="p-2.5 border border-[#4A77A8] w-20">숙박일차</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-36">체크인 날짜</th>
                                                <th className="p-2.5 border border-[#4A77A8]">숙소명</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-36">전화번호</th>
                                                <th className="p-2.5 border border-[#4A77A8]">주소 (Google 지도 검색)</th>
                                                <th className="p-2.5 border border-[#4A77A8]">체크인·주차 및 상세 메모</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {model.accommodations.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-6 text-center text-gray-500 bg-white dark:bg-zinc-900">
                                                        등록된 숙소 정보가 없습니다.
                                                    </td>
                                                </tr>
                                            ) : (
                                                model.accommodations.map((acc, idx) => (
                                                    <tr key={acc.id} className={idx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/50'}>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center font-bold text-[#1E3A5F] dark:text-sky-300">
                                                            {acc.dayIndex}일차
                                                        </td>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700 text-center whitespace-nowrap">{acc.checkInDate}</td>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700 font-bold">{acc.name}</td>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700 whitespace-nowrap">{acc.phone}</td>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700">{renderAddressCell(acc.address, acc.mapUrl)}</td>
                                                        <td className="p-2.5 border border-slate-200 dark:border-zinc-700 whitespace-pre-wrap">{acc.description}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 하단 차트 + 메모 */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 shadow-sm">
                                    <h5 className="text-xs font-bold text-[#1E3A5F] dark:text-sky-300 mb-3">일차별 차량 주행거리 (km)</h5>
                                    <div className="flex items-end gap-4 h-40 pt-4 px-2 border-b border-slate-200 dark:border-zinc-700">
                                        {model.daySheets.map((d) => {
                                            const pct = Math.max(4, Math.round((d.drivingKm / maxDrivingKm) * 100));
                                            return (
                                                <div key={d.dayIndex} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                                    <span className="text-[11px] font-bold text-[#1E3A5F] dark:text-sky-300">{d.drivingKm.toFixed(1)}</span>
                                                    <div
                                                        className="w-full max-w-[44px] bg-[#2E5B88] rounded-t-md transition-all"
                                                        style={{ height: `${d.drivingKm > 0 ? pct : 3}%` }}
                                                    />
                                                    <span className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">{d.dayIndex}일차</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
                                    <div className="bg-[#2E5B88] text-white px-4 py-2 text-xs font-bold">
                                        📌 여행 중 주요 유료 도로·주차·준비물 메모
                                    </div>
                                    <div className="divide-y divide-slate-200 dark:divide-zinc-700 text-xs">
                                        {model.daySheets.map((d) => (
                                            <div key={d.dayIndex} className="flex">
                                                <div className="w-28 shrink-0 bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 font-bold p-2.5 text-center border-r border-slate-200 dark:border-zinc-700">
                                                    {d.dayIndex}일차 ({d.dateInfo.shortLabel.split(' ')[0].replace('.', '/')})
                                                </div>
                                                <div className="p-2.5 text-slate-700 dark:text-gray-300">{d.memo}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 섹션 3: 경비 요약 및 지출 분석 그래프 */}
                            {model.combinedExpenses.length > 0 && (
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-sm font-bold text-[#1E3A5F] dark:text-sky-300">
                                            3. 경비 요약 및 지출 분석 그래프 (총 ₩{model.totals.expenseKrw.toLocaleString()})
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => setActiveSheet('expenses')}
                                            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                                        >
                                            경비 상세 내역 보기 →
                                        </button>
                                    </div>
                                    <ExpenseCharts
                                        expenses={model.combinedExpenses}
                                        totalDays={model.totalDays}
                                        rates={rates}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {activeSheet.startsWith('day-') && (() => {
                        const targetDay = Number(activeSheet.replace('day-', ''));
                        const daySheet = model.daySheets.find((d) => d.dayIndex === targetDay);
                        if (!daySheet) return null;

                        return (
                            <div className="space-y-4">
                                <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 shadow-sm">
                                    <div className="bg-[#1E3A5F] text-white px-5 py-3 text-sm sm:text-base font-bold">
                                        {model.travel.name} | {daySheet.dayIndex}일 차: {daySheet.theme}
                                    </div>
                                    <div className="bg-[#EDF2F7] dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 px-5 py-2 text-xs font-semibold flex flex-wrap gap-x-5 gap-y-1">
                                        <span>📅 일자: {daySheet.dateInfo.koreanFullDate}</span>
                                        <span>🏨 숙박: {daySheet.accLabel}</span>
                                        {model.vehicleInfo !== '-' && <span>🚗 차량: {model.vehicleInfo}</span>}
                                    </div>
                                </div>
                                {renderScheduleTable(daySheet.rows, false, '합계', daySheet.drivingKm)}
                            </div>
                        );
                    })()}

                    {activeSheet === 'unified' && (
                        <div className="space-y-4">
                            <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 shadow-sm bg-white dark:bg-zinc-900">
                                <div className="bg-[#1E3A5F] text-white px-5 py-3 text-sm sm:text-base font-bold">
                                    {model.travel.name} — 전체 일정 통합표
                                </div>
                                <div className="p-3 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {(['ALL', '이동', '관광', '식사', '기타'] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setTypeFilter(t)}
                                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                                    typeFilter === t
                                                        ? 'bg-[#2E5B88] text-white'
                                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                                }`}
                                            >
                                                {t === 'ALL' ? '전체' : t}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative w-full sm:w-64">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="일정명, 내용, 주소 검색..."
                                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                                        />
                                    </div>
                                </div>
                            </div>
                            {renderScheduleTable(filteredUnifiedRows, true, '전체 합계')}
                        </div>
                    )}

                    {activeSheet === 'expenses' && (
                        <div className="space-y-5">
                            <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 shadow-sm bg-white dark:bg-zinc-900">
                                <div className="bg-[#1E3A5F] text-white px-5 py-3 text-sm sm:text-base font-bold flex items-center justify-between gap-2 flex-wrap">
                                    <span>{model.travel.name} — 경비 · 지출 분석 리포트</span>
                                    <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                                        총 지출 ₩{model.totals.expenseKrw.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <ExpenseCharts
                                expenses={model.combinedExpenses}
                                totalDays={model.totalDays}
                                rates={rates}
                            />

                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-[#1E3A5F] dark:text-sky-300">
                                    전체 지출 상세 내역 ({model.combinedExpenses.length}건)
                                </h4>
                                <div className="overflow-x-auto border border-slate-300 dark:border-zinc-700 rounded-lg shadow-sm">
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-[#2E5B88] text-white font-bold text-center">
                                                <th className="p-2.5 border border-[#4A77A8] w-16">일차</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-28">구분</th>
                                                <th className="p-2.5 border border-[#4A77A8] min-w-[200px]">지출 내역</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-28">원본 금액</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-20">통화</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-32">원화 환산 (KRW)</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-24">결제자</th>
                                                <th className="p-2.5 border border-[#4A77A8] w-24">출처</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {model.combinedExpenses.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="p-8 text-center text-gray-500 bg-white dark:bg-zinc-900">
                                                        등록된 경비 내역이 없습니다.
                                                    </td>
                                                </tr>
                                            ) : (
                                                model.combinedExpenses.map((exp, idx) => (
                                                    <tr
                                                        key={`${exp.source}-${exp.id}-${idx}`}
                                                        className={idx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/50'}
                                                    >
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center font-bold text-[#1E3A5F] dark:text-sky-300">
                                                            {exp.dayIndex}일차
                                                        </td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center">{exp.category}</td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 font-bold text-slate-900 dark:text-gray-100">
                                                            {exp.title}
                                                        </td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-right">
                                                            {exp.amount.toLocaleString()}
                                                        </td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center">{exp.currency}</td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-right font-bold text-emerald-700 dark:text-emerald-400">
                                                            ₩{Math.round(exp.krwAmount).toLocaleString()}
                                                        </td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center">
                                                            {exp.paidBy || '-'}
                                                        </td>
                                                        <td className="p-2 border border-slate-200 dark:border-zinc-700 text-center">
                                                            <span
                                                                className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                                    exp.source === 'itinerary'
                                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                        : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-gray-300'
                                                                }`}
                                                            >
                                                                {exp.source === 'itinerary' ? '일정 연동' : '직접 입력'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {model.combinedExpenses.length > 0 && (
                                            <tfoot>
                                                <tr className="bg-slate-200 dark:bg-zinc-800 font-bold text-[#1E3A5F] dark:text-sky-300">
                                                    <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-center">합계</td>
                                                    <td className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                                    <td className="p-2.5 border border-slate-300 dark:border-zinc-700">
                                                        총 {model.combinedExpenses.length}건
                                                    </td>
                                                    <td colSpan={2} className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                                    <td className="p-2.5 border border-slate-300 dark:border-zinc-700 text-right text-emerald-700 dark:text-emerald-400">
                                                        ₩{model.totals.expenseKrw.toLocaleString()}
                                                    </td>
                                                    <td colSpan={2} className="p-2.5 border border-slate-300 dark:border-zinc-700" />
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 하단 Excel 시트 탭 바 */}
                <div className="px-4 py-2.5 border-t border-gray-200 dark:border-zinc-800 bg-gray-100 dark:bg-zinc-950 flex items-center gap-1.5 overflow-x-auto shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveSheet('summary')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                            activeSheet === 'summary'
                                ? 'bg-white dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 shadow-sm border border-gray-200 dark:border-zinc-700'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-zinc-800/60'
                        }`}
                    >
                        전체요약_숙소
                    </button>
                    {model.daySheets.map((d) => {
                        const key = `day-${d.dayIndex}`;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveSheet(key)}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                    activeSheet === key
                                        ? 'bg-white dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 shadow-sm border border-gray-200 dark:border-zinc-700'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-zinc-800/60'
                                }`}
                            >
                                {d.sheetName}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setActiveSheet('unified')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                            activeSheet === 'unified'
                                ? 'bg-white dark:bg-zinc-800 text-[#1E3A5F] dark:text-sky-300 shadow-sm border border-gray-200 dark:border-zinc-700'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-zinc-800/60'
                        }`}
                    >
                        전체일정_통합
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSheet('expenses')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                            activeSheet === 'expenses'
                                ? 'bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 shadow-sm border border-gray-200 dark:border-zinc-700'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-zinc-800/60'
                        }`}
                    >
                        경비_지출분석 ({model.combinedExpenses.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExcelPreviewModal;
