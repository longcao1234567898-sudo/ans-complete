/**
 * Hook tra cứu tiến độ theo mã (React Query).
 * Chỉ chạy khi có mã hợp lệ (enabled).
 */
import { useQuery } from '@tanstack/react-query';
import { lookupTracking } from '../services/trackingService';

export function useTracking(code: string | null) {
  return useQuery({
    queryKey: ['tracking', code],
    queryFn: () => lookupTracking(code as string),
    enabled: Boolean(code && code.trim().length >= 6),
    retry: false,
    staleTime: 30_000,
  });
}
