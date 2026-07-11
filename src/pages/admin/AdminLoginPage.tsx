/** Trang đăng nhập khu vực cán bộ */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, User, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function AdminLoginPage() {
  const { login, staff } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate('/quan-tri');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
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
