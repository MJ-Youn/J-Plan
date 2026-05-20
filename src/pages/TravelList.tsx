import React, { useState, useRef, useEffect } from 'react';
import { Plus, Calendar, MapPin, MoreVertical, Edit2, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTravelStore } from '../store/travelStore';
import type { Travel, TravelExportData } from '../types/travel';
import TravelDialog from '../components/travel/dialog/TravelDialog';

/**
 * 메인 여행 목록 페이지입니다.
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
const TravelList: React.FC = () => {
    const { travels, isLoading, fetchTravels, deleteTravel, importTravel } = useTravelStore();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Travel | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchTravels();
    }, [fetchTravels]);

    const handleOpenCreate = () => {
        setEditTarget(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, travel: Travel) => {
        e.preventDefault();
        e.stopPropagation();
        setEditTarget(travel);
        setIsModalOpen(true);
        setOpenMenuId(null);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('정말 이 여행을 삭제하시겠습니까? 관련된 모든 일정이 삭제됩니다.')) {
            deleteTravel(id);
        }
        setOpenMenuId(null);
    };

    const toggleMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(openMenuId === id ? null : id);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = event.target?.result as string;
                const data = JSON.parse(json) as TravelExportData;

                if (data.version && data.travel) {
                    importTravel(data);
                    navigate(`/travels/${data.travel.id}`);
                } else {
                    alert('올바른 J-Plan 데이터 파일이 아닙니다.');
                }
            } catch (error) {
                alert('파일을 읽는 중 오류가 발생했습니다.');
                console.error(error);
            }
            // 입력 초기화
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="animate-fade-in-up pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <h2 className="text-3xl font-bold">내 여행 일정</h2>
                <div className="flex items-center space-x-2">
                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Upload size={20} />
                        <span className="hidden sm:inline">일정 가져오기</span>
                    </button>
                    <button
                        onClick={handleOpenCreate}
                        className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-md"
                    >
                        <Plus size={20} />
                        <span>새 여행 만들기</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
                </div>
            ) : travels.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">아직 계획된 여행이 없습니다.</p>
                    <button
                        onClick={handleOpenCreate}
                        className="text-amber-600 font-medium hover:underline"
                    >
                        첫 번째 여행을 만들어보세요!
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {travels.map((travel) => {
                        return (
                            <div
                                key={travel.id}
                                className="relative"
                            >
                                <Link
                                    to={`/travels/${travel.id}`}
                                    className="group block h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:shadow-xl hover:border-amber-300 dark:hover:border-amber-600 transition-all cursor-pointer"
                                >
                                    <div className="pr-8">
                                        <h3 className="text-xl font-semibold mb-3 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors line-clamp-1">{travel.name}</h3>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mt-4">
                                        <div className="flex items-center space-x-2">
                                            <Calendar
                                                size={16}
                                                className="text-gray-400"
                                            />
                                            <span>
                                                {travel.startDate} ~ {travel.endDate}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <MapPin
                                                size={16}
                                                className="text-gray-400"
                                            />
                                            <span>{travel.region || '지역 정보 없음'}</span>
                                        </div>
                                    </div>
                                </Link>

                                {/* 햄버거 메뉴 (더보기) */}
                                <div className="absolute top-4 right-4 z-10">
                                    <button
                                        onClick={(e) => toggleMenu(e, travel.id)}
                                        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <MoreVertical size={20} />
                                    </button>

                                    {openMenuId === travel.id && (
                                        <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95">
                                            <button
                                                onClick={(e) => handleOpenEdit(e, travel)}
                                                className="w-full text-left px-4 py-2 text-sm flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <Edit2 size={14} />
                                                <span>수정</span>
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(e, travel.id)}
                                                className="w-full text-left px-4 py-2 text-sm flex items-center space-x-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                                <span>삭제</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <TravelDialog
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                editTarget={editTarget}
            />
        </div>
    );
};

export default TravelList;
