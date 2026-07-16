#!/bin/bash

# PUMC MLL 部署脚本

set -e

echo "=== PUMC MLL 部署脚本 ==="

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "[错误] 未找到 .env 文件"
    echo "请先执行: cp .env.example .env 并填写密码"
    exit 1
fi

if [ ! -f "backend/.env.prod" ]; then
    echo "[错误] 未找到 backend/.env.prod 文件"
    echo "请先执行: cp backend/.env.example backend/.env.prod 并填写密钥"
    exit 1
fi

# 选择环境
ENV=${1:-dev}

if [ "$ENV" = "prod" ]; then
    echo "[INFO] 部署生产环境..."
    COMPOSE_FILE="docker-compose.prod.yml"
else
    echo "[INFO] 部署开发环境..."
    COMPOSE_FILE="docker-compose.yml"
fi

# 构建并启动
echo "[INFO] 构建 Docker 镜像..."
docker compose -f $COMPOSE_FILE build

echo "[INFO] 启动服务..."
docker compose -f $COMPOSE_FILE up -d

# 等待服务启动
echo "[INFO] 等待服务启动..."
sleep 10

# 初始化数据库
echo "[INFO] 初始化数据库..."
docker compose -f $COMPOSE_FILE exec -T backend python -c "
from app.database import engine
from app.models import Base
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('[OK] 数据库表已创建')
asyncio.run(init())
"

# 创建管理员账号
echo "[INFO] 创建管理员账号..."
docker compose -f $COMPOSE_FILE exec -T backend python scripts/seed.py

echo ""
echo "=== 部署完成 ==="
echo ""
echo "服务访问地址："
if [ "$ENV" = "prod" ]; then
    echo "  前端: http://your-domain.com"
    echo "  API: http://your-domain.com/api"
else
    echo "  前端: http://localhost:3000"
    echo "  API: http://localhost:8000"
fi
echo ""
echo "默认管理员账号：admin@example.com / admin123"
echo ""
echo "常用命令："
echo "  查看日志: docker compose -f $COMPOSE_FILE logs -f"
echo "  停止服务: docker compose -f $COMPOSE_FILE down"
echo "  重启服务: docker compose -f $COMPOSE_FILE restart"
