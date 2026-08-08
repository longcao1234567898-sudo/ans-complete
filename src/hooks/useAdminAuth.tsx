/** Context giữ trạng thái đăng nhập cán bộ toàn khu vực /quan-tri */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  login as apiLogin, logout as apiLogout, restoreSession, StaffInfo,
} from '../services/adminService';

interface AuthCtx {
  staff: StaffInfo | null;
  /** true khi đang thử khôi phục phiên từ cookie — CHƯA biết đăng nhập hay chưa */
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  /* Khởi tạo null: access token nay nằm trong RAM nên tải lại trang là mất.
     Nguồn sự thật duy nhất về "đã đăng nhập chưa" là cookie refresh httpOnly,
     mà chỉ máy chủ mới trả lời được -> phải hỏi máy chủ một lần khi mount. */
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let huy = false;
    restoreSession()
      .then((s) => { if (!huy) setStaff(s); })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    const s = await apiLogin(u, p);
    setStaff(s);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStaff(null);
  }, []);

  return <Ctx.Provider value={{ staff, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminAuth phải nằm trong AdminAuthProvider');
  return ctx;
}
