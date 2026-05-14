import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Map as MapIcon, ArrowRight, Edit2, Trash2, Save, X, Navigation, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { useTravelStore } from '../../store/travelStore';
import type { Itinerary } from '../../types/travel';
import { getTypeEmoji, getTransportInfo } from '../../types/travel';
/**
 * 시간대별 일정을 표시하는 타임테이블 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 14.
 */
interface Props {
    itineraries: Itinerary[];
    selectedDay: number | 'all';
    isMapExpanded: boolean;
    totalDays: number;
    travelId: string;
    selectedItineraryId: string | null;
    onItineraryClick: (id: string) => void;
    onEdit: (e: React.MouseEvent, iti: Itinerary) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onAddItinerary?: (defaultData: Partial<Itinerary>) => void;
}

type ProcessedItinerary = Itinerary & {
    startMins: number;
    endMins: number;
};

const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60)
        .toString()
        .padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
};

const TimeTable: React.FC<Props> = ({ itineraries, selectedDay, isMapExpanded, totalDays, travelId, selectedItineraryId, onItineraryClick, onEdit, onDelete, onAddItinerary }) => {
    const { updateItinerary, hasUnsavedChanges, saveTravelDetail, fetchTravelDetail } = useTravelStore();
    const HOUR_HEIGHT = 160;
    const MIN_HEIGHT = 40;

    // 모바일 환경 감지
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 리사이즈 상태 관리
    const [resizeInfo, setResizeInfo] = useState<{
        id: string;
        type: 'top' | 'bottom';
        startY: number;
        initialStartMins: number;
        initialEndMins: number;
        currentStartMins: number;
        currentEndMins: number;
        dayIndex: number;
        minBound: number;
        maxBound: number;
    } | null>(null);

    // 이동 상태 관리
    const [moveInfo, setMoveInfo] = useState<{
        id: string;
        startY: number;
        initialStartMins: number;
        initialEndMins: number;
        currentStartMins: number;
        currentEndMins: number;
        dayIndex: number;
    } | null>(null);

    // 드래그 앤 드롭 스왑 상태
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    // 바탕 드래그로 일정 추가 상태
    const [dragCreateState, setDragCreateState] = useState<{
        dayIndex: number;
        startMins: number;
        endMins: number;
        startY: number;
    } | null>(null);

    // ─── 이탈 경고 (브라우저 새로고침/탭 닫기) ───────────────
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedChanges]);

    // ─── 저장 / 초기화 ────────────────────────────────────────
    const handleSaveAll = useCallback(async () => {
        await saveTravelDetail(travelId);
    }, [saveTravelDetail, travelId]);

    const handleDiscardAll = useCallback(async () => {
        if (window.confirm('변경 사항을 취소하시겠습니까? (원래 상태로 되돌립니다)')) {
            await fetchTravelDetail(travelId);
        }
    }, [fetchTravelDetail, travelId]);

    // pending 변경 사항 로직 걷어냄 (store가 관리)
    const effectiveItineraries = itineraries;

    // 모든 일정 전처리 (시작/종료 시간 분 단위 계산)
    const allProcessedEvents = useMemo(() => {
        const grouped = new Map<number, Itinerary[]>();
        effectiveItineraries.forEach((iti) => {
            const day = iti.dayIndex;
            if (!grouped.has(day)) {
                grouped.set(day, []);
            }
            grouped.get(day)!.push(iti);
        });

        const processed: ProcessedItinerary[] = [];
        for (const dayItis of grouped.values()) {
            const sorted = [...dayItis].sort((a, b) => parseTime(a.time) - parseTime(b.time));
            for (let i = 0; i < sorted.length; i++) {
                const iti = sorted[i];
                const startMins = parseTime(iti.time);
                let endMins = startMins + 60;
                if (iti.endTime) {
                    endMins = parseTime(iti.endTime);
                } else if (i + 1 < sorted.length) {
                    endMins = parseTime(sorted[i + 1].time);
                }
                processed.push({ ...iti, startMins, endMins });
            }
        }
        return processed;
    }, [effectiveItineraries]);

    // ─── 리사이즈 핸들러 ──────────────────────────────────────
    const handleResizeStart = (e: React.MouseEvent, ev: ProcessedItinerary, type: 'top' | 'bottom', dayEvents: ProcessedItinerary[]) => {
        if (isMobile) return; // 모바일에서는 드래그 리사이즈 비활성화 (버튼으로 대체)
        e.preventDefault();
        e.stopPropagation();

        const sorted = [...dayEvents].sort((a, b) => a.startMins - b.startMins);
        const idx = sorted.findIndex((s) => s.id === ev.id);
        const prev = sorted[idx - 1];
        const next = sorted[idx + 1];

        const minBound = prev ? prev.endMins : 0;
        const maxBound = next ? next.startMins : 24 * 60;

        setResizeInfo({
            id: ev.id,
            type,
            startY: e.pageY,
            initialStartMins: ev.startMins,
            initialEndMins: ev.endMins,
            currentStartMins: ev.startMins,
            currentEndMins: ev.endMins,
            dayIndex: ev.dayIndex,
            minBound,
            maxBound,
        });
    };

    // ─── 이동 핸들러 ──────────────────────────────────────────
    const handleMoveStart = (e: React.MouseEvent, ev: ProcessedItinerary) => {
        if (isMobile) return; // 모바일에서는 드래그 이동 비활성화 (버튼으로 대체 가능)
        // 이미 리사이즈 중이거나 버튼을 클릭한 경우 무시
        if (resizeInfo || (e.target as HTMLElement).closest('button')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        setDragOverId(null); // 드래그 시작 시 초기화

        setMoveInfo({
            id: ev.id,
            startY: e.pageY,
            initialStartMins: ev.startMins,
            initialEndMins: ev.endMins,
            currentStartMins: ev.startMins,
            currentEndMins: ev.endMins,
            dayIndex: ev.dayIndex,
        });
    };

    // ─── 드래그 앤 드롭 스왑 핸들러 ──────────────────────────
    const handleSwap = (sourceId: string, targetId: string) => {
        const source = effectiveItineraries.find((i) => i.id === sourceId);
        const target = effectiveItineraries.find((i) => i.id === targetId);
        if (source && target) {
            // 시간뿐만 아니라 일차(dayIndex)도 함께 스왑
            updateItinerary(sourceId, {
                time: target.time,
                endTime: target.endTime,
                dayIndex: target.dayIndex,
            });
            updateItinerary(targetId, {
                time: source.time,
                endTime: source.endTime,
                dayIndex: source.dayIndex,
            });
        }
    };

    // ─── 마우스 이벤트 (리사이즈) ─────────────────────────────
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (resizeInfo) {
                const deltaY = e.pageY - resizeInfo.startY;
                const deltaMins = Math.round(((deltaY / HOUR_HEIGHT) * 60) / 15) * 15;

                if (resizeInfo.type === 'top') {
                    let newStart = resizeInfo.initialStartMins + deltaMins;
                    newStart = Math.max(resizeInfo.minBound, Math.min(newStart, resizeInfo.initialEndMins - 15));
                    setResizeInfo((prev) => (prev ? { ...prev, currentStartMins: newStart } : null));
                } else {
                    let newEnd = resizeInfo.initialEndMins + deltaMins;
                    newEnd = Math.max(resizeInfo.initialStartMins + 15, Math.min(newEnd, resizeInfo.maxBound));
                    setResizeInfo((prev) => (prev ? { ...prev, currentEndMins: newEnd } : null));
                }
            } else if (moveInfo) {
                const deltaY = e.pageY - moveInfo.startY;
                const deltaMins = Math.round(((deltaY / HOUR_HEIGHT) * 60) / 15) * 15;

                const duration = moveInfo.initialEndMins - moveInfo.initialStartMins;
                let newStart = moveInfo.initialStartMins + deltaMins;

                // 범위 제한 (00:00 ~ 24:00)
                newStart = Math.max(0, Math.min(newStart, 24 * 60 - duration));
                const newEnd = newStart + duration;

                // 충돌 검사: 이동할 자리에 다른 일정이 있는지 확인
                const hasCollision = allProcessedEvents.some((other) => other.id !== moveInfo.id && other.dayIndex === moveInfo.dayIndex && newStart < other.endMins && newEnd > other.startMins);

                if (!hasCollision) {
                    setMoveInfo((prev) => (prev ? { ...prev, currentStartMins: newStart, currentEndMins: newEnd } : null));
                }
            } else if (dragCreateState) {
                const deltaY = e.pageY - dragCreateState.startY;
                const deltaMins = Math.round(((deltaY / HOUR_HEIGHT) * 60) / 15) * 15;
                let newEnd = dragCreateState.startMins + 30 + deltaMins;
                newEnd = Math.max(dragCreateState.startMins + 15, newEnd); // 최소 15분
                setDragCreateState((prev) => (prev ? { ...prev, endMins: newEnd } : null));
            }
        };

        const handleMouseUp = () => {
            if (resizeInfo) {
                if (resizeInfo.initialStartMins !== resizeInfo.currentStartMins || resizeInfo.initialEndMins !== resizeInfo.currentEndMins) {
                    // 스토어에 즉시 반영 (hasUnsavedChanges 활성화됨)
                    updateItinerary(resizeInfo.id, {
                        time: formatTime(resizeInfo.currentStartMins),
                        endTime: formatTime(resizeInfo.currentEndMins),
                    });
                }
                setResizeInfo(null);
            }
            if (moveInfo) {
                if (dragOverId) {
                    handleSwap(moveInfo.id, dragOverId);
                } else if (moveInfo.initialStartMins !== moveInfo.currentStartMins || moveInfo.initialEndMins !== moveInfo.currentEndMins) {
                    updateItinerary(moveInfo.id, {
                        time: formatTime(moveInfo.currentStartMins),
                        endTime: formatTime(moveInfo.currentEndMins),
                    });
                } else {
                    // 위치 변경이 없다면 단순 클릭으로 간주하여 선택 처리
                    onItineraryClick(moveInfo.id);
                }
                setMoveInfo(null);
                setDragOverId(null);
            }
            if (dragCreateState) {
                onAddItinerary?.({
                    dayIndex: dragCreateState.dayIndex,
                    time: formatTime(dragCreateState.startMins),
                    endTime: formatTime(dragCreateState.endMins),
                });
                setDragCreateState(null);
            }
        };
        if (resizeInfo || moveInfo || dragCreateState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeInfo, moveInfo, dragOverId, dragCreateState, onAddItinerary, updateItinerary, allProcessedEvents]);

    // ─── 이벤트 렌더링 ────────────────────────────────────────
    const renderEventsForColumn = (colId: number | 'all', events: ProcessedItinerary[], startHour: number) => {
        const colEvents = events.filter((iti) => colId === 'all' || iti.dayIndex === colId);
        const placed: { event: ProcessedItinerary; col: number }[] = [];

        colEvents
            .sort((a, b) => a.startMins - b.startMins)
            .forEach((ev) => {
                let col = 0;
                while (placed.some((p) => p.col === col && p.event.startMins < ev.endMins && p.event.endMins > ev.startMins)) {
                    col++;
                }
                placed.push({ event: ev, col });
            });

        const maxCol = Math.max(0, ...placed.map((p) => p.col));

        // 리사이즈 중인 값 실시간 반영
        const getEffectiveMins = (ev: ProcessedItinerary) => {
            if (resizeInfo && resizeInfo.id === ev.id) {
                return { start: resizeInfo.currentStartMins, end: resizeInfo.currentEndMins };
            }
            if (moveInfo && moveInfo.id === ev.id) {
                return { start: moveInfo.currentStartMins, end: moveInfo.currentEndMins };
            }
            return { start: ev.startMins, end: ev.endMins };
        };

        const elements: React.ReactNode[] = placed.map((p, index) => {
            const { start, end } = getEffectiveMins(p.event);
            const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
            let height = ((end - start) / 60) * HOUR_HEIGHT;
            height = Math.max(height, MIN_HEIGHT);

            const isShortEvent = end - start <= 30;

            const formatDurationToKorean = (str: string) => {
                return str
                    .replace(/hours?/g, '시간')
                    .replace(/mins?/g, '분')
                    .replace(/days?/g, '일')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            const widthPct = 100 / (maxCol + 1);
            const leftPct = p.col * widthPct;
            const nextP = placed[index + 1];
            const isMoveableBetween = nextP && p.event.type !== '이동' && nextP.event.type !== '이동';

            const handleAddMoveBetween = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!nextP) {
                    return;
                }

                const first = p.event;
                const second = nextP.event;
                const firstEnd = getEffectiveMins(first).end;
                const secondStart = getEffectiveMins(second).start;

                let startMins = firstEnd;
                let endMins = secondStart;

                // 30분 이내일 경우 30분 확보 (전후 15분씩)
                if (endMins - startMins < 30) {
                    startMins = Math.max(0, firstEnd - 15);
                    endMins = Math.min(24 * 60 - 1, secondStart + 15);
                }

                onAddItinerary?.({
                    type: '이동',
                    dayIndex: first.dayIndex,
                    content: `${first.address} -> ${second.address} 이동`,
                    address: first.address,
                    arrivalAddress: second.address,
                    time: formatTime(startMins),
                    endTime: formatTime(endMins),
                });
            };

            const isSelected = selectedItineraryId === p.event.id;
            // 스토어 상태 변경 시 모두 hasUnsavedChanges로 묶이므로 개별 미저장 상태 대신 전역 상태 사용

            return (
                <div
                    key={p.event.id}
                    id={`itinerary-${p.event.id}`}
                    className={`itinerary-event absolute p-2 shadow-sm hover:shadow-md transition-all cursor-pointer group rounded-none border-t border-b border-r ${isShortEvent ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'} ${
                        isSelected ? 'border-amber-500 ring-2 ring-amber-500 z-20 bg-amber-50 dark:bg-amber-900/30' : 'border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:z-10'
                    } ${resizeInfo?.id === p.event.id || moveInfo?.id === p.event.id ? 'z-30 opacity-90 shadow-xl border-amber-400' : ''} ${dragOverId === p.event.id ? 'ring-4 ring-blue-400 z-30' : ''}`}
                    style={{
                        top,
                        height: height + 1,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        marginTop: '-1px',
                        cursor: moveInfo?.id === p.event.id ? 'grabbing' : 'pointer',
                        pointerEvents: moveInfo?.id === p.event.id ? 'none' : 'auto',
                    }}
                    onMouseDown={(e) => handleMoveStart(e, p.event)}
                    onMouseEnter={() => {
                        if (moveInfo && moveInfo.id !== p.event.id) {
                            setDragOverId(p.event.id);
                        }
                    }}
                    onMouseLeave={() => {
                        if (moveInfo && dragOverId === p.event.id) {
                            setDragOverId(null);
                        }
                    }}
                    onClick={() => {
                        onItineraryClick(p.event.id);
                    }}
                >
                    {/* Resize Handles - Desktop Only */}
                    {!isMobile && (
                        <>
                            <div
                                className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-amber-400 z-10 transition-colors"
                                onMouseDown={(e) => handleResizeStart(e, p.event, 'top', colEvents)}
                            />
                            <div
                                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-amber-400 z-10 transition-colors"
                                onMouseDown={(e) => handleResizeStart(e, p.event, 'bottom', colEvents)}
                            />
                        </>
                    )}

                    <div className="flex justify-between items-start mb-1 gap-2">
                        <div className="flex items-center space-x-1 flex-wrap">
                            <span className="px-1.5 py-0.5 text-[10px] sm:text-xs rounded bg-amber-100 text-amber-700 dark:bg-zinc-700 dark:text-zinc-300 font-medium shrink-0">
                                {getTypeEmoji(p.event.type, p.event.transportMode)} {p.event.type}
                            </span>
                            {colId === 'all' && maxCol > 0 && <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-zinc-700 px-1 rounded">{p.event.dayIndex}일차</span>}
                        </div>
                        <div className={`${isMobile && isSelected ? 'flex' : 'hidden'} group-hover:flex space-x-1 shrink-0 bg-white/80 dark:bg-gray-800/80 rounded p-0.5`}>
                            {isMoveableBetween && (
                                <button
                                    onClick={handleAddMoveBetween}
                                    className="text-gray-400 hover:text-green-500 transition-colors"
                                    title="다음 일정과 사이에 이동 추가"
                                >
                                    <Navigation size={12} />
                                </button>
                            )}
                            <button
                                onClick={(e) => onEdit(e, p.event)}
                                className="text-gray-400 hover:text-blue-500"
                            >
                                <Edit2 size={12} />
                            </button>
                            <button
                                onClick={(e) => onDelete(e, p.event.id)}
                                className="text-gray-400 hover:text-red-500"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    <h4 className={`font-bold sm:text-sm leading-tight mb-1 ${isShortEvent ? 'text-[11px] truncate' : 'text-xs'}`}>{p.event.content}</h4>

                    {!isShortEvent && (
                        <div className="text-[10px] text-gray-500 flex items-center space-x-1 mb-1">
                            <span>
                                {formatTime(start)} - {formatTime(end)}
                            </span>
                            {p.event.type === '이동' && (p.event.duration || p.event.distance) && (
                                <span className="text-blue-500 dark:text-blue-400 font-medium ml-1">
                                    ({p.event.duration ? formatDurationToKorean(p.event.duration) : ''}
                                    {p.event.duration && p.event.distance ? ' / ' : ''}
                                    {p.event.distance})
                                </span>
                            )}
                        </div>
                    )}

                    <div className={`text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 ${isShortEvent ? 'truncate' : ''}`}>
                        {p.event.address && (
                            <>
                                <MapIcon
                                    size={10}
                                    className="shrink-0"
                                />
                                <span className={isShortEvent ? 'truncate' : 'break-all'}>
                                    {p.event.address}
                                    {p.event.type === '이동' && p.event.arrivalAddress && (
                                        <>
                                            <ArrowRight
                                                size={8}
                                                className="inline shrink-0 mx-1"
                                            />
                                            {p.event.arrivalAddress}
                                            {(p.event.duration || p.event.distance) && (
                                                <span className="ml-2 text-blue-600 dark:text-blue-400 font-bold text-[10px] sm:text-xs whitespace-nowrap">
                                                    ({getTransportInfo(p.event.transportMode).emoji} {p.event.duration ? formatDurationToKorean(p.event.duration) : ''}
                                                    {p.event.duration && p.event.distance ? ' · ' : ''}
                                                    {p.event.distance})
                                                </span>
                                            )}
                                        </>
                                    )}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            );
        });

        // 드래그해서 생성 중인 임시 블록 표시
        if (dragCreateState && (colId === 'all' ? 1 : colId) === dragCreateState.dayIndex) {
            const start = dragCreateState.startMins;
            const end = dragCreateState.endMins;
            const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
            let height = ((end - start) / 60) * HOUR_HEIGHT;
            height = Math.max(height, MIN_HEIGHT);

            elements.push(
                <div
                    key="drag-create-preview"
                    className="absolute p-2 shadow-sm rounded-none border-t border-b border-r border-blue-400 bg-blue-50/50 dark:bg-blue-900/30 z-40 opacity-80"
                    style={{ top, height: height + 1, left: '0%', width: '100%', marginTop: '-1px' }}
                >
                    <div className="text-xs text-blue-600 font-bold">
                        {formatTime(start)} - {formatTime(end)}
                    </div>
                    <div className="text-xs text-blue-500">일정 추가 중...</div>
                </div>,
            );
        }

        return elements;
    };

    // ─── 단일 그리드 컴포넌트 ─────────────────────────────────
    const TimeGrid = ({ columns, events, startHour, endHour }: { columns: { id: number | 'all'; label: string }[]; events: ProcessedItinerary[]; startHour: number; endHour: number }) => {
        const totalHours = Math.max(1, endHour - startHour) + 1;

        return (
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-30">
                    <div className="w-16 shrink-0 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-gray-400">시간</span>
                    </div>
                    <div className="flex flex-1">
                        {columns.map((col) => (
                            <div
                                key={col.id}
                                className="flex-1 py-3 text-center text-sm font-bold border-r border-gray-200 dark:border-gray-700 last:border-r-0"
                            >
                                {col.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Grid Body */}
                <div className="flex relative">
                    {/* Y-axis */}
                    <div className="w-16 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 relative z-20">
                        {Array.from({ length: totalHours + 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="relative"
                                style={{ height: HOUR_HEIGHT }}
                            >
                                <div className="absolute -top-2.5 right-2 text-xs text-gray-500 font-medium">{`${(startHour + i).toString().padStart(2, '0')}:00`}</div>
                            </div>
                        ))}
                    </div>

                    {/* Main Grid Area */}
                    <div
                        className="flex-1 relative bg-white dark:bg-gray-900/20"
                        style={{ height: totalHours * HOUR_HEIGHT }}
                    >
                        {/* Background Lines */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col z-0">
                            {Array.from({ length: totalHours }).map((_, i) => (
                                <div
                                    key={i}
                                    className="w-full border-t border-gray-200 dark:border-gray-700 relative"
                                    style={{ height: HOUR_HEIGHT }}
                                >
                                    <div
                                        className="absolute w-full border-t border-dashed border-gray-200 dark:border-gray-700/50"
                                        style={{ top: HOUR_HEIGHT / 2 }}
                                    ></div>
                                </div>
                            ))}
                        </div>

                        {/* Columns */}
                        <div className="absolute inset-0 flex z-10">
                            {columns.map((col) => (
                                <div
                                    key={col.id}
                                    className="flex-1 relative border-r border-gray-200 dark:border-gray-700 last:border-r-0"
                                    onMouseDown={(e) => {
                                        // 이미 존재하는 이벤트나 리사이즈 핸들을 클릭한 경우 무시
                                        if ((e.target as HTMLElement).closest('.itinerary-event')) {
                                            return;
                                        }
                                        if ((e.target as HTMLElement).closest('.cursor-ns-resize')) {
                                            return;
                                        }

                                        const dayIndex = col.id === 'all' ? 1 : (col.id as number);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const y = e.clientY - rect.top;
                                        const minsFromTop = (y / HOUR_HEIGHT) * 60;
                                        let startMins = Math.floor((startHour * 60 + minsFromTop) / 15) * 15;
                                        startMins = Math.max(0, startMins);

                                        setDragCreateState({
                                            dayIndex,
                                            startMins,
                                            endMins: startMins + 30, // 최소 30분
                                            startY: e.pageY,
                                        });
                                    }}
                                >
                                    {renderEventsForColumn(col.id, events, startHour)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── 모바일 액션 바 (선택된 일정 제어) ── */}
                {isMobile &&
                    selectedItineraryId &&
                    (() => {
                        const selectedEvent = allProcessedEvents.find((e) => e.id === selectedItineraryId);
                        if (!selectedEvent) {
                            return null;
                        }

                        const handleAdjustTime = (type: 'start' | 'end', deltaMins: number) => {
                            const { start, end } = { start: selectedEvent.startMins, end: selectedEvent.endMins };
                            let newStart = start;
                            let newEnd = end;

                            if (type === 'start') {
                                newStart = Math.max(0, Math.min(start + deltaMins, end - 15));
                            } else {
                                newEnd = Math.max(start + 15, Math.min(end + deltaMins, 24 * 60));
                            }

                            updateItinerary(selectedItineraryId, {
                                time: formatTime(newStart),
                                endTime: formatTime(newEnd),
                            });
                        };

                        return (
                            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] p-4 pb-safe animate-in slide-in-from-bottom duration-300">
                                <div className="max-w-md mx-auto space-y-4">
                                    {/* 정보 헤더 */}
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">{selectedEvent.dayIndex}일차 일정</div>
                                            <h3 className="text-sm font-bold truncate dark:text-white">{selectedEvent.content}</h3>
                                        </div>
                                        <button
                                            onClick={() => onItineraryClick('')}
                                            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full"
                                        >
                                            <X
                                                size={20}
                                                className="text-gray-400"
                                            />
                                        </button>
                                    </div>

                                    {/* 시간 조정 섹션 */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                                                <Clock size={10} /> 시작 시간 ({formatTime(selectedEvent.startMins)})
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleAdjustTime('start', -15)}
                                                    className="flex-1 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg flex justify-center items-center hover:bg-gray-100 transition-colors"
                                                >
                                                    <ChevronUp
                                                        size={16}
                                                        className="text-gray-600 dark:text-gray-400"
                                                    />
                                                    <span className="text-xs font-bold ml-1">-15m</span>
                                                </button>
                                                <button
                                                    onClick={() => handleAdjustTime('start', 15)}
                                                    className="flex-1 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg flex justify-center items-center hover:bg-gray-100 transition-colors"
                                                >
                                                    <ChevronDown
                                                        size={16}
                                                        className="text-gray-600 dark:text-gray-400"
                                                    />
                                                    <span className="text-xs font-bold ml-1">+15m</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                                                <Clock size={10} /> 종료 시간 ({formatTime(selectedEvent.endMins)})
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleAdjustTime('end', -15)}
                                                    className="flex-1 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg flex justify-center items-center hover:bg-gray-100 transition-colors"
                                                >
                                                    <ChevronUp
                                                        size={16}
                                                        className="text-gray-600 dark:text-gray-400"
                                                    />
                                                    <span className="text-xs font-bold ml-1">-15m</span>
                                                </button>
                                                <button
                                                    onClick={() => handleAdjustTime('end', 15)}
                                                    className="flex-1 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg flex justify-center items-center hover:bg-gray-100 transition-colors"
                                                >
                                                    <ChevronDown
                                                        size={16}
                                                        className="text-gray-600 dark:text-gray-400"
                                                    />
                                                    <span className="text-xs font-bold ml-1">+15m</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 기본 액션 버튼 */}
                                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                                        <button
                                            onClick={(e) => onEdit(e, selectedEvent)}
                                            className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                                        >
                                            <Edit2 size={16} /> 수정하기
                                        </button>
                                        <button
                                            onClick={(e) => onDelete(e, selectedEvent.id)}
                                            className="w-14 py-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl flex items-center justify-center border border-red-100 dark:border-red-900/30"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
            </div>
        );
    };

    const isSequentialMode = !isMapExpanded && selectedDay === 'all';

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden print:border-none print:overflow-visible print:h-auto print:block">
            {/* ── 미저장 변경 사항 알림 배너 ── */}
            {hasUnsavedChanges && (
                <div className="flex items-center justify-between px-3 py-2 bg-orange-50 dark:bg-orange-900/30 border-b border-orange-200 dark:border-orange-700 shrink-0">
                    <span className="text-[11px] sm:text-xs font-medium text-orange-700 dark:text-orange-300 truncate mr-2">{isMapExpanded ? '⚠️ 미저장 변경사항 있음' : '⚠️ 미저장 변경 사항이 있습니다. 확정하려면 저장 버튼을 눌러주세요.'}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDiscardAll}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="변경 사항 취소"
                        >
                            <X size={14} />
                            {isMapExpanded && <span>취소</span>}
                        </button>
                        <button
                            onClick={handleSaveAll}
                            className={`flex items-center gap-1 ${isMapExpanded ? 'p-2' : 'px-3 py-1'} text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded transition-colors shadow-sm`}
                            title="변경 사항 저장"
                        >
                            <Save size={14} />
                            {isMapExpanded && <span>저장</span>}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin print:overflow-visible print:h-auto print:block">
                {isSequentialMode ? (
                    <div className="flex flex-col">
                        {Array.from({ length: totalDays }).map((_, i) => {
                            const dayIndex = i + 1;
                            const dayEvents = allProcessedEvents.filter((ev) => ev.dayIndex === dayIndex);

                            let startHour = 9;
                            let endHour = 18;
                            if (dayEvents.length > 0) {
                                const min = Math.min(...dayEvents.map((e) => e.startMins));
                                const max = Math.max(...dayEvents.map((e) => e.endMins));
                                startHour = Math.floor(min / 60);
                                endHour = Math.ceil(max / 60);
                            }

                            return (
                                <div
                                    key={dayIndex}
                                    className="mb-4 last:mb-0"
                                >
                                    <TimeGrid
                                        columns={[{ id: dayIndex, label: `${dayIndex}일차` }]}
                                        events={dayEvents}
                                        startHour={startHour}
                                        endHour={endHour}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    (() => {
                        let columns: { id: number | 'all'; label: string }[] = [];
                        if (selectedDay === 'all') {
                            columns = Array.from({ length: totalDays }).map((_, i) => ({
                                id: i + 1,
                                label: `${i + 1}일차`,
                            }));
                        } else {
                            columns = [{ id: selectedDay, label: `${selectedDay}일차` }];
                        }

                        const visibleEvents = selectedDay === 'all' ? allProcessedEvents : allProcessedEvents.filter((e) => e.dayIndex === selectedDay);
                        let startHour = 9;
                        let endHour = 18;
                        if (visibleEvents.length > 0) {
                            const min = Math.min(...visibleEvents.map((e) => e.startMins));
                            const max = Math.max(...visibleEvents.map((e) => e.endMins));
                            startHour = Math.floor(min / 60);
                            endHour = Math.ceil(max / 60);
                        }

                        return (
                            <TimeGrid
                                columns={columns}
                                events={visibleEvents}
                                startHour={startHour}
                                endHour={endHour}
                            />
                        );
                    })()
                )}
            </div>
        </div>
    );
};

export default TimeTable;
