import { useCallback, useEffect, useState } from 'react';
import {
  NavBar,
  Button,
  Input,
  TextArea,
  Selector,
  Switch,
  Tabs,
  SearchBar,
  Popup,
  Dialog,
  Toast,
  DotLoading,
  Empty,
  ErrorBlock,
  PullToRefresh,
  InfiniteScroll,
} from 'antd-mobile';
import { AddOutline, MoreOutline } from 'antd-mobile-icons';
import { QRCodeSVG } from 'qrcode.react';
import { useInfiniteList, fmtDateTime } from './_shared';
import { usePermission } from '../hooks/usePermission';
import { formService } from '../services/modules';
import { apiService } from '../services/api';
import { pickFile } from '../services/native';
import { copyTextToClipboard } from '../plugins/clipboard';
import type { FormItem, FormFieldConfig, FormFieldOption, FormSubmission, FormStats } from '../types/modules';

/**
 * 表单管理（对齐 CRM 表单管理模块）：
 * - 表单列表：创建/编辑/删除/启用禁用/二维码分享/统计入口
 * - 表单编辑器：标题/描述/Banner/生效时间/字段增删改（含选项配置）
 * - 单表单提交列表 + 汇总提交列表：跟进状态筛选、日期筛选、跟进备注更新、管理员删除
 */

const FIELD_TYPES: Array<{ value: FormFieldConfig['fieldType']; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'phone', label: '手机号' },
  { value: 'email', label: '邮箱' },
  { value: 'date', label: '日期' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'select', label: '下拉选择' },
];
const needsOptions = (t?: string) => t === 'radio' || t === 'checkbox' || t === 'select';
const FOLLOWUP_OPTIONS = [
  { value: 'pending', label: '待跟进' },
  { value: 'contacted', label: '已联系' },
  { value: 'completed', label: '已完成' },
];
const FOLLOWUP_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fff7e8', text: '#d46b08' },
  contacted: { bg: '#e6f7ff', text: '#1677c8' },
  completed: { bg: '#eaf7f4', text: '#158F82' },
};

const errorText = (error: any, fallback: string): string =>
  error?.response?.data?.message || error?.message || fallback;
const idOf = (item?: { _id?: string; id?: string }): string => item?._id || item?.id || '';

function StatusPill({ status }: { status?: string }) {
  const active = status === 'active';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: active ? '#eaf7f4' : '#f5f5f5',
        color: active ? '#158F82' : '#999',
      }}
    >
      {active ? '启用' : '禁用'}
    </span>
  );
}

function FollowUpPill({ status }: { status?: string }) {
  const item = FOLLOWUP_COLOR[status || ''] || { bg: '#f5f5f5', text: '#999' };
  const label = FOLLOWUP_OPTIONS.find((o) => o.value === status)?.label || status || '-';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: item.bg, color: item.text }}>
      {label}
    </span>
  );
}

const dateInputStyle = { flex: 1, minWidth: 0, height: 38, border: 'none', borderRadius: 8, padding: '0 8px', background: '#f7f8fa', color: '#333' };
const sectionStyle = { background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,.03)' };
const fieldLabelStyle = { color: '#334b49', fontSize: 13, fontWeight: 650, marginBottom: 7 };

