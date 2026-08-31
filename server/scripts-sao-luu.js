/**
 * SAO LƯU TOÀN BỘ DATABASE RA FILE SQL
 * ============================================================================
 *
 * Dùng:  cd server && node scripts-sao-luu.js
 *
 * Tạo file sao-luu/hop_thu_an_ninh_so_<ngày-giờ>.sql chứa ĐẦY ĐỦ: bảng, dữ
 * liệu, view, thủ tục, hàm, trigger. Nạp lại file đó là dựng lại được y nguyên
 * database ở bất kỳ đâu.
 *
 * VÌ SAO CẦN: database đang nằm trên dịch vụ đám mây. Hết hạn dùng thử, đổi
 * nhà cung cấp, hoặc lỡ tay xoá nhầm đều làm mất sạch dữ liệu ý kiến của bà
 * con. Có bản sao lưu thì dựng lại trong mươi phút; không có thì mất hẳn.
 *
 * Không cần cài mysqldump — script tự đọc và ghi bằng thư viện sẵn có.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './src/db.js';

const THU_MUC = 'sao-luu';

/** Đổi một giá trị bất kỳ thành dạng viết được vào câu SQL. */
function raSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (v instanceof Date) {
    /* Ghi theo giờ địa phương đúng như MySQL trả về, tránh lệch múi giờ khi
       nạp lại. Cắt phần mili giây cho gọn. */
    const p = (n) => String(n).padStart(2, '0');
    return `'${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} `
         + `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}'`;
  }
  if (typeof v === 'object') return escChuoi(JSON.stringify(v));
  return escChuoi(String(v));
}

/** Bọc chuỗi trong nháy đơn và thoát các ký tự đặc biệt. */
function escChuoi(s) {
  const t = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0')
    .replace(/\x1a/g, '\\Z');
  return `'${t}'`;
}

const bd = Date.now();
console.log('\n═══ SAO LƯU DATABASE ═══\n');

