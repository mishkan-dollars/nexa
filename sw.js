// NEXA/OS service worker: отдаёт файлы, которые preload.js сложил в Cache Storage (звуки, текстуры, модели, three.js).
// Код игры (js/css/html) не кэшируется — обновления приходят сразу. Нет в кэше — обычный сетевой запрос.
// Для аудио поддержан Range (206): иначе Safari и часть Android-браузеров не проигрывают звук из кэша.
'use strict';

const VER = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'nexa-assets-v' + VER;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => /^nexa-assets-v/.test(k) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function ranged(res, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const blob = await res.blob(), size = blob.size;
  if (!m) return res;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Number(m[2]);
  if (!(start >= 0) || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  end = Math.min(end, size - 1);
  const part = blob.slice(start, end + 1);
  return new Response(part, {
    status: 206,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': String(part.size), 'Accept-Ranges': 'bytes' }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode === 'navigate') return;
  e.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req.url);
      if (!hit) return fetch(req);
      const range = req.headers.get('range');
      return range ? await ranged(hit, range) : hit;
    } catch (err) {
      return fetch(req);
    }
  })());
});
