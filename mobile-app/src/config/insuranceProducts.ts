export interface InsurancePlan {
  name: string;
  productCode: string;
  planCode: string;
  price: number;
  period: 'year' | 'month';
  insuranceType?: 'personal' | 'enterprise';
}

export interface InsuranceProduct {
  id: string;
  company: string;
  name: string;
  plans: InsurancePlan[];
}

/** 与 CRM 保险产品配置保持一致，移动端离线可选择全部计划。 */
export const insuranceProducts: InsuranceProduct[] = [
  {
    id: 'pingan-dashubao', company: '平安保险', name: '大树保服务无忧保障计划', plans: [
      { name: '计划一（年）', productCode: 'MP10450164', planCode: 'PK00038868', price: 100, period: 'year' },
      { name: '计划一（月）', productCode: 'MP10450164', planCode: 'PK00038868', price: 10, period: 'month' },
      { name: '计划二（年）', productCode: 'MP10450132', planCode: 'PK00029001', price: 120, period: 'year' },
      { name: '计划二（月）', productCode: 'MP10450132', planCode: 'PK00029001', price: 12, period: 'month' },
    ],
  },
  {
    id: 'pingan-jiazheng', company: '平安保险', name: '“家政无忧”雇主责任险', plans: [
      { name: '方案A（年）', productCode: 'MP10450101', planCode: 'PK00029001', price: 110, period: 'year' },
      { name: '方案B（年）', productCode: 'MP10450101', planCode: 'PK00029011', price: 160, period: 'year' },
      { name: '方案C（年）', productCode: 'MP10450102', planCode: 'PK00029001', price: 280, period: 'year' },
      { name: '方案D（年）', productCode: 'MP10450102', planCode: 'PK00029011', price: 360, period: 'year' },
      { name: '方案B（月）', productCode: 'MP10450133', planCode: 'PK00029011', price: 20, period: 'month' },
      { name: '方案C（月）', productCode: 'MP10450133', planCode: 'PK00056658', price: 40, period: 'month' },
      { name: '方案D（月）', productCode: 'MP10450133', planCode: 'PK00056659', price: 50, period: 'month' },
    ],
  },
  {
    id: 'huatai-yuesao', company: '华泰保险', name: '月嫂无忧-尊享计划', plans: [
      { name: '方案A（月）- 个人', productCode: 'JHJYS', planCode: 'QX000000130807', price: 49, period: 'month', insuranceType: 'personal' },
      { name: '方案B（月）- 个人', productCode: 'JHJYS', planCode: 'QX000000130808', price: 79, period: 'month', insuranceType: 'personal' },
      { name: '方案C（月）- 个人', productCode: 'JHJYS', planCode: 'QX000000130809', price: 149, period: 'month', insuranceType: 'personal' },
      { name: '方案D（月）- 个人', productCode: 'JHJYS', planCode: 'QX000000130810', price: 199, period: 'month', insuranceType: 'personal' },
      { name: '方案A（月）- 企业', productCode: 'JHJYS', planCode: 'QX000000130811', price: 49, period: 'month', insuranceType: 'enterprise' },
      { name: '方案B（月）- 企业', productCode: 'JHJYS', planCode: 'QX000000130812', price: 79, period: 'month', insuranceType: 'enterprise' },
      { name: '方案C（月）- 企业', productCode: 'JHJYS', planCode: 'QX000000130813', price: 149, period: 'month', insuranceType: 'enterprise' },
      { name: '方案D（月）- 企业', productCode: 'JHJYS', planCode: 'QX000000130814', price: 199, period: 'month', insuranceType: 'enterprise' },
    ],
  },
];
