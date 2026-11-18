import React, { useEffect, useMemo, useState } from 'react';
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
    Edit2,
    ArrowUp,
    ArrowDown,
    Layers,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { DocumentCategory, DocumentVisibility, Travel, TravelDocument } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { copyToClipboard } from '../../../utils/clipboard';
import {
    addTravelDocumentLink,
    deleteTravelDocument,
    fetchDocumentBlobUrl,
    fetchTravelDocuments,
    updateDocumentVisibility,
    updateTravelDocument,
    uploadTravelDocumentFile,
} from '../../../utils/documentService';
import { inferDocumentMetaFromFilename, mergeFilesToPdf } from '../../../utils/pdfMerger';

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
    const [queuedFiles, setQueuedFiles] = useState<
        Array<{
            id: string;
            file: File;
            title: string;
            category: DocumentCategory;
            dayIndex: number | '';
        }>
    >([]);
    const [multiUploadMode, setMultiUploadMode] = useState<'merge' | 'batch'>('merge');
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const [externalUrl, setExternalUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 수정 모달 상태
    const [editingDoc, setEditingDoc] = useState<TravelDocument | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editCategory, setEditCategory] = useState<DocumentCategory>('기타');
    const [editDayIndex, setEditDayIndex] = useState<number | ''>('');
    const [editProvider, setEditProvider] = useState('');
    const [editResNo, setEditResNo] = useState('');
    const [editMemo, setEditMemo] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editVisibility, setEditVisibility] = useState<DocumentVisibility>('collaborators');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const isDirty =
        Boolean(editingDoc) ||
        (isAdding &&
            (queuedFiles.length > 0 ||
                Boolean(
                    title.trim() ||
                        provider.trim() ||
                        reservationNumber.trim() ||
                        memo.trim() ||
                        externalUrl.trim(),
                )));

    // 인앱 미리보기 상태
    const [previewTarget, setPreviewTarget] = useState<{
        doc: TravelDocument;
        blobUrl: string;
        mimeType: string;
    } | null>(null);
    const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

    const { requestClose } = useEscapeKey(
        true,
        () => {
            if (previewTarget?.blobUrl) {
                URL.revokeObjectURL(previewTarget.blobUrl);
            }
            onClose();
        },
        { isDirty },
    );

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

    const handleFilesSelected = (fileList: FileList | File[]) => {
        const arr = Array.from(fileList).filter(
            (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || f.type.startsWith('image/'),
        );
        if (arr.length === 0) return;

        const mapped = arr.map((file) => {
            const inferred = inferDocumentMetaFromFilename(file.name, travel.startDate, totalDays);
            return {
                id: uuidv4(),
                file,
                title: inferred.title,
                category: inferred.category || category,
                dayIndex: inferred.dayIndex ?? dayIndex,
            };
        });

        setQueuedFiles((prev) => [...prev, ...mapped]);

        // 첫 파일 추가 시 상단 기본 폼에도 스마트 추론값 자동 반영
        if (queuedFiles.length === 0 && mapped.length > 0) {
            const firstInferred = inferDocumentMetaFromFilename(arr[0].name, travel.startDate, totalDays);
            if (!title.trim()) {
                setTitle(arr.length > 1 ? `${firstInferred.title} 외 ${arr.length - 1}건` : firstInferred.title);
            }
            if (firstInferred.category) setCategory(firstInferred.category);
            if (firstInferred.dayIndex && !dayIndex) setDayIndex(firstInferred.dayIndex);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setIsSubmitting(true);
        setUploadProgress(null);

        try {
            if (addMode === 'r2') {
                if (queuedFiles.length === 0) {
                    throw new Error('업로드할 PDF 또는 이미지 파일을 선택해 주세요.');
                }

                if (queuedFiles.length === 1) {
                    const only = queuedFiles[0];
                    const created = await uploadTravelDocumentFile({
                        travelId: travel.id,
                        ownerId: travel.ownerId,
                        file: only.file,
                        category,
                        title: title.trim() || only.title,
                        reservationNumber,
                        provider,
                        visibility,
                        dayIndex: dayIndex ? Number(dayIndex) : undefined,
                        memo,
                    });
                    setDocs((prev) => [created, ...prev]);
                } else if (multiUploadMode === 'merge') {
                    setUploadProgress(`PDF ${queuedFiles.length}개 파일 병합 중...`);
                    const mergedTitle = title.trim() || queuedFiles[0].title || '통합 서류';
                    const mergedPdf = await mergeFilesToPdf(
                        queuedFiles.map((q) => q.file),
                        mergedTitle,
                    );
                    setUploadProgress('암호화 업로드 중...');
                    const created = await uploadTravelDocumentFile({
                        travelId: travel.id,
                        ownerId: travel.ownerId,
                        file: mergedPdf,
                        category,
                        title: mergedTitle,
                        reservationNumber,
                        provider,
                        visibility,
                        dayIndex: dayIndex ? Number(dayIndex) : undefined,
                        memo,
                    });
                    setDocs((prev) => [created, ...prev]);
                } else {
                    const uploaded: TravelDocument[] = [];
                    for (let i = 0; i < queuedFiles.length; i++) {
                        const q = queuedFiles[i];
                        setUploadProgress(`일괄 업로드 중 (${i + 1}/${queuedFiles.length})...`);
                        const created = await uploadTravelDocumentFile({
                            travelId: travel.id,
                            ownerId: travel.ownerId,
                            file: q.file,
                            category: q.category,
                            title: q.title.trim() || q.file.name,
                            reservationNumber,
                            provider,
                            visibility,
                            dayIndex: q.dayIndex ? Number(q.dayIndex) : undefined,
                            memo,
                        });
                        uploaded.push(created);
                    }
                    setDocs((prev) => [...uploaded.reverse(), ...prev]);
                }
            } else {
                if (!title.trim() || !externalUrl.trim()) {
                    throw new Error('문서 제목과 Google Drive(또는 외부) 링크를 입력해 주세요.');
                }
                const created = await addTravelDocumentLink({
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
                setDocs((prev) => [created, ...prev]);
            }

            setIsAdding(false);
            setTitle('');
            setProvider('');
            setReservationNumber('');
            setDayIndex('');
            setMemo('');
            setQueuedFiles([]);
            setExternalUrl('');
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setIsSubmitting(false);
            setUploadProgress(null);
        }
    };

    const openEditModal = (doc: TravelDocument) => {
        setEditingDoc(doc);
        setEditTitle(doc.title);
        setEditCategory(doc.category);
        setEditDayIndex(doc.dayIndex ?? '');
        setEditProvider(doc.provider || '');
        setEditResNo(doc.reservationNumber || '');
        setEditMemo(doc.memo || '');
        setEditUrl(doc.externalUrl || '');
        setEditVisibility(doc.visibility);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDoc || !editTitle.trim()) return;
        setIsSavingEdit(true);
        setErrorMsg(null);
        try {
            const updated = await updateTravelDocument({
                travelId: travel.id,
                fileId: editingDoc.id,
                ownerId: travel.ownerId,
                title: editTitle.trim(),
                category: editCategory,
                dayIndex: editDayIndex ? Number(editDayIndex) : null,
                provider: editProvider,
                reservationNumber: editResNo,
                memo: editMemo,
                externalUrl: editingDoc.storageType === 'link' ? editUrl : undefined,
                visibility: editVisibility,
            });
            setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditingDoc(null);
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setIsSavingEdit(false);
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

    const filteredDocs = useMemo(
        () =>
            docs.filter((d) => {
                if (filterCat !== 'ALL' && d.category !== filterCat) return false;
                if (filterDay === 'COMMON' && Boolean(d.dayIndex)) return false;
                if (typeof filterDay === 'number' && d.dayIndex !== filterDay) return false;
                return true;
            }),
        [docs, filterCat, filterDay],
    );

    // 같은 일차 + 같은 업체/숙소명(provider)이 2건 이상이면 하나의 그룹 카드로 묶어 표시
    const groupedEntries = useMemo(() => {
        const providerCounts = new Map<string, number>();
        filteredDocs.forEach((d) => {
            const p = d.provider?.trim().toLowerCase();
            if (!p) return;
            const key = `${d.dayIndex ?? 'common'}::${p}`;
            providerCounts.set(key, (providerCounts.get(key) || 0) + 1);
        });

        const result: Array<
            | { kind: 'single'; doc: TravelDocument }
            | { kind: 'group'; key: string; provider: string; dayIndex?: number; items: TravelDocument[] }
        > = [];
        const groupMap = new Map<string, { kind: 'group'; key: string; provider: string; dayIndex?: number; items: TravelDocument[] }>();

        filteredDocs.forEach((d) => {
            const p = d.provider?.trim();
            const key = p ? `${d.dayIndex ?? 'common'}::${p.toLowerCase()}` : '';
            if (key && (providerCounts.get(key) || 0) >= 2) {
                let grp = groupMap.get(key);
                if (!grp) {
                    grp = { kind: 'group', key, provider: p!, dayIndex: d.dayIndex, items: [] };
                    groupMap.set(key, grp);
                    result.push(grp);
                }
                grp.items.push(d);
            } else {
                result.push({ kind: 'single', doc: d });
            }
        });

        return result;
    }, [filteredDocs]);

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
                            onClick={requestClose}
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
                                <div className="space-y-2.5 text-xs">
                                    <label className="block font-semibold text-gray-700 dark:text-gray-300">
                                        파일 선택 * (여러 PDF·이미지 동시 선택 / 드래그 앤 드롭 가능 · 파일당 최대 10MB)
                                    </label>
                                    <div
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setIsDraggingFiles(true);
                                        }}
                                        onDragLeave={() => setIsDraggingFiles(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDraggingFiles(false);
                                            if (e.dataTransfer.files?.length) {
                                                handleFilesSelected(e.dataTransfer.files);
                                            }
                                        }}
                                        className={`p-3 rounded-xl border-2 border-dashed transition-colors ${
                                            isDraggingFiles
                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                                                : 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900'
                                        }`}
                                    >
                                        <input
                                            type="file"
                                            multiple
                                            accept=".pdf,image/jpeg,image/png,image/webp"
                                            onChange={(e) => {
                                                if (e.target.files?.length) {
                                                    handleFilesSelected(e.target.files);
                                                }
                                                e.target.value = '';
                                            }}
                                            className="w-full text-xs"
                                        />
                                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                            파일명(보험, 항공, 호텔, 일차 등)을 분석해 카테고리와 일차를 자동으로 추천합니다.
                                        </p>
                                    </div>

                                    {queuedFiles.length > 0 && (
                                        <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800/70 space-y-2.5">
                                            {queuedFiles.length > 1 && (
                                                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-zinc-800">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => setMultiUploadMode('merge')}
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                                                multiUploadMode === 'merge'
                                                                    ? 'bg-indigo-600 text-white'
                                                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            📄 하나의 PDF로 합쳐서 올리기 ({queuedFiles.length}개)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMultiUploadMode('batch')}
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                                                multiUploadMode === 'batch'
                                                                    ? 'bg-indigo-600 text-white'
                                                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            📚 개별 파일 한 번에 올리기 ({queuedFiles.length}건)
                                                        </button>
                                                    </div>
                                                    {multiUploadMode === 'batch' && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setQueuedFiles((prev) =>
                                                                    prev.map((q) => ({
                                                                        ...q,
                                                                        category,
                                                                        dayIndex,
                                                                    })),
                                                                )
                                                            }
                                                            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            상단 카테고리·일차 일괄 적용
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                                {queuedFiles.map((q, idx) => (
                                                    <div
                                                        key={q.id}
                                                        className="flex flex-col sm:flex-row sm:items-center gap-1.5 p-2 rounded-lg bg-gray-50 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800"
                                                    >
                                                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 w-5 shrink-0">
                                                            {idx + 1}.
                                                        </span>
                                                        {queuedFiles.length > 1 && multiUploadMode === 'batch' ? (
                                                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-1.5 min-w-0">
                                                                <input
                                                                    type="text"
                                                                    value={q.title}
                                                                    onChange={(e) =>
                                                                        setQueuedFiles((prev) =>
                                                                            prev.map((item) =>
                                                                                item.id === q.id ? { ...item, title: e.target.value } : item,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="sm:col-span-6 px-2 py-1 text-[11px] rounded bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                                />
                                                                <select
                                                                    value={q.category}
                                                                    onChange={(e) =>
                                                                        setQueuedFiles((prev) =>
                                                                            prev.map((item) =>
                                                                                item.id === q.id
                                                                                    ? { ...item, category: e.target.value as DocumentCategory }
                                                                                    : item,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="sm:col-span-3 px-1.5 py-1 text-[11px] rounded bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                                >
                                                                    {CATEGORIES.map((c) => (
                                                                        <option key={c} value={c}>
                                                                            {c}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <select
                                                                    value={q.dayIndex}
                                                                    onChange={(e) =>
                                                                        setQueuedFiles((prev) =>
                                                                            prev.map((item) =>
                                                                                item.id === q.id
                                                                                    ? {
                                                                                          ...item,
                                                                                          dayIndex: e.target.value ? Number(e.target.value) : '',
                                                                                      }
                                                                                    : item,
                                                                            ),
                                                                        )
                                                                    }
                                                                    className="sm:col-span-3 px-1.5 py-1 text-[11px] rounded bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                                >
                                                                    <option value="">공통</option>
                                                                    {Array.from({ length: totalDays }, (_, i) => (
                                                                        <option key={i + 1} value={i + 1}>
                                                                            {i + 1}일차
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                                <span className="truncate text-[11px] font-medium text-gray-800 dark:text-gray-200">
                                                                    {q.file.name}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 shrink-0">
                                                                    {(q.file.size / 1024).toFixed(0)} KB
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-1 shrink-0 justify-end">
                                                            {queuedFiles.length > 1 && multiUploadMode === 'merge' && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        disabled={idx === 0}
                                                                        onClick={() =>
                                                                            setQueuedFiles((prev) => {
                                                                                const next = [...prev];
                                                                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                                                return next;
                                                                            })
                                                                        }
                                                                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                                                        title="위로"
                                                                    >
                                                                        <ArrowUp size={12} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={idx === queuedFiles.length - 1}
                                                                        onClick={() =>
                                                                            setQueuedFiles((prev) => {
                                                                                const next = [...prev];
                                                                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                                                return next;
                                                                            })
                                                                        }
                                                                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                                                        title="아래로"
                                                                    >
                                                                        <ArrowDown size={12} />
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setQueuedFiles((prev) => prev.filter((item) => item.id !== q.id))}
                                                                className="p-1 text-gray-400 hover:text-red-500"
                                                                title="대기열에서 제거"
                                                            >
                                                                <X size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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

                            <div className="flex items-center justify-end gap-2 pt-1">
                                {uploadProgress && (
                                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mr-auto">
                                        {uploadProgress}
                                    </span>
                                )}
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
                                    <span>
                                        {queuedFiles.length > 1
                                            ? multiUploadMode === 'merge'
                                                ? 'PDF 합쳐서 저장'
                                                : `${queuedFiles.length}건 일괄 저장`
                                            : '저장하기'}
                                    </span>
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
                            {groupedEntries.map((entry) => {
                                const renderDocCard = (doc: TravelDocument, nested = false) => (
                                    <div
                                        key={doc.id}
                                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                            nested
                                                ? 'border-gray-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                                : 'border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/50'
                                        }`}
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
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(doc)}
                                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors shrink-0"
                                                        title="서류 정보 수정"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(doc)}
                                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                                                        title="삭제"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );

                                if (entry.kind === 'single') {
                                    return renderDocCard(entry.doc, false);
                                }

                                return (
                                    <div
                                        key={entry.key}
                                        className="p-3 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2"
                                    >
                                        <div className="flex items-center justify-between gap-2 px-1">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                                                <Layers size={14} className="text-indigo-600 dark:text-indigo-400" />
                                                {entry.dayIndex && <span>{entry.dayIndex}일차 ·</span>}
                                                <span>{entry.provider}</span>
                                            </div>
                                            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                                                {entry.items.length}개 묶음
                                            </span>
                                        </div>
                                        <div className="space-y-2">{entry.items.map((d) => renderDocCard(d, true))}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 서류 정보 수정 오버레이 */}
                {editingDoc && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                        <form
                            onSubmit={handleSaveEdit}
                            className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg border border-gray-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="px-5 py-3.5 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                                <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">서류 정보 수정</h4>
                                <button
                                    type="button"
                                    onClick={() => setEditingDoc(null)}
                                    className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="p-4 sm:p-5 space-y-3 text-xs overflow-y-auto max-h-[75vh]">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">카테고리</label>
                                        <select
                                            value={editCategory}
                                            onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
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
                                            required
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                    </div>
                                </div>

                                {editingDoc.storageType === 'link' && (
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">외부 링크 URL *</label>
                                        <input
                                            type="url"
                                            required
                                            value={editUrl}
                                            onChange={(e) => setEditUrl(e.target.value)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">예약번호 / PNR</label>
                                        <input
                                            type="text"
                                            value={editResNo}
                                            onChange={(e) => setEditResNo(e.target.value)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">예약처 / 업체 (묶음 기준)</label>
                                        <input
                                            type="text"
                                            value={editProvider}
                                            onChange={(e) => setEditProvider(e.target.value)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">연결 일차</label>
                                        <select
                                            value={editDayIndex}
                                            onChange={(e) => setEditDayIndex(e.target.value ? Number(e.target.value) : '')}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">공유/공개 범위</label>
                                        <select
                                            value={editVisibility}
                                            onChange={(e) => setEditVisibility(e.target.value as DocumentVisibility)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        >
                                            <option value="owner_only">{VISIBILITY_LABELS.owner_only}</option>
                                            <option value="collaborators">{VISIBILITY_LABELS.collaborators}</option>
                                            <option value="all_shared">{VISIBILITY_LABELS.all_shared}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">메모</label>
                                        <input
                                            type="text"
                                            value={editMemo}
                                            onChange={(e) => setEditMemo(e.target.value)}
                                            className="w-full p-2 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="px-5 py-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingDoc(null)}
                                    className="px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-zinc-800 rounded-lg"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingEdit}
                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                                >
                                    {isSavingEdit && <Loader2 size={13} className="animate-spin" />}
                                    <span>수정 저장</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}

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
