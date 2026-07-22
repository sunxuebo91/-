import type { ReactNode } from 'react';
import { NavBar, Empty } from 'antd-mobile';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  extra?: ReactNode;
}

/**
 * 通用占位页：Task 2 仅搭骨架，业务页面在 Task 3/4 填充。
 */
export default function PlaceholderPage({
  title,
  description = '此模块将在后续阶段实现',
  extra,
}: PlaceholderPageProps) {
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        {title}
      </NavBar>
      <div style={{ padding: 24 }}>
        <Empty description={description} />
        {extra}
      </div>
    </div>
  );
}
