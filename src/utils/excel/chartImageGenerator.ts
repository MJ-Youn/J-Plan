/**
 * 일차별 이동 거리(km) 막대 그래프를 고해상도 PNG(Canvas)로 생성합니다.
 * Excel 요약 시트에 삽입되어 출력 시 한눈에 이동량을 파악할 수 있게 합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
export interface DayDistanceChartItem {
    label: string; // 예: "1일차"
    drivingKm: number; // 차량/렌터카 주행 거리
    totalKm: number; // 전체 이동 거리 (항공/기차 포함)
}

export async function generateDistanceChartPng(items: DayDistanceChartItem[]): Promise<Uint8Array | null> {
    if (typeof document === 'undefined' || items.length === 0) {
        return null;
    }

    const scale = 2; // Retina 고해상도 출력
    const width = 620;
    const height = 270;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);

    // 1. 배경 및 외곽선
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // 2. 차트 제목
    ctx.fillStyle = '#1E3A5F';
    ctx.font = 'bold 14px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('일차별 차량 주행거리 (km)', 20, 28);

    // 범례
    ctx.fillStyle = '#2E5B88';
    ctx.fillRect(width - 155, 17, 12, 12);
    ctx.fillStyle = '#334155';
    ctx.font = '11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.fillText('차량 주행(km)', width - 138, 27);

    // 3. 플롯 영역 계산
    const padLeft = 52;
    const padRight = 24;
    const padTop = 52;
    const padBottom = 42;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxVal = Math.max(10, ...items.map((d) => d.drivingKm));
    const niceMax = Math.ceil(maxVal / 10) * 10;
    const gridSteps = 4;

    // 4. 가로 눈금선 및 Y축 라벨
    ctx.font = '10px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridSteps; i++) {
        const ratio = i / gridSteps;
        const y = padTop + plotH - ratio * plotH;
        const tickVal = Math.round(niceMax * ratio);

        ctx.strokeStyle = i === 0 ? '#94A3B8' : '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();

        ctx.fillStyle = '#64748B';
        ctx.fillText(`${tickVal}`, padLeft - 8, y + 3.5);
    }

    // 5. 막대 그리기
    const slotW = plotW / items.length;
    const barW = Math.min(44, Math.max(18, slotW * 0.48));

    items.forEach((item, idx) => {
        const centerX = padLeft + slotW * idx + slotW / 2;
        const barH = (item.drivingKm / niceMax) * plotH;
        const x = centerX - barW / 2;
        const y = padTop + plotH - barH;

        // 막대 배경
        ctx.fillStyle = '#2E5B88';
        ctx.fillRect(x, y, barW, Math.max(barH, item.drivingKm > 0 ? 2 : 0));

        // 값 라벨
        ctx.fillStyle = '#1E3A5F';
        ctx.font = 'bold 11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${item.drivingKm.toFixed(1)}`, centerX, y - 6);

        // X축 일차 라벨
        ctx.fillStyle = '#334155';
        ctx.font = '11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(item.label, centerX, padTop + plotH + 18);
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

export interface ExpenseCategoryChartItem {
    category: string;
    krwAmount: number;
    percent: number;
}

export interface ExpenseDailyChartItem {
    label: string;
    krwAmount: number;
}

const EXPENSE_CAT_COLORS: Record<string, string> = {
    항공권: '#0ea5e9',
    '렌트/교통': '#3b82f6',
    숙소: '#6366f1',
    식비: '#f59e0b',
    관광: '#10b981',
    '쇼핑(편의점)': '#ec4899',
    기타: '#a855f7',
};

/**
 * 카테고리별 지출 비율(도넛 차트) + 일차별 지출(막대 그래프)을
 * Excel 시트 삽입용 고해상도 PNG(Canvas)로 생성합니다.
 */
export async function generateExpenseChartPng(params: {
    categories: ExpenseCategoryChartItem[];
    dailyTotals: ExpenseDailyChartItem[];
    totalKrw: number;
}): Promise<Uint8Array | null> {
    const { categories, dailyTotals, totalKrw } = params;
    if (typeof document === 'undefined' || totalKrw <= 0) {
        return null;
    }

    const scale = 2;
    const width = 760;
    const height = Math.max(280, 72 + categories.length * 32 + 16);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    // 배경 및 외곽선
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // 가운데 구분선
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(370, 16);
    ctx.lineTo(370, height - 16);
    ctx.stroke();

    // [좌측] 카테고리별 도넛 차트
    ctx.fillStyle = '#1E3A5F';
    ctx.font = 'bold 13px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('항목별 지출 비율 (KRW)', 20, 28);

    const cx = 105;
    const cy = 148;
    const outerR = 66;
    const innerR = 40;
    let startAngle = -Math.PI / 2;

    categories.forEach((c) => {
        const sliceAngle = (c.percent / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = EXPENSE_CAT_COLORS[c.category] || '#94a3b8';
        ctx.fill();
        startAngle += sliceAngle;
    });

    // 도넛 중앙 총액
    ctx.fillStyle = '#64748B';
    ctx.font = '10px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('총 지출', cx, cy - 4);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(`₩${Math.round(totalKrw).toLocaleString()}`, cx, cy + 12);

    // 도넛 범례
    let legendY = 64;
    categories.forEach((c) => {
        ctx.fillStyle = EXPENSE_CAT_COLORS[c.category] || '#94a3b8';
        ctx.fillRect(190, legendY - 9, 10, 10);
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(c.category, 206, legendY);
        ctx.fillStyle = '#64748B';
        ctx.font = '10px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(`₩${Math.round(c.krwAmount).toLocaleString()} (${c.percent.toFixed(1)}%)`, 206, legendY + 13);
        legendY += 32;
    });

    // [우측] 일차별 지출 막대 그래프
    ctx.fillStyle = '#1E3A5F';
    ctx.font = 'bold 13px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('일차별 지출 현황 (KRW)', 390, 28);

    if (dailyTotals.length > 0) {
        const padLeft = 400;
        const padRight = 20;
        const padTop = 55;
        const padBottom = 42;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;
        const maxVal = Math.max(10000, ...dailyTotals.map((d) => d.krwAmount));

        // 바닥선
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, padTop + plotH);
        ctx.lineTo(padLeft + plotW, padTop + plotH);
        ctx.stroke();

        const slotW = plotW / dailyTotals.length;
        const barW = Math.min(40, Math.max(16, slotW * 0.5));

        dailyTotals.forEach((d, idx) => {
            const centerX = padLeft + slotW * idx + slotW / 2;
            const barH = (d.krwAmount / maxVal) * plotH;
            const x = centerX - barW / 2;
            const y = padTop + plotH - barH;

            ctx.fillStyle = '#D97706';
            ctx.fillRect(x, y, barW, Math.max(barH, d.krwAmount > 0 ? 2 : 0));

            ctx.fillStyle = '#1E3A5F';
            ctx.font = 'bold 10px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
            ctx.textAlign = 'center';
            const labelVal = d.krwAmount >= 10000 ? `${Math.round(d.krwAmount / 10000)}만` : Math.round(d.krwAmount).toLocaleString();
            ctx.fillText(d.krwAmount > 0 ? labelVal : '-', centerX, y - 6);

            ctx.fillStyle = '#334155';
            ctx.font = '11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
            ctx.fillText(d.label, centerX, padTop + plotH + 18);
        });
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}
