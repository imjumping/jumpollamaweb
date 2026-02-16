@echo off
echo === Ollama Web UI 启动脚本 ===
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未找到 Python，请先安装 Python
    pause
    exit /b 1
)

REM 安装依赖
echo 📦 安装 Python 依赖...
pip install -r requirements.txt

REM 检查 Ollama 是否运行
echo 🔍 检查 Ollama 状态...
curl -s http://localhost:11434 >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Ollama 未运行，请先执行: ollama serve
    echo    继续启动后端，但可能无法连接
) else (
    echo ✅ Ollama 运行正常
)

echo.
echo 🚀 启动后端服务器...
echo    访问地址: http://localhost:8000
echo    按 Ctrl+C 停止
echo.

REM 创建 static 目录并复制文件
if not exist static mkdir static
copy index.html static\ >nul
copy style.css static\ >nul
copy app.js static\ >nul

python backend.py
pause