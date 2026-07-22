import { useCallback, useEffect, useState } from 'react';
import {
  NavBar,
  SearchBar,
  Tabs,
  PullToRefresh,
  InfiniteScroll,
  List,
  Tag,
  Empty,
  ErrorBlock,
  DotLoading,
  Button,
  Space,
  Toast,
  Dialog,
  Grid,
  Popup,
  Input,
  TextArea,
  Selector,
} from 'antd-mobile';
import { AddOutline, CheckShieldOutline, DeleteOutline, DownlandOutline, EyeOutline, HandPayCircleOutline, LoopOutline, MoreOutline, ReceivePaymentOutline, RedoOutline, StopOutline, UndoOutline, UserContactOutline } from 'antd-mobile-icons';
import { contractService } from '../../services/contractService';
import { approvalService } from '../../services/approvalService';
import { ContractForm } from './ContractForm';
import { PaymentConfigPopup } from './PaymentConfigPopup';
import { Switch } from 'antd-mobile';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import {
  useInfiniteList,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  CONTRACT_STATUS_TEXT,
  CONTRACT_STATUS_COLOR,
} from '../_shared';
import type { Contract, SignUrlItem, PaymentRecordItem } from '../../types';
import type { BackgroundReport, InsurancePolicy } from '../../types/modules';
import { backgroundCheckService, insuranceService } from '../../services/modules';
import { insuranceProducts } from '../../config/insuranceProducts';
import { useLocation, useNavigate } from 'react-router-dom';
import { shareMiniProgramCard } from '../../plugins/wechatShare';
import { copyTextToClipboard } from '../../plugins/clipboard';

// ── 爱签状态码 → 中文 ──────────────────────────
const ESIGN_STATUS_TEXT: Record<string, string> = {
  '0': '等待签约',
  '1': '签约中',
  '2': '已签约',
  '3': '已过期',
  '4': '已拒签',
  '6': '已作废',
  '7': '已撤销',
};
const esignStatusText = (s?: string) => (s ? ESIGN_STATUS_TEXT[s] || s : '-');

const TERMINAL_CONTRACT_STATUSES = new Set([
  'cancelled',
  'replaced',
  'refunded',
  'graduated',
]);

const terminalSigningText = (contract: Contract): string | null => {
  if (!TERMINAL_CONTRACT_STATUSES.has(contract.contractStatus || '')) return null;
  if (contract.esignStatus === '6') return '已作废';
  if (contract.contractStatus === 'refunded') return '已退款';
  if (contract.contractStatus === 'replaced') return '已换人';
  if (contract.contractStatus === 'graduated') return '已结单';
  return '已撤销';
};

// 金额工具：后端收款金额以「分」存储，展示时转元
const fmtCents = (cents?: number): string =>
  cents == null || Number.isNaN(Number(cents)) ? '-' : `¥${(Number(cents) / 100).toLocaleString()}`;

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  failed: '支付失败',
};
const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'default',
  failed: 'danger',
};

// 在系统浏览器/新标签打开外链（Capacitor 会把 http(s) 交给系统处理）
const openExternal = (url: string): void => {
  try {
    window.open(url, '_blank');
  } catch {
    /* ignore */
  }
};

const STATUS_TABS: { key: string; title: string }[] = [
  { key: 'all', title: '全部' },
  { key: 'signing', title: '签约中' },
  { key: 'signed', title: '已签约' },
  { key: 'active', title: '服务中' },
  { key: 'expiring', title: '临期' },
  { key: 'refunded', title: '退款' },
];

const statusText = (s?: string) => (s ? CONTRACT_STATUS_TEXT[s] || s : '-');
const canRequestRefund = (contract?: Contract): boolean => !!contract && (contract.contractStatus === 'active' || (contract.orderKind === 'aftersale' && contract.contractStatus === 'signed'));

const ORDER_KIND_META: Record<'new' | 'aftersale', { label: string; color: string; background: string }> = {
  new: { label: '新单', color: '#1677c8', background: '#e7f1ff' },
  aftersale: { label: '售后', color: '#b86b16', background: '#fff1df' },
};

function OrderKindBadge({ kind }: { kind?: Contract['orderKind'] }) {
  if (!kind) return null;
  const meta = ORDER_KIND_META[kind];
  if (!meta) return null;
  return <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 20, padding: '1px 7px', borderRadius: 20, color: meta.color, background: meta.background, fontSize: 11, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{meta.label}</span>;
}

const maskPhone = (phone?: string): string => {
  if (!phone) return '-';
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
};

