/**
 * Bước 1: Nhập nội dung ý kiến + đính kèm ảnh minh chứng (tối đa 3 tấm, không bắt buộc).
 * Ảnh được nén ngay trên trình duyệt trước khi lưu.
 */
import { ChangeEvent, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, Loader2, X, RotateCcw, ListChecks, ShieldQuestion, Camera, ShieldCheck, Video, FileText, FilePlus } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';

import NutGuiViTri from './NutGuiViTri';
import toast from 'react-hot-toast';
import Button from '../common/Button';
import { MAX_FEEDBACK_IMAGES } from '../../utils/constants';
import { compressImageFile } from '../../utils/helpers';
import { CONTENT_MAX_LENGTH, validateImageFile } from '../../utils/security';
import { checkImageSensitive } from '../../services/moderationService';
import VoiceInput from '../common/VoiceInput';

interface ContentInputProps {
  value: string;
  onChange: (v: string) => void;
  urgency?: 'normal' | 'important' | 'urgent';
  onUrgencyChange?: (u: 'normal' | 'important' | 'urgent') => void;
  draftRestored?: boolean;
  onDismissDraft?: () => void;
  images: string[];
  onImagesChange: (imgs: string[]) => void;
  /** Tài liệu đính kèm (PDF, Word) — cho người khiếu nại tố cáo gửi giấy tờ */
  taiLieu?: { ten: string; data: string }[];
  onTaiLieuChange?: (ds: { ten: string; data: string }[]) => void;
  /** Toạ độ nơi xảy ra vụ việc, người dân tự nguyện gửi */
  viTri?: { lat: number; lng: number; doChinhXacMet?: number } | null;
  onViTriChange?: (v: { lat: number; lng: number; doChinhXacMet?: number } | null) => void;
  onNext: () => void;
}



const MIN_LENGTH = 10;

/* GIỚI HẠN TÀI LIỆU. 10MB đủ cho đơn từ và quyết định hành chính; 3 tệp đủ
   cho một hồ sơ khiếu nại thông thường. Máy chủ kiểm lại con số này, đây chỉ
   là lớp chặn sớm để bà con biết ngay thay vì chờ gửi xong mới báo. */
const MAX_TAI_LIEU_MB = 10;
const MAX_SO_TAI_LIEU = 3;
/* GIỚI HẠN KÍCH THƯỚC TỆP TRƯỚC KHI NÉN.

   ⚠️ Trước đây đặt 8MB và chặn NGAY khi chọn tệp — sai, vì điện thoại đời mới
   chụp ra ảnh 8 tới 15MB là bình thường. Bà con chụp ảnh hiện trường bằng máy
   tốt lại bị từ chối "vượt quá 8MB", trong khi ảnh đó nén xong chỉ còn khoảng
   150KB. Đúng nhóm người cần gửi ảnh nhất lại bị chặn.

   Nay nâng lên 25MB. Con số này KHÔNG phải giới hạn chất lượng — nó chỉ để
   chặn tệp lớn bất thường làm treo trình duyệt. Mọi ảnh qua được đều được nén
   xuống dưới 300KB ở bước sau. */
const MAX_FILE_MB = 25;

