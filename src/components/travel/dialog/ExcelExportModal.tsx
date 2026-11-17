import React, { useState } from 'react';
import { X, FileSpreadsheet, Download, Loader2, Printer, Sparkles } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { Accommodation, Itinerary, Travel, TravelExportMeta } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useTravelStore } from '../../../store/travelStore';
import { fetchRatesToKrw } from '../../../utils/expenseService';
import { getDayDateInfo, summarizeDayTheme } from '../../../utils/excel/excelHelpers';
import { exportTravelToExcel } from '../../../utils/excel/travelExcelExporter';

interface ExcelExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    /** 편집 권한이 있는 경우 입력한 출력 메타정보(공항, 차량, 일차별 테마 등)를 저장할지 여부 */
    onSaveExportMeta?: (meta: TravelExportMeta) => Promise<void> | void;
}

/**
 * 최종 확정된 여행 일정을 인쇄 최적화된 보고서형 Excel(.xlsx)로 내보내기 전
 * 부가 정보와 출력 옵션을 확인·편집할 수 있는 모달 래퍼입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ExcelExportModal: React.FC<ExcelExportModalProps> = (props) => {
    useEscapeKey(props.isOpen, props.onClose);
    if (!props.isOpen) return null;
    return <ExcelExportModalContent {...props} />;
};

const ExcelExportModalContent: React.FC<ExcelExportModalProps> = ({
    onClose,
    travel,
    itineraries,
    accommodations,
    onSaveExportMeta,
}) => {
    const geocodingLib = useMapsLibrary('geocoding');
    const { expenses } = useTravelStore();
    const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1);
    const saved = travel.exportMeta || {};

    const [airportInfo, setAirportInfo] = useState(saved.airportInfo || '');
    const [vehicleInfo, setVehicleInfo] = useState(saved.vehicleInfo || '');
    const [currencyLabel, setCurrencyLabel] = useState(saved.currencyLabel || '원');
    const [dayThemes, setDayThemes] = useState<Record<number, string>>(() => {
        const init: Record<number, string> = {};
        for (let d = 1; d <= totalDays; d++) {
            const dayItis = itineraries.filter((i) => i.dayIndex === d);
            init[d] = saved.dayThemes?.[d] || summarizeDayTheme(dayItis);
        }
        return init;
    });
    const [dayTolls, setDayTolls] = useState<Record<number, string>>(() => {
        const init: Record<number, string> = {};
        for (let d = 1; d <= totalDays; d++) {
            init[d] = saved.dayTolls?.[d] !== undefined ? String(saved.dayTolls[d]) : '0';
        }
        return init;
    });
    const [dayMemos, setDayMemos] = useState<Record<number, string>>(() => {
        const init: Record<number, string> = {};
        for (let d = 1; d <= totalDays; d++) {
            init[d] = saved.dayMemos?.[d] || '';
        }
        return init;
    });

    const [includeUnifiedSheet, setIncludeUnifiedSheet] = useState(true);
    const [includeChartImage, setIncludeChartImage] = useState(true);
    const [enrichGoogleAddresses, setEnrichGoogleAddresses] = useState(false);

    const [isExporting, setIsExporting] = useState(false);
    const [progressText, setProgressText] = useState<string | null>(null);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            let finalItineraries = [...itineraries];
            let finalAccommodations = [...accommodations];

            // Google Maps 정식 주소 보완 옵션 처리
            if (enrichGoogleAddresses && geocodingLib) {
                const geocoder = new geocodingLib.Geocoder();
                const addrCache = new Map<string, string>();

                const resolveFormattedAddress = async (rawAddr?: string): Promise<string | undefined> => {
                    const trimmed = rawAddr?.trim();
                    if (!trimmed || trimmed === '-') return rawAddr;
                    if (addrCache.has(trimmed)) return addrCache.get(trimmed)!;

                    try {
                        const res = await geocoder.geocode({ address: trimmed, language: 'ko' });
                        const formatted = res.results?.[0]?.formatted_address;
                        if (formatted && !trimmed.includes(formatted)) {
                            const combined = `${trimmed} (${formatted})`;
                            addrCache.set(trimmed, combined);
                            return combined;
                        }
                    } catch {
                        // 지오코딩 실패 시 원본 주소 유지
                    }
                    addrCache.set(trimmed, trimmed);
                    return trimmed;
                };

                const totalTargets = finalItineraries.length + finalAccommodations.length;
                let doneCount = 0;

                const enrichedItineraries: Itinerary[] = [];
                for (const iti of finalItineraries) {
                    doneCount += 1;
                    setProgressText(`Google Maps 주소 보완 중 (${doneCount}/${totalTargets})...`);
                    const nextAddress = iti.address ? (await resolveFormattedAddress(iti.address)) || iti.address : iti.address;
                    const nextArrival =
                        iti.type === '이동' && iti.arrivalAddress
                            ? await resolveFormattedAddress(iti.arrivalAddress)
                            : iti.arrivalAddress;
                    enrichedItineraries.push({
                        ...iti,
                        address: nextAddress,
                        arrivalAddress: nextArrival,
                    });
                }
                finalItineraries = enrichedItineraries;

                const enrichedAccs: Accommodation[] = [];
                for (const acc of finalAccommodations) {
                    doneCount += 1;
                    setProgressText(`Google Maps 주소 보완 중 (${doneCount}/${totalTargets})...`);
                    const query = acc.address?.trim() || acc.name;
                    const nextAddr = query ? (await resolveFormattedAddress(query)) || acc.address : acc.address;
                    enrichedAccs.push({
                        ...acc,
                        address: nextAddr,
                    });
                }
                finalAccommodations = enrichedAccs;
            }

            setProgressText('Excel 문서를 생성하고 있습니다...');

            const parsedTolls: Record<number, number> = {};
            Object.entries(dayTolls).forEach(([k, v]) => {
                const num = Number(v.replace(/,/g, '').trim());
                parsedTolls[Number(k)] = Number.isNaN(num) ? 0 : num;
            });

            const metaPayload: TravelExportMeta = {
                airportInfo: airportInfo.trim(),
                vehicleInfo: vehicleInfo.trim(),
                currencyLabel: currencyLabel.trim() || '원',
                dayThemes,
                dayTolls: parsedTolls,
                dayMemos,
            };

            if (onSaveExportMeta) {
                await onSaveExportMeta(metaPayload);
            }

            const rateRes = await fetchRatesToKrw();

            await exportTravelToExcel({
                travel,
                itineraries: finalItineraries,
                accommodations: finalAccommodations,
                expenses,
                rates: rateRes.rates,
                meta: metaPayload,
                includeUnifiedSheet,
                includeChartImage,
            });

            onClose();
        } catch (err) {
            console.error('[ExcelExportModal] Export failed:', err);
            alert('Excel 내보내기 중 오류가 발생했습니다.');
        } finally {
            setIsExporting(false);
            setProgressText(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">일정표 Excel 내보내기 (.xlsx)</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">A4 가로 인쇄에 최적화된 종합 요약·일자별·통합 시트를 생성합니다.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4 sm:space-y-5">
                    {/* 인쇄 최적화 안내 배너 */}
                    <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-800/50 flex items-start gap-2.5 text-xs text-sky-900 dark:text-sky-200">
                        <Printer size={16} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold">출력 최적화 자동 적용:</span> 모든 시트가 A4 가로 1폭 맞춤, 다중 페이지 시 상단 제목/헤더 반복, 줄바꿈 높이 자동 계산, 페이지 번호 푸터가 설정됩니다.
                        </div>
                    </div>

                    {/* 기본 메타 정보 */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">표지·요약 기본 정보 (선택)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">출도착 공항 / 항공편</label>
                                <input
                                    type="text"
                                    value={airportInfo}
                                    onChange={(e) => setAirportInfo(e.target.value)}
                                    placeholder="예: 청주국제공항 ⇄ 후쿠오카 공항 (티웨이항공)"
                                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">통행료 통화 단위</label>
                                <input
                                    type="text"
                                    value={currencyLabel}
                                    onChange={(e) => setCurrencyLabel(e.target.value)}
                                    placeholder="원 또는 엔"
                                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">이동 수단 / 렌터카 정보</label>
                            <input
                                type="text"
                                value={vehicleInfo}
                                onChange={(e) => setVehicleInfo(e.target.value)}
                                placeholder="예: 타임즈카렌탈 후쿠오카공항점 (혼다 프리드 6인승, ETC 장착)"
                                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>

                    {/* 일차별 테마 & 톨비 & 메모 */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">일차별 요약·메모 설정</h4>
                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Sparkles size={12} className="text-amber-500" />
                                테마는 일정에서 자동 생성되었습니다
                            </span>
                        </div>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {Array.from({ length: totalDays }, (_, i) => {
                                const day = i + 1;
                                const dateInfo = getDayDateInfo(travel.startDate, day);
                                return (
                                    <div key={day} className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-950/50 border border-gray-200 dark:border-zinc-800 space-y-2">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                                {day}일차 ({dateInfo.shortLabel})
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] text-gray-500">예상 통행료({currencyLabel}):</span>
                                                <input
                                                    type="text"
                                                    value={dayTolls[day] ?? '0'}
                                                    onChange={(e) => setDayTolls((prev) => ({ ...prev, [day]: e.target.value }))}
                                                    className="w-20 px-2 py-1 text-xs text-right bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md outline-none"
                                                />
                                            </div>
                                        </div>
                                        <input
                                            type="text"
                                            value={dayThemes[day] || ''}
                                            onChange={(e) => setDayThemes((prev) => ({ ...prev, [day]: e.target.value }))}
                                            placeholder="주요 방문지 및 테마"
                                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:border-emerald-500"
                                        />
                                        <input
                                            type="text"
                                            value={dayMemos[day] || ''}
                                            onChange={(e) => setDayMemos((prev) => ({ ...prev, [day]: e.target.value }))}
                                            placeholder="주차·통행료·체크사항 메모 (선택)"
                                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 출력 및 시트 옵션 */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">시트 및 출력 옵션</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                <input
                                    type="checkbox"
                                    checked={includeUnifiedSheet}
                                    onChange={(e) => setIncludeUnifiedSheet(e.target.checked)}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <span>전체일정 통합표 시트 포함</span>
                            </label>
                            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                <input
                                    type="checkbox"
                                    checked={includeChartImage}
                                    onChange={(e) => setIncludeChartImage(e.target.checked)}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <span>요약 시트에 주행거리 차트 포함</span>
                            </label>
                            {geocodingLib && (
                                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/40 sm:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={enrichGoogleAddresses}
                                        onChange={(e) => setEnrichGoogleAddresses(e.target.checked)}
                                        className="rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span>Google Maps 정식 주소 보완 (간단한 장소명에 전체 주소 병기)</span>
                                </label>
                            )}
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                        {progressText && <span className="font-medium text-emerald-600 dark:text-emerald-400">{progressText}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isExporting}
                            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={isExporting}
                            className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-60"
                        >
                            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            <span>{isExporting ? '생성 중...' : 'Excel 다운로드'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExcelExportModal;
