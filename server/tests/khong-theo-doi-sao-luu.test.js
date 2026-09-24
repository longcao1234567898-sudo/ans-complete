/**
 * BUG-005 — bản sao lưu cơ sở dữ liệu KHÔNG được nằm trong Git.
 *
 * Sự cố: `server/sao-luu/*.sql` bị `git add` trước khi có luật `.gitignore`,
 * nên luật đó không có tác dụng — Git chỉ bỏ qua tệp CHƯA được theo dõi. Tệp
 * cứ thế được đẩy lên GitHub công khai qua nhiều phiên mà không ai thấy, vì
 * mọi bước kiểm chỉ soát diff, còn tệp đã theo dõi từ lâu không bao giờ hiện
 * trong diff nào nữa.
 *
 * Vì vậy test soát CHỈ MỤC (`git ls-files`), không soát diff. Và soát cả luật
 * ignore với một tên tệp chưa tồn tại (`--no-index`): lần sao lưu sau sinh tên
 * mới theo ngày giờ, luật phải chặn được cả tên đó chứ không chỉ tệp cũ.
 *
 * Đường ghi LẤY TỪ MÃ SẢN PHẨM (`dich-sao-luu.js`), không chép tay: bản test
 * trước chép tay `server/sao-luu/…` trong khi script ghi `sao-luu/` tương đối
 * theo thư mục đang đứng — hai thứ lệch nhau mà test vẫn xanh.
 *
 * Không chạy trong thư mục Git (ví dụ bản giải nén từ tarball) thì bỏ qua:
 * không có chỉ mục thì cũng không có gì để lọt lên GitHub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Nhập cả không gian tên: thiếu một export thì chỉ test dùng nó đỏ, không sập cả tệp.
import * as dich from '../dich-sao-luu.js';

const GOC_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE_DICH = path.join(GOC_REPO, 'server', 'dich-sao-luu.js');
// Tên theo đúng mẫu scripts-sao-luu.js sinh ra; tệp không cần tồn tại.
const TEN_MAU = 'hop_thu_an_ninh_so_20991231_2359.sql';

function git(...thamSo) {
  return execFileSync('git', thamSo, { cwd: GOC_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function biIgnore(duongDan) {
  try { git('check-ignore', '-q', '--no-index', '--', duongDan); return true; } catch { return false; }
}

let coGit = true;
try { git('rev-parse', '--is-inside-work-tree'); } catch { coGit = false; }
const boQua = !coGit && 'không phải thư mục Git';

/** `-z`: không có nó Git bọc ngoặc tên có dấu ("sao-luu/b\341\272\243n.sql") và regex hụt. */
function tepDangTheoDoi() {
  return git('ls-files', '-z').split('\0').filter(Boolean);
}

