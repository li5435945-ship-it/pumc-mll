# PUMC MLL 复现开发 PLAN（最终版）

技术栈：React + Vite + Ant Design 5 / FastAPI + PostgreSQL + Redis + pgvector
RAG 策略：章节级开关 + 按章上传文档，用于「章节问答」与「作业反馈」
目标周期：6–8 周（单人 + AI 辅助）
备案/域名：已有，Phase 7 仅部署

## 目录

1. 项目概述
2. 技术架构
3. 功能模块清单
4. 数据库设计
5. API 清单
6. 前端路由与页面
7. 章节 RAG 设计
8. Excel 题库导入
9. AI 功能设计
10. 目录结构
11. 开发阶段与任务
12. 测试清单
13. 部署清单
14. Day-by-Day 速查

---

## 1. 项目概述

### 1.1 产品定位

医学教育刷题平台（对标 libowei.cn / PUMC MLL），支持：

- **学生**：课程学习、章节刷题、错题本、AI 辅导
- **管理员**：课程/章节/题库管理、章节级 RAG 知识库、Prompt 配置

### 1.2 核心用户流程

- **管理员**：创建课程 → Excel 导入题目 → 逐章上传 RAG 文档 → 开启章节 RAG
- **学生**：登录 → 选课 → 进入章节 → 答题 → AI 反馈 → 侧边栏提问

### 1.3 本期范围

**包含** | **不包含（后续）**
--- | ---
登录、课程、章节、单选题 | 多选题 / 填空题
Excel 题库导入 | 在线逐题编辑
答题统计、错题本 | 班级/排行榜
AI 点评、推荐问题、对话 | 语音输入
章节 RAG（问答 + 反馈） | 全站统一知识库
Docker 部署 | 私有化 LLM

---

## 2. 技术架构

```
┌─────────────────────────────────────────────────┐
│  Frontend: React 18 + Vite + TypeScript          │
│            Ant Design 5 + ProComponents          │
│            TanStack Query + Zustand              │
└────────────────────┬────────────────────────────┘
                     │ REST + SSE
┌────────────────────▼────────────────────────────┐
│  Backend: Python 3.11 + FastAPI                  │
│           SQLAlchemy 2.0 + Alembic               │
│           Celery/ARQ (异步: 导入/索引)            │
└──┬──────────┬──────────┬────────────────────────┘
   │          │          │
 PostgreSQL  Redis     OSS/COS
 + pgvector            (封面/文档)
```

### 2.1 关键选型

层级 | 技术 | 理由
--- | --- | ---
前端 | React + Ant Design 5 | 对齐截图 UI，AI 生成效率高
后端 | FastAPI | Excel/RAG/LLM 生态好
数据库 | PostgreSQL 15 | 关系数据 + pgvector 向量
缓存 | Redis 7 | Session、限流、任务队列
向量 | pgvector | 与 PG 一体，运维简单
LLM | 通义 / DeepSeek / 智谱 | 国内 API，低延迟
文档解析 | python-docx + pymupdf | docx/pdf
部署 | Docker Compose + Nginx | 一键部署

---

## 3. 功能模块清单

### 3.1 学生端

- 邮箱密码登录
- 课程列表（章节数、题目数）
- 章节列表（题目数、正确率、错题数、开放时间）
- 章节答题（单选 A–E、即时判分、用时统计）
- 错题本（按课程/章节筛选、回看）
- 个人中心（昵称、头像）
- AI 侧边栏：作业点评、推荐问题、流式对话

### 3.2 管理端

- 课程 CRUD（名称、封面、简介、目标）
- 三类 Prompt 配置（点评 / 回复 / 推荐）
- Excel 题库导入（覆盖式）
- 章节列表（题目数、开放时间）
- 章节 RAG 管理（开关 + 按章上传文档）

### 3.3 AI + RAG

- 作业点评（提交后，可选 RAG）
- 推荐问题（不走 RAG）
- 章节问答（可选 RAG）
- 章节级 RAG 开关控制

---

## 4. 数据库设计

### 4.1 ER 关系

```
users ──┬── answer_records ── questions ── chapters ── courses
        ├── chapter_sessions
        ├── wrong_questions
        └── chat_messages

chapters ── documents ── document_chunks (vector)
```

### 4.2 表结构

#### users

