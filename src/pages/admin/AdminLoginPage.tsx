/** Trang đăng nhập khu vực cán bộ */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, User, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import Turnstile, { captchaEnabled } from '../../components/common/Turnstile';
import { LoginError } from '../../services/adminService';

export default function AdminLoginPage() {
  const { login, staff, loading: dangKhoiPhucPhien } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /* ==========================================================================
     Ô XÁC MINH CHỈ HIỆN KHI MÁY CHỦ YÊU CẦU

     ⚠️ ĐÂY LÀ LỖI KHOÁ CỬA CÁN BỘ: máy chủ bắt CAPTCHA sau 3 lần sai mật khẩu
     và trả về cờ canCaptcha để giao diện dựng ô xác minh. Nhưng trang này
     TRƯỚC ĐÂY KHÔNG HỀ VẼ Ô CAPTCHA NÀO. Cán bộ gõ sai ba lần là mắc kẹt hẳn:
     màn hình bảo "vui lòng tích vào ô xác minh" mà chẳng có ô nào để tích,
     nhập đúng mật khẩu cũng vô ích, phải đợi hết giờ đếm lùi mới vào lại được.

     Nay cờ canCaptcha bật lên thì ô hiện ngay dưới ô mật khẩu.

     `khoaOXacMinh` dùng để DỰNG LẠI ô sau mỗi lần đăng nhập hỏng: mã Turnstile
     chỉ dùng được MỘT lần, gửi lại mã cũ thì Cloudflare từ chối. Đổi key là
     React gỡ ô cũ dựng ô mới, người dùng tích lại lấy mã mới.
     ========================================================================== */
  const [canCaptcha, setCanCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [khoaOXacMinh, setKhoaOXacMinh] = useState(0);

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    /* Chặn ngay tại giao diện cho rõ ràng, khỏi phải đi một vòng lên máy chủ
       rồi quay về với đúng câu nhắc mà người dùng đang nhìn thấy sẵn. */
    if (canCaptcha && captchaEnabled && !captchaToken) {
      setError('Bà con vui lòng tích vào ô xác minh "Tôi không phải là người máy" bên dưới.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password, captchaToken || undefined);
      navigate('/quan-tri');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đăng nhập thất bại.');
      if (e instanceof LoginError && e.canCaptcha) setCanCaptcha(true);
      /* Mã xác minh đã tiêu — dựng ô mới cho lần thử sau */
      setCaptchaToken('');
      setKhoaOXacMinh((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  /* Chờ khôi phục phiên xong rồi mới quyết định — nếu không, cán bộ đang có
     phiên hợp lệ sẽ thấy form đăng nhập loé lên một nhịp trước khi bị chuyển đi. */
  if (dangKhoiPhucPhien) {
    return (
      <div className="container-page flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  // Đã đăng nhập -> vào thẳng khu quản trị
  if (staff) return <Navigate to="/quan-tri" replace />;

  return (
    <div className="container-page flex items-center justify-center py-12 sm:py-20">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft dark:bg-slate-900">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white">
            <ShieldCheck className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Khu vực cán bộ</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Hộp Thư An Ninh Số — Công an thị xã Tân Châu
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Tên đăng nhập</label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:border-primary-500 dark:border-slate-700">
          <User className="h-4 w-4 text-slate-400" />
          <input
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="admin"
            autoComplete="username"
          />
        </div>

        <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Mật khẩu</label>
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:border-primary-500 dark:border-slate-700">
          <Lock className="h-4 w-4 text-slate-400" />
          <input
            type="password"
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        {canCaptcha && (
          <div className="mb-6">
            {captchaEnabled ? (
              <Turnstile key={khoaOXacMinh} onToken={setCaptchaToken} />
            ) : (
              /* Máy chủ đòi CAPTCHA mà trình duyệt chưa có site key thì không
                 ai đăng nhập được nữa. Nói thẳng nguyên nhân cho quản trị viên
                 thay vì để màn hình bảo tích một ô không tồn tại. */
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/25 dark:text-amber-200">
                <p className="font-semibold">Chưa cấu hình ô xác minh</p>
                <p className="mt-1">
                  Máy chủ đang yêu cầu xác minh chống người máy, nhưng trang web chưa khai
                  biến <span className="font-mono">VITE_TURNSTILE_SITE_KEY</span>. Cần khai
                  biến này trên Netlify rồi dựng lại, hoặc chờ hết thời gian đếm lùi.
                </p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 py-3 font-bold text-white shadow-soft transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang đăng nhập...</> : 'Đăng nhập'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Chỉ dành cho cán bộ được cấp tài khoản. Mọi thao tác đều được ghi nhật ký.
        </p>
      </div>
    </div>
  );
}
