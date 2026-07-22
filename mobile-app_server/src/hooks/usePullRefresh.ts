import { useCallback, useState } from 'react';

/**
 * usePullRefresh：下拉刷新封装，供列表页复用（配合 antd-mobile 的 PullToRefresh）。
 *
 * 用法：
 *   const { refreshing, onRefresh } = usePullRefresh(() => run({ page: 1 }));
 *   <PullToRefresh onRefresh={onRefresh}> ...list... </PullToRefresh>
 *
 * onRefresh 返回 Promise，PullToRefresh 会在其 resolve 后收起动画。
 */
export function usePullRefresh(handler: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await handler();
    } finally {
      setRefreshing(false);
    }
  }, [handler]);

  return { refreshing, onRefresh };
}

export default usePullRefresh;
