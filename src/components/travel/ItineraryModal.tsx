import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTravelStore } from '../../store/travelStore';
import { differenceInDays, parseISO } from 'date-fns';
import { useModal } from '../../hooks/useModal';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { TransportMode, Itinerary, ItineraryType } from '../../types/travel';

/**
 * 일정 추가 및 수정을 위한 모달 컴포넌트입니다.
 * 
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
    travelId: string;
    editTarget?: Itinerary | null;
    defaultData?: Partial<Itinerary> | null;
}

const ItineraryModal: React.FC<Props> = ({ isOpen, onClose, travelId, editTarget, defaultData }) => {
    const { travels, addItinerary, updateItinerary } = useTravelStore();
    const travel = travels.find((t) => t.id === travelId);
    const { handleDragStart, modalStyle } = useModal(isOpen, onClose);

    const totalDays = travel ? differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1 : 1;

    const [type, setType] = useState<ItineraryType | ''>('');
    const [dayIndex, setDayIndex] = useState<number | ''>('');
    const [time, setTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [content, setContent] = useState('');
    const [address, setAddress] = useState('');
    const [arrivalAddress, setArrivalAddress] = useState('');
    const [description, setDescription] = useState('');
    const [transportMode, setTransportMode] = useState<TransportMode | ''>('');
    const [duration, setDuration] = useState('');
    const [distance, setDistance] = useState('');
    const [isCalculating, setIsCalculating] = useState(false);

    const routesLib = useMapsLibrary('routes');
    const geocodingLib = useMapsLibrary('geocoding');

    useEffect(() => {
        if (isOpen) {
            if (editTarget) {
                setType(editTarget.type);
                setDayIndex(editTarget.dayIndex);
                setTime(editTarget.time);
                setEndTime(editTarget.endTime || '');
                setContent(editTarget.content);
                setAddress(editTarget.address);
                setArrivalAddress(editTarget.arrivalAddress || '');
                setDescription(editTarget.description);
                setTransportMode(editTarget.transportMode || '');
                setDuration(editTarget.duration || '');
                setDistance(editTarget.distance || '');
            } else if (defaultData) {
                // drag-to-add 등에 의한 기본값
                setType(defaultData.type || '');
                setDayIndex(defaultData.dayIndex ?? '');
                setTime(defaultData.time || '');
                setEndTime(defaultData.endTime || '');
                setContent(defaultData.content || '');
                setAddress(defaultData.address || '');
                setArrivalAddress(defaultData.arrivalAddress || '');
                setDescription(defaultData.description || '');
                setTransportMode(defaultData.transportMode || '');
                setDuration(defaultData.duration || '');
                setDistance(defaultData.distance || '');
            } else {
                // 완전히 초기화
                setType('');
                setDayIndex('');
                setTime('');
                setEndTime('');
                setContent('');
                setAddress('');
                setArrivalAddress('');
                setDescription('');
                setTransportMode('');
                setDuration('');
                setDistance('');
            }
        }
    }, [editTarget, defaultData, isOpen]);

    // 이동 소요 시간 자동 계산
    useEffect(() => {
        if (type === '이동' && address && arrivalAddress && transportMode && routesLib) {
            if (transportMode === 'TRAIN' || transportMode === 'FLIGHT') {
                return;
            }
            const timer = setTimeout(() => {
                calculateDuration();
            }, 800); // 디바운스 적용
            return () => clearTimeout(timer);
        }
    }, [address, arrivalAddress, transportMode, type, routesLib]);

    const calculateDuration = async () => {
        if (!routesLib || !geocodingLib || !address || !arrivalAddress || !transportMode) {
            return;
        }
        setIsCalculating(true);

        try {
            const geocoder = new geocodingLib.Geocoder();

            // 1. 출발지/도착지 좌표 및 국가 정보 조회 (병렬 처리)
            const [originRes, destRes] = await Promise.all([geocoder.geocode({ address, language: 'ko' }), geocoder.geocode({ address: arrivalAddress, language: 'ko' })]);

            if (!originRes.results?.[0] || !destRes.results?.[0]) {
                setDuration('위치 찾을 수 없음');
                return;
            }

            const isKR = (res: google.maps.GeocoderResponse) => res.results[0].address_components.some((c) => c.types.includes('country') && c.short_name === 'KR');

            const startLoc = originRes.results[0].geometry.location;
            const endLoc = destRes.results[0].geometry.location;
            const originStr = `${startLoc.lng()},${startLoc.lat()}`;
            const destStr = `${endLoc.lng()},${endLoc.lat()}`;

            // 2. 한국 여부에 따른 분기 처리
            if (isKR(originRes) && isKR(destRes) && (transportMode === 'DRIVING' || transportMode === 'WALKING' || transportMode === 'BICYCLING')) {
                // [한국 - 자동차/도보/자전거] Kakao Mobility 호출
                const KAKAO_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;
                let data;

                if (import.meta.env.DEV && KAKAO_KEY) {
                    // 로컬 개발 환경: 프록시 없이 직접 호출 (Vite의 functions 인식 문제 해결)
                    const res = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${originStr}&destination=${destStr}`, {
                        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
                    });
                    if (!res.ok) {
                        throw new Error('Kakao Direct API Error');
                    }
                    data = await res.json();
                } else {
                    // 운영 환경: Cloudflare Worker 프록시 경유
                    const res = await fetch(`/api/geo/kakao-directions?origin=${originStr}&destination=${destStr}`);
                    if (!res.ok) {
                        throw new Error('Kakao Proxy Error');
                    }
                    data = await res.json();
                }

                if (data.routes && data.routes[0]) {
                    const summary = data.routes[0].summary;
                    const distanceMeters = summary.distance; // 미터 단위
                    const distanceText = distanceMeters < 1000 ? `${distanceMeters}m` : `${(distanceMeters / 1000).toFixed(1)}km`;
                    setDistance(distanceText);

                    if (transportMode === 'DRIVING') {
                        // 자동차는 Kakao가 주는 duration(초) 사용
                        const mins = Math.round(summary.duration / 60);
                        setDuration(mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`);
                    } else if (transportMode === 'WALKING') {
                        // 도보는 도로 거리 기준 분당 80m 계산 (4.8km/h)
                        const mins = Math.round(distanceMeters / 80);
                        setDuration(mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`);
                    } else if (transportMode === 'BICYCLING') {
                        // 자전거는 도로 거리 기준 분당 250m 계산 (15km/h)
                        const mins = Math.round(distanceMeters / 250);
                        setDuration(mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`);
                    }
                } else {
                    setDuration('경로 찾을 수 없음');
                    setDistance('');
                }
            } else {
                // [해외 또는 대중교통] 기존 Google Distance Matrix 사용
                const service = new routesLib.DistanceMatrixService();
                const response = await service.getDistanceMatrix({
                    origins: [startLoc],
                    destinations: [endLoc],
                    travelMode: google.maps.TravelMode[transportMode as keyof typeof google.maps.TravelMode],
                });

                const element = response.rows[0].elements[0];
                if (element.status === 'OK') {
                    let durationText = element.duration.text;
                    // 영문을 한글로 번역 (hour -> 시간, min -> 분, day -> 일)
                    durationText = durationText.replace(/hours?/g, '시간').replace(/mins?/g, '분').replace(/days?/g, '일').replace(/\s+/g, ' ').trim();
                    setDuration(durationText);
                    setDistance(element.distance.text);
                } else if (element.status === 'ZERO_RESULTS') {
                    setDuration('경로 찾을 수 없음');
                    setDistance('');
                } else {
                    setDuration('계산 실패');
                    setDistance('');
                }
            }
        } catch (error) {
            console.error('[ItineraryModal] calculateDuration failed:', error);
            setDuration('연동 오류');
            setDistance('');
        } finally {
            setIsCalculating(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent, keepOpen: boolean) => {
        e.preventDefault();
        if (!type || !dayIndex || !time || !content) {
            return alert('필수 항목을 모두 입력해주세요.');
        }
        if (type === '이동' && (!address || !arrivalAddress)) {
            return alert('이동일 경우 출발 위치와 도착 위치를 모두 입력해야 합니다.');
        }

        if (editTarget) {
            updateItinerary(editTarget.id, {
                type: type as ItineraryType,
                dayIndex: Number(dayIndex),
                time,
                endTime,
                content,
                address,
                arrivalAddress,
                description,
                transportMode: type === '이동' && transportMode ? (transportMode as TransportMode) : undefined,
                duration: type === '이동' && transportMode ? duration : undefined,
                distance: type === '이동' && transportMode ? distance : undefined,
            });
            onClose();
        } else {
            addItinerary({
                travelId,
                type: type as ItineraryType,
                dayIndex: Number(dayIndex),
                time,
                endTime,
                content,
                address,
                arrivalAddress,
                description,
                transportMode: type === '이동' && transportMode ? (transportMode as TransportMode) : undefined,
                duration: type === '이동' && transportMode ? duration : undefined,
                distance: type === '이동' && transportMode ? distance : undefined,
            });
            // 저장 후 계속 추가할 때 시간 외 모든 정보 초기화
            setContent('');
            setAddress('');
            setArrivalAddress('');
            setDescription('');
            setType('');
            if (!keepOpen) {
                onClose();
            }
        }
    };

    const handleClose = () => {
        if (!editTarget) {
            setType('');
            setDayIndex('');
            setTime('');
            setEndTime('');
            setContent('');
            setAddress('');
            setArrivalAddress('');
            setDescription('');
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4">
            <div
                data-modal-container
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden"
                style={modalStyle}
            >
                {/* 드래그 가능한 헤더 */}
                <div
                    className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleDragStart}
                >
                    <h3 className="font-bold text-lg">{editTarget ? '일정 수정' : '새 일정 추가'}</h3>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>
                <form className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1 font-medium">일정 종류 *</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as ItineraryType)}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    종류 선택
                                </option>
                                <option value="이동">이동</option>
                                <option value="관광">관광</option>
                                <option value="식사">식사</option>
                                <option value="기타">기타</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm mb-1 font-medium">날짜 선택 (일차) *</label>
                            <select
                                value={dayIndex}
                                onChange={(e) => setDayIndex(Number(e.target.value))}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    일차 선택
                                </option>
                                {Array.from({ length: totalDays }).map((_, i) => (
                                    <option
                                        key={i + 1}
                                        value={i + 1}
                                    >
                                        {i + 1}일차
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1 font-medium">시작 시간 *</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                required
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-1 font-medium text-gray-500">종료 시간 (선택)</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1 font-medium">내용 *</label>
                        <input
                            type="text"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            required
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                    </div>

                    {type === '이동' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm mb-1 font-medium">출발 위치 *</label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    required
                                    placeholder="출발지 이름이나 주소"
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 font-medium">도착 위치 *</label>
                                <input
                                    type="text"
                                    value={arrivalAddress}
                                    onChange={(e) => setArrivalAddress(e.target.value)}
                                    required
                                    placeholder="도착지 이름이나 주소"
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm mb-1 font-medium">장소 / 주소 (선택)</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="지도 검색을 위한 주소"
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                    )}

                    {type === '이동' && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold text-blue-800 dark:text-blue-300">이동 옵션</label>
                                {isCalculating && <span className="text-[10px] animate-pulse text-blue-600">계산 중...</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] mb-1 opacity-70">이동 수단</label>
                                    <select
                                        value={transportMode}
                                        onChange={(e) => setTransportMode(e.target.value as TransportMode | '')}
                                        className="w-full p-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">선택 안함</option>
                                        <option value="DRIVING">🚗 자동차</option>
                                        <option value="TRANSIT">🚌 대중교통</option>
                                        <option value="WALKING">🚶 도보</option>
                                        <option value="BICYCLING">🚲 자전거</option>
                                        <option value="TRAIN">🚆 기차</option>
                                        <option value="FLIGHT">✈️ 비행기</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] mb-1 opacity-70">
                                        예상 소요 시간 / 거리
                                        {(transportMode === 'TRAIN' || transportMode === 'FLIGHT') && <span className="text-amber-500 ml-1">(수기 입력)</span>}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={duration}
                                            onChange={(e) => setDuration(e.target.value)}
                                            placeholder="시간 (예: 2시간)"
                                            className="w-full p-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={distance}
                                            onChange={(e) => setDistance(e.target.value)}
                                            placeholder="거리 (예: 300km)"
                                            className="w-24 p-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm mb-1 font-medium">상세 설명 (선택)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                        ></textarea>
                    </div>
                    <div className="pt-2 flex justify-end space-x-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
                        >
                            취소
                        </button>
                        {!editTarget && (
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                className="px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-800/50 rounded-lg font-medium transition-colors"
                            >
                                저장 후 계속
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => handleSubmit(e, false)}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                        >
                            {editTarget ? '수정하기' : '저장 닫기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ItineraryModal;
