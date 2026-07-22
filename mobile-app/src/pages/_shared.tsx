import { useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { queryClient } from '../lib/queryClient';

/**
 * 核心业务模块共享工具（Task 3）：
 * - 日期/金额格式化
 * - 状态标签与配色映射（对齐 frontend）
 * - useInfiniteList：下拉刷新 + 上拉加载分页 hook（配合 antd-mobile PullToRefresh/InfiniteScroll）
 * 仅供 5 个核心模块页面复用，自包含、不依赖其它模块。
 */

// ── 格式化 ─────────────────────────────────────
export const fmtDate = (v?: string, f = 'YYYY-MM-DD'): string =>
  v ? dayjs(v).format(f) : '-';
export const fmtDateTime = (v?: string): string => fmtDate(v, 'YYYY-MM-DD HH:mm');
export const fmtMoney = (v?: number | null): string =>
  v == null || Number.isNaN(Number(v)) ? '-' : `¥${Number(v).toLocaleString()}`;

// ── 合同状态（英文枚举 → 中文 + 配色，对齐 frontend ContractList） ──
export const CONTRACT_STATUS_TEXT: Record<string, string> = {
  draft: '草稿',
  signing: '签约中',
  signed: '已签约',
  active: '已签约',
  onboarded: '已上户',
  service_ended: '服务结束',
  graduated: '已毕业',
  replaced: '已替换',
  cancelled: '已作废',
  refunded: '已退款',
};
export const CONTRACT_STATUS_COLOR: Record<string, string> = {
  draft: 'default',
  signing: 'primary',
  signed: 'success',
  active: 'success',
  onboarded: 'success',
  service_ended: 'default',
  graduated: 'success',
  replaced: 'warning',
  cancelled: 'danger',
  refunded: 'danger',
};

// ── 审批状态 ────────────────────────────────────
export const APPROVAL_STATUS_TEXT: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  executed: '已执行',
  executed_failed: '执行失败',
  cancelled: '已取消',
};
export const APPROVAL_STATUS_COLOR: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  executed: 'success',
  executed_failed: 'danger',
  cancelled: 'default',
};

// ── 简历工种（对齐 frontend resume.ts JobType） ──
export const JOB_TYPE_TEXT: Record<string, string> = {
  'zhujia-yuer': '住家育儿',
  'baiban-yuer': '白班育儿',
  baojie: '保洁',
  'baiban-baomu': '白班保姆',
  'zhujia-baomu': '住家保姆',
  yangchong: '养宠',
  xiaoshi: '小时工',
  yuesao: '月嫂',
  'zhujia-hulao': '住家护老',
  jiajiao: '家教',
  peiban: '陪伴师',
  hugong: '护工',
};
export const jobTypeText = (v?: string): string => (v ? JOB_TYPE_TEXT[v] || v : '-');

// ── 客户联系状态配色（客户 contractStatus 为中文，直接展示） ──
export const CUSTOMER_STATUS_COLOR: Record<string, string> = {
  已签约: 'success',
  签约中: 'primary',
  匹配中: 'primary',
  已面试: 'warning',
  待定: 'default',
  流失客户: 'danger',
  已退款: 'danger',
  退款中: 'warning',
};

// ── 无限滚动列表 hook ──────────────────────────
export interface PageResult<T> {
  list: T[];
  total: number;
}

/**
 * useInfiniteList
 * @param fetchPage (page, limit) => { list, total }
 * fetchPage 应闭包读取最新筛选条件；筛选变化后调用 refresh() 重新从第 1 页加载。
 * @param limit 每页数量，默认 10
 * @param opts.cacheKey 传入后各页结果走 react-query 缓存（键为 [...cacheKey, page, limit]），
 *   跨页面切换返回时命中新鲜缓存则不重复请求；refresh() 会先清理该前缀缓存确保拿到最新数据。
 *   不传则保持原有直连行为（完全向后兼容）。
 */
export function useInfiniteList<T>(
  fetchPage: (page: number, limit: number) => Promise<PageResult<T>>,
  limit = 10,
  opts?: { cacheKey?: unknown[]; staleTime?: number },
) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const pageRef = useRef(0);
  const countRef = useRef(0);
  const loadingRef = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runFetch = useCallback(
    (page: number): Promise<PageResult<T>> => {
      const o = optsRef.current;
      if (o?.cacheKey) {
        return queryClient.fetchQuery({
          queryKey: [...o.cacheKey, page, limit],
          queryFn: () => fetchRef.current(page, limit),
          staleTime: o.staleTime,
        });
      }
      return fetchRef.current(page, limit);
    },
    [limit],
  );

  const loadMore = useCallback(async () => {
    // 并发/重复触发保护：refresh 与 InfiniteScroll 可能同时调用，
    // 若不加锁会共用 pageRef 造成页码错乱、重复合并、hasMore 卡死。
    if (loadingRef.current) return;
    loadingRef.current = true;
    const nextPage = pageRef.current + 1;
    try {
      const { list, total } = await runFetch(nextPage);
      // setItems 的 updater 必须是纯函数（StrictMode 下会执行两次），
      // 故 hasMore / 计数在 updater 外用 ref 计算，updater 内不再触发其它 setState。
      pageRef.current = nextPage;
      countRef.current = (nextPage === 1 ? 0 : countRef.current) + list.length;
      setItems((prev) => (nextPage === 1 ? list : [...prev, ...list]));
      setHasMore(countRef.current < total && list.length > 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('加载失败'));
      setHasMore(false);
      throw e;
    } finally {
      loadingRef.current = false;
    }
  }, [runFetch]);

  const refresh = useCallback(async () => {
    // 下拉刷新：清理该列表前缀的缓存，确保拿到最新数据
    const o = optsRef.current;
    if (o?.cacheKey) queryClient.removeQueries({ queryKey: o.cacheKey });
    loadingRef.current = false;
    pageRef.current = 0;
    countRef.current = 0;
    setHasMore(true);
    setError(null);
    await loadMore();
  }, [loadMore]);

  return { items, hasMore, error, loadMore, refresh, setItems };
}
