import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 모달 드래그 이동 및 ESC 키 닫기 기능을 제공하는 커스텀 훅
 * @param isOpen - 모달 열림 여부
 * @param onClose - 모달 닫기 콜백
 */
export const useModal = (isOpen: boolean, onClose: () => void) => {
    // 모달 위치 상태 (초기값: 화면 중앙)
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const dragging = useRef(false);
    const startOffset = useRef({ x: 0, y: 0 });

    // 모달이 열릴 때마다 위치 초기화
    useEffect(() => {
        if (isOpen) setPosition(null);
    }, [isOpen]);

    // ESC 키로 모달 닫기
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // 드래그 시작 (헤더 mousedown)
    const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const el = e.currentTarget.closest('[data-modal-container]') as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragging.current = true;
        startOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        const handleMouseMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            setPosition({
                x: ev.clientX - startOffset.current.x,
                y: ev.clientY - startOffset.current.y,
            });
        };

        const handleMouseUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);

    // 모달 컨테이너에 적용할 스타일
    const modalStyle: React.CSSProperties = position ? { position: 'fixed', left: position.x, top: position.y, transform: 'none', margin: 0 } : {};

    return { handleDragStart, modalStyle };
};
