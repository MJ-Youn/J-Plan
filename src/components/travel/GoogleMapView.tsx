import { Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import React, { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, X, Layers, Navigation, ExternalLink, MapPin } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import type { Accommodation, Itinerary, ItineraryType, TransportMode } from '../../types/travel';
import { getTypeEmoji, getTransportInfo, formatDuration } from '../../types/travel';
import { buildNavigationLinks } from '../../utils/navigationLinks';

/**
 * 지도 컴포넌트의 Props 인터페이스
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
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
    rotation?: number;
    transportMode?: TransportMode;
    duration?: string;
    distance?: string;
    dayIndex?: number;
    time?: string;
    seq?: number;
}

/**
 * 동일/초근접 좌표 마커를 묶어 표시하기 위한 그룹 구조
 */
interface MarkerGroup {
    key: string;
    lat: number;
    lng: number;
    isTravel: boolean;
    items: GeocodedMarker[];
}

// 주소-좌표 변환 성능을 위한 캐시 객체
const geocodeCache = new Map<string, { lat: number; lng: number }>();

/**
 * 일정 간의 경로를 그리는 폴리라인 컴포넌트
 */
const PolylineComponent = ({ positions, theme }: { positions: { lat: number; lng: number }[]; theme: string }) => {
    const map = useMap();
    useEffect(() => {
        if (!map || positions.length < 2) {
            return;
        }
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
    // 기본값은 컴팩트 핀 모드(호버/선택 시 라벨 확장)로 설정해 겹침을 방지
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null);
    const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);

    // 1. 일정 및 숙소 데이터를 좌표로 변환(Geocoding)하는 로직
    useEffect(() => {
        if (!geocodingLib) {
            return;
        }

        const geocoder = new geocodingLib.Geocoder();
        let isCancelled = false;

        const fetchCoordinates = async () => {
            setMarkers((prev) => {
                if (prev.length === 0) {
                    setIsLoading(true);
                }
                return prev;
            });
            const newMarkers: GeocodedMarker[] = [];
            const newPositions: { lat: number; lng: number }[] = [];

            const geocode = async (address: string): Promise<{ lat: number; lng: number } | null> => {
                if (geocodeCache.has(address)) {
                    return geocodeCache.get(address)!;
                }
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

            let pointSeq = 1;

            // 일정 데이터 처리
            for (const iti of itineraries) {
                if (isCancelled) {
                    break;
                }
                if (iti.type === '이동' && iti.address && iti.arrivalAddress) {
                    const startCoords = await geocode(iti.address);
                    const endCoords = await geocode(iti.arrivalAddress);
                    if (isCancelled) {
                        break;
                    }
                    if (startCoords && endCoords) {
                        newPositions.push(startCoords);
                        newPositions.push(endCoords);

                        const midLat = (startCoords.lat + endCoords.lat) / 2;
                        const midLng = (startCoords.lng + endCoords.lng) / 2;

                        const avgLat = midLat;
                        const latRad = (avgLat * Math.PI) / 180;
                        const dy = -(endCoords.lat - startCoords.lat) / Math.cos(latRad);
                        const dx = endCoords.lng - startCoords.lng;
                        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

                        if (angle > 90 || angle < -90) {
                            angle += 180;
                        }

                        newMarkers.push({
                            id: iti.id,
                            lat: midLat,
                            lng: midLng,
                            content: iti.content,
                            type: iti.type,
                            address: iti.address,
                            description: iti.description,
                            rotation: angle,
                            transportMode: iti.transportMode,
                            duration: iti.duration,
                            distance: iti.distance,
                            dayIndex: iti.dayIndex,
                            time: iti.time,
                        });
                    }
                } else if (iti.address || (typeof iti.lat === 'number' && typeof iti.lng === 'number')) {
                    const coords =
                        typeof iti.lat === 'number' && typeof iti.lng === 'number'
                            ? { lat: iti.lat, lng: iti.lng }
                            : await geocode(iti.address!);
                    if (isCancelled) {
                        break;
                    }
                    if (coords) {
                        newPositions.push(coords);
                        newMarkers.push({
                            id: iti.id,
                            lat: coords.lat,
                            lng: coords.lng,
                            content: iti.content,
                            type: iti.type,
                            address: iti.address || '',
                            description: iti.description,
                            dayIndex: iti.dayIndex,
                            time: iti.time,
                            seq: pointSeq++,
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
                if (isCancelled) {
                    break;
                }
                if (acc.address) {
                    const coords = await geocode(acc.address);
                    if (isCancelled) {
                        break;
                    }
                    if (coords) {
                        newMarkers.push({
                            id: acc.id,
                            lat: coords.lat,
                            lng: coords.lng,
                            content: `[${acc.dayIndex}일차 숙소] ${acc.name}`,
                            type: '숙소',
                            address: acc.address,
                            description: acc.description,
                            dayIndex: acc.dayIndex,
                        });
                    }
                }
            }

            if (!isCancelled) {
                setMarkers(newMarkers);
                setPositions(newPositions);

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
        return () => {
            isCancelled = true;
        };
    }, [itineraries, geocodingLib, map, selectedDay, accommodations]);

    // 2. 선택된 일정(selectedItineraryId)이 변경될 때 지도를 해당 위치로 이동
    useEffect(() => {
        if (!map || !selectedItineraryId || markers.length === 0) {
            return;
        }

        const target = markers.find((m) => m.id === selectedItineraryId);
        if (target) {
            map.panTo({ lat: target.lat, lng: target.lng });
            map.setZoom(16);
        }
    }, [map, selectedItineraryId, markers]);

    // 3. 동일/초근접 좌표(약 11m 반경) 마커를 그룹화하여 겹침 방지
    const markerGroups = useMemo<MarkerGroup[]>(() => {
        const mapByCoord = new Map<string, MarkerGroup>();

        for (const m of markers) {
            const isTravel = m.type === '이동';
            // 소수점 4자리(~11m) 기준으로 근접 좌표 그룹핑
            const coordKey = `${isTravel ? 'move' : 'pin'}:${m.lat.toFixed(4)}:${m.lng.toFixed(4)}`;
            const existing = mapByCoord.get(coordKey);
            if (existing) {
                existing.items.push(m);
            } else {
                mapByCoord.set(coordKey, {
                    key: coordKey,
                    lat: m.lat,
                    lng: m.lng,
                    isTravel,
                    items: [m],
                });
            }
        }

        return Array.from(mapByCoord.values());
    }, [markers]);

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
                    title="마커 라벨 전체 확장/축소 (축소 시에도 마커에 마우스를 올리면 제목이 표시됩니다)"
                >
                    {isExpanded ? (
                        <>
                            <Minimize2
                                size={16}
                                className="text-amber-600 dark:text-amber-400"
                            />
                            <span>라벨 축소</span>
                        </>
                    ) : (
                        <>
                            <Maximize2
                                size={16}
                                className="text-amber-600 dark:text-amber-400"
                            />
                            <span>라벨 전체 확장</span>
                        </>
                    )}
                </button>
            </div>

            {/* 그룹화된 마커 렌더링 */}
            {markerGroups.map((group) => {
                const selectedItem = group.items.find((item) => item.id === selectedItineraryId);
                const primary = selectedItem || group.items[0];
                const hasMultiple = group.items.length > 1;
                const isSelected = Boolean(selectedItem);
                const isHovered = hoveredGroupKey === group.key;
                const isPopoverOpen = openGroupKey === group.key && hasMultiple;
                const isAccommodation = primary.type === '숙소';
                const showLabel = isExpanded || isHovered || isSelected;

                const zIndex = isPopoverOpen ? 2000 : isHovered || isSelected ? 1500 : group.isTravel ? 400 : isAccommodation ? 500 : 100;

                const handleGroupClick = () => {
                    if (hasMultiple) {
                        setOpenGroupKey((prev) => (prev === group.key ? null : group.key));
                    } else {
                        setOpenGroupKey(null);
                        onMarkerClick?.(primary.id);
                    }
                };

                return (
                    <AdvancedMarker
                        key={group.key}
                        position={{ lat: group.lat, lng: group.lng }}
                        zIndex={zIndex}
                        onClick={handleGroupClick}
                    >
                        <div
                            className="relative"
                            onMouseEnter={() => setHoveredGroupKey(group.key)}
                            onMouseLeave={() => setHoveredGroupKey((prev) => (prev === group.key ? null : prev))}
                        >
                            {/* 겹친 일정 선택 팝오버 */}
                            {isPopoverOpen && (
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-w-[calc(100vw-3rem)] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-2xl p-2 z-[2100] animate-in fade-in zoom-in-95"
                                >
                                    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 dark:border-zinc-800 mb-1">
                                        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <Layers size={12} className="text-amber-500" />
                                            같은 위치 일정 ({group.items.length}건)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setOpenGroupKey(null)}
                                            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {group.items.map((item) => {
                                            const itemSelected = item.id === selectedItineraryId;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setOpenGroupKey(null);
                                                        onMarkerClick?.(item.id);
                                                    }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                                                        itemSelected
                                                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-bold'
                                                            : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200'
                                                    }`}
                                                >
                                                    <span className="shrink-0 mt-0.5">
                                                        {item.type === '숙소' ? '🏠' : getTypeEmoji(item.type as ItineraryType, item.transportMode)}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate font-semibold">{item.content}</div>
                                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                                            {item.dayIndex ? `${item.dayIndex}일차` : ''}
                                                            {item.time ? ` · ${item.time}` : ''}
                                                            {item.type === '이동' && item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {group.isTravel ? (
                                <div
                                    style={{
                                        transform: primary.rotation !== undefined && !isHovered && !isSelected ? `rotate(${primary.rotation}deg)` : 'none',
                                        whiteSpace: 'nowrap',
                                        transformOrigin: 'center center',
                                        marginTop: '-12px',
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 shadow-sm ${
                                        isSelected
                                            ? 'bg-amber-600 text-white scale-110'
                                            : theme === 'dark'
                                              ? 'bg-zinc-800/95 text-amber-400 border border-zinc-600 backdrop-blur-sm'
                                              : 'bg-white/95 text-amber-700 border border-amber-200 backdrop-blur-sm'
                                    }`}
                                >
                                    {primary.transportMode && <span>{getTransportInfo(primary.transportMode).emoji}</span>}
                                    {showLabel ? (
                                        <>
                                            {primary.distance && <span>{primary.distance}</span>}
                                            {primary.distance && primary.duration && <span>·</span>}
                                            <span>{formatDuration(primary.duration) || primary.content}</span>
                                        </>
                                    ) : (
                                        <span>{formatDuration(primary.duration) || primary.distance || '이동'}</span>
                                    )}
                                    {hasMultiple && (
                                        <span className="ml-0.5 px-1 py-0 rounded bg-amber-500 text-white text-[9px] font-extrabold">
                                            +{group.items.length - 1}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div
                                    style={{ width: showLabel ? 'max-content' : 'auto' }}
                                    className={`rounded-full shadow-lg text-xs font-bold border-2 transition-all flex items-center justify-center relative ${
                                        showLabel ? 'px-3 py-1.5 rounded-xl' : 'px-2 py-1 min-w-[36px] h-9'
                                    } ${
                                        isSelected
                                            ? isAccommodation
                                                ? 'bg-amber-600 text-white border-amber-800 scale-110'
                                                : theme === 'dark'
                                                  ? 'bg-amber-500 text-zinc-900 border-amber-700 scale-110'
                                                  : 'bg-amber-600 text-white border-amber-800 scale-110'
                                            : isAccommodation
                                              ? theme === 'dark'
                                                  ? 'bg-amber-900/90 text-amber-100 border-amber-700 hover:border-amber-400'
                                                  : 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500'
                                              : theme === 'dark'
                                                ? 'bg-zinc-800/95 text-zinc-100 border-zinc-600 hover:border-amber-400'
                                                : 'bg-white/95 text-gray-800 border-gray-300 hover:border-amber-500'
                                    }`}
                                >
                                    <span className={showLabel ? 'mr-1.5' : 'text-sm'}>
                                        {isAccommodation ? '🏠' : getTypeEmoji(primary.type as ItineraryType)}
                                    </span>
                                    {!showLabel && primary.seq !== undefined && (
                                        <span className="ml-0.5 text-[11px] font-extrabold">{primary.seq}</span>
                                    )}
                                    {showLabel && (
                                        <span>
                                            {primary.seq !== undefined ? `${primary.seq}. ` : ''}
                                            {primary.content}
                                        </span>
                                    )}
                                    {hasMultiple && (
                                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold leading-none">
                                            +{group.items.length - 1}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </AdvancedMarker>
                );
            })}

            {/* 경로 폴리라인 */}
            <PolylineComponent
                positions={positions}
                theme={theme}
            />

            {/* 선택된 일정 현지 내비게이션 바로 가기 플로팅 바 */}
            {selectedItineraryId &&
                (() => {
                    const selectedIti = itineraries.find((i) => i.id === selectedItineraryId);
                    if (!selectedIti) return null;
                    const navLinks = buildNavigationLinks(selectedIti);
                    if (navLinks.length === 0) return null;
                    const primary = navLinks[0];
                    const others = navLinks.slice(1);

                    return (
                        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-[1000] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                📍 {selectedIti.content}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <a
                                    href={primary.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                                >
                                    <Navigation size={12} />
                                    <span>{primary.label}</span>
                                    <ExternalLink size={11} />
                                </a>
                                {others.map((link) => (
                                    <a
                                        key={link.provider}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    );
                })()}
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
                renderingType="VECTOR"
                style={{ width: '100%', height: '100%' }}
            >
                <MapInner {...props} />
            </GoogleMap>
        </div>
    );
};

/**
 * 종료된 여행에서 불필요한 Google Maps API/타일 트래픽을 줄이기 위한 지연 로드 플레이스홀더입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 26.
 */
export const CompletedMapPlaceholder: React.FC<{ onLoadMap: () => void }> = ({ onLoadMap }) => (
    <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-gray-900/60">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
            <MapPin size={24} />
        </div>
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">종료된 여행입니다</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-4 leading-relaxed">
            외부 지도 API 트래픽 절약을 위해 지도를 자동으로 불러오지 않았습니다. 필요 시 아래 버튼을 눌러 지도를 확인하세요.
        </p>
        <button
            type="button"
            onClick={onLoadMap}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
        >
            지도 불러오기
        </button>
    </div>
);

export default GoogleMapView;
