# PUMC MLL 开发日志

## 2026-07-16 更新

### ✨ 新增功能

#### 开发/生产环境区分

| 文件 | 说明 |
|------|------|
| `backend/.env.prod` | 生产环境变量模板 |
| `.env.example` | Docker Compose 变量模板 |
| `backend/app/config.py` | 根据 ENVIRONMENT 加载不同配置 |
| `backend/app/main.py` | 环境日志、CORS 区分 |

**使用方式**：
```bash
# 开发环境（默认）
docker compose up -d

# 生产环境
ENVIRONMENT=production docker compose -f docker-compose.prod.yml up -d
```

#### Redis Session 管理

| 功能 | 文件 | 说明 |
|------|------|------|
| Redis 客户端 | `backend/app/redis.py` | 连接池管理，启动/关闭生命周期 |
| 登录存储 Session | `backend/app/api/auth.py` | 登录时写入 Redis，TTL 跟随 JWT |
| 登出清除 Session | `backend/app/api/auth.py` | 登出时删除 Redis key |
| Token 验证检查 | `backend/app/api/deps.py` | 解码 JWT 后检查 Redis session |
| 前端登出调用 | `frontend/src/stores/authStore.ts` | 新增 `logoutAndClear()` 调用后端 |
| 管理员踢人 | `backend/app/api/admin/students.py` | `GET /admin/sessions` 查看在线用户 |
| | | `DELETE /admin/sessions/{user_id}` 踢人下线 |

**Session 流程**：
```
登录 ──► 生成 JWT ──► 存储 Redis(session:{user_id} = token)
                           │
请求 ──► 解码 JWT ──► 检查 Redis ──► token 匹配？──► 放行/拒绝
                           │
登出 ──► 调用后端 ──► 删除 Redis key ──► 清除本地 token
```

#### ARQ 异步任务队列

| 功能 | 文件 | 说明 |
|------|------|------|
| arq Worker 配置 | `backend/app/worker.py` | Worker 启动配置 |
| arq 连接池 | `backend/app/redis.py` | 初始化 arq pool |
| 异步入队 | `backend/app/api/admin/chapter_rag.py` | 使用 arq 替代 asyncio.create_task |
| SSE 实时进度 | `backend/app/api/admin/chapter_rag.py` | `/documents/{id}/progress` |
| 前端进度显示 | `frontend/src/components/ChapterRAGDrawer.tsx` | SSE 连接 + Progress 组件 |
| Docker Worker | `docker-compose.yml` | 新增 worker 服务 |

**索引流程**：
```
上传文档 ──► 保存文件 ──► 创建 Document(pending)
                              │
                              ▼
                     arq.enqueue_job("index_document_arq")
                              │
                              ▼
                     Worker 取出任务 ──► 解析 → 分块 → Embedding
                              │
                              ▼
                     SSE 推送进度 ──► 前端实时显示
                              │
                              ▼
                     status=ready ──► 前端显示完成
```

---

## 2026-07-15 更新

### 🐛 Bug 修复

#### 严重 Bug（已修复）

| # | 问题 | 修复文件 | 说明 |
|---|------|----------|------|
| 1 | RAG service 访问不存在的模型属性 | `models/__init__.py` | 添加 `rag_doc_count`/`rag_chunk_count` 字段到 Chapter 模型 |
| 2 | `func.now()` 赋值给模型属性 | `api/quiz.py` | 改为 `datetime.now()` |
| 3 | 认证未检查 `is_active` | `api/deps.py`, `api/auth.py` | 添加 `User.is_active == True` 检查 |
| 4 | 删除章节外键约束失败 | `models/__init__.py` | 添加 `ondelete="CASCADE"` |
| 5 | 管理后台章节列表 GET 路由缺失 | `api/admin/courses.py` | 添加 GET `/admin/courses/{id}/chapters` |
| 6 | Prompt 更新路由缺失 | `api/admin/courses.py` | 添加 PUT `/admin/courses/{id}/prompts` |
| 7 | 字段名不匹配（做题总结） | `types/api.ts` | `correct` → `correct_count` |
| 8 | 字段名不匹配（错题列表） | `types/api.ts` | 匹配后端 `option_a`~`option_e` 结构 |
| 9 | 导入确认请求体不匹配 | `api/admin.ts`, `ExcelUploader.tsx` | 使用 `preview_id` 替代 `rows` |
| 10 | 僵尸进程占用端口 | - | 杀死所有 Python 进程后重启 |

#### 功能修复

| # | 问题 | 修复说明 |
|---|------|----------|
| 11 | 章节删除 404 | 在 `admin/chapter_rag.py` 添加 DELETE 路由 |
| 12 | 创建章节 API 缺失 | 添加 POST `/admin/courses/{id}/chapters` |
| 13 | RAG 开关字段名不匹配 | 前端 `enabled` → `rag_enabled` |
| 14 | 课程封面上传存根 | 实现真正的文件上传功能 |
| 15 | 头像上传 API 缺失 | 添加 POST `/auth/avatar` |
| 16 | 章节统计未按用户过滤 | 添加 `user_id` 条件到子查询 |
| 17 | Markdown 渲染 `**` 未闭合 | 添加 `cleanMarkdown` 函数 |
| 18 | SSE token 重复 | 前后端添加去重逻辑 |
| 19 | React 严格模式重复渲染 | 使用 `useRef` 避免 updater 重复调用 |

