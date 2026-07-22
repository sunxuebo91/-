import { QueryClient } from '@tanstack/react-query';

/**
 * 全局 QueryClient（Task 5 列表/详情缓存）。
 *
 * 默认策略（可被单次查询覆盖）：
 * - staleTime 30s：30 秒内视为新鲜，页面切换返回不重复请求
 * - gcTime 5min：缓存保留 5 分钟后回收
 * - retry false：网络重试已由 services/api.ts 的 withRetry 统一处理，避免双重重试
 * - refetchOnWindowFocus false：移动端切前后台不必每次刷新
 *
 * 分级缓存时长常量，供各 query hook 复用：
 */
export const CACHE_TIME = {
  /** 高频列表：客户/合同/简历/审批列表页 */
  list: { staleTime: 30_000, gcTime: 5 * 60_000 },
  /** 详情：客户/简历详情，切换返回复用 */
  detail: { staleTime: 60_000, gcTime: 5 * 60_000 },
  /** 统计：驾驶舱/工作台，变化较慢 */
  stats: { staleTime: 60_000, gcTime: 10 * 60_000 },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_TIME.list.staleTime,
      gcTime: CACHE_TIME.list.gcTime,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
