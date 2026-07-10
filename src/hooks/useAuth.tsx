/** Context lưu trạng thái đăng nhập cán bộ toàn app dashboard */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Staff, getStaff, login as apiLogin, logout as apiLogout, restoreSession } from '../services/authService';

interface AuthContextValue {
  staff: Staff | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(getStaff());
  const [loading, setLoading] = useState(true);

  // Khi mở dashboard, thử khôi phục phiên từ cookie
  useEffect(() => {
    restoreSession().then((s) => {
      setStaff(s);
      setLoading(false);
    });
  }, []);

  const login = async (u: string, p: string) => {
    const s = await apiLogin(u, p);
    setStaff(s);
  };
  const logout = async () => {
    await apiLogout();
    setStaff(null);
  };

  return <AuthContext.Provider value={{ staff, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