```sql
id              SERIAL PRIMARY KEY
email           VARCHAR(255) UNIQUE NOT NULL
password_hash   VARCHAR(255) NOT NULL
nickname        VARCHAR(100)
avatar_url      VARCHAR(500)
role            VARCHAR(20) DEFAULT 'student'  -- student | admin
created_at      TIMESTAMP DEFAULT NOW()
```

#### courses

```sql
id                  SERIAL PRIMARY KEY
name                VARCHAR(255) NOT NULL
cover_url           VARCHAR(500)
intro               TEXT
goals               TEXT
prompt_review       TEXT          -- 作业点评 Prompt
prompt_reply        TEXT          -- AI 回复 Prompt
prompt_recommend    TEXT          -- 推荐问题 Prompt
status              VARCHAR(20) DEFAULT 'draft'  -- draft | published
created_at          TIMESTAMP DEFAULT NOW()
updated_at          TIMESTAMP DEFAULT NOW()
```

#### chapters

```sql
id                  SERIAL PRIMARY KEY
course_id           INTEGER REFERENCES courses(id) ON DELETE CASCADE
name                VARCHAR(255) NOT NULL
sort_order          INTEGER DEFAULT 0
open_at             TIMESTAMP                    -- 开放时间
rag_enabled         BOOLEAN DEFAULT FALSE        -- ★ 本章 RAG 开关
rag_doc_count       INTEGER DEFAULT 0            -- 冗余：已索引文档数
rag_chunk_count     INTEGER DEFAULT 0            -- 冗余：知识片段数
created_at          TIMESTAMP DEFAULT NOW()
```

#### questions

```sql
id                  SERIAL PRIMARY KEY
chapter_id          INTEGER REFERENCES chapters(id) ON DELETE CASCADE
content             TEXT NOT NULL
option_a            TEXT NOT NULL
option_b            TEXT NOT NULL
option_c            TEXT NOT NULL
option_d            TEXT NOT NULL
option_e            TEXT
correct_answer      CHAR(1) NOT NULL             -- A/B/C/D/E
explanation         TEXT
sort_order          INTEGER DEFAULT 0
```

#### answer_records

```sql
id                  SERIAL PRIMARY KEY
user_id             INTEGER REFERENCES users(id)
question_id         INTEGER REFERENCES questions(id)
chapter_id          INTEGER REFERENCES chapters(id)
selected_answer     CHAR(1)
is_correct          BOOLEAN
answered_at         TIMESTAMP DEFAULT NOW()
UNIQUE(user_id, question_id)
```

#### chapter_sessions

```sql
id                  SERIAL PRIMARY KEY
user_id             INTEGER REFERENCES users(id)
chapter_id          INTEGER REFERENCES chapters(id)
started_at          TIMESTAMP DEFAULT NOW()
finished_at         TIMESTAMP
duration_seconds    INTEGER
UNIQUE(user_id, chapter_id)
```

#### wrong_questions

```sql
id                  SERIAL PRIMARY KEY
user_id             INTEGER REFERENCES users(id)
question_id         INTEGER REFERENCES questions(id)
chapter_id          INTEGER REFERENCES chapters(id)
last_wrong_at       TIMESTAMP DEFAULT NOW()
wrong_count         INTEGER DEFAULT 1
UNIQUE(user_id, question_id)
```

#### chat_messages

```sql
id                  SERIAL PRIMARY KEY
user_id             INTEGER REFERENCES users(id)
course_id           INTEGER REFERENCES courses(id)
chapter_id          INTEGER REFERENCES chapters(id)
role                VARCHAR(20)                  -- user | assistant
content             TEXT
rag_used            BOOLEAN DEFAULT FALSE
created_at          TIMESTAMP DEFAULT NOW()
```

#### documents（★ 章节 RAG）

```sql
id                  SERIAL PRIMARY KEY
chapter_id          INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE
course_id           INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE
filename            VARCHAR(255) NOT NULL
file_url            VARCHAR(500) NOT NULL
file_type           VARCHAR(10)                  -- docx | pdf
status              VARCHAR(20) DEFAULT 'pending' -- pending|indexing|ready|failed
chunk_count         INTEGER DEFAULT 0
error_message       TEXT
uploaded_by         INTEGER REFERENCES users(id)
created_at          TIMESTAMP DEFAULT NOW()
indexed_at          TIMESTAMP
```

#### document_chunks

