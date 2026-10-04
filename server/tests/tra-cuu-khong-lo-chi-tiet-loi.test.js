/**
 * BUG-028 — TRANG TRA CỨU KHÔNG ĐƯỢC TRẢ CHI TIẾT LỖI MÁY CHỦ CHO NGƯỜI NGOÀI
 *
 * Route yêu cầu xoá dữ liệu là route công khai (chỉ cần mã tra cứu). Lỗi nội bộ
 * — câu lỗi của CSDL, tên bảng, tên cột, địa chỉ máy CSDL — không được ra khỏi
 * máy chủ ở máy thật. Render không đặt NODE_ENV, nên "giấu khi production" là
 * hở đúng ở chỗ chạy thật (cùng mẫu BUG-025). Chẩn đoán vẫn phải còn, nhưng ở
 * log máy chủ — chỗ quản trị viên đọc được, người ngoài thì không.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');

/* Các lỗi MySQL thật hay gặp ở route này — nội dung đúng kiểu MySQL trả về */
const LOI = {
  thieuCot: Object.assign(new Error("Unknown column 'identity_erased_at' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' }),
  thieuBang: Object.assign(new Error("Table 'hop_thu_that.data_deletion_requests' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }),
  matKetNoi: Object.assign(new Error('connect ECONNREFUSED 10.20.30.40:3306'), { code: 'ECONNREFUSED' }),
};
/* Những mẩu không được lọt ra phản hồi công khai */
const CAM = ['identity_erased_at', 'Unknown column', 'data_deletion_requests', 'hop_thu_that',
  'ECONNREFUSED', '10.20.30.40', 'nang_cap_v8', 'health/schema', 'field list'];

const goiXoa = async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/tracking', trackingRouter);
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/tracking/ABC123/request-deletion`, { method: 'POST' });
    return { status: r.status, text: await r.text() };
  } finally { sv.close(); }
};

/* Hồ sơ có danh tính, đã đóng -> route đi tới câu UPDATE thì ném lỗi */
const loiOCauThu = (loi) => {
  let lan = 0;
  pool.query = async () => {
    lan += 1;
    if (lan === 1) return [[{ id: 7, tracking_code: 'ABC123', status: 'resolved', is_anonymous: 0, identity_erased: 0 }], []];
    if (lan === 2) return [[], []];
    throw loi;
  };
};

let nodeEnvCu;
let logLoi;
let consoleErrorCu;
beforeEach(() => {
  nodeEnvCu = process.env.NODE_ENV;
  logLoi = [];
  consoleErrorCu = console.error;
  console.error = (...a) => { logLoi.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.error = consoleErrorCu;
  if (nodeEnvCu === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnvCu;
});

const MAY_THAT = [
  ['không khai NODE_ENV (Render)', undefined],
  ['production', 'production'],
  ['khai sai chữ "prod"', 'prod'],
  ['khai " Production" có khoảng trắng', ' Production'],
];

describe('BUG-028 — máy thật: phản hồi công khai không chứa chi tiết lỗi', () => {
  for (const [ten, giaTri] of MAY_THAT) {
    for (const [loai, loi] of Object.entries(LOI)) {
      test(`${ten} · lỗi ${loai}`, async () => {
        if (giaTri === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = giaTri;
        loiOCauThu(loi);
        const r = await goiXoa();
        assert.equal(r.status, 500);
        for (const manh of CAM) {
          assert.ok(!r.text.includes(manh), `phản hồi công khai lộ "${manh}": ${r.text}`);
        }
        assert.ok(!('detail' in JSON.parse(r.text)), 'còn trường detail ở máy thật');
        assert.match(JSON.parse(r.text).error, /trực ban/, 'người dân phải được chỉ chỗ hỏi');
      });
    }
  }
});

describe('BUG-028 — chẩn đoán không mất, chỉ chuyển vào log máy chủ', () => {
  test('thiếu cột: log máy chủ nêu đúng tên cột và chỗ xem', async () => {
    delete process.env.NODE_ENV;
    loiOCauThu(LOI.thieuCot);
    await goiXoa();
    const log = logLoi.join('\n');
    assert.match(log, /identity_erased_at/);
    assert.match(log, /health\/schema/);
  });

  test('thiếu bảng: log máy chủ chỉ tệp nâng cấp', async () => {
    delete process.env.NODE_ENV;
    loiOCauThu(LOI.thieuBang);
    await goiXoa();
    assert.match(logLoi.join('\n'), /nang_cap_v8\.sql/);
  });

  test('máy cá nhân khai rõ development: vẫn thấy chi tiết để gỡ lỗi', async () => {
    process.env.NODE_ENV = 'development';
    loiOCauThu(LOI.thieuCot);
    const r = await goiXoa();
    assert.match(JSON.parse(r.text).detail ?? '', /identity_erased_at/);
  });
});

describe('BUG-028 biến thể (c) — không route nào giấu chi tiết lỗi theo NODE_ENV === production', () => {
  /* Mẫu này hở trên Render (không đặt NODE_ENV). Nới lỏng phải khai tường minh
     development/test — như mailer.js và turnstile.js. */
  test('server/src không còn so NODE_ENV với production', async () => {
    const thuMuc = new URL('../src/', import.meta.url);
    const tep = (await readdir(thuMuc, { recursive: true })).filter((t) => t.endsWith('.js'));
    const vi = [];
    for (const t of tep) {
      const ma = await readFile(new URL(t, thuMuc), 'utf8');
      ma.split('\n').forEach((dong, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(dong)) return;
        if (/NODE_ENV\s*[!=]==?\s*['"]production['"]/.test(dong)) vi.push(`${t}:${i + 1}`);
      });
    }
    assert.deepEqual(vi, [], `còn so NODE_ENV với production: ${vi.join(', ')}`);
  });
});
