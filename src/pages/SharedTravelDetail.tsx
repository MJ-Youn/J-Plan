import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { Turnstile } from '@marsidev/react-turnstile';
import TimeTable from '../components/travel/TimeTable';
import GoogleMapView from '../components/travel/GoogleMapView';
import DayFilter from '../components/travel/DayFilter';
import AccommodationSection from '../components/travel/AccommodationSection';
import SharedItineraryDialog from '../components/travel/dialog/SharedItineraryDialog';
import type { Travel, Itinerary, Accommodation } from '../types/travel';
import { ShieldCheck, Map as MapIcon, Sparkles, X } from 'lucide-react';

/**
 * 공유된 여행 상세 페이지 컴포넌트입니다.
 * Turnstile 인증 후 읽기 전용으로 타임라인 및 지도 뷰를 제공합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 15.
 */
const SharedTravelDetail: React.FC = () => {
    const { shareId } = useParams<{ shareId: string }>();

    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [travel, setTravel] = useState<Travel | null>(null);
    const [itineraries, setItineraries] = useState<Itinerary[]>([]);
    const [accommodations, setAccommodations] = useState<Accommodation[]>([]);

    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'timeline' | 'map'>('timeline');
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        if (!shareId) {
            setError('잘못된 공유 링크입니다.');
            return;
        }

        // 로컬 개발 모드면 토큰 검증 없이 바로 로드 시도
        if (import.meta.env.DEV) {
            fetchSharedData('dev_mode_token');
        } else if (token) {
            fetchSharedData(token);
        }
    }, [shareId, token]);

    const fetchSharedData = async (cfToken: string) => {
        setIsLoading(true);
        try {
            if (import.meta.env.DEV) {
                let decodedStr = '';
                try {
                    decodedStr = atob(shareId!);
                } catch (e) {
                    throw new Error('Invalid Share ID format');
                }
                const [, travelId] = decodedStr.split(':');
                if (!travelId) throw new Error('Invalid Share ID');

                const saved = localStorage.getItem(`jplan_detail_${travelId}`);
                if (!saved) throw new Error('Travel not found or sharing disabled');

                const data = JSON.parse(saved);
                if (data.travel) setTravel(data.travel);
                if (data.itineraries) setItineraries(data.itineraries);
                if (data.accommodations) setAccommodations(data.accommodations);
            } else {
                const res = await fetch(`/api/share/${shareId}?cf_token=${cfToken}`);
                if (!res.ok) {
                    // JSON 파싱 에러 방지 (HTML 응답 등)
                    const contentType = res.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const data = await res.json();
                        throw new Error(data.error || '데이터를 불러올 수 없습니다.');
                    } else {
                        throw new Error('API 서버에 접근할 수 없습니다. (상태 코드: ' + res.status + ')');
                    }
                }
                
                // 성공 응답이라도 JSON이 아닌 HTML(SPA Fallback)이 반환되었는지 체크
                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('서버에서 올바른 데이터(JSON)를 반환하지 않았습니다. 백엔드(API) 서버가 정상적으로 실행 중인지 확인해주세요.');
                }
                
                const data = await res.json();
                if (data.travel) setTravel(data.travel);
                if (data.itineraries) setItineraries(data.itineraries);
                if (data.accommodations) setAccommodations(data.accommodations);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-gray-700">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <X size={32} />
                    </div>
                    <h2 className="text-xl font-bold mb-2 dark:text-white">접근 오류</h2>
                    <p className="text-gray-500 dark:text-gray-400">{error}</p>
                </div>
            </div>
        );
    }

    if (!import.meta.env.DEV && !token) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gray-50 dark:bg-black">
                <div className="max-w-md w-full p-8 md:p-12 text-center relative z-10 bg-white/90 dark:bg-gray-900/50 backdrop-blur-2xl rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-2xl">
                    <div className="mb-10 flex justify-center">
                        <div className="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-3xl shadow-inner relative group">
                            <MapIcon
                                size={56}
                                className="text-amber-600 dark:text-amber-500"
                            />
                            <div className="absolute -top-2 -right-2 bg-white dark:bg-gray-800 p-1.5 rounded-full shadow-md">
                                <Sparkles
                                    size={16}
                                    className="text-amber-400"
                                />
                            </div>
                        </div>
                    </div>
                    <h1 className="text-2xl font-black bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent mb-6">J-Plan 공유된 일정</h1>

                    <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 font-bold uppercase tracking-widest">
                            <ShieldCheck size={14} />
                            보안 검증 진행 중
                        </div>
                        <Turnstile
                            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                            onSuccess={(t) => setToken(t)}
                            options={{ theme: 'auto' }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading || !travel) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
        );
    }

    const totalDays = differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1;
    const travelAccommodations = accommodations.sort((a, b) => a.dayIndex - b.dayIndex);
    const filteredItineraries = itineraries
        .filter((i) => selectedDay === 'all' || i.dayIndex === selectedDay)
        .sort((a, b) => {
            if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
            return a.time.localeCompare(b.time);
        });

    const selectedItinerary = itineraries.find((i) => i.id === selectedItineraryId) || null;

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
            {/* 상단 헤더 */}
            <div className="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center shrink-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{travel.name}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {travel.startDate} ~ {travel.endDate} ({totalDays}일간)
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full text-xs font-bold border border-amber-100 dark:border-amber-800">읽기 전용</div>
            </div>

            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden max-w-7xl mx-auto w-full gap-4 relative">
                {/* 뷰 컨트롤 (모바일용) & Day 필터 */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-3">
                    <DayFilter
                        days={totalDays}
                        selectedDay={selectedDay}
                        setSelectedDay={setSelectedDay}
                    />

                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                        <div className="flex sm:hidden w-full bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
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
                            className="hidden lg:flex items-center px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                        >
                            {isMapExpanded ? '타임라인 뷰' : '지도 뷰 접기'}
                        </button>
                    </div>
                </div>

                {/* 메인 콘텐츠 Area */}
                <div className="flex flex-1 overflow-hidden gap-6 relative">
                    <div
                        className={`w-full ${isMapExpanded ? 'lg:w-full' : 'lg:w-1/3'} flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm ${activeTab === 'timeline' ? 'flex' : 'hidden lg:flex'}`}
                    >
                        <div className="flex-1 overflow-hidden flex flex-col p-2 space-y-4">
                            <AccommodationSection
                                accommodations={travelAccommodations}
                                selectedDay={selectedDay}
                            />

                            <div className="flex-1 overflow-y-auto scrollbar-thin relative pb-20 md:pb-0">
                                <TimeTable
                                    itineraries={filteredItineraries}
                                    selectedDay={selectedDay}
                                    isMapExpanded={isMapExpanded}
                                    totalDays={totalDays}
                                    travelId={travel.id}
                                    selectedItineraryId={selectedItineraryId}
                                    onItineraryClick={(itiId) => {
                                        setSelectedItineraryId(itiId);
                                        setIsDialogOpen(true);
                                    }}
                                    readOnly={true}
                                />
                            </div>
                        </div>
                    </div>

                    {!isMapExpanded && (
                        <div className={`w-full lg:w-2/3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm ${activeTab === 'map' ? 'flex' : 'hidden lg:flex'} transition-all duration-300`}>
                            <GoogleMapView
                                itineraries={filteredItineraries}
                                accommodations={travelAccommodations}
                                selectedDay={selectedDay}
                                selectedItineraryId={selectedItineraryId}
                                onMarkerClick={(itiId) => {
                                    setSelectedItineraryId(itiId);
                                    setIsDialogOpen(true);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>

            <SharedItineraryDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                itinerary={selectedItinerary}
            />
        </div>
    );
};

export default SharedTravelDetail;
