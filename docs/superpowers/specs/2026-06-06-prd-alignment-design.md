# nano-ontoprompt v2 PRD 对齐优化设计文档

> **日期**: 2026-06-06  
> **目标**: 全量对比 PRD_AND_ARCHITECTURE.md 与当前项目实现，修复所有 Gap，完成前后端联调测试。

---

## 一、基础设施 Gap（docker-compose）

### 现状
当前 `docker-compose.yml` 仅包含 PostgreSQL、Redis、Backend、Celery Worker、Frontend，缺少 v2 核心服务。

### 修复
按 PRD §3.7 升级 `docker-compose.yml`，新增以下服务：

| 服务 | 镜像 | 用途 |
|------|------|------|
| **neo4j** | neo4j:5-community | 图谱存储，Bolt 7687 + Browser 7474 |
| **minio** | minio/minio:latest | S3 文件存储，API 9000 + Console 9001 |
| **chromadb** | chromadb/chroma:latest | 向量搜索，端口 8001 |
| **celery_beat** | ./backend | Cron 定时调度，`celery beat` 命令 |

---

## 二、后端 Gap 列表

### P0 — 影响核心流程

| # | 文件 | Gap | 修复方案 |
|---|------|-----|---------|
| B-P0-1 | `routers/v2/curated.py` | `list_curated` 状态硬编码 `"pending_review"`，不读 DB 实际状态 | 改为读 `CuratedDataset.status` 字段 |
| B-P0-2 | `routers/v2/curated.py` | `/review` Approve 后未自动触发 Ontology Mapping Celery 任务 | Approve 后检查 `ontology_mappings` 表，若有关联则发 `mapping_tasks.incremental_sync` |
| B-P0-3 | `routers/v2/connections.py` | 缺少 `POST /connections/{id}/sync` 端点 | 新增端点，触发 `connection_sync_task.delay(connection_id)` |

### P1 — 影响功能完整性

| # | 文件 | Gap | 修复方案 |
|---|------|-----|---------|
| B-P1-1 | `routers/v2/datasets.py` | 缺少 `GET /datasets/{id}/schema` 端点 | 新增，返回列名、类型、样本值 |
| B-P1-2 | `routers/v2/datasets.py` | 缺少 `GET /datasets/{id}/stats` 端点 | 新增，返回行数、列数、null 率、数据类型分布 |

---

## 三、前端 Gap 列表

### P0 — 影响核心流程

| # | 组件 | Gap | 修复方案 |
|---|------|-----|---------|
| F-P0-1 | `ConnectionsTab.tsx` | `kind=file` 时无上传 UI，仅空配置表单 | `kind=file` 时渲染拖拽/点击多文件上传区域（`<input multiple>`），支持拖入文件区域高亮 |
| F-P0-2 | `ConnectionsTab.tsx` | 表单缺 `sync_mode`（SNAPSHOT/APPEND）选择器，缺"手动同步"按钮 | 表单新增 sync_mode 单选；连接列表每行新增"同步"按钮，调用 `POST /connections/{id}/sync` |
| F-P0-3 | `DatasetsTab.tsx` | 无数据预览、无 Schema 展示、无版本历史、无行数/列数统计 | 每个 Dataset 行可展开，显示：行数/列数统计、Schema 列表（列名+类型）、版本历史列表、前 20 行预览表格 |
| F-P0-4 | `GraphTab` | 图谱为节点卡片列表，非网络图；孤立节点无法隐藏；点击节点未跳转实体页 | 使用 `react-force-graph-2d` 或内联 SVG 力导向布局渲染，孤立节点（度=0）可选择性隐藏，点击节点跳转 `/ontologies/{id}/entities/{eid}` |

### P1 — 影响功能完整性

| # | 组件 | Gap | 修复方案 |
|---|------|-----|---------|
| F-P1-1 | `ModelsPage.tsx` | 缺"用途标签"字段（VLM提取/结构化提取/宽表分析/Ontology Mapping） | 创建/编辑表单新增多选标签；列表显示标签徽章 |
| F-P1-2 | `TransformsTab.tsx` | 无新建 Pipeline 表单 | 新增"创建 Pipeline"按钮，弹出表单：名称/数据源/路径(A|B|C)/规格配置 |
| F-P1-3 | `EntityDetailPage.tsx` | 缺关联 Logic 列表和关联 Actions 列表 | 新增两个关联区块，分别显示关联的 logic/action 列表，点击跳转对应详情页 |
| F-P1-4 | `PromptListPage.tsx` / `SettingsPage.tsx` | 提示词页面独立，Settings 缺提示词 Tab；创建时缺业务域下拉+一键生成 | 在 Settings 内新增"提示词模版" Tab，列表点击查看详情；创建表单加业务域下拉和"一键生成"按钮（调用 LLM 生成模版） |

### P2 — 增强型

| # | 组件 | Gap | 修复方案 |
|---|------|-----|---------|
| F-P2-1 | `DatasetsTab.tsx` | 缺 Media Set（非结构化文件集合）展示区 | 在 Datasets 页底部新增 Media Sets 分区，展示文件列表+提取状态 |

---

## 四、UI 设计规格

### 4.1 Graph Tab — 网络图

