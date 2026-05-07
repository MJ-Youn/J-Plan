import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTravelStore } from '../../store/travelStore';
import type { ItineraryType, Itinerary } from '../../types/travel';
import { differenceInDays, parseISO } from 'date-fns';
import { useModal } from '../../hooks/useModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    travelId: string;
    editTarget?: Itinerary | null;
}

const ItineraryModal: React.FC<Props> = ({ isOpen, onClose, travelId, editTarget }) => {
    const { travels, addItinerary, updateItinerary } = useTravelStore();
    const travel = travels.find((t) => t.id === travelId);
    const { handleDragStart, modalStyle } = useModal(isOpen, onClose);

    const totalDays = travel ? differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1 : 1;

    const [type, setType] = useState<ItineraryType | ''>('');
    const [dayIndex, setDayIndex] = useState<number | ''>('');
    const [time, setTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [content, setContent] = useState('');
    const [address, setAddress] = useState('');
    const [arrivalAddress, setArrivalAddress] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (editTarget) {
                setType(editTarget.type);
                setDayIndex(editTarget.dayIndex);
                setTime(editTarget.time);
                setEndTime(editTarget.endTime || '');
                setContent(editTarget.content);
                setAddress(editTarget.address);
                setArrivalAddress(editTarget.arrivalAddress || '');
                setDescription(editTarget.description);
            } else {
                // 기존 값이 남아있지 않도록 완전히 초기화
                setType('');
                setDayIndex('');
                setTime('');
                setEndTime('');
                setContent('');
                setAddress('');
                setArrivalAddress('');
                setDescription('');
            }
        }
    }, [editTarget, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent, keepOpen: boolean) => {
        e.preventDefault();
        if (!type || !dayIndex || !time || !content) return alert('필수 항목을 모두 입력해주세요.');
        if (type === '이동' && (!address || !arrivalAddress)) return alert('이동일 경우 출발 위치와 도착 위치를 모두 입력해야 합니다.');

        if (editTarget) {
            updateItinerary(editTarget.id, { type: type as ItineraryType, dayIndex: Number(dayIndex), time, endTime, content, address, arrivalAddress, description });
            onClose();
        } else {
            addItinerary({ travelId, type: type as ItineraryType, dayIndex: Number(dayIndex), time, endTime, content, address, arrivalAddress, description });
            // 저장 후 계속 추가할 때 시간 외 모든 정보 초기화
            setContent('');
            setAddress('');
            setArrivalAddress('');
            setDescription('');
            setType('');
            if (!keepOpen) onClose();
        }
    };

    const handleClose = () => {
        if (!editTarget) {
            setType('');
            setDayIndex('');
            setTime('');
            setEndTime('');
            setContent('');
            setAddress('');
            setArrivalAddress('');
            setDescription('');
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div
                data-modal-container
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden"
                style={modalStyle}
            >
                {/* 드래그 가능한 헤더 */}
                <div
                    className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleDragStart}
                >
                    <h3 className="font-bold text-lg">{editTarget ? '일정 수정' : '새 일정 추가'}</h3>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>
                <form className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1 font-medium">일정 종류 *</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as ItineraryType)}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    종류 선택
                                </option>
                                <option value="이동">이동</option>
                                <option value="관광">관광</option>
                                <option value="식사">식사</option>
                                <option value="기타">기타</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm mb-1 font-medium">날짜 선택 (일차) *</label>
                            <select
                                value={dayIndex}
                                onChange={(e) => setDayIndex(Number(e.target.value))}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    일차 선택
                                </option>
                                {Array.from({ length: totalDays }).map((_, i) => (
                                    <option
                                        key={i + 1}
                                        value={i + 1}
                                    >
                                        {i + 1}일차
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1 font-medium">시작 시간 *</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-1 font-medium text-gray-500">종료 시간 (선택)</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1 font-medium">내용 *</label>
                        <input
                            type="text"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            required
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                    </div>

                    {type === '이동' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm mb-1 font-medium">출발 위치 *</label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    required
                                    placeholder="출발지 이름이나 주소"
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 font-medium">도착 위치 *</label>
                                <input
                                    type="text"
                                    value={arrivalAddress}
                                    onChange={(e) => setArrivalAddress(e.target.value)}
                                    required
                                    placeholder="도착지 이름이나 주소"
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm mb-1 font-medium">장소 / 주소 (선택)</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="지도 검색을 위한 주소"
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm mb-1 font-medium">상세 설명 (선택)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                        ></textarea>
                    </div>
                    <div className="pt-2 flex justify-end space-x-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
                        >
                            취소
                        </button>
                        {!editTarget && (
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                className="px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-800/50 rounded-lg font-medium transition-colors"
                            >
                                저장 후 계속
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => handleSubmit(e, false)}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                        >
                            {editTarget ? '수정하기' : '저장 닫기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ItineraryModal;
