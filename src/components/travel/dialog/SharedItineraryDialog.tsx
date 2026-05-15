import React, { useEffect } from 'react';
import { X, MapPin, Clock, AlignLeft, Info } from 'lucide-react';
import type { Itinerary } from '../../../types/travel';
import { getTypeEmoji, getTransportInfo } from '../../../types/travel';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    itinerary: Itinerary | null;
}

/**
 * 공유된 화면에서 일정의 상세 정보를 확인하는 다이얼로그입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 15.
 */
const SharedItineraryDialog: React.FC<Props> = ({ isOpen, onClose, itinerary }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !itinerary) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden relative z-10 shadow-2xl animate-in zoom-in-95 duration-200">
                {/* 헤더 */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{getTypeEmoji(itinerary.type, itinerary.transportMode)}</span>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{itinerary.type} 정보</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 컨텐츠 */}
                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white break-all mb-1">
                            {itinerary.content}
                        </h3>
                        <div className="flex items-center text-amber-600 dark:text-amber-500 font-bold text-sm">
                            {itinerary.dayIndex}일차 일정
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg shrink-0 mt-0.5">
                                <Clock size={16} />
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">시간</div>
                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {itinerary.time} {itinerary.endTime ? `~ ${itinerary.endTime}` : ''}
                                </div>
                            </div>
                        </div>

                        {itinerary.address && (
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg shrink-0 mt-0.5">
                                    <MapPin size={16} />
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                                        {itinerary.type === '이동' ? '출발지' : '장소'}
                                    </div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all">
                                        {itinerary.address}
                                    </div>
                                </div>
                            </div>
                        )}

                        {itinerary.type === '이동' && itinerary.arrivalAddress && (
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg shrink-0 mt-0.5">
                                    <MapPin size={16} />
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">도착지</div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all">
                                        {itinerary.arrivalAddress}
                                    </div>
                                </div>
                            </div>
                        )}

                        {itinerary.type === '이동' && (itinerary.duration || itinerary.distance) && (
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg shrink-0 mt-0.5">
                                    <Info size={16} />
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">이동 정보</div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {getTransportInfo(itinerary.transportMode).emoji} {getTransportInfo(itinerary.transportMode).label}
                                        <span className="mx-2 text-gray-300">|</span>
                                        {itinerary.duration?.replace(/hours?/g, '시간').replace(/mins?/g, '분')}
                                        {itinerary.duration && itinerary.distance && <span className="mx-2 text-gray-300">|</span>}
                                        {itinerary.distance}
                                    </div>
                                </div>
                            </div>
                        )}

                        {itinerary.description && (
                            <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <div className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg shrink-0 mt-0.5">
                                    <AlignLeft size={16} />
                                </div>
                                <div className="w-full">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">메모</div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                                        {itinerary.description}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-bold transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SharedItineraryDialog;
