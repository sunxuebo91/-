import type { ParsedCustomer } from '../../services/customerService';
import { LEAD_SOURCES, SERVICE_CATEGORIES } from './constants';

export const selectorOptions = (items: string[]) => items.map((value) => ({ label: value, value }));
export const firstSelected = (value: unknown) => Array.isArray(value) ? value[0] as string : value as string | undefined;
export const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
export const optionalNumber = (value: unknown) => value === '' || value == null ? undefined : Number(value);

const SOURCE_ALIASES: Record<string, string> = {
  握个手: '握个手平台',
  同馨: '杭州同馨',
  同新: '杭州同馨',
  连心: '莲心',
  莲馨: '莲心',
  幼亲书: '幼亲舒',
  红书: '小红书',
  介绍: '转介绍',
};

// 兜底防护：无论后端/AI 返回什么，最终值必须落在表单合法枚举内，
// 否则提交时会被后端 @IsEnum 拒绝，且用户完全看不出原因（识别了但创建失败）。
function matchLeadSource(value?: string): string {
  const source = value?.trim() || '';
  if (!source) return '其他';
  const mapped = SOURCE_ALIASES[source] || source;
  return (LEAD_SOURCES as readonly string[]).includes(mapped) ? mapped : '其他';
}

function matchServiceCategory(value?: string): string | undefined {
  const category = value?.trim() || '';
  if (!category) return undefined;
  let mapped = category;
  if (category.includes('月嫂')) mapped = '月嫂';
  else if (category.includes('育儿') || category.includes('育婴')) mapped = category.includes('白班') ? '白班育儿' : '住家育儿嫂';
  else if (category.includes('保洁') || category.includes('打扫')) mapped = '保洁';
  else if (category.includes('小时') || category.includes('钟点')) mapped = '小时工';
  else if (category.includes('护老') || category.includes('老人')) mapped = '住家护老';
  else if (category.includes('养宠') || category.includes('遛狗') || category.includes('喂猫') || category.includes('宠物')) mapped = '养宠';
  else if (category.includes('家教') || category.includes('辅导')) mapped = '家教';
  else if (category.includes('陪伴') || category.includes('陪诊') || category.includes('陪聊')) mapped = '陪伴师';
  else if (category.includes('保姆') || category === '阿姨') mapped = category.includes('白班') ? '白班保姆' : '住家保姆';
  // AI 未能归类到已知品类时，宁可留空让用户手选，也不要把非法值塞进表单导致提交失败
  return (SERVICE_CATEGORIES as readonly string[]).includes(mapped) ? mapped : undefined;
}

function generatedCustomerName(source: string): string {
  return `${source || '其他'}${Math.floor(1000 + Math.random() * 9000)}`;
}

/** 将 AI 返回值转换为现有三步客户表单所需的字段和 Selector 值。 */
export function mapParsedCustomerToForm(parsed: ParsedCustomer): Record<string, unknown> {
  const leadSource = matchLeadSource(parsed.leadSource);
  const serviceCategory = matchServiceCategory(parsed.serviceCategory);
  return {
    name: parsed.name?.trim() || generatedCustomerName(leadSource),
    phone: parsed.phone?.trim() || '',
    wechatId: parsed.wechatId?.trim() || '',
    address: parsed.address?.trim() || '',
    leadSource: [leadSource],
    serviceCategory: serviceCategory ? [serviceCategory] : [],
    expectedStartDate: parsed.expectedStartDate?.trim() || '',
    salaryBudget: parsed.salaryBudget?.trim() || '',
    needRemarks: parsed.remarks?.trim() || '',
    contractStatus: ['待定'],
    leadLevel: ['D类'],
  };
}