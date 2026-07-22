import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorWechat } from '@capgo/capacitor-wechat';
import { QRCodeSVG } from 'qrcode.react';
import {
  Button,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  Input,
  List,
  NavBar,
  Popup,
  PullToRefresh,
  SearchBar,
  Selector,
  Tabs,
  Tag,
  TextArea,
  Toast,
} from 'antd-mobile';
import { AddOutline, DownlandOutline, RedoOutline } from 'antd-mobile-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { insuranceProducts } from '../config/insuranceProducts';
import type { InsurancePlan } from '../config/insuranceProducts';
import { usePermission } from '../hooks/usePermission';
import { contractService } from '../services/contractService';
import { insuranceService } from '../services/modules';
import type { CreatePolicyData, InsurancePolicy, InsuredPerson, PolicyHolder } from '../types/modules';
import type { PartySearchResult } from '../types/esign';
import { useInfiniteList } from './_shared';

type PolicyView = { type: 'list' } | { type: 'detail'; policy: InsurancePolicy } | { type: 'create' };
type Action = 'surrender' | 'amend' | 'add' | null;

const STATUS = {
  all: ['全部', 'default'], pending: ['待支付', 'warning'], processing: ['处理中', 'primary'],
  active: ['已生效', 'success'], expired: ['已过期', 'default'], cancelled: ['已注销', 'danger'], surrendered: ['已退保', 'default'],
} as const;
const SURRENDER_REASONS = [
  { label: '退票退保', value: '13' }, { label: '航班取消', value: '14' }, { label: '航班改签', value: '15' },
];
const EMPTY_INSURED: InsuredPerson = { insuredName: '', idType: '1', idNumber: '', birthDate: '', gender: 'M', mobile: '' };
const DEFAULT_HOLDER: PolicyHolder = {
  policyHolderType: 'C', policyHolderName: '北京安得家政有限公司', phIdType: '14', phIdNumber: '91110111MACJMD2R5J',
  phAddress: '北京市朝阳区望京园602号楼3层365', phProvinceCode: '110000', phCityCode: '110100', phDistrictCode: '110105',
};

const idOf = (policy: InsurancePolicy) => policy._id || policy.id || '';
const dateOnly = (value?: string) => !value ? '-' : value.includes('-') ? value.slice(0, 10) : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const money = (value?: number) => `¥${Number(value || 0).toFixed(2)}`;
const formatLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return formatLocalDate(d); };
const asDashubaoDate = (date: string, end = false) => `${date.replaceAll('-', '')}${end ? '235959' : '000000'}`;
const addPeriod = (start: string, plan: InsurancePlan, months: number) => {
  const d = new Date(`${start}T00:00:00`);
  if (plan.period === 'year') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
};
const fromIdCard = (idNumber: string) => {
  if (!/^\d{17}[\dXx]$/.test(idNumber)) return null;
  const birth = idNumber.slice(6, 14);
  if (Number.isNaN(new Date(`${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`).getTime())) return null;
  return { birthDate: `${birth}000000`, gender: Number(idNumber[16]) % 2 ? 'M' : 'F' };
};
const genderFromWorker = (gender?: string) => gender === '男' || gender === 'male' ? 'M' : gender === '女' || gender === 'female' ? 'F' : undefined;
const errorText = (error: any, fallback: string) => error?.response?.data?.message || error?.message || fallback;
const isPaymentUrl = (value?: string) => {
  try {
    const scheme = new URL(value || '').protocol.toLowerCase();
    return scheme === 'https:' || scheme === 'weixin:';
  } catch {
    return false;
  }
};
// App 内已具备唤起本机微信的原生能力（MWEB H5支付 + 原生跳转），但大树保微信支付商户号
// 尚未将 crm.andejiazheng.com 报备为"H5支付授权域名"，跳转会提示"商家存在未配置的参数"。
const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
const paymentTradeType = () => (isNativeApp() ? 'APP' : 'NATIVE');
// 与 CRM 端 InsuranceList 保持一致：是否生效由保单生效时间判断，不以本地 status 为唯一依据。
const isPolicyEffective = (effectiveDate?: string) => {
  if (!effectiveDate) return false;
  const value = effectiveDate.trim();
  const date = /^\d{8}(?:\d{6})?$/.test(value)
    ? new Date(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(8, 10) || '0'),
      Number(value.slice(10, 12) || '0'),
      Number(value.slice(12, 14) || '0'),
    )
    : new Date(value);
  return !Number.isNaN(date.getTime()) && new Date() >= date;
};

function PolicyTag({ status }: { status?: string }) {
  const item = STATUS[status as keyof typeof STATUS] || [status || '未知', 'default'];
  return <Tag color={item[1]} fill="outline">{item[0]}</Tag>;
}

