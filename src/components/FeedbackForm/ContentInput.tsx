/**
 * Bước 1: Nhập nội dung ý kiến + đính kèm ảnh minh chứng (tối đa 3 tấm, không bắt buộc).
 * Ảnh được nén ngay trên trình duyệt trước khi lưu.
 */
import { ChangeEvent, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, Loader2, X, RotateCcw, ListChecks, ShieldQuestion, Camera, ShieldCheck, Video } from 'lucide-react';
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
  /** Video minh chứng — tối đa MỘT tệp vì rất nặng */
  video?: string | null;
  onVideoChange?: (v: string | null) => void;
  /** Toạ độ nơi xảy ra vụ việc, người dân tự nguyện gửi */
  viTri?: { lat: number; lng: number; doChinhXacMet?: number } | null;
  onViTriChange?: (v: { lat: number; lng: number; doChinhXacMet?: number } | null) => void;
  onNext: () => void;
}

/* GIỚI HẠN VIDEO — 50MB, cỡ 3 tới 5 phút quay ở chất lượng vừa.

   Con số này chọn theo THỜI GIAN TẢI trên sóng yếu, không theo dung lượng lưu
   trữ. Video đi thẳng lên kho ảnh nên không tốn dung lượng database, nhưng bà
   con vùng sâu vẫn phải chờ tải:

       50MB  ->  3G yếu: khoảng 22 phút | 3G tốt: 7 phút | 4G: dưới 1 phút
      100MB  ->  3G yếu: khoảng 44 phút | 3G tốt: 13 phút

   Trên 50MB thì người dùng 3G gần như chắc chắn bỏ cuộc giữa chừng, hoặc mạng
   rớt làm mất hết công. Nới rộng hơn nữa chỉ có lợi cho người dùng wifi, mà
   đó không phải nhóm người hệ thống này hướng tới.

   Video KHÔNG nén được phía trình duyệt như ảnh (nén video cần giải mã rồi mã
   hoá lại, quá nặng cho điện thoại), nên đây là kích thước thật của tệp. */
const MAX_VIDEO_MB = 50;

const MIN_LENGTH = 10;
/* GIỚI HẠN KÍCH THƯỚC TỆP TRƯỚC KHI NÉN.

   ⚠️ Trước đây đặt 8MB và chặn NGAY khi chọn tệp — sai, vì điện thoại đời mới
   chụp ra ảnh 8 tới 15MB là bình thường. Bà con chụp ảnh hiện trường bằng máy
   tốt lại bị từ chối "vượt quá 8MB", trong khi ảnh đó nén xong chỉ còn khoảng
   150KB. Đúng nhóm người cần gửi ảnh nhất lại bị chặn.

   Nay nâng lên 25MB. Con số này KHÔNG phải giới hạn chất lượng — nó chỉ để
   chặn tệp lớn bất thường làm treo trình duyệt. Mọi ảnh qua được đều được nén
   xuống dưới 300KB ở bước sau. */
const MAX_FILE_MB = 25;

