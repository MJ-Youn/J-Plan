import React from 'react';

interface DayFilterProps {
    days: number;
    selectedDay: number | 'all';
    setSelectedDay: (day: number | 'all') => void;
}

/**
 * 여행 일차를 선택하여 필터링하는 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
const DayFilter: React.FC<DayFilterProps> = ({ days, selectedDay, setSelectedDay }) => {
    return (
        <div className="flex overflow-x-auto pb-2 mb-2 sm:mb-4 scrollbar-hide -mx-1 px-1 gap-1.5 sm:gap-2 print:hidden shrink-0">
            <button
                onClick={() => setSelectedDay('all')}
                className={`whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                    selectedDay === 'all'
                        ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900 shadow-md'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-600 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400'
                }`}
            >
                전체 일정
            </button>
            {Array.from({ length: days }).map((_, i) => (
                <button
                    key={i + 1}
                    onClick={() => setSelectedDay(i + 1)}
                    className={`whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                        selectedDay === i + 1 ? 'bg-amber-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-600 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400'
                    }`}
                >
                    {i + 1}일차
                </button>
            ))}
        </div>
    );
};

export default DayFilter;
