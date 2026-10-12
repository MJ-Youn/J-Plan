import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useTravelStore } from '../store/travelStore';
import { useAuthStore } from '../store/authStore';
import TimeTable from '../components/travel/TimeTable';
import ItineraryDialog from '../components/travel/dialog/ItineraryDialog';
import AccommodationDialog from '../components/travel/dialog/AccommodationDialog';
import GoogleMapView from '../components/travel/GoogleMapView';
import DetailHeader from '../components/travel/DetailHeader';
import DayFilter from '../components/travel/DayFilter';
import AccommodationSection from '../components/travel/AccommodationSection';
import JsonEditModal from '../components/travel/dialog/JsonEditModal';
import { calculateRouteInfo } from '../utils/routeCalculator';
import type { Itinerary, TravelExportData } from '../types/travel';

/**
 * 여행 상세 페이지 컴포넌트입니다.
 * 타임라인 뷰와 지도 뷰를 통해 일정을 관리할 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
const TravelDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { travels, itineraries, accommodations, isLoading, fetchTravels, fetchTravelDetail, deleteItinerary, updateFullTravelDetail } = useTravelStore();
    const { user } = useAuthStore();

    // Google Maps 라이브러리 (경로 계산 및 지오코딩)
    const routesLib = useMapsLibrary('routes');
    const geocodingLib = useMapsLibrary('geocoding');

    // 상태 관리
    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'timeline' | 'map'>('timeline');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
    const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
    const [isJsonEditModalOpen, setIsJsonEditModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Itinerary | null>(null);
    const [addModalData, setAddModalData] = useState<Partial<Itinerary> | null>(null);
    const [isAccModalOpen, setIsAccModalOpen] = useState(false);
    const [isRecalculatingRoutes, setIsRecalculatingRoutes] = useState(false);
    const [calcProgressText, setCalcProgressText] = useState<string | null>(null);

    const travel = travels.find((t) => t.id === id);

    useEffect(() => {
        if (travels.length === 0) {
            fetchTravels();
        }
        if (id) {
            fetchTravelDetail(id);
        }
    }, [id, fetchTravels, fetchTravelDetail, travels.length]);

    // 선택된 일정으로 자동 스크롤
    useEffect(() => {
        if (selectedItineraryId) {
            const el = document.getElementById(`itinerary-${selectedItineraryId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedItineraryId]);

    // Hook 호출 순서 보장을 위해 early return 이전에 모든 hook 호출
    const travelAccommodations = useMemo(() => accommodations.filter((a) => a.travelId === id).sort((a, b) => a.dayIndex - b.dayIndex), [accommodations, id]);

    const filteredItineraries = useMemo(() => {
        return itineraries
            .filter((i) => i.travelId === id && (selectedDay === 'all' || i.dayIndex === selectedDay))
            .sort((a, b) => {
                if (a.dayIndex !== b.dayIndex) {
                    return a.dayIndex - b.dayIndex;
                }
                return a.time.localeCompare(b.time);
            });
    }, [itineraries, id, selectedDay]);

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

    const handlePrint = () => {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            document.documentElement.classList.remove('dark');
        }
        setTimeout(() => {
            window.print();
            if (isDark) {
                document.documentElement.classList.add('dark');
            }
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

    const handleShare = () => {
        if (!user || !travel) return;
        const shareId = btoa(`${user.id}:${travel.id}`);
        const shareUrl = `${window.location.origin}/share/${shareId}`;

        navigator.clipboard
            .writeText(shareUrl)
            .then(() => {
                alert('공유 링크가 클립보드에 복사되었습니다.');
            })
            .catch((err) => {
                console.error('Failed to copy share link: ', err);
                alert(`공유 링크: ${shareUrl}`);
            });
    };

    // 모든 이동 일정의 소요 시간 및 거리 일괄 재계산
    const handleRecalculateRoutes = async () => {
        if (!id || !travel) return;

        if (!routesLib || !geocodingLib) {
            alert('지도 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        const currentItineraries = itineraries.filter((i) => i.travelId === id);
        const moveItineraries = currentItineraries.filter((i) => i.type === '이동');

        if (moveItineraries.length === 0) {
            alert('재계산할 이동 일정이 없습니다.');
            return;
        }

        const confirmed = window.confirm(`등록되어 있는 총 ${moveItineraries.length}개의 이동 일정의 소요 시간과 거리를 다시 계산하시겠습니까?`);
        if (!confirmed) return;

        setIsRecalculatingRoutes(true);
        setCalcProgressText(`0 / ${moveItineraries.length} 계산 중...`);

        try {
            const updatedMap = new Map<string, { duration: string; distance: string }>();

            for (let i = 0; i < moveItineraries.length; i++) {
                const iti = moveItineraries[i];
                setCalcProgressText(`${i + 1} / ${moveItineraries.length} 계산 중: ${iti.content || iti.address}`);

                if (iti.address && iti.arrivalAddress) {
                    const res = await calculateRouteInfo({
                        originAddress: iti.address,
                        destAddress: iti.arrivalAddress,
                        transportMode: iti.transportMode || 'DRIVING',
                        routesLib,
                        geocodingLib,
                    });

                    if (res && res.duration) {
                        updatedMap.set(iti.id, {
                            duration: res.duration,
                            distance: res.distance,
                        });
                    }
                }

                // API 호출 간 약간의 지연 (Rate limit 방지)
                if (i < moveItineraries.length - 1) {
                    await new Promise((r) => setTimeout(r, 150));
                }
            }

            // 모든 일정에 갱신 데이터 매핑
            const newItineraries = currentItineraries.map((iti) => {
                const updated = updatedMap.get(iti.id);
                if (updated) {
                    return {
                        ...iti,
                        duration: updated.duration,
                        distance: updated.distance,
                    };
                }
                return iti;
            });

            // 전체 저장 및 동기화
            const newExportData: TravelExportData = {
                version: '1.0',
                travel,
                itineraries: newItineraries,
                accommodations: travelAccommodations,
            };

            await updateFullTravelDetail(id, newExportData);
            setCalcProgressText(null);
            alert(`총 ${updatedMap.size}개의 이동 일정 소요 시간이 다시 계산되어 업데이트되었습니다! ✨`);
        } catch (error) {
            console.error('[TravelDetail] handleRecalculateRoutes failed:', error);
            alert('이동 시간 계산 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setIsRecalculatingRoutes(false);
            setCalcProgressText(null);
        }
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible print:h-auto relative">
            {/* 진행 상황 플로팅 토스트/알림 */}
            {calcProgressText && (
                <div className="fixed top-20 right-6 z-50 flex items-center gap-3 bg-gray-900/95 dark:bg-gray-800/95 text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md border border-sky-500/40 animate-in fade-in slide-in-from-top-4">
                    <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs sm:text-sm font-medium">{calcProgressText}</span>
                </div>
            )}

            {/* 헤더 섹션 */}
            <DetailHeader
                travel={travel}
                onPrint={handlePrint}
                onExportJSON={handleExportJSON}
                onOpenJsonEdit={() => setIsJsonEditModalOpen(true)}
                onRecalculateRoutes={handleRecalculateRoutes}
                isRecalculatingRoutes={isRecalculatingRoutes}
                onOpenAccModal={() => setIsAccModalOpen(true)}
                onOpenNewItinerary={() => {
                    setEditTarget(null);
                    setAddModalData(null);
                    setIsItineraryModalOpen(true);
                }}
                onShare={handleShare}
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
                            <TimeTable
                                itineraries={filteredItineraries}
                                selectedDay={selectedDay}
                                isMapExpanded={isMapExpanded}
                                totalDays={totalDays}
                                travelId={id!}
                                selectedItineraryId={selectedItineraryId}
                                onItineraryClick={(itiId) => {
                                    // selectedItineraryId 변경 시 GoogleMapView 내부 useEffect가 panTo를 실행함
                                    // (onMarkerClick과 동일한 경로로 동작)
                                    setSelectedItineraryId(itiId);
                                }}
                                onAddItinerary={(defaultData) => {
                                    setEditTarget(null);
                                    setAddModalData(defaultData);
                                    setIsItineraryModalOpen(true);
                                }}
                                onEdit={(e, iti) => {
                                    e.stopPropagation();
                                    setEditTarget(iti);
                                    setAddModalData(null);
                                    setIsItineraryModalOpen(true);
                                }}
                                onDelete={(e, itiId) => {
                                    e.stopPropagation();
                                    if (window.confirm('일정을 삭제하시겠습니까?')) {
                                        deleteItinerary(itiId);
                                    }
                                }}
                            />
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
            <ItineraryDialog
                isOpen={isItineraryModalOpen}
                onClose={() => setIsItineraryModalOpen(false)}
                travelId={id!}
                editTarget={editTarget}
                defaultData={addModalData}
            />
            <AccommodationDialog
                isOpen={isAccModalOpen}
                onClose={() => setIsAccModalOpen(false)}
                travelId={id!}
            />
            {travel && (
                <JsonEditModal
                    isOpen={isJsonEditModalOpen}
                    onClose={() => setIsJsonEditModalOpen(false)}
                    currentData={{
                        version: '1.0',
                        travel,
                        itineraries: itineraries.filter((i) => i.travelId === id),
                        accommodations: travelAccommodations,
                    }}
                    onSave={async (newData) => {
                        if (id) {
                            await updateFullTravelDetail(id, newData);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default TravelDetail;