const CARD_STYLE = { background: '#fff', borderRadius: 14, boxShadow: '0 3px 12px rgba(24, 42, 66, .055)', overflow: 'hidden' } as const;
const BOTTOM_ACTION_STYLE = { minWidth: 0, height: 42, padding: '0 6px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' } as const;

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section style={CARD_STYLE}><div style={{ minHeight: 48, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eef1f4' }}><b style={{ fontSize: 15, color: '#243040' }}>{title}</b>{action}</div>{children}</section>;
}

function InfoRow({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return <div style={{ minHeight: 54, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: last ? 'none' : '1px solid #f0f2f5' }}><span style={{ color: '#475569', fontSize: 14, flexShrink: 0 }}>{label}</span><div style={{ flex: 1, minWidth: 0, textAlign: 'right', color: '#172033', fontSize: 14 }}>{children}</div></div>;
}

function WechatQrPaymentPopup({ url, amount, loading, onSync, onClose }: { url: string; amount?: number; loading: boolean; onSync: () => void; onClose: () => void }) {
  return <Popup visible={!!url} onMaskClick={onClose} onClose={onClose} bodyStyle={{ borderRadius: '22px 22px 0 0', background: '#f5f8f8', overflow: 'hidden' }}>
    <div style={{ height: 4, width: 36, margin: '9px auto 0', borderRadius: 99, background: '#cbd8d7' }} />
    <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 14px' }}><div><div style={{ color: '#243040', fontSize: 19, fontWeight: 700 }}>微信扫码支付</div><div style={{ marginTop: 4, color: '#728092', fontSize: 12 }}>请使用另一台设备的微信扫码</div></div><button type="button" onClick={onClose} style={{ width: 32, height: 32, border: 'none', borderRadius: '50%', background: '#e8eeee', color: '#728092', fontSize: 21, lineHeight: 1 }}>×</button></div>
      <div style={{ padding: '16px 14px', borderRadius: 16, background: '#fff', boxShadow: '0 3px 12px rgba(24, 42, 66, .055)', textAlign: 'center' }}>
        <div style={{ color: '#758192', fontSize: 12 }}>应付保费</div>
        <div style={{ color: '#e4781b', fontSize: 30, fontWeight: 700, letterSpacing: .3, margin: '3px 0 13px' }}>{money(amount)}</div>
        <div style={{ display: 'inline-flex', padding: 10, border: '1px solid #dce9e7', borderRadius: 14, background: '#fff', boxShadow: '0 3px 10px rgba(21,143,130,.06)' }}><QRCodeSVG value={url} size={208} level="M" includeMargin /></div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, margin: '13px 4px 0', padding: '9px 10px', borderRadius: 9, background: '#edf8f6', color: '#267167', fontSize: 12, lineHeight: 1.5, textAlign: 'left' }}><span style={{ fontWeight: 700 }}>i</span><span>扫码完成后请回到此页面，系统会自动确认支付状态。</span></div>
      </div>
      <Button block color="primary" loading={loading} onClick={onSync} style={{ height: 46, marginTop: 14, borderRadius: 12, fontWeight: 600 }}>我已付款，立即同步</Button>
      <Button block fill="none" onClick={onClose} style={{ height: 38, marginTop: 3, color: '#728092' }}>稍后支付</Button>
    </div>
  </Popup>;
}

function InsuredFields({ value, onChange, onChooseWorker, title = '被保险人信息' }: { value: InsuredPerson; onChange: (next: InsuredPerson) => void; onChooseWorker?: () => void; title?: string }) {
  const update = (key: keyof InsuredPerson, nextValue: string) => {
    const next = { ...value, [key]: nextValue };
    if (key === 'idNumber') Object.assign(next, fromIdCard(nextValue) || {});
    onChange(next);
  };
  const inputStyle = { textAlign: 'right' as const, '--placeholder-color': '#b3bdc9' };
  return <SectionCard title={title} action={onChooseWorker && <Button size="mini" fill="outline" color="primary" onClick={onChooseWorker}>从阿姨库选择</Button>}>
    <InfoRow label="姓名"><Input value={value.insuredName} onChange={(next) => update('insuredName', next)} placeholder="必填" style={inputStyle} /></InfoRow>
    <div style={{ padding: '11px 14px', borderBottom: '1px solid #f0f2f5' }}><div style={{ color: '#475569', fontSize: 14, marginBottom: 9 }}>证件类型</div><Selector options={[{ label: '身份证', value: '1' }, { label: '护照', value: '2' }, { label: '其他', value: '3' }]} value={[value.idType]} onChange={(next) => update('idType', next[0] || '1')} /></div>
    <InfoRow label="身份证号"><Input value={value.idNumber} onChange={(next) => update('idNumber', next)} placeholder="18位身份证可自动识别" style={inputStyle} /></InfoRow>
    <InfoRow label="出生日期"><Input value={value.birthDate.slice(0, 8)} onChange={(next) => update('birthDate', next ? `${next.replaceAll('-', '')}000000` : '')} placeholder="YYYYMMDD" style={inputStyle} /></InfoRow>
    <InfoRow label="手机号"><Input value={value.mobile || ''} onChange={(next) => update('mobile', next)} placeholder="选填" style={inputStyle} /></InfoRow>
    <div style={{ padding: '11px 14px' }}><div style={{ color: '#475569', fontSize: 14, marginBottom: 9 }}>性别</div><Selector options={[{ label: '男', value: 'M' }, { label: '女', value: 'F' }, { label: '其他', value: 'O' }]} value={[value.gender]} onChange={(next) => update('gender', next[0] || 'M')} /></div>
  </SectionCard>;
}

