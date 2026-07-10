/**
 * Menu trượt cho mobile (drawer bên phải).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { NAV_LINKS, UNIT } from '../../utils/constants';
import { cn } from '../../utils/helpers';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Nền mờ */}
          <div className="absolute inset-0 bg-slate-900/55" onClick={onClose} />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-white p-5 shadow-xl dark:bg-slate-900"
            aria-label="Menu di động"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-secondary-500 text-white">
                  <Shield className="h-4 w-4" />
                </span>
                <div className="text-sm font-bold text-primary-700 dark:text-primary-300">{UNIT.name}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1.5" aria-label="Điều hướng di động">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'rounded-xl px-4 py-3 text-sm font-medium transition',
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-600 hover:bg-primary-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-8 rounded-xl bg-primary-50 p-4 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <p className="font-semibold text-primary-700 dark:text-primary-300">Khẩn cấp gọi {UNIT.emergency}</p>
              <p className="mt-1">Hotline: {UNIT.hotline}</p>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