// ── 表单列表 ─────────────────────────────────────
function FormListView({
  onEdit,
  onCreate,
  onShare,
  onStats,
  onSubmissions,
  canManage,
  reloadKey,
}: {
  onEdit: (form: FormItem) => void;
  onCreate: () => void;
  onShare: (form: FormItem) => void;
  onStats: (form: FormItem) => void;
  onSubmissions: (form: FormItem) => void;
  canManage: boolean;
  reloadKey: number;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [moreTarget, setMoreTarget] = useState<FormItem | null>(null);
  const fetchPage = useCallback(
    (page: number, pageSize: number) => formService.list({ page, pageSize, keyword: keyword.trim() || undefined, status }),
    [keyword, status],
  );
  const { items, hasMore, error, loadMore, refresh, setItems } = useInfiniteList<FormItem>(fetchPage, 20);
  useEffect(() => { refresh().catch(() => {}); }, [keyword, status, reloadKey, refresh]);

  const toggleStatus = async (form: FormItem) => {
    const id = idOf(form);
    if (!id) return;
    const next = form.status === 'active' ? 'inactive' : 'active';
    try {
      await formService.update(id, { ...form, status: next });
      Toast.show({ icon: 'success', content: next === 'active' ? '已启用' : '已禁用' });
      setItems((prev) => prev.map((f) => (idOf(f) === id ? { ...f, status: next } : f)));
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorText(error, '操作失败') });
    }
  };

  const removeForm = (form: FormItem) => {
    const id = idOf(form);
    if (!id) return;
    void Dialog.confirm({
      content: `删除后将无法恢复，确定要删除表单"${form.title || ''}"吗？`,
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await formService.remove(id);
          Toast.show({ icon: 'success', content: '删除成功' });
          setItems((prev) => prev.filter((f) => idOf(f) !== id));
        } catch (error: any) {
          Toast.show({ icon: 'fail', content: errorText(error, '删除失败') });
        }
      },
    });
  };

  return (
    <div style={{ minHeight: '60vh' }}>
      <div style={{ padding: '8px 16px 12px', background: '#fff', display: 'flex', gap: 10 }}>
        <SearchBar placeholder="搜索表单标题" value={keyword} onChange={setKeyword} style={{ flex: 1, '--border-radius': '20px', '--background': '#f5f7fa' }} />
      </div>
      <Tabs
        activeKey={status || 'all'}
        onChange={(v) => setStatus(v === 'all' ? undefined : v)}
        style={{ background: '#fff', '--title-font-size': '13px' }}
      >
        <Tabs.Tab title="全部" key="all" />
        <Tabs.Tab title="启用" key="active" />
        <Tabs.Tab title="禁用" key="inactive" />
      </Tabs>
      <PullToRefresh onRefresh={refresh}>
        <div style={{ padding: '12px 16px 84px' }}>
          {error && items.length === 0 ? (
            <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" />
          ) : items.length === 0 && !hasMore ? (
            <Empty description="暂无表单" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((f, i) => (
                <div
                  key={idOf(f) || i}
                  style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600, color: '#1a1a1a', wordBreak: 'break-all' }} onClick={() => onSubmissions(f)}>
                      {f.title || '表单'}
                    </div>
                    <StatusPill status={f.status} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                    浏览 {f.viewCount ?? 0} · 提交 {f.submissionCount ?? 0}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>{fmtDateTime(f.createdAt)}</div>
                  {canManage && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f5f5f5', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button size="mini" fill="outline" onClick={() => onSubmissions(f)} style={{ borderRadius: 12 }}>提交记录</Button>
                      <Button size="mini" fill="outline" onClick={() => onStats(f)} style={{ borderRadius: 12 }}>统计</Button>
                      <Button size="mini" fill="outline" onClick={() => onShare(f)} style={{ borderRadius: 12 }}>分享</Button>
                      <Button size="mini" fill="outline" onClick={() => onEdit(f)} style={{ borderRadius: 12 }}>编辑</Button>
                      <Button size="mini" fill="none" onClick={() => setMoreTarget(f)} style={{ borderRadius: 12 }}><MoreOutline /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? <DotLoading /> : items.length > 0 ? '没有更多了' : ''}
          </InfiniteScroll>
        </div>
      </PullToRefresh>
      {canManage && (
        <button
          type="button"
          aria-label="创建表单"
          onClick={onCreate}
          style={{ position: 'fixed', right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 }}
        >
          <AddOutline fontSize={20} /><span>创建表单</span>
        </button>
      )}
      <Popup visible={!!moreTarget} onMaskClick={() => setMoreTarget(null)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <div style={{ color: '#8a93a5', fontSize: 13, padding: '4px 4px 10px' }}>更多操作</div>
        <Button block fill="none" onClick={() => { const f = moreTarget!; setMoreTarget(null); void toggleStatus(f); }} style={{ height: 42, borderRadius: 12, justifyContent: 'flex-start', padding: '0 12px', fontSize: 15 }}>
          {moreTarget?.status === 'active' ? '禁用表单' : '启用表单'}
        </Button>
        <Button block fill="none" color="danger" onClick={() => { const f = moreTarget!; setMoreTarget(null); removeForm(f); }} style={{ height: 42, borderRadius: 12, justifyContent: 'flex-start', padding: '0 12px', fontSize: 15 }}>
          删除表单
        </Button>
        <Button block onClick={() => setMoreTarget(null)} style={{ height: 42, borderRadius: 12, marginTop: 8 }}>取消</Button>
      </Popup>
    </div>
  );
}

// ── 表单编辑器：标题/描述/Banner/状态/字段 ─────────
const emptyField = (): FormFieldConfig => ({
  label: '', fieldName: `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`, fieldType: 'text', required: false, order: 0,
});

function FieldOptionEditor({ field, onChange }: { field: FormFieldConfig; onChange: (options: FormFieldOption[]) => void }) {
  const options = field.options || [];
  const update = (i: number, key: keyof FormFieldOption, value: string) => {
    const next = options.map((o, idx) => (idx === i ? { ...o, [key]: value } : o));
    onChange(next);
  };
  const add = () => onChange([...options, { value: `option_${options.length + 1}`, label: `选项${options.length + 1}` }]);
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>选项配置</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input value={o.label} placeholder="选项标签" onChange={(v) => update(i, 'label', v)} style={{ flex: 1, '--background-color': '#f7f8fa', borderRadius: 8, padding: '6px 10px' } as any} />
            <Button size="mini" color="danger" fill="outline" onClick={() => remove(i)} style={{ borderRadius: 10 }}>删除</Button>
          </div>
        ))}
        <Button size="small" fill="outline" onClick={add} style={{ borderRadius: 10 }}>+ 添加选项</Button>
      </div>
    </div>
  );
}

