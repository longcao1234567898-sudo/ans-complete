/** Tạo khoá mã hoá ENCRYPTION_KEY — chạy: node scripts-tao-khoa-ma-hoa.js */
import crypto from 'node:crypto';
const key = crypto.randomBytes(32).toString('hex');
console.log('\n=== KHOÁ MÃ HOÁ (ENCRYPTION_KEY) ===\n');
console.log(key);
console.log('\nDán vào:');
console.log('  1) server/.env      -> ENCRYPTION_KEY=' + key.slice(0, 12) + '...');
console.log('  2) Render Environment -> ENCRYPTION_KEY');
console.log('\n⚠️  GIỮ KHOÁ NÀY CẨN THẬN! Mất khoá = không giải mã được danh tính người gửi.\n');