### ✨ 新增功能

| 功能 | 文件 | 说明 |
|------|------|------|
| 学生分组 | `models/__init__.py`, `admin/students.tsx` | 支持 A/B 分组，导入/添加/显示 |
| 批量导入学生 | `api/admin/students.py`, `admin/students.tsx` | Excel 导入，支持 4 列格式 |
| RAG 语义搜索 | `services/rag_service.py` | 基于 embedding 余弦相似度检索 |
| 管理员登录跳转 | `pages/login/index.tsx` | 管理员自动跳转 `/admin/courses` |

### 📁 Excel 导入格式

#### 学生导入模板（4列）

| A列 | B列 | C列 | D列 |
|-----|-----|-----|-----|
| 邮箱 | 密码 | 分组 | 姓名 |
| student@example.com | 123456 | A | 张三 |

#### 题库导入模板（10列）

| A列 | B列 | C列 | D-H列 | I列 | J列 |
|-----|-----|-----|-------|-----|-----|
| 章节名称 | 开放时间 | 题干 | 选项A-E | 正确答案 | 解析 |

---

## 🚀 部署清单

### 一、必须完成

#### 1. 创建生产 Dockerfile

**后端 `backend/Dockerfile.prod`**

```dockerfile
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /app .

RUN mkdir -p uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

**前端 `frontend/Dockerfile.prod`**

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

#### 2. 环境变量

创建 `backend/.env.prod`：

```env
# Database
DATABASE_URL=postgresql+asyncpg://pumc:STRONG_PASSWORD@db:5432/pumc_mll

# Redis
REDIS_URL=redis://:STRONG_PASSWORD@redis:6379/0

# JWT (生成随机密钥: openssl rand -hex 32)
JWT_SECRET=YOUR_RANDOM_SECRET_HERE
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# DeepSeek LLM (轮换已泄露的Key)
DEEPSEEK_API_KEY=YOUR_NEW_API_KEY
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Upload
UPLOAD_DIR=uploads
```

#### 3. 更新 CORS 配置

`backend/app/main.py`：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://your-domain.com",  # 添加生产域名
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 4. Nginx 配置

`nginx/nginx.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 50M;  # 文件上传限制

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }

    location /uploads {
        alias /app/uploads;
    }
}
```

#### 5. Docker Compose 生产配置

`docker-compose.prod.yml`：

```yaml
services:
  db:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: pumc_mll
      POSTGRES_USER: pumc
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redisdata:/data
    restart: always

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    env_file: ./backend/.env.prod
    volumes:
      - uploads:/app/uploads
    depends_on:
      - db
      - redis
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - ./frontend/dist:/usr/share/nginx/html
      - uploads:/app/uploads
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - backend
      - frontend
    restart: always

volumes:
  pgdata:
  redisdata:
  uploads:
```

### 二、部署步骤

```bash
# 1. 克隆代码
git clone <repo-url> pumc-mll
cd pumc-mll

# 2. 创建环境变量文件
cp backend/.env.example backend/.env.prod
# 编辑 .env.prod，填入真实密码和密钥

# 3. 创建 .env 文件（Docker Compose 变量）
cat > .env << EOF
DB_PASSWORD=your_strong_db_password
REDIS_PASSWORD=your_strong_redis_password
EOF

# 4. 构建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 5. 初始化数据库
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.database import engine
from app.models import Base
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
"

# 6. 创建管理员账号
docker compose -f docker-compose.prod.yml exec backend python scripts/seed.py

# 7. 申请 SSL 证书
docker compose -f docker-compose.prod.yml exec nginx certbot --nginx -d your-domain.com

# 8. 重启 Nginx
docker compose -f docker-compose.prod.yml restart nginx
```

### 三、安全检查

- [ ] 轮换 DeepSeek API Key（已泄露）
- [ ] 生成强随机 JWT_SECRET
- [ ] 设置强数据库密码
- [ ] 设置强 Redis 密码
- [ ] 更新 CORS 配置
- [ ] 添加文件上传大小限制
- [ ] 启用 HTTPS
- [ ] 配置防火墙（仅开放 80/443）

### 四、监控与备份

```bash
# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 数据库备份
docker compose -f docker-compose.prod.yml exec db pg_dump -U pumc pumc_mll > backup_$(date +%Y%m%d).sql

# 恢复备份
cat backup_20260715.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U pumc pumc_mll
```

---

## 📋 待优化

| 优先级 | 项目 | 说明 |
|--------|------|------|
| 高 | pgvector 向量搜索 | 生产环境使用 pgvector 替代 JSON 存储 |
| 高 | Celery 异步任务 | 文档索引使用 Celery 替代 asyncio.create_task |
| 中 | 错题本 API 合并 | 统一 `/wrong-questions` 和 `/mistakes` |
| 中 | 文件上传限制 | 添加文件大小校验 |
| 低 | Markdown 渲染增强 | 支持列表、代码块、表格 |
| 低 | 答题并行提交 | 使用 Promise.all 替代串行请求 |
