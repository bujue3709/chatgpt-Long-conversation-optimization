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

    state.collapsedNodes = toCollapse.map((node) => ({
      node,
      parent: node.parentNode,
      nextSibling: node.nextSibling,
    }));

    toCollapse.forEach((node) => node.remove());

    state.isCollapsed = true;
    updateStatus(`已优化：隐藏 ${toCollapse.length} 条旧消息。`, "success");
  };

  const restoreMessages = () => {
    ensureConversationState();
    if (!state.isCollapsed) {
      updateStatus("没有需要恢复的消息。", "info");
      return;
    }

    state.collapsedNodes.forEach(({ node, parent, nextSibling }) => {
      if (!parent) {
        return;
      }
      if (nextSibling && parent.contains(nextSibling)) {
        parent.insertBefore(node, nextSibling);
      } else {
        parent.appendChild(node);
      }
    });

    state.collapsedNodes = [];
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

  const buildToolbar = () => {
    const container = document.createElement("section");
    container.id = TOOLKIT_ID;
    container.innerHTML = `
      <div class="chatgpt-toolkit-header">
        <strong>ChatGPT 工具</strong>
        <span class="chatgpt-toolkit-subtitle">优化长会话 + 导出</span>
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
    
    // 监听窗口大小变化，确保按钮始终可见
    window.addEventListener('resize', () => {
      const btn = document.getElementById(MINIMIZED_ID);
      if (btn && btn.classList.contains('is-visible')) {
        ensureButtonVisible(btn);
      }
    });
  };

  attachToolbar();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOOLKIT_ID)) {
      attachToolbar();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
