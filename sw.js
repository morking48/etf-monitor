// ========== ETF三因子 PWA Service Worker v3 ==========
// 配合 Vercel 后端使用
// 职责：静态资源缓存 + 腾讯K线API缓存 + 离线容错

const CACHE_NAME = 'etf-pwa-v3';
const API_CACHE = 'etf-api-v3';

// 预缓存静态资源
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/css/mobile.css',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/js/core/engine.js',
    '/js/core/api.js',
    '/js/core/simulator.js',
    '/js/ui/components.js',
    '/js/ui/dashboard.js',
    '/js/ui/detail.js',
    '/js/ui/history.js',
    '/js/ui/report.js',
    '/js/ui/sim_ui.js',
    '/js/utils/date.js',
    '/js/utils/format.js',
    '/js/utils/statistics.js',
    '/js/app.js'
];

// ========== 安装 ==========
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ========== 激活 ==========
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME && k !== API_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 腾讯 K 线 API：缓存 4 小时（swr 策略）
    if (url.hostname.includes('gtimg.cn') || url.hostname.includes('ifzq')) {
        event.respondWith(staleWhileRevalidate(event.request, API_CACHE, 14400));
        return;
    }

    // 静态资源：缓存优先
    if (event.request.method === 'GET') {
        event.respondWith(cacheFirstThenNetwork(event.request, CACHE_NAME));
    }
});

// ========== 缓存策略 ==========
async function cacheFirstThenNetwork(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const resp = await fetch(request);
        if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(cacheName).then(cache => cache.put(request, clone));
        }
        return resp;
    } catch (e) {
        return new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(request, cacheName, maxAgeSec = 3600) {
    const cached = await caches.match(request);
    
    // 后台更新
    const fetchPromise = fetch(request).then(resp => {
        if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(cacheName).then(cache => cache.put(request, clone));
        }
        return resp;
    }).catch(() => cached);

    // 有缓存直接返回
    if (cached) return cached;

    return fetchPromise;
}

// ========== 推送通知 ==========
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
        self.registration.showNotification(data.title || 'ETF监测', {
            body: data.body || '检测到新信号',
            icon: '/icons/icon-192.png',
            tag: 'etf-signal',
            vibrate: [200, 100, 200]
        })
    );
});