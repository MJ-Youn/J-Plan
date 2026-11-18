import React, { useEffect, useState } from 'react';
import {
    X,
    CheckSquare,
    Square,
    Plus,
    Trash2,
    Paperclip,
    Eye,
    ExternalLink,
    Sparkles,
    Save,
    FolderLock,
    Loader2,
    Edit2,
    Check,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { ChecklistCategory, ChecklistItem, Travel, TravelDocument } from '../../../types/travel';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useTravelStore } from '../../../store/travelStore';
import { fetchDocumentBlobUrl, fetchTravelDocuments } from '../../../utils/documentService';

interface ChecklistModalProps {
    isOpen: boolean;
    onClose: () => void;
    travel: Travel;
    canEdit: boolean;
    shareId?: string;
    onOpenDocuments?: () => void;
}

const CHECKLIST_CATEGORIES: ChecklistCategory[] = ['서류·예약', '전자기기', '의류·세면', '상비약', '현지준비', '기타'];

const OVERSEAS_CAR_TEMPLATE: Array<{ category: ChecklistCategory; title: string }> = [
    { category: '서류·예약', title: '여권 (유효기간 6개월 이상 확인)' },
    { category: '서류·예약', title: '항공 e-티켓 및 수하물 규정 확인' },
    { category: '서류·예약', title: '숙소 예약 바우처' },
    { category: '서류·예약', title: '렌터카 바우처 & 국제운전면허증 & 한국 면허증' },
    { category: '서류·예약', title: '입국신고서 / Visit Japan Web QR 캡처' },
    { category: '서류·예약', title: '여행자 보험 가입 및 증권 저장' },
    { category: '전자기기', title: 'eSIM / 유심 / 포켓와이파이' },
    { category: '전자기기', title: '멀티어댑터(돼지코) & 보조배터리 & 충전 케이블' },
    { category: '현지준비', title: '해외결제 카드 & 현지 통화 환전' },
    { category: '상비약', title: '개인 상비약 (소화제, 진통제, 밴드 등)' },
];

const DOMESTIC_TEMPLATE: Array<{ category: ChecklistCategory; title: string }> = [
    { category: '서류·예약', title: '신분증 / 운전면허증' },
    { category: '서류·예약', title: '숙소 및 교통(기차/렌터카) 예약 확인' },
    { category: '전자기기', title: '충전기 & 보조배터리' },
    { category: '의류·세면', title: '여벌 의류 및 세면도구' },
    { category: '상비약', title: '개인 상비약' },
];

