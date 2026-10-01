/**
 * DANH MỤC TIN TRÙNG (ADR-003 việc 18, 19)
 *
 * Mỗi nhóm sự kiện là một hàng; mở ra thấy từng tin, có ô đánh dấu để xác
 * nhận hoặc đánh tin giả HÀNG LOẠT, hoặc bấm vào từng tin để xử lý riêng.
 * Gộp chỉ để hiển thị: mỗi tin vẫn giữ mã tra cứu, phòng trao đổi, người phụ
 * trách, ghi chú riêng. Máy chủ xử lý và ghi nhật ký TỪNG tin, kiểm lại phạm vi
 * và trạng thái từng tin — ô đánh dấu ở đây chỉ là tiện dùng.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  fetchTinTrung, fetchIncidentGroupDetail, sangLocHangLoat,
} from '../../services/adminService';
import { STATUS_META, formatDateTime } from './statusMeta';

function NhomMo({ id }: { id: number }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['nhom-su-kien', id],
    queryFn: () => fetchIncidentGroupDetail(id),
  });
  const [chon, setChon] = useState<number[]>([]);
  const [dangGui, setDangGui] = useState(false);

  if (isLoading) return <p className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải...</p>;
  if (error || !data) return <p className="p-3 text-sm text-rose-600">{(error as Error)?.message || 'Không tải được nhóm.'}</p>;

  const chonDuoc = data.members.filter((m) => m.dang_cho_sang_loc).map((m) => m.id);
  const doi = (mId: number) => setChon((c) => (c.includes(mId) ? c.filter((x) => x !== mId) : [...c, mId]));

  async function hangLoat(hanhDong: 'xac_nhan' | 'tin_gia') {
    let ghiChu = '';
    if (hanhDong === 'tin_gia') {
      const ly = window.prompt(`Đánh dấu TIN GIẢ cho ${chon.length} tin — vào thùng rác, KHÔNG khoá máy người gửi.\n\nLý do (bắt buộc, chỉ cán bộ xem):`);
      if (ly === null) return;
      if (ly.trim().length < 5) { toast.error('Phải ghi rõ lý do đánh dấu tin giả.'); return; }
      ghiChu = ly;
    } else if (!window.confirm(`Xác nhận ${chon.length} tin, đưa vào xử lý?`)) {
      return;
    }
    setDangGui(true);
    try {
      const kq = await sangLocHangLoat(chon, hanhDong, ghiChu);
      const loi = kq.ketQua.filter((k) => k.status !== 200);
      if (loi.length === 0) toast.success(kq.message);
      else toast.error(`${kq.message} Không làm được: ${loi.map((k) => `#${k.id} (${k.message})`).join('; ')}`, { duration: 10_000 });
      setChon([]);
      qc.invalidateQueries({ queryKey: ['nhom-su-kien', id] });
      qc.invalidateQueries({ queryKey: ['tin-trung'] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
    } catch (e) {
      toast.error((e as Error).message || 'Không thực hiện được.');
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
      {chonDuoc.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-primary-600"
              checked={chon.length === chonDuoc.length}
              onChange={(e) => setChon(e.target.checked ? chonDuoc : [])} />
            Chọn tất cả tin đang chờ sàng lọc
          </label>
          <button type="button" disabled={dangGui || chon.length === 0} onClick={() => hangLoat('xac_nhan')}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white disabled:opacity-40">
            Xác nhận ({chon.length})
          </button>
          <button type="button" disabled={dangGui || chon.length === 0} onClick={() => hangLoat('tin_gia')}
            className="rounded-lg bg-slate-600 px-2.5 py-1 font-bold text-white disabled:opacity-40">
            Tin giả ({chon.length})
          </button>
        </div>
      )}
      <ul className="space-y-1.5">
        {data.members.map((m) => (
          <li key={m.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm dark:bg-slate-900">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary-600"
              disabled={!m.dang_cho_sang_loc} checked={chon.includes(m.id)} onChange={() => doi(m.id)}
              aria-label={`Chọn tin ${m.tracking_code}`} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <Link to={`/quan-tri/y-kien/${m.id}`} className="font-mono font-bold text-primary-600 hover:underline dark:text-primary-300">
                  {m.tracking_code}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[m.status]?.badge || ''}`}>
                  {STATUS_META[m.status]?.label || m.status}
                </span>
                {m.urgency === 'urgent' && <span className="text-[10px] font-bold text-red-600">🔴 KHẨN</span>}
                <span className="text-[11px] text-slate-400">
                  {m.is_anonymous ? 'Ẩn danh · ' : ''}{formatDateTime(m.created_at)}
                  {m.assigned_name ? ` · phụ trách: ${m.assigned_name}` : ''}
                </span>
              </p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">{m.preview}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KhuTinTrung({ phan }: { phan: 'sang_loc' | 'xu_ly' | 'to_giac' }) {
  const [mo, setMo] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['tin-trung', phan],
    queryFn: () => fetchTinTrung(phan),
  });

  if (isLoading) return <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải...</div>;
  if (error) return <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
        Không có nhóm tin trùng nào trong phần này.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
      {data.map((g, i) => (
        <div key={g.id} className={i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}>
          <button type="button" onClick={() => setMo(mo === g.id ? null : g.id)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {mo === g.id ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {g.so_tin} tin cùng vụ
                {g.gan_nhu_giong && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    title="Có hai tin giống nhau gần từng chữ — có thể một người gửi lặp lại, không phải nhiều người cùng báo">
                    Nội dung gần như giống hệt
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">{g.xem_truoc}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {g.category_name || ''}{g.ward_name ? ` · ${g.ward_name}` : ''} · {formatDateTime(g.dau)} → {formatDateTime(g.cuoi)}
              </p>
            </div>
          </button>
          {mo === g.id && <NhomMo id={g.id} />}
        </div>
      ))}
    </div>
  );
}