```sql
id                  SERIAL PRIMARY KEY
document_id         INTEGER REFERENCES documents(id) ON DELETE CASCADE
chapter_id          INTEGER NOT NULL
course_id           INTEGER NOT NULL
content             TEXT NOT NULL
embedding           vector(1536)
chunk_index         INTEGER
metadata            JSONB
```

```sql
CREATE INDEX idx_chunks_chapter ON document_chunks(chapter_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 5. API 清单

### 5.1 认证 `/api/auth`

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
POST | /auth/login | 登录，返回 JWT + Redis Session | P0
GET | /auth/me | 当前用户 | P0
POST | /auth/logout | 登出，清除 Redis Session | P0
PUT | /auth/profile | 修改资料 | P2
POST | /auth/avatar | 上传头像 | P2

### 5.2 学生端 — 课程

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /courses | 课程列表 | P0
GET | /courses/{id} | 课程详情 | P0
GET | /courses/{id}/chapters | 章节 + 进度统计 | P0

章节列表响应示例：

```json
{
  "id": 148,
  "name": "1. 概论",
  "question_count": 4,
  "accuracy_rate": 100.0,
  "wrong_count": 0,
  "open_at": "2026-06-29T00:00:00",
  "is_open": true
}
```

### 5.3 学生端 — 答题

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /chapters/{id}/questions | 题目（不含答案） | P0
POST | /chapters/{id}/start | 开始答题 | P0
POST | /questions/{id}/answer | 提交单题 | P0
POST | /chapters/{id}/finish | 结束，计算用时 | P0
GET | /chapters/{id}/summary | 章节统计 | P0

### 5.4 学生端 — 错题本

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /wrong-questions | 错题列表（可筛选） | P0

### 5.5 管理端 — 课程

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /admin/courses | 课程列表 | P0
POST | /admin/courses | 新增 | P0
GET | /admin/courses/{id} | 详情 + 章节 | P0
PUT | /admin/courses/{id} | 编辑（含 Prompt） | P0
DELETE | /admin/courses/{id} | 删除 | P1
POST | /admin/courses/{id}/cover | 上传封面 | P0

### 5.6 管理端 — Excel 导入

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /admin/import/template | 下载模板 | P0
POST | /admin/courses/{id}/import | 上传 Excel 覆盖导入 | P0

### 5.7 管理端 — 章节 RAG ★

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /admin/chapters/{id}/rag | RAG 状态 + 文档列表 | P0
PUT | /admin/chapters/{id}/rag | 更新 { rag_enabled } | P0
POST | /admin/chapters/{id}/documents | 上传本章文档 | P0
DELETE | /admin/documents/{id} | 删除文档 + 向量 | P0
POST | /admin/documents/{id}/reindex | 重新索引 | P1
GET | /admin/documents/{id}/progress | SSE 索引进度 | P0

### 5.8 管理端 — 学生

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /admin/students | 学生列表（分页、搜索） | P0
POST | /admin/students | 添加学生 | P0
PUT | /admin/students/{id} | 编辑学生 | P0
DELETE | /admin/students/{id} | 删除学生 | P0
POST | /admin/students/import | 批量导入学生 | P0
GET | /admin/students/import-template | 下载导入模板 | P0

### 5.9 管理端 — 会话管理

方法 | 路径 | 说明 | 优先级
--- | --- | --- | ---
GET | /admin/sessions | 查看在线用户 | P1
DELETE | /admin/sessions/{user_id} | 踢人下线 | P1

### 5.10 AI

方法 | 路径 | 说明 | RAG | 优先级
--- | --- | --- | --- | ---
POST | /ai/review | 作业点评 | ★ 按章 | P0
POST | /ai/recommend | 推荐 3 问题 | 否 | P0
POST | /ai/chat | 流式对话 (SSE) | ★ 按章 | P0
GET | /ai/history | 对话历史 | — | P1

---

## 6. 前端路由与页面

### 6.1 路由表

路径 | 页面 | 角色
--- | --- | ---
/login | 登录 | 公开
/courses | 课程列表 | student
/courses/:courseId | 章节列表 | student
/courses/:courseId/sections/:sectionId | 答题 + AI 侧边栏 | student
/wrong-questions | 错题本 | student
/profile | 个人中心 | student
/admin/courses | 课程管理 | admin
/admin/courses/:id | 课程详情 + 章节 + Excel | admin

### 6.2 公共组件

- **AppLayout** — 顶栏（Logo / 导航 / 头像）
- **AdminLayout** — 左侧 Sidebar
- **AuthGuard** — 路由守卫
- **AccuracyBar** — 正确率进度条（绿/橙/红）
- **QuestionCard** — 单选题（选中/对/错）
- **AIChatPanel** — AI 侧边栏
- **ExcelUploader** — 模板下载 + 上传
- **ChapterRAGDrawer** — ★ 章节 RAG 管理抽屉

### 6.3 UI 规范

元素 | 规范
--- | ---
主色 | #1a5c3a
顶栏 | 深色 + 绿色十字 Logo + 「PUMC MLL」
正确率 | ≥80% 绿 / 60–80% 橙 / <60% 红
选项正确 | 绿色边框；错误红色边框
AI 面板 | 右侧 ~360px
页脚 | ICP 备案号

---

## 7. 章节 RAG 设计

### 7.1 原则

维度 | 规则
--- | ---
开关 | 每章独立 rag_enabled
文档 | 按章上传，1 章 N 份 docx/pdf
问答 | 仅检索 当前章 且 开关开 的 chunks
反馈 | 同上
推荐问题 | 不走 RAG

### 7.2 管理者 UI：章节 RAG 抽屉

```
┌──────────────────────────────────────────────┐
│  章节 RAG 设置 — 1. 概论                      │
├──────────────────────────────────────────────┤
│  RAG 知识增强                          [开关] │
│  开启后，本章 AI 问答与作业反馈将结合下方文档   │
├──────────────────────────────────────────────┤
│  知识文档（本章）                              │
│  📄 概论讲义.docx     ✅ 已索引  24 片段       │
│  📄 概论补充.pdf      ⏳ 索引中               │
│  [上传文档]  docx / pdf                       │
├──────────────────────────────────────────────┤
│  ⚠️ 开启 RAG 需至少 1 份已索引文档             │
│                          [保存]  [取消]        │
└──────────────────────────────────────────────┘
```

### 7.3 开关规则

操作 | 规则
--- | ---
开 RAG | ≥1 份 status=ready，否则禁止
关 RAG | 允许，文档保留
删光文档 | rag_enabled 自动 false
索引中 | 不可开 RAG

### 7.4 检索逻辑

```python
def retrieve_for_chapter(chapter_id, query, top_k=5):
    chapter = get_chapter(chapter_id)
    if not chapter.rag_enabled:
        return []
    return vector_search(
        embedding=embed(query),
        filter={"chapter_id": chapter_id},
        top_k=top_k
    )
