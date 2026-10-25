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

/* Trọng tài P92: lần ghé ĐẦU TIÊN trang chưa chịu service worker điều khiển, nên lần
   điều hướng đó không lưu vỏ ứng dụng, gói JS chính cũng không vào cache — mất mạng
   tải lại chỉ ra trang dự phòng. Lưu sẵn lúc cài: index.html + các tệp JS/CSS nó gọi */
async function luuVoUngDung() {
  const res = await fetch('/', { cache: 'no-store' });
  if (!coTheLuuCache(res)) return;
  const html = await res.clone().text();
  const c = await caches.open(CACHE);
  const tep = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  await c.addAll(tep);
  await c.put(VO_UNG_DUNG, res);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    caches.open(CACHE).then((c) => c.addAll(GIU_SAN)).catch(() => {}),
    luuVoUngDung().catch(() => {}),   // không lưu được thì vẫn cài — mất mạng về trang dự phòng như cũ
  ]));
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
          /* ignoreVary: tệp lưu sẵn lúc cài (luuVoUngDung) không mang header Origin như
             yêu cầu <script type="module"> của trang; máy phục vụ trả "Vary: Origin" thì
             không khớp -> mất mạng mà ứng dụng không dựng được. Cùng nguồn, cùng nội dung */
          .match(request, { ignoreVary: true })
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
   AES-GCM không xuất được) và theo CÙNG luật (trọng tài P92 vòng 2 — trước đây SW
   khác luật trang): hạn gửi lại, giãn lần thử, nâng cờ "có thể đã tới", đọc lại tin
   ngay trước khi gửi, tin hỏng báo lỗi riêng. Gửi nguyên thân đã cất (có mã lần gửi —
   máy chủ nhận ra lần gửi lại, P91) tới địa chỉ do TRANG ghi ("dich", bản đang chạy),
   không tin địa chỉ cất trong tin. Máy chủ đòi xác minh / từ chối thì để nguyên cho
   trang xử lý. Còn tin chưa xong (mạng, máy chủ bảo đợi, lượt đang bận) thì báo lỗi
   cho trình duyệt tự hẹn lượt đồng bộ sau. Không có Background Sync (iPhone): trang
   tự gửi khi mở lại. Các hằng số dưới đây phải khớp hangChoGui.ts.
   ========================================================================== */
const KHO_HANG_CHO = 'htans-hang-cho';
const GIO_MS = 3_600_000;
const HAN_GUI_LAI_GIO = 20;
const HAN_TIN_GIO = 72;
const THU_TOI_DA = 12;
const GIAN_DAU_MS = 20_000;
const GIAN_TOI_DA_MS = 15 * 60_000;
const HAN_GUI_TOI_THIEU_MS = 60_000;
const BYTE_MOI_GIAY = 32 * 1024;
const HAN_GUI_TOI_DA_MS = 15 * 60_000;
const LOI_TIN_HONG = 'Không đọc được tin chờ này trên máy (dữ liệu trình duyệt có thể đã bị xoá một phần). '
  + 'Bà con xoá tin chờ rồi soạn lại. Việc khẩn cấp xin gọi ngay 113.';

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

/** Sửa một tin trong một giao dịch (tin đã bị xoá thì thôi) */
function suaTin(db, id, doi) {
  return new Promise((ok, loi) => {
    const tx = db.transaction('tin', 'readwrite');
    const kho = tx.objectStore('tin');
    const rq = kho.get(id);
    rq.onsuccess = () => { if (rq.result) kho.put({ ...rq.result, ...doi }); };
    tx.oncomplete = () => ok();
    tx.onerror = () => loi(tx.error);
  });
}

