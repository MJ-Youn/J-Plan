import { Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import type { Accommodation, Itinerary, ItineraryType } from '../../types/travel';
import { getTypeEmoji } from '../../types/travel';

/**
 * 지도 컴포넌트의 Props 인터페이스
 */
interface Props {
    itineraries: Itinerary[];
    accommodations?: Accommodation[];
    selectedDay?: number | 'all';
    selectedItineraryId: string | null;
    onMarkerClick?: (id: string) => void;
}

/**
 * 지오코딩된 마커 데이터 구조
 */
interface GeocodedMarker {
    id: string;
    lat: number;
    lng: number;
    content: string;
    type: ItineraryType | '숙소';
    address: string;
    description?: string;
}

// 주소-좌표 변환 성능을 위한 캐시 객체
const geocodeCache = new Map<string, { lat: number; lng: number }>();

/**
 * 일정 간의 경로를 그리는 폴리라인 컴포넌트
 */
const PolylineComponent = ({ positions, theme }: { positions: { lat: number; lng: number }[]; theme: string }) => {
    const map = useMap();
    useEffect(() => {
        if (!map || positions.length < 2) return;
        const path = new google.maps.Polyline({
            path: positions,
            geodesic: true,
            strokeColor: theme === 'dark' ? '#fbbf24' : '#f59e0b',
            strokeOpacity: 0.8,
            strokeWeight: 4,
        });
        path.setMap(map);
        return () => path.setMap(null);
    }, [map, positions, theme]);
    return null;
};

/**
 * 지도 내부 로직을 담당하는 핵심 컴포넌트 (useMap 훅 사용을 위해 분리)
 */
const MapInner: React.FC<Props> = ({ itineraries, accommodations, selectedDay, selectedItineraryId, onMarkerClick }) => {
    const { theme } = useThemeStore();
    const map = useMap();
    const geocodingLib = useMapsLibrary('geocoding');

    const [markers, setMarkers] = useState<GeocodedMarker[]>([]);
    const [positions, setPositions] = useState<{ lat: number; lng: number }[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isExpanded, setIsExpanded] = useState<boolean>(true);

    // 1. 일정 및 숙소 데이터를 좌표로 변환(Geocoding)하는 로직
    useEffect(() => {
        if (!geocodingLib) return;

        const geocoder = new geocodingLib.Geocoder();
        let isCancelled = false;

        const fetchCoordinates = async () => {
            setIsLoading(true);
            const newMarkers: GeocodedMarker[] = [];
            const newPositions: { lat: number; lng: number }[] = [];

            const geocode = async (address: string): Promise<{ lat: number; lng: number } | null> => {
                if (geocodeCache.has(address)) return geocodeCache.get(address)!;
                try {
                    const res = await geocoder.geocode({ address, language: 'ko' });
                    if (res.results && res.results.length > 0) {
                        const loc = res.results[0].geometry.location;
                        const coords = { lat: loc.lat(), lng: loc.lng() };
                        geocodeCache.set(address, coords);
                        return coords;
                    }
                } catch (error) {
                    console.error('지오코딩 에러 (주소):', address, error);
                }
                return null;
            };

            // 일정 데이터 처리
            for (const iti of itineraries) {
                if (isCancelled) break;
                if (iti.address) {
                    const coords = await geocode(iti.address);
                    if (isCancelled) break;
                    if (coords) {
                        newPositions.push(coords);
                        newMarkers.push({
                            id: iti.id,
                            lat: coords.lat,
                            lng: coords.lng,
                            content: iti.content,
                            type: iti.type,
                            address: iti.address,
                            description: iti.description,
                        });
                    }
                }
            }

            // 숙소 데이터 처리
            let filteredAccommodations: Accommodation[] = [];
            if (accommodations && selectedDay !== undefined) {
                if (selectedDay === 'all') {
                    filteredAccommodations = accommodations;
                } else {
                    filteredAccommodations = accommodations.filter((a) => a.dayIndex === selectedDay || a.dayIndex === selectedDay - 1);
                }
            }

            for (const acc of filteredAccommodations) {
                if (isCancelled) break;
                if (acc.address) {
                    const coords = await geocode(acc.address);
                    if (isCancelled) break;
                    if (coords) {
                        newMarkers.push({
                            id: acc.id,
                            lat: coords.lat,
                            lng: coords.lng,
                            content: `[${acc.dayIndex}일차 숙소] ${acc.name}`,
                            type: '숙소',
                            address: acc.address,
                            description: acc.description,
                        });
                    }
                }
            }

            if (!isCancelled) {
                setMarkers(newMarkers);
                setPositions(newPositions);

                // 초기 로드 시 선택된 일정이 있거나 전체 범위를 보여줌
                if (map && newMarkers.length > 0) {
                    if (selectedItineraryId) {
                        const target = newMarkers.find((m) => m.id === selectedItineraryId);
                        if (target) {
                            map.panTo({ lat: target.lat, lng: target.lng });
                            map.setZoom(16);
                        }
                    } else {
                        const bounds = new google.maps.LatLngBounds();
                        newMarkers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
                        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
                    }
                }
                setIsLoading(false);
            }
        };

        fetchCoordinates();
        return () => { isCancelled = true; };
    }, [itineraries, geocodingLib, map, selectedDay]);

    // 2. 선택된 일정(selectedItineraryId)이 변경될 때 지도를 해당 위치로 이동
    useEffect(() => {
        if (!map || !selectedItineraryId || markers.length === 0) return;

        const target = markers.find((m) => m.id === selectedItineraryId);
        if (target) {
            map.panTo({ lat: target.lat, lng: target.lng });
            map.setZoom(16);
        }
    }, [map, selectedItineraryId, markers]);

    return (
        <>
            {/* 로딩 인디케이터 */}
            {isLoading && (
                <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm transition-all duration-300">
                    <div className="w-12 h-12 border-4 border-amber-200 dark:border-zinc-700 border-t-amber-600 dark:border-t-amber-400 rounded-full animate-spin"></div>
                    <p className="mt-4 font-semibold text-amber-700 dark:text-amber-400 text-sm animate-pulse">지도 데이터를 불러오는 중입니다...</p>
                </div>
            )}

            {/* 마커 상세정보 접기/펼치기 토글 버튼 */}
            <div className="absolute top-4 right-4 z-[1000]">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 text-sm font-semibold transition hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                    {isExpanded ? (
                        <>
                            <Minimize2 size={16} className="text-amber-600 dark:text-amber-400" />
                            <span>마커 축소</span>
                        </>
                    ) : (
                        <>
                            <Maximize2 size={16} className="text-amber-600 dark:text-amber-400" />
                            <span>마커 확장</span>
                        </>
                    )}
                </button>
            </div>

            {/* 변환된 마커 렌더링 */}
            {markers.map((marker) => {
                const isSelected = marker.id === selectedItineraryId;
                const isAccommodation = marker.type === '숙소';

                return (
                    <AdvancedMarker
                        key={marker.id}
                        position={{ lat: marker.lat, lng: marker.lng }}
                        zIndex={isSelected ? 1000 : isAccommodation ? 500 : 1}
                        onClick={() => onMarkerClick && onMarkerClick(marker.id)}
                    >
                        <div
                            style={{ width: isExpanded ? 'max-content' : '40px' }}
                            className={`rounded-xl shadow-lg text-sm font-bold border-2 transition-all flex items-center justify-center ${isExpanded ? 'px-3 py-1.5' : 'w-10 h-10 !rounded-full'} ${
                                isSelected
                                    ? isAccommodation
                                        ? 'bg-amber-600 text-white border-amber-800 scale-110 z-50'
                                        : theme === 'dark'
                                          ? 'bg-amber-500 text-zinc-900 border-amber-700 scale-110 z-50'
                                          : 'bg-amber-600 text-white border-amber-800 scale-110 z-50'
                                    : isAccommodation
                                      ? theme === 'dark'
                                          ? 'bg-amber-900/60 text-amber-100 border-amber-700 hover:border-amber-400 z-20'
                                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-500 z-20'
                                      : theme === 'dark'
                                        ? 'bg-zinc-800 text-zinc-100 border-zinc-600 hover:border-amber-400 z-10'
                                        : 'bg-white text-gray-800 border-gray-200 hover:border-amber-500 z-10'
                            }`}
                        >
                            <span className={isExpanded ? 'mr-1' : 'text-lg'}>{isAccommodation ? '🏠' : getTypeEmoji(marker.type as ItineraryType)}</span>
                            {isExpanded && <span>{marker.content}</span>}
                        </div>
                    </AdvancedMarker>
                );
            })}

            {/* 경로 폴리라인 */}
            <PolylineComponent positions={positions} theme={theme} />
        </>
    );
};

/**
 * 외부로 노출되는 지도 컴포넌트
 */
const GoogleMapView: React.FC<Props> = (props) => {
    const { theme } = useThemeStore();
    const mapColorScheme = theme === 'dark' ? 'DARK' : 'LIGHT';

    return (
        <div className="w-full h-full relative z-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900">
            <GoogleMap
                defaultCenter={{ lat: 37.5665, lng: 126.978 }}
                defaultZoom={13}
                mapId="DEMO_MAP_ID"
                disableDefaultUI={true}
                colorScheme={mapColorScheme}
                gestureHandling="greedy"
                style={{ width: '100%', height: '100%' }}
            >
                <MapInner {...props} />
            </GoogleMap>
        </div>
    );
};

export default GoogleMapView;
