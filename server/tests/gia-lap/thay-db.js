/**
 * Nạp bằng `node --import <tệp này> scripts-sao-luu.js`: đổi `./src/db.js` của
 * script sang pool giả. Không đụng vào mã script — test chạy đúng mã sản phẩm.
 */
import { register } from 'node:module';

register('./hook-thay-db.js', import.meta.url);
