/** Context giữ trạng thái đăng nhập cán bộ toàn khu vực /quan-tri */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getStoredStaff, login as apiLogin, logout as apiLogout, StaffInfo } from '../services/adminService';

interface AuthCtx {
  staff: StaffInfo | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffInfo | null>(getStoredStaff());

  const login = useCallback(async (u: string, p: string) => {
    const s = await apiLogin(u, p);
    setStaff(s);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStaff(null);
  }, []);

  return <Ctx.Provider value={{ staff, login, logout }}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminAuth phải nằm trong AdminAuthProvider');
  return ctx;
}