try {
  const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
  console.log(`Database: ${db}\n`);

  fs.mkdirSync(THU_MUC, { recursive: true });
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const ten = `${db}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
            + `_${p(d.getHours())}${p(d.getMinutes())}.sql`;
  const duongDan = path.join(THU_MUC, ten);
  const out = fs.createWriteStream(duongDan, { encoding: 'utf8' });
  const ghi = (s) => out.write(s + '\n');

  ghi('-- ============================================================');
  ghi(`-- SAO LƯU DATABASE: ${db}`);
  ghi(`-- Thời điểm: ${d.toLocaleString('vi-VN')}`);
  ghi('--');
  ghi('-- CÁCH NẠP LẠI: tạo database rỗng rồi mở HeidiSQL, chọn database');
  ghi('-- đó, vào File > Run SQL file... và chọn tệp này.');
  ghi('-- ============================================================');
  ghi('');
  ghi('SET NAMES utf8mb4;');
  ghi('SET FOREIGN_KEY_CHECKS = 0;');
  ghi('');

  /* ---------- BẢNG ---------- */
  const [dsBang] = await pool.query(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  console.log(`Tìm thấy ${dsBang.length} bảng:`);

  for (const { t } of dsBang) {
    const [[ddl]] = await pool.query(`SHOW CREATE TABLE \`${t}\``);
    ghi(`-- ---------- Bảng: ${t} ----------`);
    ghi(`DROP TABLE IF EXISTS \`${t}\`;`);
    ghi(ddl['Create Table'] + ';');
    ghi('');

    const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
    if (rows.length) {
      const cot = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
      /* Gộp nhiều dòng vào một câu INSERT cho gọn và nạp nhanh, nhưng chia lô
         500 dòng để câu không quá dài khiến máy chủ từ chối. */
      for (let i = 0; i < rows.length; i += 500) {
        const lo = rows.slice(i, i + 500);
        const giaTri = lo.map((r) => `(${Object.values(r).map(raSql).join(', ')})`).join(',\n  ');
        ghi(`INSERT INTO \`${t}\` (${cot}) VALUES\n  ${giaTri};`);
      }
      ghi('');
    }
    console.log(`   • ${t}: ${rows.length} dòng`);
  }

  /* ---------- VIEW ---------- */
  const [dsView] = await pool.query(
    `SELECT table_name AS v FROM information_schema.views
      WHERE table_schema = DATABASE() ORDER BY table_name`
  );
  if (dsView.length) {
    ghi('-- ========== VIEW ==========');
    for (const { v } of dsView) {
      const [[ddl]] = await pool.query(`SHOW CREATE VIEW \`${v}\``);
      ghi(`DROP VIEW IF EXISTS \`${v}\`;`);
      /* Bỏ phần DEFINER: nạp sang máy chủ khác thường không có user cũ, để
         nguyên sẽ báo lỗi không tạo được view. */
      ghi(ddl['Create View'].replace(/DEFINER=`[^`]*`@`[^`]*`\s*/i, '') + ';');
      ghi('');
    }
    console.log(`\nĐã lưu ${dsView.length} view`);
  }

  /* ---------- THỦ TỤC VÀ HÀM ---------- */
  const [dsRoutine] = await pool.query(
    `SELECT routine_name AS n, routine_type AS loai
       FROM information_schema.routines
      WHERE routine_schema = DATABASE() ORDER BY routine_name`
  );
  if (dsRoutine.length) {
    ghi('-- ========== THỦ TỤC VÀ HÀM ==========');
    ghi('DELIMITER $$');
    for (const { n, loai } of dsRoutine) {
      const tuKhoa = loai === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION';
      const [[ddl]] = await pool.query(`SHOW CREATE ${tuKhoa} \`${n}\``);
      const ma = ddl[`Create ${tuKhoa === 'PROCEDURE' ? 'Procedure' : 'Function'}`];
      if (!ma) continue;
      ghi(`DROP ${tuKhoa} IF EXISTS \`${n}\`$$`);
      ghi(ma.replace(/DEFINER=`[^`]*`@`[^`]*`\s*/i, '') + '$$');
      ghi('');
    }
    ghi('DELIMITER ;');
    ghi('');
    console.log(`Đã lưu ${dsRoutine.length} thủ tục/hàm`);
  }

  /* ---------- TRIGGER ---------- */
  const [dsTrigger] = await pool.query(
    `SELECT trigger_name AS n FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() ORDER BY trigger_name`
  );
  if (dsTrigger.length) {
    ghi('-- ========== TRIGGER ==========');
    ghi('DELIMITER $$');
    for (const { n } of dsTrigger) {
      const [[ddl]] = await pool.query(`SHOW CREATE TRIGGER \`${n}\``);
      const ma = ddl['SQL Original Statement'];
      if (!ma) continue;
      ghi(`DROP TRIGGER IF EXISTS \`${n}\`$$`);
      ghi(ma.replace(/DEFINER=`[^`]*`@`[^`]*`\s*/i, '') + '$$');
      ghi('');
    }
    ghi('DELIMITER ;');
    ghi('');
    console.log(`Đã lưu ${dsTrigger.length} trigger`);
  }

  ghi('SET FOREIGN_KEY_CHECKS = 1;');
  ghi('-- Hết bản sao lưu.');

  await new Promise((res) => out.end(res));
  const kb = (fs.statSync(duongDan).size / 1024).toFixed(0);
  console.log(`\n✅ XONG sau ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
  console.log(`   Tệp: ${path.resolve(duongDan)}`);
  console.log(`   Dung lượng: ${kb} KB`);
  console.log('\n⚠️ Chép tệp này ra chỗ khác (USB, Google Drive) — để cùng một');
  console.log('   máy thì hỏng máy là mất cả bản gốc lẫn bản sao.\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ LỖI khi sao lưu:', err.message);
  process.exit(1);
}
