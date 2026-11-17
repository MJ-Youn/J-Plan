import React, { useEffect, useState } from 'react';
import {
    X,
    FolderLock,
    Upload,
    Link2,
    Copy,
    Check,
    Eye,
    Download,
    Trash2,
    ExternalLink,
    ShieldCheck,
    Plus,
    Loader2,
    Plane,
    Building2,
    Car,
    Shield,
    QrCode,
    FileText,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { DocumentCategory, DocumentVisibility, Travel, TravelDocument } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { copyToClipboard } from '../../../utils/clipboard';
import {
    addTravelDocumentLink,
    deleteTravelDocument,
    fetchDocumentBlobUrl,
    fetchTravelDocuments,
    updateDocumentVisibility,
    uploadTravelDocumentFile,
} from '../../../utils/documentService';

interface DocumentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    canEdit: boolean;
    shareId?: string;
}

const CATEGORIES: DocumentCategory[] = ['항공', '숙소', '렌터카', '보험·입국', '티켓·QR', '기타'];

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
    owner_only: '나만 보기 (비공개)',
    collaborators: '공동 작업자 허용',
    all_shared: '전체 공유(읽기 포함)',
};

function getCategoryIcon(category: DocumentCategory) {
    switch (category) {
        case '항공':
            return <Plane size={15} className="text-sky-600 dark:text-sky-400" />;
        case '숙소':
            return <Building2 size={15} className="text-amber-600 dark:text-amber-400" />;
        case '렌터카':
            return <Car size={15} className="text-indigo-600 dark:text-indigo-400" />;
        case '보험·입국':
            return <Shield size={15} className="text-emerald-600 dark:text-emerald-400" />;
        case '티켓·QR':
            return <QrCode size={15} className="text-purple-600 dark:text-purple-400" />;
        default:
            return <FileText size={15} className="text-gray-600 dark:text-gray-400" />;
    }
}

/**
 * 여행 필수 서류(숙소 바우처, 렌터카 예약증, 항공 e-티켓, QR 등)를
 * 암호화 파일(R2) 또는 Google Drive 링크로 안전하게 보관·열람하는 모달입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const DocumentsModal: React.FC<DocumentsModalProps> = (props) => {
    useEscapeKey(props.isOpen, props.onClose);
    if (!props.isOpen) return null;
    return <DocumentsModalContent {...props} />;
};

const DocumentsModalContent: React.FC<DocumentsModalProps> = ({
    onClose,
    travel,
    canEdit,
    shareId,
}) => {
    const totalDays = Math.max(1, differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1);

    const [docs, setDocs] = useState<TravelDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterCat, setFilterCat] = useState<DocumentCategory | 'ALL'>('ALL');
    const [filterDay, setFilterDay] = useState<'ALL' | 'COMMON' | number>('ALL');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // 추가 폼 상태
    const [isAdding, setIsAdding] = useState(false);
    const [addMode, setAddMode] = useState<'r2' | 'link'>('r2');
    const [category, setCategory] = useState<DocumentCategory>('항공');
    const [title, setTitle] = useState('');
    const [provider, setProvider] = useState('');
    const [reservationNumber, setReservationNumber] = useState('');
    const [dayIndex, setDayIndex] = useState<number | ''>('');
    const [visibility, setVisibility] = useState<DocumentVisibility>('collaborators');
    const [memo, setMemo] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [externalUrl, setExternalUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 인앱 미리보기 상태
    const [previewTarget, setPreviewTarget] = useState<{
        doc: TravelDocument;
        blobUrl: string;
        mimeType: string;
    } | null>(null);
    const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const list = await fetchTravelDocuments({
                    travelId: travel.id,
                    ownerId: travel.ownerId,
                    shareId,
                });
                if (!cancelled) {
                    setDocs(list);
                    setErrorMsg(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setErrorMsg((err as Error).message);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [travel.id, travel.ownerId, shareId]);

    // 미리보기 닫을 때 Blob URL 메모리 해제
    const closePreview = () => {
        if (previewTarget?.blobUrl) {
            URL.revokeObjectURL(previewTarget.blobUrl);
        }
        setPreviewTarget(null);
    };

    const handleCopyResNo = async (doc: TravelDocument) => {
        if (!doc.reservationNumber) return;
        const ok = await copyToClipboard(doc.reservationNumber);
        if (ok) {
            setCopiedId(doc.id);
            setTimeout(() => setCopiedId(null), 1800);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setIsSubmitting(true);

        try {
            let created: TravelDocument;
            if (addMode === 'r2') {
                if (!selectedFile) {
                    throw new Error('업로드할 PDF 또는 이미지 파일을 선택해 주세요.');
                }
                created = await uploadTravelDocumentFile({
                    travelId: travel.id,
                    ownerId: travel.ownerId,
                    file: selectedFile,
                    category,
                    title: title || selectedFile.name,
                    reservationNumber,
                    provider,
                    visibility,
                    dayIndex: dayIndex ? Number(dayIndex) : undefined,
                    memo,
                });
            } else {
                if (!title.trim() || !externalUrl.trim()) {
                    throw new Error('문서 제목과 Google Drive(또는 외부) 링크를 입력해 주세요.');
                }
                created = await addTravelDocumentLink({
                    travelId: travel.id,
                    ownerId: travel.ownerId,
                    externalUrl,
                    category,
                    title,
                    reservationNumber,
                    provider,
                    visibility,
                    dayIndex: dayIndex ? Number(dayIndex) : undefined,
                    memo,
                });
            }

            setDocs((prev) => [created, ...prev]);
            setIsAdding(false);
            setTitle('');
            setProvider('');
            setReservationNumber('');
            setDayIndex('');
            setMemo('');
            setSelectedFile(null);
            setExternalUrl('');
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePreview = async (doc: TravelDocument) => {
        if (doc.storageType === 'link' && doc.externalUrl) {
            window.open(doc.externalUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        setLoadingFileId(doc.id);
        setErrorMsg(null);
        try {
            const { blobUrl, mimeType } = await fetchDocumentBlobUrl({
                travelId: travel.id,
                fileId: doc.id,
                ownerId: travel.ownerId,
                shareId,
            });
            setPreviewTarget({ doc, blobUrl, mimeType: mimeType || doc.mimeType || 'application/pdf' });
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setLoadingFileId(null);
        }
    };

    const handleDownload = async (doc: TravelDocument) => {
        setLoadingFileId(doc.id);
        setErrorMsg(null);
        try {
            const { blobUrl } = await fetchDocumentBlobUrl({
                travelId: travel.id,
                fileId: doc.id,
                ownerId: travel.ownerId,
                shareId,
            });
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = doc.fileName || doc.title;
            a.click();
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setLoadingFileId(null);
        }
    };

    const handleDelete = async (doc: TravelDocument) => {
        if (!window.confirm(`"${doc.title}" 서류를 삭제하시겠습니까?`)) return;
        try {
            await deleteTravelDocument({
                travelId: travel.id,
                fileId: doc.id,
                ownerId: travel.ownerId,
            });
            setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        } catch (err) {
            setErrorMsg((err as Error).message);
        }
    };

    const handleVisibilityChange = async (doc: TravelDocument, nextVis: DocumentVisibility) => {
        try {
            await updateDocumentVisibility({
                travelId: travel.id,
                fileId: doc.id,
                visibility: nextVis,
                ownerId: travel.ownerId,
            });
            setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, visibility: nextVis } : d)));
        } catch (err) {
            setErrorMsg((err as Error).message);
        }
    };

    const filteredDocs = docs.filter((d) => {
        if (filterCat !== 'ALL' && d.category !== filterCat) return false;
        if (filterDay === 'COMMON' && Boolean(d.dayIndex)) return false;
        if (typeof filterDay === 'number' && d.dayIndex !== filterDay) return false;
        return true;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                            <FolderLock size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">여행 필수 서류 보관함</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">e-티켓, 숙소·렌터카 바우처, QR 이미지를 암호화 저장하거나 Drive 링크로 관리합니다.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {canEdit && !isAdding && (
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors whitespace-nowrap shrink-0"
                            >
                                <Plus size={14} />
                                <span>서류 추가</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                closePreview();
                                onClose();
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 본문 */}
                <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4 flex-1">
                    {/* 보안 안내 배너 */}
                    <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 flex items-start gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                            <strong>보안 적용:</strong> 업로드 파일은 AES-256-GCM 암호화 후 비공개 저장소에 보관되며, 인증된 사용자에게만 임시 복호화 스트리밍됩니다. 읽기 전용 공유에서는 기본적으로 숨겨집니다.
                        </span>
                    </div>

                    {errorMsg && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                            {errorMsg}
                        </div>
                    )}

                    {/* 서류 추가 폼 */}
                    {isAdding && (
                        <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setAddMode('r2')}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                            addMode === 'r2'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700'
                                        }`}
                                    >
                                        <Upload size={13} />
                                        <span>파일 업로드</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddMode('link')}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                            addMode === 'link'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700'
                                        }`}
                                    >
                                        <Link2 size={13} />
                                        <span>Drive / 링크</span>
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 shrink-0"
                                >
                                    접기
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">카테고리</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    >
                                        {CATEGORIES.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">서류명 *</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="예: 티웨이항공 e-티켓 / 엔 호텔 바우처"
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    />
                                </div>
                            </div>

                            {addMode === 'r2' ? (
                                <div className="text-xs">
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">파일 선택 * (PDF, JPG, PNG, WEBP · 최대 10MB)</label>
                                    <input
                                        type="file"
                                        accept=".pdf,image/jpeg,image/png,image/webp"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] || null;
                                            setSelectedFile(f);
                                            if (f && !title) {
                                                setTitle(f.name.replace(/\.[^/.]+$/, ''));
                                            }
                                        }}
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-dashed border-indigo-300 dark:border-indigo-700 text-xs"
                                    />
                                </div>
                            ) : (
                                <div className="text-xs">
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">Google Drive 또는 공유 URL *</label>
                                    <input
                                        type="url"
                                        value={externalUrl}
                                        onChange={(e) => setExternalUrl(e.target.value)}
                                        placeholder="https://drive.google.com/file/d/..."
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">예약번호 / PNR</label>
                                    <input
                                        type="text"
                                        value={reservationNumber}
                                        onChange={(e) => setReservationNumber(e.target.value)}
                                        placeholder="예: ABC123"
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">예약처 / 업체</label>
                                    <input
                                        type="text"
                                        value={provider}
                                        onChange={(e) => setProvider(e.target.value)}
                                        placeholder="예: 아고다, 타임즈카렌탈"
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">연결 일차 (선택)</label>
                                    <select
                                        value={dayIndex}
                                        onChange={(e) => setDayIndex(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    >
                                        <option value="">전체 일정 공통</option>
                                        {Array.from({ length: totalDays }, (_, i) => (
                                            <option key={i + 1} value={i + 1}>
                                                {i + 1}일차
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">공유/공개 범위</label>
                                    <select
                                        value={visibility}
                                        onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    >
                                        <option value="owner_only">나만 보기 (비공개)</option>
                                        <option value="collaborators">공동 작업자만 열람</option>
                                        <option value="all_shared">전체 공유 (읽기 전용 링크 포함)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">메모 (선택)</label>
                                    <input
                                        type="text"
                                        value={memo}
                                        onChange={(e) => setMemo(e.target.value)}
                                        placeholder="예: 카운터 B구역, 위탁수하물 15kg"
                                        className="w-full p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-zinc-800 rounded-lg"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                                >
                                    {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                                    <span>저장하기</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* 카테고리 & 일차별 필터 */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setFilterCat('ALL')}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                    filterCat === 'ALL'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                }`}
                            >
                                전체 ({docs.length})
                            </button>
                            {CATEGORIES.map((c) => {
                                const count = docs.filter((d) => d.category === c).length;
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setFilterCat(c)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                            filterCat === c
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                        }`}
                                    >
                                        {c} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            <button
                                type="button"
                                onClick={() => setFilterDay('ALL')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                                    filterDay === 'ALL'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                }`}
                            >
                                모든 일차
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterDay('COMMON')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                                    filterDay === 'COMMON'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                }`}
                            >
                                공통 ({docs.filter((d) => !d.dayIndex).length})
                            </button>
                            {Array.from({ length: totalDays }, (_, i) => {
                                const day = i + 1;
                                const count = docs.filter((d) => d.dayIndex === day).length;
                                return (
                                    <button
                                        key={day}
                                        type="button"
                                        onClick={() => setFilterDay(day)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                                            filterDay === day
                                                ? 'bg-amber-600 text-white'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                        }`}
                                    >
                                        {day}일차 ({count})
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 서류 목록 */}
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <Loader2 size={28} className="animate-spin text-indigo-600" />
                        </div>
                    ) : filteredDocs.length === 0 ? (
                        <div className="py-12 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl">
                            등록된 서류가 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {filteredDocs.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="p-3.5 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                                                {getCategoryIcon(doc.category)}
                                                {doc.category}
                                            </span>
                                            {doc.dayIndex && (
                                                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                    {doc.dayIndex}일차
                                                </span>
                                            )}
                                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{doc.title}</span>
                                        </div>

                                        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                                            {doc.provider && <span>업체: {doc.provider}</span>}
                                            {doc.reservationNumber && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyResNo(doc)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-mono font-semibold hover:bg-indigo-100 transition-colors"
                                                    title="예약번호 복사"
                                                >
                                                    <span>#{doc.reservationNumber}</span>
                                                    {copiedId === doc.id ? <Check size={11} /> : <Copy size={11} />}
                                                </button>
                                            )}
                                            {doc.storageType === 'r2' && doc.fileSize && (
                                                <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                                            )}
                                        </div>
                                        {doc.memo && <p className="text-xs text-gray-600 dark:text-gray-400">{doc.memo}</p>}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                        {canEdit && doc.canDelete ? (
                                            <select
                                                value={doc.visibility}
                                                onChange={(e) => handleVisibilityChange(doc, e.target.value as DocumentVisibility)}
                                                className="w-36 px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                            >
                                                <option value="owner_only">{VISIBILITY_LABELS.owner_only}</option>
                                                <option value="collaborators">{VISIBILITY_LABELS.collaborators}</option>
                                                <option value="all_shared">{VISIBILITY_LABELS.all_shared}</option>
                                            </select>
                                        ) : (
                                            <span className="w-36 text-center px-2 py-1.5 text-[11px] rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-500">
                                                {VISIBILITY_LABELS[doc.visibility]}
                                            </span>
                                        )}

                                        {doc.storageType === 'link' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => handlePreview(doc)}
                                                    className="w-[88px] flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                                                >
                                                    <ExternalLink size={12} />
                                                    <span>링크 열기</span>
                                                </button>
                                                <span className="w-7 h-7 shrink-0" aria-hidden="true" />
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={loadingFileId === doc.id}
                                                    onClick={() => handlePreview(doc)}
                                                    className="w-[88px] flex items-center justify-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
                                                >
                                                    {loadingFileId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                                                    <span>보기</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={loadingFileId === doc.id}
                                                    onClick={() => handleDownload(doc)}
                                                    className="w-7 h-7 flex items-center justify-center bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                                                    title="다운로드"
                                                >
                                                    <Download size={14} />
                                                </button>
                                            </>
                                        )}

                                        {canEdit && doc.canDelete && (
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(doc)}
                                                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                                                title="삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 인앱 파일 미리보기 오버레이 */}
                {previewTarget && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                            <div className="px-5 py-3 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                                <span className="font-bold text-sm truncate">{previewTarget.doc.title}</span>
                                <button
                                    type="button"
                                    onClick={closePreview}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-zinc-950 flex items-center justify-center p-2">
                                {previewTarget.mimeType.startsWith('image/') ? (
                                    <img src={previewTarget.blobUrl} alt={previewTarget.doc.title} className="max-w-full max-h-full object-contain rounded-lg" />
                                ) : (
                                    <iframe src={previewTarget.blobUrl} title={previewTarget.doc.title} className="w-full h-full rounded-lg border-0 bg-white" />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsModal;
