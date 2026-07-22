export const FOLLOW_UP_TYPES = [
  { label: '电话', value: 'phone' },
  { label: '微信', value: 'wechat' },
  { label: '到店', value: 'visit' },
  { label: '视频', value: 'video' },
  { label: '上门', value: 'home_visit' },
  { label: '其他', value: 'other' },
];

export const FOLLOW_UP_RESULTS = [
  { label: '已成交', value: 'signed' },
  { label: '意向明确', value: 'high_intent' },
  { label: '持续跟进', value: 'continue' },
  { label: '暂不考虑', value: 'not_interested' },
  { label: '无效线索', value: 'invalid' },
];

export const LEAD_SOURCES = ['美团', '抖音', '快手', '小红书', '转介绍', '99保姆网', '杭州同馨', '握个手平台', '线索购买', '莲心', '美家', '天机鹿', '孕妈联盟', '高阁', '星星', '妈妈网', '犀牛', '宝宝树', '幼亲舒', '熊猫', '官网', '其他'];
export const SERVICE_CATEGORIES = ['月嫂', '住家育儿嫂', '保洁', '住家保姆', '养宠', '小时工', '白班育儿', '白班保姆', '住家护老', '家教', '陪伴师'];
// 客户列表查询必须与 CustomerQueryDto 的服务品类枚举严格一致。
export const CUSTOMER_FILTER_SERVICE_CATEGORIES = ['月嫂', '住家育儿嫂', '保洁', '住家保姆', '养宠', '小时工', '白班育儿', '白班保姆', '住家护老'];
export const CONTRACT_STATUSES = ['已签约', '签约中', '匹配中', '已面试', '流失客户', '已退款', '退款中', '待定'];
export const LEAD_LEVELS = ['O类', 'A类', 'B类', 'C类', 'D类', '流失'];
export const REST_SCHEDULES = ['单休', '双休', '无休', '调休', '待定'];
export const EDUCATION_REQUIREMENTS = ['无学历', '小学', '初中', '中专', '职高', '高中', '大专', '本科', '研究生及以上'];

export const cardStyle = { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };
export const subtleText = { color: '#666', fontSize: 14 };

export const displayUser = (user?: { name: string; username: string } | null, fallback?: string) =>
  user?.name || user?.username || fallback || '-';

export const formatDateInput = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;