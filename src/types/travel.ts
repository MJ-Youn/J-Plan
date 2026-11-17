/**
 * Excel 내보내기 및 상세 출력용 추가 메타데이터 인터페이스
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export interface TravelExportMeta {
  airportInfo?: string; // 출도착 공항 및 항공편 요약
  vehicleInfo?: string; // 렌터카 / 이동 차량 정보
  dayThemes?: Record<number, string>; // 일차별 주요 방문지/테마
  dayTolls?: Record<number, number>; // 일차별 예상 유료도로/톨비
  dayMemos?: Record<number, string>; // 일차별 유료도로·주차 메모
  currencyLabel?: string; // 통화 단위 (기본: '원' 또는 '엔')
}

/**
 * 여행 기본 정보 인터페이스
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export interface Travel {
  id: string;
  name: string;
  region?: string;
  startDate: string;
  endDate: string;
  isShared?: boolean; // 공유받은 공동 작업 여행 여부
  ownerId?: string; // 소유자 ID (공유받은 여행일 때 사용)
  ownerName?: string; // 소유자 이름
  exportMeta?: TravelExportMeta; // Excel 출력용 메타데이터
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
 * 여행 데이터 내보내기 및 동기화용 구조체
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
export interface TravelExportData {
  version: string;
  revision?: number; // 낙관적 잠금(동시 편집 충돌 방지)용 리비전 번호
  updatedAt?: string; // 마지막 저장 시각 (ISO 8601)
  updatedBy?: string; // 마지막 수정자 이름
  travel: Travel;
  itineraries: Itinerary[];
  accommodations: Accommodation[];
  checklists?: ChecklistItem[];
  expenses?: ExpenseItem[];
  participants?: string[];
}

/**
 * 여행 경비 카테고리
 */
export type ExpenseCategory = '식비' | '숙박' | '교통·렌터카' | '관광·쇼핑' | '기타';

/**
 * 지원 통화 코드
 */
export type ExpenseCurrency = 'KRW' | 'JPY' | 'USD' | 'EUR' | 'TWD' | 'THB' | 'VND';

/**
 * 여행 경비 지출 항목 인터페이스
 */
export interface ExpenseItem {
  id: string;
  dayIndex: number;
  category: ExpenseCategory;
  title: string;
  amount: number;
  currency: ExpenseCurrency;
  paidBy?: string;
  splitAmong?: string[];
  memo?: string;
}

/**
 * 여행 준비물/출발 전 체크리스트 카테고리
 */
export type ChecklistCategory = '서류·예약' | '전자기기' | '의류·세면' | '상비약' | '현지준비' | '기타';

/**
 * 여행 준비물 체크리스트 항목 인터페이스 (서류 보관함 연동 지원)
 */
export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  title: string;
  isChecked: boolean;
  assignee?: string;
  linkedDocumentId?: string; // TravelDocument.id 연동
  memo?: string;
}

/**
 * 공유 링크 권한 타입 ('view': 읽기 전용, 'edit': 공동 편집)
 */
export type SharePermission = 'view' | 'edit';

/**
 * 공유 링크 메타 정보 인터페이스
 */
export interface ShareLinkInfo {
  id: string;
  travelId: string;
  permission: SharePermission;
  isActive: boolean;
  createdAt?: string;
}

/**
 * 공동 작업자 정보 인터페이스
 */
export interface CollaboratorInfo {
  userId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  role: string;
  joinedAt?: string;
}

/**
 * 여행 필수 서류 카테고리 타입
 */
export type DocumentCategory = '항공' | '숙소' | '렌터카' | '보험·입국' | '티켓·QR' | '기타';

/**
 * 서류 저장 방식 ('r2': 암호화 파일 업로드, 'link': Google Drive 등 외부 링크)
 */
export type DocumentStorageType = 'r2' | 'link';

/**
 * 서류 공개 범위 ('owner_only': 소유자만, 'collaborators': 공동 작업자 허용, 'all_shared': 읽기 공유 포함)
 */
export type DocumentVisibility = 'owner_only' | 'collaborators' | 'all_shared';

/**
 * 여행 필수 서류(바우처, e-티켓, QR 등) 메타데이터 인터페이스
 */
export interface TravelDocument {
  id: string;
  travelId: string;
  ownerId?: string;
  category: DocumentCategory;
  title: string;
  reservationNumber?: string;
  provider?: string;
  storageType: DocumentStorageType;
  externalUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  visibility: DocumentVisibility;
  dayIndex?: number;
  memo?: string;
  createdAt?: string;
  canDelete?: boolean;
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

export const formatDuration = (durationStr?: string): string => {
  if (!durationStr) return '';
  return durationStr
    .replace(/hours?/gi, '시간')
    .replace(/mins?/gi, '분')
    .replace(/days?/gi, '일')
    .replace(/hr/gi, '시간')
    .replace(/\s+시간/g, '시간')
    .replace(/\s+분/g, '분')
    .replace(/\s+일/g, '일')
    .replace(/\s+/g, ' ')
    .trim();
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
  costAmount?: number; // 일정 예상/실제 비용
  costCurrency?: ExpenseCurrency; // 비용 통화 (KRW, JPY 등)
  paidBy?: string; // 결제자 이름
}
