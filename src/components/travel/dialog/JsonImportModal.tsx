import React, { useState, useRef, useMemo, useId } from 'react';
import { X, ClipboardPaste, Sparkles, Trash2, Upload, Bot, CheckCircle2, AlertCircle, Calendar, MapPin, ListOrdered, Home } from 'lucide-react';
import { validateTravelJson } from '../../../utils/jsonValidator';
import { readFromClipboard, copyToClipboard } from '../../../utils/clipboard';
import { generateGeminiPrompt } from '../../../utils/geminiPrompt';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import type { TravelExportData } from '../../../types/travel';

interface JsonImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (data: TravelExportData) => Promise<void> | void;
}

/**
 * 클립보드, 수기 입력, 파일 업로드를 지원하는 통합 JSON 일정 등록 모달입니다.
 * PC 및 모바일 반응형 디자인과 Gemini 프롬프트 복사 기능을 제공합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
const JsonImportModal: React.FC<JsonImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const [jsonText, setJsonText] = useState('');
    const [isPromptCopied, setIsPromptCopied] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileInputId = useId();

    // 토스트 메시지 노출 헬퍼
    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2500);
    };

    // 텍스트 기반 파생 유효성 상태 (useMemo로 불필요한 effect setState 방지)
    const validation = useMemo(() => {
        if (!jsonText.trim()) {
            return { isValid: false };
        }
        return validateTravelJson(jsonText);
    }, [jsonText]);

    const handleClose = () => {
        setJsonText('');
        setIsPromptCopied(false);
        onClose();
    };

    // Mac, Windows, Android 모든 환경의 ESC 키 닫기 처리
    useEscapeKey(isOpen, handleClose);

    if (!isOpen) return null;

    // 1. 클립보드 붙여넣기 핸들러
    const handlePasteClipboard = async () => {
        const text = await readFromClipboard();
        if (text) {
            setJsonText(text);
            showToast('클립보드 내용을 붙여넣었습니다.');
        } else {
            showToast('클립보드 접근 권한이 없거나 비어 있습니다. 텍스트창에 직접 붙여넣어 주세요.');
        }
    };

    // 2. 파일 업로드 핸들러
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setJsonText(content);
            showToast(`"${file.name}" 파일을 불러왔습니다.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    // 3. JSON 자동 정렬 핸들러
    const handleFormatJson = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
            showToast('JSON 정렬이 완료되었습니다.');
        } catch {
            showToast('JSON 구문 오류로 정렬할 수 없습니다.');
        }
    };

    // 4. Gemini 프롬프트 복사 핸들러
    const handleCopyGeminiPrompt = async () => {
        const prompt = generateGeminiPrompt();
        const success = await copyToClipboard(prompt);
        if (success) {
            setIsPromptCopied(true);
            showToast('Gemini 프롬프트가 복사되었습니다! Gemini에 붙여넣어 보세요.');
            setTimeout(() => setIsPromptCopied(false), 3000);
        } else {
            showToast('프롬프트 복사에 실패했습니다.');
        }
    };

    // 5. 최종 등록 핸들러
    const handleSubmit = async () => {
        if (!validation.isValid || !validation.data) {
            showToast('올바른 J-Plan JSON 데이터를 입력해 주세요.');
            return;
        }

        await onImport(validation.data);
        handleClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            {/* 토스트 알림 */}
            {toastMessage && (
                <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-zinc-900/90 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs sm:text-sm font-medium border border-zinc-700 backdrop-blur-md animate-bounce">{toastMessage}</div>
            )}

            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-2xl h-[85vh] max-h-[750px] min-h-[500px] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                            <ClipboardPaste size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">JSON 일정 가져오기</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">클립보드 붙여넣기, 수기 입력 또는 파일 업로드로 새 여행을 등록합니다.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="닫기"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 본문 에디터 및 툴바 */}
                <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0 overflow-y-auto space-y-3 sm:space-y-4">
                    {/* 상단 툴바 액션 버튼들 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={handlePasteClipboard}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95"
                            >
                                <ClipboardPaste size={15} />
                                <span>클립보드 붙여넣기</span>
                            </button>

                            <input
                                id={fileInputId}
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                            >
                                <Upload size={15} />
                                <span>파일 선택</span>
                            </button>

                            {jsonText && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleFormatJson}
                                        className="flex items-center space-x-1 px-2.5 py-1.5 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg text-xs sm:text-sm transition-colors"
                                        title="JSON 자동 정렬"
                                    >
                                        <Sparkles size={14} />
                                        <span className="hidden sm:inline">정렬</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setJsonText('')}
                                        className="flex items-center space-x-1 px-2.5 py-1.5 text-red-500 hover:text-red-600 rounded-lg text-xs sm:text-sm transition-colors"
                                        title="내용 비우기"
                                    >
                                        <Trash2 size={14} />
                                        <span className="hidden sm:inline">지우기</span>
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Gemini 프롬프트 복사 버튼 */}
                        <button
                            type="button"
                            onClick={handleCopyGeminiPrompt}
                            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all border ${
                                isPromptCopied
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                                    : 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
                            }`}
                            title="Gemini에 질문할 맞춤 프롬프트 양식을 복사합니다."
                        >
                            <Bot size={15} />
                            <span>{isPromptCopied ? '프롬프트 복사완료!' : 'Gemini 프롬프트 복사'}</span>
                        </button>
                    </div>

                    {/* 텍스트 영역 (flex-1로 남은 높이 100% 꽉 채움) */}
                    <div className="flex-1 min-h-[220px] flex flex-col">
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            rows={15}
                            placeholder='여기에 J-Plan JSON 텍스트를 붙여넣거나 직접 작성해 주세요. (예: { "version": "1.0", "travel": { ... }, ... })'
                            className="flex-1 w-full min-h-[200px] p-3 sm:p-4 font-mono text-xs sm:text-sm bg-gray-50 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-gray-800 dark:text-gray-200 resize-none leading-relaxed"
                            spellCheck={false}
                        />
                    </div>

                    {/* 실시간 검증 결과 및 미리보기 카드 (shrink-0으로 하단 고정) */}
                    {jsonText.trim() && (
                        <div className="shrink-0">
                            {validation.isValid && validation.data ? (
                                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-900 dark:text-emerald-200">
                                    <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold mb-2">
                                        <CheckCircle2
                                            size={16}
                                            className="text-emerald-600 dark:text-emerald-400"
                                        />
                                        <span>유효한 여행 일정 데이터입니다!</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center space-x-1.5 truncate">
                                            <MapPin
                                                size={14}
                                                className="text-emerald-600 shrink-0"
                                            />
                                            <span className="font-semibold truncate">{validation.data.travel.name}</span>
                                            {validation.data.travel.region && <span className="text-emerald-700/80 dark:text-emerald-300/80">({validation.data.travel.region})</span>}
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <Calendar
                                                size={14}
                                                className="text-emerald-600 shrink-0"
                                            />
                                            <span>
                                                {validation.data.travel.startDate} ~ {validation.data.travel.endDate}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <ListOrdered
                                                size={14}
                                                className="text-emerald-600 shrink-0"
                                            />
                                            <span>
                                                총 일정: <strong>{validation.data.itineraries.length}개</strong>
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <Home
                                                size={14}
                                                className="text-emerald-600 shrink-0"
                                            />
                                            <span>
                                                숙소: <strong>{validation.data.accommodations.length}개</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-xl text-red-700 dark:text-red-300 flex items-start space-x-2 text-xs sm:text-sm">
                                    <AlertCircle
                                        size={16}
                                        className="text-red-500 shrink-0 mt-0.5"
                                    />
                                    <span>{validation.error || 'JSON 구문을 확인해 주세요.'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-end space-x-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!validation.isValid}
                        className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm ${
                            validation.isValid ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30 active:scale-95' : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed'
                        }`}
                    >
                        <CheckCircle2 size={16} />
                        <span>여행 등록 및 열기</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JsonImportModal;
