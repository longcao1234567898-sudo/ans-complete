/*
 * Service worker — PWA.
 *
 * QUAN TRỌNG: HTML và JS/CSS phải dùng NETWORK-FIRST (ưu tiên mạng).
 * Nếu cache-first như trước, người dùng sẽ mắc kẹt ở BẢN CŨ mãi:
 * phải bấm F5 mới thấy giao diện mới — đúng lỗi đã gặp (chỉ hiện 2 tab).
 *
 * Chỉ ảnh/font mới cache-first (chúng không đổi nội dung, lại nặng).
 */
const CACHE = 'htans-v41'; // đổi tên -> xoá sạch cache cũ

/**
 * Chỉ lưu vào cache khi phản hồi ĐÚNG chuẩn 200 đầy đủ.
 *
 * VÌ SAO KHÔNG DÙNG res.ok: res.ok đúng với cả dải 200–299, trong đó có 206
 * Partial Content — thứ trình duyệt luôn trả về khi phát video (thẻ <video> tự
 * gửi header Range để tua). Cache API TỪ CHỐI lưu 206 và ném thẳng TypeError
 * "Failed to execute 'put' on 'Cache'", làm bẩn console mỗi lần mở trang có
 * video nền. Chặn từ đây gọn hơn là bọc try/catch ở nơi gọi.
 */
function coTheLuuCache(res) {
  return res && res.status === 200 && res.type !== 'opaque';
}

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
            if (coTheLuuCache(res)) {
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
        if (coTheLuuCache(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match('/index.html'))
          // BẮT BUỘC có nhánh cuối này: respondWith() ném TypeError "Failed to
          // convert value to 'Response'" nếu nhận undefined — và caches.match
          // TRẢ VỀ undefined khi chưa cache gì (lần đầu vào máy, hoặc vừa đổi
          // tên CACHE nên cache cũ đã bị xoá sạch). Khi đó cả tab trắng bóc kèm
          // "resulted in a network error" thay vì hiện thông báo mất mạng.
          .then((cached) => cached || traVeTrangMatMang())
      )
  );
});

/** Trang thông báo mất mạng, dựng tại chỗ nên không phụ thuộc cache */
function traVeTrangMatMang() {
  return new Response(
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Mất kết nối</title></head><body style="margin:0;display:flex;' +
      'align-items:center;justify-content:center;min-height:100vh;' +
      'font-family:system-ui,sans-serif;background:#f8fafc;color:#334155;' +
      'text-align:center;padding:24px">' +
      '<div><h1 style="font-size:20px;margin:0 0 8px">Không có kết nối mạng</h1>' +
      '<p style="font-size:14px;margin:0 0 16px">Bà con kiểm tra lại Wi-Fi hoặc 4G rồi thử lại.</p>' +
      // Dùng thẻ <a> chứ không dùng onclick="location.reload()": thuộc tính
      // onclick là script inline, sẽ bị chặn nếu trang có CSP không mở unsafe-inline.
      '<a href="/" style="display:inline-block;min-height:44px;line-height:44px;' +
      'padding:0 20px;border-radius:12px;background:#1B5E20;color:#fff;font-size:15px;' +
      'font-weight:600;text-decoration:none">Tải lại trang</a></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
