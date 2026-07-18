/**
 * Bước 1: Nhập nội dung ý kiến + đính kèm ảnh minh chứng (tối đa 3 tấm, không bắt buộc).
 * Ảnh được nén ngay trên trình duyệt trước khi lưu.
 */
import { ChangeEvent, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, Loader2, X, RotateCcw} from 'lucide-react';
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
  onNext: () => void;
}

const MIN_LENGTH = 10;
const MAX_FILE_MB = 8;

export default function ContentInput({ value, onChange, urgency = 'normal', onUrgencyChange, draftRestored, onDismissDraft, images, onImagesChange, onNext }: ContentInputProps) {
  const tooShort = value.trim().length > 0 && value.trim().length < MIN_LENGTH;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

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
              Đã khôi phục nội dung bà con gõ dở lần trước
            </p>
            <button
              type="button"
              onClick={onDismissDraft}
              className="mt-0.5 text-xs text-primary-600 underline hover:text-primary-800 dark:text-primary-400"
            >
              Xoá và bắt đầu lại
            </button>
          </div>
        </div>
      )}

      <label htmlFor="content" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Nội dung ý kiến của bà con
      </label>
      <textarea
        id="content"
        rows={6}
        maxLength={CONTENT_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Bà con cứ chia sẻ tự nhiên, không cần đúng chính tả hay dấu câu — AI sẽ tự hiểu. Ví dụ: co nguoi danh nhau gan ben pha tan chau..."
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {tooShort ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" /> Bà con mô tả rõ hơn một chút để AI hiểu đúng nhé
          </span>
        ) : (
          <span className="text-slate-400">Không bắt buộc đúng chính tả, dấu câu</span>
        )}
        <span className="text-slate-400">{value.length}/{CONTENT_MAX_LENGTH} ký tự</span>
      </div>

      {/* 🎤 Nhập bằng GIỌNG NÓI — cho bà con lớn tuổi, ngại gõ phím.
          Nói xong, chữ tự nối vào cuối nội dung đang có. */}
      <VoiceInput className="mt-3" onText={(t) => onChange((value ? value.trimEnd() + ' ' : '') + t)} />

      {/* Đính kèm ảnh minh chứng */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Ảnh minh chứng <span className="font-normal text-slate-400">(tối đa {MAX_FEEDBACK_IMAGES} ảnh, không bắt buộc)</span>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickImages}
            className="hidden"
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Hỗ trợ JPG, PNG, WebP... tối đa {MAX_FILE_MB}MB/ảnh. Mỗi ảnh được kiểm tra định dạng thật, tái mã hoá loại bỏ mã độc ẩn và kiểm duyệt nội dung nhạy cảm.</p>
      </div>

      {/* Mức độ khẩn cấp — người dân tự đánh dấu, cán bộ ưu tiên việc gấp */}
      {onUrgencyChange && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Mức độ khẩn cấp
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mức độ khẩn cấp">
            {[
              { id: 'normal', label: 'Bình thường', desc: 'Việc không gấp', ring: 'has-[:checked]:border-slate-400 has-[:checked]:bg-slate-50 dark:has-[:checked]:bg-slate-800' },
              { id: 'important', label: 'Quan trọng', desc: 'Cần sớm quan tâm', ring: 'has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-900/20' },
              { id: 'urgent', label: 'Khẩn cấp', desc: 'Cần xử lý ngay', ring: 'has-[:checked]:border-red-400 has-[:checked]:bg-red-50 dark:has-[:checked]:bg-red-900/20' },
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
                  <span className="block text-sm font-bold leading-tight text-slate-700 dark:text-slate-200">{o.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {urgency === 'urgent' && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Nếu đang có nguy hiểm cần lực lượng đến ngay, bà con hãy gọi ngay số <b>113</b>, hoặc bấm nút SOS đỏ ở góc dưới màn hình.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={value.trim().length < MIN_LENGTH || processing}>
          Tiếp tục — AI phân tích
        </Button>
      </div>
    </div>
  );
}
