import React, { useEffect, useMemo, useState } from 'react';
import { X, Wallet, Plus, Trash2, Users, ArrowRight, Save, Loader2, RefreshCw, BarChart3 } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { ExpenseCategory, ExpenseCurrency, ExpenseItem, Travel } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useTravelStore } from '../../../store/travelStore';
import {
    calculateSettlements,
    convertToKrw,
    DEFAULT_RATES_TO_KRW,
    fetchRatesToKrw,
    getItineraryCosts,
} from '../../../utils/expenseService';
import ExpenseCharts from './ExpenseCharts';

interface ExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    canEdit: boolean;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['식비', '숙박', '교통·렌터카', '관광·쇼핑', '기타'];
const CURRENCIES: ExpenseCurrency[] = ['KRW', 'JPY', 'USD', 'EUR', 'TWD', 'THB', 'VND'];

/**
 * 여행 경비 지출 기록, 다중 통화 원화 환산 및 동행자 정산 계산을 제공하는 모달입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ExpenseModal: React.FC<ExpenseModalProps> = (props) => {
    useEscapeKey(props.isOpen, props.onClose);
    if (!props.isOpen) return null;
    return <ExpenseModalContent {...props} />;
};

const ExpenseModalContent: React.FC<ExpenseModalProps> = ({ onClose, travel, canEdit }) => {
    const { expenses, itineraries, participants, setExpenses, updateItinerary, setParticipants, saveTravelDetail, hasUnsavedChanges } = useTravelStore();
    const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1);

    const [activeTab, setActiveTab] = useState<'list' | 'chart' | 'settle'>('list');
    const [rates, setRates] = useState<Record<ExpenseCurrency, number>>(DEFAULT_RATES_TO_KRW);
    const [isLiveRate, setIsLiveRate] = useState(false);

    // 입력 폼 상태
    const [dayIndex, setDayIndex] = useState<number>(1);
    const [category, setCategory] = useState<ExpenseCategory>('식비');
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<ExpenseCurrency>('JPY');
    const [paidBy, setPaidBy] = useState('');
    const [newParticipant, setNewParticipant] = useState('');
    const [filterDay, setFilterDay] = useState<number | 'ALL'>('ALL');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadRates = async () => {
            const res = await fetchRatesToKrw();
            if (!cancelled) {
                setRates(res.rates);
                setIsLiveRate(res.isLive);
            }
        };
        void loadRates();
        return () => {
            cancelled = true;
        };
    }, []);

    // 일정에 등록된 비용(1:N) + 별도 추가된 비용을 하나의 목록으로 통합
    const combinedExpenses = useMemo<Array<ExpenseItem & { source: 'itinerary' | 'manual'; itineraryId?: string; costId?: string }>>(() => {
        const mapItineraryCat = (type: string): ExpenseCategory => {
            if (type === '이동') return '교통·렌터카';
            if (type === '식사') return '식비';
            if (type === '관광') return '관광·쇼핑';
            return '기타';
        };

        const fromItineraries = itineraries
            .filter((i) => i.travelId === travel.id)
            .flatMap((i) =>
                getItineraryCosts(i).map((c) => ({
                    id: `${i.id}:${c.id}`,
                    itineraryId: i.id,
                    costId: c.id,
                    dayIndex: i.dayIndex,
                    category: mapItineraryCat(i.type),
                    title: c.title && c.title !== i.content ? `${i.content} (${c.title})` : i.content,
                    amount: c.amount,
                    currency: c.currency,
                    paidBy: c.paidBy,
                    source: 'itinerary' as const,
                })),
            );

        const manual = expenses.map((e) => ({ ...e, source: 'manual' as const }));
        return [...fromItineraries, ...manual].sort((a, b) => a.dayIndex - b.dayIndex);
    }, [itineraries, travel.id, expenses]);

    const settlement = useMemo(
        () => calculateSettlements(combinedExpenses, participants, rates),
        [combinedExpenses, participants, rates],
    );

    const currencyTotals = useMemo(() => {
        const map = new Map<ExpenseCurrency, number>();
        for (const exp of combinedExpenses) {
            map.set(exp.currency, (map.get(exp.currency) || 0) + exp.amount);
        }
        return Array.from(map.entries());
    }, [combinedExpenses]);

    const handleAddParticipant = () => {
        if (!canEdit) return;
        const trimmed = newParticipant.trim();
        if (!trimmed || participants.includes(trimmed)) return;
        setParticipants(travel.id, [...participants, trimmed]);
        if (!paidBy) setPaidBy(trimmed);
        setNewParticipant('');
    };

    const handleRemoveParticipant = (name: string) => {
        if (!canEdit) return;
        setParticipants(
            travel.id,
            participants.filter((p) => p !== name),
        );
    };

    const handleAddExpense = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;
        const numAmount = Number(amount.replace(/,/g, '').trim());
        if (!title.trim() || Number.isNaN(numAmount) || numAmount <= 0) {
            alert('지출 내역과 올바른 금액을 입력해 주세요.');
            return;
        }
        const item: ExpenseItem = {
            id: uuidv4(),
            dayIndex,
            category,
            title: title.trim(),
            amount: numAmount,
            currency,
            paidBy: paidBy || participants[0] || undefined,
        };
        setExpenses(travel.id, [item, ...expenses]);
        setTitle('');
        setAmount('');
    };

    const handleDeleteExpense = (exp: ExpenseItem & { source: 'itinerary' | 'manual'; itineraryId?: string; costId?: string }) => {
        if (!canEdit) return;
        if (exp.source === 'itinerary' && exp.itineraryId) {
            if (!window.confirm('이 일정에 등록된 해당 경비 항목을 제거하시겠습니까? (일정 자체는 유지됩니다)')) return;
            const target = itineraries.find((i) => i.id === exp.itineraryId);
            if (!target) return;
            const remaining = getItineraryCosts(target).filter((c) => c.id !== exp.costId);
            updateItinerary(target.id, {
                costs: remaining.length > 0 ? remaining : undefined,
                costAmount: undefined,
                costCurrency: undefined,
                paidBy: undefined,
            });
        } else {
            setExpenses(
                travel.id,
                expenses.filter((x) => x.id !== exp.id),
            );
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveTravelDetail(travel.id);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredExpenses = filterDay === 'ALL' ? combinedExpenses : combinedExpenses.filter((e) => e.dayIndex === filterDay);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                            <Wallet size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">여행 경비 & 정산</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">
                                다중 통화 지출을 원화로 환산하고 동행자별 정산 금액을 자동 계산합니다.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 요약 배너 */}
                <div className="px-4 sm:px-6 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-gray-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div>
                        <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">총 지출 (원화 환산)</div>
                        <div className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                            {settlement.totalKrw.toLocaleString()}원
                            {participants.length > 1 && (
                                <span className="ml-2 text-xs font-semibold text-gray-500">
                                    (1인 약 {Math.round(settlement.totalKrw / participants.length).toLocaleString()}원)
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 flex items-center gap-1">
                            <RefreshCw size={10} className={isLiveRate ? 'text-emerald-500' : 'text-gray-400'} />
                            {isLiveRate ? `실시간 환율 (100엔 ≈ ${Math.round(rates.JPY * 100)}원)` : '기본 환율 적용'}
                        </span>
                        {currencyTotals.length > 0 && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                {currencyTotals.map(([cur, val]) => `${val.toLocaleString()} ${cur}`).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>

                {/* 탭 */}
                <div className="px-4 sm:px-6 pt-2.5 flex items-center gap-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab('list')}
                        className={`pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
                            activeTab === 'list'
                                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                                : 'border-transparent text-gray-500'
                        }`}
                    >
                        지출 내역 ({combinedExpenses.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('chart')}
                        className={`pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'chart'
                                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                                : 'border-transparent text-gray-500'
                        }`}
                    >
                        <BarChart3 size={14} />
                        <span>지출 분석</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('settle')}
                        className={`pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'settle'
                                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                                : 'border-transparent text-gray-500'
                        }`}
                    >
                        <Users size={14} />
                        <span>동행자 정산 ({participants.length}명)</span>
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
                    {activeTab === 'list' ? (
                        <>
                            {canEdit && (
                                <form onSubmit={handleAddExpense} className="p-3 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 space-y-2.5 text-xs">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <select
                                            value={dayIndex}
                                            onChange={(e) => setDayIndex(Number(e.target.value))}
                                            className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        >
                                            {Array.from({ length: totalDays }, (_, i) => (
                                                <option key={i + 1} value={i + 1}>
                                                    {i + 1}일차
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                                            className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        >
                                            {EXPENSE_CATEGORIES.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="지출 내역 *"
                                            className="col-span-2 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                                        <input
                                            type="number"
                                            step="any"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="금액 *"
                                            className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                        <select
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value as ExpenseCurrency)}
                                            className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        >
                                            {CURRENCIES.map((cur) => (
                                                <option key={cur} value={cur}>
                                                    {cur}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={paidBy}
                                            onChange={(e) => setPaidBy(e.target.value)}
                                            className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        >
                                            <option value="">결제자 (선택)</option>
                                            {participants.map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="submit"
                                            className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center justify-center gap-1"
                                        >
                                            <Plus size={14} />
                                            <span>지출 추가</span>
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* 일차 필터 */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                                <button
                                    type="button"
                                    onClick={() => setFilterDay('ALL')}
                                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                        filterDay === 'ALL' ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                    }`}
                                >
                                    전체 ({combinedExpenses.length})
                                </button>
                                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setFilterDay(d)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                            filterDay === d ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        {d}일차 ({combinedExpenses.filter((e) => e.dayIndex === d).length})
                                    </button>
                                ))}
                            </div>

                            {filteredExpenses.length === 0 ? (
                                <div className="py-10 text-center text-xs text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl">
                                    등록된 지출 내역이 없습니다.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredExpenses.map((exp) => {
                                        const krw = convertToKrw(exp.amount, exp.currency, rates);
                                        return (
                                            <div
                                                key={exp.id}
                                                className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                            {exp.dayIndex}일차
                                                        </span>
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300">
                                                            {exp.category}
                                                        </span>
                                                        {exp.source === 'itinerary' && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                                일정 연동
                                                            </span>
                                                        )}
                                                        <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                                            {exp.title}
                                                        </span>
                                                    </div>
                                                    {exp.paidBy && (
                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                            결제: {exp.paidBy}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="text-right">
                                                        <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                                                            {exp.amount.toLocaleString()} {exp.currency}
                                                        </div>
                                                        {exp.currency !== 'KRW' && (
                                                            <div className="text-[10px] text-gray-500">≈ {krw.toLocaleString()}원</div>
                                                        )}
                                                    </div>
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteExpense(exp)}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            title={exp.source === 'itinerary' ? '일정 비용 제거' : '삭제'}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : activeTab === 'chart' ? (
                        <ExpenseCharts
                            expenses={combinedExpenses}
                            totalDays={totalDays}
                            rates={rates}
                        />
                    ) : (
                        <div className="space-y-4">
                            {/* 참여자 관리 */}
                            {canEdit && (
                                <div className="p-3 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 space-y-2.5 text-xs">
                                    <div className="font-bold text-gray-700 dark:text-gray-300">정산 참여자 관리</div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newParticipant}
                                            onChange={(e) => setNewParticipant(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddParticipant();
                                                }
                                            }}
                                            placeholder="이름 입력 (예: 윤명준)"
                                            className="flex-1 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddParticipant}
                                            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold whitespace-nowrap"
                                        >
                                            추가
                                        </button>
                                    </div>
                                    {participants.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {participants.map((p) => (
                                                <span
                                                    key={p}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 font-semibold"
                                                >
                                                    {p}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveParticipant(p)}
                                                        className="text-gray-400 hover:text-red-500"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 송금 정산 가이드 */}
                            {participants.length === 0 ? (
                                <div className="py-10 text-center text-xs text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl">
                                    정산 참여자를 추가하면 1인당 부담액과 송금 내역을 자동으로 계산해 드립니다.
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">참여자별 결제 및 부담 요약</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {settlement.summaries.map((s) => (
                                                <div
                                                    key={s.name}
                                                    className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between text-xs"
                                                >
                                                    <div>
                                                        <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{s.name}</div>
                                                        <div className="text-gray-500">결제 {s.paidKrw.toLocaleString()}원 · 몫 {s.shareKrw.toLocaleString()}원</div>
                                                    </div>
                                                    <div className={`font-extrabold ${s.netKrw >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                                        {s.netKrw >= 0 ? `+${s.netKrw.toLocaleString()}원` : `${s.netKrw.toLocaleString()}원`}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">정산 송금 가이드</h4>
                                        {settlement.transfers.length === 0 ? (
                                            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold text-center">
                                                ✨ 추가 송금할 내역이 없습니다!
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {settlement.transfers.map((t, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between text-xs sm:text-sm"
                                                    >
                                                        <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                                                            <span>{t.from}</span>
                                                            <ArrowRight size={14} className="text-amber-600" />
                                                            <span>{t.to}</span>
                                                        </div>
                                                        <span className="font-black text-amber-700 dark:text-amber-400">
                                                            {t.amountKrw.toLocaleString()}원
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-4 py-3 sm:px-6 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {hasUnsavedChanges ? '⚠️ 저장 버튼을 눌러야 변경사항이 반영됩니다.' : '모든 경비 내역이 저장되었습니다.'}
                    </span>
                    <div className="flex items-center gap-2">
                        {canEdit && hasUnsavedChanges && (
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={handleSave}
                                className="flex items-center gap-1 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-60 whitespace-nowrap"
                            >
                                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                <span>저장</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpenseModal;