function FieldEditorCard({ field, index, total, onChange, onRemove, onMove }: {
  field: FormFieldConfig;
  index: number;
  total: number;
  onChange: (patch: Partial<FormFieldConfig>) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  return (
    <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>字段 {index + 1}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="mini" fill="none" disabled={index === 0} onClick={() => onMove('up')}>上移</Button>
          <Button size="mini" fill="none" disabled={index === total - 1} onClick={() => onMove('down')}>下移</Button>
          <Button size="mini" fill="none" color="danger" onClick={onRemove}>删除</Button>
        </div>
      </div>
      <div style={fieldLabelStyle}>字段标签</div>
      <Input value={field.label} placeholder="例如：姓名" onChange={(v) => onChange({ label: v })} style={{ '--background-color': '#fff', borderRadius: 8, padding: '8px 10px', marginBottom: 8 } as any} />
      <div style={fieldLabelStyle}>字段类型</div>
      <Selector
        columns={4}
        options={FIELD_TYPES.map((t) => ({ label: t.label, value: t.value }))}
        value={[field.fieldType]}
        onChange={(next) => {
          const t = (next[0] || 'text') as FormFieldConfig['fieldType'];
          const patch: Partial<FormFieldConfig> = { fieldType: t };
          if (needsOptions(t)) {
            if (!field.options || field.options.length === 0) patch.options = [{ value: 'option_1', label: '选项1' }, { value: 'option_2', label: '选项2' }];
          } else {
            patch.options = undefined;
          }
          onChange(patch);
        }}
        style={{ '--border-radius': '10px', marginBottom: 8 } as any}
      />
      <div style={fieldLabelStyle}>占位符提示</div>
      <Input value={field.placeholder || ''} placeholder="例如：请输入姓名" onChange={(v) => onChange({ placeholder: v })} style={{ '--background-color': '#fff', borderRadius: 8, padding: '8px 10px', marginBottom: 8 } as any} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#333' }}>是否必填</span>
        <Switch checked={!!field.required} onChange={(checked) => onChange({ required: checked })} />
      </div>
      {needsOptions(field.fieldType) && (
        <FieldOptionEditor field={field} onChange={(options) => onChange({ options })} />
      )}
    </div>
  );
}

function FormEditorView({ form, onBack, onSaved }: { form?: FormItem; onBack: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [successMessage, setSuccessMessage] = useState('提交成功！感谢您的参与。');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [fields, setFields] = useState<FormFieldConfig[]>([{ label: '姓名', fieldName: 'name', fieldType: 'text', required: true, placeholder: '请输入姓名', order: 0 }]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    setTitle(form.title || '');
    setDescription(form.description || '');
    setBannerUrl(form.bannerUrl || '');
    setStatus(form.status === 'inactive' ? 'inactive' : 'active');
    setSuccessMessage(form.successMessage || '提交成功！感谢您的参与。');
    setAllowMultiple(!!form.allowMultipleSubmissions);
    if (form.fields && form.fields.length > 0) setFields(form.fields);
  }, [form]);

  const uploadBanner = async () => {
    try {
      const [picked] = await pickFile({ accept: 'image/*', multiple: false });
      if (!picked?.file) return;
      if (picked.size > 5 * 1024 * 1024) { Toast.show({ content: '图片大小不能超过5MB' }); return; }
      setUploading(true);
      const fd = new FormData();
      fd.append('file', picked.file, picked.fileName);
      fd.append('type', 'banner');
      const res = await apiService.upload<any>('/upload/file', fd, 'POST');
      const url = res?.data?.fileUrl;
      if (!url) throw new Error('上传失败：未返回文件地址');
      setBannerUrl(url);
      Toast.show({ icon: 'success', content: '图片上传成功' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorText(error, '图片上传失败') });
    } finally {
      setUploading(false);
    }
  };

  const addField = () => setFields((prev) => [...prev, { ...emptyField(), order: prev.length }]);
  const updateField = (index: number, patch: Partial<FormFieldConfig>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const removeField = (index: number) => setFields((prev) => prev.filter((_, i) => i !== index));
  const moveField = (index: number, dir: 'up' | 'down') => setFields((prev) => {
    const next = [...prev];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return prev;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const save = async () => {
    if (!title.trim()) { Toast.show({ content: '请输入表单标题' }); return; }
    if (fields.length === 0) { Toast.show({ content: '至少需要添加一个字段' }); return; }
    for (const f of fields) {
      if (!f.label.trim()) { Toast.show({ content: '请完善所有字段的标签' }); return; }
      if (needsOptions(f.fieldType) && (!f.options || f.options.length === 0)) { Toast.show({ content: `字段"${f.label}"需要至少一个选项` }); return; }
    }
    const payload: FormItem = {
      title: title.trim(),
      description: description.trim() || undefined,
      bannerUrl: bannerUrl || undefined,
      status,
      successMessage: successMessage.trim() || '提交成功！感谢您的参与。',
      allowMultipleSubmissions: allowMultiple,
      fields: fields.map((f, index) => ({ ...f, order: index })),
    };
    setSaving(true);
    try {
      if (form) await formService.update(idOf(form), payload);
      else await formService.create(payload);
      Toast.show({ icon: 'success', content: form ? '更新成功' : '创建成功' });
      onSaved();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorText(error, '保存失败') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 90 }}>
      <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>
        {form ? '编辑表单' : '创建表单'}
      </NavBar>
      <div style={{ padding: 16 }}>
        <section style={sectionStyle}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 13 }}>表单设置</div>
          <div style={fieldLabelStyle}>表单标题<span style={{ color: '#ff3141', marginLeft: 3 }}>*</span></div>
          <Input value={title} placeholder="请输入表单标题" onChange={setTitle} style={{ '--background-color': '#f7f8fa', borderRadius: 8, padding: '8px 10px', marginBottom: 12 } as any} />
          <div style={fieldLabelStyle}>表单描述</div>
          <TextArea value={description} placeholder="请输入表单描述" rows={2} onChange={setDescription} style={{ background: '#f7f8fa', borderRadius: 8, padding: 10, marginBottom: 12 }} />
          <div style={fieldLabelStyle}>页面图片（Banner）</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Button size="small" fill="outline" loading={uploading} onClick={uploadBanner} style={{ borderRadius: 10 }}>
              {uploading ? '上传中...' : '上传图片'}
            </Button>
            {bannerUrl && <img src={bannerUrl} alt="Banner预览" style={{ height: 44, borderRadius: 6 }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#333' }}>启用表单</span>
            <Switch checked={status === 'active'} onChange={(c) => setStatus(c ? 'active' : 'inactive')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#333' }}>允许重复提交</span>
            <Switch checked={allowMultiple} onChange={setAllowMultiple} />
          </div>
          <div style={fieldLabelStyle}>提交成功提示语</div>
          <Input value={successMessage} placeholder="提交成功！感谢您的参与。" onChange={setSuccessMessage} style={{ '--background-color': '#f7f8fa', borderRadius: 8, padding: '8px 10px' } as any} />
        </section>
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>表单字段</div>
            <Button size="small" color="primary" fill="outline" onClick={addField} style={{ borderRadius: 10 }}>+ 添加字段</Button>
          </div>
          {fields.map((f, i) => (
            <FieldEditorCard
              key={i}
              field={f}
              index={i}
              total={fields.length}
              onChange={(patch) => updateField(i, patch)}
              onRemove={() => removeField(i)}
              onMove={(dir) => moveField(i, dir)}
            />
          ))}
        </section>
      </div>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,.97)', boxShadow: '0 -3px 12px rgba(0,0,0,.08)', display: 'flex', gap: 8 }}>
        <Button block fill="outline" onClick={onBack} style={{ borderRadius: 22, height: 44 }}>取消</Button>
        <Button block color="primary" loading={saving} onClick={save} style={{ borderRadius: 22, height: 44 }}>保存</Button>
      </div>
    </div>
  );
}

// ── 分享/二维码弹窗 ──────────────────────────────
function SharePopup({ form, onClose }: { form: FormItem | null; onClose: () => void }) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!form) { setShareUrl(''); return; }
    let alive = true;
    setLoading(true);
    formService.generateShareToken(idOf(form))
      .then((r) => { if (alive) setShareUrl(r.shareUrl); })
      .catch((error: any) => { if (alive) Toast.show({ icon: 'fail', content: errorText(error, '生成二维码失败') }); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [form]);
  const copyLink = async () => {
    try {
      await copyTextToClipboard(shareUrl);
      Toast.show({ icon: 'success', content: '链接已复制到剪贴板' });
    } catch {
      Toast.show({ icon: 'fail', content: '复制失败，请长按链接手动复制' });
    }
  };
  return (
    <Popup visible={!!form} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>{form?.title || '表单'} · 分享</div>
      <div style={{ textAlign: 'center' }}>
        {loading ? (
          <div style={{ padding: 40 }}><DotLoading color="primary" /></div>
        ) : shareUrl ? (
          <>
            <div style={{ display: 'inline-flex', padding: 10, border: '1px solid #dce9e7', borderRadius: 14, background: '#fff', boxShadow: '0 3px 10px rgba(21,143,130,.06)' }}>
              <QRCodeSVG value={shareUrl} size={200} level="M" includeMargin />
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: '#999', wordBreak: 'break-all', padding: '0 8px' }}>{shareUrl}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#d46b08' }}>💡 通过此链接提交的表单将自动归属于您</div>
          </>
        ) : (
          <Empty description="生成失败" />
        )}
      </div>
      <Button block color="primary" disabled={!shareUrl} onClick={copyLink} style={{ borderRadius: 22, height: 44, marginTop: 20 }}>复制链接</Button>
      <Button block fill="outline" onClick={onClose} style={{ borderRadius: 22, height: 44, marginTop: 10 }}>关闭</Button>
    </Popup>
  );
}

