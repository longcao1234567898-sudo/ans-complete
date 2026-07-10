/**
 * Thẻ hiển thị 1 tính năng AI nổi bật — có hiệu ứng glow và icon chuyển động khi hover.
 */
import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import Card from '../common/Card';
import { cn } from '../../utils/helpers';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  accentClass?: string;
  children?: ReactNode;
  delay?: number;
}

export default function FeatureCard({
  icon,
  title,
  description,
  accentClass = 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300',
  children,
  delay = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      className="h-full"
    >
      <Card hover className="group relative flex h-full flex-col overflow-hidden">
        {/* Vầng sáng trang trí, lan rộng khi hover */}
        <span
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 transition-transform duration-500 will-change-transform group-hover:scale-150"
          style={{ background: 'radial-gradient(circle, rgba(5,150,105,0.18) 0%, transparent 65%)' }}
          aria-hidden
        />
        <span
          className={cn(
            'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110',
            accentClass
          )}
        >
          {icon}
        </span>
        <h3 className="mb-1.5 text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
        <div className="mt-auto">{children}</div>
      </Card>
    </motion.div>
  );
}
