/**
 * Tải ảnh lên CLOUDINARY (thay vì nhồi base64 vào database).
 *
 * VÌ SAO: mỗi ảnh base64 nặng 200-500KB. 1.000 người gửi ảnh -> database phồng vài GB
 * -> hosting tính tiền, dashboard tải ì ạch, có thể sập.
 * Cloudinary cho 25GB MIỄN PHÍ, database chỉ lưu đường link ngắn (~100 ký tự).
 *
 * CẤU HÌNH (.env ở thư mục gốc):
 *   VITE_CLOUDINARY_CLOUD_NAME=ten-cloud-cua-ban
 *   VITE_CLOUDINARY_PRESET=hop-thu-an-ninh-so
 *
 * CHƯA CẤU HÌNH -> tự động quay về cách cũ (base64), hệ thống vẫn chạy.
 */

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
const PRESET = (import.meta.env.VITE_CLOUDINARY_PRESET || '').trim();

export const cloudinaryEnabled = Boolean(CLOUD_NAME && PRESET);

/** Ảnh đã tải lên Cloudinary */
export interface UploadedImage {
  url: string;
  publicId: string;
}

/** Ảnh gửi lên backend: hoặc link Cloudinary, hoặc chuỗi base64 (cách cũ) */
export type SubmissionImage = UploadedImage | string;

/**
 * Tải 1 ảnh (dạng data URL base64) lên Cloudinary.
 * Trả về { url, publicId } — chỉ vài chục ký tự, nhẹ hơn base64 hàng nghìn lần.
 */
export async function uploadToCloudinary(dataUrl: string): Promise<UploadedImage> {
  if (!cloudinaryEnabled) {
    throw new Error('Chưa cấu hình Cloudinary');
  }

  const form = new FormData();
  form.append('file', dataUrl);
  form.append('upload_preset', PRESET);
  form.append('folder', 'hop-thu-an-ninh-so');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Tải ảnh lên thất bại');
  }

  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

/**
 * Chuẩn bị danh sách ảnh để gửi lên backend.
 * - Có Cloudinary -> tải lên, trả link (NHẸ)
 * - Chưa cấu hình -> giữ nguyên base64 (NẶNG, nhưng vẫn chạy)
 * - Tải lên lỗi   -> tự động quay về base64 cho ảnh đó, không chặn người dân gửi ý kiến
 */
export async function prepareImages(dataUrls: string[]): Promise<SubmissionImage[]> {
  if (!cloudinaryEnabled || dataUrls.length === 0) return dataUrls;

  const results = await Promise.all(
    dataUrls.map(async (dataUrl) => {
      try {
        return await uploadToCloudinary(dataUrl);
      } catch (e) {
        console.warn('Tải ảnh lên Cloudinary lỗi, dùng tạm base64:', e);
        return dataUrl; // không chặn người dân gửi ý kiến
      }
    })
  );

  return results;
}

/* ============================================================================
   TẢI VIDEO LÊN CLOUDINARY
   ============================================================================

   VÌ SAO PHẢI QUA CLOUDINARY, KHÔNG NHỒI VÀO DATABASE:

   Một video 20MB khi mã hoá base64 phình lên khoảng 27MB. Nhồi thẳng vào MySQL
   thì vài chục video là đầy gói database — mà đó là nơi chứa TOÀN BỘ ý kiến của
   bà con, đầy database nghĩa là không ai gửi được tin nữa. Đổi một chỗ chứa
   video lấy cả hệ thống là không đáng.

   Qua Cloudinary thì database chỉ giữ một đường dẫn vài chục ký tự. Nhờ vậy
   giới hạn video nâng được lên đáng kể mà không đụng tới dung lượng database.

   Cloudinary dùng điểm cuối /video/upload riêng, khác /image/upload của ảnh. */
export async function uploadVideoToCloudinary(dataUrl: string): Promise<UploadedImage> {
  if (!cloudinaryEnabled) {
    throw new Error('Chưa cấu hình Cloudinary');
  }

  const form = new FormData();
  form.append('file', dataUrl);
  form.append('upload_preset', PRESET);
  form.append('folder', 'hop-thu-an-ninh-so/video');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Tải video lên thất bại');
  }

  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

/**
 * Chuẩn bị video để gửi lên máy chủ.
 *
 * Có Cloudinary  -> tải lên, trả về đường dẫn (nhẹ, không tốn database)
 * Chưa cấu hình  -> giữ nguyên base64 và để máy chủ tự giới hạn kích thước
 * Tải lên lỗi    -> quay về base64, KHÔNG chặn bà con gửi ý kiến
 *
 * Nguyên tắc xuyên suốt: hỏng khâu phụ thì bỏ khâu phụ, không làm hỏng việc
 * chính là nhận tin của bà con.
 */
export async function prepareVideo(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  if (!cloudinaryEnabled) return dataUrl;
  try {
    const { url } = await uploadVideoToCloudinary(dataUrl);
    return url;
  } catch (e) {
    console.warn('Không tải được video lên kho ảnh, gửi thẳng:', e);
    return dataUrl;
  }
}
