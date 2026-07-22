import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  NavBar,
  PullToRefresh,
  Tabs,
  Tag,
} from 'antd-mobile';
import { RedoOutline } from 'antd-mobile-icons';
import { usePermission } from '../hooks/usePermission';
import { fmtDateTime, useInfiniteList } from './_shared';
import {
  leadTransferService,
  type LeadTransferRecord,
  type LeadTransferRule,
  type LeadTransferStatistics,
} from '../services/leadTransferService';
import { useAuthStore } from '../stores/auth';

const cardStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const strategyText: Record<string, string> = {
  'balanced-random': '平衡随机',
  'round-robin': '轮询',
  'least-load': '最少负载',
};

function AccessDenied({ description }: { description: string }) {
  return <ErrorBlock status="empty" title="无访问权限" description={description} style={{ padding: '48px 24px' }} />;
}

function RulesTab() {
  const [rules, setRules] = useState<LeadTransferRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRules(await leadTransferService.getRules());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  return (
    <PullToRefresh onRefresh={loadRules}>
      <div style={{ padding: '12px 16px 80px', minHeight: '50vh' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button size="small" fill="none" onClick={loadRules} loading={loading}>
            <RedoOutline /> 刷新
          </Button>
        </div>
        {loading && rules.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}><DotLoading color="primary" /></div>
        ) : error && rules.length === 0 ? (
          <ErrorBlock status="default" title="加载失败" description="下拉刷新或点击刷新重试" />
        ) : rules.length === 0 ? (
          <Empty description="暂无流转规则" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rules.map((rule) => <RuleCard key={rule._id} rule={rule} />)}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

function RuleCard({ rule }: { rule: LeadTransferRule }) {
  const sourceCount = rule.userQuotas.filter((quota) => quota.role === 'source' || quota.role === 'both').length;
  const targetCount = rule.userQuotas.filter((quota) => quota.role === 'target' || quota.role === 'both').length;
  const conditions = rule.triggerConditions;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{rule.ruleName}</div>
        <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      </div>
      {rule.description && <div style={{ marginTop: 8, fontSize: 13, color: '#666', lineHeight: 1.5 }}>{rule.description}</div>}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', fontSize: 13, color: '#666' }}>
        <span>无活动：≥{conditions.inactiveHours}小时</span>
        <span>冷却期：{conditions.transferCooldownHours ?? 24}小时</span>
        <span>流出人员：{sourceCount} 人</span>
        <span>流入人员：{targetCount} 人</span>
        <span>已流转：{rule.statistics.totalTransferred || 0} 条</span>
        <span>策略：{strategyText[rule.distributionConfig?.strategy || ''] || '-'}</span>
      </div>
      {conditions.contractStatuses.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {conditions.contractStatuses.map((status) => <Tag key={status} color="primary" fill="outline">{status}</Tag>)}
        </div>
      )}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12, color: '#999' }}>
        执行时间：{rule.executionWindow.enabled ? `${rule.executionWindow.startTime} - ${rule.executionWindow.endTime}` : '全天'}
        {' · '}上次执行：{rule.statistics.lastExecutedAt ? fmtDateTime(rule.statistics.lastExecutedAt) : '未执行'}
      </div>
    </div>
  );
}

