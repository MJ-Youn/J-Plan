import { v4 as uuidv4 } from 'uuid';
import type { DocumentCategory, DocumentVisibility, TravelDocument } from '../types/travel';

export const MAX_DOCUMENT_SIZE_MB = 25;
export const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

const getDevDocsKey = (travelId: string) => `jplan_docs_${travelId}`;
const getDevFileBlobKey = (fileId: string) => `jplan_doc_blob_${fileId}`;

function readDevDocs(travelId: string): TravelDocument[] {
    const raw = localStorage.getItem(getDevDocsKey(travelId));
    if (!raw) return [];
    try {
        return JSON.parse(raw) as TravelDocument[];
    } catch {
        return [];
    }
}

function writeDevDocs(travelId: string, docs: TravelDocument[]): void {
    localStorage.setItem(getDevDocsKey(travelId), JSON.stringify(docs));
}

/**
 * 여행 필수 서류 목록을 조회합니다.
 */
export async function fetchTravelDocuments(params: {
    travelId: string;
    ownerId?: string;
    shareId?: string;
}): Promise<TravelDocument[]> {
    const { travelId, ownerId, shareId } = params;

    if (import.meta.env.DEV) {
        return readDevDocs(travelId);
    }

    const url = shareId
        ? `/api/share/${shareId}?mode=files`
        : ownerId
          ? `/api/data/travels/${travelId}/files?ownerId=${encodeURIComponent(ownerId)}`
          : `/api/data/travels/${travelId}/files`;

    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '서류 목록을 불러오지 못했습니다.');
    }
    const data = await res.json();
    return (data.files || []) as TravelDocument[];
}

/**
 * 암호화 파일(PDF/이미지)을 R2 보안 보관함에 업로드합니다.
 */
export async function uploadTravelDocumentFile(params: {
    travelId: string;
    ownerId?: string;
    file: File;
    category: DocumentCategory;
    title: string;
    reservationNumber?: string;
    provider?: string;
    visibility: DocumentVisibility;
    dayIndex?: number;
    memo?: string;
}): Promise<TravelDocument> {
    const { travelId, ownerId, file, category, title, reservationNumber, provider, visibility, dayIndex, memo } = params;

    if (import.meta.env.DEV) {
        const id = uuidv4();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
        try {
            localStorage.setItem(getDevFileBlobKey(id), dataUrl);
        } catch {
            throw new Error('로컬 개발 모드 저장 용량(localStorage)을 초과했습니다. 더 작은 파일이나 링크 첨부를 이용해 주세요.');
        }

        const newDoc: TravelDocument = {
            id,
            travelId,
            category,
            title: title.trim() || file.name,
            reservationNumber: reservationNumber?.trim() || undefined,
            provider: provider?.trim() || undefined,
            storageType: 'r2',
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            visibility,
            dayIndex,
            memo: memo?.trim() || undefined,
            createdAt: new Date().toISOString(),
            canDelete: true,
        };
        const docs = [newDoc, ...readDevDocs(travelId)];
        writeDevDocs(travelId, docs);
        return newDoc;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('title', title.trim() || file.name);
    if (reservationNumber?.trim()) formData.append('reservationNumber', reservationNumber.trim());
    if (provider?.trim()) formData.append('provider', provider.trim());
    formData.append('visibility', visibility);
    if (dayIndex && dayIndex > 0) formData.append('dayIndex', String(dayIndex));
    if (memo?.trim()) formData.append('memo', memo.trim());

    const url = ownerId
        ? `/api/data/travels/${travelId}/files?ownerId=${encodeURIComponent(ownerId)}`
        : `/api/data/travels/${travelId}/files`;

    const res = await fetch(url, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '파일 업로드에 실패했습니다.');
    }
    const data = await res.json();
    return data.file as TravelDocument;
}

/**
 * Google Drive 등 외부 공유 링크를 여행 서류로 등록합니다.
 */
export async function addTravelDocumentLink(params: {
    travelId: string;
    ownerId?: string;
    externalUrl: string;
    category: DocumentCategory;
    title: string;
    reservationNumber?: string;
    provider?: string;
    visibility: DocumentVisibility;
    dayIndex?: number;
    memo?: string;
}): Promise<TravelDocument> {
    const { travelId, ownerId, externalUrl, category, title, reservationNumber, provider, visibility, dayIndex, memo } = params;

    if (import.meta.env.DEV) {
        const newDoc: TravelDocument = {
            id: uuidv4(),
            travelId,
            category,
            title: title.trim(),
            reservationNumber: reservationNumber?.trim() || undefined,
            provider: provider?.trim() || undefined,
            storageType: 'link',
            externalUrl: externalUrl.trim(),
            visibility,
            dayIndex,
            memo: memo?.trim() || undefined,
            createdAt: new Date().toISOString(),
            canDelete: true,
        };
        const docs = [newDoc, ...readDevDocs(travelId)];
        writeDevDocs(travelId, docs);
        return newDoc;
    }

    const url = ownerId
        ? `/api/data/travels/${travelId}/files?ownerId=${encodeURIComponent(ownerId)}`
        : `/api/data/travels/${travelId}/files`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            externalUrl,
            category,
            title,
            reservationNumber,
            provider,
            visibility,
            dayIndex,
            memo,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '링크 등록에 실패했습니다.');
    }
    const data = await res.json();
    return data.file as TravelDocument;
}

