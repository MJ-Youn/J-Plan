import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Home as HomeIcon, Plus } from 'lucide-react';
import type { Travel } from '../../types/travel';

interface DetailHeaderProps {
    travel: Travel;
    onPrint: () => void;
    onExportJSON: () => void;
    onOpenAccModal: () => void;
    onOpenNewItinerary: () => void;
}

/**
 * 여행 상세 페이지의 헤더 영역 컴포넌트입니다.
 * 여행 이름, 기간 표시 및 주요 액션 버튼을 포함합니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
const DetailHeader: React.FC<DetailHeaderProps> = ({ travel, onPrint, onExportJSON, onOpenAccModal, onOpenNewItinerary }) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-4 shrink-0 gap-2 sm:gap-4 print:hidden">
            <div className="flex items-center space-x-3 sm:space-x-4">
                <Link
                    to="/travels"
                    className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft
                        size={20}
                        className="sm:w-6 sm:h-6"
                    />
                </Link>
                <div>
                    <h2 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        {travel.name}
                        <button
                            onClick={onExportJSON}
                            title="일정 JSON 내보내기"
                            className="text-gray-400 hover:text-amber-600 transition-colors"
                        >
                            <Download
                                size={18}
                                className="sm:w-5 sm:h-5"
                            />
                        </button>
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium">
                        {travel.startDate} ~ {travel.endDate}
                    </p>
                </div>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2 self-end sm:self-auto">
                <button
                    onClick={onPrint}
                    className="flex items-center space-x-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <Printer
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="hidden sm:inline">출력</span>
                </button>
                <button
                    onClick={onOpenAccModal}
                    className="flex items-center space-x-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                >
                    <HomeIcon
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="hidden sm:inline">숙소 설정</span>
                </button>
                <button
                    onClick={onOpenNewItinerary}
                    className="flex items-center space-x-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-amber-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm"
                >
                    <Plus
                        size={14}
                        className="sm:w-4 sm:h-4"
                    />
                    <span className="hidden sm:inline">일정 추가</span>
                </button>
            </div>
        </div>
    );
};

export default DetailHeader;
