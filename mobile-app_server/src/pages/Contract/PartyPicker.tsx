import { useCallback, useEffect, useState } from 'react';
import { Popup, SearchBar, DotLoading, Empty, Toast } from 'antd-mobile';
import type { PartySearchResult } from '../../types';

/**
 * 甲方（客户库）/乙方（阿姨库）搜索选择弹层。
 * 对齐 CRM ESignaturePage 的库搜索：输入关键字 → 后端搜索 → 点选自动带入。
 */
export function PartyPicker({
  visible,
  title,
  onClose,
  onSelect,
  search,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (item: PartySearchResult) => void;
  search: (keyword: string) => Promise<PartySearchResult[]>;
}) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<PartySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(
    async (kw: string) => {
      setLoading(true);
      try {
        const list = await search(kw.trim());
        setResults(list);
        setSearched(true);
      } catch {
        Toast.show({ icon: 'fail', content: '搜索失败' });
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    if (!visible) return;
    setKeyword('');
    void doSearch('');
  }, [visible, doSearch]);

  const isToday = (value?: string) => {
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  };

  const maskId = (id?: string) =>
    id && id.length >= 10 ? `${id.slice(0, 6)}***${id.slice(-4)}` : id || '';

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      bodyStyle={{ height: '80vh', display: 'flex', flexDirection: 'column', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
    >
      <div style={{ padding: '20px 16px 16px', fontWeight: 600, fontSize: 18, color: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        <div onClick={onClose} style={{ color: '#999', padding: 4 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      <div style={{ padding: '0 16px 12px' }}>
        <SearchBar
          placeholder="输入姓名或手机号搜索"
          value={keyword}
          onChange={setKeyword}
          onSearch={doSearch}
          style={{ '--background': '#f5f7fa', '--border-radius': '100px' } as any}
        />
        <div style={{ marginTop: 8, color: '#8a94a3', fontSize: 12 }}>今天新增优先 · 按创建时间从新到旧</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#f5f7fa', padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16 }}>
            <DotLoading color="primary" />
          </div>
        ) : searched && results.length === 0 ? (
          <div style={{ padding: 40, background: '#fff', borderRadius: 16 }}>
            <Empty description="未搜索到，换个关键字试试" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((r) => (
              <div
                key={`${r.type}-${r.id}`}
                onClick={() => onSelect(r)}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: '20px 16px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 18, color: '#1a1a1a', marginBottom: 6 }}>
                    {r.name}
                    {isToday(r.createdAt) && <span style={{ padding: '2px 6px', borderRadius: 10, color: '#158F82', background: '#e8f7f4', fontSize: 11, fontWeight: 500 }}>今日新增</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {r.phone}
                    {r.idCard ? ` · ${maskId(r.idCard)}` : ''}
                  </div>
                </div>
                <div style={{
                  color: r.type === 'customer' ? '#158F82' : '#00b578',
                  fontSize: 12,
                  fontWeight: 500,
                  background: r.type === 'customer' ? 'rgba(21, 143, 130, 0.08)' : 'rgba(0, 181, 120, 0.08)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  {r.source}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Popup>
  );
}

export default PartyPicker;
