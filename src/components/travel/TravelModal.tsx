import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Travel } from '../../types/travel';
import { useTravelStore } from '../../store/travelStore';
import { useModal } from '../../hooks/useModal';

interface TravelModalProps {
    isOpen: boolean;
    onClose: () => void;
    editTarget?: Travel | null;
}

const TravelModal: React.FC<TravelModalProps> = ({ isOpen, onClose, editTarget }) => {
    const { addTravel, updateTravel } = useTravelStore();
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const { handleDragStart, modalStyle } = useModal(isOpen, onClose);

    useEffect(() => {
        if (editTarget) {
            setName(editTarget.name);
            setStartDate(editTarget.startDate);
            setEndDate(editTarget.endDate);
        } else {
            setName('');
            setStartDate('');
            setEndDate('');
        }
    }, [editTarget, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !startDate || !endDate) return alert('모든 필드를 입력해주세요.');
        if (startDate > endDate) return alert('종료일은 시작일 이후여야 합니다.');

        if (editTarget) {
            updateTravel(editTarget.id, { name, startDate, endDate });
        } else {
            addTravel({ name, startDate, endDate });
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                data-modal-container
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700"
                style={modalStyle}
            >
                {/* 드래그 가능한 헤더 */}
                <div
                    className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleDragStart}
                >
                    <h3 className="text-xl font-bold">{editTarget ? '여행 일정 수정' : '새로운 여행 생성'}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="p-6 space-y-4"
                >
                    <div>
                        <label className="block text-sm font-medium mb-1">여행 이름</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            placeholder="여행 이름을 입력하세요"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">시작일</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">종료일</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                        >
                            {editTarget ? '수정하기' : '생성하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TravelModal;