function ListView({ onOpen, onCreate, onBack }: { onOpen: (policy: InsurancePolicy) => void; onCreate: () => void; onBack: () => void }) {
  const canCreate = usePermission('insurance:create');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const fetchPage = useCallback(async (page: number, limit: number) => {
    const result = await insuranceService.listPolicies({ page, limit, status: status === 'all' ? undefined : status });
    const keyword = search.trim().toLowerCase();
    const list = !keyword ? result.list : result.list.filter((policy) => {
      const values = [policy.policyNo, policy.agencyPolicyRef, policy.policyHolder?.policyHolderName, ...((policy.insuredList || []).flatMap((p) => [p.insuredName, p.mobile, p.idNumber]))];
      return values.some((value) => value?.toLowerCase().includes(keyword));
    });
    return { list, total: keyword ? list.length : result.total };
  }, [search, status]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList(fetchPage, 30);
  useEffect(() => { refresh().catch(() => {}); }, [refresh, search, status]);

  return <div style={{ background: '#f5f7fa', minHeight: '100vh' }}>
    <NavBar onBack={onBack} right={canCreate ? <AddOutline fontSize={22} onClick={onCreate} /> : null} style={{ background: '#fff', fontWeight: 600 }}>保险管理</NavBar>
    <div style={{ padding: '8px 16px', background: '#fff' }}><SearchBar value={search} onChange={setSearch} onSearch={setSearch} placeholder="保单号 / 姓名 / 手机号 / 身份证" /></div>
    <Tabs activeKey={status} onChange={setStatus} style={{ background: '#fff', '--title-font-size': '13px' }}>
      {Object.entries(STATUS).map(([key, item]) => <Tabs.Tab key={key} title={item[0]} />)}
    </Tabs>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 80px' }}>
      {error && !items.length ? <ErrorBlock status="default" title="加载失败" description={error.message || '下拉刷新重试'} /> : !items.length && !hasMore ? <Empty description="暂无保单" /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map((policy) => <div key={idOf(policy)} onClick={() => onOpen(policy)} style={{ padding: 14, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{policy.insuredList?.map((p) => p.insuredName).join('、') || policy.insuredName || '未命名被保人'}</b><PolicyTag status={policy.status} /></div>
          <div style={{ marginTop: 8, color: '#666', fontSize: 13, lineHeight: 1.7 }}>{policy.policyNo || policy.agencyPolicyRef || '待出单'}<br />{policy.policyHolder?.policyHolderName || '-'} · {policy.planCode || policy.productName || '-'}<br /><span style={{ color: '#ff8f1f', fontWeight: 600 }}>{money(policy.totalPremium ?? policy.premium)}</span> · {dateOnly(policy.effectiveDate || policy.startDate)} 至 {dateOnly(policy.expireDate || policy.endDate)}</div>
        </div>)}</div>}
      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading /> : items.length ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : null}</InfiniteScroll>
    </div></PullToRefresh>
  </div>;
}

function DetailView({ initialPolicy, onBack, onChanged }: { initialPolicy: InsurancePolicy; onBack: () => void; onChanged: () => void }) {
  const canEdit = usePermission('insurance:edit');
  const canCreate = usePermission('insurance:create');
  const [policy, setPolicy] = useState(initialPolicy);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [reason, setReason] = useState('13');
  const [newInsured, setNewInsured] = useState<InsuredPerson>({ ...EMPTY_INSURED });
  const [oldIndex, setOldIndex] = useState(0);
  const [addPremium, setAddPremium] = useState('');
  const [workerPickerVisible, setWorkerPickerVisible] = useState(false);
  const [workerKeyword, setWorkerKeyword] = useState('');
  const [workerResults, setWorkerResults] = useState<PartySearchResult[]>([]);
  const [workerSearching, setWorkerSearching] = useState(false);
  const policyNo = policy.policyNo || '';
  const paymentRef = policy.policyNo || policy.agencyPolicyRef || '';
  const localPolicyId = idOf(policy);
  const refresh = useCallback(async () => {
    const id = idOf(policy); if (!id) return;
    setLoading(true); try { setPolicy(await insuranceService.getPolicy(id)); } catch (e) { Toast.show({ icon: 'fail', content: errorText(e, '加载保单详情失败') }); } finally { setLoading(false); }
  }, [policy]);
  useEffect(() => { refresh(); }, []); // 初始列表记录字段可能不完整
  const execute = async (fn: () => Promise<any>, success: string) => {
    setLoading(true); try { const result = await fn(); if (result?.success === false || result?.data?.Success === 'false') throw new Error(result?.message || result?.data?.Message); Toast.show({ icon: 'success', content: success }); setAction(null); await refresh(); onChanged(); } catch (e) { Toast.show({ icon: 'fail', content: errorText(e, `${success}失败`) }); } finally { setLoading(false); }
  };
  const syncPaymentStatus = useCallback(async (silent = false) => {
    if (!paymentRef) return false;
    try {
      const result = await insuranceService.syncPolicyStatus(paymentRef);
      let synced = result?.data;
      // 大树保查询偶尔不会立即返回保单，但支付回调可能已将 CRM 本地记录更新为已生效。
      // 此时以 CRM 的最新本地记录为准，避免已付款用户被误提示为“未确认支付”。
      if (synced?.status !== 'active') {
        if (localPolicyId) {
          try { synced = await insuranceService.getPolicy(localPolicyId); } catch { /* 保留同步接口的原结果 */ }
        }
      }
      if (synced) setPolicy(synced);
      if (synced?.status === 'active') {
        setPaymentUrl('');
        if (!silent) Toast.show({ icon: 'success', content: '支付成功，保单已生效' });
        onChanged();
        return true;
      }
      if (!silent) Toast.show({ content: '暂未确认支付，请稍后刷新' });
      return false;
    } catch (error) {
      if (!silent) Toast.show({ icon: 'fail', content: errorText(error, '同步支付状态失败') });
      return false;
    }
  }, [localPolicyId, onChanged, paymentRef]);
  const pollPaymentStatus = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 5000 : 3000));
      if (await syncPaymentStatus(true)) return;
    }
  }, [syncPaymentStatus]);
  const startQrPayment = async () => {
    if (!paymentRef) {
      Toast.show({ content: '缺少保单号，暂不能支付' });
      return;
    }
    setLoading(true);
    try {
      const order = await insuranceService.createPaymentOrder(paymentRef, paymentTradeType());
      if (order.Success !== 'true') throw new Error(order.Message || '创建支付订单失败');

      if (isNativeApp()) {
        if (!order.WeChatPrepayId || !order.WeChatAppId) {
          throw new Error('未获取到微信支付参数');
        }
        await CapacitorWechat.initialize({ appId: order.WeChatAppId });
        await CapacitorWechat.sendPaymentRequest({
          partnerId: order.WeChatPartnerId || '1234567890', // If empty, provide fallback just in case or omit if plugin allows
          prepayId: order.WeChatPrepayId,
          nonceStr: order.WeChatNonceStr || '',
          timeStamp: order.WeChatTimeStamp || '',
          package: order.WeChatPackageValue || 'Sign=WXPay',
          sign: order.WeChatSign || '',
        });
        pollPaymentStatus().catch(() => {});
      } else {
        const url = order.WeChatWebUrl;
        if (!url || !isPaymentUrl(url)) throw new Error('未获取到微信支付链接');
        setPaymentUrl(url);
        pollPaymentStatus().catch(() => {});
      }
    } catch (error) {
      Toast.show({ icon: 'fail', content: errorText(error, '发起微信支付失败') });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let listener: { remove: () => Promise<void> } | null = null;
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) pollPaymentStatus().catch(() => {});
    }).then((handle) => { listener = handle; });
    return () => { listener?.remove().catch(() => {}); };
  }, [pollPaymentStatus]);
  const download = async () => {
    if (!policyNo) {
      Toast.show({ content: '保单尚未出单，暂不能下载' });
      return;
    }
    setLoading(true); try { const blob = await insuranceService.printPolicy(policyNo); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `policy-${policyNo}.pdf`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); Toast.show({ icon: 'success', content: '已开始下载 PDF' }); } catch (e) { Toast.show({ icon: 'fail', content: errorText(e, '下载保单失败') }); } finally { setLoading(false); }
  };
  const validPerson = (person: InsuredPerson) => person.insuredName && person.idNumber && person.birthDate && person.gender;
  const closeAction = () => { setAction(null); setNewInsured({ ...EMPTY_INSURED }); setWorkerPickerVisible(false); };
  const searchWorkers = async (keyword = workerKeyword) => {
    setWorkerSearching(true);
    try {
      setWorkerResults(await contractService.searchWorkers(keyword.trim()));
    } catch (error) {
      Toast.show({ icon: 'fail', content: errorText(error, '搜索阿姨失败') });
    } finally {
      setWorkerSearching(false);
    }
  };
  const openWorkerPicker = () => {
    setWorkerPickerVisible(true);
    setWorkerKeyword('');
    setWorkerResults([]);
    void searchWorkers('');
  };
  const chooseWorker = (worker: PartySearchResult) => {
    const idInfo = fromIdCard(worker.idCard || '');
    setNewInsured((person) => ({
      ...person,
      insuredName: worker.name || person.insuredName,
      idType: worker.idCard ? '1' : person.idType,
      idNumber: worker.idCard || person.idNumber,
      birthDate: idInfo?.birthDate || person.birthDate,
      gender: idInfo?.gender || genderFromWorker(worker.gender) || person.gender,
      mobile: worker.phone || person.mobile,
    }));
    setWorkerPickerVisible(false);
    Toast.show({ icon: 'success', content: `已填充${worker.name}信息` });
  };
  const oldInsured = policy.insuredList?.[oldIndex];
  const terminalPolicy = policy.status === 'cancelled' || policy.status === 'surrendered';
  const effective = isPolicyEffective(policy.effectiveDate);
  return <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 'calc(124px + env(safe-area-inset-bottom))' }}>
    <NavBar onBack={onBack} style={{ background: '#fff', fontWeight: 600 }}>保单详情</NavBar>
    <div style={{ padding: 16 }}><div style={{ background: '#fff', padding: 16, borderRadius: 12, marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{policy.policyNo || policy.agencyPolicyRef || '待出单保单'}</b><PolicyTag status={policy.status} /></div><div style={{ color: '#ff8f1f', fontSize: 24, fontWeight: 700, marginTop: 12 }}>{money(policy.totalPremium ?? policy.premium)}</div><div style={{ color: '#777', fontSize: 13, marginTop: 6 }}>{dateOnly(policy.effectiveDate || policy.startDate)} 至 {dateOnly(policy.expireDate || policy.endDate)}</div>{policy.errorMessage && <div style={{ color: '#ff4d4f', fontSize: 13, marginTop: 8 }}>{policy.errorMessage}</div>}</div>
      {loading && <div style={{ textAlign: 'center', padding: 8 }}><DotLoading /></div>}
      <List header="保单信息"><List.Item extra={policy.agencyPolicyRef || '-'}>商户单号</List.Item><List.Item extra={policy.planCode || '-'}>计划代码</List.Item><List.Item extra={policy.groupSize || policy.insuredList?.length || 0}>被保人数</List.Item><List.Item extra={policy.serviceAddress || '-'}>服务地址</List.Item><List.Item extra={policy.remark || '-'}>备注</List.Item></List>
      <List header="投保人"><List.Item extra={policy.policyHolder?.policyHolderName || '-'}>名称</List.Item><List.Item extra={policy.policyHolder?.phTelephone || '-'}>联系电话</List.Item><List.Item extra={policy.policyHolder?.phIdNumber || '-'}>证件号码</List.Item></List>
      <List header="被保险人">{(policy.insuredList || []).map((person, index) => <List.Item key={`${person.idNumber}-${index}`} description={`${person.idNumber} · ${person.mobile || '未填写手机'} · ${person.gender === 'M' ? '男' : person.gender === 'F' ? '女' : '其他'}`}>{person.insuredName}</List.Item>)}</List>
    </div>
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: '#fff', borderTop: '1px solid #e7ecef', boxShadow: '0 -3px 12px rgba(24, 42, 66, .05)' }}>
      <Button fill="outline" onClick={download} disabled={!policyNo || loading} style={BOTTOM_ACTION_STYLE}><DownlandOutline /> PDF</Button>
      {canEdit && <Button fill="outline" onClick={() => execute(() => insuranceService.syncPolicyStatus(policyNo || policy.agencyPolicyRef || ''), '状态已同步')} disabled={loading || !(policyNo || policy.agencyPolicyRef)} style={BOTTOM_ACTION_STYLE}><RedoOutline /> 同步</Button>}
      {canCreate && policy.status === 'pending' && paymentRef && <Button color="primary" onClick={startQrPayment} disabled={loading} style={BOTTOM_ACTION_STYLE}>微信支付</Button>}
      {canEdit && !terminalPolicy && !effective && policyNo && <Button color="danger" fill="outline" onClick={() => { void Dialog.confirm({ content: '确认注销该未生效保单？', onConfirm: () => execute(() => insuranceService.cancelPolicy(policyNo), '已注销') }); }} style={BOTTOM_ACTION_STYLE}>注销保单</Button>}
      {canEdit && policy.status === 'active' && effective && policyNo && <Button color="danger" onClick={() => setAction('surrender')} style={BOTTOM_ACTION_STYLE}>申请退保</Button>}
      {canEdit && !terminalPolicy && policyNo && <Button color="primary" onClick={() => setAction('amend')} style={BOTTOM_ACTION_STYLE}>换人</Button>}
      {canEdit && policy.status === 'active' && policyNo && <Button color="primary" onClick={() => { setAddPremium(String(policy.totalPremium || 0)); setAction('add'); }} style={BOTTOM_ACTION_STYLE}>批增</Button>}
    </div>
    <Popup visible={!!action} onMaskClick={closeAction} onClose={closeAction} bodyStyle={{ height: '76vh', borderRadius: '18px 18px 0 0', overflow: 'auto', background: '#f5f7fa' }}>
      <div style={{ padding: '18px 16px 92px' }}><b style={{ fontSize: 18 }}>{action === 'surrender' ? '申请退保' : action === 'amend' ? '替换被保险人' : '增加被保险人'}</b>
        {action === 'surrender' && <><p style={{ color: '#666', fontSize: 13 }}>仅已生效保单可退保，请选择退保原因。</p><Selector options={SURRENDER_REASONS} value={[reason]} onChange={(v) => setReason(v[0] || '13')} /></>}
        {action === 'amend' && <><List header="原被保险人"><Selector options={(policy.insuredList || []).map((p, i) => ({ label: `${p.insuredName} · ${p.idNumber}`, value: String(i) }))} value={[String(oldIndex)]} onChange={(v) => setOldIndex(Number(v[0] || 0))} /></List><InsuredFields value={newInsured} onChange={setNewInsured} onChooseWorker={openWorkerPicker} title="新被保险人" /></>}
        {action === 'add' && <><List header="批增保费"><List.Item extra={<Input type="number" value={addPremium} onChange={setAddPremium} placeholder="新增后的总保费" />}>总保费（元）</List.Item></List><InsuredFields value={newInsured} onChange={setNewInsured} onChooseWorker={openWorkerPicker} title="新增被保险人" /></>}
      </div><div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16, background: '#fff' }}><Button block color={action === 'surrender' ? 'danger' : 'primary'} loading={loading} onClick={() => {
        if (action === 'surrender') execute(() => insuranceService.surrenderPolicy(policyNo, reason), '退保申请已提交');
        if (action === 'amend') { if (!oldInsured || !validPerson(newInsured)) { Toast.show({ content: '请完整填写新被保险人信息' }); return; } execute(() => insuranceService.amendPolicy(policyNo, oldInsured, newInsured), '换人成功'); }
        if (action === 'add') { if (!validPerson(newInsured) || !Number(addPremium)) { Toast.show({ content: '请完整填写新增人员和总保费' }); return; } execute(() => insuranceService.addInsured(policyNo, Number(addPremium), [newInsured]), '批增成功'); }
      }}>{action === 'surrender' ? '确认退保' : action === 'amend' ? '确认换人' : '确认批增'}</Button></div>
    </Popup>
    <Popup visible={workerPickerVisible} onMaskClick={() => setWorkerPickerVisible(false)} onClose={() => setWorkerPickerVisible(false)} bodyStyle={{ height: '72vh', borderRadius: '18px 18px 0 0', padding: '20px 16px', overflow: 'auto' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>从阿姨库选择</div>
      <SearchBar value={workerKeyword} onChange={setWorkerKeyword} onSearch={() => { void searchWorkers(); }} placeholder="姓名、手机号或身份证号" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0' }}><Button size="small" color="primary" fill="outline" loading={workerSearching} onClick={() => { void searchWorkers(); }}>搜索</Button></div>
      {workerSearching ? <div style={{ textAlign: 'center', padding: 24 }}><DotLoading color="primary" /></div> : workerResults.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{workerResults.map((worker) => <div key={worker.id} onClick={() => chooseWorker(worker)} style={{ padding: 12, border: '1px solid #edf0f2', borderRadius: 10, cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{worker.name}</b><span style={{ color: '#158F82', fontSize: 12 }}>{worker.source}</span></div><div style={{ color: '#687384', fontSize: 12, marginTop: 5 }}>{worker.phone || '未填写手机'} · {worker.idCard || '未填写身份证'}</div>{worker.address && <div style={{ color: '#9aa5b1', fontSize: 12, marginTop: 4 }}>住址：{worker.address}</div>}</div>)}</div> : <Empty description="输入关键词搜索阿姨" imageStyle={{ width: 72 }} />}
    </Popup>
    <WechatQrPaymentPopup url={paymentUrl} amount={policy.totalPremium ?? policy.premium} loading={loading} onSync={() => { void syncPaymentStatus(); }} onClose={() => setPaymentUrl('')} />
  </div>;
}

function CreateView({ onBack, onDone }: { onBack: () => void; onDone: (policy: InsurancePolicy) => void }) {
  const [step, setStep] = useState('plan'); const [plan, setPlan] = useState<InsurancePlan | null>(null); const [months, setMonths] = useState(1);
  const [startDate, setStartDate] = useState(tomorrow); const [insured, setInsured] = useState<InsuredPerson[]>([{ ...EMPTY_INSURED }]); const [remark, setRemark] = useState(''); const [serviceAddress, setServiceAddress] = useState(''); const [loading, setLoading] = useState(false); const [createdPolicy, setCreatedPolicy] = useState<InsurancePolicy | null>(null); const [paymentUrl, setPaymentUrl] = useState('');
  const [workerPickerIndex, setWorkerPickerIndex] = useState<number | null>(null);
  const [workerKeyword, setWorkerKeyword] = useState('');
  const [workerResults, setWorkerResults] = useState<PartySearchResult[]>([]);
  const [workerSearching, setWorkerSearching] = useState(false);
  const endDate = useMemo(() => plan ? addPeriod(startDate, plan, months) : '', [startDate, plan, months]);
  const totalPremium = useMemo(() => plan ? plan.price * insured.length * (plan.period === 'month' ? months : 1) : 0, [plan, insured.length, months]);
  const validInsured = insured.length > 0 && insured.every((person) => person.insuredName && person.idNumber && person.birthDate && person.gender);
  const choose = (next: InsurancePlan) => { setPlan(next); setMonths(1); setStep('worker'); };
  const searchWorkers = async (keyword = workerKeyword) => {
    setWorkerSearching(true);
    try {
      setWorkerResults(await contractService.searchWorkers(keyword.trim()));
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorText(error, '搜索阿姨失败') });
    } finally {
      setWorkerSearching(false);
    }
  };
  const openWorkerPicker = (index: number) => {
    setWorkerPickerIndex(index); setWorkerKeyword(''); setWorkerResults([]); void searchWorkers('');
  };
  const chooseWorker = async (worker: PartySearchResult) => {
    if (workerPickerIndex === null) return;
    const idInfo = fromIdCard(worker.idCard || '');
    setInsured((items) => items.map((item, index) => index === workerPickerIndex ? {
      ...item,
      insuredName: worker.name || item.insuredName,
      idType: worker.idCard ? '1' : item.idType,
      idNumber: worker.idCard || item.idNumber,
      birthDate: idInfo?.birthDate || item.birthDate,
      gender: idInfo?.gender || genderFromWorker(worker.gender) || item.gender,
      mobile: worker.phone || item.mobile,
    } : item));
    setWorkerPickerIndex(null);
    let serviceAddress = '';
    try {
      const contracts = await contractService.searchByWorkerInfo({ name: worker.name, idCard: worker.idCard, phone: worker.phone });
      const contract = contracts[0];
      const customer = typeof contract?.customerId === 'object' ? contract.customerId as { address?: string } : undefined;
      serviceAddress = contract?.customerAddress || customer?.address || '';
      if (serviceAddress) setServiceAddress(serviceAddress);
    } catch {
      // 合同/地址匹配失败不影响阿姨资料填充。
    }
    Toast.show({ icon: 'success', content: serviceAddress ? `已填充${worker.name}及服务地址` : `已填充${worker.name}信息` });
  };
  const goConfirm = () => {
    if (!validInsured) {
      Toast.show({ content: '请先选择阿姨或完整填写被保险人信息' });
      return;
    }
    setStep('confirm');
  };
  const submit = async () => {
    if (!plan || !validInsured) return goConfirm();
    const data: CreatePolicyData = { productCode: plan.productCode, planCode: plan.planCode, effectiveDate: asDashubaoDate(startDate), expireDate: asDashubaoDate(endDate, true), groupSize: insured.length, totalPremium, serviceAddress: serviceAddress || undefined, remark: remark || undefined, policyHolder: { ...DEFAULT_HOLDER }, insuredList: insured.map((person, index) => ({ ...person, insuredId: String(index + 1), insuredType: '1' })) };
    setLoading(true); try { const result = await insuranceService.createPolicy(data); if (!result.success || !result.data) throw new Error(result.message || '投保失败'); setCreatedPolicy(result.data); setStep('pay'); Toast.show({ icon: 'success', content: result.data.status === 'pending' ? '保单已创建，请完成支付' : '投保成功' }); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '投保失败') }); } finally { setLoading(false); }
  };
  const syncCreatedPayment = useCallback(async (silent = false) => {
    const paymentRef = createdPolicy?.policyNo || createdPolicy?.agencyPolicyRef || '';
    if (!paymentRef) return false;
    try {
      const result = await insuranceService.syncPolicyStatus(paymentRef);
      let synced = result.data;
      // 同步接口未及时返回保单时，再读取 CRM 本地保单，覆盖支付回调已落库但查询延迟的场景。
      if (synced?.status !== 'active') {
        const policyId = createdPolicy ? idOf(createdPolicy) : '';
        if (policyId) {
          try { synced = await insuranceService.getPolicy(policyId); } catch { /* 保留同步接口的原结果 */ }
        }
      }
      if (synced) setCreatedPolicy(synced);
      if (synced?.status === 'active') {
        setPaymentUrl('');
        if (!silent) Toast.show({ icon: 'success', content: '支付成功，保单已生效' });
        return true;
      }
      if (!silent) Toast.show({ content: '暂未确认支付，请稍后刷新' });
      return false;
    } catch (error) {
      if (!silent) Toast.show({ icon: 'fail', content: errorText(error, '同步支付状态失败') });
      return false;
    }
  }, [createdPolicy]);
  const pollCreatedPayment = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 5000 : 3000));
      if (await syncCreatedPayment(true)) return;
    }
  }, [syncCreatedPayment]);
  const startPayment = async () => {
    const paymentRef = createdPolicy?.policyNo || createdPolicy?.agencyPolicyRef || '';
    if (!paymentRef) {
      Toast.show({ content: '缺少保单号，暂不能支付' });
      return;
    }
    setLoading(true);
    try {
      const order = await insuranceService.createPaymentOrder(paymentRef, paymentTradeType());
      if (order.Success !== 'true') throw new Error(order.Message || '创建支付订单失败');

      if (isNativeApp()) {
        if (!order.WeChatPrepayId || !order.WeChatAppId) {
          throw new Error('未获取到微信支付参数');
        }
        await CapacitorWechat.initialize({ appId: order.WeChatAppId });
        await CapacitorWechat.sendPaymentRequest({
          partnerId: order.WeChatPartnerId || '',
          prepayId: order.WeChatPrepayId,
          nonceStr: order.WeChatNonceStr || '',
          timeStamp: order.WeChatTimeStamp || '',
          package: order.WeChatPackageValue || 'Sign=WXPay',
          sign: order.WeChatSign || '',
        });
        pollCreatedPayment().catch(() => {});
      } else {
        const url = order.WeChatWebUrl;
        if (!url || !isPaymentUrl(url)) throw new Error('未获取到微信支付链接');
        setPaymentUrl(url);
        pollCreatedPayment().catch(() => {});
      }
    } catch (error) {
      Toast.show({ icon: 'fail', content: errorText(error, '发起微信支付失败') });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let listener: { remove: () => Promise<void> } | null = null;
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && createdPolicy?.status === 'pending') pollCreatedPayment().catch(() => {});
    }).then((handle) => { listener = handle; });
    return () => { listener?.remove().catch(() => {}); };
  }, [createdPolicy?.status, pollCreatedPayment]);
  const changeTab = (key: string) => {
    if (key === 'worker' && !plan) {
      Toast.show({ content: '请先选择保险计划' });
      return;
    }
    if (key === 'confirm' && (!plan || !validInsured)) {
      goConfirm();
      return;
    }
    if (key === 'pay' && !createdPolicy) {
      Toast.show({ content: '请先确认保单信息并创建保单' });
      return;
    }
    setStep(key);
  };
  const planSummary = plan && <div style={{ background: 'linear-gradient(135deg, #e6f7f4, #f4fbfa)', border: '1px solid #d6eee9', borderRadius: 14, padding: 14, marginBottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><div style={{ color: '#158f82', fontSize: 12, marginBottom: 5 }}>已选保险计划</div><b style={{ color: '#243040' }}>{plan.name}</b><div style={{ color: '#687384', fontSize: 12, marginTop: 5 }}>{plan.period === 'year' ? '年度保障' : '月度保障'} · {insured.length} 人投保</div></div><div style={{ color: '#ec7a16', fontWeight: 700, fontSize: 17 }}>{money(totalPremium)}</div></div></div>;
  return <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 96 }}><NavBar onBack={onBack} style={{ background: '#fff', fontWeight: 700, fontSize: 17 }}>新建投保</NavBar>
    <Tabs activeKey={step} onChange={changeTab} style={{ background: '#fff', boxShadow: '0 2px 8px rgba(24,42,66,.04)', '--title-font-size': '13px', '--active-title-color': '#158f82', '--active-line-color': '#158f82' }}><Tabs.Tab key="plan" title="选保险" /><Tabs.Tab key="worker" title="选阿姨" /><Tabs.Tab key="confirm" title="确认信息" /><Tabs.Tab key="pay" title="支付" /></Tabs>
    {step === 'plan' && <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{insuranceProducts.map((product) => <section key={product.id} style={CARD_STYLE}><div style={{ padding: '14px 14px 10px' }}><b style={{ color: '#243040' }}>{product.name}</b><div style={{ color: '#8a94a3', fontSize: 12, marginTop: 5 }}>{product.company}</div></div><div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{product.plans.map((item) => <Button key={`${item.productCode}-${item.planCode}-${item.name}`} color={plan?.planCode === item.planCode ? 'primary' : 'default'} fill={plan?.planCode === item.planCode ? 'solid' : 'outline'} onClick={() => choose(item)} style={{ height: 70, padding: '7px 5px', fontSize: 12, borderRadius: 10 }}>{item.name}<br /><b style={{ color: plan?.planCode === item.planCode ? '#fff' : '#ec7a16', fontSize: 14 }}>{money(item.price)}/{item.period === 'year' ? '年' : '月'}</b></Button>)}</div></section>)}</div>}
    {step === 'worker' && plan && <div style={{ padding: 14 }}>{planSummary}<InsuredFields value={insured[0]} title="被保险人" onChooseWorker={() => openWorkerPicker(0)} onChange={(next) => setInsured((items) => [next, ...items.slice(1)])} /><div style={{ color: '#8a94a3', fontSize: 12, lineHeight: 1.7, padding: '10px 4px 14px' }}>优先从阿姨库选择，可自动带入证件、联系方式，并匹配合同服务地址；也可手工填写。</div><Button block color="primary" onClick={goConfirm} style={{ height: 46, borderRadius: 10 }}>下一步：确认保单信息</Button></div>}
    {step === 'confirm' && plan && <div style={{ padding: 14 }}>{planSummary}<SectionCard title="保单信息"><>{plan.period === 'month' && <InfoRow label="投保月数"><Input type="number" value={String(months)} onChange={(value) => setMonths(Math.min(11, Math.max(1, Number(value) || 1)))} style={{ textAlign: 'right' }} /></InfoRow>}<InfoRow label="生效日期"><input type="date" value={startDate} min={tomorrow()} onChange={(event) => setStartDate(event.target.value)} style={{ border: 0, color: '#172033', textAlign: 'right', width: 135, background: 'transparent' }} /></InfoRow><InfoRow label="结束日期"><span style={{ color: '#8a94a3' }}>{endDate}</span></InfoRow><InfoRow label="自动保费"><b style={{ color: '#ec7a16' }}>{money(totalPremium)}</b></InfoRow><InfoRow label="服务地址"><Input value={serviceAddress} onChange={setServiceAddress} placeholder="选填" style={{ textAlign: 'right' }} /></InfoRow><div style={{ padding: 14 }}><div style={{ color: '#475569', fontSize: 14, marginBottom: 8 }}>备注</div><TextArea value={remark} onChange={setRemark} placeholder="选填" rows={2} style={{ background: '#f7f9fb', borderRadius: 8, padding: 8 }} /></div></></SectionCard>{insured.map((person, index) => <div key={index} style={{ marginTop: 14 }}><InsuredFields value={person} title={`被保险人 ${index + 1}`} onChooseWorker={() => openWorkerPicker(index)} onChange={(next) => setInsured((items) => items.map((item, itemIndex) => itemIndex === index ? next : item))} />{insured.length > 1 && <Button block fill="none" color="danger" onClick={() => setInsured((items) => items.filter((_, itemIndex) => itemIndex !== index))}>删除此人</Button>}</div>)}<Button block fill="outline" onClick={() => setInsured((items) => [...items, { ...EMPTY_INSURED }])} style={{ marginTop: 14, borderRadius: 10 }}>+ 添加被保险人</Button><div style={{ position: 'sticky', bottom: 0, padding: '14px 0 2px', background: 'linear-gradient(transparent, #f5f7fa 25%)' }}><Button block color="primary" loading={loading} onClick={submit} style={{ height: 46, borderRadius: 10 }}>创建保单并去支付 {money(totalPremium)}</Button></div></div>}
    {step === 'pay' && createdPolicy && <div style={{ padding: 16 }}><div style={{ ...CARD_STYLE, padding: 22, textAlign: 'center', borderTop: '3px solid #158f82' }}><PolicyTag status={createdPolicy.status} /><div style={{ color: '#243040', fontWeight: 700, marginTop: 14 }}>{createdPolicy.policyNo || createdPolicy.agencyPolicyRef || '保单已创建'}</div><div style={{ color: '#ec7a16', fontSize: 30, fontWeight: 700, margin: '16px 0 12px' }}>{money(createdPolicy.totalPremium ?? createdPolicy.premium ?? totalPremium)}</div><div style={{ color: '#687384', fontSize: 13, lineHeight: 1.7 }}>{isNativeApp() ? '点击下方按钮将直接跳转微信完成保费支付；支付完成后系统会自动同步保单状态。' : '请使用另一台设备的微信扫描二维码完成保费支付；系统会自动同步保单状态。'}</div></div><Button block color="primary" loading={loading} onClick={startPayment} style={{ marginTop: 16, height: 46, borderRadius: 10 }}>{isNativeApp() ? '前往微信支付' : '显示微信支付二维码'}</Button>{createdPolicy.status === 'pending' && <Button block fill="outline" loading={loading} onClick={() => { void syncCreatedPayment(); }} style={{ marginTop: 12, borderRadius: 10 }}>我已付款，立即同步</Button>}<Button block fill="outline" onClick={() => onDone(createdPolicy)} style={{ marginTop: 12, borderRadius: 10 }}>查看保单详情</Button></div>}
    <Popup visible={workerPickerIndex !== null} onMaskClick={() => setWorkerPickerIndex(null)} bodyStyle={{ height: '72vh', borderRadius: '18px 18px 0 0', padding: '20px 16px', overflow: 'auto' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>从阿姨库选择</div>
      <SearchBar value={workerKeyword} onChange={setWorkerKeyword} onSearch={() => { void searchWorkers(); }} placeholder="姓名、手机号或身份证号" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0' }}><Button size="small" color="primary" fill="outline" loading={workerSearching} onClick={() => { void searchWorkers(); }}>搜索</Button></div>
      {workerSearching ? <div style={{ textAlign: 'center', padding: 24 }}><DotLoading color="primary" /></div> : workerResults.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{workerResults.map((worker) => <div key={worker.id} onClick={() => { void chooseWorker(worker); }} style={{ padding: 12, border: '1px solid #edf0f2', borderRadius: 10, cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{worker.name}</b><span style={{ color: '#158F82', fontSize: 12 }}>{worker.source}</span></div><div style={{ color: '#687384', fontSize: 12, marginTop: 5 }}>{worker.phone || '未填写手机'} · {worker.idCard || '未填写身份证'}</div>{worker.address && <div style={{ color: '#9aa5b1', fontSize: 12, marginTop: 4 }}>住址：{worker.address}</div>}</div>)}</div> : <Empty description="输入关键词搜索阿姨" imageStyle={{ width: 72 }} />}
    </Popup>
    <WechatQrPaymentPopup url={paymentUrl} amount={createdPolicy?.totalPremium ?? createdPolicy?.premium ?? totalPremium} loading={loading} onSync={() => { void syncCreatedPayment(); }} onClose={() => setPaymentUrl('')} />
  
  </div>;
}

export default function Insurance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<PolicyView>({ type: 'list' }); const [reload, setReload] = useState(0);
  useEffect(() => {
    const workerIdCard = (location.state as { insuranceWorkerIdCard?: string } | null)?.insuranceWorkerIdCard?.trim();
    if (!workerIdCard) return;
    let active = true;
    void insuranceService.getPoliciesByIdCard(workerIdCard).then((policies) => {
      if (!active) return;
      const policy = policies.find((item) => item.status === 'active') || policies[0];
      if (policy) setView({ type: 'detail', policy });
      else Toast.show({ content: '该劳动者暂无保险记录' });
    }).catch(() => {
      if (active) Toast.show({ icon: 'fail', content: '获取劳动者保险详情失败' });
    });
    return () => { active = false; };
  }, [location.state]);
  if (view.type === 'detail') return <DetailView initialPolicy={view.policy} onBack={() => setView({ type: 'list' })} onChanged={() => setReload((value) => value + 1)} />;
  if (view.type === 'create') return <CreateView onBack={() => setView({ type: 'list' })} onDone={(policy) => { setReload((value) => value + 1); setView({ type: 'detail', policy }); }} />;
  return <ListView key={reload} onBack={() => navigate(-1)} onOpen={(policy) => setView({ type: 'detail', policy })} onCreate={() => setView({ type: 'create' })} />;
}