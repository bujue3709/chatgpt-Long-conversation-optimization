/*
 * ChatGPT Conversation Toolkit - Toolbar and drag behavior
 */
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
      <button type="button" class="chatgpt-toolkit-button" data-action="prompt-library">
        Prompt 指令
      </button>
      <button type="button" class="chatgpt-toolkit-button" data-action="timeline-toggle">
        隐藏时间线
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
    const actionTarget =
      target instanceof Element
        ? target.closest("[data-action]")
        : target instanceof Node && target.parentElement
          ? target.parentElement.closest("[data-action]")
          : null;

    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }
    const action = actionTarget.dataset.action;
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
    if (action === "prompt-library") {
      void openPromptModal();
    }
    if (action === "timeline-toggle") {
      toggleTimelineVisibility();
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

const ensureMinimizedButton = () => {
  const existingButton = document.getElementById(MINIMIZED_ID);
  if (existingButton) {
    return existingButton;
  }

  if (!document.body) {
    return null;
  }

  const button = buildMinimizedButton();
  document.body.appendChild(button);
  applyMinimizedPosition(button);
  enableDrag(button);
  syncToolkitTheme();
  return button;
};

const minimizeToolbar = () => {
  const toolbar = document.getElementById(TOOLKIT_ID);
  const minimized = ensureMinimizedButton();
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

const applyFloatingButtonPosition = (button, left, top) => {
  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(top)}px`;
  button.style.right = "auto";
  button.style.bottom = "auto";
};

const clampFloatingButtonPosition = (left, top, width, height) => {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
};

const enableDrag = (button) => {
  const DRAG_THRESHOLD = 5; // 拖拽阈值：超过5px才判定为拖拽
  let isDragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let buttonWidth = 48;
  let buttonHeight = 48;

  const dragController = createRafDragController(({ left, top }) => {
    const nextPosition = clampFloatingButtonPosition(left, top, buttonWidth, buttonHeight);
    applyFloatingButtonPosition(button, nextPosition.left, nextPosition.top);
  });

  const onMouseMove = (event) => {
    if (!isDragging) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 只有超过阈值才判定为拖拽
    if (!moved) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance < DRAG_THRESHOLD) {
        return; // 未超过阈值，不算拖拽
      }
      moved = true; // 超过阈值，标记为拖拽
      button.classList.add("is-dragging");
      button.style.willChange = "left, top";
      document.documentElement.style.userSelect = "none";
    }

    dragController.schedule({
      left: startLeft + deltaX,
      top: startTop + deltaY,
    });
  };

  const onMouseUp = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    dragController.flush();
    button.classList.remove("is-dragging");
    button.style.willChange = "";
    document.documentElement.style.userSelect = "";

    // 只有实际拖动了才贴合边缘
    if (moved) {
      snapToEdge(button, true);
    }

    setTimeout(() => {
      moved = false;
    }, 0);
  };

  button.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    isDragging = true;
    moved = false;
    const rect = button.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    buttonWidth = rect.width || button.offsetWidth || 48;
    buttonHeight = rect.height || button.offsetHeight || 48;
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
  if (!document.body) {
    return;
  }
  observeThemeOnBodyIfNeeded();
  const toolbar = buildToolbar();
  document.body.appendChild(toolbar);
  updateTimelineToggleButton();
  ensureMinimizedButton();
  syncToolkitTheme();
};

// 标志位：避免重复添加 resize 监听器