export default function ContentInput({ value, onChange, urgency = 'normal', onUrgencyChange, draftRestored, onDismissDraft, images, onImagesChange, video, onVideoChange, viTri, onViTriChange, onNext }: ContentInputProps) {
  const tooShort = value.trim().length > 0 && value.trim().length < MIN_LENGTH;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoQuayRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [dangDocVideo, setDangDocVideo] = useState(false);

  /* NHẬN VIDEO MINH CHỨNG.

     Khác ảnh, video KHÔNG nén được phía trình duyệt và cũng không xoá được
     thông tin vị trí bên trong tệp. Nên chỉ kiểm tra kích thước rồi đọc thẳng,
     và giao diện nói rõ điều này để bà con tự quyết. */
  const handlePickVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onVideoChange) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Tệp này không phải video.');
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      const mb = (file.size / 1024 / 1024).toFixed(0);
      toast.error(`Video ${mb}MB, vượt quá ${MAX_VIDEO_MB}MB. Bà con quay đoạn ngắn hơn giúp.`, { duration: 6000 });
      return;
    }

    setDangDocVideo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được tệp video'));
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      onVideoChange(dataUrl);
      toast.success('Đã đính kèm video');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không xử lý được video');
    }
    setDangDocVideo(false);
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
          Bà con nên nêu rõ 4 điều sau
        </p>
        <ul className="mb-3 grid gap-1.5 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-2">
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>Thời gian:</b> ngày giờ xảy ra (hoặc &quot;khoảng 8 giờ tối qua&quot;)</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>Địa điểm:</b> càng cụ thể càng tốt — số nhà, ấp/khóm, gần chỗ nào</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>Sự việc:</b> chuyện gì đã xảy ra, diễn biến ra sao</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="font-bold text-primary-600">•</span>
            <span><b>Người liên quan:</b> đặc điểm nhận dạng, biển số xe (nếu biết)</span>
          </li>
        </ul>

        {/* Trấn an người sợ bị trả thù — đây là rào cản tâm lý lớn nhất khiến
            bà con không dám tố giác. Nói rõ ngay tại chỗ nhập, không bắt họ
            tự mò tới bước sau mới biết có tuỳ chọn ẩn danh. */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
            Bà con sợ bị lộ danh tính?
          </p>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            Với <b>tố giác tin báo tội phạm</b>, ở bước điền thông tin bà con có thể bật{' '}
            <b>&quot;Gửi ẩn danh&quot;</b> — không cần họ tên, số điện thoại hay email. Cán bộ
            <b> không thể xem</b> danh tính người gửi ẩn danh.
          </p>
          <p className="mt-1.5 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
            Lưu ý: gửi ẩn danh thì cán bộ <b>không liên hệ lại được</b> để hỏi thêm. Bà con
            hãy viết thật đầy đủ ngay từ bây giờ (tối thiểu 50 chữ), kèm ảnh nếu có.
          </p>
        </div>
      </div>

      <label htmlFor="content" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        Nội dung ý kiến của bà con
      </label>
      <textarea
        id="content"
        rows={6}
        maxLength={CONTENT_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Bà con cứ chia sẻ tự nhiên, không cần đúng chính tả hay dấu câu — hệ thống sẽ tự hiểu. Ví dụ: co nguoi danh nhau gan ben pha tan chau..."
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {tooShort ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" /> Bà con mô tả rõ hơn một chút để hệ thống hiểu đúng nhé
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
        <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Ảnh minh chứng <span className="font-normal text-slate-400">(tối đa {MAX_FEEDBACK_IMAGES} ảnh, không bắt buộc)</span>
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
          Ảnh tự động xoá vị trí GPS trước khi gửi
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
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary-300 text-primary-500 transition hover:border-primary-500 hover:bg-primary-50 dark:border-primary-700 dark:hover:bg-primary-900/20"
            >
              <Camera className="h-5 w-5" />
              <span className="text-[10px] font-semibold">Chụp ảnh</span>
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
        <p className="mt-1.5 text-xs text-slate-400">Hỗ trợ JPG, PNG, WebP... tối đa {MAX_FILE_MB}MB/ảnh. Mỗi ảnh được kiểm tra định dạng thật, tái mã hoá loại bỏ mã độc ẩn và kiểm duyệt nội dung nhạy cảm.</p>
      </div>

      {/* ================= VIDEO MINH CHỨNG ================= */}
      {onVideoChange && (
        <div className="mt-5">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Video minh chứng <span className="font-normal text-slate-400">(1 video, không bắt buộc)</span>
          </p>
          {/* Nói thật về việc video giữ nguyên thông tin bên trong tệp.

              Ảnh thì hệ thống vẽ lại nên xoá sạch được vị trí; video KHÔNG làm
              vậy được vì phải giải mã rồi mã hoá lại, quá nặng cho điện thoại.
              Nói ra để bà con tự quyết, thay vì để họ tưởng video cũng được
              xoá dấu vết như ảnh. */}
          {/* Rút còn một dòng. Vẫn phải nói vì video KHÔNG xoá được vị trí như
              ảnh — bỏ hẳn thì bà con tưởng video cũng an toàn như ảnh. */}
          <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Video giữ nguyên vị trí quay, khác với ảnh
          </p>

          {video ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <video src={video} controls className="h-32 w-auto rounded-lg" />
              <button
                type="button"
                onClick={() => { onVideoChange(null); toast('Đã bỏ video'); }}
                aria-label="Bỏ video"
                className="rounded-lg bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-red-50 hover:text-red-600 dark:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => videoQuayRef.current?.click()}
                disabled={dangDocVideo}
                className="flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary-300 text-primary-500 transition hover:bg-primary-50 disabled:opacity-60 dark:border-primary-700"
              >
                {dangDocVideo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
                <span className="text-[10px] font-semibold">Quay video</span>
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={dangDocVideo}
                className="flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-primary-400 hover:text-primary-500 disabled:opacity-60 dark:border-slate-600"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] font-medium">Chọn video</span>
              </button>
            </div>
          )}

          <input
            ref={videoQuayRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handlePickVideo}
            className="hidden"
            aria-hidden
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handlePickVideo}
            className="hidden"
            aria-hidden
          />
          <p className="mt-1.5 text-xs text-slate-400">Tối đa {MAX_VIDEO_MB}MB, cỡ 3 tới 5 phút quay. Sóng yếu thì video dài sẽ lâu gửi — bà con quay vừa đủ nội dung cần thiết.</p>
        </div>
      )}

      {/* ================= VỊ TRÍ VỤ VIỆC ================= */}
      {onViTriChange && (
        <div className="mt-5">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Vị trí xảy ra vụ việc <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </p>
          <NutGuiViTri viTri={viTri} onChange={onViTriChange} />
        </div>
      )}

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
                <b className="whitespace-nowrap">113</b>, hoặc bấm nút SOS đỏ ở góc dưới màn hình.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={value.trim().length < MIN_LENGTH || processing}>
          Tiếp tục — Hệ thống phân tích
        </Button>
      </div>
    </div>
  );
}
