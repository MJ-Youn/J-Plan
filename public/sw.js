/**
 * J-Plan PWA Service Worker
 * 앱 셸(App Shell) 및 여행 일정 API 오프라인 캐싱을 담당합니다.
 *
 * @author 윤명준 (MJ Yun)
 */

const SHELL_CACHE = 'j-plan-shell-v1';
const API_CACHE = 'j-plan-api-v1';
const ACTIVE_CACHES = [SHELL_CACHE, API_CACHE];

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .catch((err) => {
                console.warn('[SW] Precache warning:', err);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('j-plan-') && !ACTIVE_CACHES.includes(key))
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * 네트워크 우선 전략 (실패 시 캐시 폴백)
 */
async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const shellFallback = await caches.match(fallbackUrl);
            if (shellFallback) return shellFallback;
        }
        return new Response(JSON.stringify({ error: 'offline', message: '오프라인 상태입니다.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }
}

/**
 * 캐시 우선 전략 (해시된 정적 번들용)
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}

/**
 * Stale-While-Revalidate 전략
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    return cached || (await fetchPromise) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const isSameOrigin = url.origin === self.location.origin;

    // 보안상 인증 및 암호화 서류 다운로드 엔드포인트는 캐싱하지 않음
    if (isSameOrigin && (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/files'))) {
        return;
    }

    // 여행 데이터, 공유 일정, 날씨(Open-Meteo), 환율(Frankfurter) GET 요청 -> Network-First + Cache Fallback
    const isCacheableApi =
        (isSameOrigin && (url.pathname.startsWith('/api/travels') || url.pathname.startsWith('/api/shares'))) ||
        url.hostname === 'api.open-meteo.com' ||
        url.hostname === 'geocoding-api.open-meteo.com' ||
        url.hostname === 'api.frankfurter.app';

    if (isCacheableApi) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // 타사 도메인(Google Maps 등)은 브라우저 기본 처리에 위임
    if (!isSameOrigin) return;

    // SPA 페이지 이동(Navigation) -> Network-First + /index.html 폴백
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
        return;
    }

    // Vite 빌드 해시 에셋(/assets/*) -> Cache-First
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
        return;
    }

    // 기타 동일 출처 정적 리소스 -> Stale-While-Revalidate
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
