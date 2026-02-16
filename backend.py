# backend.py - 修复流式响应
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
import httpx
import json
import os
import uvicorn
from typing import Optional, Dict, Any, List
import logging
import asyncio

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Ollama Web UI Backend")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ollama 地址
OLLAMA_HOST = "http://localhost:11434"
# 创建共享的 HTTP 客户端，禁用超时
http_client = httpx.AsyncClient(timeout=None)

# ==================== API 路由 ====================

@app.get("/api/health")
async def health_check():
    """检查 Ollama 连接状态"""
    try:
        response = await http_client.get(f"{OLLAMA_HOST}/api/tags")
        if response.status_code == 200:
            data = response.json()
            return {
                "status": "connected",
                "models": data.get("models", []),
                "message": "Ollama is running"
            }
        else:
            return {
                "status": "error",
                "message": f"Ollama returned status {response.status_code}"
            }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "disconnected",
            "message": f"Cannot connect to Ollama: {str(e)}"
        }

@app.get("/api/tags")
async def list_models():
    """获取本地模型列表"""
    try:
        response = await http_client.get(f"{OLLAMA_HOST}/api/tags")
        return response.json()
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/chat")
async def chat(request: Request):
    """聊天完成 (流式) - 修复版本"""
    try:
        body = await request.json()
        logger.info(f"Chat request: model={body.get('model')}, stream={body.get('stream', True)}")
        
        # 确保 stream 为 True
        if 'stream' not in body:
            body['stream'] = True
        
        # 发送请求到 Ollama
        async with http_client.stream("POST", f"{OLLAMA_HOST}/api/chat", json=body) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                logger.error(f"Ollama error: {response.status_code} - {error_text}")
                raise HTTPException(status_code=response.status_code, detail=error_text.decode())
            
            # 创建一个异步生成器来处理流式响应
            async def generate():
                try:
                    async for chunk in response.aiter_bytes():
                        yield chunk
                        await asyncio.sleep(0)  # 让出控制权，避免阻塞
                except Exception as e:
                    logger.error(f"Stream error: {e}")
                finally:
                    logger.info("Stream completed")
            
            # 返回流式响应
            return StreamingResponse(
                generate(),
                media_type="application/x-ndjson",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate(request: Request):
    """生成补全 (流式)"""
    try:
        body = await request.json()
        logger.info(f"Generate request: model={body.get('model')}")
        
        # 确保 stream 为 True
        if 'stream' not in body:
            body['stream'] = True
        
        async with http_client.stream("POST", f"{OLLAMA_HOST}/api/generate", json=body) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                raise HTTPException(status_code=response.status_code, detail=error_text.decode())
            
            async def generate():
                try:
                    async for chunk in response.aiter_bytes():
                        yield chunk
                        await asyncio.sleep(0)
                except Exception as e:
                    logger.error(f"Stream error: {e}")
                finally:
                    logger.info("Generate stream completed")
            
            return StreamingResponse(
                generate(),
                media_type="application/x-ndjson",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
    except Exception as e:
        logger.error(f"Generate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/embeddings")
async def embeddings(request: Request):
    """生成嵌入向量"""
    try:
        body = await request.json()
        response = await http_client.post(f"{OLLAMA_HOST}/api/embeddings", json=body)
        return response.json()
    except Exception as e:
        logger.error(f"Embeddings failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pull")
async def pull_model(request: Request):
    """拉取模型"""
    try:
        body = await request.json()
        async with http_client.stream("POST", f"{OLLAMA_HOST}/api/pull", json=body) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                raise HTTPException(status_code=response.status_code, detail=error_text.decode())
            
            async def generate():
                async for chunk in response.aiter_bytes():
                    yield chunk
                    await asyncio.sleep(0)
            
            return StreamingResponse(
                generate(),
                media_type="application/x-ndjson"
            )
    except Exception as e:
        logger.error(f"Pull failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/delete")
async def delete_model(request: Request):
    """删除模型"""
    try:
        body = await request.json()
        response = await http_client.delete(f"{OLLAMA_HOST}/api/delete", json=body)
        return response.json()
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ps")
async def list_running():
    """列出正在运行的模型"""
    try:
        response = await http_client.get(f"{OLLAMA_HOST}/api/ps")
        return response.json()
    except Exception as e:
        logger.error(f"PS failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/version")
async def version():
    """获取 Ollama 版本"""
    try:
        response = await http_client.get(f"{OLLAMA_HOST}/api/version")
        return response.json()
    except Exception as e:
        logger.error(f"Version check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

# ==================== 静态文件服务 ====================

# 挂载静态文件目录
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

@app.get("/")
async def serve_index():
    """提供 index.html"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "index.html not found"}

@app.get("/{filename}")
async def serve_static(filename: str):
    """提供静态文件 (js, css 等)"""
    file_path = os.path.join(STATIC_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/favicon.ico")
async def favicon():
    """处理 favicon 请求"""
    return JSONResponse(status_code=204)  # 无内容

# ==================== 启动 ====================
if __name__ == "__main__":
    print("="*50)
    print("Ollama Web UI Backend (修复版)")
    print("="*50)
    print(f"Ollama address: {OLLAMA_HOST}")
    print(f"Static files directory: {STATIC_DIR}")
    print("\n访问: http://localhost:8000")
    print("按 Ctrl+C 停止\n")
    
    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )