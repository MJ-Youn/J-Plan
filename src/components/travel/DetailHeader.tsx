import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    Download,
    Home as HomeIcon,
    Plus,
    Share2,
    FileCode2,
    Route,
    Loader2,
    FileSpreadsheet,
    Users,
    Table2,
    FolderLock,
    MoreVertical,
    CalendarPlus,
    CheckSquare,
    Wallet,
} from 'lucide-react';
import type { Travel } from '../../types/travel';

interface DetailHeaderProps {
    travel: Travel;
    onExportJSON: () => void;
    onExportICS?: () => void;
    onOpenExcelPreview?: () => void;
    onExportExcel?: () => void;
    onOpenDocuments?: () => void;
    onOpenChecklist?: () => void;
    onOpenExpense?: () => void;
    onOpenJsonEdit?: () => void;
    onRecalculateRoutes?: () => void;
    isRecalculatingRoutes?: boolean;
    onOpenAccModal: () => void;
    onOpenNewItinerary: () => void;
    onShare?: () => void;
}

/**
 * 여행 상세 페이지의 헤더 영역 컴포넌트입니다.
 * 핵심 액션(표 보기, 서류함, 공유, 숙소 설정, 일정 추가)은 바로 노출하고,
 * 내보내기(Excel/JSON) 및 보조 도구(JSON 편집, 이동 시간 계산)는 더보기 메뉴로 통합하여 깔끔하게 구성했습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
const DetailHeader: React.FC<DetailHeaderProps> = ({
    travel,
    onExportJSON,
    onExportICS,
    onOpenExcelPreview,
    onExportExcel,
    onOpenDocuments,
    onOpenChecklist,
    onOpenExpense,
    onOpenJsonEdit,
    onRecalculateRoutes,
    isRecalculatingRoutes = false,
    onOpenAccModal,
    onOpenNewItinerary,
    onShare,
}) => {
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMoreOpen) return;
        const handleOutside = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isMoreOpen]);

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 sm:mb-4 shrink-0 gap-2.5 sm:gap-4 print:hidden">
            {/* 좌측 여행 타이틀 및 기간 영역 */}
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
                <Link
                    to="/travels"
                    className="p-1.5 sm:p-2 -ml-1 sm:-ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                    title="여행 목록으로 이동"
                >
                    <ArrowLeft
                        size={20}
                        className="sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300"
                    />
                </Link>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <h2
                            className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate"
                            title={travel.name}
                        >
                            {travel.name}
                        </h2>
                        {travel.isShared && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                                <Users size={11} />
                                공동 작업
                            </span>
                        )}
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 font-medium truncate">
                        {travel.startDate} ~ {travel.endDate}
                        {travel.isShared && travel.ownerName ? ` · 소유자: ${travel.ownerName}` : ''}
                    </p>
                </div>
            </div>

            {/* 우측 주요 액션 버튼 그룹 */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end md:self-auto">
                {onOpenExcelPreview && (
                    <button
                        onClick={onOpenExcelPreview}
                        title="일정표를 Excel 표 형태로 화면에서 바로 보기"
                        className="flex items-center space-x-1 px-2.5 py-1.5 sm:py-2 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors border border-teal-200/60 dark:border-teal-800/40 shrink-0"
                    >
                        <Table2 size={15} />
                        <span className="hidden lg:inline">표 보기</span>
                    </button>
                )}

                {onOpenDocuments && (
                    <button
                        onClick={onOpenDocuments}
                        title="바우처, e-티켓, QR 등 여행 필수 서류 보관함"
                        className="flex items-center space-x-1 px-2.5 py-1.5 sm:py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200/60 dark:border-indigo-800/40 shrink-0"
                    >
                        <FolderLock size={15} />
                        <span className="hidden lg:inline">서류함</span>
                    </button>
                )}

                {onShare && !travel.isShared && (
                    <button
                        onClick={onShare}
                        title="여행 일정 공유 및 공동 작업 설정"
                        className="flex items-center space-x-1 px-2.5 py-1.5 sm:py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                    >
                        <Share2 size={15} />
                        <span className="hidden lg:inline">공유</span>
                    </button>
                )}

                <button
                    onClick={onOpenAccModal}
                    title="일차별 숙소 정보 설정"
                    className="flex items-center space-x-1 px-2.5 py-1.5 sm:py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0"
                >
                    <HomeIcon size={15} />
                    <span className="hidden lg:inline">숙소 설정</span>
                </button>

                <button
                    onClick={onOpenNewItinerary}
                    title="새로운 일정 추가"
                    className="flex items-center space-x-1 px-3 py-1.5 sm:py-2 bg-amber-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm shrink-0"
                >
                    <Plus size={15} />
                    <span>일정 추가</span>
                </button>

                {/* 더보기 드롭다운 (내보내기 통합 + JSON 편집 + 이동 시간 계산) */}
                <div className="relative" ref={moreRef}>
                    <button
                        type="button"
                        onClick={() => setIsMoreOpen((prev) => !prev)}
                        title="내보내기 및 추가 도구"
                        className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                        {isRecalculatingRoutes ? <Loader2 size={16} className="animate-spin text-sky-500" /> : <MoreVertical size={16} />}
                    </button>

                    {isMoreOpen && (
                        <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95">
                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">내보내기</div>
                            {onExportExcel && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onExportExcel();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-gray-800 dark:text-gray-200 transition-colors"
                                >
                                    <FileSpreadsheet size={15} className="text-emerald-600 dark:text-emerald-400" />
                                    <span>Excel (.xlsx) 다운로드</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMoreOpen(false);
                                    onExportJSON();
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200 transition-colors"
                            >
                                <Download size={15} className="text-amber-600 dark:text-amber-400" />
                                <span>JSON 파일 다운로드</span>
                            </button>
                            {onExportICS && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onExportICS();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-gray-800 dark:text-gray-200 transition-colors"
                                >
                                    <CalendarPlus size={15} className="text-blue-600 dark:text-blue-400" />
                                    <span>캘린더 (.ics) 내보내기</span>
                                </button>
                            )}

                            {(onOpenJsonEdit || onRecalculateRoutes || onOpenChecklist || onOpenExpense) && (
                                <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                            )}

                            {onOpenChecklist && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onOpenChecklist();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-gray-800 dark:text-gray-200 transition-colors"
                                >
                                    <CheckSquare size={15} className="text-emerald-600 dark:text-emerald-400" />
                                    <span>준비물 체크리스트</span>
                                </button>
                            )}
                            {onOpenExpense && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onOpenExpense();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-gray-800 dark:text-gray-200 transition-colors"
                                >
                                    <Wallet size={15} className="text-amber-600 dark:text-amber-400" />
                                    <span>경비 · 정산 트래커</span>
                                </button>
                            )}

                            {onOpenJsonEdit && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onOpenJsonEdit();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200 transition-colors"
                                >
                                    <FileCode2 size={15} className="text-amber-600 dark:text-amber-400" />
                                    <span>JSON으로 일괄 편집</span>
                                </button>
                            )}
                            {onRecalculateRoutes && (
                                <button
                                    type="button"
                                    disabled={isRecalculatingRoutes}
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        onRecalculateRoutes();
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-gray-800 dark:text-gray-200 transition-colors disabled:opacity-50"
                                >
                                    <Route size={15} className="text-sky-600 dark:text-sky-400" />
                                    <span>{isRecalculatingRoutes ? '이동 시간 계산 중...' : '이동 시간 일괄 계산'}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DetailHeader;
