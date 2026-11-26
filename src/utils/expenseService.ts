import { v4 as uuidv4 } from 'uuid';
import type { ExpenseCategory, ExpenseCurrency, ExpenseItem, Itinerary, ItineraryCostItem, ItineraryType, StoredExchangeRates, Travel } from '../types/travel';
import { isTravelCompleted } from './weatherService';

/**
 * 여행 경비 카테고리 표준 순서 목록
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    '항공권',
    '렌트/교통',
    '숙소',
    '식비',
    '관광',
    '쇼핑(편의점)',
    '기타',
];

/**
 * 구 버전 경비 카테고리('숙박', '교통·렌터카', '관광·쇼핑')를 신규 7종 카테고리로 안전하게 변환합니다.
 */
export function normalizeExpenseCategory(raw?: string): ExpenseCategory {
    if (!raw) return '기타';
    if ((EXPENSE_CATEGORIES as string[]).includes(raw)) {
        return raw as ExpenseCategory;
    }
    if (raw === '숙박') return '숙소';
    if (raw === '교통·렌터카') return '렌트/교통';
    if (raw === '관광·쇼핑') return '쇼핑(편의점)';
    return '기타';
}

/**
 * 일정 구분(type)과 내용(content)을 바탕으로 경비 카테고리를 자동 매핑합니다.
 */
export function mapItineraryTypeToExpenseCategory(type: ItineraryType | string, content?: string): ExpenseCategory {
    if (type === '이동') {
        const text = (content || '').toLowerCase();
        if (/(항공|비행기|공항|티웨이|대한항공|아시아나|진에어|제주항공|이스타|에어부산|에어서울|피치|집에어|flight|airport)/i.test(text)) {
            return '항공권';
        }
        return '렌트/교통';
    }
    if (type === '식사') return '식비';
    if (type === '관광') return '관광';
    return '기타';
}

/**
 * 일정 연동 경비 항목(ItineraryCostItem)의 최종 경비 카테고리를 반환합니다.
 * 개별 항목에 category가 지정되어 있으면 우선 사용하고, 없으면 일정 종류 기반으로 자동 추론합니다.
 */
export function resolveItineraryCostCategory(
    cost: Pick<ItineraryCostItem, 'category' | 'title'>,
    itineraryType: ItineraryType | string,
    itineraryContent?: string,
): ExpenseCategory {
    if (cost.category) {
        return normalizeExpenseCategory(cost.category);
    }
    return mapItineraryTypeToExpenseCategory(itineraryType, cost.title || itineraryContent);
}

/**
 * 일정의 1:N 경비 목록을 반환합니다. (구버전 1:1 필드 자동 호환)
 */
export function getItineraryCosts(iti: Pick<Itinerary, 'id' | 'content' | 'costs' | 'costAmount' | 'costCurrency' | 'paidBy'>): ItineraryCostItem[] {
    if (Array.isArray(iti.costs) && iti.costs.length > 0) {
        return iti.costs.filter((c) => typeof c.amount === 'number' && c.amount > 0);
    }
    if (typeof iti.costAmount === 'number' && iti.costAmount > 0) {
        return [
            {
                id: `${iti.id}_legacy_cost`,
                title: iti.content || '경비',
                amount: iti.costAmount,
                currency: iti.costCurrency || 'KRW',
                paidBy: iti.paidBy,
            },
        ];
    }
    return [];
}

/**
 * 일정 카드용 한 줄 경비 요약 문자열을 반환합니다.
 */
export function formatItineraryCostBadge(costs: ItineraryCostItem[]): string | null {
    if (costs.length === 0) return null;
    if (costs.length === 1) {
        const c = costs[0];
        return `${c.amount.toLocaleString()} ${c.currency}`;
    }
    const currencies = Array.from(new Set(costs.map((c) => c.currency)));
    if (currencies.length === 1) {
        const sum = costs.reduce((s, c) => s + c.amount, 0);
        return `${sum.toLocaleString()} ${currencies[0]} (${costs.length}건)`;
    }
    const first = costs[0];
    return `${first.amount.toLocaleString()} ${first.currency} 외 ${costs.length - 1}건`;
}

/**
 * Excel 셀 및 표에서 사용할 멀티라인 경비 문자열을 반환합니다.
 */
