import { useCallback, useEffect, useRef } from 'react';

/**
 * 키보드 이벤트가 Escape(ESC) 키인지 Mac, Windows, Android 환경을 모두 포괄하여 판별합니다.
 * - Mac/Windows: e.key === 'Escape' 또는 'Esc', e.code === 'Escape'
 * - Android (물리/가상/블루투스 키보드): e.keyCode === 27, e.which === 27
 */
export const isEscapeKey = (e: KeyboardEvent): boolean => {
    return e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27 || e.which === 27;
};

export interface ModalGuardOptions {
    /** 작성/수정 중인 미저장 변경사항 여부 */
    isDirty?: boolean;
    /** 닫기 확인 메시지 */
    confirmMessage?: string;
}

const DEFAULT_CONFIRM_MESSAGE = '수정 중인 내용이 있습니다. 저장하지 않고 닫으시겠습니까?';

// React StrictMode의 마운트-언마운트-재마운트 사이클에서 history.back() 경합을 방지하기 위한 활성 가드 집합
const activeModalGuards = new Set<string>();

/**
 * 모달이나 다이얼로그가 열려 있을 때 ESC 키 입력 및 브라우저/모바일 뒤로 가기 시
 * 미저장 변경사항(`isDirty`)이 있으면 확인창을 띄워 실수로 닫히는 것을 방지하는 훅입니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export const useEscapeKey = (isOpen: boolean, onClose: () => void, options?: ModalGuardOptions) => {
    const isDirtyRef = useRef(Boolean(options?.isDirty));
    const confirmMsgRef = useRef(options?.confirmMessage || DEFAULT_CONFIRM_MESSAGE);
    const onCloseRef = useRef(onClose);
    const guardIdRef = useRef<string | null>(null);

    useEffect(() => {
        isDirtyRef.current = Boolean(options?.isDirty);
    }, [options?.isDirty]);

    useEffect(() => {
        confirmMsgRef.current = options?.confirmMessage || DEFAULT_CONFIRM_MESSAGE;
    }, [options?.confirmMessage]);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const requestClose = useCallback(() => {
        if (isDirtyRef.current && !window.confirm(confirmMsgRef.current)) {
            return;
        }
        onCloseRef.current();
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        // StrictMode 재마운트 시 이미 쌓인 동일 가드가 있으면 재사용
        const existingGuardId =
            typeof window.history.state?.jplanModalGuard === 'string'
                ? (window.history.state.jplanModalGuard as string)
                : null;

        const guardId =
            existingGuardId && !activeModalGuards.has(existingGuardId)
                ? existingGuardId
                : `modal_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        if (guardId !== existingGuardId) {
            window.history.pushState({ jplanModalGuard: guardId }, '');
        }
        activeModalGuards.add(guardId);
        guardIdRef.current = guardId;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEscapeKey(e)) {
                e.preventDefault();
                if (isDirtyRef.current && !window.confirm(confirmMsgRef.current)) {
                    return;
                }
                onCloseRef.current();
            }
        };

        const handlePopState = () => {
            if (!activeModalGuards.has(guardId)) return;

            if (isDirtyRef.current && !window.confirm(confirmMsgRef.current)) {
                // 사용자가 취소를 선택하면 가드 히스토리를 복구해 작성 화면 유지
                window.history.pushState({ jplanModalGuard: guardId }, '');
                return;
            }

            activeModalGuards.delete(guardId);
            guardIdRef.current = null;
            onCloseRef.current();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('popstate', handlePopState);
            activeModalGuards.delete(guardId);

            // StrictMode 재마운트 여부를 한 틱 뒤에 확인한 뒤에만 가드 히스토리 정리
            window.setTimeout(() => {
                if (!activeModalGuards.has(guardId) && window.history.state?.jplanModalGuard === guardId) {
                    window.history.back();
                }
            }, 0);
        };
    }, [isOpen]);

    return { requestClose };
};
