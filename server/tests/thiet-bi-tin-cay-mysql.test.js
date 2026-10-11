/**
 * THIẾT BỊ TIN CẬY PHẢI LƯU ĐƯỢC TRÊN MYSQL THẬT (ND-028)
 *
 * Route POST /api/admin/chat/trusted-devices ghi `blacklists.kind = 'trusted_device'`,
 * nhưng cột khai ENUM('device','ip') ở nang_cap_v12.sql. MySQL chế độ nghiêm ngặt từ
 * chối câu INSERT; chế độ không nghiêm ngặt ghi chuỗi rỗng — máy ki-ốt dùng chung không
 * bao giờ được miễn khoá, một người gửi tin rác là khoá máy của mọi người sau đó.
 *
 * Mọi test khác chạy SQLite (không có ENUM) nên không thấy lỗi này. Test ở đây đọc
 * thẳng mã máy chủ và các tệp nâng cấp CSDL: giá trị `kind` nào mã ghi vào thì định
 * nghĩa cuối cùng của cột trong chuỗi migration phải nhận giá trị đó. Giá trị lấy từ
 * mã sản phẩm, không chép tay (bài học P11).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const SRC = new URL('../src/', import.meta.url);
const DB = new URL('../../database/', import.meta.url);

async function tepJs(thuMuc) {
  const ra = [];
  for (const muc of await readdir(thuMuc, { withFileTypes: true })) {
    const url = new URL(muc.name + (muc.isDirectory() ? '/' : ''), thuMuc);
    if (muc.isDirectory()) ra.push(...await tepJs(url));
    else if (muc.name.endsWith('.js')) ra.push(url);
  }
  return ra;
}

/** Bỏ chú thích JS để chú thích giải thích bản vá không làm test khớp nhầm (bài học P14) */
const boChuThichJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Mọi giá trị kind mà mã máy chủ ghi vào bảng blacklists */
async function kindMaGhi() {
  const kinds = new Set();
  for (const url of await tepJs(SRC)) {
    const ma = boChuThichJs(await readFile(url, 'utf8'));
    const re = /INSERT INTO blacklists\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/g;
    for (const m of ma.matchAll(re)) {
      const cot = m[1].split(',').map((x) => x.trim());
      const giaTri = m[2].split(',').map((x) => x.trim());
      const v = giaTri[cot.indexOf('kind')];
      assert.ok(v, `không đọc được giá trị kind trong câu INSERT ở ${url.pathname}`);
      assert.match(v, /^'[a-z_]+'$/, `kind phải là hằng trong câu SQL (${url.pathname}): ${v}`);
      kinds.add(v.slice(1, -1));
    }
  }
  return kinds;
}

const soPhienBan = (ten) => Number((ten.match(/^nang_cap_v(\d+)\.sql$/) || [])[1]);

/** Tệp nâng cấp theo đúng thứ tự chạy; bỏ chú thích SQL, gộp '' của SQL động */
async function tepNangCap() {
  const ten = (await readdir(DB)).filter((t) => Number.isFinite(soPhienBan(t)))
    .sort((a, b) => soPhienBan(a) - soPhienBan(b));
  const ra = [];
  for (const t of ten) {
    const goc = (await readFile(new URL(t, DB), 'utf8')).replace(/^\s*--.*$/gm, '');
    ra.push({ ten: t, goc, sql: goc.replace(/''/g, "'") });
  }
  return ra;
}

const docEnum = (s) => s.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));

/** Định nghĩa ENUM của blacklists.kind sau khi chạy hết chuỗi nâng cấp */
async function enumCuoiCung() {
  let hienTai = null;
  let tuTep = null;
  for (const { ten, sql } of await tepNangCap()) {
    const tao = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?blacklists`?\s*\(([\s\S]*?)\)\s*ENGINE/i);
    if (tao) {
      const m = tao[1].match(/\bkind\s+ENUM\(([^)]*)\)/i);
      if (m) { hienTai = docEnum(m[1]); tuTep = ten; }
    }
    for (const m of sql.matchAll(/ALTER TABLE\s+`?blacklists`?[\s\S]*?MODIFY(?:\s+COLUMN)?\s+`?kind`?\s+ENUM\(([^)]*)\)/gi)) {
      hienTai = docEnum(m[1]); tuTep = ten;
    }
  }
  return { hienTai, tuTep };
}

describe('ND-028 — cột blacklists.kind nhận mọi giá trị mã máy chủ ghi', () => {
  test('mã ghi ít nhất device và trusted_device (test tự kiểm nó còn đọc đúng mã)', async () => {
    const kinds = await kindMaGhi();
    assert.ok(kinds.has('device'), 'không thấy câu INSERT kind = device — cách đọc mã đã hỏng');
    assert.ok(kinds.has('trusted_device'), 'không thấy câu INSERT kind = trusted_device — cách đọc mã đã hỏng');
  });

  test('ENUM sau chuỗi nâng cấp chứa mọi kind mã ghi vào', async () => {
    const { hienTai, tuTep } = await enumCuoiCung();
    assert.ok(hienTai, 'không tìm thấy định nghĩa cột blacklists.kind trong database/nang_cap_v*.sql');
    for (const k of await kindMaGhi()) {
      assert.ok(hienTai.includes(k),
        `blacklists.kind = ENUM(${hienTai.join(',')}) (định nghĩa cuối ở ${tuTep}) không nhận '${k}' — MySQL nghiêm ngặt từ chối, không nghiêm ngặt ghi chuỗi rỗng`);
    }
  });

  test('tệp nới ENUM khôi phục dòng tin cậy đã bị ghi thành chuỗi rỗng', async () => {
    /* Máy chạy chế độ không nghiêm ngặt đã có dòng kind = '' (đó từng là thiết bị lãnh đạo
       đánh dấu tin cậy). Nới ENUM mà không khôi phục thì lãnh đạo tưởng máy đã tin cậy */
    const { tuTep } = await enumCuoiCung();
    const sql = (await tepNangCap()).find((t) => t.ten === tuTep).goc; // giữ nguyên '' của chuỗi rỗng
    assert.match(sql, /UPDATE\s+blacklists\s+SET\s+kind\s*=\s*'trusted_device'[\s\S]*?WHERE\s+kind\s*=\s*''/i,
      `${tuTep} phải đổi dòng kind = '' về 'trusted_device'`);
  });

  test('báo lỗi của route thêm thiết bị tin cậy chỉ đúng tệp nâng cấp cần chạy', async () => {
    const { tuTep } = await enumCuoiCung();
    const ma = await readFile(new URL('routes/admin/chat.js', SRC), 'utf8');
    const khoi = ma.slice(ma.indexOf("router.post('/trusted-devices'"), ma.indexOf("router.delete('/trusted-devices"));
    assert.ok(khoi.includes(tuTep),
      `POST /trusted-devices lỗi phải nhắc chạy ${tuTep}, không nhắc tệp khác`);
  });
});
