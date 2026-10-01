/**
 * NHẬT KÝ HỆ THỐNG — ai làm gì, lúc nào, từ IP nào (ADR-003 việc 9).
 * Quan trọng nhất: theo dõi lượt XEM DANH TÍNH, mở tin mật, xuất dữ liệu.
 * Chỉ lãnh đạo xem được. Mỗi lần mở và mỗi lần xuất nhật ký cũng được ghi lại
 * (máy chủ ghi trước khi trả dữ liệu) — lãnh đạo kiểm lẫn nhau qua chính trang này.
 *
 * Nhãn và nhóm hành động lấy từ máy chủ (lib/danh-muc-nhat-ky.js), không chép
 * lại ở đây: thêm hành động mới chỉ phải khai một chỗ.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Loader2, ShieldAlert, ScrollText, ChevronLeft, ChevronRight, Download, BarChart3, List,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  fetchLogs, fetchDanhMucNhatKy, fetchThongKeNhatKy, fetchStaffList, xuatNhatKy,
  type BoLocNhatKy, type NhomNhatKy,
} from '../../services/adminService';
import { tenVaiTro } from '../../utils/vaiTro';
import { donDong } from '../../utils/excelAnToan';

/* Màu theo nhóm — nhóm nhạy cảm tô đỏ để lướt qua là thấy */
const MAU_NHOM: Record<string, string> = {
  nhay_cam: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  dang_nhap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  xem_ho_so: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  xu_ly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  thung_rac: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  chan_spam: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  noi_dung: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};
const MAU_KHAC = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

const homNay = () => new Date().toISOString().slice(0, 10);
const truocDo = (ngay: number) => new Date(Date.now() - ngay * 86_400_000).toISOString().slice(0, 10);

