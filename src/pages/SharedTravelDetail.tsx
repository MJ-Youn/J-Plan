import { Turnstile } from '@marsidev/react-turnstile';
import { differenceInDays, parseISO } from 'date-fns';
import {
    CalendarPlus,
    CheckSquare,
    FileSpreadsheet,
    FolderLock,
    Home as HomeIcon,
    Loader2,
    LogIn,
    Map as MapIcon,
    MoreVertical,
    Plus,
    RefreshCw,
    Route,
    ShieldCheck,
    Sparkles,
    Table2,
    Users,
    Wallet,
    X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import AccommodationSection from '../components/travel/AccommodationSection';
import DayFilter from '../components/travel/DayFilter';
import WeatherBanner from '../components/travel/WeatherBanner';
import AccommodationDialog from '../components/travel/dialog/AccommodationDialog';
import ChecklistModal from '../components/travel/dialog/ChecklistModal';
import ConflictModal from '../components/travel/dialog/ConflictModal';
import DocumentsModal from '../components/travel/dialog/DocumentsModal';
import ExcelExportModal from '../components/travel/dialog/ExcelExportModal';
import ExcelPreviewModal from '../components/travel/dialog/ExcelPreviewModal';
import ExpenseModal from '../components/travel/dialog/ExpenseModal';
import ItineraryDialog from '../components/travel/dialog/ItineraryDialog';
import SharedItineraryDialog from '../components/travel/dialog/SharedItineraryDialog';
import GoogleMapView, { CompletedMapPlaceholder } from '../components/travel/GoogleMapView';
import TimeTable from '../components/travel/TimeTable';
import { useAuthStore } from '../store/authStore';
import { useTravelStore } from '../store/travelStore';
import type { Accommodation, Itinerary, SharePermission, Travel } from '../types/travel';
import { calculateRouteInfo } from '../utils/routeCalculator';
import { exportTravelToIcs } from '../utils/icsExporter';
import { fetchSharedTravelData, fetchSharedTravelRevision } from '../utils/shareService';
import { isTravelCompleted } from '../utils/weatherService';

/**
 * 공유된 여행 상세 페이지 컴포넌트입니다.
 * - 읽기 전용('view'): Turnstile 검증 후 타임라인/지도 열람 및 Excel 내보내기 지원
 * - 공동 작업('edit'): Google 로그인 후 실제 일정/숙소 편집, 동시 수정 충돌 감지 및 저장 지원
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 15.
 */
const SharedTravelDetail: React.FC = () => {
    const { shareId } = useParams<{ shareId: string }>();
    const navigate = useNavigate();

    const { user, isLoading: authLoading, checkAuth } = useAuthStore();
    const {
        travels,
        itineraries: storeItineraries,
        accommodations: storeAccommodations,
        checklists,
        expenses,
        participants,
        currentRevision,
        lastUpdatedBy,
        conflictState,
        clearConflict,
        loadSharedTravelDetail,
        deleteItinerary,
        saveTravelDetail,
        updateFullTravelDetail,
        updateTravel,
    } = useTravelStore();

    const routesLib = useMapsLibrary('routes');
    const geocodingLib = useMapsLibrary('geocoding');

    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [permission, setPermission] = useState<SharePermission>('view');
    const [requiresAuth, setRequiresAuth] = useState(false);
    const [authPromptTravelName, setAuthPromptTravelName] = useState<string>('');

    // 읽기 전용 모드 로컬 상태
    const [viewTravel, setViewTravel] = useState<Travel | null>(null);
    const [viewItineraries, setViewItineraries] = useState<Itinerary[]>([]);
    const [viewAccommodations, setViewAccommodations] = useState<Accommodation[]>([]);

    // 공통 UI 상태
    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'timeline' | 'map'>('timeline');
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [loadedMapTravelId, setLoadedMapTravelId] = useState<string | null>(null);
    const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);

    // 다이얼로그 상태
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Itinerary | null>(null);
    const [addModalData, setAddModalData] = useState<Partial<Itinerary> | null>(null);
    const [isAccModalOpen, setIsAccModalOpen] = useState(false);
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
    const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
    const [isChecklistOpen, setIsChecklistOpen] = useState(false);
    const [isExpenseOpen, setIsExpenseOpen] = useState(false);

    // 이동 시간 재계산 & 원격 변경 감지 & 더보기 메뉴 상태
    const [isRecalculatingRoutes, setIsRecalculatingRoutes] = useState(false);
    const [remoteUpdateNotice, setRemoteUpdateNotice] = useState<{ revision: number; updatedBy?: string | null } | null>(null);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMoreOpen) return;
        const handleOutside = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isMoreOpen]);

    // 초기 진입 시 로그인 상태 확인
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const fetchSharedData = useCallback(
        async (cfToken?: string) => {
            if (!shareId) return;
            await Promise.resolve();
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchSharedTravelData(shareId, cfToken);

                if (data.requiresAuth) {
                    setRequiresAuth(true);
                    setPermission('edit');
                    setAuthPromptTravelName(data.travelName || '공유된 여행');
                    return;
                }

                setRequiresAuth(false);
                setPermission(data.permission);

                if (data.travel) {
                    if (data.permission === 'edit') {
                        loadSharedTravelDetail(
                            {
                                version: '1.0',
                                revision: data.revision ?? 0,
                                updatedAt: data.updatedAt,
                                updatedBy: data.updatedBy,
                                travel: data.travel,
                                itineraries: data.itineraries || [],
                                accommodations: data.accommodations || [],
                            },
                            {
                                shareId,
                                permission: 'edit',
                                ownerId: data.ownerId,
                            },
                        );
                    } else {
                        setViewTravel(data.travel);
                        setViewItineraries(data.itineraries || []);
                        setViewAccommodations(data.accommodations || []);
                    }
                }
                setRemoteUpdateNotice(null);
            } catch (err: unknown) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        },
        [shareId, loadSharedTravelDetail],
    );

    useEffect(() => {
        if (!shareId || authLoading) {
            return;
        }

        // 로컬 개발 모드이거나 이미 로그인된 사용자는 Turnstile 없이 즉시 데이터 로드
        if (import.meta.env.DEV || user) {
            const timer = setTimeout(() => {
                void fetchSharedData(token || undefined);
            }, 0);
            return () => clearTimeout(timer);
        } else if (token) {
            const timer = setTimeout(() => {
                void fetchSharedData(token);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [shareId, authLoading, user, token, fetchSharedData]);

    // 공동 편집 모드일 때 20초 간격 경량 리비전 폴링으로 타 사용자 저장 감지
    useEffect(() => {
        if (!shareId || permission !== 'edit' || requiresAuth || !user) {
            return;
        }

        const timer = setInterval(async () => {
            const latest = await fetchSharedTravelRevision(shareId);
            if (latest && latest.revision > currentRevision) {
                setRemoteUpdateNotice({
                    revision: latest.revision,
                    updatedBy: latest.updatedBy,
                });
            }
        }, 20000);

        return () => clearInterval(timer);
    }, [shareId, permission, requiresAuth, user, currentRevision]);

    const isEditMode = permission === 'edit';
    const travel = isEditMode ? travels.find((t) => t.id === (viewTravel?.id || travels[travels.length - 1]?.id)) || travels[0] || null : viewTravel;
    const rawItineraries = isEditMode && travel ? storeItineraries.filter((i) => i.travelId === travel.id) : viewItineraries;
    const rawAccommodations = isEditMode && travel ? storeAccommodations.filter((a) => a.travelId === travel.id) : viewAccommodations;

    const travelAccommodations = useMemo(() => [...rawAccommodations].sort((a, b) => a.dayIndex - b.dayIndex), [rawAccommodations]);

    const filteredItineraries = useMemo(() => {
        return rawItineraries
            .filter((i) => selectedDay === 'all' || i.dayIndex === selectedDay)
            .sort((a, b) => {
                if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
                return a.time.localeCompare(b.time);
            });
    }, [rawItineraries, selectedDay]);

    const effectiveError = !shareId ? '잘못된 공유 링크입니다.' : error;

    // ─── 오류 화면 ────────────────────────────────────────────────
    if (effectiveError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-gray-700">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <X size={32} />
                    </div>
                    <h2 className="text-xl font-bold mb-2 dark:text-white">접근 오류</h2>
                    <p className="text-gray-500 dark:text-gray-400">{effectiveError}</p>
                </div>
            </div>
        );
    }

    // ─── 공동 작업 링크: 로그인 필요 화면 ──────────────────────────
    if (requiresAuth) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-black">
                <div className="max-w-md w-full p-8 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-2xl space-y-6">
                    <div className="w-16 h-16 mx-auto bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                        <Users size={32} />
                    </div>
                    <div>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 mb-3">
                            공동 작업 초대
                        </span>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{authPromptTravelName}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            이 일정은 함께 수정할 수 있는 공동 작업 링크입니다.
                            <br />
                            Google 계정으로 로그인하면 일정을 수정하고 내 여행 목록에도 저장할 수 있습니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/share/${shareId}`)}`)}
                        className="w-full py-3.5 px-5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-600/25 transition-all"
                    >
                        <LogIn size={18} />
                        <span>Google 로그인하고 공동 작업 시작하기</span>
                    </button>
                </div>
            </div>
        );
    }

    // ─── 비로그인 읽기 전용: Turnstile 보안 검증 화면 ──────────────
    if (!import.meta.env.DEV && !authLoading && !user && !token) {
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

    if (authLoading || isLoading || !travel) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
        );
    }

    const totalDays = differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1;
    const selectedItinerary = rawItineraries.find((i) => i.id === selectedItineraryId) || null;

    // 이동 시간 일괄 재계산 (공동 편집 모드 전용)
    const handleRecalculateRoutes = async () => {
        if (!routesLib || !geocodingLib) {
            alert('지도 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        const moveItineraries = rawItineraries.filter((i) => i.type === '이동');
        if (moveItineraries.length === 0) {
            alert('재계산할 이동 일정이 없습니다.');
            return;
        }
        if (!window.confirm(`등록된 ${moveItineraries.length}개의 이동 일정 소요 시간을 다시 계산하시겠습니까?`)) {
            return;
        }

        setIsRecalculatingRoutes(true);
        try {
            const updatedMap = new Map<string, { duration: string; distance: string }>();
            for (let i = 0; i < moveItineraries.length; i++) {
                const iti = moveItineraries[i];
                if (iti.address && iti.arrivalAddress) {
                    const res = await calculateRouteInfo({
                        originAddress: iti.address,
                        destAddress: iti.arrivalAddress,
                        transportMode: iti.transportMode || 'DRIVING',
                        routesLib,
                        geocodingLib,
                    });
                    if (res?.duration) {
                        updatedMap.set(iti.id, { duration: res.duration, distance: res.distance });
                    }
                }
                if (i < moveItineraries.length - 1) {
                    await new Promise((r) => setTimeout(r, 150));
                }
            }

            const nextItineraries = rawItineraries.map((iti) => {
                const upd = updatedMap.get(iti.id);
                return upd ? { ...iti, duration: upd.duration, distance: upd.distance } : iti;
            });

            await updateFullTravelDetail(travel.id, {
                version: '1.0',
                travel,
                itineraries: nextItineraries,
                accommodations: travelAccommodations,
                checklists,
                expenses,
                participants,
            });
            alert(`총 ${updatedMap.size}개의 이동 일정이 업데이트되었습니다.`);
        } finally {
            setIsRecalculatingRoutes(false);
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
            {/* 상단 헤더 */}
            <div className="bg-white dark:bg-gray-800 px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{travel.name}</h1>
                        {isEditMode ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold border border-blue-200 dark:border-blue-800">
                                <Users size={12} />
                                공동 편집 모드
                            </span>
                        ) : (
                            <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full text-xs font-bold border border-amber-100 dark:border-amber-800">
                                읽기 전용
                            </span>
                        )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        {travel.startDate} ~ {travel.endDate} ({totalDays}일간)
                        {isEditMode && lastUpdatedBy ? ` · 최근 저장: ${lastUpdatedBy}` : ''}
                    </p>
                </div>

                {/* 우측 액션 버튼 (모바일 1줄 최적화) */}
                <div className="flex items-center gap-1.5 sm:gap-2 self-end md:self-auto shrink-0">
                    <button
                        onClick={() => setIsExcelPreviewOpen(true)}
                        title="일정표를 Excel 표 형태로 화면에서 바로 보기"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                        <Table2 size={14} />
                        <span className="hidden lg:inline">표 보기</span>
                    </button>
                    <button
                        onClick={() => setIsDocsModalOpen(true)}
                        title="여행 필수 서류 보관함"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                        <FolderLock size={14} />
                        <span className="hidden lg:inline">서류함</span>
                    </button>
                    {isEditMode && (
                        <>
                            <button
                                onClick={() => setIsAccModalOpen(true)}
                                title="숙소 설정"
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                            >
                                <HomeIcon size={14} />
                                <span className="hidden lg:inline">숙소 설정</span>
                            </button>
                            <button
                                onClick={() => {
                                    setEditTarget(null);
                                    setAddModalData(null);
                                    setIsItineraryModalOpen(true);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0"
                            >
                                <Plus size={14} />
                                <span>일정 추가</span>
                            </button>
                        </>
                    )}

                    {/* 더보기 드롭다운 */}
                    <div className="relative" ref={moreRef}>
                        <button
                            type="button"
                            onClick={() => setIsMoreOpen((prev) => !prev)}
                            title="내보내기 및 추가 도구"
                            className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                        >
                            {isRecalculatingRoutes ? <Loader2 size={15} className="animate-spin text-sky-500" /> : <MoreVertical size={15} />}
                        </button>
                        {isMoreOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 z-50">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        setIsChecklistOpen(true);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-gray-800 dark:text-gray-200"
                                >
                                    <CheckSquare size={14} className="text-emerald-600" />
                                    <span>준비물 체크리스트</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        setIsExpenseOpen(true);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-gray-800 dark:text-gray-200"
                                >
                                    <Wallet size={14} className="text-amber-600" />
                                    <span>경비 · 정산 트래커</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        setIsExcelModalOpen(true);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-gray-800 dark:text-gray-200"
                                >
                                    <FileSpreadsheet size={14} className="text-emerald-600" />
                                    <span>Excel (.xlsx) 다운로드</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        exportTravelToIcs(travel, rawItineraries);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-gray-800 dark:text-gray-200"
                                >
                                    <CalendarPlus size={14} className="text-blue-600" />
                                    <span>캘린더 (.ics) 내보내기</span>
                                </button>
                                {isEditMode && (
                                    <>
                                        <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                                        <Link
                                            to="/travels"
                                            onClick={() => setIsMoreOpen(false)}
                                            className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200"
                                        >
                                            <Users size={14} className="text-blue-600" />
                                            <span>내 여행 목록으로</span>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMoreOpen(false);
                                                void fetchSharedData(token || undefined);
                                            }}
                                            className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200"
                                        >
                                            <RefreshCw size={14} className="text-gray-500" />
                                            <span>서버 일정 최신화</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isRecalculatingRoutes}
                                            onClick={() => {
                                                setIsMoreOpen(false);
                                                void handleRecalculateRoutes();
                                            }}
                                            className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-gray-800 dark:text-gray-200 disabled:opacity-50"
                                        >
                                            <Route size={14} className="text-sky-600" />
                                            <span>{isRecalculatingRoutes ? '이동 시간 계산 중...' : '이동 시간 일괄 계산'}</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 타 참여자 저장 알림 배너 */}
            {remoteUpdateNotice && (
                <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center justify-between text-xs text-blue-800 dark:text-blue-200 shrink-0">
                    <span>
                        🔔 <strong>{remoteUpdateNotice.updatedBy || '다른 참여자'}</strong>님이 일정을 업데이트했습니다.
                    </span>
                    <button
                        onClick={() => fetchSharedData(token || undefined)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold transition-colors"
                    >
                        최신 일정 불러오기
                    </button>
                </div>
            )}

            <div className="flex-1 flex flex-col p-3 sm:p-5 overflow-hidden w-full gap-4 relative">
                {/* 뷰 컨트롤 (모바일용) & Day 필터 & 날씨 */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-3">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-2 min-w-0 max-w-full">
                        <DayFilter
                            days={totalDays}
                            selectedDay={selectedDay}
                            setSelectedDay={setSelectedDay}
                        />
                        <WeatherBanner
                            travel={travel}
                            itineraries={rawItineraries}
                            accommodations={travelAccommodations}
                            selectedDay={selectedDay}
                            onSaveWeatherSnapshot={
                                isEditMode ? (weatherSnapshot) => updateTravel(travel.id, { weatherSnapshot }) : undefined
                            }
                        />
                    </div>

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
                                        if (!isEditMode) {
                                            setIsViewDialogOpen(true);
                                        }
                                    }}
                                    onAddItinerary={
                                        isEditMode
                                            ? (defaultData) => {
                                                  setEditTarget(null);
                                                  setAddModalData(defaultData);
                                                  setIsItineraryModalOpen(true);
                                              }
                                            : undefined
                                    }
                                    onEdit={
                                        isEditMode
                                            ? (e, iti) => {
                                                  e.stopPropagation();
                                                  setEditTarget(iti);
                                                  setAddModalData(null);
                                                  setIsItineraryModalOpen(true);
                                              }
                                            : undefined
                                    }
                                    onDelete={
                                        isEditMode
                                            ? (e, itiId) => {
                                                  e.stopPropagation();
                                                  if (window.confirm('일정을 삭제하시겠습니까?')) {
                                                      deleteItinerary(itiId);
                                                  }
                                              }
                                            : undefined
                                    }
                                    onDiscard={isEditMode ? () => fetchSharedData(token || undefined) : undefined}
                                    onShowOnMap={() => setActiveTab('map')}
                                    readOnly={!isEditMode}
                                />
                            </div>
                        </div>
                    </div>

                    {!isMapExpanded && (
                        <div className={`w-full lg:w-2/3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm ${activeTab === 'map' ? 'flex' : 'hidden lg:flex'} transition-all duration-300`}>
                            {!isTravelCompleted(travel.endDate) || loadedMapTravelId === travel.id ? (
                                <GoogleMapView
                                    itineraries={filteredItineraries}
                                    accommodations={travelAccommodations}
                                    selectedDay={selectedDay}
                                    selectedItineraryId={selectedItineraryId}
                                    onMarkerClick={(itiId) => {
                                        setSelectedItineraryId(itiId);
                                        if (!isEditMode) {
                                            setIsViewDialogOpen(true);
                                        }
                                    }}
                                />
                            ) : (
                                <CompletedMapPlaceholder onLoadMap={() => setLoadedMapTravelId(travel.id)} />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 읽기 전용 상세 다이얼로그 */}
            {!isEditMode && (
                <SharedItineraryDialog
                    isOpen={isViewDialogOpen}
                    onClose={() => setIsViewDialogOpen(false)}
                    itinerary={selectedItinerary}
                />
            )}

            {/* 공동 편집용 모달들 */}
            {isEditMode && (
                <>
                    <ItineraryDialog
                        isOpen={isItineraryModalOpen}
                        onClose={() => setIsItineraryModalOpen(false)}
                        travelId={travel.id}
                        editTarget={editTarget}
                        defaultData={addModalData}
                    />
                    <AccommodationDialog
                        isOpen={isAccModalOpen}
                        onClose={() => setIsAccModalOpen(false)}
                        travelId={travel.id}
                    />
                    <ConflictModal
                        isOpen={Boolean(conflictState)}
                        message={conflictState?.message || ''}
                        serverUpdatedBy={conflictState?.serverData?.updatedBy}
                        onClose={clearConflict}
                        onReloadServer={async () => {
                            clearConflict();
                            await fetchSharedData(token || undefined);
                        }}
                        onForceOverwrite={async () => {
                            clearConflict();
                            await saveTravelDetail(travel.id, true);
                        }}
                    />
                </>
            )}

            {/* Excel 표 화면 보기 & 내보내기 & 서류함 모달 (읽기/편집 모두 지원) */}
            <ExcelPreviewModal
                isOpen={isExcelPreviewOpen}
                onClose={() => setIsExcelPreviewOpen(false)}
                travel={travel}
                itineraries={rawItineraries}
                accommodations={travelAccommodations}
                onOpenExportOptions={() => setIsExcelModalOpen(true)}
            />
            <DocumentsModal
                isOpen={isDocsModalOpen}
                onClose={() => setIsDocsModalOpen(false)}
                travel={travel}
                canEdit={isEditMode}
                shareId={shareId}
            />
            <ChecklistModal
                isOpen={isChecklistOpen}
                onClose={() => setIsChecklistOpen(false)}
                travel={travel}
                canEdit={isEditMode}
                shareId={shareId}
                onOpenDocuments={() => setIsDocsModalOpen(true)}
            />
            <ExpenseModal
                isOpen={isExpenseOpen}
                onClose={() => setIsExpenseOpen(false)}
                travel={travel}
                canEdit={isEditMode}
            />
            <ExcelExportModal
                isOpen={isExcelModalOpen}
                onClose={() => setIsExcelModalOpen(false)}
                travel={travel}
                itineraries={rawItineraries}
                accommodations={travelAccommodations}
                onSaveExportMeta={
                    isEditMode
                        ? async (exportMeta) => {
                              await updateTravel(travel.id, { exportMeta });
                          }
                        : undefined
                }
            />
        </div>
    );
};

export default SharedTravelDetail;
