import { NavBar, ErrorBlock, Button } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';

export default function Forbidden() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <NavBar onBack={() => navigate(-1)} style={{ background: '#fff', fontWeight: 600 }}>
        无权限
      </NavBar>
      <div style={{ padding: 24, marginTop: 40 }}>
        <div style={{ background: '#fff', padding: '40px 24px', borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.02)' }}>
          <ErrorBlock status="empty" title="403 · 无访问权限" description="您没有权限访问此页面，请联系管理员。" />
          <Button
            block
            color="primary"
            style={{ marginTop: 32, borderRadius: 24, fontSize: 16 }}
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
