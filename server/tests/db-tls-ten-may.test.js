/**
 * KẾT NỐI CSDL QUA TLS PHẢI KIỂM TÊN MÁY (BUG-033)
 *
 * mysql2 với `ssl: { ca }` chỉ kiểm chữ ký CA, KHÔNG kiểm tên máy trên chứng chỉ —
 * kẻ đứng giữa máy chủ và kho, cầm một chứng chỉ bất kỳ do cùng CA cấp (CA của nhà
 * cung cấp ký cho mọi khách), đọc được kết quả truy vấn: gồm danh tính ĐÃ GIẢI MÃ khi
 * cán bộ bấm xem. Đã thử thật ở P96 trên MySQL 8.0 (chứng chỉ sai tên vẫn nối được).
 * Cả ba cách bật TLS đều phải có verifyIdentity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSsl } from '../src/db.js';

const ca = join(mkdtempSync(join(tmpdir(), 'htans-ca-')), 'ca.pem');
writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nthu\n-----END CERTIFICATE-----\n');

function voi(bien, fn) {
  const cu = { DB_SSL_CA: process.env.DB_SSL_CA, DB_SSL_CA_PEM: process.env.DB_SSL_CA_PEM, DB_SSL: process.env.DB_SSL };
  for (const k of Object.keys(cu)) delete process.env[k];
  Object.assign(process.env, bien);
  try { return fn(); } finally { for (const [k, v] of Object.entries(cu)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('DB_SSL_CA: kiểm CA VÀ tên máy', () => {
  const s = voi({ DB_SSL_CA: ca }, buildSsl);
  assert.ok(s?.ca, 'phải nạp CA');
  assert.equal(s.verifyIdentity, true);
});

test('DB_SSL_CA_PEM: kiểm CA VÀ tên máy', () => {
  const s = voi({ DB_SSL_CA_PEM: 'pem' }, buildSsl);
  assert.equal(s?.ca, 'pem');
  assert.equal(s.verifyIdentity, true);
});

test('DB_SSL=true (CA hệ thống): vẫn kiểm tên máy', () => {
  const s = voi({ DB_SSL: 'true' }, buildSsl);
  assert.equal(s?.verifyIdentity, true);
});

test('không khai gì: không bật TLS (kho cùng máy / mạng riêng)', () => {
  assert.equal(voi({}, buildSsl), undefined);
});
