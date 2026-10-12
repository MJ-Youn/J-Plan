import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Home as HomeIcon, Plus, Share2, FileCode2, Route, Loader2 } from 'lucide-react';
import type { Travel } from '../../types/travel';

interface DetailHeaderProps {
    travel: Travel;
    onPrint: () => void;
    onExportJSON: () => void;
    onOpenJsonEdit?: () => void;
    onRecalculateRoutes?: () => void;
    isRecalculatingRoutes?: boolean;
    onOpenAccModal: () => void;
    onOpenNewItinerary: () => void;
    onShare?: () => void;
}

/**
 * 여행 상세 페이지의 헤더 영역 컴포넌트입니다.
 * 여행 이름, 기간 표시 및 주요 액션 버튼을 포함합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
const DetailHeader: React.FC<DetailHeaderProps> = ({
    travel, //
    onPrint,
    onExportJSON,
    onOpenJsonEdit,
    onRecalculateRoutes,
    isRecalculatingRoutes = false,
    onOpenAccModal,
    onOpenNewItinerary,
    onShare,
}) => {
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
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                onClick={onExportJSON}
                                title="일정 JSON 다운로드"
                                className="p-1 text-gray-400 hover:text-amber-600 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <Download
                                    size={16}
                                    className="sm:w-[18px] sm:h-[18px]"
                                />
                            </button>
                            {onOpenJsonEdit && (
                                <button
                                    onClick={onOpenJsonEdit}
                                    title="일정 JSON으로 수정"
                                    className="p-1 text-gray-400 hover:text-amber-600 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <FileCode2
                                        size={16}
                                        className="sm:w-[18px] sm:h-[18px]"
                                    />
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 font-medium truncate">
                        {travel.startDate} ~ {travel.endDate}
                    </p>
                </div>
            </div>

            {/* 우측 주요 액션 버튼 그룹 */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end md:self-auto overflow-x-auto max-w-full pb-0.5 md:pb-0 scrollbar-none">
                {onOpenJsonEdit && (
                    <button
                        onClick={onOpenJsonEdit}
                        title="전체 일정을 JSON 형태로 열람 및 편집합니다."
                        className="flex items-center space-x-1 px-2 py-1.5 sm:px-2.5 sm:py-2 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors border border-amber-200/60 dark:border-amber-800/40 shrink-0"
                    >
                        <FileCode2
                            size={14}
                            className="sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400"
                        />
                        <span className="hidden lg:inline">JSON 편집</span>
                    </button>
                )}
                {onRecalculateRoutes && (
                    <button
                        onClick={onRecalculateRoutes}
                        disabled={isRecalculatingRoutes}
                        title="등록된 모든 이동 일정의 이동 시간 및 거리를 다시 계산합니다."
                        className="flex items-center space-x-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors border border-sky-200/60 dark:border-sky-800/40 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shrink-0"
                    >
                        {isRecalculatingRoutes ? (
                            <Loader2
                                size={14}
                                className="sm:w-4 sm:h-4 text-sky-600 dark:text-sky-400 animate-spin"
                            />
                        ) : (
                            <Route
                                size={14}
                                className="sm:w-4 sm:h-4 text-sky-600 dark:text-sky-400"
                            />
                        )}
                        <span className="hidden sm:inline">{isRecalculatingRoutes ? '계산 중...' : '이동 시간 계산'}</span>
                    </button>
                )}
                <button
                    onClick={onPrint}
                    title="일정 인쇄 / PDF 출력"
                    className="flex items-center space-x-1 px-2 py-1.5 sm:px-2.5 sm:py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
                >
                    <Printer
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="hidden xl:inline">출력</span>
                </button>
                {onShare && (
                    <button
                        onClick={onShare}
                        title="여행 일정 공유 링크 복사"
                        className="flex items-center space-x-1 px-2 py-1.5 sm:px-2.5 sm:py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                    >
                        <Share2
                            size={14}
                            className="sm:w-4 sm:h-4"
                        />
                        <span className="hidden xl:inline">공유</span>
                    </button>
                )}
                <button
                    onClick={onOpenAccModal}
                    title="일차별 숙소 정보 설정"
                    className="flex items-center space-x-1 px-2 py-1.5 sm:px-2.5 sm:py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0"
                >
                    <HomeIcon
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="hidden lg:inline">숙소 설정</span>
                </button>
                <button
                    onClick={onOpenNewItinerary}
                    title="새로운 일정 추가"
                    className="flex items-center space-x-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-amber-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm shrink-0"
                >
                    <Plus
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="inline">일정 추가</span>
                </button>
            </div>
        </div>
    );
};

export default DetailHeader;
