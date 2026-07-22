import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  Input,
  NavBar,
  Popup,
  PullToRefresh,
  SearchBar,
  Switch,
  TextArea,
  Toast,
} from 'antd-mobile';
import { AddOutline, DeleteOutline, EditSOutline, PlayOutline, StopOutline, UnlockOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { useInfiniteList } from './_shared';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import { roleService, userService } from '../services/modules';
import type { RoleItem, UserItem } from '../types/modules';

type PermissionGroup = {
  title: string;
  permissions: Array<{ key: string; label: string; description?: string }>;
};

const cardStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
  boxShadow: '0 2px 12px rgba(0,0,0,.04)',
} as const;

const actionStyle = { height: 34, borderRadius: 18, fontSize: 13 } as const;
const errorText = (error: unknown, fallback: string): string => {
  const value = error as { response?: { data?: { message?: string } }; message?: string };
  return value?.response?.data?.message || value?.message || fallback;
};
const idOf = (item: { _id?: string; id?: string }): string => item._id || item.id || '';
const userRoleCodes = (user: UserItem): string[] => user.roles?.length ? user.roles : user.role ? [user.role] : [];
const roleLabel = (code: string, roles: RoleItem[]): string => roles.find((item) => item.code === code)?.name || code;

function PageFrame({ title, onBack, right, children }: { title: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
    <NavBar onBack={onBack} right={right} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 20, fontWeight: 700 }}>{title}</NavBar>
    {children}
  </div>;
}

