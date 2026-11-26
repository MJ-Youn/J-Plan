import React, { useMemo, useState } from 'react';
import { X, Sparkles, Check, AlertTriangle, FileJson, CheckCircle2 } from 'lucide-react';
import type { ExpenseCurrency, ExpenseItem, Itinerary, Travel } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { copyToClipboard } from '../../../utils/clipboard';
import { generateSettlementPrompt } from '../../../utils/geminiPrompt';
import {
    convertToKrw,
    parseSettlementPatchJson,
    type ParsedItineraryCostPatch,
} from '../../../utils/expenseService';

export interface SettlementApplyOptions {
    itineraryMode: 'replace' | 'append';
    expenseMode: 'append' | 'replace';
    clearUnmatchedItineraryCosts: boolean;
}

interface SettlementJsonModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    itineraries: Itinerary[];
    expenses: ExpenseItem[];
    participants: string[];
    rates: Record<ExpenseCurrency, number>;
    onApply: (
        itineraryPatches: ParsedItineraryCostPatch[],
        expenses: ExpenseItem[],
        options: SettlementApplyOptions,
    ) => void;
}

/**
 * Gemini 영수증 분석 결과(정산 Patch JSON)를 붙여넣어 일정 연동 경비와 일정 외 지출을 일괄 반영하는 모달입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 26.
 */
const SettlementJsonModal: React.FC<SettlementJsonModalProps> = (props) => {
    if (!props.isOpen) return null;
    return <SettlementJsonModalContent {...props} />;
};

