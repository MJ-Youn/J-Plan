import { differenceInDays, format, parseISO, subYears } from 'date-fns';

export interface DailyWeatherInfo {
    date: string; // YYYY-MM-DD
    weatherCode: number;
    emoji: string;
    label: string;
    tempMax: number;
    tempMin: number;
    precipProb?: number;
    isHistoricalRef?: boolean; // 16일 이후 일정일 때 작년 동기간 참고 여부
}

const weatherCache = new Map<string, DailyWeatherInfo[]>();

/**
 * WMO Weather interpretation code를 이모지와 한국어 설명으로 변환합니다.
 */
export function describeWmoCode(code: number): { emoji: string; label: string } {
    if (code === 0) return { emoji: '☀️', label: '맑음' };
    if (code <= 2) return { emoji: '🌤️', label: '구름 조금' };
    if (code === 3) return { emoji: '☁️', label: '흐림' };
    if (code === 45 || code === 48) return { emoji: '🌫️', label: '안개' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', label: '비' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '❄️', label: '눈' };
    if (code >= 95) return { emoji: '⛈️', label: '뇌우' };
    return { emoji: '🌤️', label: '보통' };
}

/**
 * Open-Meteo 무료 API(API 키 불필요)를 사용해 여행 기간의 일별 날씨를 조회합니다.
 * - 출발 16일 이내: 실시간 예보(Forecast API)
 * - 출발 16일 이후: 작년 동일 기간 기온(Archive API) 참고 데이터 제공
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export async function fetchTravelWeather(params: {
    lat: number;
    lng: number;
    startDate: string;
    endDate: string;
}): Promise<DailyWeatherInfo[]> {
    const { lat, lng, startDate, endDate } = params;
    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}:${startDate}:${endDate}`;
    if (weatherCache.has(cacheKey)) {
        return weatherCache.get(cacheKey)!;
    }

    const today = new Date();
    const endDt = parseISO(endDate);
    const daysUntilEnd = differenceInDays(endDt, today);

    // 16일 예보 범위 내인지 확인
    const isForecastRange = daysUntilEnd <= 15 && daysUntilEnd >= -1;

    try {
        if (isForecastRange) {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            const daily = data.daily;
            if (!daily?.time) return [];

            const list: DailyWeatherInfo[] = daily.time.map((dateStr: string, idx: number) => {
                const code = Number(daily.weathercode?.[idx] ?? 0);
                const desc = describeWmoCode(code);
                return {
                    date: dateStr,
                    weatherCode: code,
                    emoji: desc.emoji,
                    label: desc.label,
                    tempMax: Math.round(Number(daily.temperature_2m_max?.[idx] ?? 0)),
                    tempMin: Math.round(Number(daily.temperature_2m_min?.[idx] ?? 0)),
                    precipProb: typeof daily.precipitation_probability_max?.[idx] === 'number'
                        ? Math.round(daily.precipitation_probability_max[idx])
                        : undefined,
                    isHistoricalRef: false,
                };
            });

            weatherCache.set(cacheKey, list);
            return list;
        } else {
            // 16일 이후 일정은 작년 동일 기간 실제 날씨를 참고용으로 조회
            const prevStart = format(subYears(parseISO(startDate), 1), 'yyyy-MM-dd');
            const prevEnd = format(subYears(parseISO(endDate), 1), 'yyyy-MM-dd');
            const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${prevStart}&end_date=${prevEnd}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            const daily = data.daily;
            if (!daily?.time) return [];

            const list: DailyWeatherInfo[] = daily.time.map((dateStr: string, idx: number) => {
                const code = Number(daily.weathercode?.[idx] ?? 0);
                const desc = describeWmoCode(code);
                return {
                    date: dateStr,
                    weatherCode: code,
                    emoji: desc.emoji,
                    label: desc.label,
                    tempMax: Math.round(Number(daily.temperature_2m_max?.[idx] ?? 0)),
                    tempMin: Math.round(Number(daily.temperature_2m_min?.[idx] ?? 0)),
                    isHistoricalRef: true,
                };
            });

            weatherCache.set(cacheKey, list);
            return list;
        }
    } catch (err) {
        console.warn('[WeatherService] Failed to fetch Open-Meteo weather:', err);
        return [];
    }
}
