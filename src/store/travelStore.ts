import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Travel, Accommodation, Itinerary, TravelExportData } from '../types/travel';

/**
 * 여행 상태 관리를 위한 인터페이스 정의입니다.
 */
interface TravelState {
    travels: Travel[];
    accommodations: Accommodation[];
    itineraries: Itinerary[];
    isLoading: boolean;

    fetchTravels: () => Promise<void>;
    fetchTravelDetail: (id: string) => Promise<void>;
    addTravel: (travel: Omit<Travel, 'id'>) => Promise<void>;
    updateTravel: (id: string, travel: Partial<Travel>) => Promise<void>;
    deleteTravel: (id: string) => Promise<void>;
    setAccommodations: (travelId: string, accs: Accommodation[]) => Promise<void>;
    addItinerary: (itinerary: Omit<Itinerary, 'id'>) => Promise<void>;
    updateItinerary: (id: string, itinerary: Partial<Itinerary>) => Promise<void>;
    deleteItinerary: (id: string) => Promise<void>;
    importTravel: (data: TravelExportData) => Promise<void>;
    
    // 수동 저장을 위한 상태 및 함수
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (val: boolean) => void;
    saveTravelDetail: (travelId: string) => Promise<void>;
}

const LOCAL_STORAGE_KEY_TRAVELS = 'jplan_travels';
const getLocalDetailKey = (id: string) => `jplan_detail_${id}`;

/**
 * 여행 데이터를 관리하는 Store입니다.
 * 로컬 개발 환경(`DEV`)에서는 localStorage를 사용하고,
 * 운영 환경에서는 Cloudflare API와 동기화됩니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
export const useTravelStore = create<TravelState>((set, get) => ({
    travels: [],
    accommodations: [],
    itineraries: [],
    isLoading: false,
    hasUnsavedChanges: false,

    setHasUnsavedChanges: (val) => set({ hasUnsavedChanges: val }),

    /**
     * 전체 여행 목록을 조회합니다.
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
    fetchTravelDetail: async (id) => {
        set({ isLoading: true });
        if (import.meta.env.DEV) {
            const saved = localStorage.getItem(getLocalDetailKey(id));
            if (saved) {
                const data: TravelExportData = JSON.parse(saved);
                set({ accommodations: data.accommodations || [], itineraries: data.itineraries || [], hasUnsavedChanges: false });
            } else {
                set({ accommodations: [], itineraries: [], hasUnsavedChanges: false });
            }
            set({ isLoading: false });
            return;
        }

        try {
            const res = await fetch(`/api/data/travels/${id}`);
            if (res.ok) {
                const data: TravelExportData = await res.json();
                set({ accommodations: data.accommodations || [], itineraries: data.itineraries || [], hasUnsavedChanges: false });
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
            localStorage.setItem(getLocalDetailKey(newTravel.id), JSON.stringify({ version: '1.0', travel: newTravel, itineraries: [], accommodations: [] }));
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
     * 기존 여행 정보를 수정합니다.
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
                localStorage.setItem(getLocalDetailKey(id), JSON.stringify(fullData));
            }
            set({ travels });
            return;
        }

        try {
            const detailRes = await fetch(`/api/data/travels/${id}`);
            if (!detailRes.ok) {
            return;
        }
            const fullData: TravelExportData = await detailRes.json();
            fullData.travel = newTravel;

            const res = await fetch(`/api/data/travels/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullData),
            });
            if (res.ok) {
            set((state) => ({ travels: state.travels.map((t) => (t.id === id ? newTravel : t)) }));
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
     * 특정 여행에 새로운 일정을 추가합니다. (로컬 상태만 변경)
     */
    addItinerary: async (iti) => {
        const newIti = { ...iti, id: uuidv4() };
        set((state) => ({ 
            itineraries: [...state.itineraries, newIti],
            hasUnsavedChanges: true
        }));
    },

    /**
     * 기존 일정을 수정합니다. (로컬 상태만 변경)
     */
    updateItinerary: async (id, updated) => {
        set((state) => ({
            itineraries: state.itineraries.map((i) => (i.id === id ? { ...i, ...updated } : i)),
            hasUnsavedChanges: true
        }));
    },

    /**
     * 특정 일정을 삭제합니다. (로컬 상태만 변경)
     */
    deleteItinerary: async (id) => {
        set((state) => ({
            itineraries: state.itineraries.filter((i) => i.id !== id),
            hasUnsavedChanges: true
        }));
    },

    /**
     * 메모리에 들고 있던 변경 사항(일정, 숙소)을 DB에 최종 저장합니다.
     */
    saveTravelDetail: async (travelId) => {
        const state = get();
        const travel = state.travels.find((t) => t.id === travelId);
        if (!travel) {
            return;
        }

        const fullData: TravelExportData = {
            version: '1.0',
            travel,
            itineraries: state.itineraries,
            accommodations: state.accommodations,
        };

        if (import.meta.env.DEV) {
            localStorage.setItem(getLocalDetailKey(travelId), JSON.stringify(fullData));
            set({ hasUnsavedChanges: false });
            return;
        }

        try {
            const res = await fetch(`/api/data/travels/${travelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullData),
            });
            if (res.ok) {
                set({ hasUnsavedChanges: false });
            } else {
                console.error('[TravelStore] Failed to save to DB');
            }
        } catch (error) {
            console.error('[TravelStore] saveTravelDetail failed:', error);
        }
    },

    /**
     * 여행 데이터를 가져오기(Import) 합니다.
     */
    importTravel: async (data) => {
        if (import.meta.env.DEV) {
            const travels = [...get().travels.filter((t) => t.id !== data.travel.id), data.travel];
            localStorage.setItem(LOCAL_STORAGE_KEY_TRAVELS, JSON.stringify(travels));
            localStorage.setItem(getLocalDetailKey(data.travel.id), JSON.stringify(data));
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
}));
