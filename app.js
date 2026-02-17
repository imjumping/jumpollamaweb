// app.js - 使用后端代理端点
(function() {
    const API_BASE = '';  // 使用相对路径
    const CONFIG_KEY = 'ollama_chat_config';

    // 默认配置 - 包含所有 Ollama 支持参数
    const defaultConfig = {
        model: 'qwen3-4b:latest',
        systemPrompt: '你是一个有帮助的助手……',
        // 生成参数
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
        num_predict: -1,
        seed: '',
        stop: 'user:, assistant:',
        repeat_penalty: 1.1,
        presence_penalty: 0,
        frequency_penalty: 0,
        mirostat: 0,
        mirostat_tau: 5.0,
        mirostat_eta: 0.1,
        num_ctx: 2048,
        num_batch: 512,
        num_gpu: 1,
        main_gpu: 0,
        low_vram: false,
        use_mmap: true,
        use_mlock: false,
        num_thread: 0,
        // 其他选项
        think: false,
        raw: false,
        keep_alive: '5m'
    };

    let state = {
        config: { ...defaultConfig },
        messages: [],
        isSending: false,
        abortController: null,
        connected: false,
        checking: false,
        availableModels: []
    };

    // DOM 元素
    const el = {
        modelName: document.getElementById('modelName'),
        systemPrompt: document.getElementById('systemPrompt'),
        temperature: document.getElementById('temperature'),
        top_p: document.getElementById('top_p'),
        top_k: document.getElementById('top_k'),
        num_predict: document.getElementById('num_predict'),
        seed: document.getElementById('seed'),
        stop: document.getElementById('stop'),
        repeat_penalty: document.getElementById('repeat_penalty'),
        presence_penalty: document.getElementById('presence_penalty'),
        frequency_penalty: document.getElementById('frequency_penalty'),
        mirostat: document.getElementById('mirostat'),
        mirostat_tau: document.getElementById('mirostat_tau'),
        mirostat_eta: document.getElementById('mirostat_eta'),
        num_ctx: document.getElementById('num_ctx'),
        num_batch: document.getElementById('num_batch'),
        num_gpu: document.getElementById('num_gpu'),
        main_gpu: document.getElementById('main_gpu'),
        low_vram: document.getElementById('low_vram'),
        use_mmap: document.getElementById('use_mmap'),
        use_mlock: document.getElementById('use_mlock'),
        num_thread: document.getElementById('num_thread'),
        think: document.getElementById('think'),
        saveBtn: document.getElementById('saveConfigBtn'),
        newChatBtn: document.getElementById('newChatBtn'),
        status: document.getElementById('connectionStatus'),
        msgList: document.getElementById('messageList'),
        userInput: document.getElementById('userInput'),
        sendBtn: document.getElementById('sendBtn')
    };

    // ===== 配置 =====
    function loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.config = { ...defaultConfig, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load config:', e);
        }
        applyConfigToUI();
    }

    function saveConfig() {
        collectFromUI();
        localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
        showTempMsg('✅ 配置已保存');
    }

    function collectFromUI() {
        state.config.model = el.modelName.value.trim() || defaultConfig.model;
        state.config.systemPrompt = el.systemPrompt.value;
        state.config.temperature = parseFloat(el.temperature.value) || defaultConfig.temperature;
        state.config.top_p = parseFloat(el.top_p.value) || defaultConfig.top_p;
        state.config.top_k = parseInt(el.top_k.value) || defaultConfig.top_k;
        state.config.num_predict = parseInt(el.num_predict.value) || defaultConfig.num_predict;
        state.config.seed = el.seed.value ? parseInt(el.seed.value) : undefined;
        state.config.stop = el.stop.value || defaultConfig.stop;
        state.config.repeat_penalty = parseFloat(el.repeat_penalty.value) || defaultConfig.repeat_penalty;
        state.config.presence_penalty = parseFloat(el.presence_penalty.value) || defaultConfig.presence_penalty;
        state.config.frequency_penalty = parseFloat(el.frequency_penalty.value) || defaultConfig.frequency_penalty;
        state.config.mirostat = parseInt(el.mirostat.value) || 0;
        state.config.mirostat_tau = parseFloat(el.mirostat_tau.value) || 5.0;
        state.config.mirostat_eta = parseFloat(el.mirostat_eta.value) || 0.1;
        state.config.num_ctx = parseInt(el.num_ctx.value) || 2048;
        state.config.num_batch = parseInt(el.num_batch.value) || 512;
        state.config.num_gpu = parseInt(el.num_gpu.value) || 1;
        state.config.main_gpu = parseInt(el.main_gpu.value) || 0;
        state.config.low_vram = el.low_vram.checked;
        state.config.use_mmap = el.use_mmap.checked;
        state.config.use_mlock = el.use_mlock.checked;
        state.config.num_thread = parseInt(el.num_thread.value) || 0;
        state.config.think = el.think?.checked || false;
    }

    function applyConfigToUI() {
        el.modelName.value = state.config.model;
        el.systemPrompt.value = state.config.systemPrompt || '';
        el.temperature.value = state.config.temperature;
        el.top_p.value = state.config.top_p;
        el.top_k.value = state.config.top_k;
        el.num_predict.value = state.config.num_predict;
        el.seed.value = state.config.seed || '';
        el.stop.value = state.config.stop || '';
        el.repeat_penalty.value = state.config.repeat_penalty;
        el.presence_penalty.value = state.config.presence_penalty;
        el.frequency_penalty.value = state.config.frequency_penalty;
        el.mirostat.value = state.config.mirostat;
        el.mirostat_tau.value = state.config.mirostat_tau;
        el.mirostat_eta.value = state.config.mirostat_eta;
        el.num_ctx.value = state.config.num_ctx;
        el.num_batch.value = state.config.num_batch;
        el.num_gpu.value = state.config.num_gpu;
        el.main_gpu.value = state.config.main_gpu;
        el.low_vram.checked = state.config.low_vram;
        el.use_mmap.checked = state.config.use_mmap;
        el.use_mlock.checked = state.config.use_mlock;
        el.num_thread.value = state.config.num_thread;
        if (el.think) el.think.checked = state.config.think;
    }

    // ===== 更新模型下拉列表 =====
    function updateModelDropdown(models) {
        // 创建或获取 datalist
        let datalist = document.getElementById('modelList');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'modelList';
            document.body.appendChild(datalist);
            el.modelName.setAttribute('list', 'modelList');
        }
        
        datalist.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name || model.model || model.id;
            datalist.appendChild(option);
        });
    }

    // ===== 连接检查 =====
    async function checkConnection() {
        if (state.checking) return;
        state.checking = true;
        setStatus('checking', '🔍 连接中...');
        
        try {
            console.log('Checking connection to backend...');
            
            // 先检查后端健康状态
            const healthRes = await fetch(`${API_BASE}/api/health`);
            const healthData = await healthRes.json();
            console.log('Health check:', healthData);
            
            // 获取模型列表
            const modelsRes = await fetch(`${API_BASE}/api/tags`);
            
            if (!modelsRes.ok) {
                throw new Error(`HTTP ${modelsRes.status}: ${modelsRes.statusText}`);
            }
            
            const data = await modelsRes.json();
            console.log('Models response:', data);
            
            // Ollama /api/tags 返回 { models: [...] }
            if (data && Array.isArray(data.models)) {
                state.connected = true;
                state.availableModels = data.models;
                setStatus('connected', `✅ 已连接 (${data.models.length} 个模型)`);
                el.sendBtn.disabled = false;
                
                // 更新模型下拉列表
                updateModelDropdown(data.models);
                
                // 自动选择第一个可用模型
                const modelNames = data.models.map(m => m.name);
                console.log('Available models:', modelNames);
                
                if (!modelNames.includes(state.config.model) && modelNames.length > 0) {
                    state.config.model = modelNames[0];
                    applyConfigToUI();
                    showTempMsg(`✨ 已选择: ${modelNames[0]}`);
                }
            } else {
                console.error('Unexpected response format:', data);
                throw new Error('Invalid response format from server');
            }
        } catch (e) {
            console.error('Connection check failed:', e);
            state.connected = false;
            setStatus('disconnected', `❌ ${e.message}`);
            el.sendBtn.disabled = true;
        } finally {
            state.checking = false;
        }
    }

    function setStatus(type, text) {
        el.status.textContent = text;
        el.status.className = 'connection-status';
        if (type === 'connected') el.status.classList.add('connected');
        if (type === 'disconnected') el.status.classList.add('disconnected');
        if (type === 'checking') el.status.classList.add('checking');
    }

    // ===== 消息渲染 =====
    function renderMessages() {
        el.msgList.innerHTML = '';
        state.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.role}`;
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            
            if (msg.role === 'error') {
                bubble.style.backgroundColor = 'rgba(239,68,68,0.1)';
                bubble.style.borderColor = '#ef4444';
                bubble.style.color = '#ef4444';
            } else if (msg.role === 'system') {
                bubble.style.backgroundColor = 'rgba(255,255,255,0.05)';
                bubble.style.borderColor = 'var(--border)';
                bubble.style.color = 'var(--muted)';
                bubble.style.fontSize = '12px';
                bubble.style.textAlign = 'center';
            }
            
            bubble.textContent = msg.content;
            div.appendChild(bubble);
            el.msgList.appendChild(div);
        });
        el.msgList.scrollTop = el.msgList.scrollHeight;
    }

    function addMessage(role, content) {
        state.messages.push({ role, content });
        renderMessages();
    }

    function showTempMsg(text, type = 'system') {
        addMessage(type, text);
        setTimeout(() => {
            const idx = state.messages.findIndex(m => m.content === text && m.role === type);
            if (idx !== -1) {
                state.messages.splice(idx, 1);
                renderMessages();
            }
        }, 3000);
    }

    // ===== 构建请求参数 =====
    function buildOptions() {
        const opts = {};
        if (state.config.temperature !== undefined) opts.temperature = state.config.temperature;
        if (state.config.top_p !== undefined) opts.top_p = state.config.top_p;
        if (state.config.top_k !== undefined) opts.top_k = state.config.top_k;
        if (state.config.num_predict !== -1) opts.num_predict = state.config.num_predict;
        if (state.config.repeat_penalty !== undefined) opts.repeat_penalty = state.config.repeat_penalty;
        if (state.config.presence_penalty !== undefined) opts.presence_penalty = state.config.presence_penalty;
        if (state.config.frequency_penalty !== undefined) opts.frequency_penalty = state.config.frequency_penalty;
        if (state.config.mirostat !== undefined) opts.mirostat = state.config.mirostat;
        if (state.config.mirostat_tau !== undefined) opts.mirostat_tau = state.config.mirostat_tau;
        if (state.config.mirostat_eta !== undefined) opts.mirostat_eta = state.config.mirostat_eta;
        if (state.config.num_ctx !== undefined) opts.num_ctx = state.config.num_ctx;
        if (state.config.num_batch !== undefined) opts.num_batch = state.config.num_batch;
        if (state.config.num_gpu !== undefined) opts.num_gpu = state.config.num_gpu;
        if (state.config.main_gpu !== undefined) opts.main_gpu = state.config.main_gpu;
        if (state.config.low_vram !== undefined) opts.low_vram = state.config.low_vram;
        if (state.config.use_mmap !== undefined) opts.use_mmap = state.config.use_mmap;
        if (state.config.use_mlock !== undefined) opts.use_mlock = state.config.use_mlock;
        if (state.config.num_thread !== 0) opts.num_thread = state.config.num_thread;
        if (state.config.seed) opts.seed = state.config.seed;
        if (state.config.stop) {
            opts.stop = state.config.stop.split(',').map(s => s.trim()).filter(s => s);
        }
        return opts;
    }

    // ===== 发送消息 (使用后端代理的 /api/chat) =====
    async function sendMessage(text) {
        if (!text.trim() || state.isSending || !state.connected) return;

        collectFromUI();
        addMessage('user', text);

        // 构建 messages 数组
        const messages = [];
        if (state.config.systemPrompt?.trim()) {
            messages.push({ role: 'system', content: state.config.systemPrompt });
        }
        
        // 添加上下文（最近10条）
        const context = state.messages
            .filter(m => m.role !== 'system' && m.role !== 'error')
            .slice(-10);
        context.forEach(m => {
            if (m.role === 'user' || m.role === 'assistant') {
                messages.push({ role: m.role, content: m.content });
            }
        });

        // 构建请求体 - 使用后端代理的格式
        const requestBody = {
            model: state.config.model,
            messages: messages,
            stream: true,
            options: buildOptions()
        };

        // 可选字段
        if (state.config.think) requestBody.think = state.config.think;
        if (state.config.keep_alive) requestBody.keep_alive = state.config.keep_alive;

        console.log('Sending request to backend:', requestBody);

        const abort = new AbortController();
        state.abortController = abort;
        state.isSending = true;
        el.sendBtn.disabled = true;

        const assistantIdx = state.messages.length;
        addMessage('assistant', '');

        let accumulated = '';

        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abort.signal
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('API error response:', errText);
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        console.log('Received chunk:', chunk);
                        
                        // 根据后端代理的响应格式
                        if (chunk.message?.content) {
                            accumulated += chunk.message.content;
                            state.messages[assistantIdx].content = accumulated;
                            
                            // 更新 UI
                            const container = el.msgList;
                            const children = container.children;
                            if (children[assistantIdx]) {
                                const bubble = children[assistantIdx].querySelector('.bubble');
                                if (bubble) {
                                    bubble.textContent = accumulated;
                                    container.scrollTop = container.scrollHeight;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Parse error:', line, e);
                    }
                }
            }

            // 检查是否收到有效响应
            if (state.messages[assistantIdx]?.content === '') {
                state.messages[assistantIdx].content = '[无响应]';
                renderMessages();
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Request aborted');
                if (assistantIdx < state.messages.length) {
                    state.messages.splice(assistantIdx, 1);
                    renderMessages();
                }
            } else {
                console.error('Send failed:', err);
                if (assistantIdx < state.messages.length) {
                    state.messages.splice(assistantIdx, 1);
                }
                addMessage('error', `❌ 失败: ${err.message}`);
            }
        } finally {
            state.isSending = false;
            state.abortController = null;
            el.sendBtn.disabled = !state.connected;
            el.userInput.focus();
        }
    }

    // ===== 新对话 =====
    function newChat() {
        if (state.isSending && state.abortController) {
            state.abortController.abort();
        }
        state.messages = [];
        renderMessages();
        el.userInput.value = '';
        el.userInput.style.height = 'auto';
        if (state.connected) {
            addMessage('system', '✨ 新对话已开始');
        }
    }

    // ===== 事件绑定 =====
    function initEvents() {
        el.sendBtn.addEventListener('click', () => {
            const text = el.userInput.value;
            if (text.trim()) {
                sendMessage(text);
                el.userInput.value = '';
                el.userInput.style.height = 'auto';
            }
        });

        el.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = el.userInput.value;
                if (text.trim() && !state.isSending && state.connected) {
                    sendMessage(text);
                    el.userInput.value = '';
                    el.userInput.style.height = 'auto';
                }
            }
        });

        el.userInput.addEventListener('input', () => {
            el.userInput.style.height = 'auto';
            el.userInput.style.height = el.userInput.scrollHeight + 'px';
        });

        el.saveBtn.addEventListener('click', saveConfig);
        el.newChatBtn.addEventListener('click', newChat);
        el.status.addEventListener('click', checkConnection);

        // 折叠面板
        document.querySelectorAll('.section-header').forEach(h => {
            h.addEventListener('click', () => {
                const target = document.getElementById(h.dataset.target);
                const parent = h.closest('.collapsible');
                if (target && parent) {
                    parent.classList.toggle('collapsed');
                }
            });
        });

        // 定期检查连接
        setInterval(checkConnection, 30000);
    }

    // ===== 初始化 =====
    function init() {
        loadConfig();
        initEvents();
        renderMessages();
        addMessage('system', '🚀 正在连接到后端...');
        setTimeout(checkConnection, 500);
    }

    // 启动应用
    init();
})();