/**
 * QUYỀN DỮ LIỆU CÁ NHÂN — hiện dưới kết quả tra cứu
 *
 * VÌ SAO THIẾT KẾ NHƯ THẾ NÀY:
 *
 * Nghị định 13/2023 cho người dân quyền yêu cầu xoá dữ liệu cá nhân. Nhưng với
 * hệ thống tiếp nhận tố giác, một nút "xoá ngay" tự động sẽ thành LỖ HỔNG:
 * kẻ bị tố giác có thể ép người báo tin bấm xoá, chứng cứ biến mất.
 *
 * Nên hệ thống làm ba việc:
 *   1. Chỉ xoá DANH TÍNH, giữ nội dung nghiệp vụ (thống kê vẫn đúng)
 *   2. Hồ sơ ĐANG xử lý thì GHI NHẬN yêu cầu, xoá tự động khi đóng hồ sơ
 *      -> đúng tinh thần "hoãn quyền xoá khi còn lý do chính đáng"
 *   3. Nói rõ giới hạn cho người dân biết, không giấu
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Trash2, Loader2, Info } from 'lucide-react';
import { requestDataDeletion } from '../../services/trackingService';

interface Props {
  code: string;
  isAnonymous?: boolean;
}

export default function DataRightsBox({ code, isAnonymous }: Props) {
  const [moRong, setMoRong] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [ketQua, setKetQua] = useState<{ status: string; message: string } | null>(null);

  async function xuLyYeuCau() {
    if (
      !confirm(
        'Yêu cầu xoá thông tin cá nhân?\n\n' +
          '• Hệ thống sẽ xoá họ tên, số điện thoại, email của bà con\n' +
          '• Nội dung ý kiến được GIỮ LẠI ở dạng không còn danh tính\n' +
          '• Nếu hồ sơ đang xử lý, việc xoá sẽ thực hiện ngay sau khi đóng hồ sơ\n\n' +
          'Sau khi xoá, cán bộ KHÔNG thể liên hệ lại để thông báo kết quả.'
      )
    ) {
      return;
    }

    setDangGui(true);
    try {
      const kq = await requestDataDeletion(code);
      setKetQua({ status: kq.status, message: kq.message });
    } catch (e) {
      setKetQua({
        status: 'error',
        message: e instanceof Error ? e.message : 'Không gửi được yêu cầu. Vui lòng thử lại.',
      });
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      {/* Tiêu đề bấm để mở/đóng */}
      <button
        onClick={() => setMoRong(!moRong)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" />
        <span className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">
          Quyền đối với thông tin cá nhân của bà con
        </span>
        <span className="text-xs text-slate-500">{moRong ? 'Thu gọn' : 'Xem'}</span>
      </button>

      <AnimatePresence>
        {moRong && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {/* Tin ẩn danh: không có gì để xoá */}
              {isAnonymous ? (
                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Ý kiến này được gửi ẩn danh
                  </p>
                  <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                    Hệ thống <b>không lưu bất kỳ thông tin cá nhân nào</b> của bà con — không
                    họ tên, không số điện thoại, không email. Không có gì để xoá.
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    Theo <b>Nghị định 13/2023/NĐ-CP</b>, bà con có quyền yêu cầu xoá thông tin
                    cá nhân đã cung cấp.
                  </p>

                  {/* Giải thích rõ giới hạn — minh bạch, không giấu */}
                  <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Bà con cần biết trước
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-900 dark:text-amber-200">
                      <li>
                        • Hệ thống xoá <b>họ tên, số điện thoại, email</b> — nhưng{' '}
                        <b>giữ lại nội dung</b> ý kiến ở dạng không còn danh tính, phục vụ
                        thống kê nghiệp vụ.
                      </li>
                      <li>
                        • Nếu hồ sơ <b>đang xử lý</b>, hệ thống ghi nhận yêu cầu và xoá{' '}
                        <b>ngay sau khi đóng hồ sơ</b> — vì cán bộ cần thông tin để xác minh
                        vụ việc.
                      </li>
                      <li>
                        • Sau khi xoá, cán bộ <b>không thể liên hệ lại</b> để báo kết quả cho
                        bà con.
                      </li>
                    </ul>
                  </div>

                  {/* Kết quả sau khi bấm */}
                  {ketQua ? (
                    <div
                      className={`rounded-xl p-3 text-xs leading-relaxed ${
                        ketQua.status === 'error'
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-200'
                      }`}
                    >
                      {ketQua.message}
                    </div>
                  ) : (
                    <button
                      onClick={xuLyYeuCau}
                      disabled={dangGui}
                      className="flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {dangGui ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {dangGui ? 'Đang gửi yêu cầu...' : 'Yêu cầu xoá thông tin cá nhân'}
                    </button>
                  )}
                </>
              )}

              <p className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
                Cần hỏi thêm, bà con liên hệ trực ban đơn vị hoặc xem{' '}
                <a href="/chinh-sach-bao-mat" className="font-semibold text-primary-600 hover:underline">
                  Chính sách bảo mật
                </a>
                .
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
