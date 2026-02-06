/*
 * ChatGPT Conversation Toolkit
 * - Optimize long conversations by collapsing older message DOM nodes.
 * - Export the current conversation in JSON with one click.
 */
(() => {
  const TOOLKIT_ID = "chatgpt-conversation-toolkit";
  const STATUS_ID = "chatgpt-conversation-toolkit-status";
  const MINIMIZED_ID = "chatgpt-conversation-toolkit-minimized";
  const POSITION_KEY = "chatgpt-toolkit-position";


  if (document.getElementById(TOOLKIT_ID)) {
    return;
  }

  const state = {
    isCollapsed: false,
    isMinimized: false,
    keepLatest: 20,
    collapsedNodes: [],
    cachedNodes: [],
    conversationKey: null,
    anchorNode: null,
    anchorParent: null,
    // 搜索相关状态
    searchQuery: '',
    searchMatches: [],
    currentMatchIndex: -1,
  };

  const getConversationKey = () => {
    const domConversationId =
      document
        .querySelector("[data-conversation-id]")
        ?.getAttribute("data-conversation-id") ||
      document
        .querySelector("[data-message-id][data-conversation-id]")
        ?.getAttribute("data-conversation-id");
    if (domConversationId) {
      return domConversationId;
    }

    const match = window.location.pathname.match(/\/c\/([^/]+)/);
    if (match) {
      return match[1];
    }
    return `${window.location.pathname}${window.location.search}`;
  };

  const resetConversationState = () => {
    state.isCollapsed = false;
    state.collapsedNodes = [];
    state.cachedNodes = [];
    state.anchorNode = null;
    state.anchorParent = null;
    state.searchQuery = '';
    state.searchMatches = [];
    state.currentMatchIndex = -1;
  };

  const ensureConversationState = () => {
    const nextKey = getConversationKey();
    if (state.conversationKey !== nextKey) {
      state.conversationKey = nextKey;
      resetConversationState();
    }
  };

  const normalizeMessageNode = (node) =>
    node.closest('[data-testid^="conversation-turn-"]') ||
    node.closest("article") ||
    node;

  const getNodeConversationId = (node) =>
    node?.getAttribute("data-conversation-id") ||
    node?.dataset?.conversationId ||
    node?.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id") ||
    null;

  const getMessageNodes = () => {
    const main = document.querySelector("main");
    if (!main) {
      return [];
    }

    const candidates = [
      ...Array.from(main.querySelectorAll("[data-message-author-role]")),
      ...Array.from(main.querySelectorAll("article")),
    ];

    const normalized = candidates.map((node) => normalizeMessageNode(node)).filter(Boolean);

    const filteredByConversation = (() => {
      if (!state.conversationKey) {
        return normalized;
      }
      const scoped = normalized.filter((node) => {
        const nodeConversationId = getNodeConversationId(node);
        return !nodeConversationId || nodeConversationId === state.conversationKey;
      });
      return scoped.length > 0 ? scoped : normalized;
    })();

    const uniqueNodes = [];
    const seen = new Set();
    filteredByConversation.forEach((node) => {
      const messageId = node.getAttribute("data-message-id");
      const testId = node.getAttribute("data-testid");
      const key = messageId || testId || node;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      uniqueNodes.push(node);
    });

    return uniqueNodes;
  };

  const detectRole = (node) => {
    const explicitRole =
      node?.getAttribute("data-message-author-role") || node?.dataset?.messageAuthorRole;
    if (explicitRole) {
      return explicitRole;
    }

    if (node?.querySelector('[data-message-author-role="assistant"]')) {
      return "assistant";
    }
    if (node?.querySelector('[data-message-author-role="user"]')) {
      return "user";
    }
    if (node?.querySelector('img[alt*="ChatGPT"], svg[aria-label*="ChatGPT"], svg[aria-label*="Assistant"]')) {
      return "assistant";
    }
    if (node?.querySelector('img[alt*="User"], svg[aria-label*="User"]')) {
      return "user";
    }
    return "assistant";
  };

  const extractMessageText = (node) => {
    const contentNode =
      (node && node.querySelector && node.querySelector("[data-message-author-role]")) || node;
    return (contentNode?.textContent || "").trim();
  };

  const buildMessagePayload = (nodes) => {
    const seenIds = new Set();
    return nodes
      .map((node) => {
        const roleNode = node.matches("[data-message-author-role]")
          ? node
          : node.querySelector("[data-message-author-role]") || node;
        const messageId = roleNode?.getAttribute("data-message-id") || node.getAttribute("data-message-id");
        if (messageId && seenIds.has(messageId)) {
          return null;
        }
        if (messageId) {
          seenIds.add(messageId);
        }

        const role = detectRole(roleNode);
        const text = extractMessageText(roleNode);

        if (!text) {
          return null;
        }

        return { role, text };
      })
      .filter(Boolean)
      .map((message, index) => ({
        index: index + 1,
        role: message.role,
        text: message.text,
      }));
  };

  const updateStatus = (message, tone = "info") => {
    const status = document.getElementById(STATUS_ID);
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const saveMinimizedPosition = (position) => {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  };

  const loadMinimizedPosition = () => {
    const stored = localStorage.getItem(POSITION_KEY);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  };

  const snapToEdge = (button, savePosition = true) => {
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonWidth = rect.width;
    const buttonHeight = rect.height;

    // 计算按钮中心点到左右边缘的距离
    const centerX = rect.left + buttonWidth / 2;
    const distanceToLeft = centerX;
    const distanceToRight = viewportWidth - centerX;

    // 确定贴合到哪个边缘
    const edge = distanceToLeft <= distanceToRight ? 'left' : 'right';

    // 获取当前 top 值，并确保在可视区域内
    let top = rect.top;
    const margin = 16; // 边距

    // 确保 top 不会让按钮超出可视区域
    if (top < margin) {
      top = margin;
    } else if (top + buttonHeight > viewportHeight - margin) {
      top = viewportHeight - buttonHeight - margin;
    }

    // 应用贴合位置
    if (edge === 'left') {
      button.style.left = `${margin}px`;
      button.style.right = 'auto';
    } else {
      button.style.left = 'auto';
      button.style.right = `${margin}px`;
    }
    button.style.top = `${top}px`;
    button.style.bottom = 'auto';

    // 保存位置
    if (savePosition) {
      saveMinimizedPosition({ edge, top });
    }
  };

  const ensureButtonVisible = (button) => {
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 16;

    let needsAdjustment = false;

    // 检查是否超出可视区域
    if (rect.left < 0 || rect.right > viewportWidth ||
      rect.top < 0 || rect.bottom > viewportHeight) {
      needsAdjustment = true;
    }

    if (needsAdjustment) {
      snapToEdge(button, true);
    }
  };
  const collapseOldMessages = () => {
    ensureConversationState();
    const nodes = getMessageNodes();
    if (nodes.length <= state.keepLatest) {
      updateStatus("当前消息数量较少，无需优化。", "info");
      return;
    }

    state.cachedNodes = nodes;
    const toCollapse = nodes.slice(0, nodes.length - state.keepLatest);

    // 记录第一个保留的节点作为锚点
    const firstKeptNode = nodes[nodes.length - state.keepLatest];
    state.anchorNode = firstKeptNode;
    state.anchorParent = firstKeptNode?.parentNode;

    state.collapsedNodes = toCollapse.map((node) => ({
      node,
      parent: node.parentNode,
    }));

    toCollapse.forEach((node) => node.remove());

    // 清除搜索状态和高亮
    clearSearchHighlight();
    state.searchQuery = '';
    state.searchMatches = [];
    state.currentMatchIndex = -1;
    updateSearchUI();

    state.isCollapsed = true;
    updateStatus(`已优化：隐藏 ${toCollapse.length} 条旧消息。`, "success");
  };

  const restoreMessages = () => {
    ensureConversationState();
    if (!state.isCollapsed) {
      updateStatus("没有需要恢复的消息。", "info");
      return;
    }

    // 保存当前滚动位置：记录当前可见的第一个消息节点
    const visibleNodes = getMessageNodes();
    let anchorElement = null;
    let anchorOffsetTop = 0;

    if (visibleNodes.length > 0) {
      // 找到当前视口中可见的第一个消息节点（部分可见也算）
      for (const node of visibleNodes) {
        const rect = node.getBoundingClientRect();
        // 消息部分可见：底部在视口内 且 顶部在视口内或上方
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          anchorElement = node;
          anchorOffsetTop = rect.top;
          break;
        }
      }
      // 如果没找到，使用第一个节点
      if (!anchorElement) {
        anchorElement = visibleNodes[0];
        anchorOffsetTop = anchorElement.getBoundingClientRect().top;
      }
    }

    // 使用锚点恢复：将所有隐藏的节点按顺序插入到锚点之前
    state.collapsedNodes.forEach(({ node, parent }) => {
      if (state.anchorNode && state.anchorParent?.contains(state.anchorNode)) {
        state.anchorParent.insertBefore(node, state.anchorNode);
      } else if (parent) {
        // 如果锚点不存在，尝试添加到原父节点
        parent.appendChild(node);
      }
    });

    // 恢复后，滚动回之前可见的消息位置
    if (anchorElement) {
      requestAnimationFrame(() => {
        const newRect = anchorElement.getBoundingClientRect();
        const scrollDelta = newRect.top - anchorOffsetTop;
        window.scrollBy(0, scrollDelta);
      });
    }

    state.collapsedNodes = [];
    state.anchorNode = null;
    state.anchorParent = null;
    state.isCollapsed = false;
    updateStatus("已恢复所有消息。", "success");
  };

  const exportMessages = () => {
    ensureConversationState();
    const visibleNodes = getMessageNodes();
    const nodesForExport = state.isCollapsed
      ? [...state.cachedNodes, ...visibleNodes.filter((node) => !state.cachedNodes.includes(node))]
      : visibleNodes;
    const messages = buildMessagePayload(nodesForExport);

    const payload = {
      exportedAt: new Date().toISOString(),
      url: window.location.href,
      messageCount: messages.length,
      messages,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `chatgpt-session-${dateTag}.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    updateStatus("导出已开始，请检查下载文件。", "success");
  };

  // ============ 搜索功能 ============

  const updateSearchUI = () => {
    const searchResult = document.getElementById('chatgpt-toolkit-search-result');
    const prevBtn = document.getElementById('chatgpt-toolkit-search-prev');
    const nextBtn = document.getElementById('chatgpt-toolkit-search-next');

    if (!searchResult) return;

    if (state.searchMatches.length === 0) {
      if (state.searchQuery) {
        searchResult.textContent = '未找到匹配';
      } else {
        searchResult.textContent = '';
      }
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      searchResult.textContent = `${state.currentMatchIndex + 1} / ${state.searchMatches.length}`;
      prevBtn.disabled = state.searchMatches.length <= 1;
      nextBtn.disabled = state.searchMatches.length <= 1;
    }
  };

  const clearSearchHighlight = () => {
    document.querySelectorAll('.chatgpt-toolkit-search-highlight').forEach(el => {
      el.classList.remove('chatgpt-toolkit-search-highlight');
    });
  };

  const highlightCurrentMatch = () => {
    clearSearchHighlight();
    if (state.currentMatchIndex >= 0 && state.currentMatchIndex < state.searchMatches.length) {
      const node = state.searchMatches[state.currentMatchIndex];
      node.classList.add('chatgpt-toolkit-search-highlight');
    }
  };

  const performSearch = (query) => {
    state.searchQuery = query.trim().toLowerCase();
    state.searchMatches = [];
    state.currentMatchIndex = -1;

    // 检查是否处于隐藏状态
    if (state.isCollapsed) {
      updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
      updateSearchUI();
      return;
    }

    if (!state.searchQuery) {
      clearSearchHighlight();
      updateSearchUI();
      return;
    }

    // 搜索所有消息节点
    const nodes = getMessageNodes();
    nodes.forEach(node => {
      const text = (node.textContent || '').toLowerCase();
      if (text.includes(state.searchQuery)) {
        state.searchMatches.push(node);
      }
    });

    if (state.searchMatches.length > 0) {
      state.currentMatchIndex = 0;
      highlightCurrentMatch();
      scrollToCurrentMatch();
    }

    updateSearchUI();
  };

  const scrollToCurrentMatch = () => {
    if (state.currentMatchIndex >= 0 && state.currentMatchIndex < state.searchMatches.length) {
      const node = state.searchMatches[state.currentMatchIndex];
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const navigateToPrevMatch = () => {
    if (state.isCollapsed) {
      updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
      return;
    }
    if (state.searchMatches.length === 0) return;

    state.currentMatchIndex = (state.currentMatchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
    highlightCurrentMatch();
    scrollToCurrentMatch();
    updateSearchUI();
  };

  const navigateToNextMatch = () => {
    if (state.isCollapsed) {
      updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
      return;
    }
    if (state.searchMatches.length === 0) return;

    state.currentMatchIndex = (state.currentMatchIndex + 1) % state.searchMatches.length;
    highlightCurrentMatch();
    scrollToCurrentMatch();
    updateSearchUI();
  };

  const buildToolbar = () => {
    const container = document.createElement("section");
    container.id = TOOLKIT_ID;
    container.innerHTML = `
      <div class="chatgpt-toolkit-header">
        <strong>ChatGPT 工具</strong>
        <button type="button" class="chatgpt-toolkit-minimize" data-action="minimize" aria-label="收起工具">
          收起
        </button>
      </div>
      <div class="chatgpt-toolkit-actions">
        <button type="button" class="chatgpt-toolkit-button" data-action="collapse">
          优化长会话
        </button>
        <button type="button" class="chatgpt-toolkit-button" data-action="restore">
          恢复隐藏消息
        </button>
        <button type="button" class="chatgpt-toolkit-button primary" data-action="export">
          一键导出
        </button>
      </div>
      <div class="chatgpt-toolkit-search">
        <div class="chatgpt-toolkit-search-row">
          <input type="text" id="chatgpt-toolkit-search-input" class="chatgpt-toolkit-search-input" placeholder="搜索消息内容..." />
          <button type="button" class="chatgpt-toolkit-search-btn" data-action="search" title="搜索">🔍</button>
        </div>
        <div class="chatgpt-toolkit-search-nav">
          <button type="button" id="chatgpt-toolkit-search-prev" class="chatgpt-toolkit-nav-btn" data-action="search-prev" disabled title="上一条">◀</button>
          <span id="chatgpt-toolkit-search-result" class="chatgpt-toolkit-search-result"></span>
          <button type="button" id="chatgpt-toolkit-search-next" class="chatgpt-toolkit-nav-btn" data-action="search-next" disabled title="下一条">▶</button>
        </div>
      </div>
      <p id="${STATUS_ID}" class="chatgpt-toolkit-status" data-tone="info">准备就绪。</p>
      <p class="chatgpt-toolkit-tip">提示：优化会隐藏旧消息，导出时会自动包含隐藏内容。</p>
    `;

    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.dataset.action;
      if (!action) {
        return;
      }
      if (action === "minimize") {
        minimizeToolbar();
      }
      if (action === "collapse") {
        collapseOldMessages();
      }
      if (action === "restore") {
        restoreMessages();
      }
      if (action === "export") {
        exportMessages();
      }
      if (action === "search") {
        const input = document.getElementById('chatgpt-toolkit-search-input');
        if (input) {
          performSearch(input.value);
        }
      }
      if (action === "search-prev") {
        navigateToPrevMatch();
      }
      if (action === "search-next") {
        navigateToNextMatch();
      }
    });

    // 监听搜索输入框的回车事件
    container.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target.id === 'chatgpt-toolkit-search-input' && event.key === 'Enter') {
        performSearch(target.value);
      }
    });

    return container;
  };

  const buildMinimizedButton = () => {
    const button = document.createElement("button");
    button.id = MINIMIZED_ID;
    button.type = "button";
    button.className = "chatgpt-toolkit-minimized";
    button.setAttribute("aria-label", "展开 ChatGPT 工具");
    return button;
  };

  const applyMinimizedPosition = (button) => {
    const position = loadMinimizedPosition();
    if (!position) {
      // 默认位置：右边缘
      snapToEdge(button, false);
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonHeight = button.offsetHeight || 48;
    const margin = 16;

    // 新格式：edge + top
    if (position.edge && typeof position.top === "number") {
      let top = position.top;

      // 确保 top 在可视区域内
      if (top < margin) {
        top = margin;
      } else if (top + buttonHeight > viewportHeight - margin) {
        top = viewportHeight - buttonHeight - margin;
      }

      if (position.edge === 'left') {
        button.style.left = `${margin}px`;
        button.style.right = 'auto';
      } else {
        button.style.left = 'auto';
        button.style.right = `${margin}px`;
      }
      button.style.top = `${top}px`;
      button.style.bottom = 'auto';
      return;
    }

    // 兼容旧格式：left + top（迁移到新格式）
    if (typeof position.left === "number" && typeof position.top === "number") {
      let top = position.top;

      // 确保 top 在可视区域内
      if (top < margin) {
        top = margin;
      } else if (top + buttonHeight > viewportHeight - margin) {
        top = viewportHeight - buttonHeight - margin;
      }

      // 判断应该贴哪个边
      const centerX = position.left + 24; // 按钮宽度的一半
      const edge = centerX <= viewportWidth / 2 ? 'left' : 'right';

      if (edge === 'left') {
        button.style.left = `${margin}px`;
        button.style.right = 'auto';
      } else {
        button.style.left = 'auto';
        button.style.right = `${margin}px`;
      }
      button.style.top = `${top}px`;
      button.style.bottom = 'auto';

      // 保存为新格式
      saveMinimizedPosition({ edge, top });
    }
  };

  const minimizeToolbar = () => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimized = document.getElementById(MINIMIZED_ID);
    if (!toolbar || !minimized) {
      return;
    }
    toolbar.classList.add("is-hidden");
    minimized.classList.add("is-visible");
    state.isMinimized = true;
  };

  const expandToolbar = () => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimized = document.getElementById(MINIMIZED_ID);
    if (!toolbar || !minimized) {
      return;
    }
    toolbar.classList.remove("is-hidden");
    minimized.classList.remove("is-visible");
    state.isMinimized = false;
  };

  const enableDrag = (button) => {
    let isDragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseMove = (event) => {
      if (!isDragging) {
        return;
      }
      moved = true;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const nextLeft = startLeft + deltaX;
      const nextTop = startTop + deltaY;

      button.style.left = `${nextLeft}px`;
      button.style.top = `${nextTop}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    };

    const onMouseUp = () => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // 拖动结束后自动贴合到最近的边缘
      snapToEdge(button, true);

      setTimeout(() => {
        moved = false;
      }, 0);
    };

    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      isDragging = true;
      moved = false;
      const rect = button.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    button.addEventListener("click", () => {
      if (moved) {
        return;
      }
      expandToolbar();
    });
  };
  const attachToolbar = () => {
    if (document.getElementById(TOOLKIT_ID)) {
      return;
    }
    const toolbar = buildToolbar();
    const minimizedButton = buildMinimizedButton();
    document.body.appendChild(toolbar);
    document.body.appendChild(minimizedButton);
    applyMinimizedPosition(minimizedButton);
    enableDrag(minimizedButton);
  };

  // 标志位：避免重复添加 resize 监听器
  let resizeListenerAdded = false;

  const setupResizeListener = () => {
    if (resizeListenerAdded) return;
    resizeListenerAdded = true;

    window.addEventListener('resize', () => {
      const btn = document.getElementById(MINIMIZED_ID);
      if (btn && btn.classList.contains('is-visible')) {
        ensureButtonVisible(btn);
      }
    });
  };

  attachToolbar();
  setupResizeListener();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOOLKIT_ID)) {
      attachToolbar();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