test('BUG-005 — không đường dẫn sao-luu/ nào trong toàn repo được Git theo dõi', { skip: boQua }, () => {
  const dangTheoDoi = tepDangTheoDoi().filter((f) => /(^|\/)sao-luu\//i.test(f));
  assert.deepEqual(dangTheoDoi, [], `Tệp sao lưu đang bị Git theo dõi — gỡ bằng "git rm --cached", thêm luật .gitignore KHÔNG đủ:\n${dangTheoDoi.join('\n')}`);
});

test('BUG-005 — không tệp nào được theo dõi mang đầu tệp của bản sao lưu', { skip: boQua }, () => {
  // Bắt cả bản sao lưu bị đổi tên hay chép sang thư mục khác, và bản xuất bằng
  // công cụ khác (script tự nhắc dùng HeidiSQL). Dấu ^ để không khớp chính dòng
  // ghi(...) trong scripts-sao-luu.js hay các comment nhắc tên HeidiSQL.
  // Bản nén (.gz/.zip) thì không soát nội dung được — đó là giới hạn đã biết.
  let tim = '';
  try {
    tim = git('grep', '--cached', '-l', '-E', '^(-- (SAO LƯU DATABASE:|MySQL dump [0-9]|MariaDB dump [0-9]|HeidiSQL Version:|phpMyAdmin SQL Dump)|/\\* Navicat)').trim();
  } catch (e) { if (e.status !== 1) throw e; }
  assert.equal(tim, '', `Tệp được theo dõi có đầu tệp của bản sao lưu:\n${tim}`);
});

test('BUG-005 — tệp dữ liệu/nén chỉ được theo dõi ở chỗ cho phép: database/*.sql', { skip: boQua }, () => {
  // Allow-list theo VỊ TRÍ, không đuổi theo từng kiểu đầu tệp: bản xuất tay bằng
  // phpMyAdmin, mysqldump --skip-comments, hay mysqldump > tệp trong PowerShell
  // (UTF-16, git grep không đọc được) đều không có dấu hiệu nội dung đáng tin.
  // Seed/migration viết tay nằm ở database/; ngoài đó thì không có .sql nào hợp lệ.
  const DUOI_DU_LIEU = /\.(sql|gz|zip|7z|rar|bak|dump|tar|tgz|bz2|xz|db|sqlite3?|mdb)$/i;
  const CHO_PHEP = /^database\/[^/]+\.sql$/;
  const lot = tepDangTheoDoi().filter((f) => DUOI_DU_LIEU.test(f) && !CHO_PHEP.test(f));
  assert.deepEqual(lot, [], 'Tệp dữ liệu/nén bị theo dõi ngoài database/*.sql — nếu là seed viết tay thì chuyển vào database/');
});

/* ---- Chạy scripts-sao-luu.js THẬT (pool giả, không cần MySQL) ----
   Không suy từ hằng số: test trước suy từ hằng số và xanh cả khi script thôi
   dùng hằng số đó. Ở đây soát chính tệp script ghi ra. */
const SCRIPT = path.join(GOC_REPO, 'server', 'scripts-sao-luu.js');
const THAY_DB = pathToFileURL(path.join(GOC_REPO, 'server', 'tests', 'gia-lap', 'thay-db.js')).href;

function chayScript(cwd, env = process.env) {
  const kq = spawnSync(process.execPath, ['--import', THAY_DB, SCRIPT], { cwd, env, encoding: 'utf8' });
  return { ...kq, tep: /Tệp: (.+)/.exec(kq.stdout)?.[1]?.trim() };
}

/** Tệp bug005_gia_*.sql mà Git thấy là chưa theo dõi và KHÔNG bị ignore — tức `git add -A` sẽ vơ. */
function tepGiaLot() {
  return git('status', '--porcelain', '--untracked-files=all').split('\n')
    .filter((d) => d.startsWith('?? ') && d.includes('bug005_gia_')).map((d) => d.slice(3));
}

/** Dọn mọi tệp bug005_gia_*.sql script có thể đã ghi, kể cả ở chỗ sai (trạng thái chưa vá). */
function donTepGia(cwds) {
  for (const thuMuc of new Set([dich.THU_MUC_SAO_LUU, ...cwds.map((c) => path.resolve(c, 'sao-luu'))])) {
    if (!fs.existsSync(thuMuc)) continue;
    const gia = fs.readdirSync(thuMuc).filter((f) => f.startsWith('bug005_gia_'));
    for (const f of gia) fs.rmSync(path.join(thuMuc, f));
    if (gia.length && fs.readdirSync(thuMuc).length === 0) fs.rmdirSync(thuMuc);
  }
}

test('BUG-005 — chạy script sao lưu thật từ thư mục nào thì bản sao lưu cũng bị .gitignore chặn', { skip: boQua }, () => {
  const thuMucChay = [GOC_REPO, path.join(GOC_REPO, 'server'), path.join(GOC_REPO, 'database'), os.tmpdir()];
  const coSan = fs.existsSync(dich.THU_MUC_SAO_LUU);
  try {
    for (const cwd of thuMucChay) {
      const kq = chayScript(cwd);
      assert.equal(kq.status, 0, `Script lỗi khi chạy từ ${cwd}: ${kq.stderr}`);
      assert.ok(kq.tep, `Không đọc được đường tệp script in ra (chạy từ ${cwd})`);
      assert.ok(biIgnore(kq.tep), `Chạy từ ${cwd}: bản sao lưu ghi ra ${kq.tep} không bị .gitignore chặn`);
      assert.deepEqual(tepGiaLot(), [], `Chạy từ ${cwd}: git add -A sẽ vơ bản sao lưu`);
      donTepGia([cwd]);
    }
  } finally {
    donTepGia(thuMucChay);
    if (coSan) fs.mkdirSync(dich.THU_MUC_SAO_LUU, { recursive: true });
  }
});

test('BUG-005 — script sao lưu thật từ chối ghi khi chốt chặn không kiểm được (không có git)', { skip: boQua }, () => {
  // Chứng minh script thật sự GỌI chốt chặn trước khi ghi, không chỉ import nó.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  env.PATH = '';
  const coSan = fs.existsSync(dich.THU_MUC_SAO_LUU);
  try {
    const kq = chayScript(GOC_REPO, env);
    assert.notEqual(kq.status, 0, `Không có git mà script vẫn ghi bản sao lưu ra ${kq.tep}`);
    assert.equal(kq.tep, undefined, 'Script không được in đường tệp khi từ chối');
    // Soát đĩa, không chỉ soát lời script in ra: chốt chặn gọi SAU khi đã ghi
    // thì vẫn báo lỗi đúng, nhưng tệp đã nằm trên đĩa chờ `git add -A`.
    const daGhi = [dich.THU_MUC_SAO_LUU, path.join(GOC_REPO, 'sao-luu')]
      .filter((d) => fs.existsSync(d))
      .flatMap((d) => fs.readdirSync(d).filter((f) => f.startsWith('bug005_gia_')));
    assert.deepEqual(daGhi, [], 'Script từ chối nhưng vẫn để lại tệp sao lưu trên đĩa');
  } finally {
    donTepGia([GOC_REPO]);
    if (coSan) fs.mkdirSync(dich.THU_MUC_SAO_LUU, { recursive: true });
  }
});

test('BUG-005 — luật .gitignore chặn thư mục sao-luu/ ở mọi độ sâu', { skip: boQua }, () => {
  const bienThe = [
    `server/sao-luu/${TEN_MAU}`,
    'server/sao-luu/x.sql.gz',
    'server/sao-luu/con/x.sql',
    `sao-luu/${TEN_MAU}`,
    'database/sao-luu/x.sql',
    'src/sao-luu/x.sql',
    'server/src/sao-luu/x.sql',
  ];
  const lot = bienThe.filter((f) => !biIgnore(f));
  assert.deepEqual(lot, [], 'Luật .gitignore không chặn các đường sau');
});

test('BUG-005 — chốt chặn: từ chối ghi vào chỗ trong repo mà .gitignore không chặn', { skip: boQua }, () => {
  assert.equal(typeof dich.kiemDichSaoLuu, 'function', 'dich-sao-luu.js chưa có chốt chặn kiemDichSaoLuu');
  assert.throws(() => dich.kiemDichSaoLuu(path.join(GOC_REPO, 'khong-bi-chan-bug005', TEN_MAU)), /không bị \.gitignore chặn/);
  assert.doesNotThrow(() => dich.kiemDichSaoLuu(path.join(dich.THU_MUC_SAO_LUU, TEN_MAU)));
});

test('BUG-005 — chốt chặn: ngoài mọi repo Git thì cho ghi', { skip: boQua }, (t) => {
  assert.equal(typeof dich.kiemDichSaoLuu, 'function', 'dich-sao-luu.js chưa có chốt chặn kiemDichSaoLuu');
  // Đường KHÔNG tồn tại ngay dưới gốc ổ đĩa: chốt chặn chỉ dò `.git` theo đường
  // dẫn nên không cần tạo gì. Không dùng os.tmpdir() — thư mục home có thể là
  // một repo Git (dotfiles), khi đó thư mục tạm cũng "nằm trong repo".
  const ngoai = [path.parse(GOC_REPO).root, path.parse(os.tmpdir()).root]
    .map((goc) => path.join(goc, `khong-ton-tai-bug005-${process.pid}`, TEN_MAU))
    .find((p) => !fs.existsSync(path.join(path.parse(p).root, '.git')));
  if (!ngoai) return t.skip('gốc ổ đĩa của máy này là một repo Git');
  assert.doesNotThrow(() => dich.kiemDichSaoLuu(ngoai));
});

test('BUG-005 — chốt chặn: không bị lừa bởi junction/symlink trỏ sao-luu/ sang thư mục không bị chặn', { skip: boQua }, () => {
  assert.equal(typeof dich.kiemDichSaoLuu, 'function', 'dich-sao-luu.js chưa có chốt chặn kiemDichSaoLuu');
  // Repo tạm riêng: không tạo liên kết nào bên trong repo thật.
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'bug005-lk-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tam });
    fs.writeFileSync(path.join(tam, '.gitignore'), 'sao-luu/\n');
    fs.mkdirSync(path.join(tam, 'khac'));
    // 'junction' chạy không cần quyền admin trên Windows; nơi khác Node bỏ qua tham số này.
    fs.symlinkSync(path.join(tam, 'khac'), path.join(tam, 'sao-luu'), 'junction');
    assert.throws(() => dich.kiemDichSaoLuu(path.join(tam, 'sao-luu', TEN_MAU)), /không bị \.gitignore chặn/);
  } finally {
    fs.rmSync(tam, { recursive: true, force: true });
  }
});