export function formatItineraryCostsMultiline(costs: ItineraryCostItem[]): string {
    if (costs.length === 0) return '-';
    if (costs.length === 1) {
        const c = costs[0];
        const titlePart = c.title?.trim() ? `${c.title.trim()}: ` : '';
        return `${titlePart}${c.amount.toLocaleString()} ${c.currency}`;
    }
    return costs
        .map((c) => {
            const label = c.title?.trim() || '기타';
            return `• ${label}: ${c.amount.toLocaleString()} ${c.currency}`;
        })
        .join('\n');
}

/**
 * 1 외화 단위당 원화(KRW) 환율 맵 (오프라인/API 실패 시 기본 폴백값)
 */
export const DEFAULT_RATES_TO_KRW: Record<ExpenseCurrency, number> = {
    KRW: 1,
    JPY: 9.2,
    USD: 1380,
    EUR: 1490,
    TWD: 43,
    THB: 40,
    VND: 0.055,
};

let cachedRates: Record<ExpenseCurrency, number> | null = null;

/**
 * 무료 환율 API(open.er-api.com)를 조회하여 각 통화 -> 원화(KRW) 환율을 반환합니다.
 */
export async function fetchRatesToKrw(): Promise<{ rates: Record<ExpenseCurrency, number>; isLive: boolean }> {
    if (cachedRates) {
        return { rates: cachedRates, isLive: true };
    }

    try {
        const res = await fetch('https://open.er-api.com/v6/latest/KRW');
        if (!res.ok) throw new Error('Exchange API error');
        const data = await res.json();
        const r = data.rates as Record<string, number> | undefined;
        if (!r) throw new Error('Invalid rates payload');

        const nextRates: Record<ExpenseCurrency, number> = { ...DEFAULT_RATES_TO_KRW };
        (Object.keys(DEFAULT_RATES_TO_KRW) as ExpenseCurrency[]).forEach((code) => {
            if (code === 'KRW') {
                nextRates.KRW = 1;
            } else if (typeof r[code] === 'number' && r[code] > 0) {
                nextRates[code] = Math.round((1 / r[code]) * 1000) / 1000;
            }
        });

        cachedRates = nextRates;
        return { rates: nextRates, isLive: true };
    } catch {
        return { rates: DEFAULT_RATES_TO_KRW, isLive: false };
    }
}

/**
 * 여행 상태(종료 여부)에 따라 DB 저장 환율 또는 실시간 환율 API를 조회합니다.
 * - 종료된 여행 + DB 스냅샷 있음: 외부 API 호출 없이 DB 저장 환율 반환
 * - 종료 전 여행 또는 종료되었으나 DB 스냅샷 없음: API 조회 후 DB 저장 콜백 호출
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 26.
 */
export async function resolveTravelExchangeRates(
    travel: Travel,
    onSaveSnapshot?: (snapshot: StoredExchangeRates) => Promise<void> | void,
): Promise<{
    rates: Record<ExpenseCurrency, number>;
    isLive: boolean;
    isFromDb: boolean;
    updatedAt?: string;
}> {
    const isCompleted = isTravelCompleted(travel.endDate);
    const saved = travel.exchangeRatesSnapshot;

    if (isCompleted && saved?.rates) {
        return {
            rates: saved.rates,
            isLive: true,
            isFromDb: true,
            updatedAt: saved.updatedAt,
        };
    }

    const res = await fetchRatesToKrw();
    if (res.isLive) {
        if (onSaveSnapshot) {
            const isSame = saved?.rates && JSON.stringify(saved.rates) === JSON.stringify(res.rates);
            if (!isSame) {
                void Promise.resolve(
                    onSaveSnapshot({
                        rates: res.rates,
                        updatedAt: new Date().toISOString(),
                    }),
                ).catch((err) => console.warn('[ExpenseService] Failed to save exchange rates snapshot:', err));
            }
        }
        return {
            rates: res.rates,
            isLive: true,
            isFromDb: false,
        };
    }

    if (saved?.rates) {
        return {
            rates: saved.rates,
            isLive: true,
            isFromDb: true,
            updatedAt: saved.updatedAt,
        };
    }

    return {
        rates: res.rates,
        isLive: false,
        isFromDb: false,
    };
}

const VALID_CURRENCIES: ExpenseCurrency[] = ['KRW', 'JPY', 'USD', 'EUR', 'TWD', 'THB', 'VND'];