export default function ContentInput({ value, onChange, urgency = 'normal', onUrgencyChange, draftRestored, onDismissDraft, images, onImagesChange, taiLieu = [], onTaiLieuChange, viTri, onViTriChange, onNext }: ContentInputProps) {
  const { t } = useNgonNgu();
  const tooShort = value.trim().length > 0 && value.trim().length < MIN_LENGTH;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const taiLieuRef = useRef<HTMLInputElement>(null);
  const [dangDocTL, setDangDocTL] = useState(false);

  /* CHỌN TÀI LIỆU ĐÍNH KÈM.

     Chỉ đọc tệp và kiểm sơ bộ ở đây; kiểm an toàn thật nằm ở máy chủ
     (lib/tai-lieu-an-toan.js) vì mã trên trình duyệt sửa được, không tin
     được. Lớp này chỉ để bà con biết sớm thay vì chờ gửi xong mới báo. */
  const chonTaiLieu = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length || !onTaiLieuChange) return;

    const conCho = MAX_SO_TAI_LIEU - taiLieu.length;
    if (conCho <= 0) {
      toast.error(`Chỉ đính được tối đa ${MAX_SO_TAI_LIEU} tài liệu.`);
      return;
    }

    setDangDocTL(true);
    const them: { ten: string; data: string }[] = [];
    for (const f of files.slice(0, conCho)) {
      const ten = f.name.toLowerCase();
      if (ten.endsWith('.docm') || ten.endsWith('.dotm') || ten.endsWith('.xlsm')) {
        toast.error(`"${f.name}" là tệp có macro nên không nhận. Bà con lưu lại dạng PDF rồi gửi.`, { duration: 8000 });
        continue;
      }
      if (!/\.(pdf|docx?|)$/i.test(ten) || /\.(exe|bat|cmd|js|vbs|scr|zip|rar)$/i.test(ten)) {
        toast.error(`"${f.name}" không phải tệp PDF hoặc Word.`, { duration: 6000 });
        continue;
      }
      if (f.size > MAX_TAI_LIEU_MB * 1024 * 1024) {
        toast.error(`"${f.name}" nặng ${(f.size / 1024 / 1024).toFixed(1)}MB, vượt quá ${MAX_TAI_LIEU_MB}MB.`, { duration: 6000 });
        continue;
      }
      try {
        const data = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onerror = () => rej(new Error('Không đọc được tệp'));
          r.onload = () => res(r.result as string);
          r.readAsDataURL(f);
        });
        them.push({ ten: f.name, data });
      } catch {
        toast.error(`Không đọc được "${f.name}".`);
      }
    }
    if (them.length) {
      onTaiLieuChange([...taiLieu, ...them]);
      toast.success(`Đã đính ${them.length} tài liệu`);
    }
    setDangDocTL(false);
  };



  const handlePickImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // cho phép chọn lại cùng tệp lần sau
    if (files.length === 0) return;

    const remaining = MAX_FEEDBACK_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`Chỉ đính kèm tối đa ${MAX_FEEDBACK_IMAGES} ảnh.`);
      return;
    }

    setProcessing(true);
    const added: string[] = [];
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" không phải tệp ảnh.`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`"${file.name}" vượt quá ${MAX_FILE_MB}MB.`);
        continue;
      }
      // Lá chắn 1: xác minh chữ ký nhị phân — tệp phải THẬT SỰ là ảnh
      const check = await validateImageFile(file);
      if (!check.ok) {
        toast.error(`"${file.name}": ${check.reason}`);
        continue;
      }
      // Lá chắn 2: tái mã hoá qua canvas — loại bỏ mọi mã độc ẩn trong tệp gốc
      try {
        const dataUrl = await compressImageFile(file);
        // Lá chắn 3: kiểm duyệt nội dung nhạy cảm (heuristic + AI Gemini)
        // truyền nội dung -> ảnh tố giác sẽ KHÔNG bị gửi sang AI bên ngoài
        const moderation = await checkImageSensitive(dataUrl, value);
        if (moderation.blocked) {
          toast.error(`"${file.name}": ${moderation.reason}. Ảnh không được tiếp nhận.`, { duration: 6000 });
          continue;
        }
        added.push(dataUrl);
      } catch (err) {
        toast.error(`"${file.name}": ${err instanceof Error ? err.message : 'không xử lý được ảnh'}.`);
      }
    }
    setProcessing(false);

    if (added.length > 0) {
      onImagesChange([...images, ...added]);
      if (files.length > remaining) toast(`Chỉ nhận thêm ${remaining} ảnh (tối đa ${MAX_FEEDBACK_IMAGES}).`);
    }
  };

  const removeImage = (idx: number) => onImagesChange(images.filter((_, i) => i !== idx));

  return (
    <div>
      {/* Banner: đã khôi phục nội dung gõ dở lần trước */}
      {draftRestored && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/15">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">
              {t('cn.daKhoiPhucNoi')}
            </p>
            <button
              type="button"
              onClick={onDismissDraft}
              className="mt-0.5 text-xs text-primary-600 underline hover:text-primary-800 dark:text-primary-400"
            >
              {t('cn.xoaVaBatDau')}
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          HƯỚNG DẪN BÀ CON VIẾT ĐỦ Ý — khôi phục từ bản dist V9

          Vì sao cần: phần lớn đơn gửi lên thiếu thời gian, địa điểm, hoặc đặc
          điểm người liên quan. Cán bộ nhận được đơn kiểu "có người bán ma tuý
          gần chợ" thì không đủ căn cứ đi xác minh, phải liên hệ hỏi lại — mà
          với đơn ẩn danh thì không hỏi lại được.

          Nhắc trước 4 điều ngay tại chỗ nhập rẻ hơn nhiều so với hỏi lại sau.
          ==================================================================== */}
      <div className="mb-4 rounded-2xl border-2 border-primary-200 bg-primary-50/70 p-4 dark:border-primary-800 dark:bg-primary-900/15">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-primary-800 dark:text-primary-200">
          <ListChecks className="h-4 w-4 shrink-0" />
          {t('f1.tips')}
        </p>
        <ul className="mb-3 grid gap-1.5 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-2">
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>{t('f1.tipWhen')}:</b> {t('f1.tipWhenD')}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>{t('f1.tipWhere')}:</b> {t('f1.tipWhereD')}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>{t('f1.tipWhat')}:</b> {t('f1.tipWhatD')}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>{t('f1.tipWho')}:</b> {t('f1.tipWhoD')}</span>
          </li>
        </ul>

        {/* Trấn an người sợ bị trả thù — đây là rào cản tâm lý lớn nhất khiến
            bà con không dám tố giác. Nói rõ ngay tại chỗ nhập, không bắt họ
            tự mò tới bước sau mới biết có tuỳ chọn ẩn danh. */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
            {t('f1.anonTitle')}
          </p>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {t('f1.anonBody')}
          </p>
          <p className="mt-1.5 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
            {t('f1.anonNote')}
          </p>
        </div>
      </div>

      <label htmlFor="content" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {t('f1.contentLabel')}
      </label>
      <textarea
        data-hd="o-noi-dung"
        id="content"
        rows={6}
        maxLength={CONTENT_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('f1.placeholder')}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {tooShort ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" /> {t('cn.baConMoTa')}
          </span>
        ) : (
          <span className="text-slate-400">{t('f1.noSpelling')}</span>
        )}
        <span className="text-slate-400">{value.length}/{CONTENT_MAX_LENGTH} {t('cn.kyTu')}</span>
      </div>

      {/* 🎤 Nhập bằng GIỌNG NÓI — cho bà con lớn tuổi, ngại gõ phím.
          Nói xong, chữ tự nối vào cuối nội dung đang có. */}
      <VoiceInput className="mt-3" onText={(t) => onChange((value ? value.trimEnd() + ' ' : '') + t)} />

      {/* Đính kèm ảnh minh chứng */}
      <div className="mt-5">
        <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('f1.images')} <span className="font-normal text-slate-400">({MAX_FEEDBACK_IMAGES} {t('f1.maxImages')})</span>
        </p>
        {/* NÓI RÕ VIỆC XOÁ DẤU VẾT ẢNH.

            Ảnh chụp bằng điện thoại thường kèm sẵn toạ độ GPS nơi chụp, giờ
            chụp và tên máy. Với ảnh tố giác, toạ độ đó có thể là nhà riêng của
            chính người báo — lộ ra là nguy hiểm thật.

            Hệ thống vẽ lại ảnh qua canvas rồi xuất tệp mới nên mọi thông tin đó
            bị xoá sạch. Trước đây làm âm thầm; nay nói ra để bà con yên tâm gửi
            ảnh, vì sợ lộ mà không dám gửi thì mất chứng cứ quan trọng. */}
        {/* Giữ MỘT dòng ngắn: bà con cần biết ảnh được xoá vị trí để yên tâm
            gửi, nhưng đoạn dài ba dòng trước đây làm rối mắt người lớn tuổi. */}
        <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {t('f1.imagesGps')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {images.map((src, idx) => (
            <div key={idx} className="relative">
              <img
                src={src}
                alt={`Ảnh minh chứng ${idx + 1}`}
                className="h-20 w-20 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                aria-label={`Xoá ảnh ${idx + 1}`}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow transition hover:bg-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {images.length < MAX_FEEDBACK_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-primary-400 hover:text-primary-500 disabled:opacity-60 dark:border-slate-600"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-[10px] font-medium">{processing ? 'Đang kiểm tra...' : 'Thêm ảnh'}</span>
            </button>
          )}
          {/* NÚT CHỤP ẢNH TẠI CHỖ — mở thẳng camera trên điện thoại.

              Vì sao tách riêng: người lớn tuổi không quen khái niệm "chọn tệp
              từ thư viện". Nút này ghi thẳng "Chụp ảnh" và thuộc tính capture
              mở luôn camera sau, bỏ qua bước chọn từ thư viện. Nút "Thêm ảnh"
              bên cạnh vẫn giữ cho ai muốn chọn ảnh đã có.

              Trên máy tính không có camera thì capture bị bỏ qua, nút hoạt động
              như chọn tệp bình thường — không hỏng. */}
          {!processing && (
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
                data-hd="nut-chup-anh"
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary-300 text-primary-500 transition hover:border-primary-500 hover:bg-primary-50 dark:border-primary-700 dark:hover:bg-primary-900/20"
            >
              <Camera className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{t('f1.camera')}</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickImages}
            className="hidden"
            aria-hidden
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePickImages}
            className="hidden"
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">{t('cn.hoTroJpg').replace('{mb}', String(MAX_FILE_MB))}</p>
      </div>

      {/* ================= TÀI LIỆU ĐÍNH KÈM ================= */}
      {onTaiLieuChange && (
        <div className="mt-5">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Tài liệu đính kèm{' '}
            <span className="font-normal text-slate-400">
              (PDF hoặc Word, tối đa {MAX_SO_TAI_LIEU} tệp, không bắt buộc)
            </span>
          </p>
          {/* Nói rõ tài liệu dùng làm gì — bà con khiếu nại thường không nghĩ
              tới việc gửi kèm giấy tờ, cứ chụp ảnh từng trang. */}
          <p className="mb-2 flex items-start gap-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
            <FileText className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Có đơn đã nộp, quyết định, biên bản thì gửi kèm ở đây, rõ hơn chụp ảnh nhiều.
              Tệp được kiểm an toàn trước khi nhận.
            </span>
          </p>

          {taiLieu.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {taiLieu.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary-600" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {t.ten}
                  </span>
                  <button
                    type="button"
                    onClick={() => onTaiLieuChange(taiLieu.filter((_, k) => k !== i))}
                    aria-label={`Bỏ tệp ${t.ten}`}
                    className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {taiLieu.length < MAX_SO_TAI_LIEU && (
            <button
              type="button"
              onClick={() => taiLieuRef.current?.click()}
              disabled={dangDocTL}
              data-hd="nut-tai-lieu"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-primary-400 hover:text-primary-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
            >
              {dangDocTL ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
              {dangDocTL ? 'Đang đọc tệp...' : 'Chọn tệp PDF hoặc Word'}
            </button>
          )}

          <input
            ref={taiLieuRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={chonTaiLieu}
            className="hidden"
            aria-hidden
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Tối đa {MAX_TAI_LIEU_MB}MB mỗi tệp. Không nhận tệp Word có macro vì có thể chứa mã độc.
          </p>
        </div>
      )}

      {/* ================= VỊ TRÍ VỤ VIỆC ================= */}
      {onViTriChange && (
        <div className="mt-5">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('f1.location')} <span className="font-normal text-slate-400">({t('common.notRequired')})</span>
          </p>
          <NutGuiViTri viTri={viTri} onChange={onViTriChange} />
        </div>
      )}

      {/* Mức độ khẩn cấp — người dân tự đánh dấu, cán bộ ưu tiên việc gấp */}
      {onUrgencyChange && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('cn.mucDoKhanCap')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mức độ khẩn cấp">
            {[
              { id: 'normal', khoaL: 'u.normal' as const, khoaD: 'u.normalD' as const, ring: 'has-[:checked]:border-slate-400 has-[:checked]:bg-slate-50 dark:has-[:checked]:bg-slate-800' },
              { id: 'important', khoaL: 'u.important' as const, khoaD: 'u.importantD' as const, ring: 'has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-900/20' },
              { id: 'urgent', khoaL: 'u.urgent' as const, khoaD: 'u.urgentD' as const, ring: 'has-[:checked]:border-red-400 has-[:checked]:bg-red-50 dark:has-[:checked]:bg-red-900/20' },
            ].map((o) => (
              <label
                key={o.id}
                className={`flex min-h-[56px] cursor-pointer items-center gap-2.5 rounded-xl border-2 border-slate-200 bg-white p-3 transition dark:border-slate-700 dark:bg-slate-800/60 ${o.ring}`}
              >
                <input
                  type="radio"
                  name="urgency"
                  checked={urgency === o.id}
                  onChange={() => onUrgencyChange(o.id as 'normal' | 'important' | 'urgent')}
                  className="h-4 w-4 shrink-0 accent-primary-600"
                />
                <span>
                  <span className="block text-sm font-bold leading-tight text-slate-700 dark:text-slate-200">{t(o.khoaL)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t(o.khoaD)}</span>
                </span>
              </label>
            ))}
          </div>
          {/* ⚠️ LỖI BỐ CỤC ĐÃ SỬA:
              Khối này trước dùng "flex" ngay trên thẻ chữ, nên MỌI phần tử con
              — biểu tượng, đoạn chữ, số 113, đoạn đuôi — bị xếp thành các CỘT
              riêng. Kết quả: số 113 nhảy sang giữa dòng, câu văn đứt làm hai
              mảng rời nhau, đọc không ra.

              Cách đúng: chỉ dùng flex cho lớp bọc NGOÀI (biểu tượng + khối
              chữ), còn câu văn để nguyên trong một thẻ chữ để tự xuống dòng
              liền mạch. */}
          {urgency === 'urgent' && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">
                Nếu đang có nguy hiểm cần lực lượng đến ngay, bà con hãy gọi ngay số{' '}
                <b className="whitespace-nowrap">113</b>{t('cn.hoacBamNutSos')}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={value.trim().length < MIN_LENGTH || processing}>
          {t('cn.tiepTucHeThong')}
        </Button>
      </div>
    </div>
  );
}
