/**
 * CAPTCHA CHỐNG BOT — Cloudflare Turnstile
 *
 * Chưa cấu hình khoá thì component TỰ ẨN, hệ thống vẫn chạy bình thường.
 *
 * BA LỖI ĐÃ SỬA (đều gây thông báo "Cannot find Widget cf-chl-widget-xxx"):
 *   1. Không lưu mã widget -> không dọn được khi component bị gỡ
 *   2. Không gọi turnstile.remove() -> widget cũ mồ côi trong bộ nhớ Cloudflare
 *   3. Phụ thuộc onToken trong useEffect -> cha vẽ lại là tạo widget mới chồng lên
 */
import { useEffect, useRef } from 'react';

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAD623qfN7yPk5Bys').trim();
export const captchaEnabled = Boolean(SITE_KEY);

declare global {
  interface Window { turnstile?: any }
}

interface Props {
  onToken: (token: string) => void;
}

export default function Turnstile({ onToken }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  /* Mã widget do Cloudflare cấp — CẦN để gỡ đúng widget này lúc dọn dẹp */
  const widgetIdRef = useRef<string | null>(null);

  /* Giữ hàm gọi lại trong ref thay vì đưa vào danh sách phụ thuộc.
     Nếu component cha truyền hàm mới mỗi lần vẽ lại (rất hay gặp), mà ta để
     onToken trong danh sách phụ thuộc thì useEffect chạy lại -> tạo widget mới
     chồng lên widget cũ -> Cloudflare báo không tìm thấy widget. */
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!captchaEnabled) return;

    let huy = false;      // đánh dấu component đã bị gỡ
    let timer: number | undefined;

    function veWidget() {
      // Đã gỡ, hoặc chưa có chỗ vẽ, hoặc đã vẽ rồi -> bỏ qua
      if (huy || !boxRef.current || widgetIdRef.current || !window.turnstile) return;

      try {
        widgetIdRef.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          language: 'vi',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
        });
      } catch (e) {
        console.warn('Không vẽ được ô xác minh:', e);
      }
    }

    // Thư viện đã sẵn sàng -> vẽ luôn
    if (window.turnstile) {
      veWidget();
    } else {
      // Chưa có -> nạp thư viện (chỉ nạp MỘT lần cho cả trang)
      const id = 'cf-turnstile-script';
      if (!document.getElementById(id)) {
        const sc = document.createElement('script');
        sc.id = id;
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        sc.async = true;
        sc.defer = true;
        sc.onload = veWidget;
        document.head.appendChild(sc);
      } else {
        // Thư viện đang nạp dở -> chờ
        timer = window.setInterval(() => {
          if (window.turnstile) {
            window.clearInterval(timer);
            veWidget();
          }
        }, 200);
      }
    }

    /* DỌN DẸP — phần quan trọng nhất.
       Gỡ widget khỏi bộ nhớ Cloudflare khi component biến mất
       (ví dụ người dân bấm quay lại bước trước). */
    return () => {
      huy = true;
      if (timer) window.clearInterval(timer);

      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* Widget có thể đã tự biến mất -> bỏ qua, không làm sập giao diện */
        }
      }
      widgetIdRef.current = null;
    };
    // Danh sách phụ thuộc RỖNG: chỉ chạy một lần khi hiện lên, dọn khi biến mất
  }, []);

  if (!captchaEnabled) return null;

  return (
    <div className="mt-4">
      <div ref={boxRef} />
      <p className="mt-1.5 text-[11px] text-slate-500">
        Bước xác minh này giúp ngăn máy tự động gửi tin rác.
      </p>
    </div>
  );
}
