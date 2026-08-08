/**
 * Điểm khởi chạy ứng dụng React.
 */
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Không bọc StrictMode: ở chế độ dev StrictMode render mọi component 2 LẦN
// để dò lỗi — trên máy cấu hình thấp điều này làm web lag gấp đôi khi npm run dev.
// (StrictMode vốn không chạy ở bản production nên bỏ đi không ảnh hưởng web thật.)
createRoot(document.getElementById('root')!).render(<App />);

// Đăng ký service worker (PWA) — chỉ ở môi trường production
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* đăng ký thất bại không ảnh hưởng đến hoạt động chính của ứng dụng */
    });
  });
}
