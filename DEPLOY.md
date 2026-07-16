# PUMC MLL 部署指南

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 域名（生产环境）
- SSL 证书（生产环境，可用 Let's Encrypt）

## 开发环境部署

```bash
# 1. 克隆代码
git clone <repo-url> pumc-mll
cd pumc-mll

# 2. 启动服务
docker compose up -d

# 3. 访问
# 前端: http://localhost:3000
# API: http://localhost:8000
```

## 生产环境部署

### 1. 准备环境变量

```bash
# 创建 Docker 变量文件
cp .env.example .env
vim .env
```

填写内容：
```env
DB_USER=pumc
DB_PASSWORD=your_strong_db_password_here
REDIS_PASSWORD=your_strong_redis_password_here
```

```bash
# 创建后端生产配置
cp backend/.env.example backend/.env.prod
vim backend/.env.prod
```

填写内容：
```env
DATABASE_URL=postgresql+asyncpg://pumc:your_strong_db_password_here@db:5432/pumc_mll
REDIS_URL=redis://:your_strong_redis_password_here@redis:6379/0
JWT_SECRET=your_random_jwt_secret_here
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

### 2. 部署

```bash
# 使用部署脚本
chmod +x deploy.sh
./deploy.sh prod

# 或手动部署
docker compose -f docker-compose.prod.yml up -d --build
```

### 3. 初始化数据库

```bash
# 创建数据库表
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.database import engine
from app.models import Base
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
"

# 创建管理员账号
docker compose -f docker-compose.prod.yml exec backend python scripts/seed.py
```

### 4. 配置 HTTPS（可选）

```bash
# 安装 certbot
sudo apt install certbot

# 申请证书
sudo certbot certonly --standalone -d your-domain.com

# 证书会自动挂载到容器（已配置 volume）
# 重启 nginx 使证书生效
docker compose -f docker-compose.prod.yml restart nginx
```

## 服务管理

```bash
# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml logs -f backend

# 重启服务
docker compose -f docker-compose.prod.yml restart

# 停止服务
docker compose -f docker-compose.prod.yml down

# 重新构建并启动
docker compose -f docker-compose.prod.yml up -d --build
```

## 数据备份

```bash
# 备份数据库
docker compose -f docker-compose.prod.yml exec db pg_dump -U pumc pumc_mll > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260716.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U pumc pumc_mll
```

## 常见问题

### 1. 端口被占用

```bash
# 检查端口占用
sudo lsof -i :80
sudo lsof -i :443

# 修改 docker-compose.prod.yml 中的端口映射
ports:
  - "8080:80"  # 改为其他端口
```

### 2. 数据库连接失败

```bash
# 检查数据库状态
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs db

# 确认密码正确
cat .env
```

### 3. Redis 连接失败

```bash
# 检查 Redis 状态
docker compose -f docker-compose.prod.yml logs redis

# 测试连接
docker compose -f docker-compose.prod.yml exec redis redis-cli -a your_password ping
```

### 4. Worker 未启动

```bash
# 检查 Worker 状态
docker compose -f docker-compose.prod.yml ps worker
docker compose -f docker-compose.prod.yml logs worker

# 重启 Worker
docker compose -f docker-compose.prod.yml restart worker
```

## 监控

```bash
# 查看容器资源使用
docker stats

# 查看磁盘使用
docker system df
```
