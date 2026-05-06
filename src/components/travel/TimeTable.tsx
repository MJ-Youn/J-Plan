import React, { useMemo } from 'react';
import { Map as MapIcon, ArrowRight, Edit2, Trash2 } from 'lucide-react';
import type { Itinerary } from '../../types/travel';
import { getTypeEmoji } from '../../types/travel';

interface Props {
  itineraries: Itinerary[];
  selectedDay: number | 'all';
  isMapExpanded: boolean;
  totalDays: number;
  selectedItineraryId: string | null;
  onItineraryClick: (id: string) => void;
  onEdit: (e: React.MouseEvent, iti: Itinerary) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
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
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const TimeTable: React.FC<Props> = ({
  itineraries,
  selectedDay,
  isMapExpanded,
  totalDays,
  selectedItineraryId,
  onItineraryClick,
  onEdit,
  onDelete
}) => {
  const HOUR_HEIGHT = 160; // 높이를 늘려 잘림 방지

  // 모든 일정 전처리 (시작/종료 시간 분 단위 계산)
  const allProcessedEvents = useMemo(() => {
    const grouped = new Map<number, Itinerary[]>();
    itineraries.forEach(iti => {
      const day = iti.dayIndex;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(iti);
    });

    const processed: ProcessedItinerary[] = [];
    for (const dayItis of grouped.values()) {
      const sorted = [...dayItis].sort((a, b) => parseTime(a.time) - parseTime(b.time));
      for (let i = 0; i < sorted.length; i++) {
        const iti = sorted[i];
        const startMins = parseTime(iti.time);
        let endMins = startMins + 60; // 기본 1시간
        if (iti.endTime) {
          endMins = parseTime(iti.endTime);
        } else if (i + 1 < sorted.length) {
          endMins = parseTime(sorted[i + 1].time); // 다음 일정 시작시간
        }
        processed.push({ ...iti, startMins, endMins });
      }
    }
    return processed;
  }, [itineraries]);

  // 그리드에 들어갈 이벤트를 렌더링하는 함수
  const renderEventsForColumn = (
    colId: number | 'all', 
    events: ProcessedItinerary[], 
    startHour: number
  ) => {
    const colEvents = events.filter(iti => colId === 'all' || iti.dayIndex === colId);
    const placed: { event: ProcessedItinerary, col: number }[] = [];
    
    colEvents.sort((a, b) => a.startMins - b.startMins).forEach(ev => {
      let col = 0;
      while(placed.some(p => p.col === col && p.event.startMins < ev.endMins && p.event.endMins > ev.startMins)) {
        col++;
      }
      placed.push({ event: ev, col });
    });

    const maxCol = Math.max(0, ...placed.map(p => p.col));

    return placed.map(p => {
      const top = ((p.event.startMins - startHour * 60) / 60) * HOUR_HEIGHT;
      const rawHeight = ((p.event.endMins - p.event.startMins) / 60) * HOUR_HEIGHT;
      const height = Math.max(rawHeight, 40); // 최소 높이 보장
      
      const widthPct = 100 / (maxCol + 1);
      const leftPct = p.col * widthPct;
      const isSelected = selectedItineraryId === p.event.id;

      const duration = p.event.endMins - p.event.startMins;
      const isShortEvent = duration <= 30;

      return (
        <div
          key={p.event.id}
          id={`itinerary-${p.event.id}`}
          onClick={() => onItineraryClick(p.event.id)}
          className={`absolute p-2 shadow-sm hover:shadow-md transition-all cursor-pointer group rounded-none border-t border-b border-r ${
            isShortEvent ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'
          } ${
            isSelected 
              ? 'border-amber-500 dark:border-amber-500 ring-2 ring-amber-500 dark:ring-amber-500 z-20 bg-amber-50 dark:bg-amber-900/30' 
              : 'border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:z-10'
          }`}
          style={{ top, height: height + 1, left: `${leftPct}%`, width: `${widthPct}%`, marginTop: '-1px' }}
        >
          <div className="flex justify-between items-start mb-1 gap-2">
            <div className="flex items-center space-x-1 flex-wrap">
              <span className="px-1.5 py-0.5 text-[10px] sm:text-xs rounded bg-amber-100 text-amber-700 dark:bg-zinc-700 dark:text-zinc-300 font-medium shrink-0">
                {getTypeEmoji(p.event.type)} {p.event.type}
              </span>
              {colId === 'all' && maxCol > 0 && (
                <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-zinc-700 px-1 rounded">
                  {p.event.dayIndex}일차
                </span>
              )}
            </div>
            <div className="hidden group-hover:flex space-x-1 shrink-0 bg-white/80 dark:bg-gray-800/80 rounded p-0.5">
              <button onClick={(e) => onEdit(e, p.event)} className="text-gray-400 hover:text-blue-500"><Edit2 size={12} /></button>
              <button onClick={(e) => onDelete(e, p.event.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          </div>
          
          <h4 className={`font-bold sm:text-sm leading-tight mb-1 ${isShortEvent ? 'text-[11px] truncate' : 'text-xs'}`}>{p.event.content}</h4>
          
          {!isShortEvent && (
            <div className="text-[10px] text-gray-500 flex items-center space-x-1 mb-1">
              <span>{formatTime(p.event.startMins)} - {formatTime(p.event.endMins)}</span>
            </div>
          )}

          <div className={`text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 ${isShortEvent ? 'truncate' : ''}`}>
            {p.event.address && (
              <>
                <MapIcon size={10} className="shrink-0" />
                <span className={isShortEvent ? 'truncate' : 'break-all'}>
                  {p.event.address}
                  {p.event.type === '이동' && p.event.arrivalAddress && (
                    <>
                      <ArrowRight size={8} className="inline shrink-0 mx-1" />
                      {p.event.arrivalAddress}
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      );
    });
  };

  // 단일 그리드를 렌더링하는 컴포넌트
  const TimeGrid = ({ 
    columns, 
    events, 
    startHour, 
    endHour 
  }: { 
    columns: { id: number | 'all', label: string }[], 
    events: ProcessedItinerary[], 
    startHour: number, 
    endHour: number 
  }) => {
    const totalHours = Math.max(1, endHour - startHour) + 1;

    return (
      <div className="flex flex-col">
        {/* Header (Columns) */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-30">
          <div className="w-16 shrink-0 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-400">시간</span>
          </div>
          <div className="flex flex-1">
            {columns.map(col => (
              <div key={col.id} className="flex-1 py-3 text-center text-sm font-bold border-r border-gray-200 dark:border-gray-700 last:border-r-0">
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
              <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
                <div className="absolute -top-2.5 right-2 text-xs text-gray-500 font-medium">
                  {`${(startHour + i).toString().padStart(2, '0')}:00`}
                </div>
              </div>
            ))}
          </div>
          
          {/* Main Grid Area */}
          <div className="flex-1 relative bg-white dark:bg-gray-900/20" style={{ height: totalHours * HOUR_HEIGHT }}>
            {/* Background Horizontal Lines */}
            <div className="absolute inset-0 pointer-events-none flex flex-col z-0">
              {Array.from({ length: totalHours }).map((_, i) => (
                <div key={i} className="w-full border-t border-gray-200 dark:border-gray-700 relative" style={{ height: HOUR_HEIGHT }}>
                  <div className="absolute w-full border-t border-dashed border-gray-200 dark:border-gray-700/50" style={{ top: HOUR_HEIGHT / 2 }}></div>
                </div>
              ))}
            </div>
            
            {/* Columns Container */}
            <div className="absolute inset-0 flex z-10">
              {columns.map(col => (
                <div key={col.id} className="flex-1 relative border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                  {renderEventsForColumn(col.id, events, startHour)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 모드 판별 로직
  const isSequentialMode = !isMapExpanded && selectedDay === 'all';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden print:border-none print:overflow-visible print:h-auto print:block">
      <div className="flex-1 overflow-y-auto scrollbar-thin print:overflow-visible print:h-auto print:block">
        {isSequentialMode ? (
          // 좁은 뷰(지도모드) + 전체 일정: 일차별로 직렬(Sequential) 렌더링
          <div className="flex flex-col">
            {Array.from({ length: totalDays }).map((_, i) => {
              const dayIndex = i + 1;
              const dayEvents = allProcessedEvents.filter(ev => ev.dayIndex === dayIndex);
              
              let startHour = 9;
              let endHour = 18;
              if (dayEvents.length > 0) {
                const min = Math.min(...dayEvents.map(e => e.startMins));
                const max = Math.max(...dayEvents.map(e => e.endMins));
                startHour = Math.floor(min / 60);
                endHour = Math.ceil(max / 60);
              }

              return (
                <div key={dayIndex} className="mb-4 last:mb-0">
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
          // 넓은 뷰 또는 특정 일차만 선택된 경우: 하나의 공통 그리드
          (() => {
            let columns: { id: number | 'all', label: string }[] = [];
            if (selectedDay === 'all') {
              columns = Array.from({ length: totalDays }).map((_, i) => ({
                id: i + 1, label: `${i + 1}일차`
              }));
            } else {
              columns = [{ id: selectedDay, label: `${selectedDay}일차` }];
            }

            const visibleEvents = selectedDay === 'all' ? allProcessedEvents : allProcessedEvents.filter(e => e.dayIndex === selectedDay);
            let startHour = 9;
            let endHour = 18;
            if (visibleEvents.length > 0) {
              const min = Math.min(...visibleEvents.map(e => e.startMins));
              const max = Math.max(...visibleEvents.map(e => e.endMins));
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