const getContractEndDate = (record: Contract): number | null => {
  const tp = record.templateParams as Record<string, any>;
  const endDateStr = tp?.['合同结束时间'] || tp?.['服务结束时间'] ||
    (tp?.['结束年'] && tp?.['结束月'] && tp?.['结束日']
      ? `${tp['结束年']}年${String(tp['结束月']).padStart(2, '0')}月${String(tp['结束日']).padStart(2, '0')}日`
      : undefined);

  if (endDateStr) {
    const m = endDateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
    if (m) {
      const d = new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00`);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    const d = new Date(endDateStr);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (record.endDate) {
    const d = new Date(record.endDate);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
};

type InitialCustomer = { _id?: string; customerId?: string; name?: string; phone?: string; address?: string; idCardNumber?: string; serviceCategory?: string; expectedStartDate?: string; salaryBudget?: number; customerServiceFee?: number };
type ChangeWorkerInfo = { originalContractId: string; originalWorkerName?: string };
type View = { type: 'list' } | { type: 'detail'; id: string } | { type: 'form'; initialCustomer?: InitialCustomer; changeWorker?: ChangeWorkerInfo };

const floatingCreateStyle = { position: 'fixed' as const, right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 };

// ── 列表 ────────────────────────────────────────
function ListView({
  onOpen,
  onCreate,
  canCreate,
  initialStatus = 'all',
  approvalHint,
}: {
  onOpen: (id: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  initialStatus?: string;
  approvalHint?: 'refund' | 'salary';
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [statistics, setStatistics] = useState({
    total: 0,
    byStatus: {} as Record<string, number>,
    expiringWithin30Days: 0,
  });

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await contractService.getContracts({
        page,
        limit,
        search: search || undefined,
        status: status === 'all' || status === 'expiring' ? undefined : status,
        expiration: status === 'expiring' ? 'within30Days' : undefined,
      });
      return { list: res.contracts || [], total: res.total || 0 };
    },
    [search, status],
  );

  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<Contract>(fetchPage);

  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  useEffect(() => {
    contractService.getStatistics().then((stats) => {
      setStatistics({
        total: Number(stats?.total) || 0,
        byStatus: stats?.byStatus || {},
        expiringWithin30Days: Number(stats?.expiringWithin30Days) || 0,
      });
    }).catch(() => {});
  }, []);

  const statusCount = (key: string) => {
    if (key === 'all') return statistics.total;
    if (key === 'expiring') return statistics.expiringWithin30Days;
    if (key === 'signed') return (statistics.byStatus.active || 0) + (statistics.byStatus.signed || 0);
    return statistics.byStatus[key] || 0;
  };

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh' }}>
      <NavBar
        back={null}
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
        right={canCreate ? <AddOutline fontSize={22} onClick={onCreate} /> : null}
      >
        合同管理
      </NavBar>
      <div style={{ background: '#fff', padding: '8px 16px' }}>
        <SearchBar
          placeholder="搜索合同号 / 客户 / 手机号 / 阿姨"
          value={search}
          onChange={setSearch}
          onSearch={setSearch}
          style={{ '--border-radius': '8px', '--background': '#f5f7fa' }}
        />
      </div>
      <Tabs
        activeKey={status}
        onChange={setStatus}
        style={{
          background: '#fff',
          '--title-font-size': '14px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        {STATUS_TABS.map((t) => (
          <Tabs.Tab title={<span>{t.title} <span style={{ color: '#999', fontSize: 11 }}>{statusCount(t.key)}</span></span>} key={t.key} />
        ))}
      </Tabs>
      {approvalHint && <div style={{ margin: '10px 16px 0', padding: '9px 12px', borderRadius: 10, color: '#47615e', background: '#eaf7f4', fontSize: 12, lineHeight: 1.55 }}>已筛选服务中合同。进入合同详情后，在「更多操作」中点击「{approvalHint === 'refund' ? '申请退款' : '申请工资发放'}」。</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px 0' }}>
        {[
          ['总数', statistics.total, '#158F82'],
          ['已签', statusCount('signed'), '#00b578'],
          ['签约中', statusCount('signing'), '#ff8f1f'],
          ['临期', statistics.expiringWithin30Days, '#ff3141'],
        ].map(([label, value, color]) => (
          <div key={label as string} style={{ background: '#fff', borderRadius: 10, padding: '10px 4px', textAlign: 'center' }}>
            <div style={{ color: color as string, fontSize: 18, fontWeight: 700 }}>{value as number}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 3 }}>{label as string}</div>
          </div>
        ))}
      </div>

      <PullToRefresh onRefresh={refresh}>
        <div style={{ padding: '12px 16px 84px' }}>
          {error && items.length === 0 ? (
            <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" />
          ) : items.length === 0 && !hasMore ? (
            <Empty description="暂无合同" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((c) => (
                <div
                  key={c._id}
                  onClick={() => onOpen(c._id)}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: '#158F82', fontFamily: 'monospace', fontWeight: 600 }}>{c.contractNumber || '无编号'}</div>
                    <Tag
                      color={CONTRACT_STATUS_COLOR[c.contractStatus || ''] || 'default'}
                      style={{ borderRadius: 6, fontWeight: 500, padding: '2px 6px' }}
                    >
                      {statusText(c.contractStatus)}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, color: '#333' }}>
                      <div><span style={{ color: '#888' }}>客户 </span><b>{c.customerName || '-'}</b> <OrderKindBadge kind={c.orderKind} /><div style={{ color: '#999', fontSize: 11, marginTop: 3 }}>{maskPhone(c.customerPhone)}</div></div>
                      <div><span style={{ color: '#888' }}>阿姨 </span><b>{c.workerName || '-'}</b><div style={{ color: '#999', fontSize: 11, marginTop: 3 }}>{maskPhone(c.workerPhone)}</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
                      <span>{c.contractType || '合同类型未填写'}</span><span style={{ color: '#ddd' }}>|</span><span>{c.startDate ? fmtDate(c.startDate) : '-'} ~ {c.endDate ? fmtDate(c.endDate) : '-'}</span><span style={{ marginLeft: 'auto', color: '#ff8f1f', fontSize: 15, fontWeight: 700 }}>{fmtMoney(c.customerServiceFee)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* 背景调查 */}
                      <span style={{
                        background: c.hasBackgroundCheck ? '#e6f4ea' : '#f5f5f5',
                        color: c.hasBackgroundCheck ? '#00b578' : '#999',
                        padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 500
                      }}>
                        {c.hasBackgroundCheck ? '✓ 已背调' : '未背调'}
                      </span>

                      {/* 保险情况 */}
                      {c.orderCategory !== 'training' && (
                         <span style={{
                           background: c.insuranceStatus === 'sufficient' ? '#e6f4ea' : c.insuranceStatus === 'insufficient' ? '#fff5e6' : c.insuranceStatus === 'expired' ? '#ffeeee' : '#f5f5f5',
                           color: c.insuranceStatus === 'sufficient' ? '#00b578' : c.insuranceStatus === 'insufficient' ? '#ff8f1f' : c.insuranceStatus === 'expired' ? '#ff3141' : '#999',
                           padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 500
                         }}>
                           {c.insuranceStatus === 'sufficient' ? '保险: 充足' :
                            c.insuranceStatus === 'insufficient' ? '保险: 不足' :
                            c.insuranceStatus === 'expired' ? '保险: 超期' : '未投保'}
                         </span>
                      )}

                      {/* 到期情况 (只显示需要关注的，隐藏"否"减少噪音) */}
                      {(() => {
                         const endTs = getContractEndDate(c);
                         if (!endTs) return null;
                         const diff = (endTs - new Date().setHours(0,0,0,0)) / (1000 * 3600 * 24);
                         if (diff < 0) return <span style={{ background: '#ffeeee', color: '#ff3141', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>⚠️ 已过期</span>;
                         if (diff <= 30) return <span style={{ background: '#fff5e6', color: '#ff8f1f', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>⏰ 临近到期</span>;
                         return null;
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#999', fontSize: 11 }}>
                      <span>{c.salespersonName || (typeof c.createdBy === 'object' ? c.createdBy?.name : c.createdBy) || '未分配'}</span>
                      <span>{c.createdAt ? fmtDate(c.createdAt) : '-'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}
          </InfiniteScroll>
        </div>
      </PullToRefresh>
      {canCreate && <button type="button" aria-label="创建客户合同" onClick={onCreate} style={floatingCreateStyle}><AddOutline fontSize={20} /><span>创建合同</span></button>}
    </div>
  );
}

// ── 签署合同（电子签） ──────────────────────────
function SigningSection({
  contract,
  onStatusSynced,
}: {
  contract: Contract;
  onStatusSynced: () => void;
}) {
  const canEdit = usePermission('contract:edit');
  const [signers, setSigners] = useState<SignUrlItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const hasEsign = !!contract.esignContractNo;
  const terminalStatusText = terminalSigningText(contract);
  const isBusinessTerminated = !!terminalStatusText;

  const loadSignUrls = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await contractService.getSignUrls(contract._id);
      if (res.success) {
        setSigners(res.signUrls);
        setLoaded(true);
      } else {
        Toast.show({ content: res.message || '获取签署链接失败' });
      }
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '获取签署链接失败' });
    } finally {
      setLoading(false);
    }
  }, [contract._id, loading]);

  useEffect(() => {
    if (hasEsign && !isBusinessTerminated && !autoLoadTriggered) {
      setAutoLoadTriggered(true);
      loadSignUrls();
    }
  }, [hasEsign, isBusinessTerminated, autoLoadTriggered, loadSignUrls]);

  const doSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await contractService.syncEsignStatus(contract._id);
      if (res.success) {
        const isSyncedTerminal = TERMINAL_CONTRACT_STATUSES.has(res.contractStatus || contract.contractStatus || '');
        Toast.show({
          icon: 'success',
          content: `已同步：${isSyncedTerminal ? terminalStatusText || '合同已终止' : esignStatusText(res.esignStatus)}`,
        });
        onStatusSynced();
      } else {
        Toast.show({ content: res.message || '同步失败' });
      }
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '同步失败' });
    } finally {
      setSyncing(false);
    }
  }, [contract._id, contract.contractStatus, onStatusSynced, syncing, terminalStatusText]);

  const shareCustomerSigning = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const share = await contractService.createWechatSigningShare(contract._id);
      const shared = await shareMiniProgramCard({
        title: share.shareTitle,
        description: share.shareDescription,
        path: share.miniProgramPath,
        webpageUrl: share.webpageUrl,
      });
      Toast.show({
        icon: shared ? 'success' : undefined,
        content: shared ? '请在微信中选择客户发送签约卡片' : '当前版本不支持小程序卡片分享，请复制签署链接发送',
      });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '生成微信签约入口失败' });
    } finally {
      setSharing(false);
    }
  }, [contract._id, sharing]);

  const openSign = (s: SignUrlItem) => {
    if (!s.signUrl || s.signUrl.includes('无需签署')) {
      Toast.show({ content: s.signUrl || '暂无签署链接' });
      return;
    }
    openExternal(s.signUrl);
  };

  const copyLink = async (s: SignUrlItem) => {
    if (!s.signUrl || s.signUrl.includes('无需签署')) return;
    try {
      const textToCopy = `尊敬的${s.name || ''}，合同已生成请您签署：${s.signUrl}`;
      await copyTextToClipboard(textToCopy);
      Toast.show({ icon: 'success', content: '签署链接已复制' });
    } catch {
      Toast.show({ icon: 'fail', content: '复制失败，请长按链接手动复制' });
    }
  };

  const signedCount = signers.filter((signer) => Number(signer.status) === 2).length;

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ minHeight: 42, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #edf0f2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}><span style={{ width: 3, height: 14, borderRadius: 2, background: '#158F82' }} />电子合同状态</div>
        <span style={{ fontSize: 12, color: '#7a8696' }}>{isBusinessTerminated ? terminalStatusText : loaded ? `${signedCount} / ${signers.length} 签署` : esignStatusText(contract.esignStatus)}</span>
      </div>
      {!hasEsign ? (
        <div style={{ padding: '14px 16px', color: '#999', fontSize: 13 }}>该合同暂未发起电子签。</div>
      ) : (
        <>
          <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #edf0f2' }}>
            <Button size="mini" color="primary" loading={loading} disabled={loading || isBusinessTerminated} onClick={loadSignUrls}>{loaded ? '刷新签署链接' : '获取签署链接'}</Button>
            <Button size="mini" fill="outline" loading={syncing} disabled={syncing} onClick={doSync}>同步签署状态</Button>
            {canEdit && !isBusinessTerminated && contract.esignStatus !== '2' && <Button size="mini" color="primary" loading={sharing} disabled={sharing} onClick={shareCustomerSigning}>发客户签约卡</Button>}
          </div>
          {loaded && signers.length === 0 && <Empty description="暂无签署方" imageStyle={{ width: 60 }} style={{ padding: '12px 0' }} />}
          {signers.map((s, i) => {
            const signed = Number(s.status) === 2;
            const noSign = !s.signUrl || s.signUrl.includes('无需签署');
            const role = s.role || '签署方';
            const roleMark = role.includes('甲') ? '甲' : role.includes('乙') ? '乙' : role.includes('丙') ? '丙' : role.charAt(0);
            const roleStyle = roleMark === '甲' ? { color: '#5B8FF9', background: '#EAF2FF' } : roleMark === '乙' ? { color: '#18A999', background: '#E5F8F5' } : { color: '#F39B28', background: '#FFF3E3' };
            const signedAt = (s as SignUrlItem & { signedAt?: string; signTime?: string }).signedAt || (s as SignUrlItem & { signTime?: string }).signTime;
            return <div key={s.account || s.mobile || i} style={{ padding: '12px 14px', borderBottom: i < signers.length - 1 ? '1px dashed #edf0f2' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, ...roleStyle }}>{roleMark}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '20px' }}><span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{s.name || '未知'}</span><span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 11, color: '#687384', background: '#f3f5f7' }}>{role}</span></div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#8691a1' }}>{noSign ? '企业自动签章，无需手动签署' : s.mobile || '-'}</div>
                  {signed && signedAt && <div style={{ marginTop: 3, fontSize: 11, color: '#9aa5b1' }}>{fmtDateTime(signedAt)}</div>}
                </div>
                <Tag color={noSign ? 'default' : signed ? 'success' : isBusinessTerminated ? 'default' : 'warning'} fill="outline">{noSign ? '自动' : !signed && terminalStatusText ? terminalStatusText : s.statusText || (signed ? '已签署' : '待签署')}</Tag>
              </div>
              {!signed && !noSign && !isBusinessTerminated && canEdit && <Space style={{ margin: '8px 0 0 38px' }}><Button size="mini" color="primary" fill="outline" onClick={() => openSign(s)}>打开签署页</Button><Button size="mini" fill="outline" onClick={() => copyLink(s)}>复制链接</Button></Space>}
            </div>;
          })}
        </>
      )}
    </div>
  );
}

// ── 收钱（生成聚合收款码 + 收款流水） ────────────
function PaymentSection({ contract, onStatusSynced }: { contract: Contract; onStatusSynced?: () => void }) {
  const canEdit = usePermission('contract:edit');
  const [records, setRecords] = useState<PaymentRecordItem[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [configPopupOpen, setConfigPopupOpen] = useState(false);
  const enabled = contract.paymentEnabled === true;

  const loadRecords = useCallback(async () => {
    setRecLoading(true);
    try {
      setRecords(await contractService.getPaymentRecords(contract._id));
    } catch {
      /* 静默：无流水或无权限时不打扰 */
    } finally {
      setRecLoading(false);
    }
  }, [contract._id]);

  useEffect(() => {
    if (enabled) loadRecords();
  }, [enabled, loadRecords]);

  const paidTotal = records
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // PC BUG-013: if all paid, cannot modify payment
  const allPaid = enabled && !!contract.paymentTotalAmount && paidTotal >= contract.paymentTotalAmount;

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      setToggleLoading(true);
      try {
        await contractService.updateContract(contract._id, { paymentEnabled: false } as any);
        Toast.show({ icon: 'success', content: '已关闭收款' });
        onStatusSynced?.();
      } catch (e: any) {
        Toast.show({ icon: 'fail', content: e?.response?.data?.message || '操作失败' });
      } finally {
        setToggleLoading(false);
      }
    } else {
      if (allPaid) {
        Toast.show('该合同已收齐款项，不允许修改收款配置。');
        return;
      }
      setConfigPopupOpen(true);
    }
  };

  const showQr = useCallback(async () => {
    setQrLoading(true);
    try {
      const res = await contractService.generatePaymentQr(contract._id);
      Dialog.show({
        title: `收款 ${fmtCents(res.amount)}${res.label ? `（${res.label}）` : ''}`,
        content: (
          <div style={{ textAlign: 'center' }}>
            <img
              src={res.qrImage}
              alt="收款码"
              style={{ width: 220, height: 220, objectFit: 'contain' }}
            />
            <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
              请客户使用支付宝扫码支付
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              收款码 5 分钟内有效，支付完成后下拉刷新查看流水
            </div>
          </div>
        ),
        closeOnMaskClick: true,
        actions: [{ key: 'close', text: '关闭', onClick: () => loadRecords() }],
      });
    } catch (e) {
      Toast.show({
        icon: 'fail',
        content: e instanceof Error && e.message ? e.message : '生成收款码失败',
      });
    } finally {
      setQrLoading(false);
    }
  }, [contract._id, loadRecords]);

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>收款（{records.length} 笔流水）</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {enabled && canEdit && (
            <Button size="mini" color="primary" fill="none" disabled={allPaid} onClick={() => setConfigPopupOpen(true)}>
              修改方案
            </Button>
          )}
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={toggleLoading}
            style={{ '--height': '20px', '--width': '36px' }}
          />
        </div>
      </div>
      <List style={{ '--border-inner': '1px solid rgba(0,0,0,0.04)', '--border-top': 'none', '--border-bottom': 'none' }}>
        {!enabled ? (
          <List.Item>
            <div style={{ color: '#999', fontSize: 13, padding: '4px 0' }}>
              该合同未开启收款。请点击上方开关开启收款。
            </div>
          </List.Item>
        ) : (
          <>
            <List.Item extra={<span style={{ fontWeight: 600, color: '#FF8F1F' }}>{fmtCents(paidTotal)}</span>}>已收款合计</List.Item>
            {canEdit && (
              <List.Item>
                <Space wrap>
                  <Button size="small" color="primary" loading={qrLoading} onClick={showQr}>
                    生成收款码
                  </Button>
                  <Button size="small" fill="outline" loading={recLoading} onClick={loadRecords}>
                    刷新流水
                  </Button>
                </Space>
              </List.Item>
            )}
            {records.length === 0 ? (
              <List.Item>
                <Empty description="暂无收款流水" imageStyle={{ width: 60 }} />
              </List.Item>
            ) : (
              records.map((r, i) => (
                <List.Item
                  key={r._id || r.clientSn || i}
                  extra={<span style={{ fontWeight: 600 }}>{fmtCents(r.amount)}</span>}
                  description={fmtDateTime(r.paidAt || r.createdAt)}
                >
                  {r.label || `款项 ${i + 1}`}{' '}
                  <Tag
                    color={PAYMENT_STATUS_COLOR[r.status || ''] || 'default'}
                    fill="outline"
                    style={{ marginLeft: 4 }}
                  >
                    {PAYMENT_STATUS_TEXT[r.status || ''] || r.status || '-'}
                  </Tag>
                </List.Item>
              ))
            )}
          </>
        )}
      </List>

      <PaymentConfigPopup
        visible={configPopupOpen}
        contract={contract}
        onClose={() => setConfigPopupOpen(false)}
        onSuccess={() => {
          setConfigPopupOpen(false);
          onStatusSynced?.();
        }}
      />
    </div>
  );
}

const InfoGrid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 12px', padding: '0 16px 16px' }}>
    {children}
  </div>
);

const InfoItem = ({
  label,
  value,
  span = 1,
  valueColor = '#1a1a1a',
  valueWeight = 400,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  span?: number;
  valueColor?: string;
  valueWeight?: number | string;
}) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 14, color: valueColor, fontWeight: valueWeight, wordBreak: 'break-word' }}>
      {value}
    </div>
  </div>
);

function getInsuranceProductName(policy?: Pick<InsurancePolicy, 'productName' | 'productCode' | 'planCode'>) {
  if (!policy) return undefined;
  if (policy.productName) return policy.productName;
  const products = insuranceProducts.flatMap((product) => product.plans.map((plan) => ({ product, plan })));
  const matched = products.find(({ plan }) => policy.productCode && plan.productCode === policy.productCode && (!policy.planCode || plan.planCode === policy.planCode))
    || products.find(({ plan }) => policy.planCode && plan.planCode === policy.planCode);
  return matched?.product.name;
}

function ContractInsuranceTab({ data, policies, backgroundReport, loading, onOpenInsurance, onOpenBackgroundCheck }: { data: Contract; policies: InsurancePolicy[]; backgroundReport: BackgroundReport | null; loading: boolean; onOpenInsurance: () => void; onOpenBackgroundCheck: () => void }) {
  const policy = policies[0];
  const insuranceInfo = data.insuranceInfo as {
    hasInsurance?: boolean;
    status?: string;
    productName?: string;
    productCode?: string;
    planCode?: string;
    policies?: Array<Pick<InsurancePolicy, 'productName' | 'productCode' | 'planCode'>>;
  } | undefined;
  const summaryPolicy = insuranceInfo?.policies?.[0];
  const insuranceStatus = insuranceInfo?.status && insuranceInfo.status !== 'none' ? insuranceInfo.status : data.insuranceStatus || 'none';
  const hasInsurance = Boolean(policy || summaryPolicy || insuranceInfo?.hasInsurance || (data.insuranceStatus && data.insuranceStatus !== 'none'));
  const insuranceProductName = getInsuranceProductName(policy)
    || getInsuranceProductName(summaryPolicy)
    || insuranceInfo?.productName
    || getInsuranceProductName(insuranceInfo)
    || (hasInsurance ? '大树保服务无忧保障计划' : undefined);
  const insuranceLabel = !hasInsurance ? '未购买保险' : insuranceStatus === 'sufficient' ? '保险充足' : insuranceStatus === 'insufficient' ? '保险不足' : insuranceStatus === 'expired' ? '保险已超期' : '已购买保险';
  const hasBackgroundCheck = Boolean(backgroundReport || data.hasBackgroundCheck);
  const backgroundStatus = hasBackgroundCheck ? '已背调' : '未背调';
  return <div>
    <button type="button" onClick={onOpenInsurance} style={{ width: '100%', marginBottom: 14, padding: 16, border: 'none', borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.04)', textAlign: 'left', font: 'inherit', color: '#1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 24 }}>🛡️</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>保险</div><div style={{ marginTop: 4, color: hasInsurance ? '#16856f' : '#8a93a5', fontSize: 13, fontWeight: 600 }}>{insuranceLabel}</div></div><span style={{ color: '#aeb8c2', fontSize: 22 }}>›</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f2f5' }}><InfoItem label="被保险人" value={policy?.insuredName || data.workerName || '-'} /><InfoItem label="保险产品" value={insuranceProductName || '暂无保单'} /><InfoItem label="保单编号" value={policy?.policyNo || policy?.policyRef || '-'} /><InfoItem label="保费" value={policy ? fmtMoney(policy.totalPremium ?? policy.premium) : '-'} valueColor="#ec7a16" valueWeight={600} /><InfoItem label="生效日期" value={policy?.effectiveDate || policy?.startDate ? fmtDate(policy.effectiveDate || policy.startDate) : '-'} /><InfoItem label="到期日期" value={policy?.expireDate || policy?.endDate ? fmtDate(policy.expireDate || policy.endDate) : '-'} /></div>
      <div style={{ marginTop: 14, color: '#158F82', fontSize: 12, textAlign: 'right' }}>点击查看保险详情</div>
    </button>
    <button type="button" onClick={onOpenBackgroundCheck} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.04)', textAlign: 'left', font: 'inherit', color: '#1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 24 }}>🔎</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>背景调查</div><div style={{ marginTop: 4, color: hasBackgroundCheck ? '#16856f' : '#8a93a5', fontSize: 13, fontWeight: 600 }}>{backgroundStatus}</div></div><span style={{ color: '#aeb8c2', fontSize: 22 }}>›</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f2f5' }}><InfoItem label="调查对象" value={backgroundReport?.name || data.workerName || '-'} /><InfoItem label="调查套餐" value={backgroundReport?.packageType === '2' ? '高级查询' : backgroundReport ? '基础查询' : '-'} /><InfoItem label="报告编号" value={backgroundReport?.reportId || '-'} /><InfoItem label="风险结果" value={backgroundReport?.reportResult?.riskLevel || (hasBackgroundCheck ? '待返回' : '未背调')} valueColor={backgroundReport?.reportResult?.riskLevel ? '#16856f' : '#8a93a5'} /><InfoItem label="发起时间" value={backgroundReport?.createdAt ? fmtDateTime(backgroundReport.createdAt) : '-'} /><InfoItem label="更新时间" value={backgroundReport?.updatedAt ? fmtDateTime(backgroundReport.updatedAt) : '-'} /></div>
      <div style={{ marginTop: 14, color: '#158F82', fontSize: 12, textAlign: 'right' }}>点击查看背调详情</div>
    </button>
    {loading && <div style={{ padding: 16, color: '#8a93a5', fontSize: 12, textAlign: 'center' }}>正在同步保险与背调详情…</div>}
  </div>;
}
// ── 详情 ────────────────────────────────────────
function DetailView({ id, onBack, onChangeWorker }: { id: string; onBack: () => void; onChangeWorker: (contract: Contract) => void }) {
  const { data, loading, error, run } = useApi<Contract>(contractService.getContractById);
  const navigate = useNavigate();
  const reload = useCallback(() => {
    run(id).catch(() => {});
  }, [id, run]);
  useEffect(() => {
    reload();
  }, [reload]);

  const isAdmin = usePermission('contract:delete');
  const canAssign = usePermission('contract:assign');
  const canDelete = usePermission('contract:delete');
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [syncEsignLoading, setSyncEsignLoading] = useState(false);
  const [syncInsuranceLoading, setSyncInsuranceLoading] = useState(false);
  const [reinitiateLoading, setReinitiateLoading] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [paymentConfigVisible, setPaymentConfigVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<Array<{ _id: string; name?: string; username?: string }>>([]);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [assignReason, setAssignReason] = useState('');
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [refundVisible, setRefundVisible] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [bankCardNumber, setBankCardNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [salaryRemark, setSalaryRemark] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([]);
  const [backgroundReport, setBackgroundReport] = useState<BackgroundReport | null>(null);
  const [insuranceDetailLoading, setInsuranceDetailLoading] = useState(false);
  const workerIdCard = data?.workerIdCard?.trim();

  useEffect(() => {
    if (detailTab !== 'insurance' || !workerIdCard) {
      if (detailTab === 'insurance') { setInsurancePolicies([]); setBackgroundReport(null); }
      return;
    }
    let cancelled = false;
    setInsuranceDetailLoading(true);
    Promise.all([
      insuranceService.getPoliciesByIdCard(workerIdCard).catch(() => []),
      backgroundCheckService.getReportByIdNo(workerIdCard).catch(() => null),
    ]).then(([policies, report]) => {
      if (!cancelled) { setInsurancePolicies(policies); setBackgroundReport(report); }
    }).finally(() => {
      if (!cancelled) setInsuranceDetailLoading(false);
    });
    return () => { cancelled = true; };
  }, [detailTab, workerIdCard]);

  const handlePreview = async () => {
    if (!data?.esignContractNo) { Toast.show('暂无爱签合同编号'); return; }
    try {
      Toast.show({ icon: 'loading', content: '正在获取预览...' });
      const res = await contractService.previewContract(data.esignContractNo);
      if (res?.previewUrl || res?.previewData) {
        window.location.href = res.previewUrl || res.previewData;
      } else if (res?.success === false) {
        Toast.show({ icon: 'fail', content: res.message || '获取预览失败' });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '预览失败' });
    }
  };

  const handleDownload = async () => {
    if (!data?.esignContractNo) { Toast.show('暂无爱签合同编号'); return; }
    try {
      setDownloadLoading(true);
      Toast.show({ icon: 'loading', content: '准备下载...' });
      const res = await contractService.downloadContract(data._id);
      if (res?.data?.data) {
        // base64 download is tricky in some mobile browsers without a proper blob link.
        // We'll use a direct link approach if possible, but let's stick to the frontend logic
        const byteCharacters = atob(res.data.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: res.data.fileType === 1 ? 'application/zip' : 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = res.data.fileName || `${data.esignContractNo}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        Toast.clear();
      } else {
        Toast.show({ icon: 'fail', content: '无下载数据' });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '下载失败' });
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleSyncEsign = async () => {
    if (!data?._id) return;
    try {
      setSyncEsignLoading(true);
      const res = await contractService.syncEsignStatus(data._id);
      if (res.success) {
        Toast.show({ icon: 'success', content: res.message || '同步成功' });
        reload();
      } else {
        Toast.show({ icon: 'fail', content: res.message || '同步失败' });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e?.response?.data?.message || e.message || '同步失败' });
    } finally {
      setSyncEsignLoading(false);
    }
  };

  const handleSyncInsurance = async () => {
    if (!data?._id) return;
    try {
      setSyncInsuranceLoading(true);
      const res = await contractService.syncInsurance(data._id);
      if (res.success) {
        Toast.show({ icon: 'success', content: res.message || '保险同步成功' });
        reload();
      } else {
        Toast.show({ icon: 'fail', content: res.message || '保险同步失败' });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e?.response?.data?.message || e.message || '保险同步失败' });
    } finally {
      setSyncInsuranceLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!data?.esignContractNo) return;
    Dialog.confirm({
      content: '确认撤销该合同吗？撤销后无法恢复。',
      onConfirm: async () => {
        try {
          const res = await contractService.withdrawContract(data.esignContractNo!);
          if (res.success) {
            Toast.show({ icon: 'success', content: '已撤销' });
            reload();
          } else {
            Toast.show({ icon: 'fail', content: res.message || '撤销失败' });
          }
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '撤销失败' });
        }
      }
    });
  };

  const handleInvalidate = async () => {
    if (!data?.esignContractNo) return;
    Dialog.confirm({
      content: '确认作废该合同吗？',
      onConfirm: async () => {
        try {
          const res = await contractService.invalidateContract(data.esignContractNo!);
          if (res.success) {
            Toast.show({ icon: 'success', content: '已作废' });
            reload();
          } else {
            Toast.show({ icon: 'fail', content: res.message || '作废失败' });
          }
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '作废失败' });
        }
      }
    });
  };

  // 草稿且无爱签编号：属于「创建成功但电子签未发起」的中间态，允许首次发起
  const canFirstInitiate = !data?.esignContractNo && data?.contractStatus === 'draft';
  const reinitiateText = canFirstInitiate ? '发起电子签' : '重新发起签约';

  const handleReinitiate = async () => {
    if (!data?._id) return;
    Dialog.confirm({
      content: canFirstInitiate ? '确认发起电子签吗？' : '确认重新发起签约吗？',
      onConfirm: async () => {
        try {
          setReinitiateLoading(true);
          const res = await contractService.reinitiateEsign(data._id!);
          if (res.success) {
            Toast.show({ icon: 'success', content: canFirstInitiate ? '电子签已发起' : '已重新发起' });
            reload();
          } else {
            Toast.show({ icon: 'fail', content: res.message || '发起失败' });
          }
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '发起失败' });
        } finally {
          setReinitiateLoading(false);
        }
      }
    });
  };

  const openAssign = async () => {
    if (!data?._id) return;
    try {
      setAssignableUsers(await contractService.getAssignableUsers());
      setAssignedTo([]); setAssignReason(''); setAssignVisible(true);
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '负责人列表加载失败' });
    }
  };
  const submitAssign = async () => {
    if (!data?._id || !assignedTo[0]) return;
    setSubmittingAction(true);
    try {
      await contractService.assignContract(data._id, assignedTo[0], assignReason.trim() || undefined);
      Toast.show({ icon: 'success', content: '合同分配成功' }); setAssignVisible(false); reload();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '合同分配失败' });
    } finally { setSubmittingAction(false); }
  };
  const submitDeletion = async () => {
    if (!data?._id) return;
    setSubmittingAction(true);
    try {
      const result = await contractService.requestDeletion(data._id, deleteReason.trim() || undefined);
      if (result.success === false) throw new Error(result.message || '操作失败');
      Toast.show({ icon: 'success', content: result.message || '删除申请已提交' }); setDeleteVisible(false); onBack();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '删除申请失败' });
    } finally { setSubmittingAction(false); }
  };
  const submitRefund = async () => {
    const amount = Number(refundAmount);
    if (!data?._id || !Number.isFinite(amount) || amount <= 0 || !refundReason.trim()) return;
    setSubmittingAction(true);
    try {
      await approvalService.applyRefund(data._id, amount, refundReason.trim());
      Toast.show({ icon: 'success', content: '退款申请已提交，等待审批' }); setRefundVisible(false); reload();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '退款申请失败' });
    } finally { setSubmittingAction(false); }
  };
  const submitSalary = async () => {
    const amount = Number(salaryAmount);
    if (!data?._id || !Number.isFinite(amount) || amount <= 0) return;
    setSubmittingAction(true);
    try {
      await approvalService.applySalary({ contractId: data._id, salaryAmount: amount, bankCardNumber: bankCardNumber.trim() || undefined, bankName: bankName.trim() || undefined, remark: salaryRemark.trim() || undefined });
      Toast.show({ icon: 'success', content: '工资发放申请已提交，等待审批' }); setSalaryVisible(false); reload();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '工资申请失败' });
    } finally { setSubmittingAction(false); }
  };

  const moreActions = [
    { icon: <EyeOutline />, text: '预览合同', key: 'preview', disabled: !data?.esignContractNo, onClick: handlePreview },
    { icon: <DownlandOutline />, text: '下载合同', key: 'download', disabled: !data?.esignContractNo || downloadLoading, onClick: handleDownload },
    { icon: <ReceivePaymentOutline />, text: '收款', key: 'payment', onClick: () => setPaymentConfigVisible(true) },
    ...(canAssign ? [{ icon: <UserContactOutline />, text: '分配合同', key: 'assign', onClick: openAssign }] : []),
    { icon: <RedoOutline />, text: '同步签约状态', key: 'sync', disabled: !data?.esignContractNo || syncEsignLoading, onClick: handleSyncEsign },
    ...(data?.orderCategory !== 'training' ? [{ icon: <CheckShieldOutline />, text: '保险同步', key: 'insurance', disabled: syncInsuranceLoading, onClick: handleSyncInsurance }] : []),
    { icon: <RedoOutline />, text: reinitiateText, key: 'reinitiate', disabled: (!data?.esignContractNo && !canFirstInitiate) || reinitiateLoading, onClick: handleReinitiate },
    // 换人：仅家政客户合同显示（职培订单无阿姨，后端也不支持换人）
    ...(data?.orderCategory !== 'training' && !!data?.workerName ? [{ icon: <LoopOutline />, text: '换人', key: 'changeWorker', onClick: () => { setActionSheetVisible(false); if (data) onChangeWorker(data); } }] : []),
    ...(data?.orderCategory !== 'training' ? [{ icon: <UndoOutline />, text: '撤销合同', key: 'withdraw', danger: true, disabled: !data?.esignContractNo, onClick: handleWithdraw }] : []),
    ...(isAdmin ? [{ icon: <StopOutline />, text: '作废合同', key: 'invalidate', danger: true, disabled: !data?.esignContractNo, onClick: handleInvalidate }] : []),
    ...(canRequestRefund(data ?? undefined) ? [{ icon: <ReceivePaymentOutline />, text: '申请退款', key: 'refund', onClick: () => { setRefundAmount(''); setRefundReason(''); setRefundVisible(true); } }] : []),
    ...(data?.workerName ? [{ icon: <HandPayCircleOutline />, text: '申请工资发放', key: 'salary', onClick: () => { setSalaryAmount(data.workerSalary ? String(data.workerSalary) : ''); setBankCardNumber(''); setBankName(''); setSalaryRemark(''); setSalaryVisible(true); } }] : []),
    ...(canDelete ? [{ icon: <DeleteOutline />, text: '删除合同', key: 'delete', danger: true, onClick: () => { setDeleteReason(''); setDeleteVisible(true); } }] : []),
  ];

  const openInsurance = () => navigate('/insurance', { state: { insuranceWorkerIdCard: workerIdCard } });
  const openBackgroundCheck = () => navigate('/background-check', { state: { backgroundCheckWorkerIdNo: workerIdCard } });

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
      <NavBar
        onBack={onBack}
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
        right={
          data ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={handleDownload} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 32, padding: 0, border: 'none', background: 'transparent', color: '#158F82', font: 'inherit', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>下载</button>
              <button type="button" aria-label="更多操作" onClick={() => setActionSheetVisible(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 4, border: 'none', background: 'transparent', color: '#1a1a1a', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>
                <MoreOutline />
              </button>
            </div>
          ) : null
        }
      >
        合同详情
      </NavBar>
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <DotLoading color="primary" />
        </div>
      )}
      {error && !data && (
        <ErrorBlock status="default" title="加载失败" description="返回重试" style={{ padding: 24 }} />
      )}
      {data && <>
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ background: 'linear-gradient(135deg, #158F82, #27AEA0)', borderRadius: 16, padding: 18, color: '#fff', boxShadow: '0 4px 14px rgba(21,143,130,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12, fontFamily: 'monospace', opacity: 0.9 }}>{data.contractNumber || '无编号'}</span><OrderKindBadge kind={data.orderKind} /><span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>{statusText(data.contractStatus)}</span></div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 8 }}>{data.contractType || '合同详情'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 8, fontSize: 12, lineHeight: 1, opacity: 0.94 }}><span>{data.startDate ? fmtDate(data.startDate) : '-'} ~ {data.endDate ? fmtDate(data.endDate) : '-'}</span><span style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(data.customerServiceFee)}</span></div>
          </div>
        </div>
        <Tabs activeKey={detailTab} onChange={setDetailTab} style={{ marginTop: 12, background: '#fff', '--title-font-size': '14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <Tabs.Tab title="概览" key="overview" /><Tabs.Tab title="费用" key="payment" /><Tabs.Tab title="合同" key="contract" /><Tabs.Tab title="合同保险" key="insurance" />
        </Tabs>
        <div style={{ padding: 16 }}>
          {detailTab === 'overview' && <>
            <div style={{ marginBottom: 16 }}><SigningSection contract={data} onStatusSynced={reload} /></div>
            <div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>合同基本信息</div><InfoGrid><InfoItem label="合同编号" value={data.contractNumber || '-'} valueColor="#158F82" valueWeight={600} span={2} /><InfoItem label="合同类型" value={data.contractType || '-'} /><InfoItem label="合同状态" value={statusText(data.contractStatus)} /><InfoItem label="订单来源" value={data.salesSource || '-'} /><InfoItem label="推荐码" value={data.referralCode || '-'} /><InfoItem label="服务开始日期" value={data.startDate ? fmtDate(data.startDate) : '-'} /><InfoItem label="服务结束日期" value={data.endDate ? fmtDate(data.endDate) : '-'} /></InfoGrid></div>
            <div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>客户 / 服务人员</div><InfoGrid><InfoItem label="客户姓名" value={data.customerName || '-'} valueWeight={500} /><InfoItem label="客户电话" value={data.customerPhone || '-'} /><InfoItem label="服务人员姓名" value={data.workerName || '-'} valueWeight={500} /><InfoItem label="服务人员电话" value={data.workerPhone || '-'} /><InfoItem label="服务地址" value={data.customerAddress || '-'} span={2} /></InfoGrid></div>
            <div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>其他信息</div><InfoGrid><InfoItem label="预产期" value={data.expectedDeliveryDate ? fmtDate(data.expectedDeliveryDate) : '-'} valueColor="#eb2f96" /><InfoItem label="发薪日" value={data.salaryPaymentDay ? `每月 ${data.salaryPaymentDay} 日` : '-'} /><InfoItem label="月工作天数" value={data.monthlyWorkDays ? `${data.monthlyWorkDays} 天` : '-'} />{data.remarks ? <InfoItem label="备注信息" value={data.remarks} span={2} /> : null}</InfoGrid></div>
          </>}
          {detailTab === 'payment' && <><div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>费用信息</div><InfoGrid><InfoItem label="人员薪资" value={fmtMoney(data.workerSalary)} valueColor="#FF8F1F" valueWeight={600} /><InfoItem label="客户服务费" value={fmtMoney(data.customerServiceFee)} valueColor="#FF8F1F" valueWeight={600} /><InfoItem label="劳动者服务费" value={fmtMoney(data.workerServiceFee)} /><InfoItem label="约定定金" value={fmtMoney(data.deposit)} /><InfoItem label="约定尾款" value={fmtMoney(data.finalPayment)} />{data.refundAmount != null && data.refundAmount > 0 ? <InfoItem label="累计已退金额" value={fmtMoney(data.refundAmount)} valueColor="#FF3141" /> : null}</InfoGrid></div><PaymentSection contract={data} onStatusSynced={reload} /></>}
          {detailTab === 'contract' && <><div style={{ background: '#fff', borderRadius: 16, marginBottom: 16, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 600 }}>合同文件</div><div style={{ color: '#777', fontSize: 13, margin: '8px 0 12px' }}>可在线预览或下载电子合同文件。</div><Space><Button size="small" color="primary" disabled={!data.esignContractNo} onClick={handlePreview}>预览合同</Button><Button size="small" fill="outline" disabled={!data.esignContractNo || downloadLoading} loading={downloadLoading} onClick={handleDownload}>下载合同</Button></Space></div><div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>服务双方完整信息</div><InfoGrid><InfoItem label="客户身份证" value={data.customerIdCard || '-'} span={2} /><InfoItem label="服务人员身份证" value={data.workerIdCard || '-'} span={2} /><InfoItem label="劳动者地址" value={data.workerAddress || '-'} span={2} /></InfoGrid></div></>}
          {detailTab === 'insurance' && <ContractInsuranceTab data={data} policies={insurancePolicies} backgroundReport={backgroundReport} loading={insuranceDetailLoading} onOpenInsurance={openInsurance} onOpenBackgroundCheck={openBackgroundCheck} />}
          {detailTab === 'notes' && <><div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>其他信息</div><InfoGrid><InfoItem label="预产期" value={data.expectedDeliveryDate ? fmtDate(data.expectedDeliveryDate) : '-'} valueColor="#eb2f96" /><InfoItem label="发薪日" value={data.salaryPaymentDay ? `每月 ${data.salaryPaymentDay} 日` : '-'} /><InfoItem label="月工作天数" value={data.monthlyWorkDays ? `${data.monthlyWorkDays} 天` : '-'} /></InfoGrid></div>{data.remarks ? <div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>备注信息</div><div style={{ padding: '0 16px 16px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{data.remarks}</div></div> : null}<div style={{ background: '#fff', borderRadius: 16, marginBottom: 16 }}><div style={{ padding: '16px 16px 12px', fontSize: 15, fontWeight: 600 }}>系统信息</div><InfoGrid><InfoItem label="创建人" value={(typeof data.createdBy === 'object' ? data.createdBy?.name : data.createdBy) || '-'} /><InfoItem label="业绩归属销售员" value={data.salespersonName || '-'} /><InfoItem label="创建时间" value={fmtDateTime(data.createdAt)} /><InfoItem label="最后更新时间" value={fmtDateTime(data.updatedAt)} /></InfoGrid></div></>}
        </div>
      </>}

      {data && <PaymentConfigPopup
        visible={paymentConfigVisible}
        contract={data}
        onClose={() => setPaymentConfigVisible(false)}
        onSuccess={() => { setPaymentConfigVisible(false); reload(); }}
      />}

      <Popup
        visible={actionSheetVisible}
        onMaskClick={() => setActionSheetVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '24px 16px' }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#333' }}>更多操作</div>
        <Grid columns={4} gap={[16, 24]}>
          {moreActions.map((item) => (
            <Grid.Item key={item.key} onClick={() => { if (!item.disabled) { item.onClick(); setActionSheetVisible(false); } }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: item.disabled ? 'not-allowed' : 'pointer', opacity: item.disabled ? 0.4 : 1 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: item.danger ? '#fff1f0' : '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: item.danger ? '#ff4d4f' : '#666', marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{item.text}</div>
            </Grid.Item>
          ))}
        </Grid>
        <div style={{ marginTop: 32 }}><Button block shape="rounded" onClick={() => setActionSheetVisible(false)} style={{ background: '#f5f7fa', color: '#666', border: 'none' }}>取消</Button></div>
      </Popup>
      <Popup visible={assignVisible} onMaskClick={() => !submittingAction && setAssignVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>分配合同</div>
        <Selector columns={2} options={assignableUsers.map((user) => ({ label: user.name || user.username || '未命名', value: user._id }))} value={assignedTo} onChange={setAssignedTo} />
        <div style={{ marginTop: 14 }}><Input value={assignReason} onChange={setAssignReason} placeholder="分配原因（可选）" clearable /></div>
        <Button block color="primary" loading={submittingAction} disabled={!assignedTo[0] || submittingAction} onClick={submitAssign} style={{ marginTop: 18 }}>确认分配</Button>
      </Popup>
      <Popup visible={deleteVisible} onMaskClick={() => !submittingAction && setDeleteVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>删除合同</div><div style={{ color: '#7a8696', fontSize: 13, marginBottom: 14 }}>有直删权限时将直接删除；否则会提交删除审批。</div>
        <TextArea value={deleteReason} onChange={setDeleteReason} placeholder="删除原因（可选）" />
        <Button block color="danger" loading={submittingAction} disabled={submittingAction} onClick={submitDeletion} style={{ marginTop: 18 }}>确认提交</Button>
      </Popup>
      <Popup visible={refundVisible} onMaskClick={() => !submittingAction && setRefundVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>申请退款</div><Input type="number" value={refundAmount} onChange={setRefundAmount} placeholder="退款金额（元）" /><div style={{ marginTop: 12 }}><TextArea value={refundReason} onChange={setRefundReason} placeholder="退款原因（必填）" /></div>
        <Button block color="primary" loading={submittingAction} disabled={!Number(refundAmount) || !refundReason.trim() || submittingAction} onClick={submitRefund} style={{ marginTop: 18 }}>提交退款审批</Button>
      </Popup>
      <Popup visible={salaryVisible} onMaskClick={() => !submittingAction && setSalaryVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>申请阿姨工资发放</div><Input type="number" value={salaryAmount} onChange={setSalaryAmount} placeholder="发放金额（元）" /><div style={{ marginTop: 12 }}><Input value={bankCardNumber} onChange={setBankCardNumber} placeholder="银行卡号（可选）" clearable /></div><div style={{ marginTop: 12 }}><Input value={bankName} onChange={setBankName} placeholder="开户行（可选）" clearable /></div><div style={{ marginTop: 12 }}><TextArea value={salaryRemark} onChange={setSalaryRemark} placeholder="备注（可选）" /></div>
        <Button block color="primary" loading={submittingAction} disabled={!Number(salaryAmount) || submittingAction} onClick={submitSalary} style={{ marginTop: 18 }}>提交工资审批</Button>
      </Popup>
    </div>
  );
}

export default function ContractList() {
  const location = useLocation();
  const stateId = location.state?.id;
  const createRequested = location.state?.create === true;
  const initialCustomer = location.state?.createForCustomer as InitialCustomer | undefined;
  const initialStatus = location.state?.initialStatus === 'active' ? 'active' : 'all';
  const approvalHint = location.state?.approvalHint === 'refund' || location.state?.approvalHint === 'salary' ? location.state.approvalHint : undefined;
  const [view, setView] = useState<View>(stateId ? { type: 'detail', id: stateId } : initialCustomer || createRequested ? { type: 'form', initialCustomer } : { type: 'list' });
  const canCreate = usePermission('contract:create');
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    if (initialCustomer) setView({ type: 'form', initialCustomer });
  }, [initialCustomer]);

  useEffect(() => {
    if (createRequested) setView({ type: 'form' });
  }, [createRequested]);

  if (view.type === 'detail') {
    return (
      <DetailView
        id={view.id}
        onBack={() => setView({ type: 'list' })}
        onChangeWorker={(contract) =>
          setView({
            type: 'form',
            changeWorker: { originalContractId: contract._id, originalWorkerName: contract.workerName },
            initialCustomer: {
              _id: typeof contract.customerId === 'object' ? contract.customerId?._id : contract.customerId,
              name: contract.customerName,
              phone: contract.customerPhone,
              address: contract.customerAddress,
              idCardNumber: contract.customerIdCard,
              serviceCategory: contract.contractType,
              salaryBudget: contract.workerSalary,
              customerServiceFee: contract.customerServiceFee,
            },
          })
        }
      />
    );
  }
  if (view.type === 'form') {
    return (
      <ContractForm
        initialCustomer={view.initialCustomer}
        changeWorker={view.changeWorker}
        onBack={() => setView({ type: 'list' })}
        onSaved={(id) => {
          setListKey((k) => k + 1);
          if (id) {
            setView({ type: 'detail', id });
          } else {
            setView({ type: 'list' });
          }
        }}
      />
    );
  }
  return (
    <ListView
      key={listKey}
      canCreate={canCreate}
      initialStatus={initialStatus}
      approvalHint={approvalHint}
      onOpen={(id) => setView({ type: 'detail', id })}
      onCreate={() => setView({ type: 'form' })}
    />
  );
}
