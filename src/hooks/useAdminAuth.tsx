/** Context giữ trạng thái đăng nhập cán bộ toàn khu vực /quan-tri */
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  login as apiLogin, logout as apiLogout, restoreSession, coDauPhien, StaffInfo,
} from '../services/adminService';

interface AuthCtx {
  staff: StaffInfo | null;
  /** true khi đang thử khôi phục phiên từ cookie — CHƯA biết đăng nhập hay chưa */
  loading: boolean;
  /* ⚠️ PHẢI có tham số captchaToken.

     adminService.login đã nhận sẵn tham số này và máy chủ đã bắt CAPTCHA sau
     3 lần sai, nhưng hook lại khai chỉ hai tham số nên mã xác minh bị rơi mất
     ngay tại đây. Hệ quả: máy chủ đòi CAPTCHA, giao diện gửi lên chuỗi rỗng,
     cán bộ nhập đúng mật khẩu vẫn bị từ chối mãi mãi. */
  login: (u: string, p: string, captchaToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  /* Khởi tạo null: access token nay nằm trong RAM nên tải lại trang là mất.
     Nguồn sự thật duy nhất về "đã đăng nhập chưa" là cookie refresh httpOnly,
     mà chỉ máy chủ mới trả lời được -> hỏi máy chủ MỘT lần, lúc cần (dưới). */
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  /* Chỉ hỏi máy chủ khi ĐANG Ở KHU CÁN BỘ hoặc trình duyệt có dấu từng có phiên
     cán bộ (ND-047). Trước đây hỏi ngay lúc nạp ở mọi trang: máy người dân nào
     mở trang nào cũng gọi /api/auth/refresh và nhận 401. Phiên có từ trước khi
     có dấu: trang công khai không hỏi, nhưng bước vào /quan-tri là hỏi — không
     bị đá ra trang đăng nhập oan.

     ⚠️ "Đã hỏi" là ref, KHÔNG phải state nằm trong phụ thuộc của effect: đổi
     state đó ngay trong effect làm effect huỷ chính lượt hỏi đang chạy, kết quả
     bị bỏ qua và trang cán bộ treo mãi ở "Đang kiểm tra phiên". Lượt hỏi không
     huỷ giữa chừng — provider sống suốt đời ứng dụng. */
  const daHoi = useRef(false);
  const [dangHoi, setDangHoi] = useState(false);
  const [daXong, setDaXong] = useState(false);
  const { pathname } = useLocation();
  const khuCanBo = /^\/(quan-tri|dang-nhap)(\/|$)/.test(pathname);

  useEffect(() => {
    if (daHoi.current || !(khuCanBo || coDauPhien())) return;
    daHoi.current = true;
    setDangHoi(true);
    restoreSession()
      /* Đăng nhập xong trước khi lượt hỏi này trả về (hỏi lúc chưa có cookie
         nên ra null) thì giữ phiên vừa đăng nhập. */
      .then((s) => setStaff((cu) => cu ?? s))
      .finally(() => { setDangHoi(false); setDaXong(true); });
  }, [khuCanBo]);

  /* CHƯA BIẾT = chưa có cán bộ mà đang hỏi, hoặc đang ở khu cán bộ mà chưa hỏi
     xong (kể cả lượt vẽ đầu, trước khi effect kịp chạy) — để CanTrang chờ chứ
     không đá về /dang-nhap. */
  const loading = !staff && (dangHoi || (!daXong && khuCanBo));

  const login = useCallback(async (u: string, p: string, captchaToken?: string) => {
    const s = await apiLogin(u, p, captchaToken);
    setStaff(s);
    setDaXong(true);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStaff(null);
    setDaXong(true);
  }, []);

  return <Ctx.Provider value={{ staff, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminAuth phải nằm trong AdminAuthProvider');
  return ctx;
}
