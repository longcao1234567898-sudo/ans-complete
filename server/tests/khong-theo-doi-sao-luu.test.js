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
 * Không chạy trong thư mục Git (ví dụ bản giải nén từ tarball) thì bỏ qua:
 * không có chỉ mục thì cũng không có gì để lọt lên GitHub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GOC_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(...thamSo) {
  return execFileSync('git', thamSo, { cwd: GOC_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let coGit = true;
try { git('rev-parse', '--is-inside-work-tree'); } catch { coGit = false; }

test('BUG-005 — không tệp nào trong server/sao-luu/ được Git theo dõi', { skip: !coGit && 'không phải thư mục Git' }, () => {
  const dangTheoDoi = git('ls-files', '--', 'server/sao-luu').trim();
  assert.equal(dangTheoDoi, '', `Tệp sao lưu đang bị Git theo dõi — gỡ bằng "git rm --cached", thêm luật .gitignore KHÔNG đủ:\n${dangTheoDoi}`);
});

test('BUG-005 — bản sao lưu mới sinh ra sẽ bị .gitignore chặn', { skip: !coGit && 'không phải thư mục Git' }, () => {
  // Tên theo đúng mẫu scripts-sao-luu.js sinh ra; tệp này không cần tồn tại.
  const tepMoi = 'server/sao-luu/hop_thu_an_ninh_so_20991231_2359.sql';
  let biChan = true;
  try { git('check-ignore', '-q', '--no-index', tepMoi); } catch { biChan = false; }
  assert.ok(biChan, `Luật .gitignore không chặn ${tepMoi}`);
});
