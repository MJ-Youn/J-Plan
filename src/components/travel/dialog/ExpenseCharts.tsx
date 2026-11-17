import React, { useMemo, useState } from 'react';
import type { ExpenseCategory, ExpenseCurrency, ExpenseItem } from '../../../types/travel';
import { convertToKrw } from '../../../utils/expenseService';

interface ExpenseChartsProps {
    expenses: ExpenseItem[];
    totalDays: number;
    rates: Record<ExpenseCurrency, number>;
}

const CATEGORY_ORDER: ExpenseCategory[] = ['식비', '숙박', '교통·렌터카', '관광·쇼핑', '기타'];

const CATEGORY_COLORS: Record<ExpenseCategory, { hex: string; dot: string; badge: string }> = {
    식비: {
        hex: '#f59e0b',
        dot: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    },
    숙박: {
        hex: '#6366f1',
        dot: 'bg-indigo-500',
        badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
    },
    '교통·렌터카': {
        hex: '#3b82f6',
        dot: 'bg-blue-500',
        badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    },
    '관광·쇼핑': {
        hex: '#10b981',
        dot: 'bg-emerald-500',
        badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    기타: {
        hex: '#a855f7',
        dot: 'bg-purple-500',
        badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    },
};

function formatCompactKrw(value: number): string {
    if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
    if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만`;
    return Math.round(value).toLocaleString();
}

/**
 * 순수 SVG + Tailwind 기반의 여행 경비 시각화 컴포넌트입니다.
 * 1) 항목별 비율 도넛 차트
 * 2) 일차별 카테고리 누적 막대 그래프
 * 3) 누적 지출 추이 곡선 + 고액 지출 TOP 3
 *
 * @author 윤명준 (MJ Yun)
 */
const ExpenseCharts: React.FC<ExpenseChartsProps> = ({ expenses, totalDays, rates }) => {
    const [hoveredCategory, setHoveredCategory] = useState<ExpenseCategory | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    const { totalKrw, categoryData, dailyData, cumulativeData, topExpenses, avgPerDay } = useMemo(() => {
        const catTotals = new Map<ExpenseCategory, number>();
        CATEGORY_ORDER.forEach((c) => catTotals.set(c, 0));

        const dayMap = new Map<number, Record<ExpenseCategory, number>>();
        for (let d = 1; d <= totalDays; d++) {
            dayMap.set(d, {
                식비: 0,
                숙박: 0,
                '교통·렌터카': 0,
                '관광·쇼핑': 0,
                기타: 0,
            });
        }

        const withKrw = expenses.map((e) => ({
            ...e,
            krw: convertToKrw(e.amount, e.currency, rates),
        }));

        let sum = 0;
        for (const item of withKrw) {
            sum += item.krw;
            catTotals.set(item.category, (catTotals.get(item.category) || 0) + item.krw);
            const dayBucket = dayMap.get(item.dayIndex);
            if (dayBucket) {
                dayBucket[item.category] += item.krw;
            }
        }

        const catList = CATEGORY_ORDER.map((category) => {
            const amount = catTotals.get(category) || 0;
            const percent = sum > 0 ? (amount / sum) * 100 : 0;
            return { category, amount, percent };
        }).filter((c) => c.amount > 0);

        const days = Array.from({ length: totalDays }, (_, idx) => {
            const day = idx + 1;
            const breakdown = dayMap.get(day)!;
            const dayTotal = CATEGORY_ORDER.reduce((acc, c) => acc + breakdown[c], 0);
            return { day, breakdown, total: dayTotal };
        });

        let running = 0;
        const cumulative = days.map((d) => {
            running += d.total;
            return { day: d.day, daily: d.total, cumulative: running };
        });

        const top3 = [...withKrw].sort((a, b) => b.krw - a.krw).slice(0, 3);

        return {
            totalKrw: sum,
            categoryData: catList,
            dailyData: days,
            cumulativeData: cumulative,
            topExpenses: top3,
            avgPerDay: totalDays > 0 ? sum / totalDays : 0,
        };
    }, [expenses, totalDays, rates]);

    if (expenses.length === 0 || totalKrw === 0) {
        return (
            <div className="py-12 text-center text-sm text-gray-400">
                등록된 경비가 없습니다. 지출 내역이나 일정에 경비를 입력하면 그래프가 자동으로 표시됩니다.
            </div>
        );
    }

    // 도넛 차트 계산 (반지름 54, 둘레 2 * π * 54 ≈ 339.292)
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const donutSegments = categoryData.reduce<
        Array<{
            category: ExpenseCategory;
            amount: number;
            percent: number;
            dashArray: string;
            dashOffset: number;
        }>
    >((acc, item) => {
        const prevLength = acc.reduce((sum, s) => sum + (s.percent / 100) * circumference, 0);
        const segLength = (item.percent / 100) * circumference;
        acc.push({
            ...item,
            dashArray: `${segLength} ${circumference - segLength}`,
            dashOffset: -prevLength,
        });
        return acc;
    }, []);

    const activeCat = hoveredCategory ? categoryData.find((c) => c.category === hoveredCategory) : null;

    // 막대 그래프 최대값
    const maxDayTotal = Math.max(1, ...dailyData.map((d) => d.total));
    const activeDayInfo = selectedDay ? dailyData.find((d) => d.day === selectedDay) : null;

    // 누적 추이 차트 좌표 계산
    const lineWidth = 360;
    const lineHeight = 110;
    const padX = 20;
    const padY = 14;
    const usableW = lineWidth - padX * 2;
    const usableH = lineHeight - padY * 2;

    const linePoints = cumulativeData.map((d, idx) => {
        const x =
            cumulativeData.length === 1
                ? padX + usableW / 2
                : padX + (idx / (cumulativeData.length - 1)) * usableW;
        const y = padY + usableH - (totalKrw > 0 ? (d.cumulative / totalKrw) * usableH : 0);
        return { ...d, x, y };
    });

    const polylinePoints = linePoints.map((p) => `${p.x},${p.y}`).join(' ');
    const areaPath =
        linePoints.length > 0
            ? `M ${linePoints[0].x},${padY + usableH} L ${linePoints.map((p) => `${p.x},${p.y}`).join(' L ')} L ${linePoints[linePoints.length - 1].x},${padY + usableH} Z`
            : '';

    return (
        <div className="space-y-4">
            {/* 상단 2열 그리드: 카테고리 도넛 + 일차별 막대 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. 카테고리별 비율 도넛 차트 */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100">항목별 지출 비율</h4>
                        <span className="text-[11px] text-gray-400">KRW 환산 기준</span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative w-36 h-36 shrink-0">
                            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                                <circle
                                    cx="70"
                                    cy="70"
                                    r={radius}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="20"
                                    className="text-gray-100 dark:text-zinc-800"
                                />
                                {donutSegments.map((seg) => {
                                    const isDimmed = hoveredCategory !== null && hoveredCategory !== seg.category;
                                    return (
                                        <circle
                                            key={seg.category}
                                            cx="70"
                                            cy="70"
                                            r={radius}
                                            fill="none"
                                            stroke={CATEGORY_COLORS[seg.category].hex}
                                            strokeWidth={hoveredCategory === seg.category ? 23 : 20}
                                            strokeDasharray={seg.dashArray}
                                            strokeDashoffset={seg.dashOffset}
                                            className="transition-all duration-200 cursor-pointer"
                                            style={{ opacity: isDimmed ? 0.3 : 1 }}
                                            onMouseEnter={() => setHoveredCategory(seg.category)}
                                            onMouseLeave={() => setHoveredCategory(null)}
                                            onClick={() =>
                                                setHoveredCategory((prev) =>
                                                    prev === seg.category ? null : seg.category,
                                                )
                                            }
                                        />
                                    );
                                })}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate max-w-full">
                                    {activeCat ? activeCat.category : '총 지출'}
                                </span>
                                <span className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-gray-100">
                                    ₩{formatCompactKrw(activeCat ? activeCat.amount : totalKrw)}
                                </span>
                                {activeCat && (
                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                        {activeCat.percent.toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 w-full space-y-1.5 text-xs">
                            {categoryData.map((item) => (
                                <button
                                    key={item.category}
                                    type="button"
                                    onMouseEnter={() => setHoveredCategory(item.category)}
                                    onMouseLeave={() => setHoveredCategory(null)}
                                    onClick={() =>
                                        setHoveredCategory((prev) => (prev === item.category ? null : item.category))
                                    }
                                    className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg transition-colors text-left ${
                                        hoveredCategory === item.category
                                            ? 'bg-gray-100 dark:bg-zinc-800'
                                            : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                                    }`}
                                >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLORS[item.category].dot}`} />
                                        <span className="font-medium text-gray-700 dark:text-gray-200 truncate">{item.category}</span>
                                    </span>
                                    <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-100">
                                        ₩{Math.round(item.amount).toLocaleString()}{' '}
                                        <span className="text-[10px] font-normal text-gray-400">({item.percent.toFixed(0)}%)</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 2. 일차별 지출 막대 그래프 (카테고리 누적) */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100">일차별 지출 현황</h4>
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {activeDayInfo
                                ? `${activeDayInfo.day}일차: ₩${Math.round(activeDayInfo.total).toLocaleString()}`
                                : `일평균 ₩${Math.round(avgPerDay).toLocaleString()}`}
                        </span>
                    </div>

                    <div className="overflow-x-auto pb-1">
                        <div className="flex items-end justify-around gap-2 h-40 min-w-[240px] pt-5 px-1 border-b border-gray-200 dark:border-zinc-800">
                            {dailyData.map((d) => {
                                const barHeightPct = maxDayTotal > 0 ? (d.total / maxDayTotal) * 100 : 0;
                                const isSelected = selectedDay === d.day;
                                return (
                                    <button
                                        key={d.day}
                                        type="button"
                                        onMouseEnter={() => setSelectedDay(d.day)}
                                        onMouseLeave={() => setSelectedDay(null)}
                                        onClick={() => setSelectedDay((prev) => (prev === d.day ? null : d.day))}
                                        className="flex-1 min-w-[34px] max-w-[56px] h-full flex flex-col items-center justify-end group focus:outline-none"
                                    >
                                        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 whitespace-nowrap">
                                            {d.total > 0 ? formatCompactKrw(d.total) : '-'}
                                        </span>
                                        <div
                                            className={`w-full max-w-[28px] rounded-t-md overflow-hidden flex flex-col-reverse transition-all duration-300 ${
                                                isSelected ? 'ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-zinc-900' : ''
                                            }`}
                                            style={{ height: `${Math.max(d.total > 0 ? 6 : 2, barHeightPct)}%` }}
                                        >
                                            {d.total > 0 ? (
                                                CATEGORY_ORDER.map((cat) => {
                                                    const val = d.breakdown[cat];
                                                    if (val <= 0) return null;
                                                    const segPct = (val / d.total) * 100;
                                                    return (
                                                        <div
                                                            key={cat}
                                                            style={{
                                                                height: `${segPct}%`,
                                                                backgroundColor: CATEGORY_COLORS[cat].hex,
                                                            }}
                                                            title={`${d.day}일차 ${cat}: ₩${Math.round(val).toLocaleString()}`}
                                                        />
                                                    );
                                                })
                                            ) : (
                                                <div className="w-full h-full bg-gray-200 dark:bg-zinc-800" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-around gap-2 min-w-[240px] px-1 pt-1.5">
                            {dailyData.map((d) => (
                                <span
                                    key={d.day}
                                    className={`flex-1 min-w-[34px] max-w-[56px] text-center text-[11px] font-medium ${
                                        selectedDay === d.day
                                            ? 'text-amber-600 dark:text-amber-400 font-bold'
                                            : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                >
                                    {d.day}일차
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 하단 추천 그래프 2종: 누적 지출 추이 + 고액 지출 TOP 3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3. 추천: 일차별 누적 지출 추이 */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100">누적 지출 추이</h4>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            최종 ₩{Math.round(totalKrw).toLocaleString()}
                        </span>
                    </div>
                    <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="w-full h-28 overflow-visible">
                        <defs>
                            <linearGradient id="jplanExpenseArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                            </linearGradient>
                        </defs>
                        {/* 가로 기준선 */}
                        <line
                            x1={padX}
                            y1={padY + usableH}
                            x2={lineWidth - padX}
                            y2={padY + usableH}
                            stroke="currentColor"
                            className="text-gray-200 dark:text-zinc-800"
                            strokeWidth="1"
                        />
                        <line
                            x1={padX}
                            y1={padY + usableH / 2}
                            x2={lineWidth - padX}
                            y2={padY + usableH / 2}
                            stroke="currentColor"
                            strokeDasharray="3 3"
                            className="text-gray-200 dark:text-zinc-800"
                            strokeWidth="1"
                        />
                        {areaPath && <path d={areaPath} fill="url(#jplanExpenseArea)" />}
                        {linePoints.length > 1 && (
                            <polyline
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={polylinePoints}
                            />
                        )}
                        {linePoints.map((p) => (
                            <g key={p.day}>
                                <circle cx={p.x} cy={p.y} r="4" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                                <text
                                    x={p.x}
                                    y={lineHeight - 1}
                                    textAnchor="middle"
                                    className="fill-gray-400 text-[9px]"
                                >
                                    {p.day}일차
                                </text>
                            </g>
                        ))}
                    </svg>
                </div>

                {/* 4. 추천: 고액 지출 TOP 3 */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100">고액 지출 TOP {topExpenses.length}</h4>
                        <span className="text-[11px] text-gray-400">총 지출 대비 비중</span>
                    </div>
                    <div className="space-y-2.5">
                        {topExpenses.map((item, idx) => {
                            const pct = totalKrw > 0 ? (item.krw / totalKrw) * 100 : 0;
                            return (
                                <div key={`${item.id}-${idx}`} className="space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">{idx + 1}.</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${CATEGORY_COLORS[item.category].badge}`}>
                                                {item.dayIndex}일차
                                            </span>
                                            <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{item.title}</span>
                                        </span>
                                        <span className="font-bold text-gray-900 dark:text-gray-100 shrink-0">
                                            ₩{Math.round(item.krw).toLocaleString()}
                                            <span className="text-[10px] font-normal text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-300"
                                            style={{
                                                width: `${Math.min(100, pct)}%`,
                                                backgroundColor: CATEGORY_COLORS[item.category].hex,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpenseCharts;