// ── 表单统计弹窗 ─────────────────────────────────
function StatsPopup({ form, onClose }: { form: FormItem | null; onClose: () => void }) {
  const [stats, setStats] = useState<FormStats | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!form) { setStats(null); return; }
    let alive = true;
    setLoading(true);
    formService.getStats(idOf(form))
      .then((r) => { if (alive) setStats(r); })
      .catch((error: any) => { if (alive) Toast.show({ icon: 'fail', content: errorText(error, '获取统计失败') }); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [form]);
  const row = (label: string, value: unknown) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ color: '#666', fontSize: 14 }}>{label}</span>
      <span style={{ color: '#333', fontSize: 14, fontWeight: 600 }}>{String(value ?? '-')}</span>
    </div>
  );
  return (
    <Popup visible={!!form} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{form?.title || '表单'} · 统计</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><DotLoading color="primary" /></div>
      ) : stats ? (
        <div style={{ background: '#f9f9f9', borderRadius: 12, padding: '4px 16px' }}>
          {row('浏览次数', stats.viewCount)}
          {row('提交次数', stats.submissionCount)}
          {row('总提交数', stats.totalSubmissions)}
          {row('待跟进', stats.pendingCount)}
          {row('已联系', stats.contactedCount)}
          {row('已完成', stats.completedCount)}
        </div>
      ) : (
        <Empty description="暂无数据" />
      )}
      <Button block fill="outline" onClick={onClose} style={{ borderRadius: 22, height: 44, marginTop: 20 }}>关闭</Button>
    </Popup>
  );
}


