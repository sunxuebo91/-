import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NavBar,
  SearchBar,
  PullToRefresh,
  InfiniteScroll,
  List,
  Tag,
  Empty,
  ErrorBlock,
  DotLoading,
  Button,
  Form,
  Input,
  TextArea,
  Selector,
  Image,
  ImageViewer,
  Space,
  Toast,
  Dialog,
  Popup,
  Picker,
  DatePicker,
  Tabs,
  Switch,
  Grid,
} from 'antd-mobile';
import { AddOutline, LeftOutline, MessageOutline, UserContactOutline, UnlockOutline, EyeInvisibleOutline, StopOutline, SearchOutline, EditSOutline, CheckCircleOutline } from 'antd-mobile-icons';
import { resumeService } from '../services/resumeService';
import { evaluationService } from '../services/modules';
import { apiService } from '../services/api';
import dayjs from 'dayjs';
import {
  takePhoto,
  pickFromGallery,
  pickMultipleFromGallery,
  pickFile,
  appendFile,
  isMediaSelectionCancelled,
} from '../services/native';
import type { NativeFile } from '../services/native';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import { useApi } from '../hooks/useApi';
import { useInfiniteList, fmtDateTime, fmtMoney, jobTypeText, JOB_TYPE_TEXT } from './_shared';
import { VirtualList } from '../components/VirtualList';
import { queryClient, CACHE_TIME } from '../lib/queryClient';
import type { Resume, ResumeFileObject } from '../types';

// 将后端相对文件路径解析为可访问 URL（baseURL 去掉尾部 /api 即站点根）
const API_ORIGIN = (import.meta.env.VITE_API_BASE || 'https://crm.andejiazheng.com/api').replace(
  /\/api\/?$/,
  '',
);
const resolveFileUrl = (u?: string): string =>
  !u ? '' : /^https?:\/\//.test(u) ? u : `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`;

const normPhotos = (p?: ResumeFileObject[] | ResumeFileObject | string | string[]): ResumeFileObject[] => {
  if (!p) return [];
  const arr = Array.isArray(p) ? p : [p];
  return arr
    .filter(Boolean)
    .map((f: any) => (typeof f === 'string' ? { url: f } : f))
    .filter((f: any) => f && f.url);
};

const RequiredMark = () => (
  <span aria-hidden="true" style={{ color: '#ff3141', fontSize: 14, marginRight: 3 }}>*</span>
);

// 相册分区：标题 + 网格 + 点击全屏预览
const PhotoBlock = ({ title, photos }: { title: string; photos: ResumeFileObject[] }) => {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (!photos || photos.length === 0) return null;

  // Filter out PDFs for the ImageViewer
  const imagePhotos = photos.filter(p => {
    const urlStr = p.url?.toLowerCase() || '';
    const nameStr = p.filename?.toLowerCase() || '';
    return !urlStr.includes('.pdf') && !nameStr.includes('.pdf');
  });
  const imageUrls = imagePhotos.map((p) => resolveFileUrl(p.url));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 4, height: 14, background: '#158F82', borderRadius: 2 }}></div>
        {title} <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>（{photos.length}）</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {photos.map((p, i) => {
          const urlStr = p.url?.toLowerCase() || '';
          const nameStr = p.filename?.toLowerCase() || '';
          const isPdf = urlStr.includes('.pdf') || nameStr.includes('.pdf');
          const resolvedUrl = resolveFileUrl(p.url);

          if (isPdf) {
            return (
              <div
                key={i}
                onClick={() => window.open(resolvedUrl, '_blank')}
                style={{
                  width: '100%', height: 100, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: '#f5f7fa', cursor: 'pointer', gap: 8, padding: 8, boxSizing: 'border-box'
                }}
              >
                <div style={{ fontSize: 24 }}>📄</div>
                <div style={{ fontSize: 11, color: '#666', textAlign: 'center', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.filename || 'PDF文档'}
                </div>
              </div>
            );
          }

          const imageIndex = imagePhotos.findIndex(img => img.url === p.url);

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`查看${title}第 ${imageIndex + 1} 张大图`}
              onClick={() => imageIndex >= 0 && setViewerIndex(imageIndex)}
              onKeyDown={(event) => {
                if (imageIndex >= 0 && (event.key === 'Enter' || event.key === ' ')) setViewerIndex(imageIndex);
              }}
              style={{ cursor: 'zoom-in' }}
            >
              <Image
                src={resolvedUrl}
                fit="cover"
                style={{ width: '100%', height: 100, borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)' }}
              />
            </div>
          );
        })}
      </div>
      <ImageViewer.Multi
        key={viewerIndex ?? 'closed'}
        visible={viewerIndex !== null}
        images={imageUrls}
        defaultIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
};



const CardSection = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', padding: '0 8px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
    <div style={{ padding: '16px 8px 8px', fontSize: 16, fontWeight: 600, color: '#1a1a1a', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      {title}
    </div>
    {children}
  </div>
);

const TwoCols = ({ children }: { children: [React.ReactNode, React.ReactNode] }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
    <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid rgba(0,0,0,0.04)' }}>
      {children[0]}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      {children[1]}
    </div>
  </div>
);

const rid = (r: Resume): string => r._id || r.id || '';

const JOB_OPTIONS = Object.entries(JOB_TYPE_TEXT).map(([value, label]) => ({ value, label }));

const ORDER_STATUS_MAP: Record<string, { text: string; color: "success" | "primary" | "warning" | "danger" | "default" }> = {
  accepting: { text: '想接单', color: 'success' },
  'not-accepting': { text: '不接单', color: 'default' },
  signed: { text: '已签约', color: 'success' },
  'on-service': { text: '已上户', color: 'primary' },
  'to-be-hired': { text: '待上户', color: 'warning' },
  training: { text: '培训中', color: 'primary' },
  rest: { text: '休息中', color: 'default' },
  leave: { text: '请假中', color: 'default' },
  dismissed: { text: '已下户', color: 'default' },
  blacklist: { text: '黑名单', color: 'danger' },
};

const SALARY_RANGE_OPTIONS = [
  { label: '5千以下', value: 'under-5000', max: '4999' },
  { label: '5千-8千', value: '5000-7999', min: '5000', max: '7999' },
  { label: '8千-1万', value: '8000-9999', min: '8000', max: '9999' },
  { label: '1万-1.2万', value: '10000-11999', min: '10000', max: '11999' },
  { label: '1.2万以上', value: '12000-plus', min: '12000' },
];

const FILTER_SELECTOR_STYLE = {
  '--color': '#f5f7fa',
  '--checked-color': 'rgba(21, 143, 130, 0.1)',
  '--checked-text-color': '#158F82',
  '--checked-border': '1px solid #158F82',
  '--border-radius': '12px',
  '--padding': '7px 0',
  '--gap': '8px',
  fontSize: 13,
} as any;

const FilterSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ padding: 14, background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 12 }}>{title}</div>
    {children}
  </div>
);

const JOB_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'zhujia-yuer': { bg: '#e8f5f4', text: '#158f82' },
  'baiban-yuer': { bg: '#e6f4ff', text: '#1890ff' },
  'yuesao': { bg: '#fff0f6', text: '#f5222d' },
  'zhujia-baomu': { bg: '#f9f0ff', text: '#722ed1' },
  'baiban-baomu': { bg: '#f9f0ff', text: '#722ed1' },
  'baojie': { bg: '#fff7e6', text: '#fa8c16' },
  'xiaoshi': { bg: '#fff7e6', text: '#fa8c16' },
  'zhujia-hulao': { bg: '#e6fffb', text: '#13c2c2' },
  'hugong': { bg: '#e6fffb', text: '#13c2c2' },
  'jiajiao': { bg: '#f0f5ff', text: '#2f54eb' },
  'peiban': { bg: '#f0f5ff', text: '#2f54eb' },
  'yangchong': { bg: '#fff2e8', text: '#fa541c' },
  'default': { bg: '#f5f5f5', text: '#666' }
};

const getJobStyle = (type?: string) => JOB_TYPE_COLORS[type || ''] || JOB_TYPE_COLORS.default;

const EDUCATION_MAP: Record<string, string> = {
  no: '无', primary: '小学', middle: '初中', secondary: '中专',
  vocational: '职高', high: '高中', college: '大专', bachelor: '本科', graduate: '研究生'
};
const MARITAL_STATUS_MAP: Record<string, string> = { single: '未婚', married: '已婚', divorced: '离异', widowed: '丧偶' };
const RELIGION_MAP: Record<string, string> = {
  none: '无', buddhism: '佛教', taoism: '道教', christianity: '基督教',
  catholicism: '天主教', islam: '伊斯兰教', hinduism: '印度教',
  protestantism: '新教', orthodoxy: '东正教', other: '其他',
};
const MATERNITY_NURSE_LEVEL_MAP: Record<string, string> = {
  junior: '初级月嫂', silver: '银牌月嫂', gold: '金牌月嫂',
  platinum: '铂金月嫂', diamond: '钻石月嫂', crown: '皇冠月嫂',
};
const LEAD_SOURCE_MAP: Record<string, string> = {
  referral: '转介绍', 'referral-release': '推荐人录入', 'paid-lead': '付费线索',
  community: '社群线索', 'door-to-door': '地推', 'shared-order': '合单',
  'self-registration': '自助注册', 'salary-assessment': '工资测评',
  sales: '销售录入', other: '其他',
};




type View =
  | { type: 'list' }
  | { type: 'detail'; id: string }
  | { type: 'form'; id?: string };

const SKILLS_MAP: Record<string, string> = {
  chanhou: '产后修复师',
  'teshu-yinger': '特殊婴儿护理',
  yiliaobackground: '医疗背景',
  yuying: '高级育婴师',
  zaojiao: '早教师',
  fushi: '辅食营养师',
  ertui: '小儿推拿师',
  waiyu: '外语',
  zhongcan: '中餐',
  xican: '西餐',
  mianshi: '面食',
  jiashi: '驾驶',
  shouyi: '整理收纳',
  muying: '母婴护理师',
  cuiru: '高级催乳师',
  yuezican: '月子餐营养师',
  yingyang: '营养师',
  'liliao-kangfu': '理疗康复',
  'shuangtai-huli': '双胎护理',
  'yanglao-huli': '养老护理'
};

const ZODIAC_MAP: Record<string, string> = {
  rat: '鼠', ox: '牛', tiger: '虎', rabbit: '兔', dragon: '龙', snake: '蛇',
  horse: '马', goat: '羊', monkey: '猴', rooster: '鸡', dog: '狗', pig: '猪'
};
const ZODIAC_SIGN_MAP: Record<string, string> = {
  capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座', aries: '白羊座',
  taurus: '金牛座', gemini: '双子座', cancer: '巨蟹座', leo: '狮子座',
  virgo: '处女座', libra: '天秤座', scorpio: '天蝎座', sagittarius: '射手座'
};
const MATERNITY_LEVEL_MAP: Record<string, string> = {
  junior: '初级月嫂', silver: '银牌月嫂', gold: '金牌月嫂',
  platinum: '铂金月嫂', diamond: '钻石月嫂', crown: '皇冠月嫂'
};
const LEARNING_INTENTION_MAP: Record<string, string> = {
  yuesao: '月嫂', yuersao: '育儿嫂', baomu: '保姆', hulao: '护老'
};
const CURRENT_STAGE_MAP: Record<string, string> = {
  'experienced-certified': '有经验有证书', 'experienced-no-cert': '有经验无证书',
  'certified-no-exp': '有证书无经验', beginner: '小白', 'not-looking': '不找工作'
};
const PROVINCES: string[] = [
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省', '江苏省', '浙江省', '安徽省',
  '福建省', '江西省', '山东省', '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省', '台湾省',
  '北京市', '天津市', '上海市', '重庆市',
  '内蒙古自治区', '广西壮族自治区', '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区',
  '香港特别行政区', '澳门特别行政区'
];
const ETHNICITIES: string[] = [
  '汉', '蒙古', '回', '藏', '维吾尔', '苗', '彝', '壮', '布依', '朝鲜',
  '满', '侗', '瑶', '白', '土家', '哈尼', '哈萨克', '傣', '黎', '傈僳',
  '佤', '畲', '高山', '拉祜', '水', '东乡', '纳西', '景颇', '柯尔克孜', '土',
  '达斡尔', '仫佬', '羌', '布朗', '撒拉', '毛南', '仡佬', '锡伯', '阿昌', '普米',
  '塔吉克', '怒', '乌孜别克', '俄罗斯', '鄂温克', '德昂', '保安', '裕固', '京', '塔塔尔',
  '独龙', '鄂伦春', '赫哲', '门巴', '珞巴', '基诺'
];
// 北京市行政区划（对齐 frontend BEIJING_DISTRICTS）
const BEIJING_DISTRICTS: { value: string; label: string }[] = [
  { value: 'dongcheng', label: '东城区' }, { value: 'xicheng', label: '西城区' },
  { value: 'chaoyang', label: '朝阳区' }, { value: 'haidian', label: '海淀区' },
  { value: 'fengtai', label: '丰台区' }, { value: 'shijingshan', label: '石景山区' },
  { value: 'tongzhou', label: '通州区' }, { value: 'shunyi', label: '顺义区' },
  { value: 'changping', label: '昌平区' }, { value: 'daxing', label: '大兴区' },
  { value: 'fangshan', label: '房山区' }, { value: 'mentougou', label: '门头沟区' },
  { value: 'pinggu', label: '平谷区' }, { value: 'huairou', label: '怀柔区' },
  { value: 'miyun', label: '密云区' }, { value: 'yanqing', label: '延庆区' },
];

// ── OCR 身份证信息自动计算（对齐 frontend imageService.ts）──
// 将腾讯云 OCR 返回的出生日期（如 "1987/1/1"）标准化为 "1987-01-01"
function normalizeBirthDate(raw: string): string {
  const parts = raw.replace(/[年月]/g, '-').replace(/日/g, '').split(/[-/]/).filter(Boolean);
  if (parts.length !== 3) return raw;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function calculateAgeFromBirth(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
function calculateZodiacFromBirth(birthDate: string): string {
  const zodiacKeys = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'];
  const year = new Date(birthDate).getFullYear();
  const idx = (year - 4) % 12;
  return zodiacKeys[idx] || 'rat';
}
function calculateZodiacSignFromBirth(birthDate: string): string {
  const date = new Date(birthDate);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'aquarius';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'pisces';
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'aries';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'taurus';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return 'gemini';
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return 'cancer';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'leo';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'virgo';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) return 'libra';
  if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) return 'scorpio';
  if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) return 'sagittarius';
  return 'capricorn';
}
// 身份证地址简写 -> 完整省份名映射（与 PROVINCES 一致）
const PROVINCE_SHORT_MAP: Record<string, string> = {
  内蒙古: '内蒙古自治区', 广西: '广西壮族自治区', 西藏: '西藏自治区', 宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区', 香港: '香港特别行政区', 澳门: '澳门特别行政区',
  北京: '北京市', 天津: '天津市', 上海: '上海市', 重庆: '重庆市',
  河北: '河北省', 山西: '山西省', 辽宁: '辽宁省', 吉林: '吉林省', 黑龙江: '黑龙江省',
  江苏: '江苏省', 浙江: '浙江省', 安徽: '安徽省', 福建: '福建省', 江西: '江西省',
  山东: '山东省', 河南: '河南省', 湖北: '湖北省', 湖南: '湖南省', 广东: '广东省',
  海南: '海南省', 四川: '四川省', 贵州: '贵州省', 云南: '云南省', 陕西: '陕西省',
  甘肃: '甘肃省', 青海: '青海省', 台湾: '台湾省',
};
function extractProvinceFromAddress(address: string): string | undefined {
  const found = PROVINCES.find((p) => address.includes(p));
  if (found) return found;
  const shortNames = Object.keys(PROVINCE_SHORT_MAP).sort((a, b) => b.length - a.length);
  const short = shortNames.find((s) => address.startsWith(s));
  return short ? PROVINCE_SHORT_MAP[short] : undefined;
}

// 工作经历段类型（对齐 frontend workExperiences）
interface WorkExpItem {
  startDate?: string;
  endDate?: string;
  jobType?: string;
  description?: string;
  orderNumber?: string;
  district?: string;
  customerName?: string;
  customerReview?: string;
  company?: string;
  position?: string;
  photos?: { url: string; filename?: string }[];
}

type RemovedResumeFile = {
  fileUrl: string;
  fileType: 'idCardFront' | 'idCardBack' | 'personalPhoto' | 'certificate' | 'medicalReport' | 'selfIntroductionVideo' | 'confinementMealPhoto' | 'cookingPhoto' | 'complementaryFoodPhoto' | 'positiveReviewPhoto';
};

