import { addDays, format, parseISO } from 'date-fns';
import type { DocumentCategory } from '../types/travel';

/**
 * 파일명을 분석해 카테고리, 제목, 일차를 스마트하게 추론합니다.
 *
 * @author 윤명준 (MJ Yun)
 */
export function inferDocumentMetaFromFilename(
    fileName: string,
    travelStartDate?: string,
    totalDays = 1,
): { title: string; category?: DocumentCategory; dayIndex?: number } {
    // macOS Finder 등에서 전달되는 파일명은 NFD(자모 분리) 형태이므로 NFC로 정규화
    const normalized = fileName.normalize('NFC');
    const baseName = normalized
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const lower = normalized.toLowerCase();

    let category: DocumentCategory | undefined;
    if (/보험|insurance|여권|passport|비자|visa|입국|visit\s*japan|q-code|esta/i.test(lower)) {
        category = '보험·입국';
    } else if (/항공|e-?ticket|eticket|flight|boarding|탑승권|진에어|대한항공|아시아나|티웨이|제주항공|피치|ana|jal/i.test(lower)) {
        category = '항공';
    } else if (/렌터카|렌트카|rent|toyota|nippon|times|budget|hertz|avis|국제면허|차량/i.test(lower)) {
        category = '렌터카';
    } else if (/qr|티켓|ticket|입장권|패스|pass|유니버셜|usj|디즈니|klook|kkday|신칸센|jr/i.test(lower)) {
        category = '티켓·QR';
    } else if (
        /숙소|숙박|호텔|모텔|리조트|펜션|게스트하우스|민박|콘도|hotel|ryokan|료칸|온천|agoda|booking|airbnb|expedia|야놀자|여기어때|체크인|바우처|voucher/i.test(
            lower,
        )
    ) {
        category = '숙소';
    }

    let dayIndex: number | undefined;
    const dayMatch = normalized.match(/(\d+)\s*일\s*차/) || normalized.match(/(?:day|d)[-_\s]*(\d+)/i);
    if (dayMatch) {
        const parsed = Number(dayMatch[1]);
        if (parsed >= 1 && parsed <= totalDays) {
            dayIndex = parsed;
        }
    } else if (travelStartDate) {
        try {
            const start = parseISO(travelStartDate);
            for (let d = 1; d <= totalDays; d++) {
                const target = addDays(start, d - 1);
                const iso = format(target, 'yyyy-MM-dd');
                const compact = format(target, 'yyyyMMdd');
                const mmdd = format(target, 'MMdd');
                if (normalized.includes(iso) || normalized.includes(compact) || normalized.includes(mmdd)) {
                    dayIndex = d;
                    break;
                }
            }
        } catch {
            // 날짜 파싱 실패 시 무시
        }
    }

    return {
        title: baseName || normalized,
        category,
        dayIndex,
    };
}

/**
 * 이미지 파일을 PNG 바이트 배열로 변환합니다. (WebP 등 비표준 이미지 포맷 호환)
 */
async function convertImageToPngBytes(file: File): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('이미지 캔버스 컨텍스트를 생성할 수 없습니다.');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        throw new Error('PNG 변환에 실패했습니다.');
    }
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * 여러 개의 PDF 및 이미지(PNG/JPG/WebP 등) 파일을 하나의 A4 규격 PDF 파일로 병합합니다.
 * 초기 번들 최적화를 위해 pdf-lib를 동적 import 합니다.
 */
export async function mergeFilesToPdf(files: File[], outputTitle: string): Promise<File> {
    if (files.length === 0) {
        throw new Error('병합할 파일이 없습니다.');
    }

    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    // A4 세로 크기 (pt)
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MARGIN = 24;

    for (const file of files) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
            const bytes = await file.arrayBuffer();
            const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            continue;
        }

        if (file.type.startsWith('image/')) {
            const isJpg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
            const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);

            const embeddedImage = isJpg
                ? await mergedPdf.embedJpg(await file.arrayBuffer())
                : isPng
                  ? await mergedPdf.embedPng(await file.arrayBuffer())
                  : await mergedPdf.embedPng(await convertImageToPngBytes(file));

            const imgDims = embeddedImage.scale(1);
            const isLandscape = imgDims.width > imgDims.height * 1.25;
            const pageW = isLandscape ? A4_HEIGHT : A4_WIDTH;
            const pageH = isLandscape ? A4_WIDTH : A4_HEIGHT;
            const maxW = pageW - MARGIN * 2;
            const maxH = pageH - MARGIN * 2;

            const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height, 1);
            const drawW = imgDims.width * scale;
            const drawH = imgDims.height * scale;

            const page = mergedPdf.addPage([pageW, pageH]);
            page.drawImage(embeddedImage, {
                x: (pageW - drawW) / 2,
                y: (pageH - drawH) / 2,
                width: drawW,
                height: drawH,
            });
        }
    }

    const pdfBytes = await mergedPdf.save();
    const safeName = (outputTitle.trim() || 'merged_documents').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    return new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
}
