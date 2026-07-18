/**
 * TRANG KI-ỐT — cán bộ nhập hộ ý kiến cho bà con TẠI TRỤ SỞ.
 *
 * Dành cho bà con không có điện thoại thông minh / không có mạng / ngại gõ.
 * Cán bộ ngồi quầy tiếp dân, nghe bà con trình bày rồi nhập vào đây,
 * in phiếu có mã tra cứu đưa bà con cầm về.
 *
 * Thiết kế CỐ Ý khác trang quản trị:
 *   • Chữ TO, nút TO — cán bộ thao tác nhanh, bà con ngồi cạnh cũng đọc được
 *   • Ít bước nhất có thể: nội dung -> nhóm -> họ tên + SĐT -> xong
 *   • Không cần OTP (cán bộ đã gặp mặt trực tiếp)
 *   • Xong là hiện MÃ TRA CỨU CỠ LỚN + nút IN PHIẾU
 */
import { useState } from 'react';
import { Printer, RotateCcw, CheckCircle2, Loader2, Mic } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import VoiceInput from '../../components/common/VoiceInput';
import { adminFetch } from '../../services/adminService';
import { UNIT } from '../../utils/constants';

const CATEGORIES = [
  { code: 'to_giac', label: 'Tố giác tin báo', desc: 'Báo tin tội phạm, vi phạm' },
  { code: 'khieu_nai', label: 'Khiếu nại', desc: 'Khiếu nại quyết định, hành vi' },
  { code: 'phan_anh', label: 'Phản ánh', desc: 'Phản ánh tình hình ANTT' },
  { code: 'de_xuat', label: 'Đề xuất', desc: 'Góp ý, hiến kế' },
];

const URGENCY = [
  { id: 'normal', label: 'Bình thường' },
  { id: 'important', label: 'Quan trọng' },
  { id: 'urgent', label: 'Khẩn cấp' },
];

interface KioskResult {
  trackingCode: string;
  slaDays: number;
  deadlineAt: string;
}