// ── 简历库列表 ──────────────────────────────────
function ResumeLibrary({
  onOpen,
  onCreate,
  canCreate,
}: {
  onOpen: (id: string) => void;
  onCreate: () => void;
  canCreate: boolean;
}) {
  const navigate = useNavigate();
  const canAssign = usePermission('resume:assign');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{ jobType?: string; orderStatus?: string; source?: string; visibility?: string; isDraft?: string; gender?: string; maxAge?: string; expectedSalary?: string; minExpectedSalary?: string; maxExpectedSalary?: string; nativePlace?: string; ethnicity?: string; createdBy?: string }>({});
  const [totalCount, setTotalCount] = useState(0);
  const [nativePlaceOptions, setNativePlaceOptions] = useState<string[]>([]);
  const [ethnicityOptions, setEthnicityOptions] = useState<string[]>([]);
  const [creatorOptions, setCreatorOptions] = useState<Array<{ _id?: string; id?: string; name?: string; username?: string }>>([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [importVisible, setImportVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success?: number; fail?: number; errors?: string[] } | null>(null);

  // Modals state
  const [filterPopupVisible, setFilterPopupVisible] = useState(false);
  const [moreFiltersVisible, setMoreFiltersVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [followUpResume, setFollowUpResume] = useState<Resume | null>(null);
  const [assignResume, setAssignResume] = useState<Resume | null>(null);

  // For Filter Modal
  const [tempFilters, setTempFilters] = useState(filters);
  useEffect(() => {
    if (filterPopupVisible) {
      setTempFilters(filters);
      setMoreFiltersVisible(Boolean(
        filters.source || filters.visibility || filters.gender || filters.maxAge ||
        filters.nativePlace || filters.ethnicity || filters.createdBy || filters.isDraft,
      ));
    }
  }, [filterPopupVisible, filters]);

  const applyFilters = () => {
    setFilters(tempFilters);
    setFilterPopupVisible(false);
  };
  const resetFilters = () => {
    setTempFilters({});
    setMoreFiltersVisible(false);
  };

  const moreFilterCount = [
    tempFilters.source,
    tempFilters.visibility,
    tempFilters.gender,
    tempFilters.maxAge,
    tempFilters.nativePlace,
    tempFilters.ethnicity,
    tempFilters.createdBy,
    tempFilters.isDraft,
  ].filter(Boolean).length;

  useEffect(() => {
    Promise.all([resumeService.getFilterOptions(), resumeService.getCreators()])
      .then(([options, creators]) => {
        setNativePlaceOptions(options?.nativePlaces || []);
        setEthnicityOptions(options?.ethnicities || []);
        setCreatorOptions(creators || []);
      })
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const kw = search.trim().toLowerCase();
      const params: any = { page, pageSize: limit, keyword: kw, ...filters };
      if (params.isDraft === 'true') params.isDraft = true;
      if (params.isDraft === 'false') params.isDraft = false;
      if (params.maxAge) params.maxAge = Number(params.maxAge);
      if (params.expectedSalary) params.expectedSalary = Number(params.expectedSalary);
      if (params.minExpectedSalary) params.minExpectedSalary = Number(params.minExpectedSalary);
      if (params.maxExpectedSalary) params.maxExpectedSalary = Number(params.maxExpectedSalary);
      const res = await resumeService.getPage(params);
      const dataItems = res.items || (res as any).list || [];
      const total = res.total || 0;
      setTotalCount(total);
      return { list: dataItems, total };
    },
    [search, filters],
  );

  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<Resume>(fetchPage, 10, {
    cacheKey: ['resumes', search, JSON.stringify(filters)],
    staleTime: CACHE_TIME.list.staleTime,
  });

  useEffect(() => {
    refresh().catch(() => {});
  }, [search, filters, refresh]);

  useEffect(() => {
    if (!autoRefreshEnabled || search || Object.keys(filters).length > 0) return;
    const timer = window.setInterval(() => refresh().catch(() => {}), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, search, filters, refresh]);

  const downloadTemplate = () => {
    const rows = [
      '姓名,手机号,工种,性别,年龄,籍贯,民族,期望薪资,工作经验,学历,接单状态,身份证号,微信',
      '张三,13800138000,月嫂,女,35,四川成都,汉族,8000,5,高中,想接单,,wx123',
    ];
    const url = URL.createObjectURL(new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '简历导入模板.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importExcel = async (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      Toast.show({ icon: 'fail', content: '只支持 .xlsx 或 .xls 文件' });
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await apiService.upload<any>('/resumes/import-excel', fd);
      if (!response?.success) throw new Error(response?.message || '导入失败');
      setImportResult(response.data || {});
      Toast.show({ icon: 'success', content: response.message || '导入完成' });
      refresh().catch(() => {});
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err?.response?.data?.message || err?.message || '导入失败' });
    } finally {
      setImporting(false);
    }
  };

  const exportCurrent = () => {
    const header = ['姓名', '手机号', '工种', '年龄', '籍贯', '接单状态', '期望薪资', '创建时间'];
    const value = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const rows = items.map((item) => [item.name, item.phone, jobTypeText(item.jobType), item.age, item.nativePlace, ORDER_STATUS_MAP[item.orderStatus || '']?.text || item.orderStatus, item.expectedSalary, fmtDateTime(item.createdAt || '')].map(value).join(','));
    const url = URL.createObjectURL(new Blob([`\ufeff${[header.join(','), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '简历列表.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', fontWeight: 600, fontSize: 17 }}>
          <div onClick={() => navigate(-1)} style={{ position: 'absolute', left: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#333' }}>
            <LeftOutline style={{ fontSize: 22 }} />
          </div>
          简历列表
          <div style={{ position: 'absolute', right: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
            <div onClick={() => setSettingsVisible(true)} style={{ fontSize: 15, color: '#666', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 'normal' }}>
              <span style={{ fontSize: 18 }}>⚙️</span>设置
            </div>
          </div>
        </div>

        <div style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <SearchBar
              placeholder="搜索姓名/手机号/简历ID"
              value={search}
              onChange={setSearch}
              onSearch={setSearch}
              style={{ '--border-radius': '8px', '--background': '#f5f7fa', '--height': '36px' }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap', borderBottom: '1px solid #f0f0f0' }}>
          <div onClick={() => setFilterPopupVisible(true)} style={{ background: '#158F82', color: '#fff', padding: '4px 12px', borderRadius: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {Object.keys(filters).length ? `已筛选 ${Object.keys(filters).length} 项` : `全部 ${totalCount}`} <span style={{ fontSize: 10 }}>▼</span>
          </div>
          {['工种', '接单状态', '来源', '可见'].map(f => (
            <div key={f} onClick={() => setFilterPopupVisible(true)} style={{ background: '#f5f7fa', color: '#666', padding: '4px 12px', borderRadius: 16, fontSize: 13, flexShrink: 0 }}>
              {f}
            </div>
          ))}
        </div>

        <div style={{ padding: '8px 16px', fontSize: 12, color: '#999', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>共 <span style={{ color: '#158F82', fontWeight: 600, fontSize: 13 }}>{totalCount}</span> 条 · 已显示 1-{items.length}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>⏱</span> {autoRefreshEnabled && !search && Object.keys(filters).length === 0 ? '自动刷新 60s' : '自动刷新已暂停'}
          </div>
        </div>
      </div>

      <PullToRefresh onRefresh={refresh}>
        <div style={{ padding: '12px 16px 80px' }}>
          {error && items.length === 0 ? (
            <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" />
          ) : items.length === 0 && !hasMore ? (
            <Empty description="暂无简历" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <VirtualList
                items={items}
                estimateSize={160}
                getKey={(r, i) => rid(r) || i}
                renderItem={(r, i) => (
                  <div
                    key={rid(r) || i}
                    style={{
                      background: '#fff',
                      borderRadius: 16,
                      padding: 16,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div onClick={() => onOpen(rid(r))} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 72, height: 86, borderRadius: 12, background: '#158F82', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, flexShrink: 0, overflow: 'hidden' }}>
                        {normPhotos(r.personalPhoto)?.[0]?.url ? (
                          <img src={resolveFileUrl(normPhotos(r.personalPhoto)[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
                        ) : (
                          r.name?.charAt(0) || '阿'
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.2 }}>{r.name}</span>
                            <span style={{ fontSize: 12, color: '#ccc' }}>{(r as any).formattedId ? `#${(r as any).formattedId.slice(-8)}` : ''}</span>
                          </div>
                          <Tag color="primary" style={{ background: getJobStyle(r.jobType).bg, color: getJobStyle(r.jobType).text, border: 'none', borderRadius: 12, padding: '2px 8px', fontSize: 11, flexShrink: 0 }}>
                            {r.jobType ? jobTypeText(r.jobType) : '工种未填'}
                          </Tag>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#666', flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: 1 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, lineHeight: 1 }}>
                            <span style={{ fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>👑</span> {r.age != null ? `${r.age}岁` : '-'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, lineHeight: 1 }}>
                            <span style={{ fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>📍</span> {r.nativePlace ? r.nativePlace.split(' ')[0] : '-'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, lineHeight: 1 }}>
                            <span style={{ fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>🪪</span> {r.phone ? r.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {r.orderStatus ? (
                            <Tag color="success" style={{ background: '#fff', color: '#158f82', border: 'none', fontSize: 11, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                              <span style={{ color: '#158f82', fontSize: 16, lineHeight: 1 }}>●</span> {ORDER_STATUS_MAP[r.orderStatus]?.text || r.orderStatus}
                            </Tag>
                          ) : null}
                          {/* Mocking random tags to match prototype */}
                          <Tag color="success" style={{ background: '#fff', color: '#52c41a', border: 'none', fontSize: 11, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                            <span style={{ color: '#52c41a', fontSize: 12, lineHeight: 1 }}>✔</span> 体检
                          </Tag>
                          <Tag fill="outline" style={{ borderColor: '#e8e8e8', color: '#666', borderRadius: 4, padding: '0 4px', fontSize: 11, flexShrink: 0 }}>
                            全员可见
                          </Tag>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed #f0f0f0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {r.expectedSalary && r.expectedSalary > 0 ? (
                          <span style={{ color: '#ff6b6b', fontWeight: 600, fontSize: 14 }}>
                            {fmtMoney(r.expectedSalary)}/月
                          </span>
                        ) : null}
                        <span style={{ margin: '0 4px' }}>·</span>
                        创建于 {fmtDateTime(r.createdAt || '').split(' ')[0]}
                      </div>
                      <Space style={{ '--gap': '12px' }}>
                        <div onClick={() => setFollowUpResume(r)} style={{ padding: '4px 12px', borderRadius: 14, background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#666' }}>跟进</div>
                        {canAssign && (
                          <div onClick={() => setAssignResume(r)} style={{ padding: '4px 12px', borderRadius: 14, background: '#e6f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#158F82' }}>分配</div>
                        )}
                      </Space>
                    </div>
                  </div>
                )}
              />
            </div>
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}
          </InfiniteScroll>
        </div>
      </PullToRefresh>

      {canCreate && (
        <button
          type="button"
          aria-label="创建简历"
          onClick={onCreate}
          style={{ position: 'fixed', right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 90, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 }}
        >
          <AddOutline fontSize={20} />
          <span>创建简历</span>
        </button>
      )}

      {/* Filter Modal */}
      <Popup visible={filterPopupVisible} onMaskClick={() => setFilterPopupVisible(false)} bodyStyle={{ height: '82vh', maxHeight: '82vh', padding: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f2f3', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>筛选简历</div>
            <div style={{ marginTop: 3, fontSize: 12, color: '#999' }}>按常用条件快速定位候选人</div>
          </div>
          <span onClick={() => setFilterPopupVisible(false)} style={{ width: 28, height: 28, borderRadius: 14, background: '#f5f7fa', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>×</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, background: '#f5f7fa' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FilterSection title="工种">
              <Selector columns={4} options={JOB_OPTIONS} value={tempFilters.jobType ? [tempFilters.jobType] : []} onChange={(v) => setTempFilters(p => ({ ...p, jobType: v[0] }))} style={FILTER_SELECTOR_STYLE} />
            </FilterSection>
            <FilterSection title="期望薪资">
              <Selector
                columns={3}
                options={SALARY_RANGE_OPTIONS}
                value={(() => {
                  const selected = SALARY_RANGE_OPTIONS.find(option => option.min === tempFilters.minExpectedSalary && option.max === tempFilters.maxExpectedSalary);
                  return selected ? [selected.value] : [];
                })()}
                onChange={(value) => {
                  const selected = SALARY_RANGE_OPTIONS.find(option => option.value === value[0]);
                  setTempFilters(p => ({ ...p, minExpectedSalary: selected?.min, maxExpectedSalary: selected?.max }));
                }}
                style={FILTER_SELECTOR_STYLE}
              />
            </FilterSection>
            <FilterSection title="接单状态">
              <Selector columns={3} options={Object.entries(ORDER_STATUS_MAP).map(([value, status]) => ({ label: status.text, value }))} value={tempFilters.orderStatus ? [tempFilters.orderStatus] : []} onChange={(v) => setTempFilters(p => ({ ...p, orderStatus: v[0] }))} style={FILTER_SELECTOR_STYLE} />
            </FilterSection>

            <div onClick={() => setMoreFiltersVisible(value => !value)} style={{ padding: '14px 16px', background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>更多条件{moreFilterCount ? ` · 已选 ${moreFilterCount} 项` : ''}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: '#999' }}>性别、年龄、来源、籍贯及归属信息</div>
              </div>
              <span style={{ color: '#158F82', fontSize: 13 }}>{moreFiltersVisible ? '收起 ▲' : '展开 ▼'}</span>
            </div>

            {moreFiltersVisible && (
              <>
                <FilterSection title="基础条件">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Selector columns={2} options={[{ label: '女', value: 'female' }, { label: '男', value: 'male' }]} value={tempFilters.gender ? [tempFilters.gender] : []} onChange={(v) => setTempFilters(p => ({ ...p, gender: v[0] }))} style={FILTER_SELECTOR_STYLE} />
                    <Form.Item label="最大年龄" style={{ padding: 0, '--border-bottom': 'none' } as any}>
                      <Input type="number" value={tempFilters.maxAge || ''} onChange={(v) => setTempFilters(p => ({ ...p, maxAge: v || undefined }))} placeholder="不限" clearable style={{ '--background': '#f5f7fa', '--border-radius': '12px' } as any} />
                    </Form.Item>
                  </div>
                </FilterSection>
                <FilterSection title="来源与可见性">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Selector columns={3} options={[{ label: '员工创建', value: 'staff' }, { label: '自助注册', value: 'self-registration' }, { label: '推荐人录入', value: 'referral-release' }, { label: '推荐入库', value: 'referral' }, { label: '已被推荐', value: 'recommended' }, { label: '工资测评', value: 'salary-assessment' }, { label: '付费线索', value: 'paid-lead' }]} value={tempFilters.source ? [tempFilters.source] : []} onChange={(v) => setTempFilters(p => ({ ...p, source: v[0] }))} style={FILTER_SELECTOR_STYLE} />
                    <Selector columns={3} options={[{ label: '全员可见', value: 'all' }, { label: '仅归属可见', value: 'owner' }, { label: '黑名单', value: 'blacklist' }]} value={tempFilters.visibility ? [tempFilters.visibility] : []} onChange={(v) => setTempFilters(p => ({ ...p, visibility: v[0] }))} style={FILTER_SELECTOR_STYLE} />
                  </div>
                </FilterSection>
                <FilterSection title="归属与档案">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <PickerField value={tempFilters.nativePlace} onChange={(v) => setTempFilters(p => ({ ...p, nativePlace: v }))} options={nativePlaceOptions.map(value => ({ value, label: value }))} placeholder="籍贯不限" />
                    <PickerField value={tempFilters.ethnicity} onChange={(v) => setTempFilters(p => ({ ...p, ethnicity: v }))} options={ethnicityOptions.map(value => ({ value, label: value }))} placeholder="民族不限" />
                    <PickerField value={tempFilters.createdBy} onChange={(v) => setTempFilters(p => ({ ...p, createdBy: v }))} options={creatorOptions.map(c => ({ value: c._id || c.id || '', label: c.name || c.username || '未命名' })).filter(c => c.value)} placeholder="创建人不限" />
                    <Selector columns={2} options={[{ label: '正式简历', value: 'false' }, { label: '草稿', value: 'true' }]} value={tempFilters.isDraft ? [tempFilters.isDraft] : []} onChange={(v) => setTempFilters(p => ({ ...p, isDraft: v[0] }))} style={FILTER_SELECTOR_STYLE} />
                  </div>
                </FilterSection>
              </>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 16px 20px', display: 'flex', gap: 12, background: '#fff', borderTop: '1px solid #f0f2f3', flexShrink: 0 }}>
          <Button block onClick={resetFilters} style={{ flex: 1, background: '#f5f7fa', color: '#666', borderRadius: 12, border: 'none' }}>重置</Button>
          <Button block onClick={applyFilters} style={{ flex: 1, background: '#158F82', color: '#fff', borderRadius: 12, border: 'none', fontWeight: 600 }}>应用筛选</Button>
        </div>
      </Popup>



      <ResumeFollowUpModal
        resume={followUpResume}
        onClose={() => setFollowUpResume(null)}
        onSuccess={refresh}
      />
      <ResumeAssignModal
        resume={assignResume}
        onClose={() => setAssignResume(null)}
        onSuccess={refresh}
      />

      <Popup visible={importVisible} onMaskClick={() => setImportVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '20px 16px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>批量导入简历</span>
          <span onClick={() => setImportVisible(false)} style={{ fontSize: 20, color: '#999' }}>×</span>
        </div>
        {importResult ? (
          <div style={{ background: '#f5f7fa', borderRadius: 10, padding: 16, lineHeight: 1.8 }}>
            <div>成功导入：<b style={{ color: '#52c41a' }}>{importResult.success || 0}</b> 条</div>
            <div>导入失败：<b style={{ color: '#ff4d4f' }}>{importResult.fail || 0}</b> 条</div>
            {(importResult.errors || []).slice(0, 5).map((message, index) => <div key={index} style={{ color: '#ff4d4f', fontSize: 12 }}>{message}</div>)}
          </div>
        ) : (
          <div style={{ color: '#666', fontSize: 14, lineHeight: 1.7 }}>请上传 Excel 文件（.xlsx / .xls）。首行须包含姓名、手机号、工种；其余字段可选。</div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Button block onClick={downloadTemplate}>下载模板</Button>
          <label style={{ flex: 1 }}>
            <Button block color="primary" loading={importing} disabled={importing} style={{ width: '100%' }}>{importResult ? '再次上传' : '选择 Excel 文件'}</Button>
            <input type="file" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { importExcel(event.target.files?.[0]); event.currentTarget.value = ''; }} style={{ display: 'none' }} />
          </label>
        </div>
      </Popup>

      {/* Settings Modal */}
      <Popup visible={settingsVisible} onMaskClick={() => setSettingsVisible(false)} position="right" bodyStyle={{ width: '100%', background: '#f5f7fa' }}>
        <NavBar onBack={() => setSettingsVisible(false)} style={{ background: '#fff' }}>列表设置</NavBar>
        <div style={{ padding: 12 }}>
          <List style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <List.Item extra={<Switch checked={autoRefreshEnabled} onChange={setAutoRefreshEnabled} />}>自动刷新列表</List.Item>
            <List.Item extra="60 秒">刷新间隔</List.Item>
            <List.Item extra={<Switch defaultChecked />}>新简历推送</List.Item>
          </List>
          <List style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <List.Item extra="Excel" clickable onClick={() => setImportVisible(true)} title={<span>📥 批量导入简历</span>}>批量导入简历</List.Item>
            <List.Item extra="CSV" clickable onClick={exportCurrent} title={<span>📤 导出当前筛选</span>}>导出当前筛选</List.Item>
            <List.Item extra="系统打印" clickable onClick={() => window.print()} title={<span>🖨️ 打印当前页面</span>}>打印简历</List.Item>
          </List>
          <List style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <List.Item extra="标准" clickable>默认列表密度</List.Item>
            <List.Item extra="创建时间 ↓" clickable>默认排序</List.Item>
            <List.Item extra="已选 8/14" clickable>显示列</List.Item>
          </List>
          <List style={{ borderRadius: 12, overflow: 'hidden' }}>
            <List.Item extra={<Switch />}>深色模式</List.Item>
          </List>
        </div>
      </Popup>
    </>
  );
}
// Removed BlacklistView

// 简历跟进类型选项（对应 FollowUpType 枚举）
const RESUME_FOLLOW_UP_TYPES = [
  { label: '电话', value: 'phone' },
  { label: '微信', value: 'wechat' },
  { label: '到店', value: 'visit' },
  { label: '面试', value: 'interview' },
  { label: '已签单', value: 'signed' },
  { label: '其他', value: 'other' },
];

// 评价类型
const EVAL_TYPES = [
  { label: '日常', value: 'daily' },
  { label: '月评', value: 'monthly' },
  { label: '合同结束', value: 'contract_end' },
  { label: '特殊', value: 'special' },
];
const starStr = (v: number) => '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));

// ── 简历员工评价区块 ─────────────────────────────
function ResumeEvaluations({ resume, canEdit }: { resume: { _id?: string; id?: string; name?: string }; canEdit: boolean }) {
  const rid = resume._id || resume.id || '';
  const [evals, setEvals] = useState<Record<string, unknown>[]>([]);
  const [evLoading, setEvLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evForm] = Form.useForm();

  const loadEvals = useCallback(async () => {
    if (!rid) return;
    setEvLoading(true);
    try {
      const res = await evaluationService.listByEmployee(rid, { page: 1, limit: 20 });
      setEvals(res.list);
    } catch {
      setEvals([]);
    } finally {
      setEvLoading(false);
    }
  }, [rid]);

  useEffect(() => { loadEvals(); }, [loadEvals]);

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await evaluationService.create({
        employeeId: rid,
        employeeName: resume.name || '',
        evaluationType: Array.isArray(values.evaluationType) ? (values.evaluationType[0] as string) : (values.evaluationType as string) || 'daily',
        overallRating: Number(values.overallRating) || 3,
        comment: values.comment as string,
        strengths: (values.strengths as string) || undefined,
        improvements: (values.improvements as string) || undefined,
      });
      Toast.show({ icon: 'success', content: '评价已提交' });
      evForm.resetFields();
      setShowForm(false);
      await loadEvals();
    } catch {
      Toast.show({ icon: 'fail', content: '提交失败，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 16px 8px',
          borderBottom: '1px solid rgba(0,0,0,0.04)'
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>员工评价（{evals.length}）</span>
        {canEdit && (
          <span style={{ color: '#158F82', fontSize: 14, fontWeight: 500 }} onClick={() => setShowForm(true)}>
            + 新增评价
          </span>
        )}
      </div>
      <List style={{ '--border-inner': '1px solid rgba(0,0,0,0.04)', '--border-top': 'none', '--border-bottom': 'none' }}>
        {evLoading ? (
          <List.Item><DotLoading /></List.Item>
        ) : evals.length === 0 ? (
          <List.Item><Empty description="暂无评价" imageStyle={{ width: 60 }} /></List.Item>
        ) : (
          evals.map((e, i) => {
            const evTypeValue = (e.evaluationType as string) || '';
            const evTypeLabel = EVAL_TYPES.find(t => t.value === evTypeValue)?.label || evTypeValue || '日常';
            return (
              <List.Item
                key={(e._id as string) || i}
                description={fmtDateTime(e.createdAt as string)}
                extra={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color="primary" fill="outline" style={{ borderRadius: 4 }}>{evTypeLabel}</Tag>
                    <span style={{ color: '#FF8F1F', fontSize: 14, letterSpacing: 1 }}>
                      {starStr(Number(e.overallRating) || 0)}
                    </span>
                  </div>
                }
              >
                <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5 }}>{(e.comment as string) || '—'}</div>
                {e.strengths ? <div style={{ fontSize: 13, color: '#158F82', marginTop: 4 }}>优点：{e.strengths as string}</div> : null}
              </List.Item>
            );
          })
        )}
      </List>

      <Popup
        visible={showForm}
        onMaskClick={() => setShowForm(false)}
        onClose={() => setShowForm(false)}
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 32, maxHeight: '80vh', overflowY: 'auto' }}
      >
        <NavBar back={null} style={{ background: '#fff' }}>新增评价</NavBar>
        <Form
          form={evForm}
          onFinish={onSubmit}
          initialValues={{ overallRating: '3' }}
          footer={
            <Space block direction="vertical">
              <Button block type="submit" color="primary" loading={submitting}>提交</Button>
              <Button block fill="outline" onClick={() => setShowForm(false)}>取消</Button>
            </Space>
          }
        >
          <Form.Item name="evaluationType" label="评价类型" rules={[{ required: true }]}>
            <Selector options={EVAL_TYPES} />
          </Form.Item>
          <Form.Item name="overallRating" label="综合评分（1-5）" rules={[{ required: true }]}>
            <Selector options={[1,2,3,4,5].map(v => ({ label: `${v}分 ${'★'.repeat(v)}`, value: String(v) }))} />
          </Form.Item>
          <Form.Item name="comment" label="评价内容" rules={[{ required: true, message: '请输入评价内容' }]}>
            <TextArea placeholder="请填写评价内容" rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="strengths" label="优点">
            <TextArea placeholder="选填" rows={2} maxLength={200} />
          </Form.Item>
          <Form.Item name="improvements" label="待改进">
            <TextArea placeholder="选填" rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Popup>
    </>
  );
}

// ── 简历跟进记录区块 ─────────────────────────────
function ResumeFollowUps({ resumeId, canEdit }: { resumeId: string; canEdit: boolean }) {
  const [followUps, setFollowUps] = useState<Record<string, unknown>[]>([]);
  const [fuLoading, setFuLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fuForm] = Form.useForm();

  const loadFollowUps = useCallback(async () => {
    setFuLoading(true);
    try {
      setFollowUps(await resumeService.getFollowUps(resumeId));
    } catch {
      setFollowUps([]);
    } finally {
      setFuLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await resumeService.createFollowUp({
        resumeId,
        type: Array.isArray(values.type) ? (values.type[0] as string) : (values.type as string),
        content: values.content as string,
      });
      Toast.show({ icon: 'success', content: '跟进记录已添加' });
      fuForm.resetFields();
      setShowForm(false);
      await loadFollowUps();
    } catch {
      Toast.show({ icon: 'fail', content: '添加失败，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 16px 8px',
          borderBottom: '1px solid rgba(0,0,0,0.04)'
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>跟进记录（{followUps.length}）</span>
        {canEdit && (
          <span style={{ color: '#158F82', fontSize: 14, fontWeight: 500 }} onClick={() => setShowForm(true)}>
            + 新增跟进
          </span>
        )}
      </div>
      <List style={{ '--border-inner': '1px solid rgba(0,0,0,0.04)', '--border-top': 'none', '--border-bottom': 'none' }}>
        {fuLoading ? (
          <List.Item><DotLoading /></List.Item>
        ) : followUps.length === 0 ? (
          <List.Item><Empty description="暂无跟进记录" imageStyle={{ width: 60 }} /></List.Item>
        ) : (
          followUps.map((f, i) => {
            const typeValue = (f.type as string) || '';
            const typeLabel = RESUME_FOLLOW_UP_TYPES.find(t => t.value === typeValue)?.label || typeValue || '-';
            return (
              <List.Item
                key={i}
                description={fmtDateTime((f.createdAt as string) || '')}
                extra={<Tag color="primary" fill="outline" style={{ borderRadius: 4 }}>{typeLabel}</Tag>}
              >
                <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5 }}>
                  {(f.content as string) || '—'}
                </div>
              </List.Item>
            );
          })
        )}
      </List>

      <Popup
        visible={showForm}
        onMaskClick={() => setShowForm(false)}
        onClose={() => setShowForm(false)}
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 32 }}
      >
        <NavBar back={null} style={{ background: '#fff' }}>
          新增跟进记录
        </NavBar>
        <Form
          form={fuForm}
          onFinish={onSubmit}
          footer={
            <Space block direction="vertical">
              <Button block type="submit" color="primary" loading={submitting}>
                保存
              </Button>
              <Button block fill="outline" onClick={() => setShowForm(false)}>
                取消
              </Button>
            </Space>
          }
        >
          <Form.Item name="type" label="跟进方式" rules={[{ required: true, message: '请选择跟进方式' }]}>
            <Selector columns={3} options={RESUME_FOLLOW_UP_TYPES} />
          </Form.Item>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请输入跟进内容' }]}>
            <TextArea placeholder="请记录本次跟进情况" rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Popup>
    </>
  );
}

// ── 释放简历用于签约 ────────────────────────────
function ResumeReleaseModal({
  resume,
  onClose,
  onSuccess,
}: {
  resume: Resume | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [serviceFeeCharged, setServiceFeeCharged] = useState(false);
  const [serviceFeeAmount, setServiceFeeAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!resume) {
      setServiceFeeCharged(false);
      setServiceFeeAmount('');
    }
  }, [resume]);

  const released = !!(resume as any)?.releasedForContract;

  const handleSubmit = async () => {
    if (!resume || submitting) return;
    if (released) {
      Toast.show('该简历已是释放状态');
      onClose();
      return;
    }
    if (serviceFeeCharged && !(Number(serviceFeeAmount) > 0)) {
      Toast.show('请填写大于 0 的服务费金额');
      return;
    }
    try {
      setSubmitting(true);
      Toast.show({ icon: 'loading', content: '提交中...', duration: 0 });
      const res = await resumeService.releaseForContract(rid(resume), {
        serviceFeeCharged,
        serviceFeeAmount: serviceFeeCharged ? Number(serviceFeeAmount) : 0,
      });
      if (res?.success) {
        Toast.show({ icon: 'success', content: res?.data?.alreadyReleased ? '简历已是释放状态' : '释放成功' });
        onClose();
        onSuccess?.();
      } else {
        Toast.show({ icon: 'fail', content: res?.message || '释放失败' });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e?.response?.data?.message || e?.message || '释放失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup visible={!!resume} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '16px', paddingBottom: 32 }}>
      {resume && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>🔓 释放该简历用于签约</span>
            <span onClick={onClose} style={{ fontSize: 20, color: '#999' }}>×</span>
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            简历：<span style={{ color: '#158F82', fontWeight: 500 }}>{resume.name || '—'}</span>
          </div>
          {released ? (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12, color: '#52c41a', fontSize: 14, marginBottom: 16 }}>
              该简历已释放，任何员工均可用此简历发起合同。
            </div>
          ) : (
            <>
              <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: 12, color: '#faad14', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                释放后该简历可被任意员工用于发起合同，操作不可撤销。
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}><span style={{ color: '#ff4d4f' }}>*</span> 是否收取服务费</div>
                <Selector
                  columns={2}
                  value={[serviceFeeCharged ? 'yes' : 'no']}
                  onChange={(v) => {
                    const yes = v[0] === 'yes';
                    setServiceFeeCharged(yes);
                    if (!yes) setServiceFeeAmount('');
                  }}
                  options={[
                    { label: '收取', value: 'yes' },
                    { label: '不收取', value: 'no' },
                  ]}
                />
              </div>
              {serviceFeeCharged && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}><span style={{ color: '#ff4d4f' }}>*</span> 服务费金额（元）</div>
                  <Input
                    type="number"
                    placeholder="请输入服务费金额"
                    value={serviceFeeAmount}
                    onChange={setServiceFeeAmount}
                    style={{ background: '#f5f7fa', borderRadius: 8, padding: '8px 12px', '--font-size': '14px' }}
                  />
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <Button block disabled={submitting} onClick={onClose} style={{ flex: 1, background: '#f5f7fa', color: '#333', borderRadius: 8, border: 'none' }}>取消</Button>
            {!released && (
              <Button block loading={submitting} disabled={submitting} onClick={handleSubmit} style={{ flex: 1, background: '#158F82', color: '#fff', borderRadius: 8, border: 'none' }}>✔ 确认释放</Button>
            )}
          </div>
        </>
      )}
    </Popup>
  );
}
// ── 简历详情 ────────────────────────────────────
function DetailView({
  id,
  onBack,
  onEdit,
  canEdit,
}: {
  id: string;
  onBack: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const canAssign = usePermission('resume:assign');
  const canDelete = usePermission('resume:delete');
  const currentUser = useAuthStore((state) => state.user);
  const { data, loading, error, run } = useApi<Resume>(resumeService.getById, {
    cacheKey: (id: string) => ['resume', id],
    staleTime: CACHE_TIME.detail.staleTime,
    gcTime: CACHE_TIME.detail.gcTime,
  });
  const [followUpVisible, setFollowUpVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [releaseVisible, setReleaseVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [blacklistVisible, setBlacklistVisible] = useState(false);
  const canBlacklist = usePermission('blacklist:create');

  useEffect(() => {
    run(id).catch(() => {});
  }, [id, run]);

  const photos = normPhotos(data?.personalPhoto);
  const certs = normPhotos(data?.certificates);
  const idCards = [
    ...normPhotos((data as any)?.idCardFront),
    ...normPhotos((data as any)?.idCardBack),
  ];
  const uniformPhotos = normPhotos((data as any)?.uniformPhoto);
  const reports = normPhotos((data as any)?.reports);
  const confinementMealPhotos = normPhotos((data as any)?.confinementMealPhotos);
  const cookingPhotos = normPhotos((data as any)?.cookingPhotos);
  const complementaryFoodPhotos = normPhotos((data as any)?.complementaryFoodPhotos);
  const positiveReviewPhotos = normPhotos((data as any)?.positiveReviewPhotos);
  const headerOrderStatus = ORDER_STATUS_MAP[data?.orderStatus || ''] || { text: '待确认', color: 'default' as const };
  const headerStatusAccent: Record<string, string> = {
    success: '#9CF3DD',
    primary: '#BDE7FF',
    warning: '#FFE1A7',
    danger: '#FFD0D5',
    default: '#D5E9E6',
  };
  const staffName = (staff: unknown) => {
    if (!staff || typeof staff !== 'object') return '';
    const value = staff as { name?: unknown; username?: unknown };
    return typeof value.name === 'string' ? value.name : (typeof value.username === 'string' ? value.username : '');
  };
  // 新分配简历优先取 assignedTo；旧数据兼容历史归属人和创建人。
  const headerOwnerName = staffName(data?.assignedTo) || data?.ownerStaffName || staffName((data as any)?.userId);
  const introVideoUrl = resolveFileUrl((data as any)?.selfIntroductionVideo?.url);
  const albumCount =
    idCards.length + photos.length + uniformPhotos.length + certs.length +
    reports.length + confinementMealPhotos.length + cookingPhotos.length +
    complementaryFoodPhotos.length + positiveReviewPhotos.length + (introVideoUrl ? 1 : 0);

  const evalCount = Array.isArray((data as any)?.employeeEvaluations) ? (data as any).employeeEvaluations.length : 0;
  const resumeOwnerId = String((data as any)?.userId?._id || (data as any)?.userId || (data as any)?.createdBy?._id || (data as any)?.createdBy || '');
  const currentUserId = String(currentUser?._id || currentUser?.id || '');
  const canRelease = currentUser?.role === 'admin' || (Boolean(currentUserId) && resumeOwnerId === currentUserId);

  const handleDelete = async () => {
    if (!data || !canDelete) return;
    const confirmed = await Dialog.confirm({
      title: '删除简历',
      content: `确定删除“${data.name}”吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    });
    if (!confirmed) return;
    try {
      await resumeService.delete(rid(data));
      queryClient.removeQueries({ queryKey: ['resumes'] });
      Toast.show({ icon: 'success', content: '已删除' });
      onBack();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '删除失败' });
    }
  };

  const handleToggleHidden = async () => {
    if (!data) return;
    try {
      const result = await resumeService.toggleHidden(rid(data));
      Toast.show({ icon: 'success', content: result.isHidden ? '简历已屏蔽' : '简历已恢复可见' });
      run(id).catch(() => {});
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '操作失败' });
    }
  };

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', fontWeight: 600, fontSize: 17 }}>
          <div onClick={onBack} style={{ position: 'absolute', left: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#333' }}>
            <LeftOutline style={{ fontSize: 22 }} />
          </div>
          简历详情
          <div style={{ position: 'absolute', right: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
            <div onClick={() => setMoreVisible(true)} style={{ fontSize: 15, color: '#158F82', cursor: 'pointer', fontWeight: 500, padding: '10px 0 10px 10px' }}>
              更多
            </div>
          </div>
        </div>
      </div>
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <DotLoading color="primary" />
        </div>
      )}
      {error && !data && (
        <ErrorBlock status="default" title="加载失败" description="返回重试" style={{ padding: 24 }} />
      )}
      {data && (
        <>
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #158F82 0%, #20A093 100%)',
              borderRadius: 16,
              padding: 16,
              color: '#fff',
              boxShadow: '0 4px 16px rgba(21,143,130,0.18)',
              marginTop: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {photos.length > 0 ? (
                  <Image
                    src={resolveFileUrl(photos[0].url)}
                    width={76}
                    height={76}
                    fit="cover"
                    style={{ borderRadius: 12, border: '2px solid rgba(255,255,255,0.45)' }}
                  />
                ) : (
                  <div style={{ width: 76, height: 76, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 600, border: '2px solid rgba(255,255,255,0.45)', flexShrink: 0 }}>
                    {data.name?.charAt(0) || '阿'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, minHeight: 76, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
                    <span style={{ fontSize: 11, opacity: 0.72, whiteSpace: 'nowrap' }}>
                      {data.id || `A${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}001`}
                    </span>
                    {data.leadSource === 'recommendation' && (
                      <Tag color="#FFB800" style={{ borderRadius: 12, padding: '0 6px', color: '#fff', fontSize: 10, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 12 }}>★</span> 推荐
                      </Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {data.gender === 'female' ? '女' : '男'} · {data.age != null ? `${data.age}岁` : '-'} · {data.nativePlace?.split('省')?.[0] || '未知'} · {data.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                  </div>
                  <div style={{ display: 'flex', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <Tag color="rgba(255,255,255,0.2)" style={{ color: '#fff', border: 'none', borderRadius: 12, padding: '1px 6px', fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>{jobTypeText(data.jobType)}</Tag>
                    {data.experienceYears != null ? <Tag color="rgba(255,255,255,0.2)" style={{ color: '#fff', border: 'none', borderRadius: 12, padding: '1px 6px', fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>{data.experienceYears}年经验</Tag> : null}
                    <Tag color="rgba(255,255,255,0.2)" style={{ color: '#fff', border: 'none', borderRadius: 12, padding: '1px 6px', fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>{(data.ethnicity as string) || '汉族'}</Tag>
                    <Tag color="rgba(255,255,255,0.2)" style={{ color: '#fff', border: 'none', borderRadius: 12, padding: '1px 6px', fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>{data.maritalStatus ? MARITAL_STATUS_MAP[data.maritalStatus] : '未知'}</Tag>
                  </div>
                </div>
                <div style={{ width: 88, minHeight: 76, flexShrink: 0, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.22)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, opacity: 0.76, marginBottom: 7 }}>接单状态</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span style={{ color: headerStatusAccent[headerOrderStatus.color], fontSize: 15, lineHeight: 1 }}>●</span>
                    {headerOrderStatus.text}
                  </div>
                  <div title={headerOwnerName} style={{ marginTop: 7, fontSize: 11, opacity: 0.82, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {headerOwnerName ? `归属：${headerOwnerName}` : '归属：未分配'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.22)', textAlign: 'center' }}>
                {[
                  { value: fmtMoney(data.expectedSalary), label: '期望薪资/月' },
                  { value: (data as any).avgRating || '5.0', label: '综合评分' },
                  { value: Array.isArray((data as any).workExperiences) ? (data as any).workExperiences.length : '0', label: '服务客户' },
                  { value: (data as any).followUpCount || '0', label: '跟进次数' },
                ].map((metric, index) => (
                  <div key={metric.label} style={{ minWidth: 0, padding: '0 4px', borderRight: index < 3 ? '1px solid rgba(255,255,255,0.16)' : 'none' }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.value}</div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3, whiteSpace: 'nowrap' }}>{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div style={{ padding: '16px 16px 12px', fontSize: 16, fontWeight: 600, color: '#1a1a1a', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 16, background: '#158F82', borderRadius: 2 }}></div>
                <span style={{ fontSize: 16 }}>📋</span> 基本信息
              </div>
              <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderBottom: '1px solid #f5f5f5' }}>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>姓名</div><div style={{ fontSize: 14, color: '#333' }}>{data.name || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>身份证</div><div style={{ fontSize: 14, color: '#333' }}>{data.idNumber ? data.idNumber.replace(/^(.{6})(?:\d+)(.{4})$/, "$1********$2") : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>性别</div><div style={{ fontSize: 14, color: '#333' }}>{data.gender === 'male' ? '男' : data.gender === 'female' ? '女' : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>出生日期</div><div style={{ fontSize: 14, color: '#333' }}>{data.birthDate ? (typeof data.birthDate === 'string' ? data.birthDate.split('T')[0] : (data.birthDate as any).toString()) : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>年龄</div><div style={{ fontSize: 14, color: '#333' }}>{data.age != null ? `${data.age} 岁` : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>身高/体重</div><div style={{ fontSize: 14, color: '#333' }}>{data.height ? `${data.height} cm` : '-'} / {data.weight ? `${data.weight} kg` : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>民族</div><div style={{ fontSize: 14, color: '#333' }}>{(data.ethnicity as string) || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>婚姻状况</div><div style={{ fontSize: 14, color: '#333' }}>{data.maritalStatus ? MARITAL_STATUS_MAP[data.maritalStatus] || data.maritalStatus : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>籍贯</div><div style={{ fontSize: 14, color: '#333' }}>{data.nativePlace || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>现住地址</div><div style={{ fontSize: 14, color: '#333' }}>{data.currentAddress || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>学历</div><div style={{ fontSize: 14, color: '#333' }}>{data.education ? EDUCATION_MAP[data.education] || data.education : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>宗教信仰</div><div style={{ fontSize: 14, color: '#333' }}>{data.religion ? RELIGION_MAP[data.religion as string] || (data.religion as string) : '无'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>微信号</div><div style={{ fontSize: 14, color: '#333' }}>{(data as any).wechat || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>属相</div><div style={{ fontSize: 14, color: '#333' }}>{(data as any).zodiac ? ZODIAC_MAP[(data as any).zodiac] || (data as any).zodiac : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>星座</div><div style={{ fontSize: 14, color: '#333' }}>{(data as any).zodiacSign ? ZODIAC_SIGN_MAP[(data as any).zodiacSign] || (data as any).zodiacSign : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>户籍地址</div><div style={{ fontSize: 14, color: '#333' }}>{(data as any).hukouAddress || '-'}</div></div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div style={{ padding: '16px 16px 12px', fontSize: 16, fontWeight: 600, color: '#1a1a1a', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 16, background: '#158F82', borderRadius: 2 }}></div>
                <span style={{ fontSize: 16 }}>💼</span> 工作信息
              </div>
              <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderBottom: '1px solid #f5f5f5' }}>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>工种</div><div style={{ fontSize: 14, color: '#333' }}>{jobTypeText(data.jobType) || '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>接单状态</div><div style={{ fontSize: 14, color: '#333' }}>{data.orderStatus ? (ORDER_STATUS_MAP[data.orderStatus]?.text || data.orderStatus) : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>工作经验</div><div style={{ fontSize: 14, color: '#333' }}>{data.experienceYears != null ? `${data.experienceYears} 年` : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>期望薪资</div><div style={{ fontSize: 14, color: '#333' }}>{data.expectedSalary ? fmtMoney(data.expectedSalary) : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>月嫂档位</div><div style={{ fontSize: 14, color: '#333' }}>{(data as any).maternityNurseLevel ? MATERNITY_NURSE_LEVEL_MAP[(data as any).maternityNurseLevel] || (data as any).maternityNurseLevel : '-'}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>服务区域</div><div style={{ fontSize: 14, color: '#333' }}>{Array.isArray(data.serviceArea) ? (data.serviceArea.join('、') || '-') : ((data as any).serviceArea || '-')}</div></div>
                <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>线索来源</div><div style={{ fontSize: 14, color: '#333' }}>{data.leadSource ? LEAD_SOURCE_MAP[data.leadSource as string] || (data.leadSource as string) : '-'}</div></div>
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
            <Tabs defaultActiveKey="basic">
              <Tabs.Tab title="基本信息" key="basic">
                {/* 技能标签 */}
                {Array.isArray(data.skills) && data.skills.length > 0 && (
                  <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>技能标签</div>
                    <Space wrap>
                      {data.skills.map((s, i) => (
                        <Tag key={i} color="primary" fill="outline" style={{ borderRadius: 4, padding: '4px 8px' }}>
                          {SKILLS_MAP[s] || s}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}

                {/* 推荐理由 */}
                {Array.isArray((data as any).recommendationTags) && (data as any).recommendationTags.length > 0 && (
                  <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>推荐理由</div>
                    <Space wrap>
                      {((data as any).recommendationTags as Array<{ tag: string; count: number }>).map((t, i) => (
                        <Tag key={i} color="primary" fill="outline" style={{ borderRadius: 4, padding: '4px 8px' }}>
                          {t.tag}（{t.count}）
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}

                {/* 自我介绍 */}
                <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>自我介绍</div>
                  {(data as any).selfIntroduction ? (
                    <div style={{ fontSize: 14, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(data as any).selfIntroduction}</div>
                  ) : (
                    <div style={{ fontSize: 14, color: '#999' }}>暂无自我介绍</div>
                  )}
                </div>

                {/* 内部备注 */}
                {canEdit && (data as any).internalEvaluation && (
                  <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>内部备注 <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>（仅内部可见）</span></div>
                    <div style={{ fontSize: 14, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(data as any).internalEvaluation}</div>
                  </div>
                )}
              </Tabs.Tab>

              <Tabs.Tab title={`工作经历(${Array.isArray((data as any).workExperiences) ? (data as any).workExperiences.length : 0})`} key="work">
                {Array.isArray((data as any).workExperiences) && (data as any).workExperiences.length > 0 ? (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#f5f7fa' }}>
                    {((data as any).workExperiences as Array<Record<string, any>>).map((exp, i) => (
                      <div key={i} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>{exp.customerName ? `${exp.customerName}的订单` : '工作经历'}</div>
                          <Tag color="success" fill="outline">已完结</Tag>
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                          {(exp.startDate ? String(exp.startDate).split('T')[0] : '?')} ~ {(exp.endDate ? String(exp.endDate).split('T')[0] : '至今')}
                        </div>
                        {exp.description && (
                          <div style={{ fontSize: 14, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 8, marginTop: 12 }}>
                            {exp.description}
                          </div>
                        )}
                        {exp.customerReview && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #eee' }}>
                            <div style={{ fontSize: 13, color: '#fadb14', marginBottom: 8 }}>★★★★★ <span style={{ color: '#666', marginLeft: 8 }}>5.0 · 客户评价</span></div>
                            <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{exp.customerReview}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无工作经历" />
                )}
              </Tabs.Tab>

              <Tabs.Tab title={`评价与介绍${evalCount > 0 ? `(${evalCount})` : ''}`} key="evaluation">
                <div style={{ padding: 16, background: '#f5f7fa', minHeight: '300px' }}>
                  <ResumeEvaluations resume={data} canEdit={canEdit} />
                </div>
              </Tabs.Tab>

              <Tabs.Tab title={`相册(${albumCount})`} key="album">
                <div style={{ padding: 16 }}>
                  {albumCount === 0 && !introVideoUrl ? (
                    <Empty description="暂无照片" />
                  ) : (
                    <>
                      <PhotoBlock title="身份证" photos={idCards} />
                      <PhotoBlock title="个人照片" photos={photos} />
                      <PhotoBlock title="工服照片" photos={uniformPhotos} />
                      <PhotoBlock title="证书证件" photos={certs} />
                      <PhotoBlock title="体检报告" photos={reports} />
                      <PhotoBlock title="月子餐照片" photos={confinementMealPhotos} />
                      <PhotoBlock title="做饭照片" photos={cookingPhotos} />
                      <PhotoBlock title="辅食照片" photos={complementaryFoodPhotos} />
                      <PhotoBlock title="好评截图" photos={positiveReviewPhotos} />
                      {introVideoUrl && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 4, height: 14, background: '#158F82', borderRadius: 2 }}></div>
                            自我介绍视频
                          </div>
                          <video src={introVideoUrl} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Tabs.Tab>

              <Tabs.Tab title="业务信息" key="business">
                <ResumeBusinessDetails resume={data} isAdmin={currentUser?.role === 'admin'} onUpdated={() => run(id)} />
              </Tabs.Tab>

              <Tabs.Tab title="跟进记录" key="followup">
                <div style={{ padding: 16, background: '#f5f7fa', minHeight: '300px' }}>
                  <ResumeFollowUps resumeId={id} canEdit={canEdit} />
                </div>
              </Tabs.Tab>
            </Tabs>
          </div>

          {/* 底部固定操作栏（毛玻璃效果） */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(0,0,0,0.05)',
            display: 'flex',
            gap: 12,
            zIndex: 100,
          }}>
            <div onClick={() => setFollowUpVisible(true)} style={{ flex: 1, background: '#f5f9f8', borderRadius: 12, padding: '12px 0', textAlign: 'center', color: '#158F82', fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
              <span>💬</span> 跟进
            </div>
            <div onClick={() => {
              if (canEdit && data) {
                onEdit();
              } else {
                Toast.show('您没有编辑权限');
              }
            }} style={{ flex: 1, background: '#f5f9f8', borderRadius: 12, padding: '12px 0', textAlign: 'center', color: '#158F82', fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
              <span>📝</span> 编辑简历
            </div>
            <div onClick={() => {
              if (data.phone) {
                window.location.href = `tel:${data.phone}`;
              } else {
                Toast.show('暂无手机号码');
              }
            }} style={{ flex: 1.5, background: '#158F82', borderRadius: 12, padding: '12px 0', textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
              <span>📞</span> 拨打电话
            </div>
          </div>

          <ResumeFollowUpModal
            resume={followUpVisible ? data : null}
            onClose={() => setFollowUpVisible(false)}
            onSuccess={() => run(id)}
          />
          <ResumeAssignModal
            resume={assignVisible ? data : null}
            onClose={() => setAssignVisible(false)}
            onSuccess={() => run(id)}
          />
          <ResumeReleaseModal
            resume={releaseVisible ? data : null}
            onClose={() => setReleaseVisible(false)}
            onSuccess={() => run(id)}
          />
          <BlacklistResumeModal resume={blacklistVisible ? data : null} onClose={() => setBlacklistVisible(false)} onSuccess={() => run(id)} />
          <Popup
            visible={moreVisible}
            onMaskClick={() => setMoreVisible(false)}
            bodyStyle={{ borderTopLeftRadius: '16px', borderTopRightRadius: '16px', padding: '24px 16px', minHeight: '30vh' }}
          >
            <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#333' }}>
              更多操作
            </div>
            <Grid columns={4} gap={[16, 24]}>
              {[
                { icon: <MessageOutline />, text: '添加跟进', key: 'follow', onClick: () => setFollowUpVisible(true) },
                ...(canAssign ? [{ icon: <UserContactOutline />, text: '分配员工', key: 'assign', onClick: () => setAssignVisible(true) }] : []),
                ...(canRelease ? [{ icon: (data as any)?.releasedForContract ? <CheckCircleOutline color="#52c41a" /> : <UnlockOutline />, text: (data as any)?.releasedForContract ? '已释放' : '释放简历', key: 'release', onClick: () => setReleaseVisible(true) }] : []),
                { icon: <EyeInvisibleOutline color="#ff4d4f" />, text: (data as any).isHidden ? '恢复可见' : '屏蔽简历', key: 'hide', danger: true, onClick: handleToggleHidden },
                ...(canBlacklist ? [{ icon: <StopOutline color="#ff4d4f" />, text: '加入黑名单', key: 'block', danger: true, onClick: () => setBlacklistVisible(true) }] : []),
                { icon: <SearchOutline />, text: '背景调查', key: 'bgcheck', onClick: () => Toast.show({ content: '请在“业务信息”查看背调状态' }) },
                ...(canEdit && data ? [{ icon: <EditSOutline />, text: '编辑简历', key: 'edit', onClick: onEdit }] : []),
                ...(canDelete ? [{ icon: <StopOutline color="#ff4d4f" />, text: '删除简历', key: 'delete', danger: true, onClick: handleDelete }] : [])
              ].map(item => (
                <Grid.Item
                  key={item.key}
                  onClick={() => {
                    if (item.onClick) {
                      item.onClick();
                    } else if (item.key !== 'edit' && item.key !== 'follow' && item.key !== 'assign' && item.key !== 'release' && item.key !== 'delete' && item.key !== 'block' && item.key !== 'bgcheck' && item.key !== 'hide') {
                      Toast.show('该功能即将上线');
                    }
                    setMoreVisible(false);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: item.danger ? '#fff1f0' : '#f5f7fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    color: item.danger ? '#ff4d4f' : '#666',
                    marginBottom: 8
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>
                    {item.text}
                  </div>
                </Grid.Item>
              ))}
            </Grid>
            <div style={{ marginTop: 32 }}>
              <Button block shape="rounded" onClick={() => setMoreVisible(false)} style={{ background: '#f5f7fa', color: '#666', border: 'none' }}>
                取消
              </Button>
            </div>
          </Popup>
        </>
      )}
    </div>
  );
}

function ResumeBusinessDetails({ resume, isAdmin, onUpdated }: { resume: Resume; isAdmin: boolean; onUpdated: () => void }) {
  const resumeId = rid(resume);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<any>((resume as any).medicalReportSummary);
  const [background, setBackground] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [releaseLogs, setReleaseLogs] = useState<any[]>([]);
  const [operationLogs, setOperationLogs] = useState<any[]>([]);
  const [availabilityVisible, setAvailabilityVisible] = useState(false);
  const [availabilityForm] = Form.useForm();

  const reload = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    const [bg, contractResult, calendar, releases, operations] = await Promise.all([
      resumeService.getBackgroundCheckStatus(resumeId).catch(() => null),
      resumeService.getResumeContracts(resumeId).catch(() => null),
      resumeService.getAvailability(resumeId).catch(() => null),
      resumeService.getReleaseLogs(resumeId).catch(() => []),
      isAdmin ? resumeService.getOperationLogs(resumeId).catch(() => []) : Promise.resolve([]),
    ]);
    setBackground(bg);
    setContracts(Array.isArray((contractResult as any)?.data) ? (contractResult as any).data : []);
    setAvailability((calendar as any)?.availabilityCalendar || []);
    setReleaseLogs(Array.isArray(releases) ? releases : []);
    setOperationLogs(Array.isArray(operations) ? operations : []);
    setLoading(false);
  }, [isAdmin, resumeId]);

  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);

  const analyze = async () => {
    if (!((resume as any).reports?.length || (resume as any).medicalReportUrls?.length)) {
      Toast.show({ content: '该简历未上传体检报告' });
      return;
    }
    Toast.show({ icon: 'loading', content: 'AI 正在解读...', duration: 0 });
    try {
      const result = await resumeService.analyzeMedicalReport(resumeId);
      setAnalysis(result);
      onUpdated();
      Toast.show({ icon: 'success', content: '体检解读已生成' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '解读失败' });
    }
  };

  const saveAvailability = async (values: Record<string, unknown>) => {
    try {
      const status = Array.isArray(values.status) ? values.status[0] : values.status;
      await resumeService.updateAvailability(resumeId, { startDate: String(values.startDate), endDate: String(values.endDate), status: status as any, remarks: values.remarks as string });
      Toast.show({ icon: 'success', content: '档期已更新' });
      availabilityForm.resetFields();
      setAvailabilityVisible(false);
      await reload();
      onUpdated();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '更新档期失败' });
    }
  };

  const statusText: Record<string, string> = { available: '可接单', unavailable: '不可接单', occupied: '已占用', leave: '请假', unset: '未设置' };
  return <div style={{ padding: 16, background: '#f5f7fa', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <CardSection title="体检 AI 解读">
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#555', lineHeight: 1.7 }}>
          {analysis ? <>
            <div>{String(analysis.overallConclusion || analysis.conclusion || analysis.summary || '已生成体检解读')}</div>
            <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>分析时间：{fmtDateTime(analysis.analyzedAt || '') || '-'}</div>
          </> : '尚未生成体检 AI 解读'}
        </div>
        <Button size="small" color="primary" loading={loading} onClick={analyze} style={{ marginTop: 0, flexShrink: 0 }}>{analysis ? '重新 AI 解读' : 'AI 体检解读'}</Button>
      </div>
    </CardSection>
    <CardSection title="保险与背景调查">
      <div style={{ padding: 12, fontSize: 14, lineHeight: 2 }}>
        <div>保险：<Tag color={background?.hasInsurance ? 'success' : 'default'}>{background?.hasInsurance ? '已查询到记录' : '暂无记录'}</Tag></div>
        <div>背调：<Tag color={background?.hasBackgroundCheck ? 'success' : 'default'}>{background?.hasBackgroundCheck ? '已查询到记录' : '暂无记录'}</Tag></div>
      </div>
    </CardSection>
    <CardSection title={`合同记录（${contracts.length}）`}>
      <List>{contracts.length ? contracts.map((contract) => <List.Item key={contract._id} description={`${contract.customerName || '-'} · ${fmtDateTime(contract.esignSignedAt || contract.createdAt || '')}`} extra={<Tag>{contract.contractStatus || '未知状态'}</Tag>}>{contract.contractNumber || '未编号'} · {fmtMoney(Number(contract.customerServiceFee || contract.serviceFeeAmount || 0))}</List.Item>) : <Empty description="暂无关联合同" />}</List>
    </CardSection>
    <CardSection title="档期日历">
      <div style={{ padding: 12 }}>
        <Button size="small" color="primary" onClick={() => setAvailabilityVisible(true)}>设置档期</Button>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{availability.length ? availability.slice(0, 30).map((item: any) => <Tag key={`${item.date}-${item.status}`} color={item.status === 'available' ? 'success' : item.status === 'occupied' ? 'warning' : 'default'}>{item.date} · {statusText[item.status] || item.status}</Tag>) : <span style={{ fontSize: 13, color: '#999' }}>暂无档期设置</span>}</div>
      </div>
    </CardSection>
    {releaseLogs.length > 0 && <CardSection title="释放记录"><List>{releaseLogs.map((log) => <List.Item key={log._id || log.operatedAt} description={fmtDateTime(log.operatedAt || '')}>{log.operationName || log.operationType} · {log.operator?.name || log.operator?.username || '系统'}</List.Item>)}</List></CardSection>}
    {isAdmin && <CardSection title="操作日志"><List>{operationLogs.length ? operationLogs.map((log) => <List.Item key={log._id || log.operatedAt} description={fmtDateTime(log.operatedAt || '')}>{log.operationName || log.operationType} · {log.operator?.name || log.operator?.username || '系统'}</List.Item>) : <Empty description="暂无操作日志" />}</List></CardSection>}
    <Popup visible={availabilityVisible} onMaskClick={() => setAvailabilityVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>设置档期</div>
      <Form form={availabilityForm} onFinish={saveAvailability} layout="vertical">
        <Form.Item name="startDate" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}><Input type="date" /></Form.Item>
        <Form.Item name="endDate" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}><Input type="date" /></Form.Item>
        <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}><Selector options={Object.entries(statusText).filter(([value]) => value !== 'unset').map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="remarks" label="备注"><TextArea rows={2} placeholder="选填" /></Form.Item>
        <Button block color="primary" onClick={() => availabilityForm.submit()}>保存档期</Button>
      </Form>
    </Popup>
  </div>;
}

function BlacklistResumeModal({ resume, onClose, onSuccess }: { resume: Resume | null; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (resume) form.setFieldsValue({ name: resume.name, phone: resume.phone, idCard: resume.idNumber }); }, [form, resume]);
  const submit = async (values: Record<string, unknown>) => {
    if (!resume) return;
    const type = Array.isArray(values.reasonType) ? values.reasonType[0] : values.reasonType;
    setSubmitting(true);
    try {
      const existing = await resumeService.checkBlacklist({ phone: values.phone as string, idCard: values.idCard as string });
      if (existing?.hit) throw new Error('该阿姨已在黑名单中');
      await resumeService.createBlacklist({ name: String(values.name), phone: values.phone as string, idCard: values.idCard as string, reason: String(values.reason), reasonType: type as any, remarks: values.remarks as string, sourceType: 'resume', sourceResumeId: rid(resume) });
      Toast.show({ icon: 'success', content: '已加入黑名单' });
      form.resetFields(); onClose(); onSuccess();
    } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '加入黑名单失败' }); }
    finally { setSubmitting(false); }
  };
  return <Popup visible={!!resume} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>加入黑名单</div>
    <Form form={form} onFinish={submit} layout="vertical">
      <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
      <Form.Item name="phone" label="手机号"><Input type="tel" /></Form.Item>
      <Form.Item name="idCard" label="身份证号"><Input /></Form.Item>
      <Form.Item name="reasonType" label="原因类型" rules={[{ required: true, message: '请选择原因类型' }]}><Selector columns={2} options={[{ label: '欺诈', value: 'fraud' }, { label: '严重投诉', value: 'serious_complaint' }, { label: '服务质量', value: 'work_quality' }, { label: '违约', value: 'contract_breach' }, { label: '其他', value: 'other' }]} /></Form.Item>
      <Form.Item name="reason" label="原因说明" rules={[{ required: true, message: '请填写原因说明' }]}><TextArea rows={3} maxLength={500} showCount /></Form.Item>
      <Form.Item name="remarks" label="内部备注"><TextArea rows={2} maxLength={200} /></Form.Item>
      <Button block color="danger" loading={submitting} onClick={() => form.submit()}>确认加入</Button>
    </Form>
  </Popup>;
}

// 单列选择器字段（适配 antd-mobile Form.Item 的受控用法，适合长列表如籍贯/民族/生肖）
function PickerField({
  value,
  onChange,
  options,
  placeholder = '请选择',
}: {
  value?: string;
  onChange?: (v?: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <div
        onClick={() => setVisible(true)}
        style={{ fontSize: 15, color: current ? '#333' : '#ccc', minHeight: 22, cursor: 'pointer' }}
      >
        {current ? current.label : placeholder}
      </div>
      <Picker
        columns={[options]}
        visible={visible}
        onClose={() => setVisible(false)}
        value={value ? [value] : []}
        onConfirm={(v) => onChange?.((v[0] as string) ?? undefined)}
      />
    </>
  );
}

// 通用图片网格：缩略图 + 删除 + 添加按钮（用于个人照片/证书/月子餐等多图上传）
function ImageGrid({
  files,
  onAdd,
  onRemove,
  addLabel = '添加',
}: {
  files: NativeFile[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 8 }}>
      {files.map((f, i) => (
        <div key={i} style={{ width: 100, height: 100, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
          <Image src={f.webPath || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div
            onClick={() => onRemove(i)}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}
          >
            ×
          </div>
        </div>
      ))}
      <div onClick={onAdd} style={{ width: 100, height: 100, background: '#f5f7fa', border: '1px dashed #d9d9d9', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', cursor: 'pointer' }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
        <div style={{ fontSize: 13 }}>{addLabel}</div>
      </div>
    </div>
  );
}

function ResumeFollowUpModal({
  resume,
  onClose,
  onSuccess,
}: {
  resume: Resume | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [nextFollowUpTime, setNextFollowUpTime] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [followUpForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!resume) {
      followUpForm.resetFields();
      setNextFollowUpTime(null);
    }
  }, [resume, followUpForm]);

  const handleSubmit = async (values: any) => {
    if (!resume || submitting) return;
    try {
      setSubmitting(true);
      Toast.show({ icon: 'loading', content: '提交中...', duration: 0 });
      const type = Array.isArray(values.type) ? values.type[0] : values.type || 'phone';
      await resumeService.createFollowUp({
        resumeId: rid(resume),
        type,
        content: values.content,
      });
      Toast.show({ icon: 'success', content: '跟进提交成功' });
      onClose();
      onSuccess?.();
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e?.response?.data?.message || e?.message || '提交失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup visible={!!resume} onMaskClick={onClose} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '16px', minHeight: '60vh' }}>
      {resume && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#e83e8c' }}>📞</span> 跟进{resume.name}
            </span>
            <span onClick={onClose} style={{ fontSize: 20, color: '#999' }}>×</span>
          </div>
          <div style={{ background: '#f5f7fa', borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
             <div style={{ width: 40, height: 40, borderRadius: 8, background: '#158F82', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0, overflow: 'hidden' }}>
               {normPhotos(resume.personalPhoto)?.[0]?.url ? (
                 <img src={resolveFileUrl(normPhotos(resume.personalPhoto)[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
               ) : (
                 resume.name?.charAt(0) || '阿'
               )}
             </div>
             <div style={{ flex: 1 }}>
               <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 4 }}>{resume.name}</div>
               <div style={{ fontSize: 12, color: '#666' }}>{jobTypeText(resume.jobType)} · {fmtMoney(resume.expectedSalary)}/月 · {resume.phone}</div>
             </div>
             <a href={`tel:${resume.phone}`} style={{ width: 32, height: 32, borderRadius: 16, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e83e8c', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', textDecoration: 'none' }}>
               📞
             </a>
          </div>
          <Form form={followUpForm} onFinish={handleSubmit} layout="vertical">
            <Form.Item name="type" label={<span style={{ color: '#666' }}><span style={{ color: '#ff4d4f' }}>*</span> 沟通方式</span>} initialValue={['phone']} rules={[{ required: true, message: '请选择沟通方式' }]}>
              <Selector
                columns={3}
                options={[
                  { label: '电话沟通', value: 'phone' },
                  { label: '微信沟通', value: 'wechat' },
                  { label: '到店沟通', value: 'visit' },
                  { label: '面试沟通', value: 'interview' },
                  { label: '已签约', value: 'signed' },
                  { label: '其他', value: 'other' },
                ]}
                style={{ '--border-radius': '16px', '--padding': '6px 0', fontSize: 13 }}
              />
            </Form.Item>
            <Form.Item name="content" label={<span style={{ color: '#666' }}><span style={{ color: '#ff4d4f' }}>*</span> 跟进内容</span>} rules={[{ required: true, message: '请填写跟进内容' }]}>
              <TextArea placeholder="2024-12-15 11:20
📞 电话沟通 5 分钟
- 阿姨期望薪资 9000 元/月，希望找北京" rows={4} style={{ background: '#f5f7fa', borderRadius: 8, padding: 8 }} />
            </Form.Item>
            <Form.Item label={<span style={{ color: '#666' }}>下次跟进时间</span>}>
              <div onClick={() => setDatePickerVisible(true)} style={{ background: '#f5f7fa', borderRadius: 8, padding: '8px 12px', fontSize: '14px', color: nextFollowUpTime ? '#333' : '#999' }}>
                {nextFollowUpTime ? dayjs(nextFollowUpTime).format('YYYY-MM-DD HH:mm') : '请选择下次跟进时间'}
              </div>
              <DatePicker
                visible={datePickerVisible}
                onClose={() => setDatePickerVisible(false)}
                precision="minute"
                onConfirm={(val) => {
                  setNextFollowUpTime(val);
                }}
              />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <Button block disabled={submitting} onClick={onClose} style={{ flex: 1, background: '#f5f7fa', color: '#333', borderRadius: 8, border: 'none' }}>取消</Button>
            <Button block loading={submitting} disabled={submitting} onClick={() => followUpForm.submit()} style={{ flex: 1, background: '#158F82', color: '#fff', borderRadius: 8, border: 'none' }}>✔ 提交跟进</Button>
          </div>
        </>
      )}
    </Popup>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  manager: '经理',
  employee: '员工',
  operator: '运营专员',
  admissions: '招生老师',
  dispatch: '派单老师',
};

function ResumeAssignModal({
  resume,
  onClose,
  onSuccess,
}: {
  resume: Resume | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [assignForm] = Form.useForm();
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!resume) {
      assignForm.resetFields();
      setSelectedUserId('');
      setAssignSearch('');
    } else if (assignableUsers.length === 0) {
      resumeService.getAssignableUsers().then(users => {
        setAssignableUsers(users);
      }).catch(() => {
        setAssignableUsers([]);
        Toast.show({ icon: 'fail', content: '加载可分配员工失败' });
      });
    }
  }, [resume, assignableUsers.length, assignForm]);

  const handleSubmit = async () => {
    if (!resume || submitting) return;
    if (!selectedUserId) {
      Toast.show('请选择要分配的员工');
      return;
    }
    try {
      setSubmitting(true);
      Toast.show({ icon: 'loading', content: '分配中...', duration: 0 });
      await resumeService.assign(rid(resume), selectedUserId);
      Toast.show({ icon: 'success', content: '分配成功' });
      onClose();
      onSuccess?.();
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e?.response?.data?.message || e?.message || '分配失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup
      visible={!!resume}
      onMaskClick={onClose}
      style={{ '--z-index': '1200' }}
      bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '16px', minHeight: '60vh' }}
    >
      {resume && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#1890ff' }}>📤</span> 分配简历给员工
            </span>
            <span onClick={onClose} style={{ fontSize: 20, color: '#999' }}>×</span>
          </div>
          <div style={{ background: '#f5f7fa', borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
             <div style={{ width: 40, height: 40, borderRadius: 8, background: '#158F82', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0, overflow: 'hidden' }}>
               {normPhotos(resume.personalPhoto)?.[0]?.url ? (
                 <img src={resolveFileUrl(normPhotos(resume.personalPhoto)[0].url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
               ) : (
                 resume.name?.charAt(0) || '阿'
               )}
             </div>
             <div style={{ flex: 1 }}>
               <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 4 }}>{resume.name}</div>
               <div style={{ fontSize: 12, color: '#666' }}>{jobTypeText(resume.jobType)} · {fmtMoney(resume.expectedSalary)}/月 · {resume.phone}</div>
             </div>
          </div>
          <Form form={assignForm} layout="vertical">
            <Form.Item label={<span style={{ color: '#666' }}><span style={{ color: '#ff4d4f' }}>*</span> 分配给</span>}>
              <Input value={assignSearch} onChange={setAssignSearch} placeholder="搜索顾问姓名..." style={{ background: '#f5f7fa', borderRadius: 8, padding: '8px 12px', '--font-size': '14px' }} />
            </Form.Item>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
              {assignableUsers.filter(u => !assignSearch || u.name?.includes(assignSearch)).map(u => {
                const isSelected = selectedUserId === (u._id || u.id);
                return (
                  <div key={u._id || u.id} onClick={() => setSelectedUserId(u._id || u.id)} style={{ border: `1px solid ${isSelected ? '#158F82' : '#f0f0f0'}`, borderRadius: 8, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: isSelected ? '#158F82' : '#ccc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{u.name?.charAt(0) || '顾'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{u.name} <Tag color={isSelected ? 'success' : 'default'} style={{ padding: '0 4px', fontSize: 10 }}>{u.roleName || ROLE_LABELS[u.role] || u.role || '顾问'}</Tag></div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>🪪 {u.phone ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : (u.username?.length === 11 ? u.username.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '无手机号')}</div>
                    </div>
                    {isSelected && <span style={{ color: '#158F82', fontSize: 18 }}>✓</span>}
                  </div>
                );
              })}
              {assignableUsers.length === 0 && <Empty description="暂无可分配员工" />}
            </div>
            <Form.Item name="remark" label={<span style={{ color: '#666' }}>分配备注</span>}>
              <TextArea placeholder="该阿姨擅长月嫂，希望优先派单给育婴类客户" rows={3} style={{ background: '#f5f7fa', borderRadius: 8, padding: 8 }} />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <Button block disabled={submitting} onClick={onClose} style={{ flex: 1, background: '#f5f7fa', color: '#333', borderRadius: 8, border: 'none' }}>取消</Button>
            <Button block loading={submitting} disabled={submitting} onClick={handleSubmit} style={{ flex: 1, background: '#158F82', color: '#fff', borderRadius: 8, border: 'none' }}>✔ 确认分配</Button>
          </div>
        </>
      )}
    </Popup>
  );
}


// ── 新增/编辑（FormData） ───────────────────────
function FormView({
  id,
  onBack,
  onSaved,
}: {
  id?: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<NativeFile[]>([]);
  const [certFiles, setCertFiles] = useState<NativeFile[]>([]);
  const [medicalFiles, setMedicalFiles] = useState<NativeFile[]>([]);
  const [confinementMealFiles, setConfinementMealFiles] = useState<NativeFile[]>([]);
  const [cookingFiles, setCookingFiles] = useState<NativeFile[]>([]);
  const [complementaryFoodFiles, setComplementaryFoodFiles] = useState<NativeFile[]>([]);
  const [positiveReviewFiles, setPositiveReviewFiles] = useState<NativeFile[]>([]);
  const [videoFile, setVideoFile] = useState<NativeFile | null>(null);
  const [idCardFrontFile, setIdCardFrontFile] = useState<NativeFile | null>(null);
  const [idCardBackFile, setIdCardBackFile] = useState<NativeFile | null>(null);
  const removedFilesRef = useRef<RemovedResumeFile[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [workExps, setWorkExps] = useState<WorkExpItem[]>([]);
  const [datePicker, setDatePicker] = useState<{ index: number; field: 'startDate' | 'endDate' } | null>(null);
  const canEditInternal = usePermission('resume:edit');

  const isEdit = !!id;

  // 工作经历：增删改
  const addWorkExp = () =>
    setWorkExps((prev) => [...prev, { startDate: '', endDate: '', description: '', photos: [] }]);
  const removeWorkExp = (index: number) =>
    setWorkExps((prev) => prev.filter((_, i) => i !== index));
  const updateWorkExp = (index: number, patch: Partial<WorkExpItem>) =>
    setWorkExps((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));



  // 原生拍照/相册（Taylor 封装）：自动申请权限并返回可上传的 NativeFile
  // 主动关闭系统相机/相册是正常操作，不显示底层英文异常；实际错误统一中文提示。
  const showMediaSelectionError = (error: unknown, content = '选择图片失败，请重试') => {
    if (isMediaSelectionCancelled(error)) return;
    Toast.show({ icon: 'fail', content });
  };

  // 通用多图选择：追加到指定 setter（支持相册多选）
  const addImages = async (
    setter: React.Dispatch<React.SetStateAction<NativeFile[]>>,
    max: number,
  ) => {
    try {
      const fs = await pickMultipleFromGallery({ targetWidth: 1280 });
      setter((prev) => [...prev, ...fs].slice(0, max));
    } catch (e) {
      showMediaSelectionError(e);
    }
  };
  const removeImage = (
    setter: React.Dispatch<React.SetStateAction<NativeFile[]>>,
    index: number,
    fileType: RemovedResumeFile['fileType'],
  ) => setter((prev) => {
    const removed = prev[index];
    if (removed?.existingUrl) {
      removedFilesRef.current.push({ fileUrl: removed.existingUrl, fileType });
    }
    return prev.filter((_, i) => i !== index);
  });

  const replaceSingleFile = (
    current: NativeFile | null,
    setter: React.Dispatch<React.SetStateAction<NativeFile | null>>,
    next: NativeFile | null,
    fileType: RemovedResumeFile['fileType'],
  ) => {
    if (current?.existingUrl) {
      removedFilesRef.current.push({ fileUrl: current.existingUrl, fileType });
    }
    setter(next);
  };

  // 个人照片：拍照或相册（支持多张）
  const addPhoto = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const f = await takePhoto({ targetWidth: 1080 });
        setPhotoFiles((prev) => [...prev, f].slice(0, 30));
      } else {
        const fs = await pickMultipleFromGallery({ targetWidth: 1080 });
        setPhotoFiles((prev) => [...prev, ...fs].slice(0, 30));
      }
    } catch (e) {
      showMediaSelectionError(e);
    }
  };
  const addCert = () => addImages(setCertFiles, 30);

  // 工作经历照片：选图后立即上传 /upload/file 拿到 URL，写回该条经历的 photos
  const addWorkPhotos = async (index: number) => {
    let uploading = false;
    try {
      const fs = await pickMultipleFromGallery({ targetWidth: 1280 });
      const existing = workExps[index]?.photos || [];
      const room = 9 - existing.length;
      if (room <= 0) { Toast.show({ content: '最多 9 张' }); return; }
      uploading = true;
      Toast.show({ icon: 'loading', content: '上传中...', duration: 0 });
      const uploaded: { url: string; filename?: string }[] = [];
      for (const f of fs.slice(0, room)) {
        const ufd = new FormData();
        ufd.append('file', f.file!, f.fileName);
        ufd.append('type', 'workExperiencePhoto');
        const res = await apiService.upload<any>('/upload/file', ufd, 'POST');
        const url = res?.data?.fileUrl;
        if (url) uploaded.push({ url, filename: f.fileName });
      }
      Toast.clear();
      if (uploaded.length) updateWorkExp(index, { photos: [...existing, ...uploaded] });
    } catch (e) {
      Toast.clear();
      showMediaSelectionError(e, uploading ? '工作经历照片上传失败，请重试' : '选择工作经历照片失败，请重试');
    }
  };
  const removeWorkPhoto = (index: number, photoIdx: number) =>
    updateWorkExp(index, { photos: (workExps[index]?.photos || []).filter((_, i) => i !== photoIdx) });

  // 自我介绍视频（<input type=file accept=video/*>，后端限制 10MB）
  const addVideo = async () => {
    try {
      const [f] = await pickFile({ accept: 'video/*' });
      if (f.size > 10 * 1024 * 1024) {
        Toast.show({ icon: 'fail', content: '视频不能超过 10MB' });
        return;
      }
      replaceSingleFile(videoFile, setVideoFile, f, 'selfIntroductionVideo');
    } catch (e) {
      showMediaSelectionError(e, '选择视频失败，请重试');
    }
  };

  const addIdCard = async () => {
    let ocrProcessingStarted = false;
    try {
      const f = await pickFromGallery({ targetWidth: 1280 });
      replaceSingleFile(idCardFrontFile, setIdCardFrontFile, f, 'idCardFront');

      ocrProcessingStarted = true;
      setOcrProcessing(true);
      Toast.show({ icon: 'loading', content: 'OCR识别中...', duration: 0 });
      const fd = new FormData();
      fd.append('file', f.file!, f.fileName);

      const ocrRes = await apiService.upload<any>('/ocr/idcard', fd, 'POST');
      if (ocrRes.success && ocrRes.data?.words_result) {
        const words = ocrRes.data.words_result;
        const updates: any = {};
        if (words.姓名?.words) updates.name = words.姓名.words;
        if (words.公民身份号码?.words) updates.idNumber = words.公民身份号码.words;
        if (words.性别?.words) updates.gender = [words.性别.words === '男' ? 'male' : 'female'];
        if (words.民族?.words) updates.ethnicity = words.民族.words;
        if (words.出生?.words) {
          const birthDate = normalizeBirthDate(words.出生.words);
          updates.birthDate = birthDate;
          updates.age = String(calculateAgeFromBirth(birthDate));
          updates.zodiac = calculateZodiacFromBirth(birthDate);
          updates.zodiacSign = calculateZodiacSignFromBirth(birthDate);
        }
        if (words.住址?.words) {
          updates.hukouAddress = words.住址.words;
          const found = extractProvinceFromAddress(words.住址.words);
          if (found) updates.nativePlace = found;
        }
        form.setFieldsValue(updates);
        Toast.show({ icon: 'success', content: '识别成功，已自动填充' });
      } else {
        Toast.show({ icon: 'fail', content: '未能识别出信息' });
      }
    } catch (e) {
      showMediaSelectionError(e, ocrProcessingStarted ? '身份证识别失败，请重试' : '选择身份证正面照片失败，请重试');
    } finally {
      setOcrProcessing(false);
    }
  };

  const addIdCardBack = async () => {
    try {
      const f = await pickFromGallery({ targetWidth: 1280 });
      replaceSingleFile(idCardBackFile, setIdCardBackFile, f, 'idCardBack');
    } catch (e) {
      showMediaSelectionError(e, '选择身份证反面照片失败，请重试');
    }
  };



  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await apiService.post<any>('/ai/parse-resume', { text: aiText.trim() });
      if (!res.success || !res.data) throw new Error(res.message || '识别失败');

      const p = res.data;
      const updates: any = {
        name: p.name,
        phone: p.phone,
        age: p.age ? String(p.age) : undefined,
        gender: p.gender ? [p.gender] : undefined,
        education: p.education ? [p.education] : undefined,
        nativePlace: p.nativePlace,
        jobType: p.jobType ? [p.jobType] : undefined,
        expectedSalary: p.expectedSalary ? String(p.expectedSalary) : undefined,
        experienceYears: p.experienceYears ? String(p.experienceYears) : undefined,
        idNumber: p.idNumber,
        currentAddress: p.currentAddress,
        hukouAddress: p.hukouAddress,
        maritalStatus: p.maritalStatus ? [p.maritalStatus] : undefined,
        religion: p.religion ? [p.religion] : undefined,
        height: p.height ? String(p.height) : undefined,
        weight: p.weight ? String(p.weight) : undefined,
      };

      // Some AI endpoints might return skills as array of ids, or strings.
      if (Array.isArray(p.skills) && p.skills.length > 0) {
        updates.skills = p.skills;
      }

      // AI 识别出的工作经历，自动填充到工作经历板块
      if (Array.isArray(p.workExperiences) && p.workExperiences.length > 0) {
        const toMonth = (d?: string) => (d ? String(d).slice(0, 7) : '');
        setWorkExps(
          p.workExperiences.map((e: any) => ({
            startDate: toMonth(e.startDate),
            endDate: e.endDate === '至今' ? '至今' : toMonth(e.endDate),
            jobType: e.jobType || '',
            description: e.description || '',
            orderNumber: e.orderNumber || '',
            district: e.district || '',
            customerName: e.customerName || '',
            customerReview: e.customerReview || '',
            company: e.company || '',
            position: e.position || '',
            photos: [],
          })),
        );
      }

      form.setFieldsValue(updates);
      Toast.show({ icon: 'success', content: '识别成功，已自动填充' });
      setAiModalVisible(false);
      setAiText('');
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err.message || '识别出错' });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      resumeService
        .getById(id)
        .then((r) => {
          form.setFieldsValue({
            name: r.name,
            phone: r.phone,
            wechat: (r as any).wechat,
            birthDate: (r as any).birthDate ? (typeof (r as any).birthDate === 'string' ? ((r as any).birthDate as string).split('T')[0] : String((r as any).birthDate)) : undefined,
            age: r.age != null ? String(r.age) : '',
            gender: r.gender ? [r.gender] : undefined,
            jobType: r.jobType ? [r.jobType] : undefined,
            expectedSalary: r.expectedSalary != null ? String(r.expectedSalary) : '',
            education: r.education,
            maritalStatus: r.maritalStatus,
            religion: r.religion,
            ethnicity: (r as any).ethnicity,
            zodiac: (r as any).zodiac,
            zodiacSign: (r as any).zodiacSign,
            height: r.height != null ? String(r.height) : '',
            weight: r.weight != null ? String(r.weight) : '',
            nativePlace: r.nativePlace,
            hukouAddress: r.hukouAddress,
            currentAddress: r.currentAddress,
            idNumber: r.idNumber,
            emergencyContactName: r.emergencyContactName,
            emergencyContactPhone: r.emergencyContactPhone,
            experienceYears: r.experienceYears != null ? String(r.experienceYears) : '',
            maternityNurseLevel: (r as any).maternityNurseLevel ? [(r as any).maternityNurseLevel] : undefined,
            orderStatus: r.orderStatus ? [r.orderStatus] : undefined,
            leadSource: r.leadSource ? [r.leadSource] : undefined,
            serviceArea: Array.isArray(r.serviceArea) ? r.serviceArea : (r.serviceArea ? [r.serviceArea] : undefined),
            skills: Array.isArray(r.skills) ? r.skills : [],
            selfIntroduction: (r as any).selfIntroduction,
            internalEvaluation: (r as any).internalEvaluation,
            medicalExamDate: (r as any).medicalExamDate ? String((r as any).medicalExamDate).split('T')[0] : undefined,
            learningIntention: (r as any).learningIntention ? [(r as any).learningIntention] : undefined,
            currentStage: (r as any).currentStage ? [(r as any).currentStage] : undefined,
          });

          // 回填历史文件（个人照片/证书/体检报告/月子餐/烹饪/辅食/好评/视频）
          const toExisting = (f: any): NativeFile => ({
            fileName: f.filename || '文件',
            mimeType: f.mimetype || 'image/jpeg',
            size: f.size || 0,
            webPath: resolveFileUrl(f.url || f),
            existingUrl: f.url || f,
          });
          const hydrate = (
            setter: React.Dispatch<React.SetStateAction<NativeFile[]>>,
            arr: any,
          ) => { if (Array.isArray(arr) && arr.length) setter(arr.map(toExisting)); };
          hydrate(setPhotoFiles, normPhotos((r as any).personalPhoto));
          hydrate(setCertFiles, (r as any).certificates);
          hydrate(setMedicalFiles, (r as any).reports);
          hydrate(setConfinementMealFiles, (r as any).confinementMealPhotos);
          hydrate(setCookingFiles, (r as any).cookingPhotos);
          hydrate(setComplementaryFoodFiles, (r as any).complementaryFoodPhotos);
          hydrate(setPositiveReviewFiles, (r as any).positiveReviewPhotos);
          const idCardFront = normPhotos((r as any).idCardFront)[0];
          if (idCardFront) setIdCardFrontFile(toExisting(idCardFront));
          const idCardBack = normPhotos((r as any).idCardBack)[0];
          if (idCardBack) setIdCardBackFile(toExisting(idCardBack));
          const video = (r as any).selfIntroductionVideo;
          if (video && (video.url || typeof video === 'string')) setVideoFile(toExisting(video));

          const exps = (r as any).workExperiences;
          if (Array.isArray(exps) && exps.length > 0) {
            const toMonth = (d?: string) => (d ? String(d).slice(0, 7) : '');
            setWorkExps(
              exps
                .filter((e: any) => e)
                .map((e: any) => ({
                  startDate: toMonth(e.startDate),
                  endDate: e.endDate === '至今' ? '至今' : toMonth(e.endDate),
                  jobType: e.jobType || '',
                  description: e.description || '',
                  orderNumber: e.orderNumber || '',
                  district: e.district || '',
                  customerName: e.customerName || '',
                  customerReview: e.customerReview || '',
                  company: e.company || '',
                  position: e.position || '',
                  photos: Array.isArray(e.photos)
                    ? e.photos.map((p: any) => ({ url: p.url || p, filename: p.filename }))
                    : [],
                })),
            );
          }
        })
        .catch(() => Toast.show({ icon: 'fail', content: '加载失败' }));
    }
    removedFilesRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onFinish = async (values: Record<string, unknown>) => {
    try {
      const duplicate = await resumeService.checkDuplicateCandidates({
        name: values.name as string,
        phone: values.phone as string,
        idNumber: values.idNumber as string,
        jobType: Array.isArray(values.jobType) ? values.jobType[0] as string : values.jobType as string,
        nativePlace: values.nativePlace as string,
        gender: Array.isArray(values.gender) ? values.gender[0] as string : values.gender as string,
        age: values.age ? Number(values.age) : undefined,
        excludeId: id,
        threshold: 70,
        limit: 3,
      });
      const suspects = duplicate?.suspects || [];
      if (suspects.length) {
        const names = suspects.map((item: any) => item.resume?.name || '未知简历').join('、');
        const confirmed = await Dialog.confirm({ title: '发现疑似重复简历', content: `可能与 ${names} 重复，仍要保存吗？`, confirmText: '仍要保存', cancelText: '返回检查' });
        if (!confirmed) return;
      }
    } catch {
      // 去重提醒不可用不应阻断保存主流程。
    }
    const fd = new FormData();
    const setF = (k: string, v: unknown) => {
      if (v != null && v !== '') fd.append(k, String(v));
    };
    setF('name', values.name);
    setF('phone', values.phone);
    setF('wechat', values.wechat);
    setF('age', values.age);
    setF('birthDate', values.birthDate);
    setF('gender', Array.isArray(values.gender) ? values.gender[0] : values.gender);
    setF('jobType', Array.isArray(values.jobType) ? values.jobType[0] : values.jobType);
    setF('expectedSalary', values.expectedSalary);
    setF('education', Array.isArray(values.education) ? values.education[0] : values.education);
    setF('maritalStatus', Array.isArray(values.maritalStatus) ? values.maritalStatus[0] : values.maritalStatus);
    setF('religion', Array.isArray(values.religion) ? values.religion[0] : values.religion);
    setF('ethnicity', values.ethnicity);
    setF('zodiac', values.zodiac);
    setF('zodiacSign', values.zodiacSign);
    setF('height', values.height);
    setF('weight', values.weight);
    setF('nativePlace', values.nativePlace);
    setF('hukouAddress', values.hukouAddress);
    setF('emergencyContactName', values.emergencyContactName);
    setF('emergencyContactPhone', values.emergencyContactPhone);
    setF('experienceYears', values.experienceYears);
    setF('maternityNurseLevel', Array.isArray(values.maternityNurseLevel) ? values.maternityNurseLevel[0] : values.maternityNurseLevel);
    setF('orderStatus', Array.isArray(values.orderStatus) ? values.orderStatus[0] : values.orderStatus);
    setF('leadSource', Array.isArray(values.leadSource) ? values.leadSource[0] : values.leadSource);
    setF('idNumber', values.idNumber);
    setF('currentAddress', values.currentAddress);
    setF('serviceArea', values.serviceArea);
    setF('selfIntroduction', values.selfIntroduction);
    setF('internalEvaluation', values.internalEvaluation);
    setF('medicalExamDate', values.medicalExamDate);
    setF('learningIntention', Array.isArray(values.learningIntention) ? values.learningIntention[0] : values.learningIntention);
    setF('currentStage', Array.isArray(values.currentStage) ? values.currentStage[0] : values.currentStage);
    if (values.skills && Array.isArray(values.skills) && values.skills.length > 0) {
      fd.append('skills', JSON.stringify(values.skills));
    }

    // 工作经历（对齐 PC 端：作为 JSON 字符串放入 FormData，照片以 URL 引用）
    const cleanedExps = workExps
      .filter((e) => e.startDate || e.description)
      .map((e) => ({
        startDate: e.startDate || '',
        endDate: e.endDate || '',
        jobType: e.jobType || '',
        description: e.description || '',
        orderNumber: e.orderNumber || '',
        district: e.district || '',
        customerName: e.customerName || '',
        customerReview: e.customerReview || '',
        company: e.company || '',
        position: e.position || '',
        photos: e.photos || [],
      }));
    if (cleanedExps.length > 0) {
      fd.append('workExperiences', JSON.stringify(cleanedExps));
    }

    // 待上传的文件（字段名严格对齐后端 create 接口的 FileFieldsInterceptor）
    // 与 edit 接口 /upload-file 的 type 值一一映射
    const fileGroups: { createField: string; uploadType: string; files: NativeFile[]; single?: boolean }[] = [
      { createField: 'idCardFront', uploadType: 'idCardFront', files: idCardFrontFile ? [idCardFrontFile] : [], single: true },
      { createField: 'idCardBack', uploadType: 'idCardBack', files: idCardBackFile ? [idCardBackFile] : [], single: true },
      { createField: 'photoFiles', uploadType: 'personalPhoto', files: photoFiles },
      { createField: 'certificateFiles', uploadType: 'certificate', files: certFiles },
      { createField: 'medicalReportFiles', uploadType: 'medicalReport', files: medicalFiles },
      { createField: 'confinementMealPhotos', uploadType: 'confinementMealPhoto', files: confinementMealFiles },
      { createField: 'cookingPhotos', uploadType: 'cookingPhoto', files: cookingFiles },
      { createField: 'complementaryFoodPhotos', uploadType: 'complementaryFoodPhoto', files: complementaryFoodFiles },
      { createField: 'positiveReviewPhotos', uploadType: 'positiveReviewPhoto', files: positiveReviewFiles },
      { createField: 'selfIntroductionVideo', uploadType: 'selfIntroductionVideo', files: videoFile ? [videoFile] : [], single: true },
    ];

    setSubmitting(true);
    try {
      if (isEdit && id) {
        // 编辑：基础信息走 PATCH（JSON 字段），文件逐个走 /upload-file（type 区分）
        await resumeService.update(id, fd);
        for (const removed of removedFilesRef.current) {
          await resumeService.deleteFile(id, removed);
        }
        for (const g of fileGroups) {
          for (const f of g.files) {
            if (!f.file || f.existingUrl) continue; // 跳过回填的历史文件，仅上传新增
            const ufd = new FormData();
            ufd.append('file', f.file, f.fileName);
            ufd.append('type', g.uploadType);
            await apiService.upload(`/resumes/miniprogram/${id}/upload-file`, ufd, 'POST');
          }
        }
        removedFilesRef.current = [];
        Toast.show({ icon: 'success', content: '已更新' });
      } else {
        // 创建：所有文件随 multipart 一起提交，字段名对齐后端 create 接口
        for (const g of fileGroups) {
          if (g.files.length) appendFile(fd, g.createField, g.files);
        }
        await resumeService.create(fd);
        // 后端规则：无手机号 => isDraft=true，据此给出对应提示（与电脑端一致）
        const asDraft = !(values.phone && String(values.phone).trim());
        Toast.show({ icon: 'success', content: asDraft ? '已保存为草稿' : '已创建' });
      }
      onSaved();
    } catch (e: any) {
      const detail = e?.response?.data?.message || e?.message || '保存失败';
      Toast.show({ icon: 'fail', content: Array.isArray(detail) ? detail.join('；') : String(detail) });
    } finally {
      setSubmitting(false);
    }
  };

  const [currentStep, setCurrentStep] = useState(0);
  const STEPS = [
    { key: 'identity', title: '① 身份', subtitle: '① 1/5 · 基础身份 (OCR 智能识别)' },
    { key: 'address', title: '② 地址', subtitle: '② 2/5 · 联系地址 + 体貌特征 + 紧急联系人' },
    { key: 'intention', title: '③ 意向', subtitle: '③ 3/5 · 服务意向' },
    { key: 'experience', title: '④ 经历', subtitle: '④ 4/5 · 工作经历 + 客户评价' },
    { key: 'certificate', title: '⑤ 证件', subtitle: '⑤ 5/5 · 证件照片 (完整版)' },
  ];

  // 后端 create 接口强制必填的字段（草稿/正式都需要，草稿仅 phone 可空）及其所在步骤。
  // 与后端 CreateResumeDto 的 @IsNotEmpty 严格对齐：name/age/gender/nativePlace/education/jobType/experienceYears
  const FIELD_STEP: Record<string, number> = {
    name: 0, age: 0, gender: 0, phone: 0,
    nativePlace: 1, education: 1,
    jobType: 2, experienceYears: 2,
  };
  const STEP_REQUIRED: Record<number, string[]> = {
    0: ['name', 'age', 'gender', 'phone'],
    1: ['nativePlace', 'education'],
    2: ['jobType', 'experienceYears'],
  };

  const handleNext = async () => {
    try {
      const fields = STEP_REQUIRED[currentStep] || [];
      if (fields.length) {
        await form.validateFields(fields);
      }
      setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo(0, 0);
    } catch (err: any) {
      console.log('Validation failed:', err);
      const first = err?.errorFields?.[0];
      const msg = first?.errors?.[0] || '请完善当前页必填项';

      Dialog.alert({
        content: msg,
        confirmText: '我知道了',
      });
    }
  };

  // 提交：不依赖 antd-mobile 的 form.submit()（校验失败时它会静默吞掉），
  // 改为主动 validateFields，失败则跳到出错步骤+弹提示，成功再调用 onFinish。
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await onFinish(values);
    } catch (err: any) {
      const first = err?.errorFields?.[0];
      const fieldName = first?.name?.[0] != null ? String(first.name[0]) : '';
      const msg = first?.errors?.[0] || (first ? '请完善必填项' : (err instanceof Error ? err.message : '提交失败'));
      const step = FIELD_STEP[fieldName];
      if (step != null && step !== currentStep) {
        setCurrentStep(step);
        window.scrollTo(0, 0);
      }
      Dialog.alert({
        content: msg,
        confirmText: '我知道了',
      });
    }
  };

  const handlePrev = () => {
    setCurrentStep(s => Math.max(s - 1, 0));
    window.scrollTo(0, 0);
  };

  // 存草稿：与正式提交唯一区别是「手机号可空」（后端据此把 isDraft 置为 true）。
  // 其余后端必填字段（姓名/年龄/性别/籍贯/学历/工种/经验年限）草稿也必须填，否则后端 400。
  const handleSaveDraft = async () => {
    const draftRequired = ['name', 'age', 'gender', 'nativePlace', 'education', 'jobType', 'experienceYears'];
    try {
      await form.validateFields(draftRequired);
      await onFinish(form.getFieldsValue(true));
    } catch (err: any) {
      const first = err?.errorFields?.[0];
      const fieldName = first?.name?.[0] != null ? String(first.name[0]) : '';
      const msg = first?.errors?.[0] || (first ? '请完善必填项' : (err instanceof Error ? err.message : '保存失败'));
      const step = FIELD_STEP[fieldName];
      if (step != null && step !== currentStep) {
        setCurrentStep(step);
        window.scrollTo(0, 0);
      }
      Dialog.alert({
        content: msg,
        confirmText: '我知道了',
      });
    }
  };

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 140 }}>
      <NavBar
        onBack={onBack}
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
        right={
          <span style={{ color: '#158F82', fontSize: 14, fontWeight: 500 }} onClick={handleSaveDraft}>
            <span style={{ marginRight: 4 }}>💾</span>草稿
          </span>
        }
      >
        {isEdit ? '编辑简历' : '新建简历'}
      </NavBar>

      {/* Stepper Header */}
      <div style={{ background: '#fff', padding: '12px 16px 0', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 45, zIndex: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ background: '#e6f8f1', color: '#158F82', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500 }}>
            {STEPS[currentStep].subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
          {/* Progress line background */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: '#f0f0f0' }} />
          {/* Active progress line */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${(currentStep + 1) * 20}%`, height: 2, background: '#158F82', transition: 'width 0.3s' }} />

          {STEPS.map((step, i) => (
            <div
              key={step.key}
              onClick={() => {
                if (i < currentStep) setCurrentStep(i);
              }}
              style={{
                flex: 1,
                textAlign: 'center',
                paddingBottom: 12,
                fontSize: 13,
                fontWeight: currentStep === i ? 600 : 400,
                color: currentStep === i ? '#158F82' : (i < currentStep ? '#333' : '#999'),
                cursor: i < currentStep ? 'pointer' : 'default',
              }}
            >
              {step.title}
            </div>
          ))}
        </div>
      </div>

      <Form
        form={form}
        onFinish={onFinish}
        layout="vertical"
        style={{
          '--border-top': 'none',
          '--border-bottom': 'none',
          '--border-inner': '1px solid rgba(0,0,0,0.04)',
          padding: '16px',
          background: 'transparent'
        }}
      >
        <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
          {/* OCR Card */}
          <div
            onClick={addIdCard}
            style={{
              background: '#e6f8f1',
              border: '2px dashed #158F82',
              borderRadius: 16,
              padding: '24px 16px',
              textAlign: 'center',
              marginBottom: 16,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 48, height: 48, background: '#158F82', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24 }}>
                📷
              </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#158F82', marginBottom: 6 }}>
              {ocrProcessing ? 'OCR识别中...' : '拍身份证自动填充'}
            </div>
            <div style={{ fontSize: 12, color: '#158F82', opacity: 0.8 }}>
              支持身份证正反面 · OCR 识别 · 1 秒完成
            </div>
            {idCardFrontFile && (
              <Image
                src={idCardFrontFile.webPath || ''}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }}
              />
            )}
          </div>
          <Button block fill="outline" color="primary" onClick={() => setAiModalVisible(true)} style={{ marginBottom: 16, borderRadius: 10 }}>
            🤖 从文本 AI 解析简历
          </Button>

          <CardSection title="基础信息">
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '必填' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <Input placeholder="请输入" clearable />
            </Form.Item>
            <TwoCols>
              <Form.Item name="age" label="年龄" rules={[{ required: true, message: '必填' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Input placeholder="请输入" type="number" clearable />
              </Form.Item>
              <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Selector
                  options={[{ label: '女', value: 'female' }, { label: '男', value: 'male' }]}
                  style={{ '--border-radius': '6px' } as any}
                />
              </Form.Item>
            </TwoCols>
            <TwoCols>
              <Form.Item name="birthDate" label="出生日期" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Input type="date" placeholder="请选择" clearable onChange={(value) => {
                  if (!value) return;
                  form.setFieldsValue({ age: String(calculateAgeFromBirth(value)), zodiac: calculateZodiacFromBirth(value), zodiacSign: calculateZodiacSignFromBirth(value) });
                }} />
              </Form.Item>
              <Form.Item name="idNumber" label="身份证号" style={{ '--border-bottom': '1px solid #f0f0f0' } as any} extra={<span style={{fontSize: 12, color: '#158F82'}}>🔒 加密</span>}>
                <Input placeholder="请输入" clearable />
              </Form.Item>
            </TwoCols>
            <TwoCols>
              <Form.Item
                name="phone"
                label="手机号码"
                rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}
                extra={<span style={{ fontSize: 12, color: '#999' }}>不填则保存为草稿</span>}
                style={{ '--border-bottom': 'none' } as any}
              >
                <Input placeholder="请输入" type="tel" clearable />
              </Form.Item>
              <Form.Item name="wechat" label="微信号" style={{ '--border-bottom': 'none' } as any}>
                <Input placeholder="请输入" clearable />
              </Form.Item>
            </TwoCols>
          </CardSection>
        </div>

        <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
          <CardSection title="联系地址">
            <Form.Item name="currentAddress" label="现居住地址" style={{ '--border-bottom': '1px solid #f0f0f0' } as any} extra={<span style={{fontSize: 12, color: '#158F82', display: 'flex', alignItems: 'center'}}><span style={{color: '#ff3141', marginRight: 2}}>📍</span> 自动定位</span>}>
              <TextArea placeholder="请输入" rows={2} />
            </Form.Item>
            <Form.Item name="nativePlace" label="籍贯" trigger="onChange" rules={[{ required: true, message: '请选择籍贯' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <PickerField placeholder="请选择" options={PROVINCES.map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="hukouAddress" label="户籍地址" style={{ '--border-bottom': 'none' } as any}>
              <TextArea placeholder="请输入" rows={2} />
            </Form.Item>
          </CardSection>

          <CardSection title="体貌特征">
            <TwoCols>
              <Form.Item name="height" label="身高(cm)" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Input placeholder="请输入" type="number" clearable />
              </Form.Item>
              <Form.Item name="weight" label="体重(斤)" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Input placeholder="请输入" type="number" clearable />
              </Form.Item>
            </TwoCols>
            <TwoCols>
              <Form.Item name="ethnicity" label="民族" trigger="onChange" style={{ '--border-bottom': 'none' } as any}>
                <PickerField placeholder="请选择" options={ETHNICITIES.map((e) => ({ label: e, value: e }))} />
              </Form.Item>
              <Form.Item name="zodiac" label="生肖" trigger="onChange" style={{ '--border-bottom': 'none', borderRight: '1px solid rgba(0,0,0,0.04)' } as any}>
                <PickerField placeholder="请选择" options={Object.entries(ZODIAC_MAP).map(([val, label]) => ({ label, value: val }))} />
              </Form.Item>
            </TwoCols>
            <Form.Item name="zodiacSign" label="星座" trigger="onChange" style={{ '--border-bottom': 'none', marginTop: -16, width: '50%', marginLeft: '50%' } as any}>
              <PickerField placeholder="请选择" options={Object.entries(ZODIAC_SIGN_MAP).map(([val, label]) => ({ label, value: val }))} />
            </Form.Item>
          </CardSection>

          <CardSection title="背景信息">
            <TwoCols>
              <Form.Item name="education" label="学历" trigger="onChange" rules={[{ required: true, message: '请选择学历' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <PickerField placeholder="请选择" options={Object.entries(EDUCATION_MAP).map(([val, label]) => ({ label, value: val }))} />
              </Form.Item>
              <Form.Item name="maritalStatus" label="婚姻状况" trigger="onChange" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <PickerField placeholder="请选择" options={Object.entries(MARITAL_STATUS_MAP).map(([val, label]) => ({ label, value: val }))} />
              </Form.Item>
            </TwoCols>
            <Form.Item name="religion" label="宗教信仰" trigger="onChange" style={{ '--border-bottom': 'none' } as any}>
              <PickerField placeholder="请选择" options={Object.entries(RELIGION_MAP).map(([val, label]) => ({ label, value: val }))} />
            </Form.Item>
          </CardSection>

          <CardSection title="紧急联系信息">
            <TwoCols>
              <Form.Item name="emergencyContactName" label="紧急联系人姓名" style={{ '--border-bottom': 'none' } as any}>
                <Input placeholder="请输入" clearable />
              </Form.Item>
              <Form.Item name="emergencyContactPhone" label="紧急联系人电话" style={{ '--border-bottom': 'none' } as any}>
                <Input placeholder="请输入" type="tel" clearable />
              </Form.Item>
            </TwoCols>
          </CardSection>
        </div>

        <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
          <CardSection title={<><RequiredMark />意向工种</>}>
            <Form.Item name="jobType" rules={[{ required: true, message: '请选择意向工种' }]} style={{ '--border-bottom': 'none' } as any}>
              <Selector columns={3} options={JOB_OPTIONS} style={{ '--border-radius': '20px' } as any} />
            </Form.Item>
          </CardSection>

          <CardSection title="服务区域">
            <Form.Item name="serviceArea" style={{ '--border-bottom': 'none' } as any} extra={<span style={{fontSize: 12, color: '#999', background: '#f5f5f5', padding: '2px 8px', borderRadius: 10}}>可多选</span>}>
              <Selector columns={3} multiple options={BEIJING_DISTRICTS} style={{ '--border-radius': '20px' } as any} />
            </Form.Item>
          </CardSection>

          <CardSection title="经验 & 档位">
            <TwoCols>
              <Form.Item name="currentStage" label="工作经验" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <PickerField placeholder="请选择" options={Object.entries(CURRENT_STAGE_MAP).map(([val, label]) => ({ label, value: val }))} />
              </Form.Item>
              <Form.Item name="experienceYears" label="经验年限" rules={[{ required: true, message: '必填' }]} style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
                <Input placeholder="请输入" type="number" clearable />
              </Form.Item>
            </TwoCols>
            <Form.Item name="maternityNurseLevel" label="月嫂档位" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <PickerField placeholder="请选择" options={Object.entries(MATERNITY_LEVEL_MAP).map(([val, label]) => ({ label, value: val }))} />
            </Form.Item>
            <Form.Item name="expectedSalary" label="期望薪资" style={{ '--border-bottom': 'none' } as any} extra={<span style={{color: '#158F82', fontSize: 13}}>元/月</span>}>
              <Input placeholder="请输入" type="number" clearable />
            </Form.Item>
          </CardSection>

          <CardSection title="其他意向">
            <Form.Item name="orderStatus" label="接单状态" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <Selector columns={3} options={Object.entries(ORDER_STATUS_MAP).map(([val, obj]) => ({ label: obj.text, value: val }))} style={{ '--border-radius': '6px' } as any} />
            </Form.Item>
            <Form.Item name="learningIntention" label="学习意向" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <Selector columns={4} options={Object.entries(LEARNING_INTENTION_MAP).map(([val, label]) => ({ label, value: val }))} style={{ '--border-radius': '6px' } as any} />
            </Form.Item>
            <Form.Item name="leadSource" label="线索来源" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <Selector columns={3} options={Object.entries(LEAD_SOURCE_MAP).map(([value, label]) => ({ label, value }))} style={{ '--border-radius': '6px' } as any} />
            </Form.Item>
            <Form.Item name="skills" label="技能标签" style={{ '--border-bottom': '1px solid #f0f0f0' } as any} extra={<span style={{ fontSize: 12, color: '#999' }}>可多选</span>}>
              <Selector columns={3} multiple options={Object.entries(SKILLS_MAP).map(([value, label]) => ({ label, value }))} style={{ '--border-radius': '6px' } as any} />
            </Form.Item>
            <Form.Item name="selfIntroduction" label="自我介绍" style={{ '--border-bottom': 'none' } as any}>
              <TextArea placeholder="选填，简要介绍工作经历、性格特点等" rows={4} maxLength={1000} showCount />
            </Form.Item>
          </CardSection>
          {canEditInternal && (
            <CardSection title="内部评价">
              <Form.Item name="internalEvaluation" style={{ '--border-bottom': 'none' } as any}>
                <TextArea placeholder="仅内部可见，选填" rows={4} maxLength={1000} showCount />
              </Form.Item>
            </CardSection>
          )}
        </div>

        <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
          <CardSection title="工作经历">
            {workExps.map((exp, idx) => (
              <div key={idx} style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px', marginBottom: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#158F82' }}>📌 经历 {idx + 1}{exp.customerName ? ` · ${exp.customerName}家` : ''}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="mini" color="danger" fill="outline" onClick={() => removeWorkExp(idx)}>删除</Button>
                  </div>
                </div>

                <TwoCols>
                  <Form.Item label="开始" style={{ '--border-bottom': '1px solid #f0f0f0', padding: 0 } as any}>
                    <div onClick={() => setDatePicker({ index: idx, field: 'startDate' })} style={{ color: exp.startDate ? '#333' : '#ccc', padding: '8px 0', fontSize: 15 }}>
                      {exp.startDate ? exp.startDate : '请选择'}
                    </div>
                  </Form.Item>
                  <Form.Item label="结束" style={{ '--border-bottom': '1px solid #f0f0f0', padding: 0 } as any}>
                    <div onClick={() => setDatePicker({ index: idx, field: 'endDate' })} style={{ color: exp.endDate ? '#333' : '#ccc', padding: '8px 0', fontSize: 15 }}>
                      {exp.endDate ? exp.endDate : '请选择'}
                    </div>
                  </Form.Item>
                </TwoCols>

                <TwoCols>
                  <Form.Item label="工种" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <PickerField
                      value={exp.jobType}
                      onChange={(v) => updateWorkExp(idx, { jobType: v })}
                      options={JOB_OPTIONS}
                    />
                  </Form.Item>
                  <Form.Item label="服务区域" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <PickerField
                      value={exp.district}
                      onChange={(v) => updateWorkExp(idx, { district: v })}
                      options={BEIJING_DISTRICTS}
                      placeholder="请选择北京市区域"
                    />
                  </Form.Item>
                </TwoCols>
                <TwoCols>
                  <Form.Item label="工作单位" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <Input value={exp.company || ''} onChange={(v) => updateWorkExp(idx, { company: v })} placeholder="选填" clearable />
                  </Form.Item>
                  <Form.Item label="职位" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <Input value={exp.position || ''} onChange={(v) => updateWorkExp(idx, { position: v })} placeholder="选填" clearable />
                  </Form.Item>
                </TwoCols>
                <Form.Item label="工作描述" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                  <TextArea
                    value={exp.description || ''}
                    onChange={(v) => updateWorkExp(idx, { description: v })}
                    placeholder="选填，照顾多大宝宝，日常工作内容等"
                    rows={3}
                  />
                </Form.Item>
                <TwoCols>
                  <Form.Item label="订单号" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <Input value={exp.orderNumber || ''} onChange={(v) => updateWorkExp(idx, { orderNumber: v })} placeholder="选填" clearable />
                  </Form.Item>
                  <Form.Item label="客户姓名" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                    <Input value={exp.customerName || ''} onChange={(v) => updateWorkExp(idx, { customerName: v })} placeholder="选填" clearable />
                  </Form.Item>
                </TwoCols>
                <Form.Item label="客户评价" style={{ '--border-bottom': '1px solid #f0f0f0', padding: '8px 0' } as any}>
                  <TextArea
                    value={exp.customerReview || ''}
                    onChange={(v) => updateWorkExp(idx, { customerReview: v })}
                    placeholder="选填"
                    rows={2}
                  />
                </Form.Item>
                <div style={{ fontSize: 13, color: '#666', margin: '12px 0 8px' }}>工作照片（最多 9 张，已上传 {(exp.photos || []).length} 张）</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 8 }}>
                  {(exp.photos || []).map((p, pi) => (
                    <div key={pi} style={{ width: 80, height: 80, borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                      <Image src={resolveFileUrl(p.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div onClick={() => removeWorkPhoto(idx, pi)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}>×</div>
                    </div>
                  ))}
                  {(exp.photos || []).length < 9 && (
                    <div onClick={() => addWorkPhotos(idx)} style={{ width: 80, height: 80, background: '#f5f7fa', border: '1px dashed #d9d9d9', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', cursor: 'pointer' }}>
                      <div style={{ fontSize: 22 }}>+</div>
                      <div style={{ fontSize: 12 }}>添加</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <Button block fill="outline" color="primary" onClick={addWorkExp} style={{ borderStyle: 'dashed', borderRadius: 8 }}>
              + 添加工作经历
            </Button>
          </CardSection>
        </div>

        <div style={{ display: currentStep === 4 ? 'block' : 'none' }}>
          <CardSection title="身份证 (必填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>正面 + 反面 + 手持照 (OCR 已识别)</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 8 }}>
              <div onClick={addIdCard} style={{ width: 100, height: 100, background: '#158F82', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🪪</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>正面</div>
                {idCardFrontFile && <Image src={idCardFrontFile.webPath || ''} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                {idCardFrontFile && <div style={{ position: 'absolute', top: 6, right: 6, background: '#fff', color: '#158F82', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✓</div>}
                {idCardFrontFile && <div onClick={(e) => { e.stopPropagation(); replaceSingleFile(idCardFrontFile, setIdCardFrontFile, null, 'idCardFront'); }} style={{ position: 'absolute', right: 5, bottom: 5, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</div>}
              </div>
              <div onClick={addIdCardBack} style={{ width: 100, height: 100, background: '#158F82', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🪪</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>反面</div>
                {idCardBackFile && <Image src={idCardBackFile.webPath || ''} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                {idCardBackFile && <div style={{ position: 'absolute', top: 6, right: 6, background: '#fff', color: '#158F82', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✓</div>}
                {idCardBackFile && <div onClick={(e) => { e.stopPropagation(); replaceSingleFile(idCardBackFile, setIdCardBackFile, null, 'idCardBack'); }} style={{ position: 'absolute', right: 5, bottom: 5, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</div>}
              </div>
              <div style={{ width: 100, height: 100, background: '#158F82', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: 0.5 }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🤳</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>手持 (待开发)</div>
              </div>
            </div>
          </CardSection>

          <CardSection title="个人照片 (必填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>建议 1-3 张形象照 · 清晰正面 · 纯色背景（最多 30 张）</div>
            <ImageGrid files={photoFiles} onAdd={() => addPhoto(false)} onRemove={(i) => removeImage(setPhotoFiles, i, 'personalPhoto')} />
          </CardSection>

          <CardSection title="技能证书 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已上传 {certFiles.length} 张</div>
            <ImageGrid files={certFiles} onAdd={addCert} onRemove={(i) => removeImage(setCertFiles, i, 'certificate')} />
          </CardSection>

          <CardSection title="体检报告 (选填)">
            <Form.Item name="medicalExamDate" label="体检时间" style={{ '--border-bottom': '1px solid #f0f0f0' } as any}>
              <Input type="date" placeholder="请选择" clearable />
            </Form.Item>
            <div style={{ fontSize: 13, color: '#666', margin: '12px 0' }}>已上传 {medicalFiles.length} 张（最多 10 张）</div>
            <ImageGrid files={medicalFiles} onAdd={() => addImages(setMedicalFiles, 10)} onRemove={(i) => removeImage(setMedicalFiles, i, 'medicalReport')} />
          </CardSection>

          <CardSection title="自我介绍视频 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>支持 1 个视频，最大 10MB</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 8 }}>
              {videoFile && (
                <div style={{ width: 100, height: 100, borderRadius: 12, position: 'relative', overflow: 'hidden', background: '#000' }}>
                  <video src={videoFile.webPath || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                  <div
                    onClick={() => replaceSingleFile(videoFile, setVideoFile, null, 'selfIntroductionVideo')}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}
                  >
                    ×
                  </div>
                  <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 24 }}>▶</div>
                </div>
              )}
              {!videoFile && (
                <div onClick={addVideo} style={{ width: 100, height: 100, background: '#f5f7fa', border: '1px dashed #d9d9d9', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', cursor: 'pointer' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🎬</div>
                  <div style={{ fontSize: 13 }}>上传视频</div>
                </div>
              )}
            </div>
          </CardSection>

          <CardSection title="作品展示 · 月子餐照片 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已上传 {confinementMealFiles.length} 张（最多 30 张）</div>
            <ImageGrid files={confinementMealFiles} onAdd={() => addImages(setConfinementMealFiles, 30)} onRemove={(i) => removeImage(setConfinementMealFiles, i, 'confinementMealPhoto')} />
          </CardSection>

          <CardSection title="作品展示 · 烹饪照片 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已上传 {cookingFiles.length} 张（最多 30 张）</div>
            <ImageGrid files={cookingFiles} onAdd={() => addImages(setCookingFiles, 30)} onRemove={(i) => removeImage(setCookingFiles, i, 'cookingPhoto')} />
          </CardSection>

          <CardSection title="作品展示 · 辅食添加照片 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已上传 {complementaryFoodFiles.length} 张（最多 30 张）</div>
            <ImageGrid files={complementaryFoodFiles} onAdd={() => addImages(setComplementaryFoodFiles, 30)} onRemove={(i) => removeImage(setComplementaryFoodFiles, i, 'complementaryFoodPhoto')} />
          </CardSection>

          <CardSection title="作品展示 · 好评展示照片 (选填)">
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已上传 {positiveReviewFiles.length} 张（最多 30 张）</div>
            <ImageGrid files={positiveReviewFiles} onAdd={() => addImages(setPositiveReviewFiles, 30)} onRemove={(i) => removeImage(setPositiveReviewFiles, i, 'positiveReviewPhoto')} />
          </CardSection>
        </div>
      </Form>

      {/* Floating Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        padding: '12px 20px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
        display: 'flex',
        gap: 16,
        zIndex: 99
      }}>
        {currentStep === 0 ? (
          <Button style={{ flex: 1, borderRadius: 12, height: 48, fontSize: 16, background: '#f5f5f5', color: '#666', border: 'none' }} onClick={onBack}>
            取消
          </Button>
        ) : (
          <Button style={{ flex: 1, borderRadius: 12, height: 48, fontSize: 16, background: '#f5f5f5', color: '#666', border: 'none' }} onClick={handlePrev}>
            ← 上一步
          </Button>
        )}

        {currentStep < STEPS.length - 1 ? (
          <Button color="primary" style={{ flex: 2, borderRadius: 12, height: 48, fontSize: 16, fontWeight: 600 }} onClick={handleNext}>
            下一步 →
          </Button>
        ) : (
          <Button color="primary" style={{ flex: 2, borderRadius: 12, height: 48, fontSize: 16, fontWeight: 600 }} loading={submitting} onClick={handleSubmit}>
            ✓ 提交简历
          </Button>
        )}
      </div>
      <DatePicker
        visible={!!datePicker}
        precision="month"
        max={new Date()}
        onClose={() => setDatePicker(null)}
        value={(() => {
          if (!datePicker) return null;
          const v = workExps[datePicker.index]?.[datePicker.field];
          return v && v !== '至今' ? new Date(v + '-01') : null;
        })()}
        onConfirm={(val) => {
          if (!datePicker || !val) return;
          const ym = `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}`;
          updateWorkExp(datePicker.index, { [datePicker.field]: ym });
        }}
      />
      <Popup visible={aiModalVisible} onMaskClick={() => setAiModalVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '16px', minHeight: '60vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>🤖 AI智能识别</div>
          <span style={{ fontSize: 20, color: '#999', padding: '0 8px' }} onClick={() => setAiModalVisible(false)}>×</span>
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          请粘贴包含客户信息（姓名、电话、年龄等）的文本，AI将自动提取并填写到表单中。
        </div>
        <TextArea
          value={aiText}
          onChange={setAiText}
          placeholder="例如：王阿姨 13800138000 今年45岁，高中学历..."
          rows={8}
          style={{ background: '#f5f7fa', padding: 12, borderRadius: 8, fontSize: 14 }}
        />
        <div style={{ marginTop: 24 }}>
          <Button block color="primary" loading={aiLoading} onClick={handleAiParse} style={{ borderRadius: 8, height: 44 }}>
            开始识别
          </Button>
        </div>
      </Popup>
    </div>
  );
}

import { useLocation, useNavigate } from 'react-router-dom';

// ── 页面容器 ────────────────────────────────────
export default function Resumes() {
  const location = useLocation();
  const stateId = location.state?.id;
  const [view, setView] = useState<View>(stateId ? { type: 'detail', id: stateId } : { type: 'list' });
  const [listKey, setListKey] = useState(0);
  const canCreate = usePermission('resume:create');
  const canUpdate = usePermission('resume:edit');

  if (view.type === 'detail') {
    return (
      <DetailView
        id={view.id}
        canEdit={canUpdate}
        onBack={() => setView({ type: 'list' })}
        onEdit={() => setView({ type: 'form', id: view.id })}
      />
    );
  }
  if (view.type === 'form') {
    return (
      <FormView
        id={view.id}
        onBack={() =>
          view.id ? setView({ type: 'detail', id: view.id }) : setView({ type: 'list' })
        }
        onSaved={() => {
          queryClient.removeQueries({ queryKey: ['resume'] });
          queryClient.removeQueries({ queryKey: ['resumes'] });
          setListKey((k) => k + 1);
          setView({ type: 'list' });
        }}
      />
    );
  }

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
      <ResumeLibrary
        key={`lib-${listKey}`}
        canCreate={canCreate}
        onOpen={(id) => setView({ type: 'detail', id })}
        onCreate={() => setView({ type: 'form' })}
      />
    </div>
  );
}
