import React, { useState, useMemo, useRef } from 'react';
import {
    X,
    Copy,
    ClipboardPaste,
    RotateCcw,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Bot,
    ArrowRight,
    Save,
    Search,
    ChevronUp,
    ChevronDown,
    Replace,
} from 'lucide-react';
import { validateTravelJson } from '../../../utils/jsonValidator';
import { copyToClipboard, readFromClipboard } from '../../../utils/clipboard';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import type { TravelExportData } from '../../../types/travel';

interface JsonEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentData: TravelExportData;
    onSave: (newData: TravelExportData) => Promise<void> | void;
}

/**
 * 기존 여행 일정을 전체 JSON 형태로 조회, 수정 및 동기화할 수 있는 모달 컴포넌트입니다.
 * 클립보드 양방향 연동(복사/붙여넣기) 및 Gemini 재수정 프롬프트를 지원합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
const JsonEditModal: React.FC<JsonEditModalProps> = (props) => {
    if (!props.isOpen) return null;
    return <JsonEditModalContent {...props} />;
};

const JsonEditModalContent: React.FC<JsonEditModalProps> = ({ onClose, currentData, onSave }) => {
    const formattedInitial = useMemo(() => JSON.stringify(currentData, null, 2), [currentData]);
    const [jsonText, setJsonText] = useState(formattedInitial);
    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const { requestClose } = useEscapeKey(true, onClose, { isDirty: jsonText !== formattedInitial });

    // 찾아 바꾸기 상태
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const findInputRef = useRef<HTMLInputElement>(null);
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);

    const matches = useMemo(() => {
        if (!findText) return [];
        const haystack = caseSensitive ? jsonText : jsonText.toLowerCase();
        const needle = caseSensitive ? findText : findText.toLowerCase();
        const list: Array<{ start: number; end: number }> = [];
        let from = 0;
        while (from <= haystack.length - needle.length) {
            const idx = haystack.indexOf(needle, from);
            if (idx === -1) break;
            list.push({ start: idx, end: idx + needle.length });
            from = idx + Math.max(1, needle.length);
        }
        return list;
    }, [jsonText, findText, caseSensitive]);

    const jumpToMatch = (idx: number) => {
        if (matches.length === 0) return;
        const normalizedIdx = ((idx % matches.length) + matches.length) % matches.length;
        setActiveMatchIdx(normalizedIdx);
        const target = matches[normalizedIdx];
        const el = textareaRef.current;
        if (!el) return;

        el.focus();
        el.setSelectionRange(target.start, target.end);
        // 매치 위치가 보이도록 대략적인 줄 위치로 스크롤
        const linesBefore = jsonText.slice(0, target.start).split('\n').length - 1;
        const lineHeight = 22;
        el.scrollTop = Math.max(0, linesBefore * lineHeight - el.clientHeight / 3);
    };

    const handleReplaceCurrent = () => {
        if (matches.length === 0) return;
        const safeIdx = activeMatchIdx < matches.length ? activeMatchIdx : 0;
        const target = matches[safeIdx];
        const nextText = jsonText.slice(0, target.start) + replaceText + jsonText.slice(target.end);
        setJsonText(nextText);
        showToast('선택된 항목을 바꾸었습니다.');
        window.setTimeout(() => {
            const el = textareaRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(target.start, target.start + replaceText.length);
            }
        }, 0);
    };

    const handleReplaceAll = () => {
        if (!findText || matches.length === 0) return;
        const count = matches.length;
        let result = '';
        let cursor = 0;
        for (const m of matches) {
            result += jsonText.slice(cursor, m.start) + replaceText;
            cursor = m.end;
        }
        result += jsonText.slice(cursor);
        setJsonText(result);
        setActiveMatchIdx(0);
        showToast(`총 ${count}건을 바꾸었습니다.`);
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2500);
    };

    // 텍스트 기반 파생 유효성 상태 (useMemo로 렌더링 시 계산)
    const validation = useMemo(() => {
        if (!jsonText.trim()) {
            return { isValid: false, error: 'JSON 내용이 비어 있습니다.' };
        }
        return validateTravelJson(jsonText);
    }, [jsonText]);

    // 1. 전체 JSON 클립보드 복사
    const handleCopyAll = async () => {
        const success = await copyToClipboard(jsonText);
        if (success) {
            showToast('전체 일정이 클립보드에 복사되었습니다! Gemini에 붙여넣어 수정을 요청해 보세요.');
        } else {
            showToast('복사에 실패했습니다.');
        }
    };

    // 2. 클립보드로부터 붙여넣기
    const handlePaste = async () => {
        const text = await readFromClipboard();
        if (text) {
            setJsonText(text);
            showToast('클립보드 내용을 붙여넣었습니다.');
        } else {
            showToast('클립보드 접근 권한이 없거나 비어 있습니다. 수동으로 붙여넣어 주세요.');
        }
    };

    // 3. 변경 취소 (원래대로 되돌리기)
    const handleReset = () => {
        setJsonText(formattedInitial);
        showToast('원본 일정 데이터로 복원했습니다.');
    };

    // 4. JSON 자동 정렬
    const handleFormat = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
            showToast('JSON 정렬이 완료되었습니다.');
        } catch {
            showToast('JSON 구문 오류로 정렬할 수 없습니다.');
        }
    };

    // 5. Gemini 수정 요청용 프롬프트 복사
    const handleCopyGeminiModifyPrompt = async () => {
        const prompt = `당신은 여행 일정 플래너 전문가입니다.
아래의 현재 J-Plan 일정 JSON 데이터를 바탕으로 일정을 수정/보완해 주세요.

### [현재 여행 JSON 데이터]
\`\`\`json
${jsonText}
\`\`\`

### [수정 요청 가이드]
1. 기존의 'travel.id', 'version' 값은 동일하게 유지해 주세요.
2. 추가하거나 변경된 일정은 기존 'itineraries' 배열 구조 규격에 맞추어 주세요.
3. 결과물은 반드시 전체 내용을 포함한 단일 \`\`\`json 코드 블록으로 출력해 주세요.`;

        const success = await copyToClipboard(prompt);
        if (success) {
            showToast('Gemini 일정 수정용 프롬프트가 복사되었습니다!');
        } else {
            showToast('프롬프트 복사에 실패했습니다.');
        }
    };

    // 6. 최종 저장 및 적용
    const handleSave = async () => {
        if (!validation.isValid || !validation.data) {
            showToast('올바른 J-Plan JSON 데이터를 입력해 주세요.');
            return;
        }

        try {
            setIsSaving(true);
            // 기존 travel.id 유지 보장
            const finalData: TravelExportData = {
                ...validation.data,
                travel: {
                    ...validation.data.travel,
                    id: currentData.travel.id,
                },
                itineraries: validation.data.itineraries.map((iti) => ({
                    ...iti,
                    travelId: currentData.travel.id,
                })),
                accommodations: validation.data.accommodations.map((acc) => ({
                    ...acc,
                    travelId: currentData.travel.id,
                })),
            };

            await onSave(finalData);
            showToast('일정이 성공적으로 수정 및 저장되었습니다!');
            onClose();
        } catch (error) {
            console.error('[JsonEditModal] 저장 실패:', error);
            showToast('일정 저장 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    // 변경 차이점 계산
    const currentItiCount = currentData.itineraries?.length || 0;
    const currentAccCount = currentData.accommodations?.length || 0;
    const newItiCount = validation.data?.itineraries?.length || 0;
    const newAccCount = validation.data?.accommodations?.length || 0;
    const itiDiff = newItiCount - currentItiCount;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            {/* 토스트 알림 */}
            {toastMessage && (
                <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-zinc-900/90 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs sm:text-sm font-medium border border-zinc-700 backdrop-blur-md animate-bounce">{toastMessage}</div>
            )}

            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-3xl h-[85vh] max-h-[800px] min-h-[500px] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">JSON으로 일정 수정하기</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">현재 여행의 모든 일정/숙소를 JSON 형태로 직접 수정하거나 일괄 교체합니다.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="닫기"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 툴바 & 본문 */}
                <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0 overflow-y-auto space-y-3 sm:space-y-4">
                    {/* 상단 툴바 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={handleCopyAll}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                                title="현재 JSON 전체를 클립보드로 복사합니다."
                            >
                                <Copy size={14} />
                                <span>전체 복사</span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePaste}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95"
                                title="외부에서 수정한 JSON을 붙여넣습니다."
                            >
                                <ClipboardPaste size={14} />
                                <span>붙여넣기</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleFormat}
                                className="flex items-center space-x-1 px-2.5 py-1.5 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg text-xs sm:text-sm transition-colors"
                                title="JSON 들여쓰기 자동 정렬"
                            >
                                <Sparkles size={14} />
                                <span className="hidden sm:inline">정렬</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                className="flex items-center space-x-1 px-2.5 py-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg text-xs sm:text-sm transition-colors"
                                title="원래 내용으로 복구"
                            >
                                <RotateCcw size={14} />
                                <span className="hidden sm:inline">되돌리기</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFindOpen((prev) => {
                                        const next = !prev;
                                        if (next) {
                                            window.setTimeout(() => findInputRef.current?.focus(), 0);
                                        }
                                        return next;
                                    });
                                }}
                                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                                    isFindOpen
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
                                }`}
                                title="찾기 및 바꾸기 (Ctrl/Cmd+F)"
                            >
                                <Search size={14} />
                                <span>찾기·바꾸기</span>
                            </button>
                        </div>

                        {/* Gemini 수정 요청 프롬프트 복사 */}
                        <button
                            type="button"
                            onClick={handleCopyGeminiModifyPrompt}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300 hover:bg-purple-100 rounded-lg text-xs sm:text-sm font-medium transition-all"
                            title="현재 일정을 포함한 Gemini 수정 질문 템플릿 복사"
                        >
                            <Bot size={14} />
                            <span>Gemini 수정 프롬프트 복사</span>
                        </button>
                    </div>

                    {/* 찾아 바꾸기 바 */}
                    {isFindOpen && (
                        <div className="shrink-0 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <div className="relative flex-1 min-w-[160px]">
                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        ref={findInputRef}
                                        type="text"
                                        value={findText}
                                        onChange={(e) => {
                                            setFindText(e.target.value);
                                            setActiveMatchIdx(0);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                jumpToMatch(e.shiftKey ? activeMatchIdx - 1 : activeMatchIdx + 1);
                                            }
                                        }}
                                        placeholder="찾을 내용..."
                                        className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none focus:border-amber-500 font-mono"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCaseSensitive((prev) => !prev)}
                                    className={`px-2 py-1.5 rounded-lg border font-mono font-bold transition-colors ${
                                        caseSensitive
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700'
                                    }`}
                                    title="대소문자 구분"
                                >
                                    Aa
                                </button>
                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 min-w-[52px] text-center">
                                    {matches.length > 0
                                        ? `${(activeMatchIdx % matches.length) + 1} / ${matches.length}`
                                        : findText
                                          ? '0건'
                                          : '-'}
                                </span>
                                <button
                                    type="button"
                                    disabled={matches.length === 0}
                                    onClick={() => jumpToMatch(activeMatchIdx - 1)}
                                    className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                                    title="이전 찾기"
                                >
                                    <ChevronUp size={13} />
                                </button>
                                <button
                                    type="button"
                                    disabled={matches.length === 0}
                                    onClick={() => jumpToMatch(activeMatchIdx + 1)}
                                    className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                                    title="다음 찾기"
                                >
                                    <ChevronDown size={13} />
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                <div className="relative flex-1 min-w-[160px]">
                                    <Replace size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={replaceText}
                                        onChange={(e) => setReplaceText(e.target.value)}
                                        placeholder="바꿀 내용..."
                                        className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none focus:border-amber-500 font-mono"
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={matches.length === 0}
                                    onClick={handleReplaceCurrent}
                                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-200 font-semibold disabled:opacity-40"
                                >
                                    바꾸기
                                </button>
                                <button
                                    type="button"
                                    disabled={matches.length === 0}
                                    onClick={handleReplaceAll}
                                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-40"
                                >
                                    모두 바꾸기 ({matches.length})
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 에디터 (flex-1로 남은 공간 100% 꽉 채움) */}
                    <div className="flex-1 min-h-[220px] flex flex-col">
                        <textarea
                            ref={textareaRef}
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
                                    e.preventDefault();
                                    setIsFindOpen(true);
                                    window.setTimeout(() => findInputRef.current?.focus(), 0);
                                }
                            }}
                            rows={15}
                            className="flex-1 w-full min-h-[200px] p-3 sm:p-4 font-mono text-xs sm:text-sm bg-gray-50 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-gray-800 dark:text-gray-200 resize-none leading-relaxed"
                            spellCheck={false}
                        />
                    </div>

                    {/* 상태 및 변경 요약 배너 (shrink-0으로 하단 고정) */}
                    {validation.isValid && validation.data ? (
                        <div className="shrink-0 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                            <div className="flex items-center space-x-2">
                                <CheckCircle2
                                    size={16}
                                    className="text-emerald-600 dark:text-emerald-400 shrink-0"
                                />
                                <span className="font-semibold">{validation.data.travel.name}</span>
                                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                    ({validation.data.travel.startDate} ~ {validation.data.travel.endDate})
                                </span>
                            </div>
                            <div className="flex items-center space-x-3 text-xs">
                                <span>
                                    일정: {currentItiCount}개{' '}
                                    <ArrowRight
                                        size={12}
                                        className="inline mx-0.5"
                                    />{' '}
                                    <strong>{newItiCount}개</strong>
                                    {itiDiff !== 0 && <span className={`ml-1 font-bold ${itiDiff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>({itiDiff > 0 ? `+${itiDiff}` : itiDiff})</span>}
                                </span>
                                <span>
                                    숙소: {currentAccCount}개{' '}
                                    <ArrowRight
                                        size={12}
                                        className="inline mx-0.5"
                                    />{' '}
                                    <strong>{newAccCount}개</strong>
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-xl text-red-700 dark:text-red-300 flex items-start space-x-2 text-xs sm:text-sm">
                            <AlertCircle
                                size={16}
                                className="text-red-500 shrink-0 mt-0.5"
                            />
                            <span>{validation.error || '올바른 JSON 구문을 입력해 주세요.'}</span>
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-end space-x-2 shrink-0">
                    <button
                        type="button"
                        onClick={requestClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!validation.isValid || isSaving}
                        className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm ${
                            validation.isValid && !isSaving ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30 active:scale-95' : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed'
                        }`}
                    >
                        <Save size={16} />
                        <span>{isSaving ? '저장 중...' : '변경사항 적용 및 저장'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JsonEditModal;
