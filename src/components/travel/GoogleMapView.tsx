import React, { useEffect, useState } from 'react';
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { Itinerary, ItineraryType, Accommodation } from '../../types/travel';
import { getTypeEmoji } from '../../types/travel';
import { useThemeStore } from '../../store/themeStore';

interface Props {
  itineraries: Itinerary[];
  accommodations?: Accommodation[];
  selectedDay?: number | 'all';
  selectedItineraryId: string | null;
  onMarkerClick?: (id: string) => void;
}

interface GeocodedMarker {
  id: string;
  lat: number;
  lng: number;
  content: string;
  type: ItineraryType | '숙소';
  address: string;
  description?: string;
}

const geocodeCache = new Map<string, { lat: number, lng: number }>();

const PolylineComponent = ({ positions, theme }: { positions: {lat: number, lng: number}[], theme: string }) => {
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

const MapInner: React.FC<Props> = ({ itineraries, accommodations, selectedDay, selectedItineraryId, onMarkerClick }) => {
  const { theme } = useThemeStore();
  const map = useMap();
  const geocodingLib = useMapsLibrary('geocoding');
  
  const [markers, setMarkers] = useState<GeocodedMarker[]>([]);
  const [positions, setPositions] = useState<{lat: number, lng: number}[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (!geocodingLib) return;
    
    const geocoder = new geocodingLib.Geocoder();
    let isCancelled = false;

    const fetchCoordinates = async () => {
      setIsLoading(true);
      const newMarkers: GeocodedMarker[] = [];
      const newPositions: {lat: number, lng: number}[] = [];
      
      const geocode = async (address: string): Promise<{lat: number, lng: number} | null> => {
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
          console.error('Google Geocode error for:', address, error);
        }
        return null;
      };

      for (const iti of itineraries) {
        if (isCancelled) break;

        if (iti.type === '이동' && iti.address && iti.arrivalAddress) {
          const startCoords = await geocode(iti.address);
          if (isCancelled) break;
          const endCoords = await geocode(iti.arrivalAddress);
          if (isCancelled) break;

          if (startCoords && endCoords) {
            newPositions.push(startCoords);
            newPositions.push(endCoords);
            newMarkers.push({
              id: iti.id,
              lat: (startCoords.lat + endCoords.lat) / 2,
              lng: (startCoords.lng + endCoords.lng) / 2,
              content: iti.content,
              type: iti.type,
              address: `${iti.address} ➔ ${iti.arrivalAddress}`,
              description: iti.description
            });
          }
        } else if (iti.address) {
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
              description: iti.description
            });
          }
        }
      }

      // 2. 숙소 데이터 처리
      let filteredAccommodations: Accommodation[] = [];
      if (accommodations && selectedDay !== undefined) {
        if (selectedDay === 'all') {
          filteredAccommodations = accommodations;
        } else {
          filteredAccommodations = accommodations.filter(a => a.dayIndex === selectedDay || a.dayIndex === selectedDay - 1);
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
              description: acc.description
            });
          }
        }
      }

      if (!isCancelled) {
        setMarkers(newMarkers);
        setPositions(newPositions);
        
        if (map && newMarkers.length > 0) {
          if (selectedItineraryId) {
            const target = newMarkers.find(m => m.id === selectedItineraryId);
            if (target) {
              map.panTo({ lat: target.lat, lng: target.lng });
              map.setZoom(16);
            }
          } else {
            const bounds = new google.maps.LatLngBounds();
            newMarkers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));
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
  }, [itineraries, geocodingLib, map, selectedItineraryId]);

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm transition-all duration-300">
          <div className="w-12 h-12 border-4 border-amber-200 dark:border-zinc-700 border-t-amber-600 dark:border-t-amber-400 rounded-full animate-spin"></div>
          <p className="mt-4 font-semibold text-amber-700 dark:text-amber-400 text-sm animate-pulse">
            지도 데이터를 불러오는 중입니다...
          </p>
        </div>
      )}
      
      {/* 마커 접기/펼치기 토글 버튼 */}
      <div className="absolute top-4 right-4 z-[1000]">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 text-sm font-semibold transition hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {isExpanded ? '마커 축소' : '마커 확장'}
        </button>
      </div>

      {markers.map((marker) => {
        const isSelected = marker.id === selectedItineraryId;
        const isAccommodation = marker.type === '숙소';
        
        return (
          <AdvancedMarker 
            key={marker.id} 
            position={{ lat: marker.lat, lng: marker.lng }}
            zIndex={isSelected ? 1000 : (isAccommodation ? 500 : 1)}
            onClick={() => onMarkerClick && onMarkerClick(marker.id)}
          >
            <div 
              style={{ width: isExpanded ? 'max-content' : '40px' }}
              className={`rounded-xl shadow-lg text-sm font-bold border-2 transition-all flex items-center justify-center ${
                isExpanded ? 'px-3 py-1.5' : 'w-10 h-10 !rounded-full'
              } ${
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

      <PolylineComponent positions={positions} theme={theme} />
    </>
  );
};

const GoogleMapView: React.FC<Props> = (props) => {
  const { theme } = useThemeStore();
  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Google Maps built-in color scheme (v3.56+) 
  // mapId="DEMO_MAP_ID" (vector map)를 사용할 때 styles 대신 colorScheme를 통해 다크 모드를 완벽 지원합니다.
  const mapColorScheme = theme === 'dark' ? 'DARK' : 'LIGHT';

  if (!API_KEY) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl p-6 text-center">
        <p className="font-bold mb-2 text-lg">Google Maps API Key가 필요합니다.</p>
        <p className="text-sm"><code>.env.local</code> 파일에 <code>VITE_GOOGLE_MAPS_API_KEY</code>를 설정해주세요.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative z-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900">
      <APIProvider apiKey={API_KEY}>
        <GoogleMap
          defaultCenter={{ lat: 37.5665, lng: 126.9780 }}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          disableDefaultUI={true}
          colorScheme={mapColorScheme}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          <MapInner {...props} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
};

export default GoogleMapView;
