(() => {
  const cardGrid = document.getElementById('cardGrid');
  const baseUrlInput = document.getElementById('baseUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const videoFileInput = document.getElementById('videoFile');
  const btnCreate = document.getElementById('btnCreate');
  const logEl = document.getElementById('log');

  const STORAGE_KEY = 'character_cards';

  const loadCards = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  const saveCards = (cards) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  };

  const renderCards = () => {
    const cards = loadCards();
    if (!cards.length) {
      cardGrid.innerHTML = '<div class="muted">暂无角色卡</div>';
      return;
    }
    cardGrid.innerHTML = cards.map((card, idx) => {
      const profile = card.profile_asset_url || card.avatar_path || card.avatar_url || '';
      const safeProfile = profile ? `style="background-image:url('${profile}')"` : '';
      const username = card.username || '';
      const displayName = card.display_name || username || '角色';
      return `
        <div class="role-card" ${safeProfile}>
          <div class="content">
            <div class="name">${displayName}</div>
            <div class="username">@${username || 'unknown'}</div>
            <div class="role-actions">
              <button class="btn" data-copy="@${username}">复制 @username</button>
              <button class="btn" data-delete="${idx}">删除</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  const postHeight = () => {
    if (window.parent === window) return;
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.parent.postMessage({ type: 'sora-generate-height', height, frameId: 'characterCardsFrame' }, '*');
  };

  const appendLog = (msg) => {
    if (!logEl) return;
    logEl.textContent = `${logEl.textContent || ''}${msg}\n`;
    postHeight();
  };

  const parseCharacterCard = (payload) => {
    if (!payload) return null;
    const card = payload.card || payload;
    if (!card) return null;
    return {
      display_name: card.display_name || card.displayName || card.name || '',
      username: card.username || '',
      cameo_id: card.cameo_id || '',
      character_id: card.character_id || '',
      profile_asset_url: card.profile_asset_url || card.avatar_path || card.avatar_url || ''
    };
  };

  const handleStream = async (resp) => {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      chunk.split(/\n\n/).forEach((line) => {
        if (!line.startsWith('data:')) return;
        const data = line.replace(/^data:\s*/, '').trim();
        if (!data || data === '[DONE]') return;
        appendLog(data);
        try {
          const parsed = JSON.parse(data);
          if (parsed.event === 'character_card' || parsed.card) {
            const card = parseCharacterCard(parsed);
            if (card) {
              const cards = loadCards();
              cards.unshift({ ...card, created_at: new Date().toISOString() });
              saveCards(cards);
              renderCards();
            }
          }
        } catch {
          // ignore
        }
      });
    }
  };

  const submitCharacter = async () => {
    const baseUrl = baseUrlInput.value.trim().replace(/\/$/, '');
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const file = videoFileInput.files[0];
    logEl.textContent = '';

    if (!baseUrl || !apiKey || !file) {
      appendLog('请填写 Base URL / API Key 并选择视频文件。');
      return;
    }
    if (!file.type.startsWith('video/')) {
      appendLog('请选择视频文件。');
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });

    const body = {
      model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'video_url', video_url: { url: dataUrl } }
          ]
        }
      ]
    };

    appendLog('开始提交角色卡创建请求...');
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok || !resp.body) {
      appendLog(`请求失败: HTTP ${resp.status}`);
      return;
    }

    await handleStream(resp);
    appendLog('处理完成');
  };

  document.getElementById('btnRefresh').addEventListener('click', () => {
    renderCards();
    postHeight();
  });
  document.getElementById('btnExport').addEventListener('click', () => {
    const cards = loadCards();
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `character_cards_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('btnClear').addEventListener('click', () => {
    if (!confirm('确定清空全部角色卡吗？')) return;
    saveCards([]);
    renderCards();
    postHeight();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data)) {
          saveCards(data);
          renderCards();
          postHeight();
        }
      } catch {
        appendLog('导入失败：JSON 格式错误');
      }
    };
    reader.readAsText(file);
  });

  cardGrid.addEventListener('click', (e) => {
    const copy = e.target.getAttribute('data-copy');
    if (copy) {
      navigator.clipboard.writeText(copy);
      return;
    }
    const del = e.target.getAttribute('data-delete');
    if (del !== null) {
      const idx = parseInt(del, 10);
      const cards = loadCards();
      cards.splice(idx, 1);
      saveCards(cards);
      renderCards();
      postHeight();
    }
  });

  btnCreate.addEventListener('click', () => submitCharacter().catch((err) => appendLog(err.message)));

  renderCards();
  postHeight();
  setInterval(postHeight, 500);
})();
