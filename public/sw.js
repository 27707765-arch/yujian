// 遇见APP Service Worker - v2 缓存策略优化
const CACHE_VERSION = 'yujian-v2';
const STATIC_PREFIX = '/js/';
const UPLOAD_PREFIX = '/uploads/';

// 核心HTML入口
const coreUrls = [
  '/',
  '/index-vue.html',
  '/manifest.json',
  '/icon.png',
  '/icon.svg'
];

// 安装：缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(coreUrls))
  );
  self.skipWaiting();
});

// 激活：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API请求：永远走网络，不缓存
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    return;
  }

  // JS静态资源：Cache First（v2版本号升级时自动清理旧缓存）
  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // uploads/ 图片：Cache First 长期缓存
  if (url.pathname.startsWith(UPLOAD_PREFIX)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // HTML/其他资源：Network First，离线回退
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        // 导航请求回退：返回缓存的首页或离线提示
        if (event.request.mode === 'navigate') {
          return caches.match('/index-vue.html') || caches.match('/') ||
            new Response(
              '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h2>📡 网络不可用</h2><p>请检查网络连接后重试</p></div></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
        }
        return new Response('Offline', { status: 503 });
      })
    )
  );
});
