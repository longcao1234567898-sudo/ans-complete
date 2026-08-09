/**
 * CAPTCHA chống bot — Cloudflare Turnstile.
 *
 * Nếu CHƯA cấu hình VITE_TURNSTILE_SITE_KEY thì component tự ẩn, hệ thống vẫn
 * chạy bình thường (không chặn ai).
 *
 * ⚠️ HAI KHOÁ ĐI THÀNH CẶP:
 *     Site key   -> ở đây (trình duyệt)        — công khai
 *     Secret key -> TURNSTILE_SECRET_KEY trên Render — bí mật
 *   Phải cùng MỘT tài khoản Cloudflare. Lệch nhau thì người dân tick thấy xanh
 *   nhưng máy chủ luôn báo sai, không ai gửi được ý kiến.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
export const captchaEnabled = Boolean(SITE_KEY);

declare global {
  interface Window { turnstile?: any }
}

/* --------------------------------------------------------------------------
   GIẢI NGHĨA MÃ LỖI CỦA CLOUDFLARE

   Trước đây error-callback chỉ gọi onToken('') — nuốt lỗi hoàn toàn. Ô CAPTCHA
   trắng trơn, người dân không biết vì sao không gửi được, cán bộ cũng không
   biết đường nào mà lần.

   Nay hiện đúng nguyên nhân. Nguyên nhân hay gặp nhất là mã 110200: TÊN MIỀN
   CHƯA ĐƯỢC KHAI BÁO — xảy ra ngay sau khi đổi tên site Netlify.
   -------------------------------------------------------------------------- */
function giaiNghiaLoi(ma: string): string {
  const m = String(ma || '');
  if (m.startsWith('110200')) {
    return 'Tên miền của trang web chưa được khai báo trong Cloudflare Turnstile.';
  }
  if (m.startsWith('1102') || m.startsWith('1100')) {
    return 'Khoá xác minh (site key) không hợp lệ hoặc không thuộc tài khoản Cloudflare này.';
  }
  if (m.startsWith('300') || m.startsWith('600')) {
    return 'Không kết nối được tới Cloudflare. Có thể do mạng chập chờn.';
  }
  if (m.startsWith('106')) {
    return 'Phiên xác minh đã quá hạn.';
  }
  return `Cloudflare báo lỗi (mã ${m || 'không rõ'}).`;
}

interface Props {
  onToken: (token: string) => void;
}

export default function Turnstile({ onToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  /* ------------------------------------------------------------------------
     GIỮ onToken TRONG REF — CHỐNG VÒNG LẶP DỰNG LẠI

     Component cha truyền onToken bằng hàm mũi tên viết thẳng trong JSX:
         <Turnstile onToken={(t) => onChange({ ...value, captchaToken: t })} />

     Mỗi lần cha vẽ lại là một HÀM MỚI. Nếu useCallback phụ thuộc onToken thì:
         cha vẽ lại -> onToken mới -> dungLen mới -> useEffect chạy lại
         -> dựng lại ô CAPTCHA -> gọi onToken -> cha vẽ lại -> ...

     Vòng lặp vô tận. Biểu hiện đúng như đã gặp: ô xác minh xoay rồi ẩn hiện
     liên tục, Console báo "Cannot find Widget ... consider using
     turnstile.remove()" vì ô cũ bị bỏ giữa chừng.

     Cất vào ref thì hàm luôn mới nhất mà KHÔNG làm đổi phụ thuộc.
     ------------------------------------------------------------------------ */
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  const [loi, setLoi] = useState<string>('');
  const [dangTai, setDangTai] = useState(true);

  const dungLen = useCallback(() => {
    if (!ref.current || !window.turnstile) return;

    /* Dọn ô cũ trước khi dựng lại — nếu không, bấm "Thử lại" sẽ chồng hai ô */
    if (widgetId.current !== null) {
      try { window.turnstile.remove(widgetId.current); } catch { /* bỏ qua */ }
      widgetId.current = null;
    }

    setLoi('');
    setDangTai(true);
    try {
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        language: 'vi',
        callback: (token: string) => { setDangTai(false); setLoi(''); onTokenRef.current(token); },
        'expired-callback': () => {
          onTokenRef.current('');
          setLoi('Phiên xác minh đã hết hạn. Bà con bấm "Thử lại" giúp.');
        },
        'error-callback': (ma: string) => {
          onTokenRef.current('');
          setDangTai(false);
          setLoi(giaiNghiaLoi(ma));
          /* Ghi ra Console để quản trị viên xem được mã lỗi gốc */
          console.error('[Turnstile] mã lỗi:', ma, '· tên miền:', window.location.hostname);
        },
      });
      setDangTai(false);
    } catch (e) {
      setDangTai(false);
      setLoi('Không dựng được ô xác minh.');
      console.error('[Turnstile]', e);
    }
  }, []);   // <- KHÔNG phụ thuộc gì: hàm ổn định, effect chỉ chạy một lần

  useEffect(() => {
    if (!captchaEnabled) return;

    if (window.turnstile) { dungLen(); return; }

    const id = 'cf-turnstile-script';
    let huy: number | undefined;

    if (!document.getElementById(id)) {
      const sc = document.createElement('script');
      sc.id = id;
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.defer = true;
      sc.onload = dungLen;
      /* Tải kịch bản thất bại thường do CSP chặn hoặc mạng bị chặn Cloudflare */
      sc.onerror = () => {
        setDangTai(false);
        setLoi('Không tải được ô xác minh từ Cloudflare. Kiểm tra kết nối mạng.');
      };
      document.head.appendChild(sc);
    } else {
      const t = window.setInterval(() => {
        if (window.turnstile) { window.clearInterval(t); dungLen(); }
      }, 200);
      huy = t;
      /* Chờ tối đa 15 giây rồi báo, không để người dùng đợi vô tận */
      window.setTimeout(() => {
        window.clearInterval(t);
        if (!window.turnstile) {
          setDangTai(false);
          setLoi('Ô xác minh tải quá lâu. Bà con thử tải lại trang.');
        }
      }, 15000);
    }

    return () => {
      if (huy) window.clearInterval(huy);
      /* DỌN Ô KHI RỜI TRANG.
         Thiếu bước này, Cloudflare vẫn giữ tham chiếu tới ô đã bị React gỡ
         khỏi màn hình, rồi báo "Cannot find Widget ... consider using
         turnstile.remove()". Lỗi này tự nó vô hại nhưng làm rối Console và
         che mất lỗi thật. */
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* bỏ qua */ }
        widgetId.current = null;
      }
    };
  }, [dungLen]);

  if (!captchaEnabled) return null;

  return (
    <div className="mt-4">
      <div ref={ref} />

      {dangTai && !loi && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Đang tải ô xác minh…
        </p>
      )}

      {loi && (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/25">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Không hiện được ô xác minh
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{loi}</p>
          <button
            type="button"
            onClick={dungLen}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            Thử lại
          </button>
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
            Nếu vẫn không được, bà con vui lòng gọi trực tiếp số trực ban.
          </p>
        </div>
      )}

      {!loi && !dangTai && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Bước xác minh này giúp ngăn máy tự động gửi tin rác.
        </p>
      )}
    </div>
  );
}
