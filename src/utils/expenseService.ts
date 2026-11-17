import type { ExpenseCurrency, ExpenseItem, Itinerary, ItineraryCostItem } from '../types/travel';

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