function normalizeCurrency(raw: unknown): ExpenseCurrency {
    if (typeof raw === 'string' && (VALID_CURRENCIES as string[]).includes(raw.toUpperCase())) {
        return raw.toUpperCase() as ExpenseCurrency;
    }
    return 'KRW';
}

export interface ParsedItineraryCostPatch {
    itineraryId: string;
    itineraryContent: string;
    dayIndex: number;
    costs: ItineraryCostItem[];
}

export interface SettlementPatchParseResult {
    isValid: boolean;
    error?: string;
    itineraryPatches: ParsedItineraryCostPatch[];
    expenses: ExpenseItem[];
    unmatchedItineraryIds: string[];
}

/**
 * Gemini 등에서 생성한 정산 Patch JSON 문자열을 파싱·검증합니다.
 * `{ itineraryCosts: [...], expenses: [...] }` 형식과 단일 `[...]` 배열 형식 모두 지원합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 26.
 */
export function parseSettlementPatchJson(rawText: string, itineraries: Itinerary[]): SettlementPatchParseResult {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return { isValid: false, error: 'JSON 내용을 입력해 주세요.', itineraryPatches: [], expenses: [], unmatchedItineraryIds: [] };
    }

    const cleaned = trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        return { isValid: false, error: '올바른 JSON 형식이 아닙니다. 괄호나 쉼표를 확인해 주세요.', itineraryPatches: [], expenses: [], unmatchedItineraryIds: [] };
    }

    const itineraryMap = new Map(itineraries.map((i) => [i.id, i]));
    const itineraryPatches: ParsedItineraryCostPatch[] = [];
    const expenses: ExpenseItem[] = [];
    const unmatchedItineraryIds: string[] = [];

    const rawObj = Array.isArray(parsed)
        ? { itineraryCosts: [], expenses: parsed }
        : typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : null;

    if (!rawObj) {
        return { isValid: false, error: 'JSON 객체 또는 배열 형식이어야 합니다.', itineraryPatches: [], expenses: [], unmatchedItineraryIds: [] };
    }

    if (Array.isArray(rawObj.itineraryCosts)) {
        for (const entry of rawObj.itineraryCosts) {
            if (!entry || typeof entry !== 'object') continue;
            const rec = entry as Record<string, unknown>;
            const itineraryId = typeof rec.itineraryId === 'string' ? rec.itineraryId.trim() : '';
            if (!itineraryId) continue;

            const target = itineraryMap.get(itineraryId);
            if (!target) {
                unmatchedItineraryIds.push(itineraryId);
                continue;
            }

            const rawCosts = Array.isArray(rec.costs) ? rec.costs : [];
            const validCosts: ItineraryCostItem[] = [];
            for (const c of rawCosts) {
                if (!c || typeof c !== 'object') continue;
                const cRec = c as Record<string, unknown>;
                const amount = Number(cRec.amount);
                if (Number.isNaN(amount) || amount <= 0) continue;

                const title = typeof cRec.title === 'string' && cRec.title.trim() ? cRec.title.trim() : target.content;
                const category = typeof cRec.category === 'string' && cRec.category.trim()
                    ? normalizeExpenseCategory(cRec.category.trim())
                    : undefined;
                const paidBy = typeof cRec.paidBy === 'string' && cRec.paidBy.trim() ? cRec.paidBy.trim() : undefined;

                validCosts.push({
                    id: typeof cRec.id === 'string' && cRec.id.trim() ? cRec.id.trim() : uuidv4(),
                    ...(category ? { category } : {}),
                    title,
                    amount,
                    currency: normalizeCurrency(cRec.currency),
                    ...(paidBy ? { paidBy } : {}),
                });
            }

            if (validCosts.length > 0) {
                itineraryPatches.push({
                    itineraryId,
                    itineraryContent: target.content,
                    dayIndex: target.dayIndex,
                    costs: validCosts,
                });
            }
        }
    }

    if (Array.isArray(rawObj.expenses)) {
        for (const entry of rawObj.expenses) {
            if (!entry || typeof entry !== 'object') continue;
            const rec = entry as Record<string, unknown>;
            const amount = Number(rec.amount);
            if (Number.isNaN(amount) || amount <= 0) continue;

            const dayNum = Number(rec.dayIndex);
            const dayIndex = !Number.isNaN(dayNum) && dayNum >= 1 ? Math.floor(dayNum) : 1;
            const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : '지출';
            const category = normalizeExpenseCategory(typeof rec.category === 'string' ? rec.category.trim() : undefined);
            const paidBy = typeof rec.paidBy === 'string' && rec.paidBy.trim() ? rec.paidBy.trim() : undefined;

            expenses.push({
                id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : uuidv4(),
                dayIndex,
                category,
                title,
                amount,
                currency: normalizeCurrency(rec.currency),
                ...(paidBy ? { paidBy } : {}),
            });
        }
    }

    if (itineraryPatches.length === 0 && expenses.length === 0) {
        return {
            isValid: false,
            error: '유효한 일정 연동 경비(itineraryCosts) 또는 지출 항목(expenses)이 없습니다.',
            itineraryPatches,
            expenses,
            unmatchedItineraryIds,
        };
    }

    return {
        isValid: true,
        itineraryPatches,
        expenses,
        unmatchedItineraryIds,
    };
}

