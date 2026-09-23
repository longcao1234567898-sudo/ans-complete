/**
 * Bước 4: Thông tin liên hệ — HỌ TÊN và SỐ ĐIỆN THOẠI bắt buộc, EMAIL tuỳ chọn.
 * Lỗi chỉ hiển thị khi người dùng đã nhập sai hoặc bấm Tiếp tục mà còn thiếu.
 */
import { useEffect, useState } from 'react';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, MailCheck, Send, Loader2, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import type { ContactInfo as ContactInfoType } from '../../types/feedback';
import Input from '../common/Input';
import Button from '../common/Button';
import { BAT_XAC_THUC_EMAIL } from '../../utils/constants';
import { getPhoneError, isValidEmail, isValidPhone } from '../../utils/helpers';
import Turnstile, { captchaEnabled } from '../common/Turnstile';
import { fetchWards, sendOtp, verifyOtp, requestAnonCode, verifyAnonCode } from '../../services/feedbackService';

interface ContactInfoProps {
  value: ContactInfoType;
  onChange: (v: ContactInfoType) => void;
  onNext: () => void;
  onBack: () => void;
  /** Nhảy về bước 1 (nhập nội dung) — GIỮ NGUYÊN dữ liệu đã nhập */
  onVeBuocDau?: () => void;
  /** Nhóm xử lý đã chọn — ẩn danh CHỈ áp dụng cho Tố giác tội phạm */
  category?: string | null;
  /** V10: tên điểm QR đã quét (nếu có) — hiện chú thích cạnh ô chọn địa bàn */
  qrPointName?: string | null;
  /** Nội dung ý kiến (từ bước 1) — để cảnh báo nếu ẩn danh mà tự ghi tên/SĐT */
  noiDung?: string;
}

