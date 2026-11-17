import React, { useMemo, useState } from 'react';
import { X, Bot, Copy, Check, Download, Sparkles, FileText } from 'lucide-react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { copyToClipboard } from '../../../utils/clipboard';
import { generateAiSkillMarkdown, generateGeminiPrompt } from '../../../utils/geminiPrompt';

interface AiSkillGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Gemini / ChatGPT / Claude 등에서 J-Plan 호환 JSON 일정을 생성할 수 있도록
 * 맞춤형 프롬프트 빌더와 재사용 가능한 스킬(.md) 전문을 확인·복사할 수 있는 모달입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const AiSkillGuideModal: React.FC<AiSkillGuideModalProps> = (props) => {
    useEscapeKey(props.isOpen, props.onClose);
    if (!props.isOpen) return null;
    return <AiSkillGuideContent {...props} />;
};

const AiSkillGuideContent: React.FC<AiSkillGuideModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'prompt' | 'skill'>('prompt');
    const [destination, setDestination] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [companions, setCompanions] = useState('');
    const [transport, setTransport] = useState('');
    const [extraNotes, setExtraNotes] = useState('');
    const [copied, setCopied] = useState(false);

    const previewText = useMemo(() => {
        if (activeTab === 'skill') {
            return generateAiSkillMarkdown();
        }
        return generateGeminiPrompt({
            destination,
            startDate,
            endDate,
            companions,
            transport,
            extraNotes,
        });
    }, [activeTab, destination, startDate, endDate, companions, transport, extraNotes]);

    const handleCopy = async () => {
        const ok = await copyToClipboard(previewText);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDownloadSkill = () => {
        const md = generateAiSkillMarkdown();
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'j-plan-itinerary-skill.md';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
                            <Bot size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">AI 일정 생성 스킬 & 프롬프트</h3>
                            <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate">Gemini · ChatGPT · Claude에서 J-Plan JSON을 바로 만들 수 있는 규격입니다.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 탭 전환 */}
                <div className="px-4 sm:px-6 pt-3 flex items-center gap-2 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab('prompt')}
                        className={`pb-2.5 px-2 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'prompt'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        <Sparkles size={14} />
                        <span>맞춤 프롬프트 빌더</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('skill')}
                        className={`pb-2.5 px-2 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'skill'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        <FileText size={14} />
                        <span>AI 스킬 전문 (SKILL.md)</span>
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                    {activeTab === 'prompt' && (
                        <div className="p-3.5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 space-y-2.5 text-xs">
                            <div className="font-bold text-purple-900 dark:text-purple-200">여행 조건 입력 (선택 — 입력 시 프롬프트에 자동 반영)</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <input
                                    type="text"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    placeholder="여행지 (예: 후쿠오카·유후인)"
                                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <input
                                    type="text"
                                    value={companions}
                                    onChange={(e) => setCompanions(e.target.value)}
                                    placeholder="동행/성격 (예: 부모님 칠순 기념 6명 효도 여행)"
                                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                                <input
                                    type="text"
                                    value={transport}
                                    onChange={(e) => setTransport(e.target.value)}
                                    placeholder="이동수단 (예: 6인승 렌터카, 항공)"
                                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                                />
                            </div>
                            <input
                                type="text"
                                value={extraNotes}
                                onChange={(e) => setExtraNotes(e.target.value)}
                                placeholder="추가 요청 (예: 온천 료칸 1박 포함, 이동 최소화)"
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 outline-none"
                            />
                        </div>
                    )}

                    {activeTab === 'skill' && (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 text-xs text-gray-600 dark:text-gray-300">
                            아래 스킬 전문(<code>SKILL.md</code>)을 복사하거나 파일로 저장해 <strong>Gemini · ChatGPT · Claude</strong> 등의 커스텀 지침 / 프로젝트 / 스킬에 등록해 두면, 이후에는 <em>&ldquo;오사카 3박 4일 일정 짜줘&rdquo;</em>라고만 입력해도 최신 J-Plan JSON(일정·숙소·체크리스트·경비 포함)을 바로 생성합니다.
                        </div>
                    )}

                    {/* 프롬프트 / 스킬 전문 코드 뷰어 */}
                    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 overflow-hidden">
                        <pre className="p-3.5 text-[11px] sm:text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words max-h-80 overflow-y-auto leading-relaxed">
                            {previewText}
                        </pre>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-4 py-3.5 sm:px-6 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950/40 flex items-center justify-between gap-2 flex-wrap shrink-0">
                    <button
                        type="button"
                        onClick={handleDownloadSkill}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                        <Download size={14} />
                        <span>SKILL.md 저장</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-zinc-800 rounded-xl"
                        >
                            닫기
                        </button>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copied ? '복사 완료!' : '프롬프트 전체 복사'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiSkillGuideModal;
