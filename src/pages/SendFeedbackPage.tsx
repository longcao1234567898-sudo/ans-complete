/**
 * Trang "Gửi ý kiến": wizard 5 bước — nhập nội dung, AI phân tích, chọn nhóm,
 * thông tin liên hệ, xác nhận & nhận mã tra cứu.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ContactInfo as ContactInfoType, FeedbackCategory, FeedbackDraft, FeedbackSubmission } from '../types/feedback';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { submitFeedback } from '../services/feedbackService';
import { containsProfanity, sanitizeText, scanTextForThreats } from '../utils/security';
import StepIndicator from '../components/FeedbackForm/StepIndicator';
import ContentInput from '../components/FeedbackForm/ContentInput';
import AIAnalysis from '../components/FeedbackForm/AIAnalysis';
import CategorySelect from '../components/FeedbackForm/CategorySelect';
import ContactInfo from '../components/FeedbackForm/ContactInfo';
import Confirmation from '../components/FeedbackForm/Confirmation';
import Card from '../components/common/Card';
import { AnimatePresence, motion } from 'framer-motion';
import PageBackground from '../components/common/PageBackground';

const EMPTY_CONTACT: ContactInfoType = { fullName: '', phone: '', email: '' };

export default function SendFeedbackPage() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<FeedbackDraft>({
    content: '',
    analysis: null,
    category: null,
    contact: EMPTY_CONTACT,
    images: [],
  });
  const [submission, setSubmission] = useState<FeedbackSubmission | null>(null);

  const aiAnalysis = useAIAnalysis();
  const submitMutation = useMutation({ mutationFn: submitFeedback });

  const runAnalysis = (content: string) => {
    aiAnalysis.mutate(content, {
      onSuccess: (result) => {
        setDraft((d) => ({ ...d, analysis: result, category: result.suggestedCategory }));
      },
      onError: () => toast.error('AI phân tích thất bại, vui lòng thử lại.'),
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

  const handleSubmit = () => {
    submitMutation.mutate(draft, {
      onSuccess: (result) => {
        setSubmission(result);
        toast.success('Gửi ý kiến thành công!');
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.'),
    });
  };

  const handleReset = () => {
    setDraft({ content: '', analysis: null, category: null, contact: EMPTY_CONTACT, images: [] });
    setSubmission(null);
    setStep(1);
  };

  return (
    <>
      <PageBackground image="bg-nui-cam.webp" />
      <div className="container-page max-w-2xl py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">Gửi ý kiến</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Chia sẻ tự nhiên — AI sẽ giúp bà con diễn đạt rõ ràng và chuyển đến đúng bộ phận xử lý.
        </p>
      </div>

      {!submission && <StepIndicator current={step} />}

      <Card className="overflow-hidden p-5 sm:p-7">
        {/* Chuyển bước TRƯỢT NGANG như ứng dụng điện thoại:
            đi tới -> trượt từ phải sang; quay lại -> trượt từ trái sang */}
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
            images={draft.images}
            onImagesChange={(images) => setDraft((d) => ({ ...d, images }))}
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
            category={draft.category}
          />
        )}

        {step === 5 && (
          <Confirmation
            draft={draft}
            submission={submission}
            isSubmitting={submitMutation.isPending}
            onSubmit={handleSubmit}
            onBack={() => setStep(4)}
            onReset={handleReset}
          />
        )}
          </motion.div>
        </AnimatePresence>
      </Card>
    </div>
    </>
  );
}
