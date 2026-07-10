/** Bắt mọi lỗi chưa xử lý, trả về JSON thống nhất, giấu chi tiết nhạy cảm */
export function errorHandler(err, _req, res, _next) {
  console.error('Lỗi không xử lý:', err.message);
  if (err.message?.includes('CORS')) return res.status(403).json({ error: 'Truy cập bị chặn (CORS).' });
  res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
}
