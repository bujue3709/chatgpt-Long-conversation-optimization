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
  };

  const getMessageNodes = () => Array.from(document.querySelectorAll("main article"));

  const buildMessagePayload = (nodes) =>
    nodes
      .map((node, index) => {
        const roleNode = node.querySelector("[data-message-author-role]");
        let role = roleNode?.getAttribute("data-message-author-role") || "unknown";

        if (role === "unknown") {
          if (node.querySelector('img[alt*="User"], svg[aria-label*="User"]')) {
            role = "user";
          } else if (node.querySelector('img[alt*="ChatGPT"], svg[aria-label*="ChatGPT"]')) {
            role = "assistant";
          }
        }

        const text = node.innerText.trim();
        return {
          index: index + 1,
          role,
          text,
        };
      })
      .filter((message) => message.text.length > 0);

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
  const collapseOldMessages = () => {
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
    const visibleNodes = getMessageNodes();
    const nodesForExport = state.isCollapsed
      ? [...state.cachedNodes, ...visibleNodes.filter((node) => !state.cachedNodes.includes(node))]
      : visibleNodes;

    const payload = {
      exportedAt: new Date().toISOString(),
      url: window.location.href,
      messageCount: nodesForExport.length,
      messages: buildMessagePayload(nodesForExport),
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
      return;
    }
    if (typeof position.left === "number" && typeof position.top === "number") {
      button.style.left = `${position.left}px`;
      button.style.top = `${position.top}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
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

      const rect = button.getBoundingClientRect();
      saveMinimizedPosition({ left: rect.left, top: rect.top });

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

  attachToolbar();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOOLKIT_ID)) {
      attachToolbar();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
