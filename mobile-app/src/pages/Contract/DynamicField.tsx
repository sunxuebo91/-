import { useState } from 'react';
import { Input, TextArea, DatePicker } from 'antd-mobile';
import type { NormalizedField } from '../../types';

/**
 * 自定义选项按钮（单选/多选通用），用原生 button + onClick 实现，
 * 不依赖 antd-mobile Selector 的内部手势层——避免在 WebView 中点击不生效。
 */
export function OptionButtons({
  options,
  selected,
  onToggle,
  disabled = false,
}: {
  options: { label: string; value: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  // 用原生 <button>：桌面(鼠标)与移动(触摸)的点击均由浏览器统一派发为 click，
  // 最通用、最不易被外层手势/组件吞掉。避免自定义 pointer 逻辑带来的环境差异。
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => { if (!disabled) onToggle(o.value); }}
            style={{
              border: active ? '1px solid #1677ff' : '1px solid #eee',
              background: active ? '#e8f3ff' : '#f5f5f5',
              color: active ? '#1677ff' : '#333',
              borderRadius: 8,
              padding: '10px 8px',
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 1.4,
              wordBreak: 'break-all',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              userSelect: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              font: 'inherit',
              width: '100%',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 按爱签模板字段类型渲染单个受控表单控件。
 * 值统一存入父级 templateParams[key]，由父组件维护。
 */
export function DynamicField({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: NormalizedField;
  value: unknown;
  onChange: (v: unknown) => void;
  /** 换人模式下锁定字段：只读展示，不可编辑 */
  disabled?: boolean;
}) {
  const [dateVisible, setDateVisible] = useState(false);
  const strVal = value == null ? '' : String(value);

  const inputWrapperStyle = {
    background: '#f7f8fa',
    borderRadius: 6,
    padding: '4px 12px',
    opacity: disabled ? 0.6 : 1,
  };
  const boxWrapperStyle = {
    background: '#f7f8fa',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 14,
    opacity: disabled ? 0.6 : 1,
  };

  switch (field.type) {
    case 'textarea':
      return (
        <div style={boxWrapperStyle}>
          <TextArea
            placeholder={`请输入${field.label}`}
            value={strVal}
            onChange={onChange}
            readOnly={disabled}
            autoSize={{ minRows: 2, maxRows: 10 }}
            maxLength={500}
            style={{ '--font-size': '14px' }}
          />
        </div>
      );

    case 'date': {
      // 存储为 YYYY年M月D日（对齐 CRM 模板日期文本）
      return (
        <>
          <div
            onClick={() => { if (!disabled) setDateVisible(true); }}
            style={{ ...boxWrapperStyle, color: strVal ? '#333' : '#ccc', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            {strVal || '点击选择日期'}
          </div>
          <DatePicker
            visible={dateVisible}
            onClose={() => setDateVisible(false)}
            precision="day"
            min={new Date(2020, 0, 1)}
            max={new Date(2035, 11, 31)}
            onConfirm={(d) => {
              onChange(`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`);
              setDateVisible(false);
            }}
          />
        </>
      );
    }

    case 'radio':
    case 'select': {
      const opts = field.options.map((o) => ({ label: o.label, value: o.value }));
      return (
        <OptionButtons
          options={opts}
          selected={strVal ? [strVal] : []}
          disabled={disabled}
          // 单选：点已选项则取消，否则替换为该项
          onToggle={(v) => onChange(v === strVal ? '' : v)}
        />
      );
    }

    case 'checkbox':
    case 'multiselect': {
      const opts = field.options.map((o) => ({ label: o.label, value: o.value }));
      const arrVal = Array.isArray(value)
        ? (value as string[])
        : strVal
          ? strVal.split('；').filter(Boolean)
          : [];
      return (
        <OptionButtons
          options={opts}
          selected={arrVal}
          disabled={disabled}
          // 多选：切换该项，值以分号拼接存储（对齐 CRM 数组→字符串转换）
          onToggle={(v) => {
            const next = arrVal.includes(v)
              ? arrVal.filter((x) => x !== v)
              : [...arrVal, v];
            onChange(next.join('；'));
          }}
        />
      );
    }

    case 'idcard':
    case 'text':
    default:
      return (
        <div style={inputWrapperStyle}>
          <Input
            placeholder={`请输入${field.label}`}
            value={strVal}
            onChange={onChange}
            readOnly={disabled}
            style={{ '--font-size': '14px' }}
          />
        </div>
      );
  }
}

export default DynamicField;
