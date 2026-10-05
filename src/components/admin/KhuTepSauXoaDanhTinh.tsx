/**
 * TỆP ĐÍNH KÈM CỦA HỒ SƠ ĐÃ XOÁ DANH TÍNH (BUG-029)
 *
 * Máy chủ che sẵn tệp của hồ sơ đã xoá danh tính với mọi người — đơn, ảnh căn
 * cước người dân gửi kèm thường có chính danh tính họ đã xin xoá. Khung này chỉ
 * nói có bao nhiêu tệp bị che. Lãnh đạo mở được bằng một lần bấm riêng (máy chủ
 * ghi nhật ký trước khi trả), rồi xoá hẳn được từng tệp chỉ chứa danh tính.
 *
 * Chữ trong tệp (OCR) cũng chỉ tải SAU khi lãnh đạo bấm mở — để ngay trên trang
 * thì mỗi lần mở hồ sơ là một lượt đọc danh tính không ai chủ động.
 * Mọi kiểm quyền ở máy chủ; ẩn nút ở đây chỉ để đỡ bấm vào chỗ bị từ chối.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EyeOff, Eye, Loader2, Trash2 } from 'lucide-react';
import KhuTepDinhKem, { laTaiLieu } from './KhuTepDinhKem';
import KhuChuTrongTep from './KhuChuTrongTep';
import { moTepSauXoaDanhTinh, xoaHanTep, type TepSauXoaDanhTinh } from '../../services/adminService';

interface Props {
  hoSoId: number | string;
  soTep: number;
  lanhDao: boolean;
}

function nhanTep(t: TepSauXoaDanhTinh, i: number): string {
  if (laTaiLieu(t)) return `Tài liệu ${i + 1}${String(t.mime_type).includes('pdf') ? ' (PDF)' : ' (Word)'}`;
  if (String(t.mime_type).startsWith('video/')) return `Video ${i + 1}`;
  return `Ảnh ${i + 1}`;
}

export default function KhuTepSauXoaDanhTinh({ hoSoId, soTep, lanhDao }: Props) {
  const qc = useQueryClient();
  const [tep, setTep] = useState<TepSauXoaDanhTinh[] | null>(null);

  const mo = useMutation({
    mutationFn: () => moTepSauXoaDanhTinh(hoSoId),
    onSuccess: (d) => setTep(d.tep),
    onError: (e: Error) => toast.error(e.message),
  });
  const xoa = useMutation({
    mutationFn: ({ tepId, lyDo }: { tepId: number; lyDo: string }) => xoaHanTep(hoSoId, tepId, lyDo),
    onSuccess: (d, { tepId }) => {
      toast.success(d.message);
      setTep((ds) => (ds ? ds.filter((t) => t.tepId !== tepId) : ds));
      /* Chữ trích của tệp đã xoá cũng mất — tải lại khu chữ trong tệp */
      qc.invalidateQueries({ queryKey: ['trich-chu', String(hoSoId)] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (soTep <= 0) return null;

  function hoiXoa(t: TepSauXoaDanhTinh, i: number) {
    const lyDo = window.prompt(
      `Xoá hẳn "${nhanTep(t, i)}"? Không lấy lại được — cả bản trên kho ảnh.\n\n`
      + 'Chỉ xoá tệp CHỈ có danh tính (vd ảnh căn cước). Tệp là chứng cứ vụ việc thì giữ.\n\n'
      + 'Ghi lý do (sẽ vào nhật ký):'
    );
    if (lyDo === null) return;
    if (lyDo.trim().length < 5) { toast.error('Lý do cần ít nhất 5 ký tự.'); return; }
    xoa.mutate({ tepId: t.tepId, lyDo: lyDo.trim() });
  }

  const guiDau = tep?.filter((t) => t.boSungId === null) ?? [];
  const boSung = tep?.filter((t) => t.boSungId !== null) ?? [];

  return (
    <section data-khoi="tep-sau-xoa-danh-tinh" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
      <p className="flex items-start gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
        Hồ sơ đã xoá danh tính theo yêu cầu người dân — {soTep} tệp đính kèm đang bị che
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        Đơn, ảnh giấy tờ người dân gửi kèm thường có chính danh tính họ đã xin xoá, nên tệp và chữ trong tệp
        không hiện ở đây. {lanhDao
          ? 'Lãnh đạo mở được khi cần cho vụ việc — mỗi lần mở đều ghi nhật ký.'
          : 'Chỉ lãnh đạo mở được.'}
      </p>

      {lanhDao && tep === null && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Mở ${soTep} tệp của hồ sơ đã xoá danh tính? Lượt mở được ghi vào nhật ký.`)) mo.mutate();
          }}
          disabled={mo.isPending}
          className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {mo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Mở {soTep} tệp (ghi nhật ký)
        </button>
      )}

      {tep !== null && (
        <div className="mt-3 space-y-3">
          {tep.length === 0 && <p className="text-xs text-slate-600 dark:text-slate-400">Không còn tệp nào.</p>}
          {[['Gửi lúc đầu', guiDau], ['Người dân gửi bổ sung', boSung]].map(([ten, ds]) => {
            const danhSach = ds as TepSauXoaDanhTinh[];
            if (danhSach.length === 0) return null;
            return (
              <div key={ten as string}>
                <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">{ten as string} ({danhSach.length})</p>
                <KhuTepDinhKem tep={danhSach} />
                <ul className="mt-2 space-y-1">
                  {danhSach.map((t, i) => (
                    <li key={t.tepId} data-khoi="tep-bi-che" className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1 text-xs dark:bg-slate-900/40">
                      <span className="text-slate-700 dark:text-slate-300">{nhanTep(t, i)}</span>
                      <button
                        type="button"
                        onClick={() => hoiXoa(t, i)}
                        disabled={xoa.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xoá hẳn
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <KhuChuTrongTep hoSoId={hoSoId} />
        </div>
      )}
    </section>
  );
}