function UserEditor({ visible, user, roles, onClose, onSaved }: { visible: boolean; user: UserItem | null; roles: RoleItem[]; onClose: () => void; onSaved: (data: { username?: string; password?: string; name: string; email?: string; phone?: string; roles: string[]; monthlyTask?: number }) => Promise<void> }) {
  const editing = !!user;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [monthlyTask, setMonthlyTask] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setUsername(user?.username || '');
    setPassword('');
    setName(user?.name || '');
    setEmail(user?.email || '');
    setPhone(user?.phone || '');
    setMonthlyTask(user?.monthlyTask == null ? '' : String(user.monthlyTask));
    setSelectedRoles(user ? userRoleCodes(user) : roles.find((item) => item.code === 'employee')?.code ? ['employee'] : []);
  }, [roles, user, visible]);

  const save = async () => {
    if (!name.trim() || !phone.trim() || (!editing && username.trim().length < 3) || (!editing && password.length < 6) || !selectedRoles.length) {
      Toast.show({ content: !name.trim() ? '请填写姓名' : !phone.trim() ? '请填写手机号' : !selectedRoles.length ? '请选择至少一个角色' : editing ? '请检查表单内容' : '用户名至少 3 位，密码至少 6 位' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { Toast.show({ content: '手机号格式不正确' }); return; }
    setSaving(true);
    try {
      await onSaved({
        ...(editing ? {} : { username: username.trim(), password }),
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
        roles: selectedRoles,
        ...(monthlyTask.trim() ? { monthlyTask: Number(monthlyTask) } : {}),
      });
      Toast.show({ icon: 'success', content: editing ? '用户信息已更新' : '用户创建成功' });
      onClose();
    } catch (error) {
      Toast.show({ icon: 'fail', content: errorText(error, editing ? '更新用户失败' : '创建用户失败') });
    } finally { setSaving(false); }
  };

  return <Popup visible={visible} onMaskClick={() => !saving && onClose()} bodyStyle={{ maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: '20px 16px calc(28px + env(safe-area-inset-bottom))' }}>
    <div style={{ fontSize: 19, fontWeight: 700, color: '#1a1a1a' }}>{editing ? '编辑用户' : '创建用户'}</div>
    <div style={{ color: '#8a93a5', fontSize: 12, marginTop: 5 }}>{editing ? '用户名不可修改，留空密码则保持原密码' : '创建后权限将根据所选角色自动计算'}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
      <Input value={username} onChange={setUsername} disabled={editing} placeholder="用户名（必填，至少 3 位）" />
      {!editing && <Input value={password} onChange={setPassword} type="password" placeholder="初始密码（必填，至少 6 位）" />}
      {editing && <Input value={password} onChange={setPassword} type="password" placeholder="新密码（可选，至少 6 位）" />}
      <Input value={name} onChange={setName} placeholder="真实姓名（必填）" />
      <Input value={phone} onChange={setPhone} type="tel" placeholder="手机号（必填）" />
      <Input value={email} onChange={setEmail} type="email" placeholder="邮箱（可选）" />
      <Input value={monthlyTask} onChange={setMonthlyTask} type="number" placeholder="本月任务（可选）" />
    </div>
    <div style={{ marginTop: 18, color: '#475569', fontSize: 14, fontWeight: 600 }}>角色（可多选）</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}><Checkbox.Group value={selectedRoles} onChange={(value) => setSelectedRoles(value as string[])}>
      {roles.map((role) => <Checkbox key={role.code || idOf(role)} value={role.code}>{role.name || role.code}</Checkbox>)}
    </Checkbox.Group></div>
    <div style={{ display: 'flex', gap: 10, marginTop: 24 }}><Button block disabled={saving} onClick={onClose} style={actionStyle}>取消</Button><Button block color="primary" loading={saving} onClick={() => { void save(); }} style={actionStyle}>保存</Button></div>
  </Popup>;
}

function UserCard({ user, roles, canEdit, canDelete, onEdit, onAction }: { user: UserItem; roles: RoleItem[]; canEdit: boolean; canDelete: boolean; onEdit: () => void; onAction: (action: 'suspend' | 'resume' | 'unlock' | 'delete' | 'depart') => void }) {
  const active = user.active !== false;
  const roleCodes = userRoleCodes(user);
  return <div style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(21,143,130,.1)', color: '#158f82', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>{(user.name || user.username || '?').slice(0, 1)}</div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{user.name || user.username || '未命名用户'}</div><div style={{ color: '#7a8696', fontSize: 13, marginTop: 4 }}>{user.username || '-'} · {user.phone || '未填写手机号'}</div></div>
      <span style={{ padding: '4px 9px', borderRadius: 16, color: active && !user.suspended ? '#16856f' : '#d97706', background: active && !user.suspended ? '#e5f6f0' : '#fff4df', fontSize: 12, whiteSpace: 'nowrap' }}>{user.suspended ? '已暂停' : active ? '启用' : '禁用'}</span>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {roleCodes.map((code) => <span key={code} style={{ padding: '4px 8px', borderRadius: 12, color: '#158f82', background: '#effaf8', fontSize: 12 }}>{roleLabel(code, roles)}</span>)}
      {user.lockedByAdmin && <span style={{ padding: '4px 8px', borderRadius: 12, color: '#d9363e', background: '#fff1f0', fontSize: 12 }}>账号锁定</span>}
      {user.leftAt && <span style={{ padding: '4px 8px', borderRadius: 12, color: '#7a8696', background: '#f1f3f5', fontSize: 12 }}>已离职</span>}
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f3f5', flexWrap: 'wrap' }} onClick={(event) => event.stopPropagation()}>
      {canEdit && <Button size="small" fill="solid" color="primary" onClick={onEdit} style={actionStyle}><EditSOutline /> 编辑</Button>}
      {canEdit && user.lockedByAdmin && <Button size="small" fill="solid" onClick={() => onAction('unlock')} style={actionStyle}><UnlockOutline /> 解锁</Button>}
      {canEdit && (user.suspended ? <Button size="small" fill="solid" onClick={() => onAction('resume')} style={actionStyle}><PlayOutline /> 恢复</Button> : <Button size="small" fill="solid" onClick={() => onAction('suspend')} style={actionStyle}><StopOutline /> 暂停</Button>)}
      {canEdit && !user.leftAt && <Button size="small" fill="solid" onClick={() => onAction('depart')} style={{ ...actionStyle, color: '#d97706', background: '#fff7e8' }}>标记离职</Button>}
      {canDelete && <Button size="small" fill="solid" color="danger" onClick={() => onAction('delete')} style={actionStyle}><DeleteOutline /> 删除</Button>}
    </div>
  </div>;
}

export function UsersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('user:create');
  const canEdit = usePermission('user:edit');
  const canDelete = usePermission('user:delete');
  const currentUser = useAuthStore((state) => state.user);
  const [keyword, setKeyword] = useState('');
  const [editor, setEditor] = useState<UserItem | null | undefined>(undefined);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departing, setDeparting] = useState<UserItem | null>(null);
  const [departDate, setDepartDate] = useState(new Date().toISOString().slice(0, 10));
  const fetchPage = useCallback((page: number, pageSize: number) => userService.list({ page, pageSize, search: keyword.trim() || undefined }), [keyword]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<UserItem>(fetchPage, 12, { cacheKey: ['system-users', keyword] });
  useEffect(() => { if (canCreate || canEdit) roleService.list({ page: 1, pageSize: 100 }).then((result) => setRoles(result.list)).catch(() => {}); }, [canCreate, canEdit]);
  useEffect(() => { refresh().catch(() => {}); }, [keyword, refresh]);

  const confirmAction = async (user: UserItem, action: 'suspend' | 'resume' | 'unlock' | 'delete' | 'depart') => {
    const name = user.name || user.username || '该用户';
    if (action === 'depart') { setDeparting(user); setDepartDate(new Date().toISOString().slice(0, 10)); return; }
    const labels = { suspend: '暂停', resume: '恢复', unlock: '解锁', delete: '删除' } as const;
    const ok = await Dialog.confirm({ title: `确认${labels[action]}用户？`, content: action === 'delete' ? `删除「${name}」后无法恢复。` : `确定要对「${name}」执行${labels[action]}操作吗？`, confirmText: '确认', cancelText: '取消' });
    if (!ok) return;
    try {
      if (action === 'suspend') await userService.suspend(idOf(user));
      if (action === 'resume') await userService.resume(idOf(user));
      if (action === 'unlock') await userService.unlock(idOf(user));
      if (action === 'delete') await userService.remove(idOf(user));
      Toast.show({ icon: 'success', content: `${labels[action]}成功` });
      await refresh();
    } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, `${labels[action]}失败`) }); }
  };
  const markDeparted = async () => {
    if (!departing || !currentUser || !departDate) return;
    try { await userService.markDeparted(currentUser.id || currentUser._id || '', idOf(departing), departDate); Toast.show({ icon: 'success', content: '离职处理已完成' }); setDeparting(null); await refresh(); }
    catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '标记离职失败') }); }
  };
  const saveUser = async (data: { username?: string; password?: string; name: string; email?: string; phone?: string; roles: string[]; monthlyTask?: number }) => {
    if (editor) await userService.update(idOf(editor), { password: data.password || undefined, name: data.name, email: data.email, phone: data.phone, roles: data.roles, monthlyTask: data.monthlyTask });
    else await userService.create(data as { username: string; password: string; name: string; email?: string; phone?: string; roles: string[]; monthlyTask?: number });
    await refresh();
  };
  return <PageFrame title="用户管理" onBack={() => navigate(-1)} right={canCreate ? <AddOutline fontSize={24} onClick={() => setEditor(null)} /> : undefined}>
    <div style={{ padding: '10px 16px 12px', background: '#fff' }}><SearchBar value={keyword} onChange={setKeyword} onSearch={setKeyword} placeholder="搜索用户名、姓名或手机号" style={{ '--border-radius': '20px', '--background': '#f5f7fa' }} /></div>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 48px' }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : !items.length && !hasMore ? <Empty description="暂无用户" /> : items.map((user) => <UserCard key={idOf(user)} user={user} roles={roles} canEdit={canEdit} canDelete={canDelete} onEdit={() => setEditor(user)} onAction={(action) => { void confirmAction(user, action); }} />)}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <div style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>已到底部</div> : null}</InfiniteScroll></div></PullToRefresh>
    <UserEditor visible={editor !== undefined} user={editor || null} roles={roles} onClose={() => setEditor(undefined)} onSaved={saveUser} />
    <Popup visible={!!departing} onMaskClick={() => setDeparting(null)} bodyStyle={{ borderRadius: '20px 20px 0 0', padding: '20px 16px calc(24px + env(safe-area-inset-bottom))' }}><div style={{ fontSize: 18, fontWeight: 700 }}>标记离职</div><div style={{ color: '#d97706', fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>此操作会转移推荐记录并处理未签约客户，确认后不可撤销。</div><div style={{ marginTop: 18, color: '#475569', fontSize: 14 }}>离职日期</div><input type="date" value={departDate} onChange={(event) => setDepartDate(event.target.value)} style={{ width: '100%', height: 42, border: 0, borderRadius: 10, background: '#f5f7fa', padding: '0 12px', marginTop: 8, boxSizing: 'border-box' }} /><Button block color="danger" onClick={() => { void markDeparted(); }} style={{ ...actionStyle, marginTop: 20 }}>确认标记离职</Button></Popup>
  </PageFrame>;
}

function RoleEditor({ visible, role, groups, onClose, onSaved }: { visible: boolean; role: RoleItem | null; groups: PermissionGroup[]; onClose: () => void; onSaved: (data: { code?: string; name: string; description?: string; permissions: string[]; active?: boolean }) => Promise<void> }) {
  const editing = !!role;
  const systemRole = role?.code === 'admin' || role?.name === '系统管理员' || role?.id === '1' || role?._id === '1';
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!visible) return; setCode(role?.code || ''); setName(role?.name || ''); setDescription(role?.description || ''); setPermissions(role?.permissions || []); setActive(role?.active !== false); }, [role, visible]);
  const save = async () => {
    if (!name.trim() || (!editing && !code.trim())) { Toast.show({ content: !name.trim() ? '请输入角色名称' : '请输入角色编码' }); return; }
    setSaving(true); try { await onSaved({ ...(editing ? {} : { code: code.trim() }), name: name.trim(), description: description.trim(), permissions, active }); Toast.show({ icon: 'success', content: editing ? '角色已更新' : '角色创建成功' }); onClose(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, editing ? '更新角色失败' : '创建角色失败') }); } finally { setSaving(false); }
  };
  return <Popup visible={visible} onMaskClick={() => !saving && onClose()} bodyStyle={{ maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: '20px 16px calc(28px + env(safe-area-inset-bottom))' }}><div style={{ fontSize: 19, fontWeight: 700 }}>{editing ? '编辑角色' : '创建角色'}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}><Input value={code} onChange={setCode} disabled={editing} placeholder="角色编码（如 manager）" /><Input value={name} onChange={setName} disabled={systemRole} placeholder="角色名称（必填）" /><TextArea value={description} onChange={setDescription} placeholder="角色描述（可选）" rows={3} maxLength={200} showCount /></div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, padding: '12px 0', borderBottom: '1px solid #f1f3f5' }}><span style={{ color: '#475569', fontSize: 14 }}>启用角色</span><Switch checked={active} onChange={setActive} disabled={systemRole} /></div><div style={{ color: '#475569', fontSize: 14, fontWeight: 600, marginTop: 18 }}>权限配置</div><div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}><Checkbox.Group value={permissions} onChange={(value) => setPermissions(value as string[])}>{groups.map((group) => <div key={group.title}><div style={{ color: '#158f82', fontSize: 13, fontWeight: 700, marginBottom: 9 }}>{group.title}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{group.permissions.map((permission) => <Checkbox key={permission.key} value={permission.key} disabled={systemRole}><div><div style={{ fontSize: 14 }}>{permission.label}</div>{permission.description && <div style={{ color: '#8a93a5', fontSize: 11, marginTop: 2 }}>{permission.description}</div>}</div></Checkbox>)}</div></div>)}</Checkbox.Group></div><div style={{ display: 'flex', gap: 10, marginTop: 24 }}><Button block disabled={saving} onClick={onClose} style={actionStyle}>取消</Button><Button block color="primary" loading={saving} disabled={systemRole} onClick={() => { void save(); }} style={actionStyle}>保存</Button></div></Popup>;
}

