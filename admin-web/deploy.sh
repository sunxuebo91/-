#!/bin/bash

# Web 管理后台部署脚本
# 部署到微信云开发静态网站托管

echo "🚀 开始部署 Web 管理后台..."

# 1. 构建生产版本
echo "📦 正在构建..."
npm run build

# 2. 检查构建是否成功
if [ ! -d "dist" ]; then
  echo "❌ 构建失败，dist 目录不存在"
  exit 1
fi

# 3. 部署到云开发
echo "☁️  正在部署到云开发..."
tcb hosting deploy ./dist -e cloud1-6gyrh73h8e8206ce

# 4. 完成
echo "✅ 部署完成！"
echo "🌐 访问地址："
echo "   - 默认域名: https://cloud1-6gyrh73h8e8206ce.tcloudbaseapp.com"
echo "   - 自定义域名: https://admin.yourdomain.com（如已配置）"