```

### 7.5 Prompt 注入模板

**AI 回复**（RAG 开启时追加）：

```
以下是与问题相关的本章资料，请优先依据回答。
若无相关内容，请说明「资料中未提及」。

【参考资料】
{rag_context}
```

**作业点评**（RAG 开启时追加）：

```
以下是本章错题相关的教材片段，请结合给出针对性反馈，不超过 200 字。

【参考资料】
{rag_context}

【答题情况】
{answer_summary}
```

### 7.6 RAG 状态矩阵

rag_enabled | 有 ready 文档 | 问答 | 反馈
--- | --- | --- | ---
OFF | — | 无 RAG | 无 RAG
ON | 否 | 降级无 RAG | 降级无 RAG
ON | 是 | RAG | RAG

---

## 8. Excel 题库导入

### 8.1 模板列

列 | 字段 | 必填
--- | --- | ---
A | 章节名称 | ✓
B | 开放时间 |
C | 题干 | ✓
D–H | 选项 A–E | D–G ✓
I | 正确答案 | ✓
J | 解析 |

### 8.2 导入流程

上传 → 校验 → 按章节分组 → 事务：删旧 chapters/questions → 插入新数据 → 返回统计

### 8.3 校验

- 章节名、题干、选项、答案格式
- 失败回滚 + 行号错误
- 护理题库格式不一致时写 transform_nursing.py

---

## 9. AI 功能设计

### 9.1 三功能对照

功能 | 触发 | RAG | Prompt 来源
--- | --- | --- | ---
作业点评 | 章节答完 | ★ | prompt_review
推荐问题 | 点评后 | 否 | prompt_recommend
AI 对话 | 用户输入 | ★ | prompt_reply

### 9.2 答题摘要（传给 AI）

```
章节：1. 概论
总题数：4，正确：3，错误：1

错题：
- Q2: 题干摘要... 选 B，正确 C