export function RolesPage() {
  const navigate = useNavigate();
  const canManage = usePermission('admin:roles');
  const [keyword, setKeyword] = useState('');
  const [editor, setEditor] = useState<RoleItem | null | undefined>(undefined);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const fetchPage = useCallback((page: number, pageSize: number) => roleService.list({ page, pageSize, search: keyword.trim() || undefined }), [keyword]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<RoleItem>(fetchPage, 12, { cacheKey: ['system-roles', keyword] });
  useEffect(() => { roleService.catalog().then(setGroups).catch(() => Toast.show({ icon: 'fail', content: '权限目录加载失败' })); }, []);
  useEffect(() => { refresh().catch(() => {}); }, [keyword, refresh]);
  const saveRole = async (data: { code?: string; name: string; description?: string; permissions: string[]; active?: boolean }) => { if (editor) await roleService.update(idOf(editor), { name: data.name, description: data.description, permissions: data.permissions, active: data.active }); else await roleService.create(data); await refresh(); };
  const removeRole = async (role: RoleItem) => { if (role.code === 'admin' || role.name === '系统管理员' || role.id === '1' || role._id === '1') { Toast.show({ content: '系统管理员角色不可删除' }); return; } const ok = await Dialog.confirm({ title: '确认删除角色？', content: `删除「${role.name || role.code}」后，关联用户将失去该角色权限。`, confirmText: '确认删除', cancelText: '取消' }); if (!ok) return; try { await roleService.remove(idOf(role)); Toast.show({ icon: 'success', content: '角色已删除' }); await refresh(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '删除角色失败') }); } };
  return <PageFrame title="角色管理" onBack={() => navigate(-1)} right={canManage ? <AddOutline fontSize={24} onClick={() => setEditor(null)} /> : undefined}><div style={{ padding: '10px 16px 12px', background: '#fff' }}><SearchBar value={keyword} onChange={setKeyword} onSearch={setKeyword} placeholder="搜索角色名称或描述" style={{ '--border-radius': '20px', '--background': '#f5f7fa' }} /></div><PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 48px' }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : !items.length && !hasMore ? <Empty description="暂无角色" /> : items.map((role) => <div key={idOf(role)} style={cardStyle}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(21,143,130,.1)', color: '#158f82', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>♙</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{role.name || '未命名角色'}</div><div style={{ color: '#8a93a5', fontSize: 12, marginTop: 4 }}>{role.code || '-'} · {role.permissions?.length || 0} 项权限</div></div><span style={{ padding: '4px 9px', borderRadius: 16, color: role.active === false ? '#7a8696' : '#16856f', background: role.active === false ? '#f1f3f5' : '#e5f6f0', fontSize: 12 }}>{role.active === false ? '停用' : '启用'}</span></div>{role.description && <div style={{ color: '#667085', fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>{role.description}</div>}<div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f3f5' }}>{canManage && <Button size="small" fill="solid" color="primary" onClick={() => setEditor(role)} style={actionStyle}><EditSOutline /> 编辑</Button>}{canManage && <Button size="small" fill="solid" color="danger" onClick={() => { void removeRole(role); }} style={actionStyle}><DeleteOutline /> 删除</Button>}</div></div>)}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <div style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>已到底部</div> : null}</InfiniteScroll></div></PullToRefresh><RoleEditor visible={editor !== undefined} role={editor || null} groups={groups} onClose={() => setEditor(undefined)} onSaved={saveRole} /></PageFrame>;
}