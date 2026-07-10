/**
 * Header cố định: logo, menu điều hướng, nút dark mode, menu mobile.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, Moon, Shield, Sun } from 'lucide-react';
import Sidebar from './Sidebar';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { NAV_LINKS, STORAGE_KEYS, UNIT } from '../../utils/constants';
import { cn } from '../../utils/helpers';

export default function Header() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>(STORAGE_KEYS.theme, 'light');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Đồng bộ class `dark` trên thẻ <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <>
      <header className="glass sticky top-0 z-40 shadow-sm">
        <div className="container-page flex h-16 items-center justify-between gap-3">
          {/* Logo + tên hệ thống */}
          <Link to="/" className="flex items-center gap-2.5" aria-label="Về trang chủ">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-secondary-500 text-white shadow-soft">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-wide text-primary-700 dark:text-primary-300">
                HỘP THƯ AN NINH SỐ
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">{UNIT.name}</span>
            </span>
          </Link>

          {/* Menu desktop */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3.5 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary-600 text-white shadow-soft'
                      : 'text-slate-600 hover:bg-primary-50 hover:text-primary-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            {/* Nút chuyển dark mode */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
              className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {/* Nút mở menu mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở menu"
              className="rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
