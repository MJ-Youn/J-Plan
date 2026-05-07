import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { useTravelStore } from '../store/travelStore';
import TimeTable from '../components/travel/TimeTable';
import ItineraryModal from '../components/travel/ItineraryModal';
import AccommodationModal from '../components/travel/AccommodationModal';
import GoogleMapView from '../components/travel/GoogleMapView';
import DetailHeader from '../components/travel/DetailHeader';
import DayFilter from '../components/travel/DayFilter';
import AccommodationSection from '../components/travel/AccommodationSection';
import type { Itinerary, TravelExportData } from '../types/travel';

/**
 * 여행 상세 페이지 컴포넌트입니다.
 * 타임라인 뷰와 지도 뷰를 통해 일정을 관리할 수 있습니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
const TravelDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { travels, itineraries, accommodations, isLoading, fetchTravels, fetchTravelDetail, deleteItinerary } = useTravelStore();

    // 상태 관리
    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'timeline' | 'map'>('timeline');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
    const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Itinerary | null>(null);
    const [isAccModalOpen, setIsAccModalOpen] = useState(false);

    const travel = travels.find((t) => t.id === id);

    useEffect(() => {
        if (travels.length === 0) fetchTravels();
        if (id) fetchTravelDetail(id);
    }, [id, fetchTravels, fetchTravelDetail, travels.length]);

    // 선택된 일정으로 자동 스크롤
    useEffect(() => {
        if (selectedItineraryId) {
            const el = document.getElementById(`itinerary-${selectedItineraryId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [selectedItineraryId]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!travel) {
        return (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4">존재하지 않거나 삭제된 여행입니다.</h2>
                <button
                    onClick={() => navigate('/travels')}
                    className="text-amber-600 hover:underline font-medium"
                >
                    목록으로 돌아가기
                </button>
            </div>
        );
    }

    const totalDays = differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1;
    const travelAccommodations = accommodations.filter((a) => a.travelId === id).sort((a, b) => a.dayIndex - b.dayIndex);

    const filteredItineraries = itineraries
        .filter((i) => i.travelId === id && (selectedDay === 'all' || i.dayIndex === selectedDay))
        .sort((a, b) => {
            if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
            return a.time.localeCompare(b.time);
        });

    const handlePrint = () => {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) document.documentElement.classList.remove('dark');
        setTimeout(() => {
            window.print();
            if (isDark) document.documentElement.classList.add('dark');
        }, 100);
    };

    const handleExportJSON = () => {
        const exportData: TravelExportData = {
            version: '1.0',
            travel: travel,
            itineraries: itineraries.filter((i) => i.travelId === id),
            accommodations: travelAccommodations,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jplan_${travel.name.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible print:h-auto">
            {/* 헤더 섹션 */}
            <DetailHeader
                travel={travel}
                onPrint={handlePrint}
                onExportJSON={handleExportJSON}
                onOpenAccModal={() => setIsAccModalOpen(true)}
                onOpenNewItinerary={() => {
                    setEditTarget(null);
                    setIsItineraryModalOpen(true);
                }}
            />

            {/* 필터 및 뷰 토글 */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 print:hidden">
                <DayFilter
                    days={totalDays}
                    selectedDay={selectedDay}
                    setSelectedDay={setSelectedDay}
                />

                {/* 모바일 탭 및 데스크탑 뷰 전환 */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <div className="flex sm:hidden w-full bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('timeline')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${activeTab === 'timeline' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
                        >
                            타임라인
                        </button>
                        <button
                            onClick={() => setActiveTab('map')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${activeTab === 'map' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
                        >
                            지도
                        </button>
                    </div>
                    <button
                        onClick={() => setIsMapExpanded(!isMapExpanded)}
                        className="hidden lg:flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                        {isMapExpanded ? '타임라인 뷰' : '지도 뷰 접기'}
                    </button>
                </div>
            </div>

            {/* 메인 콘텐츠 영역 */}
            <div className="flex flex-1 overflow-hidden print:overflow-visible print:h-auto gap-6 relative">
                {/* 타임라인 뷰 */}
                <div
                    className={`w-full ${isMapExpanded ? 'lg:w-full' : 'lg:w-1/3'} flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ${activeTab === 'timeline' ? 'flex' : 'hidden lg:flex'}`}
                >
                    <div className="flex-1 overflow-hidden flex flex-col p-2 space-y-4 print:overflow-visible">
                        <AccommodationSection
                            accommodations={travelAccommodations}
                            selectedDay={selectedDay}
                        />

                        <div className="flex-1 overflow-y-auto scrollbar-thin print:overflow-visible">
                            {filteredItineraries.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 text-sm">등록된 일정이 없습니다.</div>
                            ) : (
                                <TimeTable
                                    itineraries={filteredItineraries}
                                    selectedDay={selectedDay}
                                    isMapExpanded={isMapExpanded}
                                    totalDays={totalDays}
                                    selectedItineraryId={selectedItineraryId}
                                    onItineraryClick={(itiId) => {
                                        setSelectedItineraryId(itiId);
                                        if (window.innerWidth < 1024) setActiveTab('map');
                                    }}
                                    onEdit={(e, iti) => {
                                        e.stopPropagation();
                                        setEditTarget(iti);
                                        setIsItineraryModalOpen(true);
                                    }}
                                    onDelete={(e, itiId) => {
                                        e.stopPropagation();
                                        if (window.confirm('일정을 삭제하시겠습니까?')) deleteItinerary(itiId);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* 지도 뷰 */}
                {!isMapExpanded && (
                    <div className={`w-full lg:w-2/3 bg-gray-100 dark:bg-gray-800 border border-gray-200 rounded-2xl overflow-hidden print:hidden ${activeTab === 'map' ? 'flex' : 'hidden lg:flex'} transition-all duration-300`}>
                        <GoogleMapView
                            itineraries={filteredItineraries}
                            accommodations={travelAccommodations}
                            selectedDay={selectedDay}
                            selectedItineraryId={selectedItineraryId}
                            onMarkerClick={(itiId) => setSelectedItineraryId(itiId)}
                        />
                    </div>
                )}
            </div>

            {/* 모달 */}
            <ItineraryModal
                isOpen={isItineraryModalOpen}
                onClose={() => setIsItineraryModalOpen(false)}
                travelId={id!}
                editTarget={editTarget}
            />
            <AccommodationModal
                isOpen={isAccModalOpen}
                onClose={() => setIsAccModalOpen(false)}
                travelId={id!}
            />
        </div>
    );
};

export default TravelDetail;
