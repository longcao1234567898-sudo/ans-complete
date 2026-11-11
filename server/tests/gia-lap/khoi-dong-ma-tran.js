/**
 * Nạp TRƯỚC điểm khởi động thật: `node --import <tệp này> src/<điểm khởi động>.js`
 * (tests/ma-tran-quyen.test.js gọi bằng child_process.fork). Không sửa một dòng mã sản phẩm:
 *
 *  1. `src/db.js` -> CSDL giả (hook-db-ma-tran.js). Bộ test không được cần MySQL.
 *  2. Ghi lại ĐƯỜNG DẪN GẮN của mỗi lớp `use()` — Express 4 chỉ giữ biểu thức chính quy, không
 *     giữ chuỗi gốc, mà đoán ngược từ biểu thức chính quy thì dễ sai im lặng.
 *  3. `app.listen(...)` -> nghe cổng ngẫu nhiên trên 127.0.0.1, DUYỆT router stack lúc chạy và
 *     báo danh sách route + cổng cho tiến trình cha qua IPC. Route thêm sau tự vào danh sách.
 *  4. Chặn mọi lời gọi mạng ra ngoài bằng fetch: tiến trình con không được chạm dịch vụ thật.
 *
 * MA_TRAN_ROUTE_GIA=1: gắn thêm một route và một lớp use() CHƯA KHAI vào /api/admin — để chứng minh lưới
 * bắt được route mới (test tự kiểm của ma-tran-quyen.test.js).
 */
import { register, createRequire } from 'node:module';
import http from 'node:http';

register('./hook-db-ma-tran.js', import.meta.url);

const require = createRequire(new URL('../../package.json', import.meta.url));
const express = require('express');
const RouterProto = require('express/lib/router/index.js');

globalThis.fetch = async (url) => {
  throw new Error(`ma-tran-quyen: chặn gọi mạng ra ngoài (${String(url).slice(0, 60)})`);
};

/* Cùng quy tắc tách đường dẫn với Router.use của Express 4: đối số đầu không phải hàm (sau khi
   gỡ các lớp mảng) là đường dẫn, còn lại mặc định '/'. */
function duongDanGan(args) {
  let a = args[0];
  while (Array.isArray(a) && a.length !== 0) a = a[0];
  return typeof a === 'function' ? '/' : args[0];
}

const useGoc = RouterProto.use;
RouterProto.use = function useGhiDuongDan(...args) {
  const truoc = this.stack.length;
  const kq = useGoc.apply(this, args);
  const gan = duongDanGan(args);
  for (let i = truoc; i < this.stack.length; i++) this.stack[i].__duongDanGan = gan;
  return kq;
};

function noi(a, b) {
  const s = `${a}/${b}`.replace(/\/+/g, '/');
  return s.length > 1 ? s.replace(/\/$/, '') : s;
}

/** Duyệt router stack -> [{ method, path }]. Đường dẫn không phải chuỗi được ghi nguyên dạng
 *  (sẽ không khớp bảng kỳ vọng -> test đỏ: thà đỏ còn hơn bỏ sót).
 *
 *  `lopGiua` nhận mọi lớp `use()` KHÔNG phải router — middleware, hàm xử lý gắn thẳng, ứng
 *  dụng Express con (`mounted_app`). Những lớp này trả lời được yêu cầu mà không hiện thành
 *  route (trọng tài S1.0 đã chứng minh: `router.use('/x', (q, r) => r.json(...))` lọt lưới),
 *  nên test bắt khai cả chúng. */
export function duyetRoute(stack, tienTo = '', ra = [], lopGiua = []) {
  for (const lop of stack) {
    if (!lop.route && !(lop.handle && Array.isArray(lop.handle.stack))) {
      const gan = lop.__duongDanGan;
      const ds = gan === undefined ? ['<khong-ro-duong-gan>'] : (Array.isArray(gan) ? gan : [gan]);
      for (const g of ds) {
        const duong = typeof g === 'string' ? noi(tienTo || '/', g) : `${tienTo}<khong-phai-chuoi:${String(g)}>`;
        lopGiua.push(`USE ${duong} ${lop.handle?.name || '<an-danh>'}`);
      }
      continue;
    }
    if (lop.route) {
      const ds = Array.isArray(lop.route.path) ? lop.route.path : [lop.route.path];
      for (const p of ds) {
        const duong = typeof p === 'string' ? noi(tienTo, p) : `${tienTo}<khong-phai-chuoi:${String(p)}>`;
        for (const m of Object.keys(lop.route.methods)) {
          ra.push({ method: m === '_all' ? 'ALL' : m.toUpperCase(), path: duong });
        }
      }
    } else if (lop.handle && Array.isArray(lop.handle.stack)) {
      const gan = lop.__duongDanGan;
      const ds = gan === undefined ? ['<khong-ro-duong-gan>'] : (Array.isArray(gan) ? gan : [gan]);
      for (const g of ds) {
        duyetRoute(lop.handle.stack, typeof g === 'string' ? noi(tienTo, g) : `${tienTo}<khong-phai-chuoi:${String(g)}>`, ra, lopGiua);
      }
    }
  }
  return { routes: ra, lopGiua };
}

if (process.env.MA_TRAN_ROUTE_GIA === '1') {
  const { default: adminRouter } = await import(new URL('../../src/routes/admin/index.js', import.meta.url));
  adminRouter.get('/route-gia-chua-khai', (_req, res) => res.json({ ok: true }));
  adminRouter.use('/xuat-nhanh', (_req, res) => res.json({ ok: true }));
}

express.application.listen = function ngheCongNgauNhien(...args) {
  const app = this;
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const { routes, lopGiua } = duyetRoute(app._router ? app._router.stack : []);
    process.send?.({ loai: 'san-sang', cong: server.address().port, routes, lopGiua });
    try { cb?.(); } catch (e) { console.error('[ma-tran] callback listen lỗi:', e.message); }
  });
  return server;
};

process.on('message', (m) => { if (m === 'dung') process.exit(0); });
process.on('disconnect', () => process.exit(0));
