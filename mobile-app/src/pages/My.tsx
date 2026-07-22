import { useEffect, useState } from 'react';
import { List, Button, Toast } from 'antd-mobile';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../hooks/useAuth';
import { promptUpdate } from '../services/updateService';
import { authService } from '../services/authService';
import { requestWechatLoginAuthorization } from '../plugins/wechatShare';

export default function My() {
  const { user, logout } = useAuth();
  const [version, setVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [bindingWechat, setBindingWechat] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const avatarUrl = user?.avatar || user?.wechatAvatar;

  useEffect(() => {
    // 读取当前 App 版本号（仅原生可用；web 环境静默忽略）
    CapApp.getInfo()
      .then((info) => setVersion(info.version || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      Toast.show({ icon: 'success', content: '已退出' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '退出失败，请重试' });
    } finally {
      setLoggingOut(false);
    }
  };

  const onCheckUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await promptUpdate({ manual: true });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.message || '检查更新失败，请稍后重试' });
    } finally {
      setChecking(false);
    }
  };

  const onBindWechat = async () => {
    if (bindingWechat || user?.wechatAppBound) return;
    setBindingWechat(true);
    try {
      const code = await requestWechatLoginAuthorization();
      await authService.bindCurrentWechatApp(code);
      Toast.show({ icon: 'success', content: '微信绑定成功，以后可使用微信登录' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '微信绑定失败，请重试' });
    } finally {
      setBindingWechat(false);
    }
  };

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
      {/* 顶部个人信息 Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #5DBFB3 0%, #158F82 100%)',
          padding: '60px 24px 40px',
          color: '#fff',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          boxShadow: '0 4px 12px rgba(21, 143, 130, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 'bold',
            border: '2px solid rgba(255,255,255,0.5)',
            overflow: 'hidden',
          }}
        >
          {avatarUrl && !avatarLoadFailed
            ? <img src={avatarUrl} alt={`${user?.name || '员工'}头像`} onError={() => setAvatarLoadFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (user?.name?.[0] || 'U')}
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>{user?.name || '未登录'}</div>
          <div style={{ fontSize: 14, opacity: 0.9, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 12, display: 'inline-block' }}>
            {user?.role || '暂无角色'}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -20 }}>
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 16 }}>
          <List style={{ '--border-inner': '1px solid rgba(0,0,0,0.04)', '--border-top': 'none', '--border-bottom': 'none' }}>
            <List.Item extra={<span style={{ color: '#999' }}>{user?.username}</span>}>账号</List.Item>
            <List.Item extra={<span style={{ color: '#999' }}>{user?.name}</span>}>姓名</List.Item>
            <List.Item
              clickable={!user?.wechatAppBound && !bindingWechat}
              onClick={user?.wechatAppBound || bindingWechat ? undefined : onBindWechat}
              extra={<span style={{ color: user?.wechatAppBound ? '#07C160' : '#999' }}>{bindingWechat ? '授权中…' : user?.wechatAppBound ? '已绑定' : '去绑定'}</span>}
            >
              微信登录
            </List.Item>
          </List>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 24 }}>
          <List style={{ '--border-inner': '1px solid rgba(0,0,0,0.04)', '--border-top': 'none', '--border-bottom': 'none' }}>
            {version ? <List.Item extra={<span style={{ color: '#999' }}>v{version}</span>}>当前版本</List.Item> : null}
            <List.Item
              clickable={!checking}
              extra={checking ? <span style={{ color: '#999' }}>检查中…</span> : null}
              onClick={checking ? undefined : onCheckUpdate}
            >
              检查更新
            </List.Item>
          </List>
        </div>

        <Button
          block
          style={{
            borderRadius: 12,
            height: 48,
            fontSize: 16,
            color: '#FF3141',
            background: '#fff',
            border: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
          onClick={onLogout}
          loading={loggingOut}
          disabled={loggingOut}
        >
          退出登录
        </Button>
      </div>
    </div>
  );
}