/**
 * 여행 준비물 및 출발 전 체크리스트 모달입니다.
 * 서류 보관함(TravelDocument)과 연동해 바우처·e-티켓을 바로 연결하고 열람할 수 있습니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ChecklistModal: React.FC<ChecklistModalProps> = (props) => {
    if (!props.isOpen) return null;
    return <ChecklistModalContent {...props} />;
};

const ChecklistModalContent: React.FC<ChecklistModalProps> = ({
    onClose,
    travel,
    canEdit,
    shareId,
    onOpenDocuments,
}) => {
    const { checklists, setChecklists, saveTravelDetail, hasUnsavedChanges } = useTravelStore();

    const [docs, setDocs] = useState<TravelDocument[]>([]);
    const [filterCat, setFilterCat] = useState<ChecklistCategory | 'ALL'>('ALL');
    const [newTitle, setNewTitle] = useState('');
    const [newCat, setNewCat] = useState<ChecklistCategory>('서류·예약');
    const [newAssignee, setNewAssignee] = useState('');
    const [newLinkedDocId, setNewLinkedDocId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [previewTarget, setPreviewTarget] = useState<{ title: string; blobUrl: string; mimeType: string } | null>(null);
    const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

    // 인라인 수정 상태
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCat, setEditCat] = useState<ChecklistCategory>('서류·예약');
    const [editTitle, setEditTitle] = useState('');
    const [editAssignee, setEditAssignee] = useState('');
    const [editMemo, setEditMemo] = useState('');

    useEscapeKey(true, onClose, {
        isDirty: Boolean(editingId || newTitle.trim() || newAssignee.trim()),
    });

    useEffect(() => {
        let cancelled = false;
        const loadDocs = async () => {
            try {
                const list = await fetchTravelDocuments({
                    travelId: travel.id,
                    ownerId: travel.ownerId,
                    shareId,
                });
                if (!cancelled) {
                    setDocs(list);
                }
            } catch {
                // 서류 목록 조회 실패 시 연동 없이 체크리스트만 사용
            }
        };
        void loadDocs();
        return () => {
            cancelled = true;
        };
    }, [travel.id, travel.ownerId, shareId]);

    const totalCount = checklists.length;
    const doneCount = checklists.filter((c) => c.isChecked).length;
    const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const handleToggle = (id: string) => {
        if (!canEdit) return;
        setChecklists(
            travel.id,
            checklists.map((c) => (c.id === id ? { ...c, isChecked: !c.isChecked } : c)),
        );
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit || !newTitle.trim()) return;
        const item: ChecklistItem = {
            id: uuidv4(),
            category: newCat,
            title: newTitle.trim(),
            isChecked: false,
            assignee: newAssignee.trim() || undefined,
            linkedDocumentId: newLinkedDocId || undefined,
        };
        setChecklists(travel.id, [...checklists, item]);
        setNewTitle('');
        setNewAssignee('');
        setNewLinkedDocId('');
    };

    const handleDelete = (id: string) => {
        if (!canEdit) return;
        setChecklists(
            travel.id,
            checklists.filter((c) => c.id !== id),
        );
    };

    const startEditingItem = (item: ChecklistItem) => {
        setEditingId(item.id);
        setEditCat(item.category);
        setEditTitle(item.title);
        setEditAssignee(item.assignee || '');
        setEditMemo(item.memo || '');
    };

    const handleSaveEditItem = (id: string) => {
        if (!canEdit || !editTitle.trim()) return;
        setChecklists(
            travel.id,
            checklists.map((c) =>
                c.id === id
                    ? {
                          ...c,
                          category: editCat,
                          title: editTitle.trim(),
                          assignee: editAssignee.trim() || undefined,
                          memo: editMemo.trim() || undefined,
                      }
                    : c,
            ),
        );
        setEditingId(null);
    };

    const handleLinkDoc = (itemId: string, docId: string) => {
        if (!canEdit) return;
        setChecklists(
            travel.id,
            checklists.map((c) => (c.id === itemId ? { ...c, linkedDocumentId: docId || undefined } : c)),
        );
    };

    const handleApplyTemplate = (template: Array<{ category: ChecklistCategory; title: string }>) => {
        if (!canEdit) return;
        const existingTitles = new Set(checklists.map((c) => c.title.trim()));
        const additions: ChecklistItem[] = template
            .filter((t) => !existingTitles.has(t.title))
            .map((t) => ({
                id: uuidv4(),
                category: t.category,
                title: t.title,
                isChecked: false,
            }));
        if (additions.length === 0) {
            alert('이미 모든 기본 항목이 추가되어 있습니다.');
            return;
        }
        setChecklists(travel.id, [...checklists, ...additions]);
    };

    const handleOpenLinkedDoc = async (doc: TravelDocument) => {
        if (doc.storageType === 'link' && doc.externalUrl) {
            window.open(doc.externalUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        setLoadingDocId(doc.id);
        try {
            const { blobUrl, mimeType } = await fetchDocumentBlobUrl({
                travelId: travel.id,
                fileId: doc.id,
                ownerId: travel.ownerId,
                shareId,
            });
            setPreviewTarget({ title: doc.title, blobUrl, mimeType: mimeType || doc.mimeType || 'application/pdf' });
        } catch (err) {
            alert((err as Error).message || '서류를 열 수 없습니다.');
        } finally {
            setLoadingDocId(null);
        }
    };

    const closePreview = () => {
        if (previewTarget?.blobUrl) {
            URL.revokeObjectURL(previewTarget.blobUrl);
        }
        setPreviewTarget(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveTravelDetail(travel.id);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredItems = filterCat === 'ALL' ? checklists : checklists.filter((c) => c.category === filterCat);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                            <CheckSquare size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">여행 준비 체크리스트</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">준비물을 체크하고 서류 보관함의 바우처·e-티켓과 바로 연결하세요.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {onOpenDocuments && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenDocuments();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold whitespace-nowrap"
                            >
                                <FolderLock size={13} />
                                <span>서류함</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                closePreview();
                                onClose();
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 진행률 바 */}
                <div className="px-4 sm:px-6 py-3 bg-gray-50/70 dark:bg-zinc-950/40 border-b border-gray-100 dark:border-zinc-800 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-700 dark:text-gray-200">
                            준비 완료: {doneCount} / {totalCount}개
                        </span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{progressPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                {/* 본문 */}
                <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
                    {/* 템플릿 빠른 추가 (편집 가능 시) */}
                    {canEdit && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                                <Sparkles size={12} className="text-amber-500" />
                                빠른 템플릿:
                            </span>
                            <button
                                type="button"
                                onClick={() => handleApplyTemplate(OVERSEAS_CAR_TEMPLATE)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 transition-colors"
                            >
                                + 해외 렌터카 여행 세트
                            </button>
                            <button
                                type="button"
                                onClick={() => handleApplyTemplate(DOMESTIC_TEMPLATE)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                + 국내 여행 세트
                            </button>
                        </div>
                    )}

                    {/* 새 항목 추가 폼 */}
                    {canEdit && (
                        <form onSubmit={handleAdd} className="p-3 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40 space-y-2.5 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <select
                                    value={newCat}
                                    onChange={(e) => setNewCat(e.target.value as ChecklistCategory)}
                                    className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                >
                                    {CHECKLIST_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="준비물 또는 할 일 입력 *"
                                    className="sm:col-span-2 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none focus:border-emerald-500"
                                />
                                <input
                                    type="text"
                                    value={newAssignee}
                                    onChange={(e) => setNewAssignee(e.target.value)}
                                    placeholder="담당자 (선택)"
                                    className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-between">
                                <select
                                    value={newLinkedDocId}
                                    onChange={(e) => setNewLinkedDocId(e.target.value)}
                                    className="flex-1 min-w-[180px] p-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none text-xs"
                                >
                                    <option value="">📎 서류 보관함 연결 안 함</option>
                                    {docs.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            📎 [{d.category}] {d.title}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                                >
                                    <Plus size={14} />
                                    <span>추가</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* 카테고리 필터 */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        <button
                            type="button"
                            onClick={() => setFilterCat('ALL')}
                            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                                filterCat === 'ALL'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                            }`}
                        >
                            전체 ({checklists.length})
                        </button>
                        {CHECKLIST_CATEGORIES.map((c) => {
                            const count = checklists.filter((item) => item.category === c).length;
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setFilterCat(c)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                                        filterCat === c
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                    }`}
                                >
                                    {c} ({count})
                                </button>
                            );
                        })}
                    </div>

                    {/* 항목 리스트 */}
                    {filteredItems.length === 0 ? (
                        <div className="py-10 text-center text-xs text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl">
                            체크리스트 항목이 없습니다. 위 템플릿이나 입력폼으로 추가해 보세요!
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredItems.map((item) => {
                                const linkedDoc = item.linkedDocumentId ? docs.find((d) => d.id === item.linkedDocumentId) : undefined;
                                if (editingId === item.id) {
                                    return (
                                        <div
                                            key={item.id}
                                            className="p-3 rounded-xl border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2 text-xs"
                                        >
                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                                <select
                                                    value={editCat}
                                                    onChange={(e) => setEditCat(e.target.value as ChecklistCategory)}
                                                    className="sm:col-span-3 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                >
                                                    {CHECKLIST_CATEGORIES.map((c) => (
                                                        <option key={c} value={c}>
                                                            {c}
                                                        </option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    placeholder="준비물 항목 *"
                                                    className="sm:col-span-6 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none focus:border-emerald-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={editAssignee}
                                                    onChange={(e) => setEditAssignee(e.target.value)}
                                                    placeholder="담당자 (선택)"
                                                    className="sm:col-span-3 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={editMemo}
                                                    onChange={(e) => setEditMemo(e.target.value)}
                                                    placeholder="메모 (선택)"
                                                    className="flex-1 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                                />
                                                <div className="flex justify-end gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingId(null)}
                                                        className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 font-medium"
                                                    >
                                                        취소
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSaveEditItem(item.id)}
                                                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1"
                                                    >
                                                        <Check size={12} />
                                                        적용
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                            item.isChecked
                                                ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-900/40'
                                                : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <button
                                                type="button"
                                                disabled={!canEdit}
                                                onClick={() => handleToggle(item.id)}
                                                className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0 disabled:opacity-60"
                                            >
                                                {item.isChecked ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300">
                                                        {item.category}
                                                    </span>
                                                    {item.assignee && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                                                            {item.assignee}
                                                        </span>
                                                    )}
                                                    <span className={`text-xs sm:text-sm font-semibold ${item.isChecked ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                                        {item.title}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
                                            {linkedDoc ? (
                                                <button
                                                    type="button"
                                                    disabled={loadingDocId === linkedDoc.id}
                                                    onClick={() => handleOpenLinkedDoc(linkedDoc)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-[11px] font-bold whitespace-nowrap"
                                                >
                                                    {loadingDocId === linkedDoc.id ? (
                                                        <Loader2 size={11} className="animate-spin" />
                                                    ) : linkedDoc.storageType === 'link' ? (
                                                        <ExternalLink size={11} />
                                                    ) : (
                                                        <Eye size={11} />
                                                    )}
                                                    <span className="max-w-[120px] truncate">{linkedDoc.title}</span>
                                                </button>
                                            ) : canEdit && docs.length > 0 ? (
                                                <select
                                                    value=""
                                                    onChange={(e) => handleLinkDoc(item.id, e.target.value)}
                                                    className="px-2 py-1 text-[11px] rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 outline-none max-w-[130px]"
                                                >
                                                    <option value="">📎 서류 연결</option>
                                                    {docs.map((d) => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : null}

                                            {canEdit && linkedDoc && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleLinkDoc(item.id, '')}
                                                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                                    title="서류 연결 해제"
                                                >
                                                    <Paperclip size={12} />
                                                </button>
                                            )}

                                            {canEdit && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditingItem(item)}
                                                        className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                                        title="수정"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                        title="삭제"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-4 py-3 sm:px-6 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {hasUnsavedChanges ? '⚠️ 변경사항을 저장하면 동행자와 동기화됩니다.' : '모든 변경사항이 저장되었습니다.'}
                    </span>
                    <div className="flex items-center gap-2">
                        {canEdit && hasUnsavedChanges && (
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={handleSave}
                                className="flex items-center gap-1 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-60 whitespace-nowrap"
                            >
                                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                <span>저장</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                closePreview();
                                onClose();
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>

            {/* 연결된 서류 미리보기 */}
            {previewTarget && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                        <div className="px-5 py-3 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                            <span className="font-bold text-sm truncate">{previewTarget.title}</span>
                            <button type="button" onClick={closePreview} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-zinc-950 flex items-center justify-center p-2">
                            {previewTarget.mimeType.startsWith('image/') ? (
                                <img src={previewTarget.blobUrl} alt={previewTarget.title} className="max-w-full max-h-full object-contain rounded-lg" />
                            ) : (
                                <iframe src={previewTarget.blobUrl} title={previewTarget.title} className="w-full h-full rounded-lg border-0 bg-white" />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChecklistModal;