function fmt(dt: string) {
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Chi tiết dạng JSON -> một dòng chữ đọc được trong bảng và tệp Excel */
function moTaChiTiet(details: unknown): string {
  if (details == null || details === '') return '';
  let d = details;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return d as string; }
  }
  if (typeof d !== 'object') return String(d);
  return Object.entries(d as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

const oNhap = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export default function AdminLogsPage() {
  const [tab, setTab] = useState<'danh_sach' | 'thong_ke'>('danh_sach');
  const [boLoc, setBoLoc] = useState<BoLocNhatKy>({ tu: truocDo(29), den: homNay() });
  const [page, setPage] = useState(1);
  const [dangXuat, setDangXuat] = useState(false);

  const doiLoc = (moi: Partial<BoLocNhatKy>) => { setBoLoc((b) => ({ ...b, ...moi })); setPage(1); };

  const { data: danhMuc } = useQuery({ queryKey: ['log-danh-muc'], queryFn: fetchDanhMucNhatKy, staleTime: Infinity });
  const { data: canBo } = useQuery({ queryKey: ['staff-list'], queryFn: fetchStaffList, staleTime: 60_000 });

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-logs', boLoc, page],
    queryFn: () => fetchLogs({ ...boLoc, page, limit: 30 }),
    enabled: tab === 'danh_sach',
  });
  const thongKe = useQuery({
    queryKey: ['admin-logs-thong-ke', boLoc.tu, boLoc.den],
    queryFn: () => fetchThongKeNhatKy({ tu: boLoc.tu, den: boLoc.den }),
    enabled: tab === 'thong_ke',
  });

  const nhomDangChon: NhomNhatKy | undefined = danhMuc?.find((n) => n.ma === boLoc.nhom);
  const tenNhom = useMemo(
    () => Object.fromEntries((danhMuc || []).map((n) => [n.ma, n.ten])) as Record<string, string>,
    [danhMuc],
  );

  /**
   * XUẤT EXCEL — theo đúng bộ lọc đang chọn. Máy chủ ghi dòng "Xuất nhật ký ra
   * Excel" kèm bộ lọc và số dòng TRƯỚC khi trả dữ liệu.
   */
  async function xuatExcel() {
    setDangXuat(true);
    try {
      const kq = await xuatNhatKy(boLoc);
      const wb = XLSX.utils.book_new();
      const bia = XLSX.utils.aoa_to_sheet([
        ['NHẬT KÝ HOẠT ĐỘNG CÁN BỘ'],
        ['Từ ngày:', kq.tu], ['Đến ngày:', kq.den],
        ['Nhóm:', boLoc.nhom ? tenNhom[boLoc.nhom] || boLoc.nhom : 'Tất cả'],
        ['Ngày xuất:', new Date().toLocaleString('vi-VN')],
        ['Số dòng:', kq.data.length],
        ...(kq.catBot ? [[`Chỉ xuất ${kq.toiDa} dòng mới nhất — thu hẹp khoảng ngày để xuất đủ.`]] : []),
        [],
        ['LƯU Ý: Tài liệu nội bộ. Lượt xuất này đã được ghi vào nhật ký hệ thống.'],
      ]);
      bia['!cols'] = [{ wch: 14 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, bia, 'Bìa');
      const dong = kq.data.map((l) => donDong({
        'Thời gian': fmt(l.created_at),
        'Cán bộ': l.staff_name || 'Không rõ',
        'Vai trò': l.staff_role ? tenVaiTro(l.staff_role) : '',
        'Nhóm': l.ten_nhom,
        'Hoạt động': l.ten_hanh_dong,
        'Hồ sơ': l.tracking_code || '',
        'Chi tiết': moTaChiTiet(l.details),
        'Địa chỉ IP': l.ip_address || '',
      }));
      const ws = XLSX.utils.json_to_sheet(dong);
      ws['!cols'] = [20, 24, 10, 26, 40, 12, 50, 18].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký');
      XLSX.writeFile(wb, `nhat-ky_${kq.tu}_${kq.den}.xlsx`);
      toast.success(`Đã xuất ${kq.data.length} dòng nhật ký.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xuất được nhật ký.');
    } finally {
      setDangXuat(false);
    }
  }

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ScrollText className="h-5 w-5 text-primary-600" /> Nhật ký hệ thống
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Mọi thao tác của cán bộ đều được ghi lại: ai làm, lúc nào, từ địa chỉ IP nào.
        Mỗi lần mở và mỗi lần xuất nhật ký cũng được ghi. Nhật ký chỉ ghi thêm, không ai sửa hay xoá được.
      </p>

      {/* Cảnh báo số lượt xem danh tính */}
      {data && data.revealCount30d > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/10">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {data.revealCount30d} lượt xem danh tính người gửi trong 30 ngày qua
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-600/80 dark:text-rose-300/80">
              Danh tính người tố giác là thông tin nhạy cảm. Hãy rà soát xem các lượt xem này
              có đúng mục đích công vụ hay không.
            </p>
          </div>
        </div>
      )}

      {/* Tab */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([['danh_sach', 'Danh sách', List], ['thong_ke', 'Thống kê theo ngày', BarChart3]] as const).map(([ma, ten, Icon]) => (
          <button
            key={ma}
            onClick={() => setTab(ma)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === ma ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Icon className="h-4 w-4" /> {ten}
          </button>
        ))}
        <button
          onClick={xuatExcel}
          disabled={dangXuat}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {dangXuat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Xuất Excel
        </button>
      </div>

      {/* Bộ lọc */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-soft dark:bg-slate-900">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Từ ngày
          <input type="date" className={oNhap} value={boLoc.tu || ''} max={boLoc.den || undefined}
            onChange={(e) => doiLoc({ tu: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Đến ngày
          <input type="date" className={oNhap} value={boLoc.den || ''} min={boLoc.tu || undefined}
            onChange={(e) => doiLoc({ den: e.target.value || undefined })} />
        </label>
        {tab === 'danh_sach' && (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Nhóm
              <select className={oNhap} value={boLoc.nhom || ''}
                onChange={(e) => doiLoc({ nhom: e.target.value || undefined, action: undefined })}>
                <option value="">Tất cả</option>
                {danhMuc?.map((n) => <option key={n.ma} value={n.ma}>{n.ten}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Hoạt động
              <select className={oNhap} value={boLoc.action || ''}
                onChange={(e) => doiLoc({ action: e.target.value || undefined })}>
                <option value="">Tất cả</option>
                {(nhomDangChon ? [nhomDangChon] : danhMuc || []).flatMap((n) => n.hanhDong)
                  .map((h) => <option key={h.ma} value={h.ma}>{h.ten}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Cán bộ
              <select className={oNhap} value={boLoc.staffId ?? ''}
                onChange={(e) => doiLoc({ staffId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Tất cả</option>
                {canBo?.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({tenVaiTro(c.role)})</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {tab === 'danh_sach' && (
        <>
          {isLoading && (
            <div className="flex items-center gap-2 py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải nhật ký...
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>
          )}

          {data && data.data.length === 0 && (
            <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
              Không có hoạt động nào khớp bộ lọc.
            </div>
          )}

          {data && data.data.length > 0 && (
            <>
              <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
                {data.data.map((log, i) => {
                  const chiTiet = moTaChiTiet(log.details);
                  return (
                    <div
                      key={log.id}
                      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                        i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
                      } ${log.nhay_cam ? 'bg-rose-50/40 dark:bg-rose-900/5' : ''}`}
                    >
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${MAU_NHOM[log.nhom] || MAU_KHAC}`}>
                        {log.ten_hanh_dong}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {log.staff_name || 'Không rõ'}
                          {log.staff_role && (
                            <span className="ml-1 text-xs font-normal text-slate-400">({tenVaiTro(log.staff_role)})</span>
                          )}
                          {log.tracking_code && (
                            <>
                              {' · '}
                              <Link to={`/quan-tri/y-kien/${log.target_id}`}
                                className="font-mono text-primary-600 hover:underline dark:text-primary-300">
                                {log.tracking_code}
                              </Link>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {fmt(log.created_at)}
                          {log.ip_address ? ` · IP ${log.ip_address}` : ''}
                          {chiTiet ? ` · ${chiTiet}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phân trang */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Trang {data.page}/{Math.max(1, data.totalPages)} · Tổng {data.total} hoạt động
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                    className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300">
                    <ChevronLeft className="h-4 w-4" /> Trước
                  </button>
                  <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}
                    className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300">
                    Sau <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'thong_ke' && (
        <>
          {thongKe.isLoading && (
            <div className="flex items-center gap-2 py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải thống kê...
            </div>
          )}
          {thongKe.error && (
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(thongKe.error as Error).message}</div>
          )}
          {thongKe.data && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="overflow-x-auto rounded-2xl bg-white shadow-soft dark:bg-slate-900 lg:col-span-2">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2">Ngày</th>
                      <th className="px-3 py-2 text-right">Tổng</th>
                      <th className="px-3 py-2 text-right text-rose-600">Nhạy cảm</th>
                      {danhMuc?.filter((n) => !n.nhayCam).map((n) => (
                        <th key={n.ma} className="px-3 py-2 text-right">{n.ten}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...thongKe.data.theoNgay].reverse().map((d) => (
                      <tr key={d.ngay} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-1.5 font-mono text-xs">{new Date(`${d.ngay}T00:00:00`).toLocaleDateString('vi-VN')}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{d.tong}</td>
                        <td className={`px-3 py-1.5 text-right ${d.nhayCam ? 'font-bold text-rose-600' : 'text-slate-300'}`}>{d.nhayCam}</td>
                        {danhMuc?.filter((n) => !n.nhayCam).map((n) => (
                          <td key={n.ma} className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">{d.theoNhom[n.ma] || 0}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Theo cán bộ</p>
                <ul className="space-y-1.5 text-sm">
                  {thongKe.data.theoCanBo.map((c) => (
                    <li key={c.staffId ?? 0} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600 dark:text-slate-300">
                        {c.ten}{c.vaiTro ? ` (${tenVaiTro(c.vaiTro)})` : ''}
                      </span>
                      <span className="shrink-0 text-xs">
                        <b>{c.tong}</b>
                        {c.nhayCam > 0 && <span className="ml-1 font-bold text-rose-600">· {c.nhayCam} nhạy cảm</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
