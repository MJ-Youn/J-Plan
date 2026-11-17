import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Travel, Accommodation, Itinerary, TravelExportData, SharePermission, ChecklistItem, ExpenseItem } from '../types/travel';

/**
 * 공유 페이지에서 편집 시 사용되는 컨텍스트 정보
 */
export interface ActiveShareContext {
    shareId: string;
    permission: SharePermission;
    ownerId?: string;
}

/**
 * 저장 시 동시 편집 충돌(409 Conflict) 상태 정보
 */
export interface SaveConflictState {
    message: string;
    serverData?: TravelExportData;
}

/**
 * 여행 상태 관리를 위한 인터페이스 정의입니다.
 */
interface TravelState {
    travels: Travel[];
    accommodations: Accommodation[];
    itineraries: Itinerary[];
    checklists: ChecklistItem[];
    expenses: ExpenseItem[];
    participants: string[];
    isLoading: boolean;
    currentRevision: number;
    lastUpdatedAt: string | null;
    lastUpdatedBy: string | null;
    activeShareContext: ActiveShareContext | null;
    conflictState: SaveConflictState | null;

    fetchTravels: () => Promise<void>;
    fetchTravelDetail: (id: string, ownerId?: string) => Promise<void>;
    loadSharedTravelDetail: (data: TravelExportData, shareContext: ActiveShareContext | null) => void;
    clearShareContext: () => void;
    clearConflict: () => void;
    addTravel: (travel: Omit<Travel, 'id'>) => Promise<void>;
    updateTravel: (id: string, travel: Partial<Travel>) => Promise<void>;
    deleteTravel: (id: string) => Promise<void>;
    setAccommodations: (travelId: string, accs: Accommodation[]) => Promise<void>;
    setChecklists: (travelId: string, items: ChecklistItem[]) => void;
    setExpenses: (travelId: string, items: ExpenseItem[]) => void;
    setParticipants: (travelId: string, names: string[]) => void;
    addItinerary: (itinerary: Omit<Itinerary, 'id'>) => Promise<void>;
    updateItinerary: (id: string, itinerary: Partial<Itinerary>) => Promise<void>;
    deleteItinerary: (id: string) => Promise<void>;
    shiftItinerariesFrom: (travelId: string, dayIndex: number, fromTime: string, deltaMins: number) => void;
    importTravel: (data: TravelExportData) => Promise<void>;
    updateFullTravelDetail: (travelId: string, data: TravelExportData, forceOverwrite?: boolean) => Promise<boolean>;

    // 수동 저장을 위한 상태 및 함수
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (val: boolean) => void;
    saveTravelDetail: (travelId: string, forceOverwrite?: boolean) => Promise<boolean>;
}

const LOCAL_STORAGE_KEY_TRAVELS = 'jplan_travels';
const getLocalDetailKey = (id: string) => `jplan_detail_${id}`;

/**
 * 저장 API 엔드포인트 URL을 결정합니다.
 */
function resolveSaveUrl(travelId: string, travel: Travel | undefined, shareContext: ActiveShareContext | null): string {
    if (shareContext?.shareId) {
        return `/api/share/${shareContext.shareId}`;
    }
    const ownerId = travel?.isShared ? travel.ownerId : undefined;
    return ownerId ? `/api/data/travels/${travelId}?ownerId=${encodeURIComponent(ownerId)}` : `/api/data/travels/${travelId}`;
}

