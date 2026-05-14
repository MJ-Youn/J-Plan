import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useTravelStore } from '../../store/travelStore';
import { differenceInDays, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { Accommodation } from '../../types/travel';
import { useModal } from '../../hooks/useModal';
/**
 * 숙소 정보 추가/수정 모달 컴포넌트입니다.
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
    travelId: string;
}

const AccommodationModal: React.FC<Props> = ({ isOpen, onClose, travelId }) => {
    const { travels, accommodations, setAccommodations } = useTravelStore();
    const travel = travels.find((t) => t.id === travelId);
    const totalDays = travel ? differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1 : 1;

    const [accList, setAccList] = useState<Partial<Accommodation>[]>([]);
    const { handleDragStart, modalStyle } = useModal(isOpen, onClose);

    useEffect(() => {
        if (isOpen) {
            // 이미 저장된 숙소 정보를 불러와 각 일차에 채워줌
            const existing = accommodations.filter((a) => a.travelId === travelId);
            const initial: Partial<Accommodation>[] = Array.from({ length: totalDays }).map((_, i) => {
                const dayIndex = i + 1;
                const found = existing.find((a) => a.dayIndex === dayIndex);
                // 이미 저장된 정보가 있으면 해당 데이터로 채우고, 없으면 빈 값으로 초기화
                return found ? { ...found } : { travelId, dayIndex, name: '', address: '', description: '', phone: '' };
            });
            setAccList(initial);
        }
    }, [isOpen, travelId, accommodations, totalDays]);

    if (!isOpen) {
        return null;
    }

    const handleChange = (index: number, field: keyof Accommodation, value: string) => {
        const newList = [...accList];
        newList[index] = { ...newList[index], [field]: value };
        setAccList(newList);
    };

    const handleSave = () => {
        const finalAccs: Accommodation[] = accList
            .filter((a) => a.name && a.name.trim() !== '')
            .map((a) => ({
                id: a.id || uuidv4(),
                travelId,
                dayIndex: a.dayIndex!,
                name: a.name!,
                address: a.address || '',
                description: a.description || '',
                phone: a.phone || '',
            }));

        setAccommodations(travelId, finalAccs);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4">
            <div
                data-modal-container
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl border border-gray-200 dark:border-gray-700 shadow-xl flex flex-col max-h-[90vh]"
                style={modalStyle}
            >
                {/* 드래그 가능한 헤더 */}
                <div
                    className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 shrink-0 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleDragStart}
                >
                    <h3 className="font-bold text-lg">전체 일정 숙소 관리</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900/50">
                                    <th className="p-3 border-b dark:border-gray-700 font-semibold text-sm w-20 text-center">일차</th>
                                    <th className="p-3 border-b dark:border-gray-700 font-semibold text-sm w-1/4">숙소명</th>
                                    <th className="p-3 border-b dark:border-gray-700 font-semibold text-sm w-1/4">연락처</th>
                                    <th className="p-3 border-b dark:border-gray-700 font-semibold text-sm w-1/4">주소</th>
                                    <th className="p-3 border-b dark:border-gray-700 font-semibold text-sm">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accList.map((acc, index) => (
                                    <tr
                                        key={index}
                                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                                    >
                                        <td className="p-2 text-center font-medium text-sm text-amber-600 dark:text-amber-500">{acc.dayIndex}일차</td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={acc.name || ''}
                                                onChange={(e) => handleChange(index, 'name', e.target.value)}
                                                placeholder="숙소명 입력"
                                                className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:border-amber-500 transition-colors"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={acc.phone || ''}
                                                onChange={(e) => handleChange(index, 'phone', e.target.value)}
                                                placeholder="연락처 입력"
                                                className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:border-amber-500 transition-colors"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={acc.address || ''}
                                                onChange={(e) => handleChange(index, 'address', e.target.value)}
                                                placeholder="주소 입력 (선택)"
                                                className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:border-amber-500 transition-colors"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={acc.description || ''}
                                                onChange={(e) => handleChange(index, 'description', e.target.value)}
                                                placeholder="비고 입력 (선택)"
                                                className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:border-amber-500 transition-colors"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 mr-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <Save size={16} /> 일괄 저장
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccommodationModal;