// ── 提交记录：详情 + 跟进编辑弹窗 ───────────────
function SubmissionDetailPopup({
  submission,
  canDelete,
  onClose,
  onSaved,
  onDeleted,
}: {
  submission: FormSubmission | null;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState('pending');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [fieldOptions, setFieldOptions] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    if (!submission) return;
    setStatus(submission.followUpStatus || 'pending');
    setNote(submission.followUpNote || '');
    setFieldLabels({});
    setFieldOptions({});
    const formId = typeof submission.formId === 'string' ? submission.formId : submission.formId?._id;
    if (!formId) return;
    let alive = true;
    formService.get(formId).then((form) => {
      if (!alive) return;
      const labels: Record<string, string> = {};
      const options: Record<string, Record<string, string>> = {};
      form.fields?.forEach((field) => {
        labels[field.fieldName] = field.label;
        if (field.options && Array.isArray(field.options)) {
          const optionMap: Record<string, string> = {};
          field.options.forEach((opt) => { optionMap[opt.value] = opt.label; });
          options[field.fieldName] = optionMap;
        }
      });
      setFieldLabels(labels);
      setFieldOptions(options);
    }).catch(() => {});
    return () => { alive = false; };
  }, [submission]);
  const formatFieldValue = (fieldName: string, value: unknown): string => {
    if (value === null || value === undefined) return '-';
    const optionMap = fieldOptions[fieldName];
    if (optionMap) {
      if (Array.isArray(value)) return value.map((v) => optionMap[String(v)] || String(v)).join('、');
      return optionMap[String(value)] || String(value);
    }
    if (Array.isArray(value)) return value.join('、');
    return String(value);
  };
  const save = async () => {
    if (!submission?._id) return;
    setSaving(true);
    try {
      await formService.updateSubmission(submission._id, { followUpStatus: status, followUpNote: note });
      Toast.show({ icon: 'success', content: '更新成功' });
      onSaved();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorText(error, '更新失败') });
    } finally {
      setSaving(false);
    }
  };
  const remove = () => {
    if (!submission?._id) return;
    void Dialog.confirm({
      content: '确定要删除这条提交记录吗？删除后无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await formService.deleteSubmission(submission._id!);
          Toast.show({ icon: 'success', content: '删除成功' });
          onDeleted();
        } catch (error: any) {
          Toast.show({ icon: 'fail', content: errorText(error, '删除失败') });
        }
      },
    });
  };
  const formTitle = typeof submission?.formId === 'object' ? submission?.formId?.title : undefined;
  return (
    <Popup visible={!!submission} onMaskClick={onClose} bodyStyle={{ maxHeight: '86vh', overflowY: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>提交详情</div>
      {submission && (
        <>
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: '4px 16px', marginBottom: 16 }}>
            {formTitle && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ color: '#666', fontSize: 13 }}>表单名称</span>
                <span style={{ color: '#333', fontSize: 13 }}>{formTitle}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ color: '#666', fontSize: 13 }}>提交时间</span>
              <span style={{ color: '#333', fontSize: 13 }}>{fmtDateTime(submission.createdAt)}</span>
            </div>
            {Object.entries(submission.data || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', gap: 12 }}>
                <span style={{ color: '#666', fontSize: 13, flexShrink: 0 }}>{fieldLabels[k] || k}</span>
                <span style={{ color: '#333', fontSize: 13, textAlign: 'right', wordBreak: 'break-all' }}>{formatFieldValue(k, v)}</span>
              </div>
            ))}
          </div>
          <div style={fieldLabelStyle}>跟进状态</div>
          <Selector columns={3} options={FOLLOWUP_OPTIONS} value={[status]} onChange={(next) => setStatus(next[0] || 'pending')} style={{ '--border-radius': '10px', marginBottom: 12 } as any} />
          <div style={fieldLabelStyle}>跟进备注</div>
          <TextArea value={note} placeholder="请输入跟进备注" rows={3} maxLength={500} showCount onChange={setNote} style={{ background: '#f7f8fa', borderRadius: 8, padding: 10, marginBottom: 16 }} />
          <Button block color="primary" loading={saving} onClick={save} style={{ borderRadius: 22, height: 44 }}>保存跟进</Button>
          {canDelete && (
            <Button block fill="none" color="danger" onClick={remove} style={{ borderRadius: 22, height: 44, marginTop: 10 }}>删除提交记录</Button>
          )}
        </>
      )}
    </Popup>
  );
}


