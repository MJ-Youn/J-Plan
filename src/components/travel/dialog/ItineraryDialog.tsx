import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTravelStore } from '../../../store/travelStore';
import { differenceInDays, parseISO } from 'date-fns';
import { useDialog } from '../../../hooks/useDialog';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { calculateRouteInfo } from '../../../utils/routeCalculator';
import { EXPENSE_CATEGORIES, getItineraryCosts, mapItineraryTypeToExpenseCategory } from '../../../utils/expenseService';
import type { TransportMode, Itinerary, ItineraryType, ExpenseCurrency, ExpenseCategory, ItineraryCostItem } from '../../../types/travel';

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

const CURRENCIES: ExpenseCurrency[] = ['KRW', 'JPY', 'USD', 'EUR', 'TWD', 'THB', 'VND'];

const ItineraryDialog: React.FC<Props> = (props) => {
    if (!props.isOpen) {
        return null;
    }

    const modalKey = props.editTarget?.id ?? (props.defaultData ? `draft-${props.defaultData.dayIndex ?? ''}-${props.defaultData.time ?? ''}` : 'new');
    return <ItineraryDialogContent key={modalKey} {...props} />;
};

const ItineraryDialogContent: React.FC<Props> = ({ isOpen, onClose, travelId, editTarget, defaultData }) => {
    const { travels, participants, addItinerary, updateItinerary } = useTravelStore();
    const travel = travels.find((t) => t.id === travelId);

    const totalDays = travel ? differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1 : 1;

    const initial = editTarget ?? defaultData;
    const [type, setType] = useState<ItineraryType | ''>(initial?.type || '');
    const [dayIndex, setDayIndex] = useState<number | ''>(initial?.dayIndex ?? '');
    const [time, setTime] = useState(initial?.time || '');
    const [endTime, setEndTime] = useState(initial?.endTime || '');
    const [content, setContent] = useState(initial?.content || '');
    const [address, setAddress] = useState(initial?.address || '');
    const [arrivalAddress, setArrivalAddress] = useState(initial?.arrivalAddress || '');
    const [description, setDescription] = useState(initial?.description || '');
    const [transportMode, setTransportMode] = useState<TransportMode | ''>(initial?.transportMode || '');
    const [duration, setDuration] = useState(initial?.duration || '');
    const [distance, setDistance] = useState(initial?.distance || '');
    const [costs, setCosts] = useState<Array<{ id: string; category: ExpenseCategory | ''; title: string; amount: string; currency: ExpenseCurrency; paidBy: string }>>(() => {
        if (!initial) return [];
        return getItineraryCosts({
            id: initial.id || 'draft',
            content: initial.content || '',
            costs: initial.costs,
            costAmount: initial.costAmount,
            costCurrency: initial.costCurrency,
            paidBy: initial.paidBy,
        }).map((c) => ({
            id: c.id,
            category: c.category || '',
            title: c.title,
            amount: String(c.amount),
            currency: c.currency,
            paidBy: c.paidBy || '',
        }));
    });
    const [isCalculating, setIsCalculating] = useState(false);

    const isDirty = (() => {
        const initType = initial?.type || '';
        const initDay = initial?.dayIndex ?? '';
        const initTime = initial?.time || '';
        const initEndTime = initial?.endTime || '';
        const initContent = initial?.content || '';
        const initAddress = initial?.address || '';
        const initArrival = initial?.arrivalAddress || '';
        const initDesc = initial?.description || '';
        const initTransport = initial?.transportMode || '';
        const initCosts = initial
            ? getItineraryCosts({
                  id: initial.id || 'draft',
                  content: initial.content || '',
                  costs: initial.costs,
                  costAmount: initial.costAmount,
                  costCurrency: initial.costCurrency,
                  paidBy: initial.paidBy,
              }).map((c) => ({
                  id: c.id,
                  category: c.category || '',
                  title: c.title,
                  amount: String(c.amount),
                  currency: c.currency,
                  paidBy: c.paidBy || '',
              }))
            : [];

        return (
            type !== initType ||
            dayIndex !== initDay ||
            time !== initTime ||
            endTime !== initEndTime ||
            content !== initContent ||
            address !== initAddress ||
            arrivalAddress !== initArrival ||
            description !== initDesc ||
            transportMode !== initTransport ||
            JSON.stringify(costs) !== JSON.stringify(initCosts)
        );
    })();

    const { handleDragStart, modalStyle, requestClose } = useDialog(isOpen, onClose, { isDirty });

    const routesLib = useMapsLibrary('routes');
    const geocodingLib = useMapsLibrary('geocoding');

    const calculateDuration = useCallback(async () => {
        if (!routesLib || !geocodingLib || !address || !arrivalAddress || !transportMode) {
            return;
        }
        setIsCalculating(true);

        try {
            const res = await calculateRouteInfo({
                originAddress: address,
                destAddress: arrivalAddress,
                transportMode,
                routesLib,
                geocodingLib,
            });

            if (res) {
                setDuration(res.duration);
                setDistance(res.distance);
            }
        } catch (error) {
            console.error('[ItineraryDialog] calculateDuration failed:', error);
            setDuration('연동 오류');
            setDistance('');
        } finally {
            setIsCalculating(false);
        }
    }, [routesLib, geocodingLib, address, arrivalAddress, transportMode]);

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
    }, [address, arrivalAddress, transportMode, type, routesLib, calculateDuration]);

    const handleSubmit = (e: React.FormEvent, keepOpen: boolean) => {
        e.preventDefault();
        if (!type || !dayIndex || !time || !content) {
            return alert('필수 항목을 모두 입력해주세요.');
        }
        if (type === '이동' && (!address || !arrivalAddress)) {
            return alert('이동일 경우 출발 위치와 도착 위치를 모두 입력해야 합니다.');
        }

        const validCosts: ItineraryCostItem[] = costs
            .map((c) => {
                const parsed = Number(c.amount.replace(/,/g, '').trim());
                if (Number.isNaN(parsed) || parsed <= 0) return null;
                return {
                    id: c.id || uuidv4(),
                    ...(c.category ? { category: c.category } : {}),
                    title: c.title.trim() || content.trim() || '경비',
                    amount: parsed,
                    currency: c.currency,
                    ...(c.paidBy.trim() ? { paidBy: c.paidBy.trim() } : {}),
                };
            })
            .filter((item): item is ItineraryCostItem => item !== null);

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
                costs: validCosts.length > 0 ? validCosts : undefined,
                costAmount: undefined,
                costCurrency: undefined,
                paidBy: undefined,
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
                costs: validCosts.length > 0 ? validCosts : undefined,
            });
            // 저장 후 계속 추가할 때 시간 외 모든 정보 초기화
            setContent('');
            setAddress('');
            setArrivalAddress('');
            setDescription('');
            setCosts([]);
            setType('');
            if (!keepOpen) {
                onClose();
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-3 sm:p-4">
            <div
                data-modal-container
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden"
                style={modalStyle}
            >
                {/* 드래그 가능한 헤더 */}
                <div
                    className="shrink-0 flex justify-between items-center px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleDragStart}
                >
                    <h3 className="font-bold text-lg">{editTarget ? '일정 수정' : '새 일정 추가'}</h3>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form
                    onSubmit={(e) => handleSubmit(e, false)}
                    className="flex-1 flex flex-col min-h-0"
                >
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                        {/* 기본 정보: 모바일 2x2, 데스크톱 4열 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-xs sm:text-sm mb-1 font-medium">일정 종류 *</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value as ItineraryType)}
                                    required
                                    className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
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
                                <label className="block text-xs sm:text-sm mb-1 font-medium">날짜 (일차) *</label>
                                <select
                                    value={dayIndex}
                                    onChange={(e) => setDayIndex(Number(e.target.value))}
                                    required
                                    className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
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
                            <div>
                                <label className="block text-xs sm:text-sm mb-1 font-medium">시작 시간 *</label>
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    required
                                    className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs sm:text-sm mb-1 font-medium text-gray-500">종료 시간 (선택)</label>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs sm:text-sm mb-1 font-medium">내용 *</label>
                            <input
                                type="text"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                required
                                placeholder="일정 제목 또는 주요 내용을 입력하세요"
                                className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>

                        {type === '이동' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs sm:text-sm mb-1 font-medium">출발 위치 *</label>
                                    <input
                                        type="text"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        required
                                        placeholder="출발지 이름이나 주소"
                                        className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm mb-1 font-medium">도착 위치 *</label>
                                    <input
                                        type="text"
                                        value={arrivalAddress}
                                        onChange={(e) => setArrivalAddress(e.target.value)}
                                        required
                                        placeholder="도착지 이름이나 주소"
                                        className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs sm:text-sm mb-1 font-medium">장소 / 주소 (선택)</label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="지도 검색을 위한 장소명 또는 주소"
                                    className="w-full p-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                            </div>
                        )}

                        {type === '이동' && (
                            <div className="p-3 sm:p-3.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs sm:text-sm font-bold text-blue-800 dark:text-blue-300">이동 옵션</label>
                                    {isCalculating && <span className="text-[11px] animate-pulse text-blue-600">경로 계산 중...</span>}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                        <label className="block text-[11px] mb-1 opacity-70">이동 수단</label>
                                        <select
                                            value={transportMode}
                                            onChange={(e) => setTransportMode(e.target.value as TransportMode | '')}
                                            className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none focus:ring-2 focus:ring-blue-500"
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
                                            예상 소요 시간
                                            {(transportMode === 'TRAIN' || transportMode === 'FLIGHT') && <span className="text-amber-500 ml-1">(수기)</span>}
                                        </label>
                                        <input
                                            type="text"
                                            value={duration}
                                            onChange={(e) => setDuration(e.target.value)}
                                            placeholder="예: 1시간 30분"
                                            className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] mb-1 opacity-70">이동 거리</label>
                                        <input
                                            type="text"
                                            value={distance}
                                            onChange={(e) => setDistance(e.target.value)}
                                            placeholder="예: 120km"
                                            className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-3 sm:p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                    예상 / 실제 경비 ({costs.length}건 · 경비 트래커 자동 연동)
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCosts((prev) => [
                                            ...prev,
                                            {
                                                id: uuidv4(),
                                                category: '',
                                                title: '',
                                                amount: '',
                                                currency: prev[prev.length - 1]?.currency || 'JPY',
                                                paidBy: prev[prev.length - 1]?.paidBy || '',
                                            },
                                        ])
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0"
                                >
                                    <Plus size={13} />
                                    경비 추가
                                </button>
                            </div>

                            {costs.length === 0 ? (
                                <p className="text-[11px] text-emerald-800/70 dark:text-emerald-300/70">
                                    &lsquo;경비 추가&rsquo; 버튼을 눌러 입장료, 식사비, 주차비 등 여러 항목을 나누어 입력할 수 있습니다.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {costs.map((costItem, idx) => (
                                        <div
                                            key={costItem.id}
                                            className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center p-2 rounded-lg bg-white/80 dark:bg-gray-900/70 border border-emerald-100 dark:border-emerald-900/40"
                                        >
                                            <select
                                                value={costItem.category}
                                                onChange={(e) =>
                                                    setCosts((prev) =>
                                                        prev.map((c, i) =>
                                                            i === idx ? { ...c, category: e.target.value as ExpenseCategory | '' } : c,
                                                        ),
                                                    )
                                                }
                                                className="col-span-2 sm:col-span-3 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                                title="경비 카테고리 (미지정 시 일정 종류 기준으로 자동 분류)"
                                            >
                                                <option value="">
                                                    자동 ({mapItineraryTypeToExpenseCategory(type || '기타', costItem.title || content)})
                                                </option>
                                                {EXPENSE_CATEGORIES.map((cat) => (
                                                    <option key={cat} value={cat}>
                                                        {cat}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                value={costItem.title}
                                                onChange={(e) =>
                                                    setCosts((prev) =>
                                                        prev.map((c, i) => (i === idx ? { ...c, title: e.target.value } : c)),
                                                    )
                                                }
                                                placeholder="사용처/설명 (예: 입장료)"
                                                className="col-span-2 sm:col-span-3 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                            <input
                                                type="number"
                                                step="any"
                                                value={costItem.amount}
                                                onChange={(e) =>
                                                    setCosts((prev) =>
                                                        prev.map((c, i) => (i === idx ? { ...c, amount: e.target.value } : c)),
                                                    )
                                                }
                                                placeholder="금액"
                                                className="col-span-1 sm:col-span-2 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                            <select
                                                value={costItem.currency}
                                                onChange={(e) =>
                                                    setCosts((prev) =>
                                                        prev.map((c, i) =>
                                                            i === idx ? { ...c, currency: e.target.value as ExpenseCurrency } : c,
                                                        ),
                                                    )
                                                }
                                                className="col-span-1 sm:col-span-2 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                            >
                                                {CURRENCIES.map((cur) => (
                                                    <option key={cur} value={cur}>
                                                        {cur}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="col-span-2 sm:col-span-2 flex items-center gap-1.5">
                                                {participants.length > 0 ? (
                                                    <select
                                                        value={costItem.paidBy}
                                                        onChange={(e) =>
                                                            setCosts((prev) =>
                                                                prev.map((c, i) => (i === idx ? { ...c, paidBy: e.target.value } : c)),
                                                            )
                                                        }
                                                        className="flex-1 min-w-0 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    >
                                                        <option value="">결제자</option>
                                                        {participants.map((p) => (
                                                            <option key={p} value={p}>
                                                                {p}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={costItem.paidBy}
                                                        onChange={(e) =>
                                                            setCosts((prev) =>
                                                                prev.map((c, i) => (i === idx ? { ...c, paidBy: e.target.value } : c)),
                                                            )
                                                        }
                                                        placeholder="결제자"
                                                        className="flex-1 min-w-0 p-1.5 text-xs sm:text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setCosts((prev) => prev.filter((_, i) => i !== idx))}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors shrink-0"
                                                    title="경비 항목 삭제"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs sm:text-sm mb-1 font-medium">상세 설명 (선택)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="메모, 예약 번호, 준비물 등을 자유롭게 입력하세요"
                                className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            ></textarea>
                        </div>
                    </div>

                    {/* 하단 고정 액션 버튼 */}
                    <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/80 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
                        >
                            취소
                        </button>
                        {!editTarget && (
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                className="px-4 py-2 text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-800/50 rounded-lg font-medium transition-colors"
                            >
                                저장 후 계속
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => handleSubmit(e, false)}
                            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                        >
                            {editTarget ? '수정하기' : '저장 닫기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ItineraryDialog;
