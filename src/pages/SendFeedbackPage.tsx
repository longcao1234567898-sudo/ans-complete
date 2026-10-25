/**
 * Trang "Gửi ý kiến": wizard 5 bước — nhập nội dung, AI phân tích, chọn nhóm,
 * thông tin liên hệ, xác nhận & nhận mã tra cứu.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ContactInfo as ContactInfoType, FeedbackCategory, FeedbackDraft, FeedbackSubmission } from '../types/feedback';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { readDraft, clearDraft, useDraftAutosave } from '../hooks/useDraftAutosave';
import { saveTrackingCode } from '../hooks/useTrackingHistory';
import { submitFeedback, fetchQrPointInfo, kiemTraBiKhoa, batDauDienDon } from '../services/feedbackService';
import { containsProfanity, sanitizeText, scanTextForThreats } from '../utils/security';
import StepIndicator from '../components/FeedbackForm/StepIndicator';
import { useNgonNgu } from '../i18n/useNgonNgu';
import HuongDanBuoc from '../components/FeedbackForm/HuongDanBuoc';
import ContentInput from '../components/FeedbackForm/ContentInput';
import AIAnalysis from '../components/FeedbackForm/AIAnalysis';
import CategorySelect from '../components/FeedbackForm/CategorySelect';
import ContactInfo from '../components/FeedbackForm/ContactInfo';
import ManHinhBiKhoa from '../components/FeedbackForm/ManHinhBiKhoa';
import KhieuNaiMoKhoa from '../components/FeedbackForm/KhieuNaiMoKhoa';
import XacMinhThem from '../components/FeedbackForm/XacMinhThem';
import TinDaXepHang from '../components/FeedbackForm/TinDaXepHang';
import { layVeMoi } from '../services/congVaoService';
import Confirmation from '../components/FeedbackForm/Confirmation';
import Card from '../components/common/Card';
import { AnimatePresence, motion } from 'framer-motion';
import PageBackground from '../components/common/PageBackground';
import { MapPin } from 'lucide-react';
import { LOI_GUI_THAT_BAI } from '../utils/loiGui';

const EMPTY_CONTACT: ContactInfoType = { fullName: '', phone: '', email: '' };

export default function SendFeedbackPage() {
  const { t } = useNgonNgu();
  const [step, setStep] = useState(1);

  /* CHẾ ĐỘ XEM HƯỚNG DẪN.

     Vòng hướng dẫn cần CHUYỂN THẬT qua từng màn hình để bà con thấy mỗi bước
     trông ra sao — đứng yên ở bước 1 rồi chỉ vào con số trên thanh tiến trình
     thì không hình dung được gì.

     Nhưng nhảy thẳng tới bước 5 là chỗ có nút gửi, nên phải KHOÁ GỬI trong lúc
     xem hướng dẫn. Không khoá thì bà con lỡ bấm là gửi một ý kiến rỗng vào hệ
     thống, cán bộ phải mất công dọn. */
  const [dangHuongDan, setDangHuongDan] = useState(false);

  /* CUỘN VỀ ĐẦU BIỂU MẪU MỖI KHI ĐỔI BƯỚC.

     ⚠️ Lỗi đã xảy ra thật: bước 1 rất dài (ô nhập, ảnh, video, vị trí, mức
     khẩn), bước 2 lại ngắn. Bấm tiếp tục thì trang co lại nhưng vị trí cuộn
     giữ nguyên — rơi thẳng xuống chân trang. Bà con thấy phần liên hệ và mã QR
     trong khi đáng lẽ phải thấy màn hình máy đang phân tích.

     Bỏ qua lần đầu (bước 1) vì lúc đó bà con vừa mở trang, kéo lên đầu là thừa. */
  const buocTruoc = useRef(step);
  useEffect(() => {
    if (buocTruoc.current === step) return;
    buocTruoc.current = step;
    const khu = document.querySelector('[data-khu-bieu-mau]');
    if (khu) khu.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  /* Bản nháp THẬT của bà con, cất tạm trong lúc xem hướng dẫn. */
  const nhapThat = useRef<typeof draft | null>(null);

  useEffect(() => {
    const chuyenBuoc = (e: Event) => {
      const b = Number((e as CustomEvent).detail);
      if (b < 1 || b > 5) return;

      /* ĐIỀN DỮ LIỆU MẪU khi bắt đầu xem hướng dẫn.

         Vì sao bắt buộc: các bước sau chỉ vẽ ra khi biểu mẫu CÓ dữ liệu. Không
         có nội dung thì bước 2 không có gì để đọc lại, bước 3 không hiện thẻ
         chọn nhóm, bước 4 không hiện ô gửi ẩn danh (ô đó chỉ có ở nhóm tố
         giác), bước 5 không có nút gửi. Hướng dẫn nói về những nút đó mà màn
         hình trống trơn thì bà con càng rối.

         Cất bản nháp thật lại trước, xong hướng dẫn trả về nguyên vẹn — bà con
         đang gõ dở mà mất chữ là hỏng việc. */
      /* ⚠️ Dùng nhapThat.current làm mốc, KHÔNG dùng dangHuongDan.

         Hiệu ứng này khai phụ thuộc rỗng nên chỉ chạy một lần; biến trạng thái
         đọc trong đây mãi là giá trị lúc đầu. Lấy dangHuongDan làm mốc thì lần
         chuyển bước thứ hai vẫn thấy false, lại cất bản nháp lần nữa — lần này
         cất nhầm chính dữ liệu mẫu, bản nháp thật của bà con mất luôn.

         Biến ref luôn đọc được giá trị mới nhất nên dùng nó làm mốc mới đúng.
         setDraft cũng dùng dạng hàm để lấy đúng bản nháp hiện tại. */
      if (nhapThat.current === null) {
        setDraft((hienTai) => {
          /* ⚠️ BÀ CON ĐANG GÕ DỞ THÌ TUYỆT ĐỐI KHÔNG ĐÈ.

             Lỗi đã xảy ra thật: vòng hướng dẫn tự hiện mỗi giờ, gặp lúc bà con
             đang viết thì chèn dữ liệu mẫu đè lên chữ họ vừa gõ. Công sức mất
             sạch mà không hiểu vì sao.

             Có nội dung rồi thì giữ nguyên, chỉ xem hướng dẫn trên chính nội
             dung đó. */
          if (hienTai.content.trim().length > 0) {
            nhapThat.current = hienTai;
            /* ⚠️ VẪN PHẢI ĐẶT NHÓM TỐ GIÁC, dù giữ nguyên chữ bà con đã gõ.

               Ô "Gửi ẩn danh" CHỈ hiện ở nhóm tố giác tội phạm. Bà con đang gõ
               dở mà chưa chọn nhóm thì nhóm còn trống, nên tới bước hướng dẫn
               về gửi ẩn danh, màn hình không có gì để chỉ — hướng dẫn nói suông
               còn bà con không thấy ô đó ở đâu.

               Đặt tạm nhóm tố giác để ô hiện ra. An toàn vì bản nháp thật đã
               cất nguyên vẹn ở trên và được trả lại đầy đủ khi xong hướng dẫn. */
            return { ...hienTai, category: 'to_giac' as const };
          }
          nhapThat.current = hienTai;
          return {
            content: 'Tối qua khoảng 9 giờ, tôi thấy có nhóm thanh niên tụ tập gây mất trật tự ở gần chợ.',
            urgency: 'important',
            analysis: null,
            category: 'to_giac',
            contact: { ...EMPTY_CONTACT, fullName: 'Nguyễn Văn A', phone: '0901234567' },
            images: [], taiLieu: [], viTri: null,
          };
        });
      }
      setDangHuongDan(true);
      setStep(b);
    };

    const ketThuc = () => {
      /* Trả lại đúng bản nháp bà con đang gõ dở, rồi mới mở khoá. */
      if (nhapThat.current) { setDraft(nhapThat.current); nhapThat.current = null; }
      setDangHuongDan(false);
      setStep(1);
    };
    window.addEventListener('ans:huong-dan-buoc', chuyenBuoc);
    window.addEventListener('ans:huong-dan-ket-thuc', ketThuc);
    return () => {
      window.removeEventListener('ans:huong-dan-buoc', chuyenBuoc);
      window.removeEventListener('ans:huong-dan-ket-thuc', ketThuc);
      /* ⚠️ MỞ KHOÁ KHI RỜI TRANG — chặn lỗi nút gửi im lặng không làm gì.

         Lỗi đã xảy ra thật: hướng dẫn khoá nút gửi trong lúc xem, và chỉ mở
         khoá khi bà con bấm nút đóng. Bà con rời trang giữa chừng thì lệnh mở
         khoá không bao giờ chạy — quay lại bấm gửi, nút không phản ứng gì,
         không báo lỗi, không biết vì sao.

         Nay dọn dẹp ngay lúc rời trang nên khoá không bao giờ kẹt. */
      ketThuc();
    };
  }, []);

  /* Kiểm tra thiết bị có bị tạm khoá không NGAY KHI mở trang — không để bà con
     điền hết năm bước rồi mới báo. */
  const [biKhoa, setBiKhoa] = useState<{ biKhoa: boolean; conLaiPhut?: number } | null>(null);
  useEffect(() => {
    let con = true;
    kiemTraBiKhoa().then((kq) => { if (con) setBiKhoa(kq); });
    return () => { con = false; };
  }, []);
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    const saved = readDraft();
    return {
      content: saved?.content ?? '',
      urgency: (saved?.urgency as FeedbackDraft['urgency']) ?? 'normal',
      analysis: null,
      category: (saved?.category as FeedbackDraft['category']) ?? null,
      contact: EMPTY_CONTACT,
      images: [],
    };
  });
  const [draftRestored, setDraftRestored] = useState(() => Boolean(readDraft()?.content));
  const [submission, setSubmission] = useState<FeedbackSubmission | null>(null);
  /* P92: bấm Gửi lúc mất mạng -> tin đã cất trên máy, tự gửi khi có mạng */
  const [daXepHang, setDaXepHang] = useState(false);

  /* V10: Mã QR định vị — bà con quét mã dán tại hiện trường
     (?diem=MÃ trên đường dẫn) -> tự điền sẵn phường/xã, khỏi phải tự chọn. */
  const [searchParams] = useSearchParams();
  const [qrPointName, setQrPointName] = useState<string | null>(null);
  useEffect(() => {
    const diem = searchParams.get('diem');
    if (!diem) return;
    fetchQrPointInfo(diem).then((point) => {
      if (!point) return; // mã không hợp lệ -> lặng lẽ bỏ qua, form vẫn dùng bình thường
      setQrPointName(point.name);
      setDraft((d) => ({ ...d, contact: { ...d.contact, wardId: point.ward_id } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useDraftAutosave({ content: draft.content, category: draft.category, urgency: draft.urgency });

  const aiAnalysis = useAIAnalysis();
  const submitMutation = useMutation({
    mutationFn: (v: { draft: FeedbackDraft; xacMinhThem?: string }) => submitFeedback(v.draft, v.xacMinhThem),
    /* Mặc định React Query TẠM DỪNG lệnh khi mất mạng — bấm Gửi sẽ đứng im. Luôn chạy
       để submitFeedback cất tin vào hàng chờ gửi ngầm (P92) */
    networkMode: 'always',
  });
  /* Máy chủ báo mạng chung vượt ngưỡng (CAN_XAC_MINH_THEM — P88): hiện ô xác minh
     thêm, giữ nguyên đơn đang điền */
  const [canXacMinhThem, setCanXacMinhThem] = useState(false);
  /* Vé "không phải người máy" (lấy ở bước chọn nhóm) hết hạn lúc bấm gửi — P90: không
     còn màn hình chặn cả web để hiện lại, nên xác minh lại ngay trên đơn rồi gửi tiếp */
  const [canVeMoi, setCanVeMoi] = useState(false);
  /* Trọng tài P90: từ lúc tích ô tới lúc đơn đã gửi đi, ô GIỮ NGUYÊN và nút Gửi bị
     khoá — trước đây ô đóng ngay, bấm Gửi tay trong lúc chờ là hai lần gửi (lần
     sau bị chặn trùng, lần trước mất mã tra cứu + PIN). Đóng ô hay rời trang trong
     lúc chờ thì KHÔNG tự gửi nữa. */
  const [dangLayVe, setDangLayVe] = useState(false);
  const huyLayVe = useRef(false);
  const conMo = useRef(true);
  useEffect(() => () => { conMo.current = false; }, []);
  /* Một lần gửi một lúc — chặn cả lần bấm chen vào trước khi isPending kịp đổi */
  const dangGui = useRef(false);

  const runAnalysis = (content: string) => {
    aiAnalysis.mutate(content, {
      onSuccess: (result) => {
        // AI đề xuất mức khẩn cấp -> tự áp vào form (bà con vẫn đổi lại được)
        if (result?.suggestedUrgency) {
          setDraft((d) => ({ ...d, urgency: result.suggestedUrgency! }));
        }
        setDraft((d) => ({ ...d, analysis: result, category: result.suggestedCategory }));
      },
      onError: () => toast.error('Hệ thống phân tích thất bại, vui lòng thử lại.'),
    });
  };

  const handleContentNext = () => {
    // Lá chắn nội dung: làm sạch + quét mẫu tấn công trước khi xử lý tiếp
    const cleaned = sanitizeText(draft.content);
    const scan = scanTextForThreats(cleaned);
    if (!scan.safe) {
      toast.error(
        `Nội dung chứa ${scan.reasons[0]} — vì lý do an toàn, bà con vui lòng mô tả sự việc bằng lời văn thông thường.`,
        { duration: 6000 }
      );
      return;
    }
    if (containsProfanity(cleaned)) {
      toast.error(
        'Nội dung chứa ngôn từ không phù hợp. Bà con vui lòng diễn đạt lịch sự để ý kiến được tiếp nhận và xử lý.',
        { duration: 6000 }
      );
      return;
    }
    setDraft((d) => ({ ...d, content: cleaned }));
    setStep(2);
    runAnalysis(cleaned);
  };

  const handleReanalyze = () => runAnalysis(draft.content);

  const handleCategoryChange = (category: FeedbackCategory) => setDraft((d) => ({ ...d, category }));

  const handleContactChange = (contact: ContactInfoType) => setDraft((d) => ({ ...d, contact }));

  /* daLayVeMoi: lần gửi ngay sau khi vừa lấy vé mới — vẫn bị đòi thì báo lỗi, không mở ô lặp mãi */
  const guiDon = (xacMinhThem?: string, daLayVeMoi = false) => {
    if (dangGui.current) return;
    dangGui.current = true;
    submitMutation.mutate({ draft, xacMinhThem }, {
      onSettled: () => { dangGui.current = false; },
      onSuccess: (result) => {
        setSubmission(result);
        // Lưu mã tra cứu vào chính thiết bị -> lần sau tra lại không cần nhớ mã
        saveTrackingCode(result.trackingCode, result.category);
        toast.success('Gửi ý kiến thành công!');
      },
      onError: (err) => {
        /* Chỉ mở ô xác minh khi lần gửi này CHƯA kèm mã. Đã kèm mã mà vẫn bị đòi
           (hoặc XAC_MINH_THEM_KHONG_QUA) thì báo lỗi — mở lại là tự lặp gửi mãi */
        const code = (err as { code?: string })?.code;
        if (code === 'DA_XEP_HANG') { clearDraft(); setDaXepHang(true); return; }
        if (code === 'CAN_XAC_MINH_THEM' && !xacMinhThem) { setCanXacMinhThem(true); return; }
        if (code === 'CAN_XAC_MINH' && !daLayVeMoi) { setCanVeMoi(true); return; }
        /* Để lâu hơn mặc định: câu có số 113 phải đọc kịp */
        toast.error(err instanceof Error ? err.message : LOI_GUI_THAT_BAI, { duration: 10_000 });
      },
    });
  };
  const handleSubmit = () => guiDon();

  /* Phiếu mở form: lấy khi mở trang (ADR-003 việc 24) */
  useEffect(() => { batDauDienDon(); }, []);

  const handleReset = () => {
    batDauDienDon();
    setDraft({ content: '', urgency: 'normal', analysis: null, category: null, contact: EMPTY_CONTACT, images: [], taiLieu: [], viTri: null });
    clearDraft();
    setSubmission(null);
    setDaXepHang(false);
    setStep(1);
  };

  return (
    <>
      {/* Ảnh nền: trụ sở công an — đúng nơi tiếp nhận tin báo */}
      <PageBackground anh="bg-tru-so-cong-an.webp" />
      <div className="container-page max-w-2xl py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">{t('send.title')}</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {t('send.subtitle')}
        </p>
        {qrPointName && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            <MapPin size={13} /> Vị trí quét mã: {qrPointName} — đã tự động chọn địa bàn
          </p>
        )}
      </div>

      {/* Dải báo rõ đang xem hướng dẫn, chưa gửi gì cả. Không có dòng này thì
          bà con thấy màn hình xác nhận với ô trống lại tưởng mình làm sai. */}
      {dangHuongDan && (
        <div className="mb-4 rounded-2xl border-2 border-primary-300 bg-primary-50 p-3 text-center dark:border-primary-700 dark:bg-primary-900/20">
          <p className="text-sm font-bold text-primary-800 dark:text-primary-300">
            {t('sf.dangXemHuongDan')}
          </p>
          <p className="mt-0.5 text-xs text-primary-700 dark:text-primary-200">
            {t('sf.dayChiLaXem')}
          </p>
        </div>
      )}

      {/* Mốc để vòng hướng dẫn cuộn tới khi đổi bước mà không có nút cụ thể
          nào để khoanh — nếu không trang giữ nguyên vị trí cuộn cũ, mà bước
          mới ngắn hơn nên vị trí đó rơi xuống tận chân trang. */}
      <div data-khu-bieu-mau />

      {!submission && !daXepHang && <StepIndicator current={step} />}
      {/* Hướng dẫn từng bước bằng lời, có nút đọc to — cho người lớn tuổi và
          người không đọc được chữ. Chỉ hiện khi chưa gửi xong và thiết bị
          không bị khoá (khỏi lẫn với màn hình báo khoá). */}
      {!submission && !daXepHang && !biKhoa?.biKhoa && <HuongDanBuoc buoc={step} />}

      {daXepHang ? <TinDaXepHang onSoanMoi={handleReset} /> : (
      <Card className="overflow-hidden p-5 sm:p-7">
        {/* Chuyển bước TRƯỢT NGANG như ứng dụng điện thoại:
            đi tới -> trượt từ phải sang; quay lại -> trượt từ trái sang */}
      {/* ==================================================================
          THIẾT BỊ ĐANG BỊ TẠM KHOÁ -> hiện thông báo THAY CHO biểu mẫu

          Chặn ngay từ đầu, không để bà con điền hết năm bước rồi mới báo —
          vừa mất công vừa bực. Máy chủ vẫn chặn lần nữa lúc nhận đơn, nên
          người dùng công cụ gọi thẳng API cũng không lọt.
          ================================================================== */}
      {biKhoa?.biKhoa ? (
        <ManHinhBiKhoa conLaiPhut={biKhoa.conLaiPhut ?? 60} />
      ) : (
      <>
        {/* KHIẾU NẠI MỞ KHOÁ — đặt trên biểu mẫu (BUG-015). Máy chủ không còn
            báo khoá qua /kiem-tra-khoa (xem routes/submissions.js), nên màn hình
            khoá ở trên không còn hiện và đây là lối khiếu nại duy nhất. Component
            tự ẩn khi máy không bị khoá loại có tên — khoá loại ẩn danh không có
            đường khiếu nại, xem routes/khieu-nai.js. */}
        {!submission && <KhieuNaiMoKhoa />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.32, ease: [0.21, 0.65, 0.36, 1] }}
          >
        {step === 1 && (
          <ContentInput
            value={draft.content}
            onChange={(content) => setDraft((d) => ({ ...d, content }))}
            draftRestored={draftRestored}
            onDismissDraft={() => {
              setDraft({ content: '', urgency: 'normal', analysis: null, category: null, contact: EMPTY_CONTACT, images: [], taiLieu: [], viTri: null });
              clearDraft();
              setDraftRestored(false);
            }}
            images={draft.images}
            onImagesChange={(images) => setDraft((d) => ({ ...d, images }))}
            taiLieu={draft.taiLieu}
            onTaiLieuChange={(taiLieu) => setDraft((d) => ({ ...d, taiLieu }))}
            viTri={draft.viTri}
            onViTriChange={(viTri) => setDraft((d) => ({ ...d, viTri }))}
            onNext={handleContentNext}
          />
        )}

        {step === 2 && (
          <AIAnalysis
            isLoading={aiAnalysis.isPending}
            result={draft.analysis}
            onReanalyze={handleReanalyze}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <CategorySelect
            value={draft.category}
            suggested={draft.analysis?.suggestedCategory ?? null}
            onChange={handleCategoryChange}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <ContactInfo
            value={draft.contact}
            onChange={handleContactChange}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
            onVeBuocDau={() => setStep(1)}
            category={draft.category}
            qrPointName={qrPointName}
            noiDung={draft.content}
          />
        )}

        {step === 5 && (
          <Confirmation
            draft={draft}
            submission={submission}
            isSubmitting={submitMutation.isPending || dangLayVe}
            /* KHOÁ GỬI trong lúc xem hướng dẫn — xem chú thích ở chỗ khai
               dangHuongDan. Truyền hàm rỗng thay vì hàm gửi thật. */
            onSubmit={dangHuongDan ? () => {} : handleSubmit}
            onBack={() => setStep(4)}
            onVeBuocDau={() => setStep(1)}
            onReset={handleReset}
          />
        )}
          </motion.div>
        </AnimatePresence>
      </>
      )}
      </Card>
      )}
    </div>
    {/* Ngoài Card: lớp phủ cố định không bị khung cha (transform) giữ lại */}
    {canXacMinhThem && (
      <XacMinhThem
        onToken={(tk) => { setCanXacMinhThem(false); guiDon(tk); }}
        onDong={() => setCanXacMinhThem(false)}
      />
    )}
    {canVeMoi && (
      <XacMinhThem
        loai="het_ve"
        dangXuLy={dangLayVe}
        onToken={async (tk) => {
          if (dangLayVe) return;
          huyLayVe.current = false;
          setDangLayVe(true);
          try {
            await layVeMoi(tk);
            if (huyLayVe.current || !conMo.current) return;
            /* Đóng ô và gửi trong CÙNG một lượt — không để khe hở cho lần bấm tay */
            setCanVeMoi(false);
            guiDon(undefined, true);
          } catch (e) {
            if (huyLayVe.current || !conMo.current) return;
            setCanVeMoi(false);
            toast.error(e instanceof Error ? e.message : LOI_GUI_THAT_BAI, { duration: 10_000 });
          } finally {
            if (conMo.current) setDangLayVe(false);
          }
        }}
        onDong={() => { huyLayVe.current = true; setCanVeMoi(false); setDangLayVe(false); }}
      />
    )}
    </>
  );
}