export default function ContactInfo({ value, onChange, onNext, onBack, onVeBuocDau, category, qrPointName, noiDung }: ContactInfoProps) {
  const { t } = useNgonNgu();
  // V2: danh sách địa bàn (phục vụ bản đồ điểm nóng)
  const { data: wards } = useQuery({ queryKey: ['wards'], queryFn: fetchWards });

  // Chỉ hiện lỗi "còn thiếu" sau khi người dùng đã bấm Tiếp tục
  const [attempted, setAttempted] = useState(false);

  const nameValid = value.fullName.trim().length >= 2;
  const phoneValid = isValidPhone(value.phone);
  const emailValid = isValidEmail(value.email.trim());   // V3: email BẮT BUỘC (để nhận mã OTP)

  // ===== V3: XÁC THỰC OTP QUA EMAIL =====
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [devCode, setDevCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const otpVerified = Boolean(value.otpToken);

  // Đếm ngược 60 giây để gửi lại mã
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSendOtp() {
    if (!emailValid) { setOtpErr('Vui lòng nhập email đúng định dạng trước.'); return; }
    setOtpSending(true); setOtpErr(''); setOtpMsg(''); setDevCode('');
    try {
      const r = await sendOtp(value.email.trim());
      setOtpSent(true);
      setOtpMsg(r.message);
      setCooldown(60);
      if (r.devCode) setDevCode(r.devCode);
    } catch (e) {
      setOtpErr(e instanceof Error ? e.message : 'Không gửi được mã. Vui lòng thử lại.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (!/^\d{6}$/.test(otpCode)) { setOtpErr('Mã xác thực gồm 6 chữ số.'); return; }
    setOtpVerifying(true); setOtpErr(''); setOtpMsg('');
    try {
      const r = await verifyOtp(value.email.trim(), otpCode);
      onChange({ ...value, otpToken: r.otpToken });
      setOtpMsg(r.message);
    } catch (e) {
      setOtpErr(e instanceof Error ? e.message : 'Mã không đúng.');
    } finally {
      setOtpVerifying(false);
    }
  }

  /** Đổi email -> huỷ xác thực cũ, phải xác thực lại */
  function handleEmailChange(newEmail: string) {
    onChange({ ...value, email: newEmail, otpToken: undefined });
    setOtpSent(false); setOtpCode(''); setOtpMsg(''); setOtpErr(''); setDevCode('');
  }

  const nameError = attempted && !nameValid ? 'Vui lòng nhập họ và tên' : '';
  const phoneError =
    attempted && !value.phone.trim()
      ? 'Vui lòng nhập số điện thoại'
      : value.phone.trim() && !phoneValid
        ? getPhoneError(value.phone)
        : '';
  const emailError = attempted && !value.email.trim()
    ? 'Vui lòng nhập email để nhận mã xác thực'
    : value.email.trim() && !emailValid
      ? 'Email không đúng định dạng'
      : '';

  const captchaOk = !captchaEnabled || Boolean(value.captchaToken);

  // ẨN DANH chỉ dành cho TỐ GIÁC TỘI PHẠM — nơi nỗi sợ bị trả thù là có thật.
  // Các nhóm khác (khiếu nại, phản ánh, đề xuất) cần danh tính để cán bộ phản hồi.
  const canBeAnonymous = category === 'to_giac';
  const anon = canBeAnonymous && value.isAnonymous === true;

  /* CẢNH BÁO TỰ LỘ DANH TÍNH.
     Bà con chưa rành hay chọn ẩn danh nhưng lại viết thẳng tên, số điện thoại
     vào lời kể ("Tôi là Nguyễn Văn Ba, số 09..."). Làm vậy là vô hiệu hoá luôn
     việc ẩn danh mà không biết — người xử lý vẫn đọc được tên trong nội dung.
     Chỉ NHẮC, không chặn: bà con có quyền tự quyết, ta chỉ giúp họ khỏi sai
     lầm vô ý. */
  const dauHieuLoDanhTinh = (() => {
    if (!anon || !noiDung) return null;
    const text = noiDung;
    const canhBao: string[] = [];
    /* Số điện thoại: chuỗi 9-11 chữ số, có thể có dấu cách/chấm giữa. */
    if (/(0|\+84)[\s.]?\d[\d\s.]{7,11}\d/.test(text)) canhBao.push('số điện thoại');
    /* Tự xưng tên: "tôi tên", "tôi là", "tên tôi", "họ tên" theo sau là chữ hoa. */
    if (/\b(tôi (tên|là)|tên (tôi|là)|họ (và )?tên)\b/iu.test(text)) canhBao.push('tên của mình');
    /* Địa chỉ nhà cụ thể: "số nhà", "địa chỉ", "nhà tôi ở". */
    if (/\b(số nhà|địa chỉ (nhà|của tôi)|nhà tôi ở)\b/iu.test(text)) canhBao.push('địa chỉ nhà');
    return canhBao.length ? canhBao : null;
  })();

  // Người dùng quay lại đổi sang nhóm khác -> tự TẮT ẩn danh (chỉ tố giác mới được ẩn danh)
  useEffect(() => {
    if (!canBeAnonymous && value.isAnonymous) {
      onChange({ ...value, isAnonymous: false, otpToken: undefined });
    }
  }, [canBeAnonymous]);   // eslint-disable-line react-hooks/exhaustive-deps


  // ===== MÃ XÁC THỰC ẨN DANH (hiện trên màn hình, không qua email) =====
  const [anonCode, setAnonCode] = useState('');       // mã máy chủ cấp
  const [anonId, setAnonId] = useState('');           // mã phiên, gửi kèm khi xác nhận
  const [anonInput, setAnonInput] = useState('');     // bà con gõ lại
  const [anonBusy, setAnonBusy] = useState(false);
  const [anonErr, setAnonErr] = useState('');

  async function handleGetAnonCode() {
    setAnonBusy(true); setAnonErr('');
    try {
      /* Gửi kèm mã phiên cũ để máy chủ huỷ đúng mã của mình, thay vì huỷ
         theo IP (sẽ huỷ nhầm mã của người khác dùng chung IP nhà mạng). */
      const r = await requestAnonCode(anonId || undefined);
      setAnonCode(r.code);
      setAnonId(r.anonId);
      setAnonInput('');
    } catch (e) {
      setAnonErr(e instanceof Error ? e.message : 'Không lấy được mã.');
    } finally {
      setAnonBusy(false);
    }
  }

  async function handleVerifyAnonCode() {
    if (!/^\d{6}$/.test(anonInput)) { setAnonErr('Mã gồm 6 chữ số.'); return; }
    setAnonBusy(true); setAnonErr('');
    try {
      const r = await verifyAnonCode(anonInput, anonId);
      /* Giữ lại mã phiên trong bản nháp: lúc bấm Gửi, máy chủ cần nó để đối
         chiếu "vé" xác thực. */
      onChange({ ...value, otpToken: r.otpToken, anonId });
    } catch (e) {
      setAnonErr(e instanceof Error ? e.message : 'Mã không đúng.');
    } finally {
      setAnonBusy(false);
    }
  }

  function toggleAnonymous(on: boolean) {
    if (on) {
      // Bật ẩn danh: xoá sạch danh tính đã nhập + huỷ OTP
      onChange({ fullName: '', phone: '', email: '', wardId: value.wardId, captchaToken: value.captchaToken, isAnonymous: true, otpToken: undefined });
      setOtpSent(false); setOtpCode(''); setOtpMsg(''); setOtpErr(''); setDevCode('');
      setAnonCode(''); setAnonInput(''); setAnonErr('');
    } else {
      onChange({ ...value, isAnonymous: false, otpToken: undefined });
      setAnonCode(''); setAnonInput(''); setAnonErr('');
    }
  }

  /* ------------------------------------------------------------------------
     LIỆT KÊ ĐÍCH DANH THỨ CÒN THIẾU

     Trước đây bấm gửi mà thiếu thì chỉ bật cờ "đã thử", các ô lỗi hiện chữ đỏ
     rải rác. Bà con gửi ẩn danh chỉ thấy báo chưa đủ thông tin mà không rõ
     thiếu ở đâu — phải cuộn lên dò từng ô, rất phiền.
     ------------------------------------------------------------------------ */
  const conThieu: string[] = [];
  if (anon) {
    /* Gửi ẩn danh KHÔNG còn đòi mã xác thực — xem chú thích chỗ đã bỏ khối đó.
       Ẩn danh nghĩa là không cần khai gì, nên không có ô nào bắt buộc. */
  } else {
    if (!nameValid) conThieu.push('Họ và tên chưa hợp lệ');
    if (!phoneValid) conThieu.push('Số điện thoại chưa hợp lệ');
    /* Tắt xác thực email thì email thành KHÔNG BẮT BUỘC — bỏ trống cũng được.
       Có nhập thì vẫn kiểm tra dạng, tránh gõ sai mà không ai biết. */
    if (BAT_XAC_THUC_EMAIL) {
      if (!emailValid) conThieu.push('Email chưa hợp lệ');
    } else if (value.email.trim() && !emailValid) {
      conThieu.push('Email nhập chưa đúng dạng (hoặc bỏ trống cũng được)');
    }
  }
  if (!captchaOk) conThieu.push('Chưa qua bước xác minh "Tôi không phải là người máy"');

  const handleNext = () => {
    if (conThieu.length === 0) {
      onNext();
    } else {
      setAttempted(true);
    }
  };

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">{t('ci.thongTinLienHe')}</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {t('ci.hoTenVaSo2')} <span className="font-semibold text-slate-600 dark:text-slate-300">{t('ci.batBuoc')}</span> {t('ci.deCanBoXac')}
      </p>

      {/* V4: CÔNG TẮC GỬI ẨN DANH — CHỈ hiện với nhóm Tố giác tội phạm */}
      {canBeAnonymous && (
      <button
        type="button"
        onClick={() => toggleAnonymous(!anon)}
        data-hd="o-an-danh"
        className={`mb-4 flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
          anon
            ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
            : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-700 dark:bg-slate-800/50'
        }`}
      >
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
          anon ? 'border-primary-600 bg-primary-600' : 'border-slate-300 dark:border-slate-600'
        }`}>
          {anon && (
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">
            {t('ci.guiAnDanhKhong')}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t('ci.danhChoBaCon')} <b>{t('ci.maTraCuu')}</b> {t('ci.deTheoDoiKet')}
          </span>
        </span>
      </button>
      )}

      {/* CẢNH BÁO TỰ LỘ DANH TÍNH — chỉ hiện khi chọn ẩn danh mà nội dung có
          vẻ chứa tên/SĐT/địa chỉ. Nhắc, không chặn. */}
      {dauHieuLoDanhTinh && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/15">
          <svg className="mt-0.5 h-6 w-6 shrink-0 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-red-800 dark:text-red-300">
              {t('ci.baConCoMuon')}
            </p>
            <p className="mt-1 text-sm leading-snug text-red-700 dark:text-red-200">
              Trong lời kể của bà con đang có {dauHieuLoDanhTinh.join(', ')}. Bà con chọn
              gửi kín, nhưng cán bộ đọc lời kể vẫn thấy được những thông tin này —
              như vậy là không còn kín nữa.
            </p>
            <p className="mt-1.5 text-sm leading-snug text-red-700 dark:text-red-200">
              {t('ci.neuMuonKinThat')} <b>{t('ci.quayLai')}</b> {t('ci.roiXoaNhungCho')}
            </p>
          </div>
        </div>
      )}

      {anon && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="mb-2 text-xs font-bold text-amber-800 dark:text-amber-300">
            {t('ci.quyDinhKhiGui')}
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            <li>{t('ci.noiDungPhaiChi')} <b>{t('ci.itNhat50Ky')}</b> {t('ci.neuRoThoiGian')}</li>
            <li>{t('ci.tinBaoSeDuoc')} <b>{t('ci.canBoKiemDuyet')}</b> {t('ci.truocKhiDuaVao')}</li>
            <li>{t('ci.moiThietBiChi')} <b>{t('ci.2TinAnDanh')}</b> {t('ci.deChongTinRac')}</li>
            <li>
              {t('ci.neuVuViec')} <b>{t('ci.khanCap')}</b>, bà con hãy gọi ngay{' '}
              <b>113</b>.
            </li>
          </ul>
        </div>
      )}

      {/* ĐÃ BỎ KHỐI MÃ XÁC THỰC ẨN DANH.

          Trước đây bà con gửi ẩn danh phải bấm "Lấy mã xác thực", chờ mã hiện
          ra rồi gõ lại 6 số. Với người lớn tuổi và người vùng sâu, mỗi bước
          thêm là một chỗ bỏ cuộc — mà đây lại là bước KHÔNG bảo vệ được gì:
          mã hiện ngay trên màn hình chính máy đang gửi, ai cũng chép lại được.

          Việc chống người máy đã có Turnstile lo, chống spam đã có khoá thiết
          bị và khoá địa chỉ mạng lo. Thêm một lớp gõ lại số chỉ làm khó bà con
          thật chứ không cản được người phá. */}

      {!anon && (
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
          label={BAT_XAC_THUC_EMAIL ? 'Email (bắt buộc — để nhận mã xác thực)' : 'Email (không bắt buộc)'}
          type="email"
          placeholder="banconhandan@email.com"
          value={value.email}
          error={emailError}
          onChange={(e) => handleEmailChange(e.target.value)}
        />

        {/* V2: Địa bàn xảy ra vụ việc */}
        {wards && wards.length > 0 && (
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('ci.diaBanXayRa')} <span className="font-normal text-slate-500">{t('ci.khongBatBuoc')}</span>
            </label>
            <select
              value={value.wardId ?? ''}
              onChange={(e) => onChange({ ...value, wardId: e.target.value ? Number(e.target.value) : null })}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base sm:text-sm text-slate-800 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">{t('ci.chonPhuongxa')}</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {qrPointName
                ? `Đã tự động chọn theo mã QR quét tại: ${qrPointName}. Bà con có thể đổi lại nếu chưa đúng.`
                : 'Giúp cán bộ nắm được vụ việc xảy ra ở đâu để xử lý nhanh hơn.'}
            </p>
          </div>
        )}
      </div>
      )}

      {/* ===== V3: XÁC THỰC EMAIL BẰNG MÃ OTP (bỏ qua khi ẩn danh) ===== */}
      {/* Khối xác thực email — chỉ hiện khi BAT_XAC_THUC_EMAIL = true.
          Toàn bộ mã bên dưới vẫn giữ nguyên để bật lại sau này. */}
      {!anon && BAT_XAC_THUC_EMAIL && (
      <div className={`mt-5 rounded-2xl border-2 p-4 transition ${
        otpVerified
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/15'
          : 'border-primary-200 bg-primary-50/50 dark:border-slate-700 dark:bg-slate-800/40'
      }`}>
        {otpVerified ? (
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {t('ci.daXacThucEmail')}
              </p>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                {t('ci.baConCo15')}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {t('ci.xacThucEmail')}
                </p>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {t('ci.buocNayGiupCong')}
                </p>
              </div>
            </div>

            {!otpSent ? (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpSending || !emailValid}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {otpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {otpSending ? 'Đang gửi mã...' : 'Gửi mã xác thực đến email'}
              </button>
            ) : (
              <div className="space-y-3">
                {/* Ô vàng chỉ xuất hiện khi MÁY CHỦ chưa cấu hình email (chạy thử ở máy cá nhân).
                    Trên bản chạy thật đã có Brevo -> mã LUÔN gửi vào hộp thư, không bao giờ
                    hiện ra màn hình. Nếu hiện, ai cũng xác thực được email của người khác. */}
                {devCode && (
                  <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-center dark:bg-amber-900/20">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {t('ci.mayChuChuaCau')}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-extrabold tracking-[0.3em] text-amber-700 dark:text-amber-300">
                      {devCode}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={otpVerifying || otpCode.length !== 6}
                    className="shrink-0 rounded-xl bg-primary-600 px-5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
                  >
                    {otpVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xác nhận'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={cooldown > 0 || otpSending}
                  className="w-full text-xs font-semibold text-primary-600 transition hover:underline disabled:text-slate-400 disabled:no-underline dark:text-primary-300"
                >
                  {cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : 'Không nhận được mã? Gửi lại'}
                </button>
              </div>
            )}

            {otpMsg && !otpVerified && (
              <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{otpMsg}</p>
            )}
            {otpErr && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{otpErr}</p>
            )}
          </>
        )}
      </div>
      )}

      {attempted && !anon && !otpVerified && (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          {t('ci.vuiLongXacThuc')}
        </p>
      )}

      {/* V2: CAPTCHA chống bot (tự ẩn nếu chưa cấu hình) */}
      <Turnstile onToken={(t) => onChange({ ...value, captchaToken: t })} />
      {attempted && !captchaOk && (
        <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {t('ci.vuiLongHoanTat')}
        </p>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
        {t('ci.hoTenVaSo')}
      </div>

      {/* ==================================================================
          BẢNG NÊU RÕ CÒN THIẾU GÌ + LỐI THOÁT

          Chỉ hiện sau khi bà con đã bấm gửi một lần — không doạ người mới vào.

          Có nút "Làm lại từ đầu" ngay tại đây: bà con gửi ẩn danh mà kẹt ở
          bước này thì lối ra gần nhất là bắt đầu lại, chứ bấm "Quay lại" bốn
          lần vừa lâu vừa dễ nản. Đặt sát chỗ báo lỗi, không bắt đi tìm.
          ================================================================== */}
      {attempted && conThieu.length > 0 && (
        <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Còn thiếu {conThieu.length} mục
          </p>
          <ul className="mb-3 space-y-1">
            {conThieu.map((t) => (
              <li key={t} className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-300">
                <span className="font-bold">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ==================================================================
          HÀNG NÚT CUỐI

          Nút "Về bước nhập nội dung" LUÔN HIỆN, không đợi tới lúc báo lỗi.
          Bản trước chỉ hiện sau khi bấm gửi mà còn thiếu — nên bà con muốn
          quay lại sửa nội dung thì không thấy nút đâu, phải bấm "Quay lại"
          ba lần.

          KHÔNG xoá gì cả: nhảy về bước 1, giữ nguyên mọi thứ đã nhập, sửa
          xong bấm tiếp là về lại đây.
          ================================================================== */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            {t('ci.quayLai')}
          </Button>
          {onVeBuocDau && (
            <button
              type="button"
              onClick={onVeBuocDau}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('ci.veBuocNhapNoi')}
            </button>
          )}
        </div>
        <Button onClick={handleNext}>{t('ci.tiepTucXacNhan')}</Button>
      </div>
    </div>
  );
}
