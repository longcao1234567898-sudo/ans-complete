/**
 * TRANG "MÃ QR" — tạo và in mã QR dán tại hiện trường (cột đèn, cổng khu
 * phố, bảng tin tổ dân phố...). Bà con quét mã -> trang "Gửi ý kiến" tự
 * điền sẵn phường/xã của đúng điểm đó, khỏi phải tự chọn.
 *
 * Route này lấp vào mục "Mã QR" đã có sẵn trên thanh điều hướng (nhóm
 * "Tại quầy") nhưng trước đây chưa có trang — xem AdminLayout.tsx.
 */
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Download, Trash2, Loader2, QrCode, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/admin/AdminLayout';
import Button from '../../components/common/Button';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { fetchWards, type WardOption } from '../../services/feedbackService';
import {
  fetchQrPoints, createQrPoint, toggleQrPoint, deleteQrPoint, type QrPoint,
} from '../../services/adminService';

export default function AdminQrPage() {
  const { staff } = useAdminAuth();
  const dieuHanhDuoc = staff?.role === 'admin' || staff?.role === 'manager';

  const [wards, setWards] = useState<WardOption[]>([]);
  const [points, setPoints] = useState<QrPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [wardId, setWardId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function taiLai() {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([fetchWards(), fetchQrPoints()]);
      setWards(w);
      setPoints(p);
    } catch {
      toast.error('Không tải được danh sách điểm QR.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { taiLai(); }, []);

  async function handleTao(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !wardId) return toast.error('Nhập tên điểm và chọn phường/xã.');
    setSaving(true);
    try {
      await createQrPoint(name.trim(), Number(wardId), note.trim() || undefined);
      toast.success('Đã tạo mã QR mới.');
      setName(''); setWardId(''); setNote('');
      await taiLai();
    } catch (err) {
      toast.error((err as Error).message || 'Không tạo được, thử lại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBatTat(p: QrPoint) {
    try {
      await toggleQrPoint(p.id, !p.is_active);
      setPoints((cur) => cur.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error((err as Error).message || 'Không đổi được trạng thái.');
    }
  }

  async function handleXoa(p: QrPoint) {
    if (!confirm(`Xoá điểm "${p.name}"? Mã QR đã in trước đây sẽ không còn dùng được.`)) return;
    try {
      await deleteQrPoint(p.id);
      setPoints((cur) => cur.filter((x) => x.id !== p.id));
      toast.success('Đã xoá.');
    } catch (err) {
      toast.error((err as Error).message || 'Không xoá được.');
    }
  }

  function taiAnhQR(p: QrPoint) {
    const svg = document.getElementById(`qr-svg-${p.id}`)?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const size = 480;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size + 90;
      const ctx = canvas.getContext('2d');
      if (!ctx) return toast.error('Trình duyệt không hỗ trợ tải ảnh.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 40, 30, size - 80, size - 80);
      ctx.fillStyle = '#1B5E20';
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(p.name, size / 2, size + 30, size - 40);
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Quét để gửi ý kiến — ${p.ward_name}`, size / 2, size + 60);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `qr-${p.code}.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${svg64}`;
  }

  const qrUrl = (code: string) => `${window.location.origin}/gui-y-kien?diem=${code}`;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <QrCode size={22} className="text-primary-600" /> Mã QR định vị
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dán mã QR tại các điểm cố định trên địa bàn (cột đèn, cổng khu phố, bảng tin...).
            Bà con quét mã, form gửi ý kiến sẽ tự chọn sẵn đúng phường/xã của điểm đó.
          </p>
        </div>

        {dieuHanhDuoc && (
          <form onSubmit={handleTao} className="grid gap-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Tên điểm, vd: Cổng khu phố 3"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <select
              value={wardId} onChange={(e) => setWardId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">— Chọn phường/xã —</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú (không bắt buộc)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <Button type="submit" disabled={saving} className="whitespace-nowrap">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Tạo mã
            </Button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" size={28} /></div>
        ) : points.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
            Chưa có điểm QR nào. {dieuHanhDuoc ? 'Tạo điểm đầu tiên ở trên.' : 'Liên hệ quản trị viên để tạo.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p) => (
              <div key={p.id} className={`rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900 ${!p.is_active ? 'opacity-50' : ''}`}>
                <div id={`qr-svg-${p.id}`} className="flex justify-center rounded-xl bg-white p-3">
                  <QRCodeSVG value={qrUrl(p.code)} size={140} fgColor="#1B5E20" />
                </div>
                <div className="mt-3 text-center">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.ward_name}</div>
                  {p.note && <div className="mt-1 text-xs italic text-slate-400">{p.note}</div>}
                  <div className="mt-1 font-mono text-[11px] text-slate-300">#{p.code}</div>
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  <button onClick={() => taiAnhQR(p)} title="Tải ảnh QR"
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <Download size={16} />
                  </button>
                  {dieuHanhDuoc && (
                    <>
                      <button onClick={() => handleBatTat(p)} title={p.is_active ? 'Tắt điểm' : 'Bật lại điểm'}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        <Power size={16} />
                      </button>
                      <button onClick={() => handleXoa(p)} title="Xoá"
                        className="rounded-lg border border-rose-200 p-2 text-rose-500 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
