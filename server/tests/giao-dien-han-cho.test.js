/**
 * GIAO DIỆN CHẠY ĐƯỢC TRÊN SAFARI CŨ: KHÔNG DÙNG AbortSignal.timeout (ND-080)
 *
 * AbortSignal.timeout chưa có trên Safari < 16 (iOS 15): lời gọi ném lỗi ngay -> coi như
 * máy chủ chết (kiemTraMayChu đẩy người dân sang trang dự phòng oan). Dùng hanCho (api.ts,
 * AbortController).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const SRC = new URL('../../src/', import.meta.url);
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('không mã giao diện nào dùng AbortSignal.timeout (ND-080)', async () => {
  const tep = (await readdir(SRC, { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
  const vi = [];
  for (const f of tep) if (/AbortSignal\.timeout\s*\(/.test(boChuThich(await readFile(new URL(f, SRC), 'utf8')))) vi.push(f);
  assert.deepEqual(vi, []);
});
