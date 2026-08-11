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

/* ==========================================================================
   BÁO CHO index.html BIẾT ỨNG DỤNG ĐÃ VẼ XONG

   index.html ẩn #root cho tới khi có lớp "san-sang". Không có dòng này thì
   phải chờ hết 3 giây của lối thoát mới hiện — trang trông như bị treo.

   requestAnimationFrame lồng hai lần: lần đầu đợi React vẽ xong DOM, lần hai
   đợi trình duyệt tính xong bố cục. Gắn sớm hơn thì vẫn kịp thấy nội dung thô.
   ========================================================================== */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.classList.add('san-sang');
  });
});

/* ==========================================================================
   ĐĂNG KÝ SERVICE WORKER (PWA) — chỉ ở môi trường production

   ⚠️ KÈM CƠ CHẾ THOÁT KHỎI BẢN CŨ.

   Vấn đề đã gặp: đăng bản mới lên Netlify xong, máy người dùng vẫn hiện giao
   diện cũ. Nguyên nhân là service worker đời trước còn nằm trong máy họ và
   phục vụ tệp từ bộ nhớ đệm. Xoá cache thủ công mới thoát — nhưng bà con
   không biết cách xoá, và cũng không nên bắt họ làm vậy.

   Đã sửa gốc bằng quy định Cache-Control trong public/_headers. Ba dòng dưới
   là lớp thứ hai, lo cho những máy ĐÃ kẹt sẵn từ trước khi có bản vá đó.
   ========================================================================== */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        /* Ép kiểm tra bản mới ngay, không chờ trình duyệt tự kiểm (có thể
           mất tới 24 giờ). */
        reg.update().catch(() => { /* bỏ qua */ });

        /* Có bản mới đang chờ -> bảo nó chiếm quyền ngay rồi tải lại trang
           MỘT LẦN. Không làm vậy thì bản mới chỉ có hiệu lực ở lần mở web
           kế tiếp — người dùng tưởng đăng bản mới không ăn. */
        reg.addEventListener('updatefound', () => {
          const moi = reg.installing;
          if (!moi) return;
          moi.addEventListener('statechange', () => {
            if (moi.state === 'installed' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {
        /* đăng ký thất bại không ảnh hưởng đến hoạt động chính của ứng dụng */
      });
  });
}
