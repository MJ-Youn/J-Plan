import { v4 as uuidv4 } from 'uuid';
import type { CollaboratorInfo, ShareLinkInfo, SharePermission, TravelExportData } from '../types/travel';

const DEV_SHARES_KEY = 'jplan_dev_shares';

interface DevShareRecord extends ShareLinkInfo {
    ownerId: string;
    ownerName: string;
}

/**
 * 로컬 개발 환경(DEV)용 공유 메타데이터 목록을 읽습니다.
 */
function readDevShares(): DevShareRecord[] {
    const raw = localStorage.getItem(DEV_SHARES_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as DevShareRecord[];
    } catch {
        return [];
    }
}

/**
 * 로컬 개발 환경(DEV)용 공유 메타데이터 목록을 저장합니다.
 */
function writeDevShares(records: DevShareRecord[]): void {
    localStorage.setItem(DEV_SHARES_KEY, JSON.stringify(records));
}

/**
 * 특정 여행의 공유 링크 목록과 공동 작업자 목록을 조회합니다.
 */
export async function fetchTravelShareSettings(travelId: string): Promise<{
    shares: ShareLinkInfo[];
    collaborators: CollaboratorInfo[];
}> {
    if (import.meta.env.DEV) {
        const shares = readDevShares().filter((s) => s.travelId === travelId);
        return {
            shares,
            collaborators: [],
        };
    }

    const res = await fetch(`/api/data/travels/${travelId}/share`);
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '공유 설정을 불러오지 못했습니다.');
    }
    return res.json();
}

/**
 * 특정 권한('view' 또는 'edit')의 공유 링크를 생성하거나 재발급합니다.
 */
export async function upsertTravelShareLink(params: {
    travelId: string;
    permission: SharePermission;
    regenerate?: boolean;
    ownerId?: string;
    ownerName?: string;
}): Promise<ShareLinkInfo> {
    const { travelId, permission, regenerate = false, ownerId = 'dev-user-id', ownerName = '윤명준 (Local Dev)' } = params;

    if (import.meta.env.DEV) {
        const records = readDevShares();
        const idx = records.findIndex((s) => s.travelId === travelId && s.permission === permission);
        let target: DevShareRecord;

        if (idx === -1) {
            target = {
                id: uuidv4(),
                travelId,
                permission,
                isActive: true,
                ownerId,
                ownerName,
                createdAt: new Date().toISOString(),
            };
            records.push(target);
        } else {
            target = {
                ...records[idx],
                id: regenerate ? uuidv4() : records[idx].id,
                isActive: true,
            };
            records[idx] = target;
        }

        writeDevShares(records);
        return target;
    }

    const res = await fetch(`/api/data/travels/${travelId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, regenerate }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '공유 링크 생성에 실패했습니다.');
    }
    const data = await res.json();
    return data.share;
}

/**
 * 특정 권한의 공유 링크를 비활성화합니다.
 */
export async function disableTravelShareLink(travelId: string, permission: SharePermission): Promise<void> {
    if (import.meta.env.DEV) {
        const records = readDevShares().map((s) =>
            s.travelId === travelId && s.permission === permission ? { ...s, isActive: false } : s,
        );
        writeDevShares(records);
        return;
    }

    const res = await fetch(`/api/data/travels/${travelId}/share?permission=${permission}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '공유 중지에 실패했습니다.');
    }
}

/**
 * 소유자가 특정 공동 작업자의 권한을 제거합니다.
 */
export async function removeTravelCollaborator(travelId: string, collaboratorUserId: string): Promise<void> {
    if (import.meta.env.DEV) {
        return;
    }

    const res = await fetch(`/api/data/travels/${travelId}/share?collaboratorId=${encodeURIComponent(collaboratorUserId)}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '공동 작업자 제거에 실패했습니다.');
    }
}

/**
 * 공유 링크 상세 데이터 응답 타입
 */
export interface SharedTravelResponse {
    requiresAuth?: boolean;
    permission: SharePermission;
    travelName?: string;
    ownerId?: string;
    isOwner?: boolean;
    revision?: number;
    updatedAt?: string;
    updatedBy?: string;
    travel?: TravelExportData['travel'];
    itineraries?: TravelExportData['itineraries'];
    accommodations?: TravelExportData['accommodations'];
}

/**
 * 공유된 여행 상세 데이터를 조회합니다.
 */
export async function fetchSharedTravelData(shareId: string, cfToken?: string): Promise<SharedTravelResponse> {
    if (import.meta.env.DEV) {
        // 1. 신규 DEV 공유 레코드 확인
        const devRecord = readDevShares().find((s) => s.id === shareId && s.isActive);
        let travelId = devRecord?.travelId;
        let permission: SharePermission = devRecord?.permission || 'view';
        let ownerId = devRecord?.ownerId || 'dev-user-id';

        // 2. 레거시 Base64 공유 링크(userId:travelId) 폴백 지원
        if (!travelId) {
            let decodedStr: string;
            try {
                decodedStr = atob(shareId);
            } catch (e) {
                throw new Error('유효하지 않은 공유 링크 형식입니다.', { cause: e });
            }
            const [legacyOwner, legacyTravelId] = decodedStr.split(':');
            if (!legacyTravelId) {
                throw new Error('유효하지 않은 공유 링크입니다.');
            }
            ownerId = legacyOwner;
            travelId = legacyTravelId;
            permission = 'view';
        }

        const saved = localStorage.getItem(`jplan_detail_${travelId}`);
        if (!saved) {
            throw new Error('여행 데이터를 찾을 수 없거나 공유가 중지되었습니다.');
        }

        const parsed = JSON.parse(saved) as TravelExportData;
        return {
            ...parsed,
            revision: parsed.revision ?? 0,
            permission,
            ownerId,
            isOwner: true,
        };
    }

    const query = cfToken ? `?cf_token=${encodeURIComponent(cfToken)}` : '';
    const res = await fetch(`/api/share/${shareId}${query}`);

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`서버에서 올바른 데이터(JSON)를 반환하지 않았습니다. (상태 코드: ${res.status})`);
    }

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || '데이터를 불러올 수 없습니다.');
    }

    return data as SharedTravelResponse;
}

/**
 * 공유된 여행의 최신 리비전 정보만 경량으로 조회합니다 (동시 편집 감지용).
 */
export async function fetchSharedTravelRevision(shareId: string): Promise<{ revision: number; updatedAt: string | null; updatedBy: string | null } | null> {
    if (import.meta.env.DEV) {
        const devRecord = readDevShares().find((s) => s.id === shareId && s.isActive);
        if (!devRecord) return null;
        const saved = localStorage.getItem(`jplan_detail_${devRecord.travelId}`);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as TravelExportData;
        return {
            revision: parsed.revision ?? 0,
            updatedAt: parsed.updatedAt || null,
            updatedBy: parsed.updatedBy || null,
        };
    }

    const res = await fetch(`/api/share/${shareId}?mode=revision`);
    if (!res.ok) return null;
    return res.json();
}
