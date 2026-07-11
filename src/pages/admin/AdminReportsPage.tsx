/**
 * Trang BÁO CÁO THỐNG KÊ — biểu đồ + xuất Excel.
 * Cán bộ chọn khoảng thời gian, xem số liệu, bấm 1 nút là ra file Excel nộp lãnh đạo.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Loader2, CalendarDays, AlertTriangle } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchReport } from '../../services/adminService';

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-report', range.from, range.to],
    queryFn: () => fetchReport(range.from, range.to),
  });

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Tổng quan
    const o = data.overview;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Chỉ tiêu': 'Tổng số ý kiến', 'Số lượng': o.total },
      { 'Chỉ tiêu': 'Chờ tiếp nhận', 'Số lượng': o.received },
      { 'Chỉ tiêu': 'Đang xử lý', 'Số lượng': o.processing },
      { 'Chỉ tiêu': 'Đã giải quyết', 'Số lượng': o.resolved },
      { 'Chỉ tiêu': 'Từ chối', 'Số lượng': o.rejected },
      { 'Chỉ tiêu': 'QUÁ HẠN', 'Số lượng': o.overdue },
    ]), 'Tổng quan');

    // Sheet 2 — Theo nhóm
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byCategory.map((c) => ({
        'Nhóm xử lý': c.category,
        'Tổng': c.total,
        'Đã giải quyết': c.resolved,
        'Quá hạn': c.overdue,
        'TB giờ xử lý': c.avg_hours ?? '',
      }))
    ), 'Theo nhóm');

    // Sheet 3 — Theo địa bàn
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byWard.map((w) => ({ 'Địa bàn': w.ward, 'Số ý kiến': w.total }))
    ), 'Theo địa bàn');

    // Sheet 4 — Theo cán bộ
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byStaff.map((s) => ({
        'Cán bộ': s.staff,
        'Được phân công': s.assigned,
        'Đã giải quyết': s.resolved,
      }))
    ), 'Theo cán bộ');

    // Sheet 5 — Theo ngày
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byDay.map((d) => ({
        'Ngày': new Date(d.day).toLocaleDateString('vi-VN'),
        'Số ý kiến': d.total,
      }))
    ), 'Theo ngày');

    XLSX.writeFile(wb, `Bao-cao-Hop-Thu-An-Ninh-So_${range.from}_${range.to}.xlsx`);
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
          disabled={!data}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Xuất Excel
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
          onClick={() => setRange({ from, to })}
          className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          <CalendarDays className="h-4 w-4" /> Xem báo cáo
        </button>
      </div>

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
