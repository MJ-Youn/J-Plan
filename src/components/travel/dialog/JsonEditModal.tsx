import React, { useState, useMemo } from 'react';
import { X, Copy, ClipboardPaste, RotateCcw, Sparkles, CheckCircle2, AlertCircle, Bot, ArrowRight, Save } from 'lucide-react';
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
const JsonEditModal: React.FC<JsonEditModalProps> = ({ isOpen, onClose, currentData, onSave }) => {
    const formattedInitial = useMemo(() => JSON.stringify(currentData, null, 2), [currentData]);
    const [jsonText, setJsonText] = useState(formattedInitial);
    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Mac, Windows, Android 모든 환경의 ESC 키 닫기 처리
    useEscapeKey(isOpen, onClose);

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

    if (!isOpen) return null;

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
                        onClick={onClose}
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

                    {/* 에디터 (flex-1로 남은 공간 100% 꽉 채움) */}
                    <div className="flex-1 min-h-[220px] flex flex-col">
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
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
                        onClick={onClose}
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
