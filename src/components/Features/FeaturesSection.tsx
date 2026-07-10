/**
 * Khu vực giới thiệu 3 tính năng AI cốt lõi kèm demo trực quan cho từng tính năng.
 */
import { useEffect, useState } from 'react';
import { BrainCircuit, GitBranch, SearchCheck } from 'lucide-react';
import FeatureCard from './FeatureCard';
import Badge from '../common/Badge';
import { CATEGORIES, STATUS_MAP } from '../../utils/constants';

const DEMO_INPUT = 'co nguoi danh nhau gan ben pha tan chau';
const DEMO_OUTPUT = 'Phản ánh vụ việc đánh nhau gần bến phà Tân Châu';

/** Demo hiệu ứng gõ chữ cho phần "Đọc hiểu nội dung" */
function TypingDemo() {
  const [shown, setShown] = useState('');

  useEffect(() => {
    let i = 0;
    setShown('');
    const timer = setInterval(() => {
      i += 1;
      setShown(DEMO_OUTPUT.slice(0, i));
      if (i >= DEMO_OUTPUT.length) clearInterval(timer);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
      <div>
        <span className="font-semibold text-slate-400">Công dân nhập:</span>
        <p className="mt-0.5 italic text-slate-500 dark:text-slate-400">“{DEMO_INPUT}”</p>
      </div>
      <div>
        <span className="font-semibold text-primary-600 dark:text-primary-400">AI hiểu:</span>
        <p className="mt-0.5 min-h-[1.25rem] font-medium text-slate-700 dark:text-slate-200">
          “{shown}
          <span className="animate-pulse">|</span>”
        </p>
      </div>
    </div>
  );
}

/** Demo hiển thị 4 nhóm phân loại dạng chip */
function CategoryDemo() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <Badge key={c.id} colorClass={c.colorClass}>
          {c.label}
        </Badge>
      ))}
    </div>
  );
}

/** Demo thanh tiến độ 3 trạng thái */
function ProgressDemo() {
  const stages = [STATUS_MAP.received, STATUS_MAP.processing, STATUS_MAP.resolved];
  return (
    <div className="flex items-center">
      {stages.map((s, idx) => (
        <div key={s.id} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                idx === 0
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
            >
              {idx + 1}
            </span>
            <span className="text-center text-[10px] leading-tight text-slate-500 dark:text-slate-400">
              {s.label}
            </span>
          </div>
          {idx < stages.length - 1 && <span className="mx-1 h-0.5 flex-1 bg-slate-200 dark:bg-slate-700" />}
        </div>
      ))}
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section className="container-page py-16" aria-labelledby="features-title">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 id="features-title" className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
          Sức mạnh AI đồng hành cùng bà con
        </h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Ba tính năng thông minh giúp ý kiến của bà con được tiếp nhận nhanh chóng, chính xác và minh bạch.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={<BrainCircuit className="h-6 w-6" aria-hidden />}
          title="Đọc hiểu nội dung"
          description="AI tự động hiểu và diễn đạt lại nội dung rõ ràng, kể cả khi bà con viết thiếu dấu hay chưa đúng chính tả."
          delay={0}
        >
          <TypingDemo />
        </FeatureCard>

        <FeatureCard
          icon={<GitBranch className="h-6 w-6" aria-hidden />}
          title="Phân loại thông minh"
          description="Tự động phân vào 1 trong 4 nhóm xử lý để chuyển đến đúng bộ phận phụ trách, rút ngắn thời gian tiếp nhận."
          accentClass="bg-secondary-100 text-secondary-500 dark:bg-secondary-500/20 dark:text-secondary-400"
          delay={0.1}
        >
          <CategoryDemo />
        </FeatureCard>

        <FeatureCard
          icon={<SearchCheck className="h-6 w-6" aria-hidden />}
          title="Theo dõi tiến độ"
          description="Mỗi ý kiến được cấp mã 6 ký tự để bà con tra cứu trạng thái xử lý mọi lúc, mọi nơi."
          accentClass="bg-accent-100 text-accent-600 dark:bg-accent-500/20 dark:text-accent-500"
          delay={0.2}
        >
          <ProgressDemo />
        </FeatureCard>
      </div>
    </section>
  );
}