const SettlementJsonModalContent: React.FC<SettlementJsonModalProps> = ({
    onClose,
    travel,
    itineraries,
    expenses,
    participants,
    rates,
    onApply,
}) => {
    const [jsonText, setJsonText] = useState('');
    const [copied, setCopied] = useState(false);
    const [itineraryMode, setItineraryMode] = useState<'replace' | 'append'>('replace');
    const [expenseMode, setExpenseMode] = useState<'append' | 'replace'>('append');
    const [clearUnmatchedItineraryCosts, setClearUnmatchedItineraryCosts] = useState(false);

    useEscapeKey(true, onClose, { isDirty: Boolean(jsonText.trim()) });

    const travelItineraries = useMemo(
        () => itineraries.filter((i) => i.travelId === travel.id),
        [itineraries, travel.id],
    );

    const parsed = useMemo(
        () => parseSettlementPatchJson(jsonText, travelItineraries),
        [jsonText, travelItineraries],
    );

    const summary = useMemo(() => {
        if (!parsed.isValid) return { itiCostCount: 0, itiKrw: 0, expKrw: 0 };
        let itiCostCount = 0;
        let itiKrw = 0;
        for (const p of parsed.itineraryPatches) {
            for (const c of p.costs) {
                itiCostCount += 1;
                itiKrw += convertToKrw(c.amount, c.currency, rates);
            }
        }
        let expKrw = 0;
        for (const e of parsed.expenses) {
            expKrw += convertToKrw(e.amount, e.currency, rates);
        }
        return { itiCostCount, itiKrw, expKrw };
    }, [parsed, rates]);

    const handleCopyPrompt = async () => {
        const prompt = generateSettlementPrompt({
            travel,
            itineraries: travelItineraries,
            expenses,
            participants,
        });
        const ok = await copyToClipboard(prompt);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } else {
            alert('프롬프트 복사에 실패했습니다.');
        }
    };

    const handleApplyClick = () => {
        if (!parsed.isValid) return;
        onApply(parsed.itineraryPatches, parsed.expenses, {
            itineraryMode,
            expenseMode,
            clearUnmatchedItineraryCosts,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                            <FileJson size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                                JSON 정산 수정 (AI 영수증 연동)
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                초경량 프롬프트로 영수증 정산 JSON만 받아 일정·지출에 일괄 반영합니다.
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

                {/* 본문 */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                    {/* 1단계: 프롬프트 복사 */}
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-indigo-900 dark:text-indigo-200 space-y-0.5">
                            <div className="font-bold">1단계. Gemini 정산 프롬프트 복사</div>
                            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                                일정 ID 매핑표({travelItineraries.length}건)만 포함한 초경량 프롬프트를 복사한 뒤, 영수증 캡처와 함께 요청하세요.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyPrompt}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors shrink-0 cursor-pointer"
                        >
                            {copied ? <Check size={14} /> : <Sparkles size={14} />}
                            {copied ? '프롬프트 복사됨!' : 'Gemini 정산 프롬프트 복사'}
                        </button>
                    </div>

                    {/* 2단계: JSON 붙여넣기 */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                            2단계. Gemini가 생성한 정산 JSON 붙여넣기
                        </label>
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            rows={8}
                            placeholder={`{\n  "itineraryCosts": [\n    { "itineraryId": "...", "costs": [{ "category": "숙소", "title": "1일차 숙소", "amount": 145230, "currency": "KRW" }] }\n  ],\n  "expenses": [\n    { "dayIndex": 1, "category": "쇼핑(편의점)", "title": "로손 야식", "amount": 1280, "currency": "JPY" }\n  ]\n}`}
                            className="w-full p-3 text-xs font-mono rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* 파싱 결과 및 미리보기 */}
                    {jsonText.trim() && !parsed.isValid && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                            <AlertTriangle size={15} className="shrink-0" />
                            <span>{parsed.error}</span>
                        </div>
                    )}

                    {parsed.unmatchedItineraryIds.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                            <span>
                                일치하는 일정 ID를 찾지 못한 항목이 {parsed.unmatchedItineraryIds.length}건 있어 제외되었습니다:{' '}
                                <code className="font-mono">{parsed.unmatchedItineraryIds.join(', ')}</code>
                            </span>
                        </div>
                    )}

                    {parsed.isValid && (
                        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 size={15} />
                                파싱 완료 · 반영 예정 내역
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-emerald-100 dark:border-emerald-900/40">
                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">일정 연동 경비</div>
                                    <div className="font-bold text-gray-900 dark:text-gray-100">
                                        {parsed.itineraryPatches.length}개 일정 · {summary.itiCostCount}건 ({summary.itiKrw.toLocaleString()}원)
                                    </div>
                                </div>
                                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-emerald-100 dark:border-emerald-900/40">
                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">일정 외 직접 지출</div>
                                    <div className="font-bold text-gray-900 dark:text-gray-100">
                                        {parsed.expenses.length}건 ({summary.expKrw.toLocaleString()}원)
                                    </div>
                                </div>
                            </div>

                            {parsed.itineraryPatches.length > 0 && (
                                <div className="max-h-32 overflow-y-auto space-y-1 pr-1 text-[11px]">
                                    {parsed.itineraryPatches.map((p) => (
                                        <div
                                            key={p.itineraryId}
                                            className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white/70 dark:bg-zinc-900/50 text-gray-700 dark:text-gray-300"
                                        >
                                            <span className="truncate">
                                                <strong className="text-amber-600 dark:text-amber-400">{p.dayIndex}일차</strong> · {p.itineraryContent}
                                            </span>
                                            <span className="shrink-0 font-semibold">
                                                {p.costs.length}건
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 적용 옵션 */}
                    <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200/80 dark:border-zinc-700/60 space-y-3 text-xs">
                        <div className="font-bold text-gray-700 dark:text-gray-200">적용 옵션</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="block text-[11px] text-gray-500 dark:text-gray-400">일정 연동 경비 처리</span>
                                <select
                                    value={itineraryMode}
                                    onChange={(e) => setItineraryMode(e.target.value as 'replace' | 'append')}
                                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 outline-none"
                                >
                                    <option value="replace">매칭된 일정의 기존 경비 교체 (권장)</option>
                                    <option value="append">매칭된 일정의 기존 경비에 추가</option>
                                </select>
                            </label>
                            <label className="space-y-1">
                                <span className="block text-[11px] text-gray-500 dark:text-gray-400">일정 외 직접 지출 처리</span>
                                <select
                                    value={expenseMode}
                                    onChange={(e) => setExpenseMode(e.target.value as 'append' | 'replace')}
                                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 outline-none"
                                >
                                    <option value="append">기존 직접 지출에 추가</option>
                                    <option value="replace">기존 직접 지출 전체 교체</option>
                                </select>
                            </label>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={clearUnmatchedItineraryCosts}
                                onChange={(e) => setClearUnmatchedItineraryCosts(e.target.checked)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            매칭되지 않은 나머지 일정의 기존 예상 경비(costs)도 모두 비우기 (🔒 확정 경비는 보호됨)
                        </label>
                        <p className="text-[11px] text-sky-700 dark:text-sky-300">
                            💡 경비 트래커나 일정 수정에서 <strong>🔒 확정</strong>으로 잠근 항목(항공권·숙소 등)은 교체/비우기 시에도 삭제되지 않고 보존됩니다.
                        </p>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end gap-2 shrink-0 bg-gray-50/60 dark:bg-zinc-900">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        disabled={!parsed.isValid}
                        onClick={handleApplyClick}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-colors cursor-pointer"
                    >
                        정산 내용 적용하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettlementJsonModal;
