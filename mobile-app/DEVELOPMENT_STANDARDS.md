# 移动端 H5 开发标准

> 本文是 `mobile-app` 的强制开发约定。新功能必须遵守；历史页面仅在独立的、行为保持的重构任务中迁移，禁止在需求开发中顺带大规模改写。

## 1. 目标与原则

- **领域优先**：一个业务领域的页面、仅领域使用的常量、转换逻辑和 UI 放在一起。
- **路由稳定**：`src/pages` 只作为路由兼容入口，路由地址和懒加载路径不得因重构改变。
- **单一职责**：展示组件不拼装跨领域 API；服务层不包含界面状态；纯转换/校验不依赖 React。
- **先复用、后新建**：请求使用 `apiService`，权限使用 `usePermission`，缓存使用 `queryClient` / `CACHE_TIME`，反馈使用 Ant Design Mobile 的 `Toast`、`Dialog`。
- **行为保持**：重构不得改变接口、权限、缓存键、中文文案、字段名称和视觉规格；功能改动必须单独说明。

## 2. 目录与职责

```text
src/
├── features/<domain>/          # 领域实现：推荐的业务代码归属
│   ├── <Domain>Page.tsx        # 领域编排：视图状态、缓存失效、页面转场
│   ├── <Domain>ListView.tsx    # 单一展示流程
│   ├── <Domain>DetailView.tsx
│   ├── <Domain>FormView.tsx
│   ├── constants.ts            # 仅本领域枚举、标签与样式配方
│   ├── types.ts                # 仅本领域 UI 状态/Props 类型
│   └── <domain>Form.ts         # 纯校验、转换、序列化
├── pages/                      # 路由适配层；通常只 re-export feature 页面
├── components/                 # 两个及以上领域复用的 UI
├── hooks/                      # 跨领域 React hooks
├── services/                   # API 请求与响应适配，不放 JSX
├── types/                      # 后端/跨领域共享数据合同
├── lib/                        # Query、平台等基础设施
└── utils/                      # 无 React 依赖的通用纯工具
```

客户模块是标准样板：`src/features/customers/`。新增客户相关能力必须在该目录扩展，`src/pages/Customers.tsx` 仅保留路由兼容导出。

## 3. 模块边界

### 页面与组件

- `*Page` 只负责页面级状态机、权限入口、缓存失效和子视图连接。
- `*ListView`、`*DetailView`、`*FormView` 接收**显式、已类型化的 props**；复杂页面按业务流程拆分，不按任意行数拆分。
- 只被一个领域使用的卡片、弹窗和字段组件应留在该 `features/<domain>`；跨两个领域后才移入 `components/`。
- 新代码禁止 `any`。未知响应先用 `unknown`，在服务层或转换函数内收窄类型。

### 类型、常量与表单

- 后端实体和请求/响应类型放 `src/types/<domain>.ts`，通过 `src/types/index.ts` 导出。
- UI 专有类型（例如 Tab、筛选状态、视图状态、组件 Props）放 feature 的 `types.ts`。
- 选择项、状态文案、色值映射放 feature `constants.ts`；稳定枚举优先使用 `as const`，禁止在多个页面重复硬编码。
- 表单字段名必须与 DTO/API 字段完全一致。`customerForm.ts` 一类文件只包含可测试的纯函数：格式化、校验、selector 值转换、payload 组装。
- 表单编辑必须加载已有值；提交后必须失效对应详情与列表缓存，避免陈旧数据。

### API、权限与缓存

- 只能通过 `services/*Service.ts` 调用接口；不得在页面直接使用 axios、直接拼 base URL 或重写鉴权逻辑。
- 统一沿用现有 `ApiResponse` 解包方式和服务命名：`getXxx`、`createXxx`、`updateXxx`、`deleteXxx`。
- `usePermission` 决定按钮可见性和操作入口；后端仍是最终权限边界，前端不得仅靠隐藏按钮保护操作。
- 列表、详情的 React Query key 和 `CACHE_TIME` 必须稳定、可读，并在模块内说明。写操作完成后精确失效相关 key。

## 4. UI 与交互

- 遵守 `UI_GUIDELINES.md`：品牌色 `#158F82`、白色卡片、`16px` 圆角、清晰层级和至少 44px 可触达区域。
- 复用 Ant Design Mobile 组件；高频字段直接展示，低频字段用 Tabs、Collapse 或 Popup 分组，禁止把大量字段无层级堆叠。
- 每个异步页面必须有 **loading、error、empty** 三种状态；写操作必须防重复提交，并给出成功/失败反馈。
- 电话、身份证等隐私信息直接使用后端已脱敏值；前端不得另行推断、还原或保存敏感原文。
- 样式先使用共享令牌或领域内可复用配方；仅一次性样式才允许行内写在 JSX 中。

## 5. 命名与导入

- React 组件：`PascalCase`；hooks：`useXxx`；纯工具：`camelCase`；服务：`xxxService`。
- 类型导入必须使用 `import type`。
- 相对导入只允许在同一领域/相邻目录内；跨领域共享逻辑通过 `@/components`、`@/hooks`、`@/services`、`@/types`、`@/lib` 或对应现有别名导入。
- 禁止循环依赖：constants/types 不能导入页面；services 不能导入组件；共享组件不能反向依赖 feature。

## 6. 新功能与重构流程

1. 明确页面、接口、权限、字段和验收用例；先复用现有服务与类型。
2. 在 `features/<domain>` 创建或扩展领域模块，保持 `pages` 中路由入口稳定。
3. 将选项/转换/校验集中，避免复制粘贴。
4. 完成 loading/error/empty、权限、缓存失效和移动端排版。
5. 运行下列检查并按 `TEST_AND_DISTRIBUTION.md` 做相应角色人工验证。

```sh
npm run build
npm run lint
```

当前项目尚未配置测试运行器。引入 Vitest/React Testing Library 等依赖需要先获批准；引入后，纯转换函数、权限分支、关键表单校验和写操作必须附带测试。

## 7. Code Review 与发布清单

- [ ] 代码在正确的领域目录；路由适配层没有业务逻辑。
- [ ] 没有重复枚举、硬编码接口地址、`any` 或跨层依赖。
- [ ] 新字段已同步：类型、服务、列表/详情、创建/编辑、校验与权限。
- [ ] 请求方法、payload、Query key 和缓存失效经过确认。
- [ ] 所有异步状态与失败反馈完整，提交不会重复执行。
- [ ] `npm run build`、`npm run lint` 成功。
- [ ] 需要发布时，先构建，再同步 H5 产物，最后验证线上入口、拆包资源和受保护接口响应。

## 8. 历史模块迁移规则

`Resumes.tsx`、`modules.tsx` 等大文件必须按一个领域、一个 PR/任务逐步迁移。迁移前后应保持接口和页面行为一致；不得在迁移任务中夹带功能、视觉或后端改造。客户模块的目录结构和验收方式是后续迁移的唯一参考实现。