/**
 * 서류 공개 범위를 변경합니다.
 */
export async function updateDocumentVisibility(params: {
    travelId: string;
    fileId: string;
    visibility: DocumentVisibility;
    ownerId?: string;
}): Promise<void> {
    const { travelId, fileId, visibility, ownerId } = params;

    if (import.meta.env.DEV) {
        const docs = readDevDocs(travelId).map((d) => (d.id === fileId ? { ...d, visibility } : d));
        writeDevDocs(travelId, docs);
        return;
    }

    const url = ownerId
        ? `/api/data/travels/${travelId}/files/${fileId}?ownerId=${encodeURIComponent(ownerId)}`
        : `/api/data/travels/${travelId}/files/${fileId}`;

    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '권한 설정 변경에 실패했습니다.');
    }
}

/**
 * 업로드된 서류의 메타데이터(이름, 카테고리, 일차, 업체명, 예약번호, 메모, 공개범위 등)를 수정합니다.
 */
export async function updateTravelDocument(params: {
    travelId: string;
    fileId: string;
    ownerId?: string;
    title: string;
    category: DocumentCategory;
    dayIndex?: number | null;
    provider?: string;
    reservationNumber?: string;
    memo?: string;
    externalUrl?: string;
    visibility: DocumentVisibility;
}): Promise<TravelDocument> {
    const {
        travelId,
        fileId,
        ownerId,
        title,
        category,
        dayIndex,
        provider,
        reservationNumber,
        memo,
        externalUrl,
        visibility,
    } = params;

    if (import.meta.env.DEV) {
        let updatedDoc: TravelDocument | undefined;
        const docs = readDevDocs(travelId).map((d) => {
            if (d.id !== fileId) return d;
            updatedDoc = {
                ...d,
                title: title.trim() || d.title,
                category,
                dayIndex: dayIndex && dayIndex > 0 ? dayIndex : undefined,
                provider: provider?.trim() || undefined,
                reservationNumber: reservationNumber?.trim() || undefined,
                memo: memo?.trim() || undefined,
                externalUrl: d.storageType === 'link' && externalUrl?.trim() ? externalUrl.trim() : d.externalUrl,
                visibility,
            };
            return updatedDoc;
        });
        writeDevDocs(travelId, docs);
        if (!updatedDoc) throw new Error('서류를 찾을 수 없습니다.');
        return updatedDoc;
    }

    const url = ownerId
        ? `/api/data/travels/${travelId}/files/${fileId}?ownerId=${encodeURIComponent(ownerId)}`
        : `/api/data/travels/${travelId}/files/${fileId}`;

    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title.trim(),
            category,
            dayIndex: dayIndex && dayIndex > 0 ? dayIndex : null,
            provider: provider?.trim() || null,
            reservationNumber: reservationNumber?.trim() || null,
            memo: memo?.trim() || null,
            externalUrl: externalUrl?.trim(),
            visibility,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '서류 정보 수정에 실패했습니다.');
    }
    const data = await res.json();
    return data.file as TravelDocument;
}

/**
 * 서류를 삭제합니다.
 */
export async function deleteTravelDocument(params: {
    travelId: string;
    fileId: string;
    ownerId?: string;
}): Promise<void> {
    const { travelId, fileId, ownerId } = params;

    if (import.meta.env.DEV) {
        writeDevDocs(
            travelId,
            readDevDocs(travelId).filter((d) => d.id !== fileId),
        );
        localStorage.removeItem(getDevFileBlobKey(fileId));
        return;
    }

    const url = ownerId
        ? `/api/data/travels/${travelId}/files/${fileId}?ownerId=${encodeURIComponent(ownerId)}`
        : `/api/data/travels/${travelId}/files/${fileId}`;

    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '서류 삭제에 실패했습니다.');
    }
}

/**
 * 암호화된 파일을 복호화하여 미리보기/다운로드용 Blob URL을 반환합니다.
 * 사용 후 URL.revokeObjectURL로 해제해야 합니다.
 */
export async function fetchDocumentBlobUrl(params: {
    travelId: string;
    fileId: string;
    ownerId?: string;
    shareId?: string;
}): Promise<{ blobUrl: string; mimeType: string }> {
    const { travelId, fileId, ownerId, shareId } = params;

    if (import.meta.env.DEV) {
        const dataUrl = localStorage.getItem(getDevFileBlobKey(fileId));
        if (!dataUrl) {
            throw new Error('로컬 개발 저장소에서 파일을 찾을 수 없습니다.');
        }
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        return { blobUrl: URL.createObjectURL(blob), mimeType: blob.type };
    }

    const url = shareId
        ? `/api/share/${shareId}?mode=file&fileId=${encodeURIComponent(fileId)}`
        : ownerId
          ? `/api/data/travels/${travelId}/files/${fileId}?ownerId=${encodeURIComponent(ownerId)}`
          : `/api/data/travels/${travelId}/files/${fileId}`;

    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '파일을 불러올 수 없습니다.');
    }
    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), mimeType: blob.type };
}