// ── 提交列表（单表单 / 汇总跨表单共用） ──────────
function SubmissionListView({
  title,
  onBack,
  formId,
  isAdmin,
}: {
  title: string;
  onBack: () => void;
  formId?: string;
  isAdmin: boolean;
}) {
  const [followUpStatus, setFollowUpStatus] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState<FormSubmission | null>(null);
  const fetchPage = useCallback(
    (page: number, pageSize: number) => {
      const params = { page, pageSize, followUpStatus, startDate: startDate || undefined, endDate: endDate || undefined };
      return formId ? formService.submissions(formId, params) : formService.getAllSubmissions(params);
    },
    [formId, followUpStatus, startDate, endDate],
  );
  const { items, hasMore, error, loadMore, refresh, setItems } = useInfiniteList<FormSubmission>(fetchPage, 20);
  useEffect(() => { refresh().catch(() => {}); }, [followUpStatus, startDate, endDate, refresh]);

  const guessName = (data?: Record<string, unknown>): string => {
    if (!data) return '-';
    for (const key of ['姓名', 'name', '名字', '联系人']) if (data[key]) return String(data[key]);
    for (const v of Object.values(data)) {
      if (typeof v === 'string' && v.trim() && v.trim().length <= 20 && !/^1[3-9]\d{9}$/.test(v.trim())) return v.trim();
    }
    return '-';
  };
  const guessPhone = (data?: Record<string, unknown>): string => {
    if (!data) return '-';
    for (const key of ['手机号', 'phone', '电话', '联系电话', '手机']) if (data[key]) return String(data[key]);
    for (const v of Object.values(data)) if (typeof v === 'string' && /^1[3-9]\d{9}$/.test(v.trim())) return v.trim();
    return '-';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>{title}</NavBar>
      <div style={{ background: '#fff', padding: '10px 16px' }}>
        <Selector
          columns={4}
          options={[{ label: '全部', value: '' }, ...FOLLOWUP_OPTIONS]}
          value={[followUpStatus || '']}
          onChange={(next) => setFollowUpStatus(next[0] || undefined)}
          style={{ '--border-radius': '10px', marginBottom: 10 } as any}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={dateInputStyle as any} />
          <span style={{ color: '#999' }}>至</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={dateInputStyle as any} />
          {(startDate || endDate) && (
            <Button size="mini" fill="none" onClick={() => { setStartDate(''); setEndDate(''); }}>清除</Button>
          )}
        </div>
      </div>
      <PullToRefresh onRefresh={refresh}>
        <div style={{ padding: '12px 16px 32px' }}>
          {error && items.length === 0 ? (
            <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" />
          ) : items.length === 0 && !hasMore ? (
            <Empty description="暂无提交记录" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((s, i) => (
                <div key={s._id || i} onClick={() => setActive(s)} style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{guessName(s.data)}</div>
                    <FollowUpPill status={s.followUpStatus} />
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#666' }}>{guessPhone(s.data)}</div>
                  {!formId && typeof s.formId === 'object' && s.formId?.title && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>来源表单：{s.formId.title}</div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>{fmtDateTime(s.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? <DotLoading /> : items.length > 0 ? '没有更多了' : ''}
          </InfiniteScroll>
        </div>
      </PullToRefresh>
      <SubmissionDetailPopup
        submission={active}
        canDelete={isAdmin}
        onClose={() => setActive(null)}
        onSaved={() => {
          setActive(null);
          refresh().catch(() => {});
        }}
        onDeleted={() => {
          const id = active?._id;
          setActive(null);
          setItems((prev) => prev.filter((s) => s._id !== id));
        }}
      />
    </div>
  );
}

type ViewState =
  | { name: 'list' }
  | { name: 'editor'; form?: FormItem }
  | { name: 'submissions'; form: FormItem };

// ── 表单模块主入口 ───────────────────────────────
export function FormsPage() {
  const [view, setView] = useState<ViewState>({ name: 'list' });
  const [shareTarget, setShareTarget] = useState<FormItem | null>(null);
  const [statsTarget, setStatsTarget] = useState<FormItem | null>(null);
  const [showAllSubmissions, setShowAllSubmissions] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 后端 forms 增删改接口无独立权限点（仅需登录），与 CRM 一致：登录用户皆可管理表单
  const canManage = true;
  const canDeleteSubmission = usePermission('admin:settings');

  if (view.name === 'editor') {
    return (
      <FormEditorView
        form={view.form}
        onBack={() => setView({ name: 'list' })}
        onSaved={() => { setView({ name: 'list' }); setReloadKey((k) => k + 1); }}
      />
    );
  }
  if (view.name === 'submissions') {
    return (
      <SubmissionListView
        title={`${view.form.title || '表单'} · 提交记录`}
        onBack={() => setView({ name: 'list' })}
        formId={idOf(view.form)}
        isAdmin={canDeleteSubmission}
      />
    );
  }
  if (showAllSubmissions) {
    return (
      <SubmissionListView
        title="全部提交记录"
        onBack={() => setShowAllSubmissions(false)}
        isAdmin={canDeleteSubmission}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <NavBar back={null} right={<Button size="mini" fill="none" onClick={() => setShowAllSubmissions(true)}>全部提交</Button>} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>
        表单管理
      </NavBar>
      <FormListView
        canManage={canManage}
        reloadKey={reloadKey}
        onCreate={() => setView({ name: 'editor' })}
        onEdit={(f) => setView({ name: 'editor', form: f })}
        onShare={(f) => setShareTarget(f)}
        onStats={(f) => setStatsTarget(f)}
        onSubmissions={(f) => setView({ name: 'submissions', form: f })}
      />
      <SharePopup form={shareTarget} onClose={() => setShareTarget(null)} />
      <StatsPopup form={statsTarget} onClose={() => setStatsTarget(null)} />
    </div>
  );
}
