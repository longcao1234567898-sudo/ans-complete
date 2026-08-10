/**
 * Widget trợ lý AI: nút nổi góc phải màn hình + bảng chat cá thể hoá theo địa phương.
 * Trả lời thủ tục hành chính / an ninh / pháp luật (mock RAG tại services/aiService.ts).
 */
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SendHorizonal, Trash2 } from 'lucide-react';
import PoliceAvatar from '../common/PoliceAvatar';
import ChatBubble from './ChatBubble';
import MessageList from './MessageList';
import { useChat } from '../../hooks/useChat';
import { AI_ENGINE_LABEL } from '../../services/aiService';
import { UNIT } from '../../utils/constants';

/* Câu hỏi gợi ý — ưu tiên câu về CÁCH DÙNG WEB (bot đã được nạp kiến thức hệ thống)
   Gộp danh sách từ hai nhánh: giữ các câu về thao tác, bổ sung hai câu về
   QUYỀN của bà con (xoá dữ liệu cá nhân theo Nghị định 13/2023) và cảnh giác
   lừa đảo — đúng hai nhóm bà con hay hỏi nhất khi gọi lên trực ban. */
const SUGGESTIONS = [
  'Cách gửi ý kiến?',
  'Gửi ẩn danh thế nào?',
  'Không nhận được mã qua email',
  'Quên mã tra cứu phải làm sao?',
  'Bao lâu thì được giải quyết?',
  'Thông tin của tôi có bị lộ không?',
  'Tôi muốn xoá thông tin cá nhân',
  'Cảnh giác lừa đảo qua điện thoại',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  /* ------------------------------------------------------------------------
     HOÃN HIỆN NÚT TRỢ LÝ CHO TỚI KHI TRANG ĐÃ ỔN ĐỊNH

     Vấn đề đã gặp: nút trợ lý nhảy ra TRƯỚC cả khi trang chủ kịp hiện. Lý do
     là nút này rất nhẹ nên vẽ xong ngay, còn trang chủ phải chờ tải nền video
     và ảnh. Kết quả: người dùng thấy một nút tròn xanh lơ lửng trên nền trắng
     vài giây rồi trang mới hiện ra — trông như lỗi.

     Chờ tới khi trình duyệt báo tải xong ('load'), rồi thêm 600ms cho phần
     hoạt ảnh mở đầu chạy hết. Nếu trang đã tải xong từ trước (chuyển trang
     bằng React Router) thì chỉ chờ 600ms.
     ------------------------------------------------------------------------ */
  const [hienNut, setHienNut] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const batDauDem = () => { t = window.setTimeout(() => setHienNut(true), 600); };

    if (document.readyState === 'complete') {
      batDauDem();
    } else {
      window.addEventListener('load', batDauDem, { once: true });
    }
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener('load', batDauDem);
    };
  }, []);
  const [input, setInput] = useState('');
  const { messages, isTyping, sendMessage, clearChat } = useChat();

  const handleSend = (text?: string) => {
    const value = text ?? input;
    if (!value.trim() || isTyping) return;
    sendMessage(value);
    setInput('');
  };

  if (!hienNut) return null;

  return (
    <>
      <ChatBubble open={open} onClick={() => setOpen((o) => !o)} />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass fixed bottom-24 right-5 z-40 flex h-[32rem] max-h-[75vh] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl shadow-xl sm:bottom-24 sm:right-6"
            role="dialog"
            aria-label="Trợ lý AI"
          >
            {/* Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-primary-600 to-secondary-500 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <PoliceAvatar className="h-9 w-9 ring-2 ring-white/60" />
                <div>
                  <p className="text-sm font-bold leading-tight">Trợ lý AI {UNIT.name}</p>
                  <p className="flex items-center gap-1 text-[11px] leading-tight text-white/80">
                    Chào bà con {UNIT.communeName}
                    {AI_ENGINE_LABEL && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-px font-semibold">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                        {/* Chỉ báo trợ lý đang sẵn sàng, KHÔNG hiện tên nhà cung cấp.
                            Bà con không cần biết hệ thống dùng dịch vụ hãng nào —
                            thông tin đó chỉ gây phân tâm. */}
                        Đang hoạt động
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={clearChat}
                aria-label="Xoá hội thoại"
                className="rounded-lg p-1.5 transition hover:bg-white/15"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Nội dung */}
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
                <PoliceAvatar className="h-24 w-24 shadow-soft" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Chào bà con {UNIT.communeName}! Tôi có thể hỗ trợ thủ tục hành chính, an ninh trật tự và pháp luật.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <MessageList messages={messages} isTyping={isTyping} />
            )}

            {/* Ô nhập */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập câu hỏi của bà con..."
                aria-label="Nhập tin nhắn"
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                aria-label="Gửi tin nhắn"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