用时：7 分 36 秒
```

### 9.3 前端 AI 面板

- 答完最后一题 → /ai/review
- 点评完成 → /ai/recommend（3 个可点击问题）
- 输入/点击 → SSE 流式 /ai/chat
- Loading 骨架屏

---

## 10. 目录结构

```
pumc-mll/
├── docker-compose.yml
├── docker-compose.prod.yml
├── PLAN.md
├── nginx/nginx.conf
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   │   ├── AIChatPanel/
│   │   │   ├── QuestionCard/
│   │   │   ├── AccuracyBar/
│   │   │   ├── ExcelUploader/
│   │   │   └── ChapterRAGDrawer/    ★
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── login/
│   │   │   ├── courses/
│   │   │   ├── wrong-questions/
│   │   │   ├── profile/
│   │   │   └── admin/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── types/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── redis.py               ★ Redis + arq 连接池
│   │   ├── worker.py              ★ arq Worker 配置
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── deps.py            ★ 认证依赖（含 Redis Session 检查）
│   │   │   ├── courses.py
│   │   │   ├── quiz.py
│   │   │   ├── ai.py
│   │   │   └── admin/
│   │   │       ├── courses.py
│   │   │       ├── import_excel.py
│   │   │       ├── students.py    ★ 学生管理 + 会话管理
│   │   │       └── chapter_rag.py ★ RAG 管理 + SSE 进度
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── quiz_service.py
│   │   │   ├── excel_import_service.py
│   │   │   ├── llm_service.py
│   │   │   └── rag_service.py       ★
│   │   └── tasks/
│   │       └── index_document.py    ★
│   ├── alembic/
│   └── requirements.txt
└── scripts/
    ├── seed.py
    └── transform_nursing.py
