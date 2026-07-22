import { useEffect, useState } from 'react';
import { Form, Input, Button, Toast, NavBar } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/auth';
import { authService } from '../services/authService';
import { requestWechatLoginAuthorization } from '../plugins/wechatShare';

export default function Login() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = useAuthStore((state) => state.token);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  useEffect(() => {
    if (hasHydrated && token) {
      navigate('/dashboard', { replace: true });
    }
  }, [hasHydrated, navigate, token]);

  const onSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      Toast.show({ icon: 'success', content: '登录成功' });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err?.response?.data?.message || err?.message || '登录失败' });
    } finally {
      setLoading(false);
    }
  };

  const onWechatLogin = async () => {
    setWechatLoading(true);
    try {
      const code = await requestWechatLoginAuthorization();
      const result = await authService.wechatAppLogin(code);
      if (result.requiresBinding) {
        Toast.show({ content: '微信尚未绑定，请先用账号密码登录后，在“我的”中绑定微信' });
        return;
      }
      if (!result.access_token || !result.user) throw new Error('微信登录响应无效，请重试');
      Toast.show({ icon: 'success', content: '微信登录成功' });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err?.response?.data?.message || err?.message || '微信登录失败' });
    } finally {
      setWechatLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <NavBar back={null} style={{ background: '#fff', '--border-bottom': 'none' } as any}>安得家政 CRM</NavBar>
      <div style={{ padding: '60px 32px 32px' }}>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 12, color: '#158F82' }}>
          欢迎回来
        </div>
        <div style={{ fontSize: 15, color: '#666', marginBottom: 48 }}>
          安得移动端 · 签约 · 业绩 · 审批
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ username: '', password: '' }}
          style={{ '--border-top': 'none', '--border-bottom': 'none' } as any}
        >
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <div style={{ background: '#f5f7fa', borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>账号</div>
              <Input placeholder="请输入您的账号" clearable autoComplete="username" style={{ '--font-size': '16px', '--placeholder-color': '#ccc' }} />
            </div>
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} style={{ marginTop: 24 }}>
            <div style={{ background: '#f5f7fa', borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>密码</div>
              <Input type="password" placeholder="请输入密码" clearable autoComplete="current-password" style={{ '--font-size': '16px', '--placeholder-color': '#ccc' }} />
            </div>
          </Form.Item>
          <Button type="submit" color="primary" loading={loading} block style={{ marginTop: 40, borderRadius: 28, fontSize: 18, height: 56, boxShadow: '0 4px 16px rgba(21, 143, 130, 0.2)' }}>
            立即登录
          </Button>
        </Form>

        <Button loading={wechatLoading} onClick={onWechatLogin} block fill="none" style={{ marginTop: 16, borderRadius: 28, height: 52, color: '#07C160', borderColor: '#07C160' }}>
          微信登录
        </Button>

        <div style={{ marginTop: 24, textAlign: 'center', color: '#999', fontSize: 12 }}>
          安得家政 · 内部员工使用
        </div>
      </div>
    </div>
  );
}
