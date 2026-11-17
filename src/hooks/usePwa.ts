import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * PWA 설치, 오프라인 상태 감지 및 서비스 워커 업데이트를 관리하는 커스텀 훅입니다.
 *
 * @author 윤명준 (MJ Yun)
 */
export function usePwa() {
    const [isOffline, setIsOffline] = useState<boolean>(() =>
        typeof navigator !== 'undefined' ? !navigator.onLine : false
    );
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
    const [isStandalone] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true
        );
    });
    const [isIosSafari] = useState<boolean>(() => {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent;
        const isIos = /iPad|iPhone|iPod/.test(ua);
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
        return isIos && isSafari;
    });

    // 온라인/오프라인 상태 및 설치 프롬프트 이벤트 구독
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        const handleAppInstalled = () => {
            setDeferredPrompt(null);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    // 프로덕션 환경에서 Service Worker 등록 및 업데이트 감지
    useEffect(() => {
        if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
            return;
        }

        let refreshing = false;
        const handleControllerChange = () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        };
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((registration) => {
                if (registration.waiting) {
                    setWaitingWorker(registration.waiting);
                }
                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            setWaitingWorker(installing);
                        }
                    });
                });
            })
            .catch((err) => {
                console.warn('[PWA] Service Worker registration failed:', err);
            });

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    }, []);

    const installApp = useCallback(async () => {
        if (!deferredPrompt) return false;
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
            setDeferredPrompt(null);
            return true;
        }
        return false;
    }, [deferredPrompt]);

    const applyUpdate = useCallback(() => {
        if (!waitingWorker) return;
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }, [waitingWorker]);

    return {
        isOffline,
        canInstall: Boolean(deferredPrompt) && !isStandalone,
        isIosInstallable: isIosSafari && !isStandalone,
        isStandalone,
        hasUpdate: Boolean(waitingWorker),
        installApp,
        applyUpdate,
    };
}
