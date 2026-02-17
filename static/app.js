// app.js — 修复版
(function() {
    const API_BASE = '';
    const CONFIG_STORAGE_KEY = 'ollama_chat_config';

    // 默认配置
    const defaultConfig = {
        model: 'qwen3-4b:latest',
        systemPrompt: '你是一个有帮助的助手……',
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
        num_predict: -1,
        seed: '',
        stop: 'user:, assistant:',
        repeat_penalty: 1.1,
        presence_penalty: 0,
        frequency_penalty: 0,
        mirostat: '0',
        mirostat_tau: 5.0,
        mirostat_eta: 0.1,
        num_ctx: 2048,
        num_batch: 512,
        num_gpu: 1,
        main_gpu: 0,
        low_vram: false,
        use_mmap: true,
        use_mlock: false,
        num_thread: 0
    };

    // 当前应用状态
    let state = {
        config: { ...defaultConfig },
        messages: [],
        isSending: false,
        abortController: null,
        connected: false,
        checkingConnection: false,
        availableModels: []
    };

    // DOM 元素
    const elements = {
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
        saveConfigBtn: document.getElementById('saveConfigBtn'),
        newChatBtn: document.getElementById('newChatBtn'),
        connectionStatus: document.getElementById('connectionStatus'),
        messageList: document.getElementById('messageList'),
        userInput: document.getElementById('userInput'),
        sendBtn: document.getElementById('sendBtn')
    };

    // ==================== 配置管理 ====================

    function loadConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.config = { ...defaultConfig, ...parsed };
            } else {
                state.config = { ...defaultConfig };
            }
        } catch (e) {
            console.warn('Failed to load config', e);
            state.config = { ...defaultConfig };
        }
        applyConfigToUI();
    }

    function saveConfig() {
        collectConfigFromUI();
        try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state.config));
            showTemporaryMessage('✅ 配置已保存', 'system');
        } catch (e) {
            console.error('Save failed', e);
            showTemporaryMessage('❌ 保存配置失败', 'error');
        }
    }

    function collectConfigFromUI() {
        state.config.model = elements.modelName.value.trim() || defaultConfig.model;
        state.config.systemPrompt = elements.systemPrompt.value;
        state.config.temperature = parseFloat(elements.temperature.value) || defaultConfig.temperature;
        state.config.top_p = parseFloat(elements.top_p.value) || defaultConfig.top_p;
        state.config.top_k = parseInt(elements.top_k.value, 10) || defaultConfig.top_k;
        state.config.num_predict = parseInt(elements.num_predict.value, 10) || defaultConfig.num_predict;
        state.config.seed = elements.seed.value ? parseInt(elements.seed.value, 10) : undefined;
        state.config.stop = elements.stop.value || defaultConfig.stop;
        state.config.repeat_penalty = parseFloat(elements.repeat_penalty.value) || defaultConfig.repeat_penalty;
        state.config.presence_penalty = parseFloat(elements.presence_penalty.value) || defaultConfig.presence_penalty;
        state.config.frequency_penalty = parseFloat(elements.frequency_penalty.value) || defaultConfig.frequency_penalty;
        state.config.mirostat = elements.mirostat.value;
        state.config.mirostat_tau = parseFloat(elements.mirostat_tau.value) || defaultConfig.mirostat_tau;
        state.config.mirostat_eta = parseFloat(elements.mirostat_eta.value) || defaultConfig.mirostat_eta;
        state.config.num_ctx = parseInt(elements.num_ctx.value, 10) || defaultConfig.num_ctx;
        state.config.num_batch = parseInt(elements.num_batch.value, 10) || defaultConfig.num_batch;
        state.config.num_gpu = parseInt(elements.num_gpu.value, 10) || defaultConfig.num_gpu;
        state.config.main_gpu = parseInt(elements.main_gpu.value, 10) || defaultConfig.main_gpu;
        state.config.low_vram = elements.low_vram.checked;
        state.config.use_mmap = elements.use_mmap.checked;
        state.config.use_mlock = elements.use_mlock.checked;
        state.config.num_thread = parseInt(elements.num_thread.value, 10) || defaultConfig.num_thread;
    }

    function applyConfigToUI() {
        elements.modelName.value = state.config.model;
        elements.systemPrompt.value = state.config.systemPrompt || '';
        elements.temperature.value = state.config.temperature;
        elements.top_p.value = state.config.top_p;
        elements.top_k.value = state.config.top_k;
        elements.num_predict.value = state.config.num_predict;
        elements.seed.value = state.config.seed !== undefined ? state.config.seed : '';
        elements.stop.value = state.config.stop || '';
        elements.repeat_penalty.value = state.config.repeat_penalty;
        elements.presence_penalty.value = state.config.presence_penalty;
        elements.frequency_penalty.value = state.config.frequency_penalty;
        elements.mirostat.value = state.config.mirostat;
        elements.mirostat_tau.value = state.config.mirostat_tau;
        elements.mirostat_eta.value = state.config.mirostat_eta;
        elements.num_ctx.value = state.config.num_ctx;
        elements.num_batch.value = state.config.num_batch;
        elements.num_gpu.value = state.config.num_gpu;
        elements.main_gpu.value = state.config.main_gpu;
        elements.low_vram.checked = state.config.low_vram;
        elements.use_mmap.checked = state.config.use_mmap;
        elements.use_mlock.checked = state.config.use_mlock;
        elements.num_thread.value = state.config.num_thread;
    }

    // ==================== 连接检查 ====================

    async function checkConnection() {
        if (state.checkingConnection) return;
        
        state.checkingConnection = true;
        updateConnectionStatus('checking', '🔍 正在连接后端...');
        
        try {
            const response = await fetch(`${API_BASE}/api/health`);
            const data = await response.json();
            
            if (data.status === 'connected') {
                state.connected = true;
                state.availableModels = data.models || [];
                updateConnectionStatus('connected', `✅ 已连接 (${data.models?.length || 0} 个模型)`);
                elements.sendBtn.disabled = false;
                
                if (data.models && data.models.length > 0) {
                    const modelNames = data.models.map(m => m.name);
                    console.log('可用模型:', modelNames);
                }
            } else {
                state.connected = false;
                updateConnectionStatus('disconnected', `❌ ${data.message || '无法连接'}`);
                elements.sendBtn.disabled = true;
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            state.connected = false;
            updateConnectionStatus('disconnected', '❌ 无法连接到后端');
            elements.sendBtn.disabled = true;
        } finally {
            state.checkingConnection = false;
        }
    }

    function updateConnectionStatus(status, text) {
        elements.connectionStatus.textContent = text;
        elements.connectionStatus.className = 'connection-status';
        if (status === 'connected') {
            elements.connectionStatus.classList.add('connected');
        } else if (status === 'checking') {
            elements.connectionStatus.classList.add('checking');
        }
    }

    // ==================== 消息管理 ====================

    function renderMessages() {
        const container = elements.messageList;
        container.innerHTML = '';
        
        state.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role}`;
            
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            
            // 不同角色的样式
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
            messageDiv.appendChild(bubble);
            container.appendChild(messageDiv);
        });
        
        container.scrollTop = container.scrollHeight;
    }

    function addMessage(role, content) {
        state.messages.push({ role, content });
        renderMessages();
    }

    function showTemporaryMessage(text, type = 'system') {
        const msg = { role: type, content: text };
        state.messages.push(msg);
        renderMessages();
        
        setTimeout(() => {
            const index = state.messages.indexOf(msg);
            if (index !== -1) {
                state.messages.splice(index, 1);
                renderMessages();
            }
        }, 3000);
    }

    // ==================== 发送消息 ====================

    async function sendMessage(userText) {
        if (!userText.trim() || state.isSending || !state.connected) {
            if (!state.connected) {
                showTemporaryMessage('请等待连接成功后再发送消息', 'system');
            }
            return;
        }

        collectConfigFromUI();

        // 添加用户消息
        addMessage('user', userText);

        // 构建消息历史
        const messages = [];
        
        if (state.config.systemPrompt && state.config.systemPrompt.trim()) {
            messages.push({ role: 'system', content: state.config.systemPrompt });
        }
        
        // 添加对话历史
        const historyMessages = state.messages
            .filter(m => m.role !== 'system' && m.role !== 'error')
            .slice(-10); // 只保留最近10条
        
        historyMessages.forEach(m => {
            if (m.role === 'user' || m.role === 'assistant') {
                messages.push({
                    role: m.role,
                    content: m.content
                });
            }
        });

        // 构建 options
        const options = {
            temperature: state.config.temperature,
            top_p: state.config.top_p,
            top_k: state.config.top_k,
            repeat_penalty: state.config.repeat_penalty,
            presence_penalty: state.config.presence_penalty,
            frequency_penalty: state.config.frequency_penalty,
            mirostat: parseInt(state.config.mirostat, 10),
            mirostat_tau: state.config.mirostat_tau,
            mirostat_eta: state.config.mirostat_eta,
            num_ctx: state.config.num_ctx,
            num_batch: state.config.num_batch,
            num_gpu: state.config.num_gpu,
            main_gpu: state.config.main_gpu,
            low_vram: state.config.low_vram,
            use_mmap: state.config.use_mmap,
            use_mlock: state.config.use_mlock
        };
        
        if (state.config.num_predict !== -1) options.num_predict = state.config.num_predict;
        if (state.config.num_thread !== 0) options.num_thread = state.config.num_thread;
        if (state.config.seed) options.seed = state.config.seed;
        if (state.config.stop) {
            options.stop = state.config.stop.split(',').map(s => s.trim()).filter(s => s);
        }

        const requestBody = {
            model: state.config.model,
            messages: messages,
            stream: true,
            options: options
        };

        console.log('发送请求:', requestBody);

        const abortController = new AbortController();
        state.abortController = abortController;
        state.isSending = true;
        elements.sendBtn.disabled = true;

        // 添加占位符助手消息
        const assistantMsgIndex = state.messages.length;
        addMessage('assistant', '...');

        let accumulated = '';

        try {
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal
            });

            if (!response.ok) {
                let errorDetail = `HTTP ${response.status}`;
                try {
                    const errorText = await response.text();
                    if (errorText) errorDetail += `: ${errorText}`;
                } catch (e) {}
                throw new Error(errorDetail);
            }

            if (!response.body) {
                throw new Error('响应体为空');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('Stream complete');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                
                // 处理可能的多行 JSON
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 最后一行可能不完整
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    try {
                        const parsed = JSON.parse(line);
                        
                        // 检查是否有消息内容
                        if (parsed.message?.content) {
                            accumulated += parsed.message.content;
                            
                            // 更新消息
                            state.messages[assistantMsgIndex].content = accumulated;
                            
                            // 更新 UI
                            const container = elements.messageList;
                            const msgDivs = container.children;
                            if (msgDivs[assistantMsgIndex]) {
                                const bubble = msgDivs[assistantMsgIndex].querySelector('.bubble');
                                if (bubble) {
                                    bubble.textContent = accumulated;
                                    container.scrollTop = container.scrollHeight;
                                }
                            }
                        }
                        
                        // 如果是非流式响应，直接设置内容
                        if (parsed.response) {
                            accumulated = parsed.response;
                            state.messages[assistantMsgIndex].content = accumulated;
                            renderMessages();
                        }
                    } catch (e) {
                        console.warn('解析行失败:', line, e);
                    }
                }
            }
            
            // 如果最终消息还是空的，显示错误
            if (state.messages[assistantMsgIndex]?.content === '...' || 
                state.messages[assistantMsgIndex]?.content === '') {
                state.messages[assistantMsgIndex].content = '[模型未返回内容]';
                renderMessages();
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('请求被取消');
                if (assistantMsgIndex < state.messages.length) {
                    state.messages.splice(assistantMsgIndex, 1);
                    renderMessages();
                }
            } else {
                console.error('发送失败:', error);
                if (assistantMsgIndex < state.messages.length) {
                    state.messages.splice(assistantMsgIndex, 1);
                }
                addMessage('error', `❌ 请求失败: ${error.message}`);
            }
        } finally {
            state.isSending = false;
            state.abortController = null;
            elements.sendBtn.disabled = !state.connected;
            elements.userInput.focus();
        }
    }

    // ==================== 新对话 ====================

    function newChat() {
        if (state.isSending && state.abortController) {
            state.abortController.abort();
        }
        state.messages = [];
        renderMessages();
        elements.userInput.value = '';
        elements.userInput.style.height = 'auto';
        elements.userInput.focus();
        
        if (state.connected) {
            addMessage('system', '✨ 新对话已开始');
        }
    }

    // ==================== 事件绑定 ====================

    function initEventListeners() {
        elements.sendBtn.addEventListener('click', () => {
            const text = elements.userInput.value;
            if (text.trim()) {
                sendMessage(text);
                elements.userInput.value = '';
                elements.userInput.style.height = 'auto';
            }
        });

        elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = elements.userInput.value;
                if (text.trim() && !state.isSending && state.connected) {
                    sendMessage(text);
                    elements.userInput.value = '';
                    elements.userInput.style.height = 'auto';
                }
            }
        });

        elements.userInput.addEventListener('input', () => {
            elements.userInput.style.height = 'auto';
            elements.userInput.style.height = (elements.userInput.scrollHeight) + 'px';
        });

        elements.saveConfigBtn.addEventListener('click', saveConfig);
        elements.newChatBtn.addEventListener('click', newChat);
        elements.connectionStatus.addEventListener('click', checkConnection);

        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const target = document.getElementById(targetId);
                const parent = header.closest('.collapsible');
                if (target && parent) {
                    parent.classList.toggle('collapsed');
                }
            });
        });

        setInterval(checkConnection, 30000);
    }

    // ==================== 初始化 ====================

    function init() {
        loadConfig();
        initEventListeners();
        renderMessages();
        elements.userInput.focus();
        addMessage('system', '🚀 正在连接到后端...');
        setTimeout(checkConnection, 500);
    }

    init();
})();