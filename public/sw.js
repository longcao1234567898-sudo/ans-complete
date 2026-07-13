/*
 * Service worker — PWA.
 *
 * QUAN TRỌNG: HTML và JS/CSS phải dùng NETWORK-FIRST (ưu tiên mạng).
 * Nếu cache-first như trước, người dùng sẽ mắc kẹt ở BẢN CŨ mãi:
 * phải bấm F5 mới thấy giao diện mới — đúng lỗi đã gặp (chỉ hiện 2 tab).
 *
 * Chỉ ảnh/font mới cache-first (chúng không đổi nội dung, lại nặng).
 */
const CACHE = 'htans-v3'; // đổi tên -> xoá sạch cache cũ

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()) // chiếm quyền ngay, không chờ tab đóng
  );
});

/** Tài nguyên tĩnh an toàn để cache-first (ảnh, font, media) */
function isStaticAsset(url) {
  return /\.(webp|png|jpe?g|gif|svg|ico|woff2?|ttf|mp4)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API/CDN -> để nguyên

  // 1) Ảnh, font, media -> CACHE-FIRST (nhanh, không đổi)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 2) HTML, JS, CSS -> NETWORK-FIRST (luôn lấy bản mới nhất)
  //    Mất mạng thì mới dùng bản đã lưu -> vẫn xem được offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html'))
      )
  );
});
