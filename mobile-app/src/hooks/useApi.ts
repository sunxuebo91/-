import { useCallback, useEffect, useRef, useState } from 'react';
import { queryClient } from '../lib/queryClient';

interface UseApiOptions {
  /** 是否在挂载时立即执行（默认 false，需手动 run） */
  immediate?: boolean;
  /**
   * react-query 缓存键（Task 5）。传入后 run() 底层改走 queryClient.fetchQuery，
   * 命中新鲜缓存时直接复用、跨页面切换不重复请求；不传则保持原有直连行为。
   * - 数组：静态键，如 ['dashboard-stats']
   * - 函数：由 run(...args) 参数动态生成，如 (id) => ['customer', id]
   */
  cacheKey?: unknown[] | ((...args: any[]) => unknown[]);
  /** 视为新鲜的时长（ms），仅在 cacheKey 存在时生效 */
  staleTime?: number;
  /** 缓存回收时长（ms），仅在 cacheKey 存在时生效 */
  gcTime?: number;
}

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** 执行请求，返回结果或抛错 */
  run: (...args: any[]) => Promise<T | undefined>;
  /** 重置状态 */
  reset: () => void;
  setData: (data: T | null) => void;
}

/**
 * useApi：封装 loading/error/data 的通用请求 hook。
 *
 * 用法：
 *   const { data, loading, error, run } = useApi(customerService.getCustomers);
 *   useEffect(() => { run({ page: 1 }); }, []);
 */
export function useApi<T = any>(
  fetcher: (...args: any[]) => Promise<T>,
  options: UseApiOptions = {},
): UseApiState<T> {
  const { immediate = false, cacheKey, staleTime, gcTime } = options;
  const optRef = useRef({ cacheKey, staleTime, gcTime });
  optRef.current = { cacheKey, staleTime, gcTime };
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (...args: any[]): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const { cacheKey: ck, staleTime: st, gcTime: gc } = optRef.current;
      let result: T;
      if (ck) {
        const queryKey = typeof ck === 'function' ? ck(...args) : ck;
        result = await queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetcherRef.current(...args),
          staleTime: st,
          gcTime: gc,
        });
      } else {
        result = await fetcherRef.current(...args);
      }
      if (mountedRef.current) setData(result);
      return result;
    } catch (err: any) {
      const e = err instanceof Error ? err : new Error(err?.message || '请求失败');
      if (mountedRef.current) setError(e);
      throw e;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (immediate) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate]);

  return { data, loading, error, run, reset, setData };
}

export default useApi;