/**
 * 특정 통화 금액을 원화(KRW) 정수로 환산합니다.
 */
export function convertToKrw(amount: number, currency: ExpenseCurrency, rates: Record<ExpenseCurrency, number>): number {
    const rate = rates[currency] ?? 1;
    return Math.round(amount * rate);
}

export interface SettlementTransfer {
    from: string;
    to: string;
    amountKrw: number;
}

export interface ParticipantSummary {
    name: string;
    paidKrw: number;
    shareKrw: number;
    netKrw: number; // +면 받을 금액, -면 보낼 금액
}

/**
 * 지출 내역과 참여자 목록을 바탕으로 개인별 정산 요약과 최소 송금 경로를 계산합니다.
 */
export function calculateSettlements(
    expenses: ExpenseItem[],
    participants: string[],
    rates: Record<ExpenseCurrency, number>,
): {
    summaries: ParticipantSummary[];
    transfers: SettlementTransfer[];
    totalKrw: number;
} {
    const cleanParticipants = Array.from(new Set(participants.map((p) => p.trim()).filter(Boolean)));
    const paidMap = new Map<string, number>();
    const shareMap = new Map<string, number>();

    cleanParticipants.forEach((p) => {
        paidMap.set(p, 0);
        shareMap.set(p, 0);
    });

    let totalKrw = 0;

    for (const exp of expenses) {
        const krw = convertToKrw(exp.amount, exp.currency, rates);
        totalKrw += krw;

        if (cleanParticipants.length === 0) continue;

        const payer = exp.paidBy?.trim() && cleanParticipants.includes(exp.paidBy.trim()) ? exp.paidBy.trim() : cleanParticipants[0];
        paidMap.set(payer, (paidMap.get(payer) || 0) + krw);

        const targets =
            exp.splitAmong && exp.splitAmong.length > 0
                ? exp.splitAmong.filter((name) => cleanParticipants.includes(name))
                : cleanParticipants;
        const effectiveTargets = targets.length > 0 ? targets : cleanParticipants;
        const perPerson = krw / effectiveTargets.length;

        effectiveTargets.forEach((name) => {
            shareMap.set(name, (shareMap.get(name) || 0) + perPerson);
        });
    }

    const summaries: ParticipantSummary[] = cleanParticipants.map((name) => {
        const paidKrw = Math.round(paidMap.get(name) || 0);
        const shareKrw = Math.round(shareMap.get(name) || 0);
        return {
            name,
            paidKrw,
            shareKrw,
            netKrw: paidKrw - shareKrw,
        };
    });

    // Greedy 송금 매칭
    const debtors = summaries
        .filter((s) => s.netKrw < -10)
        .map((s) => ({ name: s.name, amount: -s.netKrw }))
        .sort((a, b) => b.amount - a.amount);
    const creditors = summaries
        .filter((s) => s.netKrw > 10)
        .map((s) => ({ name: s.name, amount: s.netKrw }))
        .sort((a, b) => b.amount - a.amount);

    const transfers: SettlementTransfer[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
        const d = debtors[i];
        const c = creditors[j];
        const pay = Math.round(Math.min(d.amount, c.amount));
        if (pay > 0) {
            transfers.push({ from: d.name, to: c.name, amountKrw: pay });
        }
        d.amount -= pay;
        c.amount -= pay;
        if (d.amount <= 10) i++;
        if (c.amount <= 10) j++;
    }

    return { summaries, transfers, totalKrw };
}
