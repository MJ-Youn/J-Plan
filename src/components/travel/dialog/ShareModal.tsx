import React, { useEffect, useState } from 'react';
import { X, Copy, Check, RefreshCw, Eye, Users, Shield, Trash2, Link2Off, Loader2 } from 'lucide-react';
import type { CollaboratorInfo, ShareLinkInfo, SharePermission, Travel } from '../../../types/travel';
import { useAuthStore } from '../../../store/authStore';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { copyToClipboard } from '../../../utils/clipboard';
import {
    disableTravelShareLink,
    fetchTravelShareSettings,
    removeTravelCollaborator,
    upsertTravelShareLink,
} from '../../../utils/shareService';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
}

/**
 * 여행 공유 설정 모달 컴포넌트입니다.
 * 읽기 전용 링크와 Google 로그인 기반 공동 작업(편집) 링크를 각각 생성·복사·비활성화하고,
 * 참여 중인 공동 작업자를 관리할 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, travel }) => {
    const { user } = useAuthStore();
    useEscapeKey(isOpen, onClose);

    const [shares, setShares] = useState<ShareLinkInfo[]>([]);
    const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [copiedType, setCopiedType] = useState<SharePermission | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const run = async () => {
            try {
                const data = await fetchTravelShareSettings(travel.id);
                if (!cancelled) {
                    setShares(data.shares || []);
                    setCollaborators(data.collaborators || []);
                    setErrorMsg(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setErrorMsg((err as Error).message || '공유 설정을 불러오지 못했습니다.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [isOpen, travel.id]);

    if (!isOpen) return null;

    const viewShare = shares.find((s) => s.permission === 'view' && s.isActive);
    const editShare = shares.find((s) => s.permission === 'edit' && s.isActive);

    const buildShareUrl = (shareId: string) => `${window.location.origin}/share/${shareId}`;

    const handleEnableOrRegenerate = async (permission: SharePermission, regenerate = false) => {
        if (regenerate && !window.confirm('기존 공유 링크는 즉시 만료되고 새 링크가 발급됩니다. 계속하시겠습니까?')) {
            return;
        }
        setBusyAction(`${permission}-${regenerate ? 'regen' : 'enable'}`);
        setErrorMsg(null);
        try {
            const share = await upsertTravelShareLink({
                travelId: travel.id,
                permission,
                regenerate,
                ownerId: user?.id,
                ownerName: user?.name,
            });
            setShares((prev) => [...prev.filter((s) => s.permission !== permission), share]);

            const copied = await copyToClipboard(buildShareUrl(share.id));
            if (copied) {
                setCopiedType(permission);
                setTimeout(() => setCopiedType(null), 2000);
            }
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setBusyAction(null);
        }
    };

    const handleDisable = async (permission: SharePermission) => {
        const label = permission === 'edit' ? '공동 작업' : '읽기 전용';
        if (!window.confirm(`${label} 공유 링크를 비활성화하시겠습니까? 기존 링크로 더 이상 접근할 수 없게 됩니다.`)) {
            return;
        }
        setBusyAction(`${permission}-disable`);
        setErrorMsg(null);
        try {
            await disableTravelShareLink(travel.id, permission);
            setShares((prev) => prev.map((s) => (s.permission === permission ? { ...s, isActive: false } : s)));
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setBusyAction(null);
        }
    };

    const handleCopy = async (permission: SharePermission, shareId: string) => {
        const ok = await copyToClipboard(buildShareUrl(shareId));
        if (ok) {
            setCopiedType(permission);
            setTimeout(() => setCopiedType(null), 2000);
        }
    };

    const handleRemoveCollaborator = async (collab: CollaboratorInfo) => {
        if (!window.confirm(`"${collab.name || collab.email || '참여자'}"님의 공동 작업 권한을 해제하시겠습니까?`)) {
            return;
        }
        setBusyAction(`collab-${collab.userId}`);
        try {
            await removeTravelCollaborator(travel.id, collab.userId);
            setCollaborators((prev) => prev.filter((c) => c.userId !== collab.userId));
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setBusyAction(null);
        }
    };

    const renderShareCard = (opts: {
        permission: SharePermission;
        title: string;
        description: string;
        badgeText: string;
        icon: React.ReactNode;
        accentClass: string;
        share?: ShareLinkInfo;
    }) => {
        const { permission, title, description, badgeText, icon, accentClass, share } = opts;
        const shareUrl = share ? buildShareUrl(share.id) : '';
        const isBusy = busyAction?.startsWith(permission);

        return (
            <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50/70 dark:bg-zinc-900/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                        <div className={`p-2 rounded-xl shrink-0 ${accentClass}`}>{icon}</div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">{title}</h4>
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${share ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-200 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                    {share ? '활성' : '비활성'}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{description}</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{badgeText}</p>
                        </div>
                    </div>
                </div>

                {share ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                className="min-w-0 flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-700 dark:text-gray-300 outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => handleCopy(permission, share.id)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                            >
                                {copiedType === permission ? <Check size={14} /> : <Copy size={14} />}
                                <span>{copiedType === permission ? '복사됨' : '복사'}</span>
                            </button>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                disabled={Boolean(isBusy)}
                                onClick={() => handleEnableOrRegenerate(permission, true)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-zinc-800 rounded-md transition-colors"
                            >
                                <RefreshCw size={12} />
                                <span>링크 재발급</span>
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(isBusy)}
                                onClick={() => handleDisable(permission)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                            >
                                <Link2Off size={12} />
                                <span>공유 중지</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={Boolean(isBusy)}
                        onClick={() => handleEnableOrRegenerate(permission, false)}
                        className="w-full py-2.5 px-4 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-gray-800 dark:text-gray-200 transition-colors flex items-center justify-center gap-2"
                    >
                        {isBusy && <Loader2 size={14} className="animate-spin" />}
                        <span>{permission === 'edit' ? '공동 작업 링크 생성 및 복사' : '읽기 전용 링크 생성 및 복사'}</span>
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                            <Users size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">여행 일정 공유 및 협업</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{travel.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                    {errorMsg && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                            {errorMsg}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <Loader2 size={28} className="animate-spin text-amber-600" />
                        </div>
                    ) : (
                        <>
                            {renderShareCard({
                                permission: 'view',
                                title: '읽기 전용 공유',
                                description: '링크를 받은 사람은 로그인 없이 일정을 조회하고 Excel/인쇄로 받아볼 수 있습니다.',
                                badgeText: '권한: 일정 수정 불가 (조회 및 내보내기만 가능)',
                                icon: <Eye size={18} />,
                                accentClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                                share: viewShare,
                            })}

                            {renderShareCard({
                                permission: 'edit',
                                title: '공동 작업(편집) 공유',
                                description: 'Google 계정으로 로그인한 동행자와 함께 일정을 추가·수정·삭제할 수 있습니다.',
                                badgeText: '권한: 로그인 필수 · 참여자의 "내 여행 목록"에도 자동 등록 · 동시 수정 충돌 감지 지원',
                                icon: <Users size={18} />,
                                accentClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                                share: editShare,
                            })}

                            {/* 참여 중인 공동 작업자 목록 */}
                            <div className="pt-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    <Shield size={14} className="text-blue-500" />
                                    <span>참여 중인 공동 작업자 ({collaborators.length}명)</span>
                                </div>
                                {collaborators.length === 0 ? (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/40 border border-dashed border-gray-200 dark:border-zinc-800 text-center">
                                        아직 공동 작업 링크로 참여한 사용자가 없습니다.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {collaborators.map((collab) => (
                                            <div
                                                key={collab.userId}
                                                className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    {collab.avatarUrl ? (
                                                        <img src={collab.avatarUrl} alt={collab.name || ''} className="w-7 h-7 rounded-full border border-gray-200 dark:border-zinc-700" />
                                                    ) : (
                                                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                                                            {(collab.name || collab.email || '?')[0]}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{collab.name || '사용자'}</div>
                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{collab.email}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={busyAction === `collab-${collab.userId}`}
                                                    onClick={() => handleRemoveCollaborator(collab)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    title="공동 작업 권한 해제"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