/* Có thể đã tới: hạn gửi lại tính từ lần gửi KHÔNG CHẮC đầu tiên (như hangChoGui.ts quaHanGui) */
const quaHanGui = (b) => {
  const tuoi = (moc) => Math.max(0, Date.now() - moc) / GIO_MS;
  return (b.coTheDaToi && tuoi(b.coTheDaToiLuc ?? b.taoLuc) > HAN_GUI_LAI_GIO) || tuoi(b.taoLuc) > HAN_TIN_GIO;
};
const nangCo = (b) => ({ coTheDaToi: true, coTheDaToiLuc: b.coTheDaToiLuc ?? Date.now() });
/* AbortSignal.timeout chưa có trên Safari < 16 */
function henGio(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

const gianLuc = (n) => Date.now() + Math.min(GIAN_DAU_MS * 2 ** (n - 1), GIAN_TOI_DA_MS);

async function guiTinChoNgam() {
  const db = await moKhoHangCho();
  let conViec = false;
  try {
    const khoa = await lamKho(db, 'khoa', 'readonly', (k) => k.get('chinh'));
    const dich = await lamKho(db, 'khoa', 'readonly', (k) => k.get('dich'));
    let url = '';
    try { url = new URL(dich && dich.api).href; } catch { /* trang chưa ghi */ }
    if (!khoa || !url || new URL(url).pathname !== '/api/submissions') return;
    const ds = await lamKho(db, 'tin', 'readonly', (k) => k.getAll());
    for (const { id } of ds.sort((a, b) => a.taoLuc - b.taoLuc)) {
      /* Đọc lại ngay trước khi gửi: bà con vừa bấm xoá thì không gửi */
      const ban = await lamKho(db, 'tin', 'readonly', (k) => k.get(id));
      if (!ban || ban.trangThai !== 'cho') continue;
      /* Quá hạn gửi (gửi nữa có thể thành đơn thứ hai): để trang báo "quá hạn" */
      if (quaHanGui(ban)) continue;
      if (ban.henLuc && ban.henLuc > Date.now() && ban.henLuc < Date.now() + GIAN_TOI_DA_MS) continue;
      let nd;
      try {
        nd = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ban.iv }, khoa, ban.duLieu)));
      } catch {
        await suaTin(db, id, { trangThai: 'loi', loi: LOI_TIN_HONG });   // không chặn các tin sau
        continue;
      }
      const { than, phien, maMo } = nd;
      const body = JSON.stringify(than);
      let res;
      try {
        res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          signal: henGio(Math.min(Math.max(HAN_GUI_TOI_THIEU_MS, (body.length / BYTE_MOI_GIAY) * 1000), HAN_GUI_TOI_DA_MS)),
        });
      } catch {
        /* Đã đi mà đứt / hết giờ: máy chủ CÓ THỂ đã lưu */
        const n = (ban.soLanMang || 0) + 1;
        await suaTin(db, id, { ...nangCo(ban), soLanMang: n, henLuc: gianLuc(n), henMang: true, loi: 'Mạng chập chờn, chưa gửi xong.' });
        continue;
      }
      const j = await res.json().catch(() => ({}));
      const nhan = (res.status === 200 || res.status === 201) && /^[A-Z0-9]{4,20}$/.test(String(j.trackingCode ?? ''));
      const thuLai = res.status === 200 || res.status === 201 || res.status === 429 || res.status >= 500
        || (res.status === 409 && j.code === 'DANG_GUI');
      if (!nhan) {
        const loiMayChu = typeof j.error === 'string' ? j.error : '';
        /* Cùng cách xếp trạng thái với trang (hangChoGui.ts guiMot) */
        if (res.status === 403 && j.code === 'CAN_XAC_MINH') await suaTin(db, id, { trangThai: 'can_xac_minh', loi: undefined });
        else if (res.status === 429 && j.code === 'CAN_XAC_MINH_THEM') await suaTin(db, id, { trangThai: 'can_xac_minh_them', loi: undefined });
        else if (!thuLai) await suaTin(db, id, { trangThai: 'loi', loi: loiMayChu || `Máy chủ từ chối (mã ${res.status}).` });
        else {
          const n = (ban.soLanThu || 0) + 1;
          const loi = loiMayChu || (res.status === 200 || res.status === 201 ? 'Máy chủ trả lời không đúng dạng.' : `Máy chủ chưa nhận được (mã ${res.status}).`);
          await suaTin(db, id, {
            ...(res.status !== 429 ? nangCo(ban) : {}),   // đã đi, trả lời không chắc
            ...(n >= THU_TOI_DA
              ? { trangThai: 'loi', loi: `${loi} (đã thử ${n} lần, máy dừng tự gửi — bà con gọi trực ban hoặc xoá tin chờ rồi gửi lại sau)` }
              : { soLanThu: n, henLuc: gianLuc(n), henMang: false, loi }),
          });
        }
        continue;
      }
      const kq = {
        trackingCode: String(j.trackingCode), chatPin: j.chatPin ? String(j.chatPin) : undefined,
        pendingReview: j.pendingReview === true, category: than.category,
        tepKhongNhan: Array.isArray(j.tepKhongNhan) ? j.tepKhongNhan : [],
        phien, maMo,   // máy dùng chung: chỉ trang đã soạn / người có mã nhận kết quả mới thấy
      };
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const duLieu = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, khoa, new TextEncoder().encode(JSON.stringify(kq)));
      /* Cất kết quả TRƯỚC, xoá tin SAU (đứt giữa chừng thì gửi lại cùng mã, không mất) */
      await lamKho(db, 'ket_qua', 'readwrite', (k) => k.put({ id, taoLuc: Date.now(), iv, duLieu }));
      await lamKho(db, 'tin', 'readwrite', (k) => k.delete(id));
    }
    /* Còn tin đợi gửi (mạng, máy chủ bảo đợi) trong hạn -> hẹn lượt sau */
    const sau = await lamKho(db, 'tin', 'readonly', (k) => k.getAll());
    conViec = sau.some((b) => b.trangThai === 'cho' && !quaHanGui(b));
  } finally {
    db.close();
    const ds = await self.clients.matchAll({ includeUncontrolled: true });
    ds.forEach((c) => c.postMessage('htans-hang-cho'));
  }
  /* Còn tin chưa xong: lỗi để trình duyệt hẹn lượt đồng bộ sau (có giãn, có trần riêng) */
  if (conViec) throw new Error('còn tin chờ');
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'gui-tin-cho') return;
  event.waitUntil(
    self.navigator && self.navigator.locks
      ? self.navigator.locks.request('gui-tin-cho', { ifAvailable: true }, (lock) => {
        if (!lock) throw new Error('lượt đang bận');   // trang đang gửi: hẹn lượt sau
        return guiTinChoNgam();
      })
      : guiTinChoNgam()
  );
});