test('BUG-005 — chốt chặn: từ chối ghi đè tệp đang bị theo dõi, dù nằm trong thư mục bị ignore', { skip: boQua }, () => {
  assert.equal(typeof dich.kiemDichSaoLuu, 'function', 'dich-sao-luu.js chưa có chốt chặn kiemDichSaoLuu');
  // Đúng hình thái sự cố gốc: tệp bị add trước khi có luật, luật ignore không cứu.
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'bug005-td-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tam });
    fs.writeFileSync(path.join(tam, '.gitignore'), 'sao-luu/\n');
    fs.mkdirSync(path.join(tam, 'sao-luu'));
    fs.writeFileSync(path.join(tam, 'sao-luu', TEN_MAU), '');
    execFileSync('git', ['add', '-f', `sao-luu/${TEN_MAU}`], { cwd: tam });
    assert.throws(() => dich.kiemDichSaoLuu(path.join(tam, 'sao-luu', TEN_MAU)), /không bị \.gitignore chặn/);
  } finally {
    fs.rmSync(tam, { recursive: true, force: true });
  }
});

test('BUG-005 — chốt chặn fail-safe: có repo mà không gọi được git thì từ chối', { skip: boQua }, () => {
  // Máy chỉ có GitHub Desktop vẫn commit được dù PATH không có git — nên không
  // hỏi được Git thì phải coi là không an toàn, không phải "không có repo".
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  env.PATH = '';
  const ma = `import * as d from ${JSON.stringify(pathToFileURL(MODULE_DICH).href)};
    try { d.kiemDichSaoLuu(d.THU_MUC_SAO_LUU + '/x.sql'); console.log('CHO_GHI'); }
    catch (e) { console.log(e instanceof TypeError ? 'CHUA_CO_CHOT' : 'TU_CHOI'); }`;
  const kq = spawnSync(process.execPath, ['--input-type=module', '-e', ma], { cwd: GOC_REPO, env, encoding: 'utf8' });
  assert.equal(kq.stdout.trim(), 'TU_CHOI', `Không gọi được git mà chốt chặn vẫn cho ghi. stderr: ${kq.stderr}`);
});