export default function AdminKioskPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<KioskResult | null>(null);

  function reset() {
    setContent(''); setCategory(''); setFullName(''); setPhone('');
    setUrgency('normal'); setErr(''); setResult(null);
  }

  async function submit() {
    setErr('');
    if (content.trim().length < 20) { setErr('Nội dung phải từ 20 ký tự trở lên.'); return; }
    if (!category) { setErr('Chưa chọn nhóm xử lý.'); return; }
    if (fullName.trim().length < 2) { setErr('Chưa nhập họ tên công dân.'); return; }
    if (!/^0\d{9}$/.test(phone)) { setErr('Số điện thoại phải gồm 10 số, bắt đầu bằng 0.'); return; }

    setBusy(true);
    try {
      const r = await adminFetch<KioskResult>('/api/admin/kiosk/submit', {
        method: 'POST',
        body: JSON.stringify({ content, category, fullName, phone, urgency }),
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gửi thất bại, cán bộ thử lại giúp.');
    } finally {
      setBusy(false);
    }
  }

  /** In phiếu tiếp nhận đưa bà con cầm về */
  function printReceipt() {
    if (!result) return;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><meta charset="utf-8"><title>Phiếu tiếp nhận ý kiến</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111}
        .box{border:3px solid #1B5E20;border-radius:12px;padding:28px;max-width:620px;margin:0 auto}
        h1{color:#1B5E20;font-size:20px;margin:0 0 4px;text-align:center}
        .unit{text-align:center;font-size:13px;color:#555;margin-bottom:20px}
        .code{font-size:44px;font-weight:bold;color:#1B5E20;letter-spacing:5px;text-align:center;
              padding:18px;background:#F1F8E9;border-radius:10px;margin:16px 0}
        table{width:100%;font-size:14px;border-collapse:collapse;margin-top:12px}
        td{padding:7px 0;vertical-align:top}
        td:first-child{color:#555;width:130px}
        .note{margin-top:18px;font-size:12px;color:#555;line-height:1.7;border-top:1px dashed #bbb;padding-top:12px}
        .hotline{text-align:center;margin-top:14px;font-size:13px;font-weight:bold;color:#B91C1C}
      </style></head><body>
      <div class="box">
        <h1>PHIẾU TIẾP NHẬN Ý KIẾN</h1>
        <div class="unit">${UNIT.name}</div>
        <div style="text-align:center;font-size:13px;color:#555">Mã tra cứu của bà con</div>
        <div class="code">${result.trackingCode}</div>
        <table>
          <tr><td>Người gửi:</td><td><b>${fullName}</b></td></tr>
          <tr><td>Điện thoại:</td><td>${phone}</td></tr>
          <tr><td>Nhóm xử lý:</td><td>${CATEGORIES.find((c) => c.code === category)?.label ?? ''}</td></tr>
          <tr><td>Ngày tiếp nhận:</td><td>${new Date().toLocaleString('vi-VN')}</td></tr>
          <tr><td>Hạn xử lý:</td><td><b>${new Date(result.deadlineAt).toLocaleDateString('vi-VN')}</b> (${result.slaDays} ngày)</td></tr>
        </table>
        <div class="note">
          <b>Cách tra cứu kết quả:</b><br>
          1. Truy cập: <b>${window.location.host}</b> → bấm "Tra cứu kết quả"<br>
          2. Nhập mã <b>${result.trackingCode}</b> để xem tiến độ xử lý<br>
          3. Hoặc gọi trực ban đơn vị để được hỗ trợ tra cứu<br><br>
          Danh tính của bà con được bảo mật theo quy định pháp luật.
        </div>
        <div class="hotline">Khẩn cấp gọi 113 · Trực ban: ${UNIT.hotline}</div>
      </div>
      <script>window.print()</script>
      </body></html>
    `);
    win.document.close();
  }

  // ═══════ ĐÃ GỬI XONG — hiện mã cỡ lớn ═══════
  if (result) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-2xl text-center">
          <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
          <h1 className="mb-1 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            Đã tiếp nhận ý kiến
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Cán bộ in phiếu đưa bà con cầm về để tra cứu sau
          </p>

          <div className="mb-6 rounded-2xl border-4 border-primary-600 bg-primary-50 p-8 dark:bg-primary-900/20">
            <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">MÃ TRA CỨU</p>
            <p className="font-mono text-5xl font-extrabold tracking-[0.2em] text-primary-700 dark:text-primary-300">
              {result.trackingCode}
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Hạn xử lý: <b>{new Date(result.deadlineAt).toLocaleDateString('vi-VN')}</b> ({result.slaDays} ngày)
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={printReceipt}
              className="btn-shine flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 text-base font-bold text-white transition hover:bg-primary-700"
            >
              <Printer className="h-5 w-5" /> In phiếu cho bà con
            </button>
            <button
              onClick={reset}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border-2 border-slate-300 px-8 text-base font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-5 w-5" /> Nhập cho người tiếp theo
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ═══════ FORM NHẬP ═══════
  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
          Ki-ốt tiếp dân — nhập hộ ý kiến
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Dùng khi bà con đến trực tiếp trụ sở trình bày. Cán bộ nghe và nhập hộ, in phiếu
          có mã tra cứu đưa bà con cầm về. Không cần bà con có điện thoại hay email.
        </p>

        {/* 1. Nội dung */}
        <div className="mb-5">
          <label className="mb-2 block text-base font-bold text-slate-700 dark:text-slate-200">
            1. Nội dung bà con trình bày
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Ghi lại lời bà con: thời gian, địa điểm, sự việc cụ thể..."
            className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base leading-relaxed transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <div className="mt-2 flex items-center justify-between">
            <VoiceInput onText={(t) => setContent((c) => (c ? c.trimEnd() + ' ' : '') + t)} />
            <span className="text-xs text-slate-400">{content.length} ký tự (tối thiểu 20)</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Mic className="h-3.5 w-3.5" /> Cán bộ có thể bấm "Nói thay vì gõ" để nhập nhanh hơn
          </p>
        </div>

        {/* 2. Nhóm xử lý */}
        <div className="mb-5">
          <label className="mb-2 block text-base font-bold text-slate-700 dark:text-slate-200">
            2. Nhóm xử lý
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <label
                key={c.code}
                className="flex min-h-[60px] cursor-pointer items-center gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 transition has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50 dark:border-slate-700 dark:bg-slate-800/60 dark:has-[:checked]:bg-primary-900/20"
              >
                <input
                  type="radio"
                  name="cat"
                  checked={category === c.code}
                  onChange={() => setCategory(c.code)}
                  className="h-5 w-5 shrink-0 accent-primary-600"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">{c.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{c.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 3. Thông tin bà con */}
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-base font-bold text-slate-700 dark:text-slate-200">
              3. Họ tên bà con
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-base font-bold text-slate-700 dark:text-slate-200">
              4. Số điện thoại
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="0912345678"
              className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* 5. Mức khẩn cấp */}
        <div className="mb-6">
          <label className="mb-2 block text-base font-bold text-slate-700 dark:text-slate-200">
            5. Mức độ khẩn cấp
          </label>
          <div className="flex gap-2">
            {URGENCY.map((u) => (
              <label
                key={u.id}
                className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-3 transition has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50 dark:border-slate-700 dark:bg-slate-800/60 dark:has-[:checked]:bg-primary-900/20"
              >
                <input
                  type="radio"
                  name="urg"
                  checked={urgency === u.id}
                  onChange={() => setUrgency(u.id)}
                  className="h-4 w-4 accent-primary-600"
                />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{u.label}</span>
              </label>
            ))}
          </div>
        </div>

        {err && (
          <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {err}
          </p>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="btn-shine flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-lg font-bold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          {busy ? 'Đang lưu...' : 'Tiếp nhận và cấp mã tra cứu'}
        </button>

        <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
          Ý kiến nhập tại ki-ốt được xác minh trực tiếp bởi cán bộ tiếp dân,
          không cần xác thực email. Hệ thống ghi nhật ký cán bộ nhập hộ.
        </p>
      </div>
    </AdminLayout>
  );
}
