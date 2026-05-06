import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Travel, Accommodation, Itinerary, TravelExportData } from '../types/travel';

interface TravelState {
  travels: Travel[];
  accommodations: Accommodation[];
  itineraries: Itinerary[];
  isLoading: boolean;

  // Actions
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
}

/**
 * 여행 데이터를 관리하는 Store입니다.
 * 모든 변경사항은 Cloudflare R2 API와 동기화됩니다.
 * 
 * @author 윤명준 (MJ Yune)
 * @since 2026-05-06
 */
export const useTravelStore = create<TravelState>((set, get) => ({
  travels: [],
  accommodations: [],
  itineraries: [],
  isLoading: false,

  fetchTravels: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/data/travels');
      if (res.ok) {
        const data = await res.json();
        set({ travels: data.travels });
      }
    } catch (error) {
      console.error('Failed to fetch travels', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTravelDetail: async (id) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/data/travels/${id}`);
      if (res.ok) {
        const data: TravelExportData = await res.json();
        set({ 
          accommodations: data.accommodations || [],
          itineraries: data.itineraries || []
        });
      }
    } catch (error) {
      console.error('Failed to fetch travel detail', error);
    } finally {
      set({ isLoading: false });
    }
  },

  addTravel: async (travel) => {
    const newTravel = { ...travel, id: uuidv4() };
    try {
      const res = await fetch('/api/data/travels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTravel)
      });
      if (res.ok) {
        set((state) => ({ travels: [...state.travels, newTravel] }));
      }
    } catch (error) {
      console.error('Failed to add travel', error);
    }
  },

  updateTravel: async (id, updated) => {
    const travel = get().travels.find(t => t.id === id);
    if (!travel) return;

    const newTravel = { ...travel, ...updated };
    const detailRes = await fetch(`/api/data/travels/${id}`);
    if (!detailRes.ok) return;
    
    const fullData: TravelExportData = await detailRes.json();
    fullData.travel = newTravel;

    try {
      const res = await fetch(`/api/data/travels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        set((state) => ({
          travels: state.travels.map((t) => (t.id === id ? newTravel : t))
        }));
      }
    } catch (error) {
      console.error('Failed to update travel', error);
    }
  },

  deleteTravel: async (id) => {
    try {
      const res = await fetch(`/api/data/travels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        set((state) => ({
          travels: state.travels.filter((t) => t.id !== id),
          accommodations: state.accommodations.filter(a => a.travelId !== id),
          itineraries: state.itineraries.filter(i => i.travelId !== id),
        }));
      }
    } catch (error) {
      console.error('Failed to delete travel', error);
    }
  },

  setAccommodations: async (travelId, accs) => {
    const detailRes = await fetch(`/api/data/travels/${travelId}`);
    if (!detailRes.ok) return;
    
    const fullData: TravelExportData = await detailRes.json();
    fullData.accommodations = accs;

    try {
      const res = await fetch(`/api/data/travels/${travelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        set({ accommodations: accs });
      }
    } catch (error) {
      console.error('Failed to set accommodations', error);
    }
  },

  addItinerary: async (iti) => {
    const newIti = { ...iti, id: uuidv4() };
    const travelId = iti.travelId;
    
    const detailRes = await fetch(`/api/data/travels/${travelId}`);
    if (!detailRes.ok) return;
    
    const fullData: TravelExportData = await detailRes.json();
    fullData.itineraries.push(newIti);

    try {
      const res = await fetch(`/api/data/travels/${travelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        set((state) => ({ itineraries: [...state.itineraries, newIti] }));
      }
    } catch (error) {
      console.error('Failed to add itinerary', error);
    }
  },

  updateItinerary: async (id, updated) => {
    const iti = get().itineraries.find(i => i.id === id);
    if (!iti) return;
    const travelId = iti.travelId;

    const detailRes = await fetch(`/api/data/travels/${travelId}`);
    if (!detailRes.ok) return;
    
    const fullData: TravelExportData = await detailRes.json();
    const newItis = fullData.itineraries.map(i => i.id === id ? { ...i, ...updated } : i);
    fullData.itineraries = newItis;

    try {
      const res = await fetch(`/api/data/travels/${travelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        set({ itineraries: newItis });
      }
    } catch (error) {
      console.error('Failed to update itinerary', error);
    }
  },

  deleteItinerary: async (id) => {
    const iti = get().itineraries.find(i => i.id === id);
    if (!iti) return;
    const travelId = iti.travelId;

    const detailRes = await fetch(`/api/data/travels/${travelId}`);
    if (!detailRes.ok) return;
    
    const fullData: TravelExportData = await detailRes.json();
    const newItis = fullData.itineraries.filter(i => i.id !== id);
    fullData.itineraries = newItis;

    try {
      const res = await fetch(`/api/data/travels/${travelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        set({ itineraries: newItis });
      }
    } catch (error) {
      console.error('Failed to delete itinerary', error);
    }
  },

  importTravel: async (data) => {
    try {
      // 인덱스 목록에 추가 (이미 있으면 덮어쓰기 로직은 백엔드 PUT에서 처리됨)
      // 하지만 여기선 새로 생성하는 형식이므로 POST 사용
      const res = await fetch('/api/data/travels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.travel)
      });
      
      if (res.ok) {
        // 상세 데이터 덮어쓰기
        await fetch(`/api/data/travels/${data.travel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        await get().fetchTravels();
      }
    } catch (error) {
      console.error('Failed to import travel', error);
    }
  },
}));
