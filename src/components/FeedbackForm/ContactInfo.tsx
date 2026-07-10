/**
 * Bước 4: Thông tin liên hệ — HỌ TÊN và SỐ ĐIỆN THOẠI bắt buộc, EMAIL tuỳ chọn.
 * Lỗi chỉ hiển thị khi người dùng đã nhập sai hoặc bấm Tiếp tục mà còn thiếu.
 */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ContactInfo as ContactInfoType } from '../../types/feedback';
import Input from '../common/Input';
import Button from '../common/Button';
import { getPhoneError, isValidEmail, isValidPhone } from '../../utils/helpers';

interface ContactInfoProps {
  value: ContactInfoType;
  onChange: (v: ContactInfoType) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ContactInfo({ value, onChange, onNext, onBack }: ContactInfoProps) {
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

  const handleNext = () => {
    if (nameValid && phoneValid && emailValid) {
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
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
        Thông tin liên hệ được bảo mật tuyệt đối và chỉ dùng để phản hồi kết quả xử lý ý kiến.
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
