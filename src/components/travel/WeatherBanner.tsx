import React, { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { CloudSun } from 'lucide-react';
import type { Accommodation, Itinerary, Travel } from '../../types/travel';
import { fetchTravelWeather, type DailyWeatherInfo } from '../../utils/weatherService';

interface WeatherBannerProps {
    travel: Travel;
    itineraries: Itinerary[];
    accommodations: Accommodation[];
    selectedDay: number | 'all';
}

interface DayWeatherWithPlace extends DailyWeatherInfo {
    dayIndex: number;
    placeLabel: string;
}

const geoCoordCache = new Map<string, { lat: number; lng: number }>();

/**
 * Open-Meteo 무료 API를 활용해 각 일차의 숙소 위치를 기준으로 일별 날씨를 표시하는 위젯입니다.
 * 마지막 날(귀국/귀가일)은 전날 밤 숙소(또는 당일 첫 관광지)를 기준으로 조회합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const WeatherBanner: React.FC<WeatherBannerProps> = ({ travel, itineraries, accommodations, selectedDay }) => {
    const geocodingLib = useMapsLibrary('geocoding');
    const [weatherList, setWeatherList] = useState<DayWeatherWithPlace[]>([]);

    useEffect(() => {
        let cancelled = false;

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
            const results: DayWeatherWithPlace[] = [];

            // 동일 좌표 구간은 묶지 않고 일차별 숙소 기준으로 조회 (캐시로 중복 호출 방지)
            for (let dayIndex = 1; dayIndex <= totalDays; dayIndex++) {
                if (cancelled) return;

                const dayDate = format(addDays(baseDate, dayIndex - 1), 'yyyy-MM-dd');
                // 1순위: 해당 일차 숙소, 2순위(마지막 날): 전날 숙소, 3순위: 당일 관광/식사 일정, 4순위: 여행 지역
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
                setWeatherList(results);
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

    if (selectedDay !== 'all') {
        const dayWeather = weatherList.find((w) => w.dayIndex === selectedDay);
        if (!dayWeather) return null;
        return (
            <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/50 text-xs text-sky-900 dark:text-sky-200 shrink-0 max-w-full"
                title={`기준 위치: ${dayWeather.placeLabel}`}
            >
                <span>{dayWeather.emoji}</span>
                <span className="font-bold truncate max-w-[140px]">{dayWeather.placeLabel}</span>
                <span>
                    {dayWeather.label} {dayWeather.tempMin}°~{dayWeather.tempMax}°
                </span>
                {typeof dayWeather.precipProb === 'number' && (
                    <span className="text-sky-600 dark:text-sky-400 font-medium">강수 {dayWeather.precipProb}%</span>
                )}
                {isHistorical && <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80">(작년 참고)</span>}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 shrink-0 mr-1">
                <CloudSun size={14} />
                {isHistorical ? '작년 기온:' : '숙소 기준 날씨:'}
            </span>
            {weatherList.map((w) => (
                <div
                    key={w.dayIndex}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50/90 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/40 text-[11px] text-sky-900 dark:text-sky-200 whitespace-nowrap shrink-0"
                    title={`${w.dayIndex}일차 (${w.placeLabel}) · ${w.label} (${w.tempMin}°C ~ ${w.tempMax}°C)`}
                >
                    <span className="font-bold text-sky-700 dark:text-sky-400">{w.dayIndex}일</span>
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
