/**
 * Nhãn cảnh báo HẠN XỬ LÝ (SLA).
 * Đỏ = QUÁ HẠN · Cam = sắp hết hạn (≤3 ngày) · Xanh = còn hạn.
 */
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

interface Props {
  sla?: 'overdue' | 'near' | 'ok' | 'done' | 'none';
  daysLeft?: number | null;
  compact?: boolean;
}

export default function SlaBadge({ sla, daysLeft, compact = false }: Props) {
  if (!sla || sla === 'none' || sla === 'done') return null;

  const map = {
    overdue: {
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
      Icon: AlertTriangle,
      text: daysLeft != null ? `QUÁ HẠN ${Math.abs(daysLeft)} ngày` : 'QUÁ HẠN',
    },
    near: {
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      Icon: Clock,
      text: `Còn ${daysLeft} ngày`,
    },
    ok: {
      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      Icon: CheckCircle2,
      text: `Còn ${daysLeft} ngày`,
    },
  } as const;

  const m = map[sla];
  if (!m) return null;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>
      <m.Icon className="h-3 w-3" />
      {compact && sla === 'ok' ? `${daysLeft}n` : m.text}
    </span>
  );
}
