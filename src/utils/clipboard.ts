/**
 * 클립보드 관련 유틸리티 모듈입니다.
 * PC 및 모바일 브라우저의 다양한 보안 정책과 권한을 안전하게 처리합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */

/**
 * 텍스트를 클립보드에 복사합니다.
 *
 * @param text 복사할 텍스트
 * @returns 복사 성공 여부
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    // 1. 최신 Clipboard API 시도
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('[Clipboard] navigator.clipboard.writeText 실패, fallback 시도:', err);
        }
    }

    // 2. 레거시 execCommand fallback
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error('[Clipboard] execCommand copy 실패:', err);
        return false;
    }
}

/**
 * 클립보드로부터 텍스트를 읽어옵니다.
 * 모바일이나 보안 제약으로 권한이 거부된 경우 null을 반환합니다.
 *
 * @returns 읽어온 텍스트 또는 null
 */
export async function readFromClipboard(): Promise<string | null> {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        try {
            const text = await navigator.clipboard.readText();
            return text;
        } catch (err) {
            console.warn('[Clipboard] navigator.clipboard.readText 접근 실패 (권한 거부 등):', err);
            return null;
        }
    }
    return null;
}
