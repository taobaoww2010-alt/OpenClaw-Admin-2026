#!/usr/bin/env bash
# reset.sh - 清理系统配置与数据库，恢复到首次安装状态
#
# 用途：在部署新版本或需要重置系统时，清除所有配置数据
# 注意：此操作不可逆，所有用户配置、智能体、任务数据将丢失
#
# SQLite WAL 模式说明：
#   必须同时删除 .db、.db-shm、.db-wal 三个文件
#   只删 .db 不够——WAL 文件会将旧数据恢复到新数据库中

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

echo "🔄 正在重置系统..."

# 1. 停止所有运行中的服务
echo "⏹️  停止服务..."
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true

# 2. 清理 SQLite 数据库（三个文件必须一起删除）
if [ -d "$DATA_DIR" ]; then
  echo "🗑️  清理数据库文件..."
  rm -f "$DATA_DIR/wizard.db"
  rm -f "$DATA_DIR/wizard.db-shm"
  rm -f "$DATA_DIR/wizard.db-wal"
  echo "✅ 已删除: wizard.db, wizard.db-shm, wizard.db-wal"
else
  echo "⚠️  data 目录不存在，跳过数据库清理"
fi

# 3. 清理运行时缓存（可选）
CACHE_DIR="$SCRIPT_DIR/.cache"
if [ -d "$CACHE_DIR" ]; then
  echo "🗑️  清理缓存..."
  rm -rf "$CACHE_DIR"
  echo "✅ 已删除: .cache/"
fi

echo ""
echo "✅ 系统重置完成！"
echo "📌 下次启动服务时将自动创建干净的数据库"
echo "💡 运行: npm run dev:all"
