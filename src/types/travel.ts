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
}

export interface TravelExportData {
  version: string;
  travel: Travel;
  itineraries: Itinerary[];
  accommodations: Accommodation[];
}

export type ItineraryType = '이동' | '관광' | '식사' | '기타';

export const getTypeEmoji = (type: ItineraryType): string => {
  switch (type) {
    case '이동': return '🚌';
    case '관광': return '📸';
    case '식사': return '🍽️';
    default: return '📌';
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
}
