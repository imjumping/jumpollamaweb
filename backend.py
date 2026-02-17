# backend.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx
import json
import os
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Ollama Web UI")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
client = httpx.AsyncClient(timeout=None)

# ========== API 代理 ==========

@app.get("/api/tags")
async def list_models():
    """GET /api/tags - 列出本地模型"""
    try:
        logger.info("Fetching models from Ollama")
        resp = await client.get(f"{OLLAMA_HOST}/api/tags")
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error listing models: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/generate")
async def generate(request: Request):
    """POST /api/generate - 生成补全（流式）"""
    try:
        body = await request.json()
        logger.info(f"Generate request for model: {body.get('model')}")
        
        # 确保 stream 为 True
        if "stream" not in body:
            body["stream"] = True
        
        async def generate_stream():
            try:
                async with client.stream("POST", f"{OLLAMA_HOST}/api/generate", json=body) as resp:
                    if resp.status_code != 200:
                        error_text = await resp.aread()
                        logger.error(f"Ollama error: {error_text.decode()}")
                        yield json.dumps({"error": error_text.decode()}).encode() + b"\n"
                        return
                    
                    async for chunk in resp.aiter_bytes():
                        if chunk:
                            yield chunk
            except Exception as e:
                logger.error(f"Stream error: {e}")
                yield json.dumps({"error": str(e)}).encode() + b"\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive"
            }
        )
    except Exception as e:
        logger.error(f"Generate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: Request):
    """POST /api/chat - 聊天（流式）"""
    try:
        body = await request.json()
        logger.info(f"Chat request for model: {body.get('model')}")
        
        # 确保 stream 为 True
        if "stream" not in body:
            body["stream"] = True
        
        async def chat_stream():
            try:
                async with client.stream("POST", f"{OLLAMA_HOST}/api/chat", json=body) as resp:
                    if resp.status_code != 200:
                        error_text = await resp.aread()
                        logger.error(f"Ollama error: {error_text.decode()}")
                        yield json.dumps({"error": error_text.decode()}).encode() + b"\n"
                        return
                    
                    async for chunk in resp.aiter_bytes():
                        if chunk:
                            yield chunk
            except Exception as e:
                logger.error(f"Stream error: {e}")
                yield json.dumps({"error": str(e)}).encode() + b"\n"
        
        return StreamingResponse(
            chat_stream(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive"
            }
        )
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/embed")
async def embed(request: Request):
    """POST /api/embed - 生成嵌入向量"""
    try:
        body = await request.json()
        logger.info(f"Embed request for model: {body.get('model')}")
        
        resp = await client.post(f"{OLLAMA_HOST}/api/embed", json=body)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in embed: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Embed failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ps")
async def ps():
    """GET /api/ps - 列出运行中的模型"""
    try:
        logger.info("Fetching running models")
        resp = await client.get(f"{OLLAMA_HOST}/api/ps")
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in ps: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"PS failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/version")
async def version():
    """GET /api/version - 获取版本"""
    try:
        logger.info("Checking Ollama version")
        resp = await client.get(f"{OLLAMA_HOST}/api/version")
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in version: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Version check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

# ========== 健康检查 ==========

@app.get("/api/health")
async def health_check():
    """健康检查端点"""
    try:
        # 检查 Ollama 是否可用
        resp = await client.get(f"{OLLAMA_HOST}/api/version", timeout=5.0)
        resp.raise_for_status()
        return {"status": "healthy", "ollama": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "ollama": "disconnected", "error": str(e)}

# ========== 静态文件服务 ==========

# 首先创建静态文件服务（如果有静态文件目录）
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# 如果静态文件目录存在，则挂载静态文件服务
if os.path.exists(STATIC_DIR) and os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    logger.info(f"Static files mounted from {STATIC_DIR}")

@app.get("/")
async def serve_index():
    """服务 index.html"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    # 如果没有 index.html，返回一个简单的说明页面
    return JSONResponse(
        content={
            "message": "Ollama Web UI Backend",
            "status": "running",
            "ollama_host": OLLAMA_HOST,
            "endpoints": [
                "/api/tags",
                "/api/generate",
                "/api/chat",
                "/api/embed",
                "/api/ps",
                "/api/version",
                "/api/health"
            ]
        }
    )

# 注意：这个通配符路由要放在最后，避免覆盖 API 路由
@app.get("/{path:path}")
async def serve_static_or_fallback(path: str):
    """服务静态文件或返回 404"""
    # 跳过 API 路由
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    # 检查是否是静态文件
    file_path = os.path.join(STATIC_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # 尝试返回 index.html（用于 SPA 路由）
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    raise HTTPException(status_code=404, detail="File not found")

@app.on_event("shutdown")
async def shutdown():
    """关闭时清理资源"""
    await client.aclose()
    logger.info("Shutting down, closed HTTP client")

if __name__ == "__main__":
    print("="*60)
    print("Ollama Web UI Backend (OpenAPI Compliant)")
    print("="*60)
    print(f"Ollama Host: {OLLAMA_HOST}")
    print(f"Static Directory: {STATIC_DIR}")
    print(f"Static files exist: {os.path.exists(STATIC_DIR)}")
    print("\nAvailable endpoints:")
    print("  - GET  /")
    print("  - GET  /api/tags")
    print("  - POST /api/generate")
    print("  - POST /api/chat")
    print("  - POST /api/embed")
    print("  - GET  /api/ps")
    print("  - GET  /api/version")
    print("  - GET  /api/health")
    print("\nServer starting at: http://localhost:8000")
    print("="*60)
    
    uvicorn.run(
        "backend:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="info"
    )