function RecordsTab() {
  const fetchPage = useCallback(async (page: number, limit: number) => {
    const result = await leadTransferService.getRecords({ page, limit });
    return { list: result.records, total: result.total };
  }, []);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<LeadTransferRecord>(fetchPage, 10);

  return (
    <PullToRefresh onRefresh={refresh}>
      <div style={{ padding: '12px 16px 80px', minHeight: '50vh' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button size="small" fill="none" onClick={refresh}><RedoOutline /> 刷新</Button>
        </div>
        {error && items.length === 0 ? (
          <ErrorBlock status="default" title="加载失败" description="下拉刷新或点击刷新重试" />
        ) : items.length === 0 && !hasMore ? (
          <Empty description="暂无流转记录" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((record) => <RecordCard key={record._id} record={record} />)}
          </div>
        )}
        <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
          {hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : null}
        </InfiniteScroll>
      </div>
    </PullToRefresh>
  );
}

function RecordCard({ record }: { record: LeadTransferRecord }) {
  const success = record.status === 'success';
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{record.customerName || '未命名客户'}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>客户编号：{record.customerNumber || '-'}</div>
        </div>
        <Tag color={success ? 'success' : 'danger'}>{success ? '成功' : '失败'}</Tag>
      </div>
      <div style={{ marginTop: 12, fontSize: 14, color: '#666' }}>{record.fromUserName || '-'} <span style={{ color: '#158F82' }}>→</span> {record.toUserName || '-'}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: '#666', lineHeight: 1.5 }}>规则：{record.ruleName || '-'}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>客户状态：{record.snapshot?.contractStatus || '-'} · 无活动：{record.snapshot?.inactiveHours ?? '-'}小时</div>
      {!success && record.errorMessage && <div style={{ marginTop: 8, fontSize: 13, color: '#FF3141', lineHeight: 1.5 }}>失败原因：{record.errorMessage}</div>}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12, color: '#999' }}>{fmtDateTime(record.transferredAt)}</div>
    </div>
  );
}

function StatisticsTab() {
  const [statistics, setStatistics] = useState<LeadTransferStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Deliberately omit date filters: this tab shows the all-time default statistics.
      setStatistics(await leadTransferService.getStatistics());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  if (loading && !statistics) return <div style={{ padding: 48, textAlign: 'center' }}><DotLoading color="primary" /></div>;
  if (error && !statistics) return <ErrorBlock status="default" title="加载失败" description="下拉刷新或点击刷新重试" style={{ padding: 24 }} />;
  if (!statistics) return <Empty description="暂无统计数据" />;

  const successRate = Number.parseFloat(statistics.successRate) || 0;
  return (
    <PullToRefresh onRefresh={loadStatistics}>
      <div style={{ padding: '12px 16px 80px', minHeight: '50vh' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button size="small" fill="none" onClick={loadStatistics} loading={loading}><RedoOutline /> 刷新</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatisticCard title="总流转数" value={statistics.totalCount} />
          <StatisticCard title="成功数" value={statistics.successCount} color="#00B96B" />
          <StatisticCard title="失败数" value={statistics.failedCount} color="#FF3141" />
          <StatisticCard title="成功率" value={`${successRate.toFixed(2)}%`} color={successRate >= 95 ? '#00B96B' : '#FF8F1F'} />
        </div>
      </div>
    </PullToRefresh>
  );
}

function StatisticCard({ title, value, color = '#1a1a1a' }: { title: string; value: number | string; color?: string }) {
  return <div style={{ ...cardStyle, padding: '18px 16px' }}><div style={{ color: '#666', fontSize: 13 }}>{title}</div><div style={{ marginTop: 8, color, fontSize: 25, fontWeight: 700 }}>{value}</div></div>;
}

export default function LeadTransferPage() {
  const [tab, setTab] = useState('rules');
  const canView = usePermission('customer:view');
  const isAdmin = useAuthStore((state) => state.roles.includes('admin'));

  if (!canView && !isAdmin) {
    return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><NavBar back={null} style={{ background: '#fff', fontWeight: 600 }}>线索流转</NavBar><AccessDenied description="您没有查看线索流转的权限。" /></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 60 }}>
      <NavBar back={null} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>线索流转</NavBar>
      <Tabs activeKey={tab} onChange={setTab} style={{ background: '#fff', '--title-font-size': '14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <Tabs.Tab title="流转规则" key="rules" />
        <Tabs.Tab title="流转记录" key="records" />
        <Tabs.Tab title="统计" key="statistics" />
      </Tabs>
      {tab === 'rules' && (isAdmin ? <RulesTab /> : <AccessDenied description="仅管理员可以查看流转规则。" />)}
      {tab === 'records' && (canView ? <RecordsTab /> : <AccessDenied description="您没有查看流转记录的权限。" />)}
      {tab === 'statistics' && (canView ? <StatisticsTab /> : <AccessDenied description="您没有查看流转统计的权限。" />)}
    </div>
  );
}