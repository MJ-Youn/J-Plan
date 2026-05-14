/**
 * 여행 기본 정보 인터페이스
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export interface Travel {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * 숙소 정보 인터페이스
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export interface Accommodation {
  id: string;
  travelId: string;
  name: string;
  address: string;
  description: string;
  dayIndex: number; // 1, 2, ...
  phone?: string;
}

/**
 * 여행 데이터 내보내기용 구조체
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export interface TravelExportData {
  version: string;
  travel: Travel;
  itineraries: Itinerary[];
  accommodations: Accommodation[];
}

/**
 * 이동 수단 타입
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export type TransportMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' | 'TRAIN' | 'FLIGHT';

export type ItineraryType = '이동' | '관광' | '식사' | '기타';

export const getTransportInfo = (mode?: TransportMode): { label: string; emoji: string } => {
  switch (mode) {
    case 'DRIVING': return { label: '자동차', emoji: '🚗' };
    case 'WALKING': return { label: '도보', emoji: '🚶' };
    case 'BICYCLING': return { label: '자전거', emoji: '🚲' };
    case 'TRANSIT': return { label: '대중교통', emoji: '🚌' };
    case 'TRAIN': return { label: '기차', emoji: '🚅' };
    case 'FLIGHT': return { label: '비행기', emoji: '✈️' };
    default: return { label: '이동', emoji: '🏃' };
  }
};

export const getTypeEmoji = (type: ItineraryType, mode?: TransportMode): string => {
  switch (type) {
    case '이동': 
      return mode ? getTransportInfo(mode).emoji : '🏃';
    case '관광': return '📸';
    case '식사': return '🍽️';
    default: return '📌';
  }
};

/**
 * 개별 일정 상세 정보 인터페이스
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
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