```

---

## 11. 开发阶段与任务

### Phase 0：初始化（W1 前 3 天）

- [ ] Git 仓库 + 分支策略
- [ ] frontend 脚手架（Vite + React + TS + Ant Design）
- [ ] backend 脚手架（FastAPI + SQLAlchemy + Alembic）
- [ ] docker-compose（PostgreSQL + Redis + pgvector）
- [ ] 统一响应格式、Axios 封装、JWT
- [ ] LLM API Key 配置

**验收**：`docker compose up` 前后端可访问

### Phase 1：数据库（W1 后 2 天）

- [ ] 全部表 migration（含 RAG 表）
- [ ] pgvector 扩展
- [ ] seed：1 admin + 2 student

**验收**：表齐全，seed 可登录

### Phase 2：后端核心 API（W2）

- [ ] Auth（login / me）
- [ ] Courses 列表/详情
- [ ] Chapters 列表 + 进度统计
- [ ] Questions 获取
- [ ] Quiz（start / answer / finish / summary）
- [ ] Wrong questions

**验收**：Postman 跑通学生主流程

### Phase 3：前端主流程（W3）

- [ ] 登录页
- [ ] 课程列表
- [ ] 章节列表（Table + AccuracyBar）
- [ ] 答题页（QuestionCard + 统计栏）
- [ ] 顶栏导航

**验收**：登录 → 选课 → 答题（无 AI）

### Phase 4：管理后台 + Excel（W4）

- [ ] 课程 CRUD + Prompt 三字段
- [ ] 封面上传
- [ ] Excel 模板 + 导入 service
- [ ] 课程详情 + 章节 Table
- [ ] 章节列表 RAG 状态列 + 「管理」按钮

**验收**：上传护理 Excel，后台见章节/题目

### Phase 5a：AI 基础（W5 前 3 天）

- [ ] LLMService（chat / stream_chat）
- [ ] /ai/review、/ai/recommend、/ai/chat（无 RAG）
- [ ] AIChatPanel 前端
- [ ] 答完触发点评 → 推荐 → 对话

**验收**：AI 三功能可用（纯 Prompt）

### Phase 5b：章节 RAG 后端（W5 后 2 天）★

- [x] documents / document_chunks CRUD
- [x] 文档上传 → 本地存储
- [x] arq 异步索引：解析 → 分块 → embedding → 入库
- [x] SSE 实时索引进度推送
- [x] RAGService.retrieve_for_chapter()
- [x] PUT /admin/chapters/{id}/rag + 校验

**验收**：上传 docx → arq 入队 → Worker 索引 → SSE 推送进度 → ready

### Phase 5c：章节 RAG 管理 UI（W5 末 2 天）★

- [x] ChapterRAGDrawer 组件
- [x] 开关 + 文档列表 + 上传
- [x] SSE 实时进度显示（Progress 组件）
- [x] 开 RAG 校验逻辑

**验收**：管理员可逐章上传、实时查看索引进度、开关 RAG

### Phase 5d：AI + RAG 联调（W6 前 2 天）★

- [ ] /ai/chat 读 chapter.rag_enabled 分支
- [ ] /ai/review 同上
- [ ] 降级：关 RAG / 无文档时不检索
- [ ] 错题本 + 个人中心

**验收**：开 RAG 章节能引用文档；未开章节不串库

### Phase 6：联调 & UI 打磨（W6 后 3 天）

- [ ] 全流程对齐截图
- [ ] 边界 case（见测试清单）
- [ ] 性能：500+ 题导入

**验收**：测试清单全过

### Phase 7：部署（W7）

- [ ] Dockerfile × 2
- [ ] docker-compose.prod.yml
- [ ] Nginx + HTTPS
- [ ] 环境变量、备份
- [ ] 导入护理题库 + 逐章 RAG 文档
- [ ] 生产验收

**验收**：域名可访问，全链路通

---

## 12. 测试清单

### 12.1 核心流程

- [ ] 管理员：建课 → 导 Excel → 逐章传 RAG 文档 → 开 RAG
- [ ] 学生：登录 → 选课 → 答题 → AI 点评（含 RAG）→ 提问（含 RAG）
- [ ] 错题本正确
- [ ] 未开放章节不可进
- [ ] 重新导 Excel 数据正确

### 12.2 章节 RAG ★

- [ ] 第 1 章开 RAG + 有文档 → 问答/反馈引用本章资料
- [ ] 第 2 章关 RAG → 不用 RAG，不用第 1 章文档
- [ ] 开 RAG 无文档 → 禁止或降级
- [ ] 删光文档 → 开关自动关
- [ ] 索引失败 → 可重试，不可开 RAG
- [ ] arq Worker 索引正常
- [ ] SSE 实时进度推送正常

### 12.3 Session 管理

- [ ] 登录后 Redis 中有 session 记录
- [ ] 登出后 Redis session 被删除
- [ ] 被踢下线后 token 失效
- [ ] Redis 不可用时降级为纯 JWT

### 12.4 边界

- [ ] 空课程、单题章节、A–E 五选项
- [ ] LLM 超时降级
- [ ] 未登录 / 越权

---

## 13. 部署清单

- [ ] 服务器 + Docker
- [ ] PostgreSQL 备份 cron
- [ ] Redis
- [ ] arq Worker 服务
- [ ] OSS 或本地存储
- [ ] Nginx 反代 + HTTPS
- [ ] 环境变量：DB / Redis / JWT / LLM Key / OSS
- [ ] 页脚 ICP 号
- [ ] 管理员账号 + 初始数据

---

## 14. Day-by-Day 速查

天 | 任务
--- | ---
D1 | 脚手架 + Docker + DB migration
D2 | Auth + 登录页
D3 | Course/Chapter API
D4 | Question + 课程列表页
D5 | Quiz API
D6 | 章节列表 + AccuracyBar
D7 | 答题页完整交互
D8 | Excel 导入 service
D9 | 管理后台课程 CRUD
D10 | 课程详情 + 章节 Table
D11 | LLM Service + SSE
D12 | AI 点评 + 推荐 + 对话（无 RAG）
D13 | AI 侧边栏前端
D14 | RAG 后端：arq 异步索引 + SSE 进度
D15 | RAGService + 章节开关 API
D16 | ChapterRAGDrawer UI + 实时进度
D17 | AI + RAG 联调
D18 | Redis Session + 错题本 + 个人中心
D19 | 全流程测试 + UI 打磨
D20 | Docker 生产化 + 部署 + 数据导入

### 里程碑

周 | 里程碑 | 验收
--- | --- | ---
W1 | 脚手架 + DB | Docker 起，表建好
W2 | 后端 API | Postman 通
W3 | 前端主流程 | 登录到答题
W4 | 管理 + Excel | 护理题库导入
W5 | AI + RAG 后端/UI | 逐章 RAG 可管理
W6 | 联调 | 全功能 + RAG 隔离
W7 | 部署 | 生产可用
