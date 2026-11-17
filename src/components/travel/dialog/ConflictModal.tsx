import React from 'react';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';

interface ConflictModalProps {
    isOpen: boolean;
    message: string;
    serverUpdatedBy?: string;
    onClose: () => void;
    onReloadServer: () => Promise<void> | void;
    onForceOverwrite: () => Promise<void> | void;
}

/**
 * 동시 편집 중 다른 사용자가 먼저 저장하여 리비전 충돌(409)이 발생했을 때
 * 최신본을 불러올지 내 변경사항을 덮어쓸지 선택하는 모달 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 17.
 */
const ConflictModal: React.FC<ConflictModalProps> = ({
    isOpen,
    message,
    serverUpdatedBy,
    onClose,
    onReloadServer,
    onForceOverwrite,
}) => {
    useEscapeKey(isOpen, onClose);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800 w-full max-w-md overflow-hidden p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">동시 편집 충돌 감지</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{message}</p>
                        {serverUpdatedBy && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 font-medium">최근 저장한 사용자: {serverUpdatedBy}</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onReloadServer}
                        className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <RefreshCw size={15} />
                        <span>최신 일정 불러오기 (내 미저장 변경사항 초기화)</span>
                    </button>
                    <button
                        type="button"
                        onClick={onForceOverwrite}
                        className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <UploadCloud size={15} />
                        <span>내 수정사항으로 덮어쓰기</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        닫고 계속 확인하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConflictModal;
