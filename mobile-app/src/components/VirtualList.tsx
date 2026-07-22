import { type ReactNode } from 'react';

/**
 * VirtualList（列表渲染组件）
 *
 * 说明：早期基于 @tanstack/react-virtual 的「window 虚拟化」实现，在
 * 「整页 window 滚动 + sticky 头部 + PullToRefresh + InfiniteScroll」组合下，
 * scrollMargin 首次测量时机与真实文档偏移不一致，导致虚拟容器高度/位置计算错位，
 * 页面滚动到底部时 InfiniteScroll 无法被触发（loadMore 永不调用），列表卡在第一页。
 *
 * 家政 CRM 列表每页 10 条、总量通常数百条，普通渲染性能完全够用，因此改为
 * 直接普通渲染，保持与虚拟化版本相同的 props 接口，调用方无需改动，且能与
 * antd-mobile 的 InfiniteScroll 稳定协作。
 *
 * 用法：
 *   <VirtualList items={items} renderItem={(item) => <Row .../>} />
 */
export interface VirtualListProps<T> {
  items: T[];
  /** 兼容旧接口，普通渲染下已不再使用 */
  estimateSize?: number;
  /** 兼容旧接口，普通渲染下已不再使用 */
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  /** 行 key，默认用 index */
  getKey?: (item: T, index: number) => string | number;
}

export function VirtualList<T>({ items, renderItem, getKey }: VirtualListProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, index) => (
        <div key={getKey ? getKey(item, index) : index}>{renderItem(item, index)}</div>
      ))}
    </div>
  );
}

export default VirtualList;
