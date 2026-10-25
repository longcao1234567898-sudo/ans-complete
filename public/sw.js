/*
 * Service worker — PWA.
 *
 * QUAN TRỌNG: HTML và JS/CSS phải dùng NETWORK-FIRST (ưu tiên mạng).
 * Nếu cache-first như trước, người dùng sẽ mắc kẹt ở BẢN CŨ mãi:
 * phải bấm F5 mới thấy giao diện mới — đúng lỗi đã gặp (chỉ hiện 2 tab).
 *
 * Chỉ ảnh/font mới cache-first (chúng không đổi nội dung, lại nặng).
 */
const CACHE = 'htans-v44'; // đổi tên -> xoá sạch cache cũ

/* P92: bản ứng dụng (index.html) lần cuối mở được — mất mạng mà mở trang nào cũng
   dựng lại được ứng dụng để soạn tin, bấm Gửi thì tin cất hàng chờ */
const VO_UNG_DUNG = '/__vo-ung-dung';

/* Trang dự phòng (ADR-003 việc 28): giữ sẵn ngay khi cài, để người đã từng vào
   vẫn thấy số 113 và số trực ban khi mất mạng hoặc nơi chạy trang web sập. */
const GIU_SAN = ['/du-phong.html', '/media/bg-tru-so-cong-an.webp'];

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

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(GIU_SAN)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* ----------------------------------------------------------------
         XOÁ SẠCH MỌI BỘ NHỚ ĐỆM CŨ, KHÔNG CHỪA CÁI NÀO

         Trước đây chỉ xoá cache khác tên. Nhưng người dùng đã từng cài
         service worker đời cũ (chạy kiểu cache-first) thì bản cũ đó còn
         giữ nguyên tệp index.html và bundle cũ. Hậu quả: mở web ra thấy
         giao diện đời trước loé lên vài giây rồi mới nhảy sang bản mới —
         trông như lỗi, mà nội dung cũ có khi còn sai lệch.

         Nay xoá TẤT CẢ cache của các bản trước khi kích hoạt. Cache sẽ tự
         dựng lại từ mạng, mất thêm chút dung lượng lần đầu nhưng chắc chắn
         không còn sót bản cũ. Chỉ chừa cache MANG TÊN BẢN NÀY: nó vừa được
         tạo lúc cài, chỉ chứa trang dự phòng (GIU_SAN) — không có gì cũ.
         ---------------------------------------------------------------- */
      const keys = await caches.keys();
      /* Giữ lại cache của chính bản này — trong đó có trang dự phòng vừa nạp lúc cài */
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim(); // chiếm quyền ngay, không chờ tab đóng
    })()
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
          /* Chỉ trang của ứng dụng (đường không đuôi tệp) — không lấy nhầm du-phong.html làm vỏ */
          if (request.mode === 'navigate' && (!/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname === '/index.html')) {
            const vo = res.clone();
            caches.open(CACHE).then((c) => c.put(VO_UNG_DUNG, vo));
          }
        }
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          /* Trang (điều hướng) không lấy được: bản ứng dụng đã lưu (P92 — vẫn soạn,
             vẫn cất tin, luôn có nút SOS 113); chưa từng lưu thì trang dự phòng 113 */
          .then((cached) => cached || (request.mode === 'navigate' ? caches.match(VO_UNG_DUNG) : undefined))
          .then((cached) => cached || (request.mode === 'navigate' ? caches.match('/du-phong.html') : undefined))
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

/* ==========================================================================
   GỬI NGẦM TIN CHỜ KHI ĐÃ ĐÓNG TRANG (P92) — Background Sync (Android/Chrome)

   Đọc CÙNG kho với src/services/hangChoGui.ts (IndexedDB "htans-hang-cho", khoá
   AES-GCM không xuất được). Chỉ làm đường đơn giản: gửi nguyên thân yêu cầu đã cất
   (có mã lần gửi — máy chủ nhận ra lần gửi lại, P91). Thành công thì cất mã tra cứu
   (mã hoá) rồi xoá tin; mọi trường hợp khác để nguyên cho trang xử lý khi mở lại
   (xác minh "không phải người máy", báo lỗi). Không có Background Sync (iPhone):
   trang tự gửi khi mở lại.
   ========================================================================== */
