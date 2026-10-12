import { useEffect } from 'react';

/**
 * 키보드 이벤트가 Escape(ESC) 키인지 Mac, Windows, Android 환경을 모두 포괄하여 판별합니다.
 * - Mac/Windows: e.key === 'Escape' 또는 'Esc', e.code === 'Escape'
 * - Android (물리/가상/블루투스 키보드): e.keyCode === 27, e.which === 27
 */
export const isEscapeKey = (e: KeyboardEvent): boolean => {
    return e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27 || e.which === 27;
};

/**
 * 모달이나 다이얼로그가 열려 있을 때 ESC 키 입력 시 닫기 콜백을 안전하게 호출하는 훅입니다.
 * Mac, Windows, Android 모든 환경의 ESC 이벤트를 처리합니다.
 *
 * @param isOpen 모달 열림 여부
 * @param onClose 닫기 콜백 함수
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export const useEscapeKey = (isOpen: boolean, onClose: () => void) => {
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEscapeKey(e)) {
                // ESC 키의 기본 동작 방지 및 다이얼로그 닫기 실행
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
};
