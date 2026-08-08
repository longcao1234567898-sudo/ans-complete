/**
 * Dịch vụ xác thực cán bộ: đăng nhập, đăng xuất, tự làm mới token,
 * và gọi API admin có đính kèm token. Token lưu trong bộ nhớ (biến),
 * refresh token nằm trong httpOnly cookie do server quản lý.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');

export interface Staff {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'manager' | 'handler';
}

// Access token giữ trong RAM (mất khi F5, sẽ tự refresh lại từ cookie)
let accessToken: string | null = null;
let currentStaff: Staff | null = null;

export const getStaff = () => currentStaff;
export const isLoggedIn = () => Boolean(accessToken);

/** Đăng nhập bằng username + password */
export async function login(username: string, password: string): Promise<Staff> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // để nhận cookie refresh token
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Đăng nhập thất bại.');
  accessToken = data.accessToken;
  currentStaff = data.staff;
  return data.staff;
}

/** Thử khôi phục phiên đăng nhập từ cookie refresh token (gọi khi mở dashboard) */
export async function restoreSession(): Promise<Staff | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    accessToken = data.accessToken;
    currentStaff = data.staff;
    return data.staff;
  } catch {
    return null;
  }
}

/** Đăng xuất: thu hồi token phía server + xoá phiên local */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* bỏ qua */ }
  accessToken = null;
  currentStaff = null;
}

/** Gọi API admin có đính kèm token. Tự refresh 1 lần nếu token hết hạn. */
export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
      credentials: 'include',
    });

  let res = await doFetch();

  // Token hết hạn -> thử refresh 1 lần rồi gọi lại
  if (res.status === 401 && currentStaff) {
    const restored = await restoreSession();
    if (restored) res = await doFetch();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Lỗi máy chủ (${res.status})`);
  return data as T;
}