const KHO_HANG_CHO = 'htans-hang-cho';

function moKhoHangCho() {
  return new Promise((ok, loi) => {
    const rq = indexedDB.open(KHO_HANG_CHO, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('khoa')) db.createObjectStore('khoa');
      if (!db.objectStoreNames.contains('tin')) db.createObjectStore('tin', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ket_qua')) db.createObjectStore('ket_qua', { keyPath: 'id' });
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => loi(rq.error);
  });
}

function lamKho(db, ten, cheDo, viec) {
  return new Promise((ok, loi) => {
    const tx = db.transaction(ten, cheDo);
    const rq = viec(tx.objectStore(ten));
    tx.oncomplete = () => ok(rq.result);
    tx.onerror = () => loi(tx.error);
  });
}

async function guiTinChoNgam() {
  const db = await moKhoHangCho();
  try {
    const khoa = await lamKho(db, 'khoa', 'readonly', (k) => k.get('chinh'));
    if (!khoa) return;
    const ds = await lamKho(db, 'tin', 'readonly', (k) => k.getAll());
    /* Tin có thể đã tới máy chủ mà quá hạn gửi lại (HAN_GUI_LAI_GIO bên hangChoGui.ts):
       để trang báo "quá hạn", không gửi (gửi là thành đơn thứ hai) */
    const conHan = (b) => !b.coTheDaToi || Date.now() - b.taoLuc < 20 * 3_600_000;
    /* Máy chủ bảo đợi (henLuc — hangChoGui.ts giãn lần thử) thì chưa gửi */
    const toiLuot = (b) => !b.henLuc || b.henLuc <= Date.now();
    for (const ban of ds.filter((b) => b.trangThai === 'cho' && conHan(b) && toiLuot(b))) {
      const tho = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ban.iv }, khoa, ban.duLieu);
      const { url, than, phien, maMo } = JSON.parse(new TextDecoder().decode(tho));
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(than) });
      } catch {
        throw new Error('chưa có mạng');   // trình duyệt tự hẹn lại lượt đồng bộ
      }
      if (res.status !== 200 && res.status !== 201) continue;   // để trang xử lý
      const j = await res.json().catch(() => ({}));
      if (!/^[A-Z0-9]{4,20}$/.test(String(j.trackingCode ?? ''))) continue;   // trả lạ: không coi là đã nhận
      const kq = {
        trackingCode: String(j.trackingCode), chatPin: j.chatPin ? String(j.chatPin) : undefined,
        pendingReview: j.pendingReview === true, category: than.category,
        tepKhongNhan: Array.isArray(j.tepKhongNhan) ? j.tepKhongNhan : [],
        phien, maMo,   // máy dùng chung: chỉ phiên đã soạn mới thấy mã tra cứu (hangChoGui.ts)
      };
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const duLieu = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, khoa, new TextEncoder().encode(JSON.stringify(kq)));
      /* Cất kết quả TRƯỚC, xoá tin SAU (đứt giữa chừng thì gửi lại cùng mã, không mất) */
      await lamKho(db, 'ket_qua', 'readwrite', (k) => k.put({ id: ban.id, taoLuc: Date.now(), iv, duLieu }));
      await lamKho(db, 'tin', 'readwrite', (k) => k.delete(ban.id));
    }
  } finally {
    db.close();
    const ds = await self.clients.matchAll({ includeUncontrolled: true });
    ds.forEach((c) => c.postMessage('htans-hang-cho'));
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'gui-tin-cho') return;
  event.waitUntil(
    self.navigator && self.navigator.locks
      ? self.navigator.locks.request('gui-tin-cho', { ifAvailable: true }, (lock) => (lock ? guiTinChoNgam() : undefined))
      : guiTinChoNgam()
  );
});

