/**
 * NƠI GHI BẢN SAO LƯU — tách riêng khỏi scripts-sao-luu.js để test đọc được
 * đúng giá trị script dùng mà không phải nối database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* Neo theo vị trí tệp này, KHÔNG theo thư mục đang đứng. Bản cũ ghi 'sao-luu'
   tương đối: chạy script từ gốc repo là sinh ra <gốc>/sao-luu/, nằm ngoài luật
   .gitignore và bị `git add -A` vơ theo (BUG-005). */
export const THU_MUC_SAO_LUU = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sao-luu');

function timGocRepo(tuThuMuc) {
  let d = path.resolve(tuThuMuc);
  for (;;) {
    // `.git` có thể là thư mục, hoặc là tệp (worktree, submodule).
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const cha = path.dirname(d);
    if (cha === d) return null;
    d = cha;
  }
}

/**
 * Chốt chặn cuối trước khi ghi: đích nằm trong một repo Git thì chính Git phải
 * xác nhận đích bị ignore, không thì ném lỗi. Không tin suông vào .gitignore:
 * luật có thể lệch với nơi ghi (đúng như BUG-005), hoặc bị xoá lẫn trong một
 * commit không liên quan (luật buglogs/ đã từng như thế).
 *
 * Fail-safe: có `.git` mà không hỏi được Git (không có git trong PATH — máy chỉ
 * dùng GitHub Desktop vẫn commit được — hoặc git báo lỗi) thì cũng từ chối.
 * Không kiểm được thì coi là không an toàn. Ngoài mọi repo thì cho ghi: không có
 * chỉ mục thì không có gì để lọt lên GitHub.
 */
export function kiemDichSaoLuu(duongDan) {
  const theoChu = path.resolve(duongDan);
  /* Kiểm cả đường theo chữ lẫn đường thật: `sao-luu/` là junction/symlink trỏ
     sang thư mục không bị chặn thì Git thấy đường chữ bị ignore, còn dữ liệu
     lại nằm ở đích của liên kết — nơi `git add -A` vơ được. */
  const duongThat = timDuongThat(theoChu);
  kiemMotDuong(theoChu);
  if (duongThat !== theoChu) kiemMotDuong(duongThat);
}

/** Đường thật của tổ tiên gần nhất đã tồn tại, nối lại phần đuôi chưa tồn tại. */
function timDuongThat(tuyetDoi) {
  let dau = tuyetDoi;
  const duoi = [];
  // lstat chứ không exists: liên kết treo vẫn là một chặng phải phân giải.
  while (!coChang(dau)) {
    const cha = path.dirname(dau);
    if (cha === dau) return tuyetDoi;
    duoi.unshift(path.basename(dau));
    dau = cha;
  }
  try {
    return path.join(fs.realpathSync.native(dau), ...duoi);
  } catch (err) {
    throw new Error(`Không xác định được đường thật của ${dau} (${err.code}) — từ chối ghi vì không kiểm được.`);
  }
}

function coChang(p) {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

function kiemMotDuong(tuyetDoi) {
  const goc = timGocRepo(path.dirname(tuyetDoi));
  if (!goc) return;
  try {
    // Không dùng --no-index: tệp trùng tên mà đang bị theo dõi thì cũng phải từ chối.
    execFileSync('git', ['check-ignore', '-q', '--', tuyetDoi], { cwd: goc, stdio: 'ignore' });
  } catch (err) {
    if (err.status === 1) {
      throw new Error(`Đích sao lưu ${tuyetDoi} nằm trong repo Git ${goc} mà không bị .gitignore chặn — từ chối ghi, bản sao lưu sẽ lọt lên GitHub.`);
    }
    throw new Error(`Không hỏi được Git xem ${tuyetDoi} có bị .gitignore chặn không (${err.code || `mã thoát ${err.status}`}) — từ chối ghi vì không kiểm được.`);
  }
}
