/**
 * CAPTCHA chống bot — Cloudflare Turnstile.
 * Nếu CHƯA cấu hình VITE_TURNSTILE_SITE_KEY thì component tự ẩn,
 * hệ thống vẫn chạy bình thường (không chặn ai).
 */
import { useEffect, useRef } from 'react';

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAD6i_-Eq5RMylwf9').trim();
export const captchaEnabled = Boolean(SITE_KEY);

declare global {
  interface Window { turnstile?: any }
}

interface Props {
  onToken: (token: string) => void;
}

export default function Turnstile({ onToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!captchaEnabled || rendered.current) return;

    function render() {
      if (!ref.current || rendered.current || !window.turnstile) return;
      rendered.current = true;
      window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        language: 'vi',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }

    if (window.turnstile) { render(); return; }

    const id = 'cf-turnstile-script';
    if (!document.getElementById(id)) {
      const sc = document.createElement('script');
      sc.id = id;
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.defer = true;
      sc.onload = render;
      document.head.appendChild(sc);
    } else {
      const t = setInterval(() => {
        if (window.turnstile) { clearInterval(t); render(); }
      }, 200);
      return () => clearInterval(t);
    }
  }, [onToken]);

  if (!captchaEnabled) return null;

  return (
    <div className="mt-4">
      <div ref={ref} />
      <p className="mt-1.5 text-[11px] text-slate-400">
        Bước xác minh này giúp ngăn máy tự động gửi tin rác.
      </p>
    </div>
  );
}
