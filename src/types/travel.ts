export interface Travel {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Accommodation {
  id: string;
  travelId: string;
  name: string;
  address: string;
  description: string;
  dayIndex: number; // 1, 2, ...
  phone?: string;
}

export interface TravelExportData {
  version: string;
  travel: Travel;
  itineraries: Itinerary[];
  accommodations: Accommodation[];
}

export type TransportMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';

export type ItineraryType = '이동' | '관광' | '식사' | '기타';

export const getTypeEmoji = (type: ItineraryType): string => {
  switch (type) {
    case '이동': return '🚌';
    case '관광': return '📸';
    case '식사': return '🍽️';
    default: return '📌';
  }
};

export const getTransportInfo = (mode?: TransportMode): { label: string; emoji: string } => {
  switch (mode) {
    case 'DRIVING': return { label: '자동차', emoji: '🚗' };
    case 'WALKING': return { label: '도보', emoji: '🚶' };
    case 'BICYCLING': return { label: '자전거', emoji: '🚲' };
    case 'TRANSIT': return { label: '대중교통', emoji: '🚌' };
    default: return { label: '이동', emoji: '🏃' };
  }
};

export interface Itinerary {
  id: string;
  travelId: string;
  type: ItineraryType;
  dayIndex: number; // 1, 2, 3... (1일차, 2일차)
  time: string; // HH:mm
  endTime?: string; // HH:mm (옵션)
  address: string;
  arrivalAddress?: string; // 이동일 경우 도착지
  content: string;
  description: string;
  lat?: number;
  lng?: number;
  arrivalLat?: number;
  arrivalLng?: number;
  transportMode?: TransportMode;
  duration?: string;
  distance?: string;
}
