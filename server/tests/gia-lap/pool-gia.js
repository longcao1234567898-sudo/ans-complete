/**
 * Pool giả thay cho src/db.js khi test chạy scripts-sao-luu.js THẬT mà không
 * cần MySQL: một database rỗng tên `bug005_gia` — không bảng, view, thủ tục,
 * trigger. Tên riêng biệt để test dọn đúng tệp mình sinh ra, không đụng bản
 * sao lưu thật nằm cùng thư mục.
 */
export const TEN_DB_GIA = 'bug005_gia';

export const pool = {
  async query(sql) {
    if (/SELECT DATABASE\(\)/.test(sql)) return [[{ db: TEN_DB_GIA }]];
    return [[]];
  },
};
