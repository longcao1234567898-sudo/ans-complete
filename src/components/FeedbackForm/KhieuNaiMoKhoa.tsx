/**
 * KhieuNaiMoKhoa — cho người bị khoá nhầm trình bày để cán bộ xem lại.
 *
 * VÌ SAO CẦN: máy khoá nhầm là chuyện có thật — bà con dùng chung máy ở tiệm
 * net hay nhà văn hoá, mạng di động cấp phát chung địa chỉ cho rất nhiều thuê
 * bao nên một người phá thì cả vùng chịu, hoặc cán bộ đánh nhầm tin thật thành
 * tin rác. Không có đường khiếu nại thì người bị oan mất hẳn kênh báo tin cho
 * công an mà không hiểu vì sao, cũng không biết kêu ai.
 *
 * Giới hạn 2 lần mỗi thiết bị — máy chủ chặn, ở đây chỉ hiện cho biết còn mấy
 * lượt để bà con khỏi gõ xong mới bị từ chối.
 */
import { useEffect, useState } from 'react';
import { MessageSquareWarning, Loader2, CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { layMaThietBi } from '../../utils/deviceId';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

interface TrangThai {
  biKhoa: boolean;
  coTheKhieuNai: boolean;
  dangChoXuLy?: boolean;
  soLanDaGui: number;
  soLanToiDa: number;
}

export default function KhieuNaiMoKhoa() {
  const [tt, setTt] = useState<TrangThai | null>(null);
  const [moForm, setMoForm] = useState(false);
  const [noiDung, setNoiDung] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [daGui, setDaGui] = useState(false);

  useEffect(() => {
    if (!API) return;
    const deviceId = layMaThietBi();
    fetch(`${API}/api/khieu-nai/trang-thai?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTt(d))
      .catch(() => { /* không lấy được thì ẩn khu này, không báo lỗi làm rối */ });
  }, []);

  /* Chưa biết trạng thái, hoặc máy chủ báo không khiếu nại được -> ẩn hẳn.
     Hiện một nút bấm vào lại báo lỗi thì tệ hơn là không hiện. */
  if (!tt || !tt.biKhoa) return null;

  async function gui() {
    if (noiDung.trim().length < 10) {
      toast.error('Bà con trình bày rõ hơn giúp, ít nhất 10 chữ.');
      return;
    }
    setDangGui(true);
    try {
      const res = await fetch(`${API}/api/khieu-nai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: layMaThietBi(), noiDung }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Chưa gửi được');
      setDaGui(true);
      toast.success('Đã gửi khiếu nại');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chưa gửi được');
    }
    setDangGui(false);
  }

  /* ĐÃ GỬI XONG */
  if (daGui || tt.dangChoXuLy) {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/15">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
            Khiếu nại đang được xem xét
          </p>
          <p className="mt-1 text-sm leading-snug text-emerald-700 dark:text-emerald-200">
            Cán bộ sẽ xem lại trường hợp của bà con. Nếu đúng là nhầm lẫn, máy sẽ được
            mở lại. Việc gấp thì bà con cứ gọi trực ban, đường dây nóng không bị ảnh hưởng.
          </p>
        </div>
      </div>
    );
  }

  /* HẾT LƯỢT KHIẾU NẠI */
  if (!tt.coTheKhieuNai) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <p className="text-sm leading-snug text-slate-600 dark:text-slate-300">
          Bà con đã khiếu nại đủ {tt.soLanToiDa} lần cho máy này. Nếu vẫn cho rằng có nhầm
          lẫn, xin liên hệ trực tiếp trụ sở công an để được xem xét.
        </p>
      </div>
    );
  }

  /* CHƯA MỞ Ô NHẬP */
  if (!moForm) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-900/10">
        <p className="flex items-center gap-1.5 text-sm font-bold text-primary-800 dark:text-primary-300">
          <MessageSquareWarning className="h-4 w-4" /> Bà con cho rằng bị khoá nhầm?
        </p>
        <p className="mt-1 text-sm leading-snug text-slate-600 dark:text-slate-300">
          Máy có thể khoá nhầm khi nhiều người dùng chung một điện thoại, hoặc nhà mạng
          cấp chung địa chỉ cho nhiều nhà. Bà con trình bày để cán bộ xem lại.
        </p>
        <button
          type="button"
          onClick={() => setMoForm(true)}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700"
        >
          <MessageSquareWarning className="h-4 w-4" /> Gửi khiếu nại
        </button>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Còn {tt.soLanToiDa - tt.soLanDaGui} lượt.
        </p>
      </div>
    );
  }

  /* Ô NHẬP KHIẾU NẠI */
  return (
    <div className="mt-4 rounded-2xl border-2 border-primary-200 bg-white p-4 dark:border-primary-900/40 dark:bg-slate-900">
      <p className="mb-2 text-sm font-bold text-primary-800 dark:text-primary-300">
        Bà con trình bày giúp
      </p>
      <textarea
        value={noiDung}
        onChange={(e) => setNoiDung(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="Ví dụ: Điện thoại này cả nhà tôi dùng chung. Tôi chưa từng gửi tin rác, chỉ muốn báo về việc..."
        className="w-full rounded-xl border-2 border-slate-200 p-3 text-base outline-none transition focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>Ít nhất 10 chữ</span>
        <span>{noiDung.length}/1000</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={gui}
          disabled={dangGui}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          {dangGui ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {dangGui ? 'Đang gửi...' : 'Gửi khiếu nại'}
        </button>
        <button
          type="button"
          onClick={() => setMoForm(false)}
          className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          Thôi
        </button>
      </div>
    </div>
  );
}
