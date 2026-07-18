/**
 * Trang BÁO CÁO THỐNG KÊ — biểu đồ + xuất Excel.
 * Cán bộ chọn khoảng thời gian, xem số liệu, bấm 1 nút là ra file Excel nộp lãnh đạo.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { UNIT } from '../../utils/constants';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Loader2, CalendarDays, AlertTriangle } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchReport, fetchReportDetails} from '../../services/adminService';

const COLORS = ['#1B5E20', '#F9A825', '#1976D2', '#C62828'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [range, setRange] = useState({ from: monthAgoStr(), to: todayStr() });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-report', range.from, range.to],
    queryFn: () => fetchReport(range.from, range.to),
    staleTime: 0,              // luôn coi dữ liệu là cũ -> gọi lại mỗi lần đổi ngày
    refetchOnMount: 'always',
  });

  const [exporting, setExporting] = useState(false);

  /**
   * XUẤT EXCEL TỔNG HỢP — 7 sheet, định dạng sẵn để nộp lãnh đạo.
   * Sheet 7 (danh sách chi tiết) lấy thêm dữ liệu từ máy chủ, danh tính CHE SẴN.
   */
  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const o = data.overview;
      const pct = (n: number) => (o.total > 0 ? `${((n / o.total) * 100).toFixed(1)}%` : '0%');

      /** Đặt độ rộng cột cho dễ đọc, khỏi phải kéo tay */
      const withWidth = (ws: XLSX.WorkSheet, widths: number[]) => {
        ws['!cols'] = widths.map((w) => ({ wch: w }));
        return ws;
      };

      // ───── Sheet 1: BÌA BÁO CÁO ─────
      const cover = XLSX.utils.aoa_to_sheet([
        ['BÁO CÁO TỔNG HỢP Ý KIẾN CÔNG DÂN'],
        ['Hệ thống Hộp Thư An Ninh Số'],
        [UNIT.name],
        [],
        ['Kỳ báo cáo:', `Từ ${new Date(range.from).toLocaleDateString('vi-VN')} đến ${new Date(range.to).toLocaleDateString('vi-VN')}`],
        ['Ngày xuất:', new Date().toLocaleString('vi-VN')],
        ['Người xuất:', 'Cán bộ quản trị hệ thống'],
        [],
        ['LƯU Ý BẢO MẬT'],
        ['- Danh tính công dân trong báo cáo này đã được che một phần theo quy định.'],
        ['- Báo cáo phục vụ công tác quản lý nội bộ, không phổ biến ra ngoài.'],
        ['- Ý kiến tố giác ẩn danh không hiển thị thông tin người gửi.'],
      ]);
      XLSX.utils.book_append_sheet(wb, withWidth(cover, [22, 60]), 'Bìa báo cáo');

      // ───── Sheet 2: TỔNG QUAN (kèm tỷ lệ %) ─────
      const resolveRate = o.total > 0 ? ((o.resolved / o.total) * 100).toFixed(1) + '%' : '0%';
      XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet([
        { 'Chỉ tiêu': 'Tổng số ý kiến tiếp nhận', 'Số lượng': o.total, 'Tỷ lệ': '100%' },
        { 'Chỉ tiêu': 'Chờ tiếp nhận', 'Số lượng': o.received, 'Tỷ lệ': pct(o.received) },
        { 'Chỉ tiêu': 'Đang xử lý', 'Số lượng': o.processing, 'Tỷ lệ': pct(o.processing) },
        { 'Chỉ tiêu': 'Đã giải quyết', 'Số lượng': o.resolved, 'Tỷ lệ': pct(o.resolved) },
        { 'Chỉ tiêu': 'Từ chối / chuyển đơn vị', 'Số lượng': o.rejected, 'Tỷ lệ': pct(o.rejected) },
        { 'Chỉ tiêu': 'QUÁ HẠN (cần đôn đốc)', 'Số lượng': o.overdue, 'Tỷ lệ': pct(o.overdue) },
        {},
        { 'Chỉ tiêu': 'TỶ LỆ GIẢI QUYẾT', 'Số lượng': '', 'Tỷ lệ': resolveRate },
      ]), [32, 12, 10]), 'Tổng quan');

      // ───── Sheet 3: THEO NHÓM XỬ LÝ ─────
      XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet(
        data.byCategory.map((c) => ({
          'Nhóm xử lý': c.category,
          'Tổng': c.total,
          'Đã giải quyết': c.resolved,
          'Tỷ lệ giải quyết': c.total > 0 ? `${((c.resolved / c.total) * 100).toFixed(1)}%` : '0%',
          'Quá hạn': c.overdue,
          'TB giờ xử lý': c.avg_hours ?? '',
          'TB ngày xử lý': c.avg_hours ? (c.avg_hours / 24).toFixed(1) : '',
        }))
      ), [26, 8, 14, 16, 10, 14, 14]), 'Theo nhóm');

      // ───── Sheet 4: THEO ĐỊA BÀN ─────
      const totalWard = data.byWard.reduce((a, w) => a + w.total, 0);
      XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet(
        data.byWard.map((w) => ({
          'Địa bàn (phường/xã)': w.ward,
          'Số ý kiến': w.total,
          'Tỷ lệ': totalWard > 0 ? `${((w.total / totalWard) * 100).toFixed(1)}%` : '0%',
        }))
      ), [28, 12, 10]), 'Theo địa bàn');

      // ───── Sheet 5: THEO CÁN BỘ ─────
      XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet(
        data.byStaff.map((st) => ({
          'Cán bộ phụ trách': st.staff,
          'Được phân công': st.assigned,
          'Đã giải quyết': st.resolved,
          'Còn tồn': st.assigned - st.resolved,
          'Tỷ lệ hoàn thành': st.assigned > 0 ? `${((st.resolved / st.assigned) * 100).toFixed(1)}%` : '0%',
        }))
      ), [26, 16, 14, 10, 16]), 'Theo cán bộ');

      // ───── Sheet 6: THEO NGÀY ─────
      XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet(
        data.byDay.map((d) => ({
          'Ngày': new Date(d.day).toLocaleDateString('vi-VN'),
          'Số ý kiến': d.total,
        }))
      ), [14, 12]), 'Theo ngày');

      // ───── Sheet 7: DANH SÁCH CHI TIẾT (lấy thêm từ máy chủ) ─────
      try {
        const rows = await fetchReportDetails(range.from, range.to);
        XLSX.utils.book_append_sheet(wb, withWidth(XLSX.utils.json_to_sheet(
          rows.map((r, i) => ({
            'STT': i + 1,
            'Mã tra cứu': r.trackingCode,
            'Ngày gửi': new Date(r.createdAt).toLocaleString('vi-VN'),
            'Nhóm': r.category,
            'Địa bàn': r.ward,
            'Người gửi': r.sender,
            'Nội dung (rút gọn)': r.content,
            'Trạng thái': r.status,
            'Cán bộ xử lý': r.staff,
            'Hạn xử lý': r.deadlineAt ? new Date(r.deadlineAt).toLocaleDateString('vi-VN') : '',
            'Quá hạn': r.overdue ? 'CÓ' : '',
          }))
        ), [5, 13, 18, 18, 18, 18, 60, 16, 20, 13, 9]), 'Danh sách chi tiết');
      } catch {
        // Máy chủ chưa có endpoint chi tiết -> vẫn xuất 6 sheet kia
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['Không tải được danh sách chi tiết.'],
          ['Máy chủ có thể chưa cập nhật. Các sheet thống kê khác vẫn đầy đủ.'],
        ]), 'Danh sách chi tiết');
      }

      XLSX.writeFile(wb, `Bao-cao-Hop-Thu-An-Ninh-So_${range.from}_den_${range.to}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const pieData = data
    ? [
        { name: 'Chờ tiếp nhận', value: Number(data.overview.received) },
        { name: 'Đang xử lý', value: Number(data.overview.processing) },
        { name: 'Đã giải quyết', value: Number(data.overview.resolved) },
        { name: 'Từ chối', value: Number(data.overview.rejected) },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <AdminLayout>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Báo cáo thống kê</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chọn khoảng thời gian, xem số liệu và xuất file Excel nộp lãnh đạo.
          </p>
        </div>
        <button
          onClick={exportExcel}
          disabled={!data || exporting}
          className="btn-shine flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
          {exporting ? 'Đang tạo file...' : 'Xuất Excel (7 sheet)'}
        </button>
      </div>

      {/* Chọn khoảng thời gian */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Từ ngày</label>
          <input
            type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Đến ngày</label>
          <input
            type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <button
          onClick={() => {
            if (from > to) { alert('“Từ ngày” phải trước hoặc bằng “Đến ngày”.'); return; }
            // Nếu khoảng ngày không đổi -> setRange không tạo query mới -> gọi refetch tay
            if (range.from === from && range.to === to) refetch();
            else setRange({ from, to });
          }}
          className="btn-shine flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-primary-700"
        >
          <CalendarDays className="h-4 w-4" /> Xem báo cáo
        </button>
      </div>

      {/* Nhãn cho biết đang xem số liệu khoảng ngày nào */}
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Đang xem số liệu từ <b>{range.from}</b> đến <b>{range.to}</b>
        {isFetching && <span className="ml-2 text-primary-600">· đang cập nhật...</span>}
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải số liệu...
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>
      )}

      {data && (
        <>
          {/* Cảnh báo quá hạn */}
          {Number(data.overview.overdue) > 0 && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/10">
              <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                Có <span className="text-lg font-extrabold">{data.overview.overdue}</span> ý kiến ĐÃ QUÁ HẠN
                xử lý theo quy định — cần giải quyết ngay.
              </p>
            </div>
          )}

          {/* Ô số liệu */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              { label: 'Tổng ý kiến', value: data.overview.total, color: 'text-slate-800 dark:text-slate-100' },
              { label: 'Chờ tiếp nhận', value: data.overview.received, color: 'text-blue-600' },
              { label: 'Đang xử lý', value: data.overview.processing, color: 'text-amber-600' },
              { label: 'Đã giải quyết', value: data.overview.resolved, color: 'text-emerald-600' },
              { label: 'Từ chối', value: data.overview.rejected, color: 'text-slate-500' },
              { label: 'QUÁ HẠN', value: data.overview.overdue, color: 'text-rose-600' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value ?? 0}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Biểu đồ đường — theo ngày */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Ý kiến theo ngày</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.byDay.map((d) => ({
                  ngay: new Date(d.day).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                  total: Number(d.total),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ngay" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" name="Số ý kiến" stroke="#1B5E20" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tròn — trạng thái */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Tỷ lệ theo trạng thái</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Cột — theo nhóm */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Theo nhóm xử lý</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byCategory.map((c) => ({
                  nhom: c.category, total: Number(c.total), resolved: Number(c.resolved),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="nhom" fontSize={10} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="Tổng" fill="#1976D2" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="resolved" name="Đã giải quyết" fill="#1B5E20" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cột — theo địa bàn */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Theo địa bàn</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.byWard.slice(0, 8).map((w) => ({ dia_ban: w.ward, total: Number(w.total) }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="dia_ban" fontSize={10} width={110} />
                  <Tooltip />
                  <Bar dataKey="total" name="Số ý kiến" fill="#F9A825" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bảng hiệu suất cán bộ */}
          <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
            <h3 className="border-b border-slate-100 px-5 py-4 text-sm font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200">
              Hiệu suất cán bộ
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Cán bộ</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Được phân công</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Đã giải quyết</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {data.byStaff.map((s) => {
                  const a = Number(s.assigned), r = Number(s.resolved);
                  const pct = a > 0 ? Math.round((r / a) * 100) : 0;
                  return (
                    <tr key={s.staff} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200">{s.staff}</td>
                      <td className="px-5 py-2.5 text-right">{a}</td>
                      <td className="px-5 py-2.5 text-right">{r}</td>
                      <td className={`px-5 py-2.5 text-right font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
