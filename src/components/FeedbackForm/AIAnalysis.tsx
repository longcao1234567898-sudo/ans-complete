/**
 * Bước 2: AI phân tích nội dung theo thời gian thực — hiệu ứng gõ chữ,
 * thanh độ tin cậy, từ khoá nhận diện, cho phép phân tích lại.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { AIAnalysisResult } from '../../types/feedback';
import { Skeleton } from '../common/Loading';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { cn } from '../../utils/helpers';

interface AIAnalysisProps {
  isLoading: boolean;
  result: AIAnalysisResult | null;
  onReanalyze: () => void;
  onNext: () => void;
  onBack: () => void;
}

/** Hiệu ứng gõ chữ hiển thị dần nội dung AI đã chuẩn hoá */
function TypedText({ text }: { text: string }) {
  const [shown, setShown] = useState('');

  useEffect(() => {
    setShown('');
    let i = 0;
    const timer = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <p className="font-medium leading-relaxed text-slate-700 dark:text-slate-200">
      {shown}
      {shown.length < text.length && <span className="animate-pulse">|</span>}
    </p>
  );
}

export default function AIAnalysis({ isLoading, result, onReanalyze, onNext, onBack }: AIAnalysisProps) {
  const confidencePct = result ? Math.round(result.confidence * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">AI đang phân tích nội dung của bà con</h3>
      </div>

      <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-900/10">
        {isLoading || !result ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <>
            {result.privacyNote && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/15">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-xs font-medium leading-relaxed text-emerald-700 dark:text-emerald-300">{result.privacyNote}</p>
              </div>
            )}
            <TypedText text={result.normalizedContent} />

            {/* Mức khẩn cấp AI đề xuất — hiện rõ để bà con biết và đổi lại nếu cần */}
            {result.suggestedUrgency && result.suggestedUrgency !== 'normal' && (
              <div
                className={cn(
                  'mt-4 flex items-start gap-2.5 rounded-xl border-2 p-3',
                  result.suggestedUrgency === 'urgent'
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/15'
                    : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/15'
                )}
              >
                <span className="text-lg leading-none">
                  {result.suggestedUrgency === 'urgent' ? '🔴' : '🟡'}
                </span>
                <span>
                  <span
                    className={cn(
                      'block text-sm font-bold',
                      result.suggestedUrgency === 'urgent'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-amber-700 dark:text-amber-300'
                    )}
                  >
                    AI đánh giá: {result.suggestedUrgency === 'urgent' ? 'KHẨN CẤP' : 'Quan trọng'}
                  </span>
                  {result.urgencyReason && (
                    <span className="block text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {result.urgencyReason}
                    </span>
                  )}
                  {result.suggestedUrgency === 'urgent' && (
                    <span className="mt-1 block text-xs font-semibold text-red-600 dark:text-red-400">
                      Nếu đang có nguy hiểm, bà con gọi ngay 113 thay vì chờ xử lý qua hệ thống.
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Thanh độ tin cậy */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Độ tin cậy phân loại</span>
                <span>{confidencePct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    confidencePct >= 80 ? 'bg-primary-600' : confidencePct >= 65 ? 'bg-accent-500' : 'bg-secondary-500'
                  )}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            </div>

            {/* Từ khoá nhận diện */}
            {result.keywords.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Từ khoá AI nhận diện</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.keywords.map((kw) => (
                    <Badge key={kw} colorClass="bg-white text-primary-700 border border-primary-200 dark:bg-slate-800 dark:text-primary-300 dark:border-primary-800">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isLoading && result && (
        <button
          onClick={onReanalyze}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Phân tích lại
        </button>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Quay lại
        </Button>
        <Button onClick={onNext} disabled={isLoading || !result}>
          Tiếp tục — Chọn nhóm
        </Button>
      </div>
    </div>
  );
}
