/**
 * Hook gọi AI phân tích nội dung ý kiến (React Query mutation).
 */
import { useMutation } from '@tanstack/react-query';
import { analyzeContent } from '../services/aiService';

export function useAIAnalysis() {
  return useMutation({ mutationFn: analyzeContent });
}
