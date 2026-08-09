/**
 * KHUNG TRAO ĐỔI HAI CHIỀU — phía người dân
 * ============================================================================
 *
 * VÌ SAO CÓ MÀN HÌNH NÀY:
 * Bà con gửi tố giác ẩn danh xong là hết đường liên lạc. Cán bộ đọc thấy thiếu
 * thông tin — "đối tượng mặc áo màu gì", "khoảng mấy giờ" — nhưng không hỏi lại
 * được vì không có số điện thoại. Đơn đành xếp lại, mà đó thường là những tin
 * báo giá trị nhất.
 *
 * Kênh này giải bài toán đó mà KHÔNG phá vỡ tính ẩn danh: hệ thống chỉ lưu nội
 * dung tin nhắn, không lưu tên, số điện thoại, email hay địa chỉ IP.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Lock, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import {
  moPhongChat, layTinNhan, guiTinNhan, layVeChat, xoaVeChat,
  type ChatMessageItem,
} from '../../services/trackingService';

interface Props {
  /** Mã tra cứu 6 ký tự của ý kiến */
  code: string;
}

export default function ChatPanel({ code }: Props) {
  const [daVao, setDaVao] = useState(() => Boolean(layVeChat(code)));
  const [pin, setPin] = useState('');
  const [dangMo, setDangMo] = useState(false);
  const [loiMo, setLoiMo] = useState('');

  const [tin, setTin] = useState<ChatMessageItem[]>([]);
  const [daDong, setDaDong] = useState(false);
  const [soanThao, setSoanThao] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [dangTai, setDangTai] = useState(false);

  const cuoiRef = useRef<HTMLDivElement>(null);

  /* Tải tin nhắn. Bọc useCallback vì được gọi cả từ nút và từ bộ đếm giờ. */
  const taiTin = useCallback(async (hienVongXoay = false) => {
    if (hienVongXoay) setDangTai(true);
    try {
      const kq = await layTinNhan(code);
      setTin(kq.messages || []);
      setDaDong(Boolean(kq.daDong));
      setLoi('');
    } catch (e) {
      const msg = (e as Error).message || '';
      /* Vé hết hạn -> quay về màn hình nhập PIN, không để bà con nhìn khung
         trống mà không hiểu vì sao. */
      if (/hết hạn|chưa vào/i.test(msg)) {
        xoaVeChat(code);
        setDaVao(false);
      } else {
        setLoi(msg || 'Không tải được tin nhắn.');
      }
    } finally {
      if (hienVongXoay) setDangTai(false);
    }
  }, [code]);

  /* Tự tải lại mỗi 15 giây khi đang mở phòng.
     Không dùng kết nối thời gian thực vì máy chủ chạy gói miễn phí — giữ kết
     nối mở liên tục sẽ tốn tài nguyên mà lợi ích không đáng kể: trao đổi kiểu
     này không cần tức thời từng giây. */
  useEffect(() => {
    if (!daVao) return;
    taiTin(true);
    const t = window.setInterval(() => taiTin(false), 15_000);
    return () => window.clearInterval(t);
  }, [daVao, taiTin]);

  /* Cuộn xuống tin mới nhất */
  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tin.length]);

  async function vaoPhong() {
    if (!/^\d{6}$/.test(pin)) { setLoiMo('Mã PIN gồm 6 chữ số.'); return; }
    setDangMo(true);
    setLoiMo('');
    try {
      const kq = await moPhongChat(code, pin);
      setDaDong(Boolean(kq.daDong));
      setDaVao(true);
      setPin('');
    } catch (e) {
      setLoiMo((e as Error).message || 'Không vào được phòng trao đổi.');
    } finally {
      setDangMo(false);
    }
  }

  async function gui() {
    const nd = soanThao.trim();
    if (!nd || dangGui) return;
    setDangGui(true);
    setLoi('');
    try {
      await guiTinNhan(code, nd);
      setSoanThao('');
      await taiTin(false);
    } catch (e) {
      setLoi((e as Error).message || 'Không gửi được tin nhắn.');
    } finally {
      setDangGui(false);
    }
  }

  /* ---------------------------------------------------------------------
     MÀN HÌNH NHẬP MÃ PIN
     --------------------------------------------------------------------- */
  if (!daVao) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <MessageSquare className="h-4 w-4 text-primary-600" />
          Trao đổi thêm với cán bộ
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Cán bộ có thể cần hỏi thêm chi tiết để xác minh. Bà con nhập <b>mã PIN 6 số</b>{' '}
          đã được cấp lúc gửi ý kiến để vào phòng trao đổi.
          <br />
          Kênh này <b>không lộ danh tính</b> — hệ thống chỉ lưu nội dung tin nhắn.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
            <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              className="w-full bg-transparent py-2.5 text-base tracking-widest outline-none sm:text-sm"
              inputMode="numeric"
              maxLength={6}
              placeholder="Nhập mã PIN 6 số"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && vaoPhong()}
            />
          </div>
          <button
            type="button"
            onClick={vaoPhong}
            disabled={dangMo || pin.length !== 6}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            {dangMo ? 'Đang mở…' : 'Vào phòng'}
          </button>
        </div>

        {loiMo && (
          <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{loiMo}</p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Quên mã PIN thì không cấp lại được — hệ thống chỉ lưu bản mã hoá, không đọc
          ngược ra được. Bà con vẫn tra cứu tiến độ bình thường bằng mã tra cứu, hoặc
          gọi trực tiếp số trực ban.
        </p>
      </section>
    );
  }

  /* ---------------------------------------------------------------------
     PHÒNG TRAO ĐỔI
     --------------------------------------------------------------------- */
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 bg-primary-50/60 px-4 py-3 dark:border-slate-800 dark:bg-primary-900/15">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <MessageSquare className="h-4 w-4 text-primary-600" />
          Trao đổi với cán bộ
        </h3>
        <button
          type="button"
          onClick={() => taiTin(true)}
          className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
        >
          {dangTai ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Làm mới
        </button>
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto px-4 py-4">
        {tin.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Chưa có tin nhắn nào. Bà con có thể bổ sung thông tin ngay tại đây.
          </p>
        )}

        {tin.map((m) => {
          const cuaCanBo = m.sender_type === 'staff';
          return (
            <div key={m.id} className={cuaCanBo ? 'flex justify-start' : 'flex justify-end'}>
              <div
                className={
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed '
                  + (cuaCanBo
                    ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                    : 'bg-primary-600 text-white')
                }
              >
                <p className={'mb-0.5 text-[10px] font-bold ' + (cuaCanBo ? 'text-primary-700 dark:text-primary-300' : 'text-white/80')}>
                  {cuaCanBo ? 'Cán bộ' : 'Bà con'}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={'mt-1 text-[10px] ' + (cuaCanBo ? 'text-slate-500 dark:text-slate-400' : 'text-white/70')}>
                  {new Date(m.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={cuoiRef} />
      </div>

      {/* ------------------------------------------------------------------
          KHOÁ Ô NHẬP KHI HỒ SƠ ĐÃ ĐÓNG

          Hồ sơ đã giải quyết xong hoặc bị từ chối thì luồng xử lý khép lại.
          Cho nhắn tiếp là bà con nói vào khoảng không, không ai đọc.

          ⚠️ Đây chỉ là phần hiển thị cho bà con thấy rõ. Chặn THẬT nằm ở máy
          chủ — người dùng công cụ gọi API vẫn bị trả về lỗi 403.
          ------------------------------------------------------------------ */}
      {daDong ? (
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <b>Kênh trao đổi đã đóng</b> do hồ sơ đã được xử lý xong hoặc không tiếp nhận.
            Bà con vẫn đọc lại được toàn bộ nội dung ở trên. Nếu còn việc cần trình báo,
            vui lòng gửi ý kiến mới.
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {loi && <p className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400">{loi}</p>}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              maxLength={1000}
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 sm:text-sm"
              placeholder="Nhập nội dung trao đổi…"
              value={soanThao}
              onChange={(e) => setSoanThao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gui(); }
              }}
            />
            <button
              type="button"
              onClick={gui}
              disabled={dangGui || !soanThao.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:opacity-50"
              aria-label="Gửi tin nhắn"
            >
              {dangGui ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Nhấn Enter để gửi. Kênh này không lộ danh tính của bà con.
          </p>
        </div>
      )}
    </section>
  );
}