/**
 * 여행 데이터를 관리하는 Store입니다.
 * 로컬 개발 환경(`DEV`)에서는 localStorage를 사용하고,
 * 운영 환경에서는 Cloudflare API(R2 + D1)와 동기화됩니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
export const useTravelStore = create<TravelState>((set, get) => ({
    travels: [],
    accommodations: [],
    itineraries: [],
    checklists: [],
    expenses: [],
    participants: [],
    isLoading: false,
    hasUnsavedChanges: false,
    currentRevision: 0,
    lastUpdatedAt: null,
    lastUpdatedBy: null,
    activeShareContext: null,
    conflictState: null,

    setHasUnsavedChanges: (val) => set({ hasUnsavedChanges: val }),
    clearShareContext: () => set({ activeShareContext: null }),
    clearConflict: () => set({ conflictState: null }),

    /**
     * 공유 화면에서 조회한 데이터를 스토어에 적재합니다.
     */
    loadSharedTravelDetail: (data, shareContext) => {
        set((state) => {
            const exists = state.travels.some((t) => t.id === data.travel.id);
            const nextTravels = exists
                ? state.travels.map((t) => (t.id === data.travel.id ? data.travel : t))
                : [...state.travels, data.travel];

            return {
                travels: nextTravels,
                accommodations: data.accommodations || [],
                itineraries: data.itineraries || [],
                checklists: data.checklists || [],
                expenses: data.expenses || [],
                participants: data.participants || [],
                currentRevision: typeof data.revision === 'number' ? data.revision : 0,
                lastUpdatedAt: data.updatedAt || null,
                lastUpdatedBy: data.updatedBy || null,
                activeShareContext: shareContext,
                hasUnsavedChanges: false,
                conflictState: null,
                isLoading: false,
            };
        });
    },

    /**
     * 전체 여행 목록(본인 소유 + 공유받은 여행)을 조회합니다.
     */
    fetchTravels: async () => {
        set({ isLoading: true });
        if (import.meta.env.DEV) {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY_TRAVELS);
            set({ travels: saved ? JSON.parse(saved) : [], isLoading: false });
            return;
        }

        try {
            const res = await fetch('/api/data/travels');
            if (res.ok) {
                const data = await res.json();
                set({ travels: data.travels });
            }
        } catch (error) {
            console.error('[TravelStore] fetchTravels failed:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    /**
     * 특정 여행의 상세 정보(일정, 숙소)를 조회합니다.
     */
    fetchTravelDetail: async (id, ownerId) => {
        set({ isLoading: true, activeShareContext: null, conflictState: null });
        if (import.meta.env.DEV) {
            const saved = localStorage.getItem(getLocalDetailKey(id));
            if (saved) {
                const data: TravelExportData = JSON.parse(saved);
                set({
                    accommodations: data.accommodations || [],
                    itineraries: data.itineraries || [],
                    checklists: data.checklists || [],
                    expenses: data.expenses || [],
                    participants: data.participants || [],
                    currentRevision: typeof data.revision === 'number' ? data.revision : 0,
                    lastUpdatedAt: data.updatedAt || null,
                    lastUpdatedBy: data.updatedBy || null,
                    hasUnsavedChanges: false,
                });
            } else {
                set({
                    accommodations: [],
                    itineraries: [],
                    checklists: [],
                    expenses: [],
                    participants: [],
                    currentRevision: 0,
                    lastUpdatedAt: null,
                    lastUpdatedBy: null,
                    hasUnsavedChanges: false,
                });
            }
            set({ isLoading: false });
            return;
        }

        try {
            const travelFromList = get().travels.find((t) => t.id === id);
            const resolvedOwnerId = ownerId || (travelFromList?.isShared ? travelFromList.ownerId : undefined);
            const url = resolvedOwnerId
                ? `/api/data/travels/${id}?ownerId=${encodeURIComponent(resolvedOwnerId)}`
                : `/api/data/travels/${id}`;

            const res = await fetch(url);
            if (res.ok) {
                const data: TravelExportData & { isOwner?: boolean; ownerId?: string } = await res.json();
                set((state) => ({
                    travels: state.travels.map((t) => (t.id === id ? { ...t, ...data.travel } : t)),
                    accommodations: data.accommodations || [],
                    itineraries: data.itineraries || [],
                    checklists: data.checklists || [],
                    expenses: data.expenses || [],
                    participants: data.participants || [],
                    currentRevision: typeof data.revision === 'number' ? data.revision : 0,
                    lastUpdatedAt: data.updatedAt || null,
                    lastUpdatedBy: data.updatedBy || null,
                    hasUnsavedChanges: false,
                }));
            }
        } catch (error) {
            console.error('[TravelStore] fetchTravelDetail failed:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    /**
     * 새로운 여행을 추가합니다.
     */
    addTravel: async (travel) => {
        const newTravel = { ...travel, id: uuidv4() };
        if (import.meta.env.DEV) {
            const travels = [...get().travels, newTravel];
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            localStorage.setItem(
                getLocalDetailKey(newTravel.id),
                JSON.stringify({
                    version: '1.0',
                    revision: 1,
                    updatedAt: new Date().toISOString(),
                    travel: newTravel,
                    itineraries: [],
                    accommodations: [],
                }),
            );
            set({ travels });
            return;
        }

        try {
            const res = await fetch('/api/data/travels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTravel),
            });
            if (res.ok) {
                set((state) => ({ travels: [...state.travels, newTravel] }));
            }
        } catch (error) {
            console.error('[TravelStore] addTravel failed:', error);
        }
    },

    /**
     * 기존 여행 기본 정보를 수정합니다.
     */
    updateTravel: async (id, updated) => {
        const travel = get().travels.find((t) => t.id === id);
        if (!travel) {
            return;
        }
        const newTravel = { ...travel, ...updated };

        if (import.meta.env.DEV) {
            const travels = get().travels.map((t) => (t.id === id ? newTravel : t));
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            const savedDetail = localStorage.getItem(getLocalDetailKey(id));
            if (savedDetail) {
                const fullData: TravelExportData = JSON.parse(savedDetail);
                fullData.travel = newTravel;
                fullData.revision = (fullData.revision ?? 0) + 1;
                fullData.updatedAt = new Date().toISOString();
                localStorage.setItem(getLocalDetailKey(id), JSON.stringify(fullData));
                set({ travels, currentRevision: fullData.revision });
            } else {
                set({ travels });
            }
            return;
        }

        try {
            const detailUrl = resolveSaveUrl(id, travel, get().activeShareContext);
            const detailRes = await fetch(detailUrl);
            if (!detailRes.ok) {
                return;
            }
            const fullData: TravelExportData = await detailRes.json();
            fullData.travel = newTravel;

            const res = await fetch(detailUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...fullData,
                    baseRevision: typeof fullData.revision === 'number' ? fullData.revision : undefined,
                }),
            });
            if (res.ok) {
                const savedRes = await res.json();
                set((state) => ({
                    travels: state.travels.map((t) => (t.id === id ? newTravel : t)),
                    currentRevision: savedRes.data?.revision ?? state.currentRevision,
                    lastUpdatedAt: savedRes.data?.updatedAt ?? state.lastUpdatedAt,
                    lastUpdatedBy: savedRes.data?.updatedBy ?? state.lastUpdatedBy,
                }));
            }
        } catch (error) {
            console.error('[TravelStore] updateTravel failed:', error);
        }
    },

    /**
     * 특정 여행을 삭제합니다.
     */
    deleteTravel: async (id) => {
        if (import.meta.env.DEV) {
            const travels = get().travels.filter((t) => t.id !== id);
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            localStorage.removeItem(getLocalDetailKey(id));
            set({
                travels,
                accommodations: get().accommodations.filter((a) => a.travelId !== id),
                itineraries: get().itineraries.filter((i) => i.travelId !== id),
            });
            return;
        }

        try {
            const res = await fetch(`/api/data/travels/${id}`, { method: 'DELETE' });
            if (res.ok) {
                set((state) => ({
                    travels: state.travels.filter((t) => t.id !== id),
                    accommodations: state.accommodations.filter((a) => a.travelId !== id),
                    itineraries: state.itineraries.filter((i) => i.travelId !== id),
                }));
            }
        } catch (error) {
            console.error('[TravelStore] deleteTravel failed:', error);
        }
    },

    /**
     * 특정 여행의 숙소 정보를 설정합니다. (로컬 상태만 변경)
     */
    setAccommodations: async (_travelId, accs) => {
        set({ accommodations: accs, hasUnsavedChanges: true });
    },

    /**
     * 특정 여행의 체크리스트 항목을 설정합니다. (로컬 상태만 변경)
     */
    setChecklists: (_travelId, items) => {
        set({ checklists: items, hasUnsavedChanges: true });
    },

    /**
     * 특정 여행의 경비 지출 내역을 설정합니다. (로컬 상태만 변경)
     */
    setExpenses: (_travelId, items) => {
        set({ expenses: items, hasUnsavedChanges: true });
    },

    /**
     * 특정 여행의 정산 참여자 목록을 설정합니다. (로컬 상태만 변경)
     */
    setParticipants: (_travelId, names) => {
        set({ participants: names, hasUnsavedChanges: true });
    },

    /**
     * 특정 여행에 새로운 일정을 추가합니다. (로컬 상태만 변경)
     */
    addItinerary: async (iti) => {
        const newIti = { ...iti, id: uuidv4() };
        set((state) => ({
            itineraries: [...state.itineraries, newIti],
            hasUnsavedChanges: true,
        }));
    },

    /**
     * 기존 일정을 수정합니다. (로컬 상태만 변경)
     */
    updateItinerary: async (id, updated) => {
        set((state) => ({
            itineraries: state.itineraries.map((i) => (i.id === id ? { ...i, ...updated } : i)),
            hasUnsavedChanges: true,
        }));
    },

    /**
     * 특정 일정을 삭제합니다. (로컬 상태만 변경)
     */
    deleteItinerary: async (id) => {
        set((state) => ({
            itineraries: state.itineraries.filter((i) => i.id !== id),
            hasUnsavedChanges: true,
        }));
    },

    /**
     * 특정 일차의 기준 시간(fromTime) 이후 모든 일정을 일괄로 앞당기거나 미룹니다.
     */
    shiftItinerariesFrom: (travelId, dayIndex, fromTime, deltaMins) => {
        const parseMins = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const formatMins = (mins: number) => {
            const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
            const h = Math.floor(clamped / 60)
                .toString()
                .padStart(2, '0');
            const m = (clamped % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        };

        set((state) => ({
            itineraries: state.itineraries.map((iti) => {
                if (iti.travelId !== travelId || iti.dayIndex !== dayIndex || iti.time < fromTime) {
                    return iti;
                }
                const nextStart = parseMins(iti.time) + deltaMins;
                const nextEnd = iti.endTime ? parseMins(iti.endTime) + deltaMins : undefined;
                return {
                    ...iti,
                    time: formatMins(nextStart),
                    ...(nextEnd !== undefined ? { endTime: formatMins(nextEnd) } : {}),
                };
            }),
            hasUnsavedChanges: true,
        }));
    },

    /**
     * 메모리에 들고 있던 변경 사항(일정, 숙소)을 DB(R2)에 최종 저장합니다.
     * 동시 편집 충돌(409) 발생 시 conflictState를 설정하고 false를 반환합니다.
     */
    saveTravelDetail: async (travelId, forceOverwrite = false) => {
        const state = get();
        const travel = state.travels.find((t) => t.id === travelId);
        if (!travel) {
            return false;
        }

        const fullData: TravelExportData = {
            version: '1.0',
            travel,
            itineraries: state.itineraries,
            accommodations: state.accommodations,
            checklists: state.checklists,
            expenses: state.expenses,
            participants: state.participants,
        };

        if (import.meta.env.DEV) {
            const nextRev = state.currentRevision + 1;
            const savedPayload: TravelExportData = {
                ...fullData,
                revision: nextRev,
                updatedAt: new Date().toISOString(),
                updatedBy: '윤명준 (Local Dev)',
            };
            localStorage.setItem(getLocalDetailKey(travelId), JSON.stringify(savedPayload));
            set({
                hasUnsavedChanges: false,
                currentRevision: nextRev,
                lastUpdatedAt: savedPayload.updatedAt || null,
                lastUpdatedBy: savedPayload.updatedBy || null,
                conflictState: null,
            });
            return true;
        }

        try {
            const url = resolveSaveUrl(travelId, travel, state.activeShareContext);
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...fullData,
                    baseRevision: forceOverwrite ? undefined : state.currentRevision,
                }),
            });

            if (res.status === 409) {
                const conflictJson = await res.json();
                set({
                    conflictState: {
                        message: conflictJson.error || '다른 사용자가 먼저 일정을 수정했습니다.',
                        serverData: conflictJson.serverData,
                    },
                });
                return false;
            }

            if (res.ok) {
                const resJson = await res.json();
                set({
                    hasUnsavedChanges: false,
                    currentRevision: resJson.data?.revision ?? state.currentRevision + 1,
                    lastUpdatedAt: resJson.data?.updatedAt ?? new Date().toISOString(),
                    lastUpdatedBy: resJson.data?.updatedBy ?? state.lastUpdatedBy,
                    conflictState: null,
                });
                return true;
            } else {
                const errJson = await res.json().catch(() => ({}));
                alert(errJson.error || '저장에 실패했습니다. 다시 시도해 주세요.');
                return false;
            }
        } catch (error) {
            console.error('[TravelStore] saveTravelDetail failed:', error);
            return false;
        }
    },

    /**
     * 여행 데이터를 가져오기(Import) 합니다.
     */
    importTravel: async (data) => {
        if (import.meta.env.DEV) {
            const travels = [...get().travels.filter((t) => t.id !== data.travel.id), data.travel];
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            localStorage.setItem(getLocalDetailKey(data.travel.id), JSON.stringify({ ...data, revision: 1 }));
            await get().fetchTravels();
            return;
        }

        try {
            const res = await fetch('/api/data/travels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.travel),
            });

            if (res.ok) {
                await fetch(`/api/data/travels/${data.travel.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                await get().fetchTravels();
            }
        } catch (error) {
            console.error('[TravelStore] importTravel failed:', error);
        }
    },

    /**
     * 특정 여행의 전체 데이터(기본정보, 일정, 숙소)를 일괄 갱신합니다.
     */
    updateFullTravelDetail: async (travelId, data, forceOverwrite = false) => {
        const state = get();
        const travel = state.travels.find((t) => t.id === travelId) || data.travel;

        if (import.meta.env.DEV) {
            const nextRev = state.currentRevision + 1;
            const travels = state.travels.map((t) => (t.id === travelId ? data.travel : t));
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            localStorage.setItem(
                getLocalDetailKey(travelId),
                JSON.stringify({
                    ...data,
                    revision: nextRev,
                    updatedAt: new Date().toISOString(),
                    updatedBy: '윤명준 (Local Dev)',
                }),
            );
            set({
                travels,
                itineraries: data.itineraries,
                accommodations: data.accommodations,
                checklists: data.checklists || state.checklists,
                expenses: data.expenses || state.expenses,
                participants: data.participants || state.participants,
                currentRevision: nextRev,
                hasUnsavedChanges: false,
                conflictState: null,
            });
            return true;
        }

        try {
            const url = resolveSaveUrl(travelId, travel, state.activeShareContext);
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    baseRevision: forceOverwrite ? undefined : state.currentRevision,
                }),
            });

            if (res.status === 409) {
                const conflictJson = await res.json();
                set({
                    conflictState: {
                        message: conflictJson.error || '다른 사용자가 먼저 일정을 수정했습니다.',
                        serverData: conflictJson.serverData,
                    },
                });
                return false;
            }

            if (res.ok) {
                const resJson = await res.json();
                set((prev) => ({
                    travels: prev.travels.map((t) => (t.id === travelId ? { ...t, ...data.travel } : t)),
                    itineraries: data.itineraries,
                    accommodations: data.accommodations,
                    checklists: data.checklists || prev.checklists,
                    expenses: data.expenses || prev.expenses,
                    participants: data.participants || prev.participants,
                    currentRevision: resJson.data?.revision ?? prev.currentRevision + 1,
                    lastUpdatedAt: resJson.data?.updatedAt ?? new Date().toISOString(),
                    lastUpdatedBy: resJson.data?.updatedBy ?? prev.lastUpdatedBy,
                    hasUnsavedChanges: false,
                    conflictState: null,
                }));
                return true;
            }
            return false;
        } catch (error) {
            console.error('[TravelStore] updateFullTravelDetail failed:', error);
            return false;
        }
    },
}));
