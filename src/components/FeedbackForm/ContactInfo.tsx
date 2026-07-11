/**
 * Bước 4: Thông tin liên hệ — HỌ TÊN và SỐ ĐIỆN THOẠI bắt buộc, EMAIL tuỳ chọn.
 * Lỗi chỉ hiển thị khi người dùng đã nhập sai hoặc bấm Tiếp tục mà còn thiếu.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import type { ContactInfo as ContactInfoType } from '../../types/feedback';
import Input from '../common/Input';
import Button from '../common/Button';
import { getPhoneError, isValidEmail, isValidPhone } from '../../utils/helpers';
import Turnstile, { captchaEnabled } from '../common/Turnstile';
import { fetchWards } from '../../services/feedbackService';

interface ContactInfoProps {
  value: ContactInfoType;
  onChange: (v: ContactInfoType) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ContactInfo({ value, onChange, onNext, onBack }: ContactInfoProps) {
  // V2: danh sách địa bàn (phục vụ bản đồ điểm nóng)
  const { data: wards } = useQuery({ queryKey: ['wards'], queryFn: fetchWards });

  // Chỉ hiện lỗi "còn thiếu" sau khi người dùng đã bấm Tiếp tục
  const [attempted, setAttempted] = useState(false);

  const nameValid = value.fullName.trim().length >= 2;
  const phoneValid = isValidPhone(value.phone);
  const emailValid = !value.email.trim() || isValidEmail(value.email);

  const nameError = attempted && !nameValid ? 'Vui lòng nhập họ và tên' : '';
  const phoneError =
    attempted && !value.phone.trim()
      ? 'Vui lòng nhập số điện thoại'
      : value.phone.trim() && !phoneValid
        ? getPhoneError(value.phone)
        : '';
  const emailError = value.email.trim() && !emailValid ? 'Email không đúng định dạng' : '';

  const captchaOk = !captchaEnabled || Boolean(value.captchaToken);

  const handleNext = () => {
    if (nameValid && phoneValid && emailValid && captchaOk) {
      onNext();
    } else {
      setAttempted(true);
    }
  };

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">Thông tin liên hệ</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Họ tên và số điện thoại là <span className="font-semibold text-slate-600 dark:text-slate-300">bắt buộc</span> để
        cán bộ xác minh và phản hồi kết quả; email là tuỳ chọn.
      </p>

      <div className="space-y-4">
        <Input
          label="Họ và tên *"
          placeholder="Nguyễn Văn A"
          value={value.fullName}
          error={nameError}
          onChange={(e) => onChange({ ...value, fullName: e.target.value })}
        />
        <Input
          label="Số điện thoại *"
          placeholder="09xxxxxxxx"
          inputMode="tel"
          value={value.phone}
          error={phoneError}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
        <Input
          label="Email (không bắt buộc)"
          type="email"
          placeholder="banconhandan@email.com"
          value={value.email}
          error={emailError}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />

        {/* V2: Địa bàn xảy ra vụ việc */}
        {wards && wards.length > 0 && (
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Địa bàn xảy ra vụ việc <span className="font-normal text-slate-400">(không bắt buộc)</span>
            </label>
            <select
              value={value.wardId ?? ''}
              onChange={(e) => onChange({ ...value, wardId: e.target.value ? Number(e.target.value) : null })}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— Chọn phường/xã —</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Giúp cán bộ nắm được vụ việc xảy ra ở đâu để xử lý nhanh hơn.
            </p>
          </div>
        )}
      </div>

      {/* V2: CAPTCHA chống bot (tự ẩn nếu chưa cấu hình) */}
      <Turnstile onToken={(t) => onChange({ ...value, captchaToken: t })} />
      {attempted && !captchaOk && (
        <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          Vui lòng hoàn tất bước xác minh "Tôi không phải người máy".
        </p>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
        Họ tên và số điện thoại của bà con được MÃ HOÁ trong hệ thống. Cán bộ chỉ thấy dạng che bớt;
        mọi lượt xem danh tính đầy đủ đều bị ghi vào nhật ký.
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Quay lại
        </Button>
        <Button onClick={handleNext}>Tiếp tục — Xác nhận</Button>
      </div>
    </div>
  );
}