- **布局**：力导向网络图。Neo4j 可用时使用 Neovis.js（PRD §3.10 指定）；Neo4j 不可用（本地开发）时降级为 `react-force-graph-2d` + 内存数据，需在前端检测 `neo4j_available` 字段切换渲染路径
- **孤立节点**：度=0 的节点默认折叠/灰显，可通过"显示孤立节点"开关展示
- **边**：带关系类型标签（鼠标悬停显示完整关系名）
- **点击节点**：跳转 `/ontologies/{ontology_id}/entities/{entity_id}`
- **节点颜色**：按 entity type 着色（与 PRD Legend 保持一致）
- **图例**：底部显示类型-颜色映射

### 4.2 Entity 详情页 — 关联信息

新增两个区块（在现有 name/type/confidence/properties 之后）：

```
关联逻辑规则 (N 条)
├── [逻辑名称]  [置信度]  → 点击跳转 /ontologies/{id}/logic/{lid}
└── ...

关联动作 (N 条)
├── [动作名称]  [trigger]  → 点击查看 Action 详情弹窗
└── ...
```

关联关系通过 `entity.name_cn` 在 logic/action 的 `linked_entities`（name_cn 列表）字段中匹配。
后端新增 `GET /api/v1/ontologies/{id}/entities/{eid}/related` 端点返回关联 logic/action 列表。

### 4.3 提示词模版页面（Settings > 提示词模版 Tab）

**列表视图**：
- 每行显示：提示词名称、业务域徽章、版本、创建时间
- 点击行 → 展开查看完整提示词内容（或跳转详情页）

**创建表单**：
```
名称：[文本输入]
业务域：[下拉选择] 供应链 / 法律 / 医疗 / HR / 财务 / 教育 / 通用
版本：[文本输入] (默认 v1.0)
内容：[大文本框]
      [✨ 一键生成模版] → 调用 POST /api/v1/prompts/generate-template（需新建端点）
                          body: {domain, style: "ontology_extraction"}
                          后端用 LLM 生成该域的提示词模版，返回 {content: "..."}
                          前端将 content 填入文本框
[确认保存]  [取消]
```

---

## 五、测试计划（10 步全流程）

### 测试环境
- 后端：本地 SQLite 模式（`uvicorn app.main:app --reload`）
- 前端：`npm run dev`
- 模型：DeepSeek（用户已配置）
- 测试脚本：`test_data/run_full_test.py`

### 测试步骤

**Step 1 — 认证**
- 登录，获取 JWT token
- 验证 token 有效

**Step 2 — Models 配置验证**
- 确认 DeepSeek 存在且 test connection 返回 success
- 验证用途标签字段
- ⚠️ 若 Route C 需要 VLM 模型（Claude/GPT-4V），询问用户 API Key

**Step 3 — Connections & 文件上传**
- 创建 file 类型 Connection
- 拖拽/点击上传 `test_data/供应链/` 下的多个文件
- 验证 Dataset 自动创建，kind 正确

**Step 4 — Pipeline 运行**
- Route A：`inventory_transactions.csv` / `supplier_database.xlsx`
- Route B：`supplier_orders.json`
- Route C：`warehouse_management.pdf` / `procurement_management.docx`
  - 验证 Pipeline spec 中 model_id 指向 DeepSeek
  - 验证 OCR 策略配置字段存在
- 每条 Route 验证：Curated Dataset 创建，`row_count > 0`

**Step 5 — 人工审核**
- 查看质量报告（overall_score、duplicate_count）
- Approve → 验证 status = "approved"
- 验证 Approve 后若有关联 Ontology 则自动触发 Mapping 任务

**Step 6 — 简易 LLM 提取（法律/医疗域）**
- 上传 `test_data/法律/` PDF → 选 DeepSeek → 触发提取
- 轮询直到 completed
- 验证 `entities >= 1`，结构字段完整

**Step 7 — Pipeline Mapping 本体构建**
- 新建本体 → Pipeline Mapping 路径 → 选供应链 Curated Datasets
- 触发 Mapping，轮询直到 completed

**Step 8 — 本体四 Tab 验证**
- **Graph**：节点数 > 0，有连边，点击节点可跳转，孤立节点处理正确
- **Entities**：列表非空，每项有 name/type/confidence/properties；关联 Logic/Action 展示正确；搜索过滤可用
- **Logic**：接口 200 OK，字段结构（name/expression/confidence）正确
- **Actions**：接口 200 OK，字段结构（name/description/trigger）正确
- **导出**：JSON/CSV 返回有效内容

**Step 9 — 增量更新验证**
- 上传同域新文件 → 重新运行 Pipeline → Approve 新版本
- 验证本体 entity_count 有变化

**Step 10 — Settings 全面验证**
- 提示词模版：列表非空，创建（含一键生成）→ 保存 → 删除
- 置信度规则：8 条内置规则存在；修改 entity_min=0.99 → Entities 过滤变化 → 还原
- 用户管理：admin 存在；创建/登录/删除新用户
- 规则生效：提示词可在 Pipeline Route C 的 LLM 步骤中选用

### 通过标准
所有 HTTP 响应 200/201，关键字段非空，无 500 错误，置信度规则过滤效果符合预期。

---

## 六、实施优先级

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| **Phase A** | docker-compose 升级 + B-P0 后端修复（3项） | 小 |
| **Phase B** | F-P0 前端修复（文件上传UI/Dataset展开/Graph网络图/连接同步） | 中 |
| **Phase C** | F-P1 前端修复（Models标签/Pipeline表单/Entity关联/Prompts页面） | 中 |
| **Phase D** | 运行测试脚本，按步骤验证，遇到问题即修 | 视 bug 量 |
