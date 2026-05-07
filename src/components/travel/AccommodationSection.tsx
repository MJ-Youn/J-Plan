import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Phone, Building2 } from 'lucide-react';
import type { Accommodation } from '../../types/travel';

interface AccommodationSectionProps {
    accommodations: Accommodation[];
    selectedDay: number | 'all';
}

/**
 * 여행 상세 페이지에서 숙소 정보를 표시하는 섹션입니다.
 * 모바일 최적화를 위해 기본적으로 접혀 있으며, 선택 시 펼칠 수 있습니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
const AccommodationSection: React.FC<AccommodationSectionProps> = ({ accommodations, selectedDay }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // 선택된 일차에 해당하는 숙소 필터링 (전체 일정이면 전체 표시)
    const filteredAccs = selectedDay === 'all' ? accommodations : accommodations.filter((a) => a.dayIndex === selectedDay);

    if (filteredAccs.length === 0) return null;

    return (
        <div className="mb-4 sm:mb-6 print:mb-4">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-2.5 sm:p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:border-amber-200 transition-colors text-left"
            >
                <div className="flex items-center gap-2">
                    <Building2
                        size={18}
                        className="text-amber-600"
                    />
                    <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">{selectedDay === 'all' ? '전체 숙소 정보' : `${selectedDay}일차 숙소 정보`}</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{filteredAccs.length}</span>
                </div>
                {isExpanded ? (
                    <ChevronUp
                        size={20}
                        className="text-gray-400"
                    />
                ) : (
                    <ChevronDown
                        size={20}
                        className="text-gray-400"
                    />
                )}
            </button>

            {isExpanded && (
                <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {filteredAccs.map((acc, idx) => (
                        <div
                            key={idx}
                            className="p-3 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl"
                        >
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                    <span className="text-xs bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded">{acc.dayIndex}일차</span>
                                    {acc.name}
                                </h4>
                                {acc.phone && (
                                    <a
                                        href={`tel:${acc.phone}`}
                                        className="text-amber-600 p-1 hover:bg-amber-100 rounded-full transition-colors"
                                    >
                                        <Phone size={14} />
                                    </a>
                                )}
                            </div>
                            {acc.address && (
                                <p className="text-xs sm:text-sm text-amber-800/70 dark:text-amber-400/70 mt-1 flex items-start gap-1">
                                    <MapPin
                                        size={12}
                                        className="mt-0.5 shrink-0"
                                    />
                                    {acc.address}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AccommodationSection;
