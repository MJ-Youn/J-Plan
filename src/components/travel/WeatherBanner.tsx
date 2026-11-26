import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { CloudSun, Database } from 'lucide-react';
import type { Accommodation, Itinerary, StoredDayWeather, Travel } from '../../types/travel';
import { fetchTravelWeather, isTravelCompleted } from '../../utils/weatherService';

interface WeatherBannerProps {
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    selectedDay: number | 'all';
    onSaveWeatherSnapshot?: (snapshot: NonNullable<Travel['weatherSnapshot']>) => Promise<void> | void;
}

const geoCoordCache = new Map<string, { lat: number; lng: number }>();

/**
 * Open-Meteo 무료 API를 활용해 각 일차의 숙소 위치를 기준으로 일별 날씨를 표시하는 위젯입니다.
 * 종료된 여행은 DB 스냅샷을 우선 조회하여 불필요한 외부 API 트래픽을 줄입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const WeatherBanner: React.FC<WeatherBannerProps> = ({
    travel,
    itineraries,
    accommodations,
    selectedDay,
    onSaveWeatherSnapshot,
}) => {
    const geocodingLib = useMapsLibrary('geocoding');
    const [weatherList, setWeatherList] = useState<StoredDayWeather[]>([]);
    const [isFromDb, setIsFromDb] = useState(false);

    const savedSnapshotRef = useRef(travel.weatherSnapshot);
    savedSnapshotRef.current = travel.weatherSnapshot;
    const onSaveRef = useRef(onSaveWeatherSnapshot);
    onSaveRef.current = onSaveWeatherSnapshot;

    useEffect(() => {
        let cancelled = false;
        const isCompleted = isTravelCompleted(travel.endDate);
        const savedItems = savedSnapshotRef.current?.items;

        // 종료된 여행이고 DB에 날씨 스냅샷이 이미 있으면 외부 API 호출 없이 즉시 사용
        if (isCompleted && savedItems && savedItems.length > 0) {
            setWeatherList(savedItems);
            setIsFromDb(true);
            return;
        }

        const geocodeAddress = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
            const key = addr.trim();
            if (!key) return null;
            if (geoCoordCache.has(key)) return geoCoordCache.get(key)!;
            if (!geocodingLib) return null;

            try {
                const geocoder = new geocodingLib.Geocoder();
                const res = await geocoder.geocode({ address: key, language: 'ko' });
                if (res.results?.[0]) {
                    const loc = res.results[0].geometry.location;
                    const coords = { lat: loc.lat(), lng: loc.lng() };
                    geoCoordCache.set(key, coords);
                    return coords;
                }
            } catch {
                // 지오코딩 실패 시 무시
            }
            return null;
        };

        const loadWeather = async () => {
            const baseDate = parseISO(travel.startDate);
            const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), baseDate) + 1);
            const results: StoredDayWeather[] = [];

            for (let dayIndex = 1; dayIndex <= totalDays; dayIndex++) {
                if (cancelled) return;

                const dayDate = format(addDays(baseDate, dayIndex - 1), 'yyyy-MM-dd');
                const ownAcc = accommodations.find((a) => a.dayIndex === dayIndex);
                const prevAcc = dayIndex === totalDays ? accommodations.find((a) => a.dayIndex === dayIndex - 1) : undefined;
                const targetAcc = ownAcc || prevAcc;

                let lat: number | undefined;
                let lng: number | undefined;
                let placeLabel = '';

                if (targetAcc) {
                    placeLabel = targetAcc.name;
                    const addrQuery = targetAcc.address?.trim() || targetAcc.name;
                    const coords = await geocodeAddress(addrQuery);
                    if (coords) {
                        lat = coords.lat;
                        lng = coords.lng;
                    }
                }

                if (lat === undefined || lng === undefined) {
                    const dayIti = itineraries.find(
                        (i) => i.dayIndex === dayIndex && typeof i.lat === 'number' && typeof i.lng === 'number',
                    );
                    if (dayIti) {
                        lat = dayIti.lat;
                        lng = dayIti.lng;
                        placeLabel = placeLabel || dayIti.content;
                    }
                }

                if (lat === undefined || lng === undefined) {
                    const fallbackQuery = travel.region?.trim() || travel.name;
                    if (fallbackQuery) {
                        const coords = await geocodeAddress(fallbackQuery);
                        if (coords) {
                            lat = coords.lat;
                            lng = coords.lng;
                            placeLabel = placeLabel || fallbackQuery;
                        }
                    }
                }

                if (lat !== undefined && lng !== undefined) {
                    const dayRes = await fetchTravelWeather({
                        lat,
                        lng,
                        startDate: dayDate,
                        endDate: dayDate,
                    });
                    if (dayRes[0]) {
                        results.push({
                            ...dayRes[0],
                            dayIndex,
                            placeLabel: placeLabel || `${dayIndex}일차`,
                        });
                    }
                }
            }

            if (!cancelled) {
                if (results.length > 0) {
                    setWeatherList(results);
                    setIsFromDb(false);

                    // 종료 전 여행이거나 최초 1회 조회 시 DB 스냅샷 갱신
                    if (onSaveRef.current) {
                        const prevJson = savedSnapshotRef.current?.items ? JSON.stringify(savedSnapshotRef.current.items) : '';
                        const nextJson = JSON.stringify(results);
                        if (prevJson !== nextJson) {
                            void Promise.resolve(
                                onSaveRef.current({
                                    items: results,
                                    updatedAt: new Date().toISOString(),
                                }),
                            ).catch((err) => console.warn('[WeatherBanner] Failed to save weather snapshot:', err));
                        }
                    }
                } else if (savedItems && savedItems.length > 0) {
                    // API 조회 실패 시 기존 DB 스냅샷 fallback
                    setWeatherList(savedItems);
                    setIsFromDb(true);
                }
            }
        };

        void loadWeather();
        return () => {
            cancelled = true;
        };
    }, [travel.id, travel.region, travel.name, travel.startDate, travel.endDate, itineraries, accommodations, geocodingLib]);

    if (weatherList.length === 0) {
        return null;
    }

    const isHistorical = weatherList[0]?.isHistoricalRef;
    const formatShortDate = (dateStr: string) => {
        try {
            return format(parseISO(dateStr), 'MM/dd');
        } catch {
            return dateStr.slice(5).replace('-', '/');
        }
    };

    if (selectedDay !== 'all') {
        const dayWeather = weatherList.find((w) => w.dayIndex === selectedDay);
        if (!dayWeather) return null;
        return (
            <div
                className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 rounded-2xl sm:rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/50 text-xs text-sky-900 dark:text-sky-200 max-w-full"
                title={`기준 위치: ${dayWeather.placeLabel}`}
            >
                <span className="font-bold text-sky-700 dark:text-sky-400 shrink-0">
                    {dayWeather.dayIndex}일차({formatShortDate(dayWeather.date)})
                </span>
                <span className="shrink-0">{dayWeather.emoji}</span>
                <span className="font-bold truncate max-w-[140px] sm:max-w-[180px]">{dayWeather.placeLabel}</span>
                <span className="whitespace-nowrap">
                    {dayWeather.label} {dayWeather.tempMin}°~{dayWeather.tempMax}°
                </span>
                {typeof dayWeather.precipProb === 'number' && (
                    <span className="text-sky-600 dark:text-sky-400 font-medium whitespace-nowrap">강수 {dayWeather.precipProb}%</span>
                )}
                {isHistorical && <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80 whitespace-nowrap">(작년 참고)</span>}
                {isFromDb && (
                    <span
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold whitespace-nowrap"
                        title="DB에 저장된 날씨 정보를 불러왔습니다"
                    >
                        <Database size={10} />
                        DB 저장
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:overflow-x-auto pb-0.5 scrollbar-none">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 shrink-0 mr-1 whitespace-nowrap">
                <CloudSun size={14} />
                {isHistorical ? '작년 기온:' : '숙소 기준 날씨:'}
                {isFromDb && (
                    <span
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold"
                        title="DB에 저장된 날씨 정보를 불러왔습니다"
                    >
                        <Database size={10} />
                        DB 저장
                    </span>
                )}
            </span>
            {weatherList.map((w) => (
                <div
                    key={w.dayIndex}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50/90 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/40 text-[11px] text-sky-900 dark:text-sky-200 whitespace-nowrap shrink-0"
                    title={`${w.dayIndex}일차(${formatShortDate(w.date)}) · ${w.placeLabel} · ${w.label} (${w.tempMin}°C ~ ${w.tempMax}°C)`}
                >
                    <span className="font-bold text-sky-700 dark:text-sky-400">
                        {w.dayIndex}일차({formatShortDate(w.date)})
                    </span>
                    <span>{w.emoji}</span>
                    <span>
                        {w.tempMin}°/{w.tempMax}°
                    </span>
                </div>
            ))}
        </div>
    );
};

export default WeatherBanner;
