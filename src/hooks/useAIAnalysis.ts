/**
 * Hook gọi AI phân tích nội dung ý kiến (React Query mutation).
 */
import { useMutation } from '@tanstack/react-query';
import { analyzeContent } from '../services/aiService';

export function useAIAnalysis() {
  /* Mất mạng vẫn phân tích được (analyzeContent tự lùi về phân tích trên máy) —
     mặc định React Query tạm dừng lệnh khi mất mạng, bà con kẹt ở bước 1 (P92) */
  return useMutation({ mutationFn: analyzeContent, networkMode: 'always' });
}
