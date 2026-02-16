#!/bin/bash
# start.sh

echo "=== Ollama Web UI 启动脚本 ==="
echo

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3，请先安装 Python"
    exit 1
fi

# 检查 pip 是否安装
if ! command -v pip3 &> /dev/null; then
    echo "❌ 未找到 pip3，请先安装 pip"
    exit 1
fi

# 安装依赖
echo "📦 安装 Python 依赖..."
pip3 install -r requirements.txt

# 检查 Ollama 是否运行
echo "🔍 检查 Ollama 状态..."
if curl -s http://localhost:11434 > /dev/null; then
    echo "✅ Ollama 运行正常"
else
    echo "⚠️  Ollama 未运行，请先执行: ollama serve"
    echo "   继续启动后端，但可能无法连接"
fi

echo
echo "🚀 启动后端服务器..."
echo "   访问地址: http://localhost:8000"
echo "   按 Ctrl+C 停止"
echo

# 创建 static 目录并复制文件
mkdir -p static
cp index.html style.css app.js static/

# 启动后端
python3 backend.py