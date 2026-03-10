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
  const THEME_ATTR = "data-toolkit-theme";
  const PROMPT_MODAL_ID = "chatgpt-toolkit-prompt-modal";
  const PROMPT_FILE_INPUT_ID = "chatgpt-toolkit-prompt-file";
  const PROMPT_TOAST_ID = "chatgpt-toolkit-prompt-toast";
  const PROMPT_STORAGE_KEY = "chatgpt-toolkit-prompts-v1";
  const PROMPT_LOCAL_FALLBACK_KEY = "chatgpt-toolkit-prompts-fallback";


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

  const promptState = {
    loaded: false,
    isOpen: false,
    items: [],
    filteredItems: [],
    selectedId: null,
    searchText: "",
    category: "all",
    sortBy: "updated-desc",
  };
  let promptToastTimer = null;
  let themeObserver = null;
  let themeMediaQuery = null;
  let bodyThemeObserved = false;

  const themeAttributeFilter = ["class", "data-theme", "style"];

  const parseRgbColor = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const matched = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
    if (!matched) {
      return null;
    }

    return [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  };

  const isDarkBackground = (element) => {
    if (!element) {
      return false;
    }

    const backgroundColor = window.getComputedStyle(element).backgroundColor;
    const rgb = parseRgbColor(backgroundColor);
    if (!rgb) {
      return false;
    }

    const [red, green, blue] = rgb;
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance < 0.5;
  };

  const detectChatGPTTheme = () => {
    const html = document.documentElement;
    const body = document.body;

    const explicitTheme = html?.getAttribute("data-theme") || body?.getAttribute("data-theme");
    if (explicitTheme === "dark" || explicitTheme === "light") {
      return explicitTheme;
    }

    if (html?.classList.contains("dark") || body?.classList.contains("dark")) {
      return "dark";
    }
    if (html?.classList.contains("light") || body?.classList.contains("light")) {
      return "light";
    }

    const colorScheme = (window.getComputedStyle(html).colorScheme || "").toLowerCase();
    if (colorScheme.includes("dark")) {
      return "dark";
    }
    if (colorScheme.includes("light")) {
      return "light";
    }

    if (isDarkBackground(body) || isDarkBackground(html)) {
      return "dark";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const applyToolkitTheme = (theme) => {
    const nodes = [
      document.getElementById(TOOLKIT_ID),
      document.getElementById(MINIMIZED_ID),
      document.getElementById(PROMPT_MODAL_ID),
    ];

    nodes.forEach((node) => {
      if (node) {
        node.setAttribute(THEME_ATTR, theme);
      }
    });
  };

  const syncToolkitTheme = () => {
    applyToolkitTheme(detectChatGPTTheme());
  };

  const observeThemeOnBodyIfNeeded = () => {
    if (!themeObserver || bodyThemeObserved || !document.body) {
      return;
    }
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: themeAttributeFilter,
    });
    bodyThemeObserved = true;
  };

  const setupThemeSync = () => {
    if (themeObserver) {
      observeThemeOnBodyIfNeeded();
      syncToolkitTheme();
      return;
    }

    themeObserver = new MutationObserver(() => {
      syncToolkitTheme();
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: themeAttributeFilter,
    });

    observeThemeOnBodyIfNeeded();

    themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof themeMediaQuery.addEventListener === "function") {
      themeMediaQuery.addEventListener("change", syncToolkitTheme);
    } else if (typeof themeMediaQuery.addListener === "function") {
      themeMediaQuery.addListener(syncToolkitTheme);
    }

    syncToolkitTheme();
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

  // ============ Prompt 指令库 ============

  const createPromptId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
  const normalizeCategory = (value) => toSafeText(value) || "未分类";

  const getPromptStorageArea = () =>
    typeof chrome !== "undefined" && chrome?.storage?.local ? chrome.storage.local : null;

  const buildPromptStoragePayload = (items) => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    prompts: items,
  });

  const normalizePromptItem = (raw) => {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const content = toSafeText(raw.content ?? raw.text);
    if (!content) {
      return null;
    }

    const singleLineContent = content.replace(/\s+/g, " ").trim();
    const title = toSafeText(raw.title) || singleLineContent.slice(0, 24) || "未命名指令";
    const category = normalizeCategory(raw.category);
    const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now();
    const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : createdAt;
    const id = toSafeText(raw.id) || createPromptId();

    return {
      id,
      title,
      category,
      content,
      createdAt,
      updatedAt,
    };
  };

  const extractPromptItems = (payload) => {
    const source = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.prompts)
        ? payload.prompts
        : [];

    return source
      .map((item) => normalizePromptItem(item))
      .filter(Boolean);
  };

  const readPromptPayloadFromLocal = () => {
    let raw = null;
    try {
      raw = localStorage.getItem(PROMPT_LOCAL_FALLBACK_KEY);
    } catch (error) {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const writePromptPayloadToLocal = (payload) => {
    try {
      localStorage.setItem(PROMPT_LOCAL_FALLBACK_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  };

  const readPromptPayload = async () => {
    const storage = getPromptStorageArea();
    if (storage) {
      return new Promise((resolve) => {
        storage.get([PROMPT_STORAGE_KEY], (result) => {
          if (chrome?.runtime?.lastError) {
            resolve(readPromptPayloadFromLocal());
            return;
          }
          const payload = result?.[PROMPT_STORAGE_KEY];
          if (payload !== undefined && payload !== null) {
            resolve(payload);
            return;
          }
          resolve(readPromptPayloadFromLocal());
        });
      });
    }

    return readPromptPayloadFromLocal();
  };

  const writePromptPayload = async (payload) => {
    const storage = getPromptStorageArea();
    if (storage) {
      const hasError = await new Promise((resolve) => {
        storage.set({ [PROMPT_STORAGE_KEY]: payload }, () => {
          resolve(Boolean(chrome?.runtime?.lastError));
        });
      });
      if (!hasError) {
        return;
      }
    }
    const saved = writePromptPayloadToLocal(payload);
    if (!saved) {
      console.warn("[ChatGPT Toolkit] Failed to persist prompt library.");
    }
  };

  const compareText = (left, right) => left.localeCompare(right, "zh-CN", { sensitivity: "base" });

  const applyPromptFilters = () => {
    const keyword = promptState.searchText.trim().toLowerCase();
    let result = [...promptState.items];

    if (keyword) {
      result = result.filter((item) =>
        `${item.title} ${item.category} ${item.content}`.toLowerCase().includes(keyword)
      );
    }

    if (promptState.category !== "all") {
      result = result.filter((item) => item.category === promptState.category);
    }

    if (promptState.sortBy === "updated-asc") {
      result.sort((a, b) => a.updatedAt - b.updatedAt);
    } else if (promptState.sortBy === "title-asc") {
      result.sort((a, b) => compareText(a.title, b.title));
    } else if (promptState.sortBy === "title-desc") {
      result.sort((a, b) => compareText(b.title, a.title));
    } else if (promptState.sortBy === "category-asc") {
      result.sort((a, b) => {
        const byCategory = compareText(a.category, b.category);
        if (byCategory !== 0) {
          return byCategory;
        }
        return b.updatedAt - a.updatedAt;
      });
    } else {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    promptState.filteredItems = result;
    if (!result.some((item) => item.id === promptState.selectedId)) {
      promptState.selectedId = result.length > 0 ? result[0].id : null;
    }
  };

  const savePromptItems = async (items) => {
    promptState.items = items;
    applyPromptFilters();
    await writePromptPayload(buildPromptStoragePayload(items));
  };

  const ensurePromptLibraryLoaded = async () => {
    if (promptState.loaded) {
      return;
    }

    const payload = await readPromptPayload();
    const items = extractPromptItems(payload);
    if (items.length === 0) {
      promptState.items = [];
      await writePromptPayload(buildPromptStoragePayload(promptState.items));
    } else {
      promptState.items = items;
    }

    promptState.loaded = true;
    applyPromptFilters();
  };

  const getPromptModalElements = () => {
    const modal = document.getElementById(PROMPT_MODAL_ID);
    if (!modal) {
      return null;
    }

    return {
      modal,
      toast: modal.querySelector(`#${PROMPT_TOAST_ID}`),
      searchInput: modal.querySelector("#chatgpt-toolkit-prompt-search"),
      categorySelect: modal.querySelector("#chatgpt-toolkit-prompt-category-filter"),
      sortSelect: modal.querySelector("#chatgpt-toolkit-prompt-sort"),
      listContainer: modal.querySelector("#chatgpt-toolkit-prompt-list"),
      emptyTip: modal.querySelector("#chatgpt-toolkit-prompt-empty"),
      countLabel: modal.querySelector("#chatgpt-toolkit-prompt-count"),
      addTitle: modal.querySelector("#chatgpt-toolkit-prompt-add-title"),
      addCategory: modal.querySelector("#chatgpt-toolkit-prompt-add-category"),
      addContent: modal.querySelector("#chatgpt-toolkit-prompt-add-content"),
      fileInput: modal.querySelector(`#${PROMPT_FILE_INPUT_ID}`),
    };
  };

  const hidePromptToast = () => {
    const elements = getPromptModalElements();
    const toast = elements?.toast;
    if (!(toast instanceof HTMLElement)) {
      return;
    }
    toast.classList.remove("is-visible");
    toast.textContent = "";
  };

  const showPromptToast = (message, tone = "success") => {
    const elements = getPromptModalElements();
    const toast = elements?.toast;
    if (!(toast instanceof HTMLElement)) {
      return;
    }

    if (promptToastTimer) {
      clearTimeout(promptToastTimer);
    }

    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add("is-visible");

    promptToastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      promptToastTimer = null;
    }, 1600);
  };

  const renderPromptCategoryOptions = (categorySelect) => {
    if (!(categorySelect instanceof HTMLSelectElement)) {
      return;
    }

    const categories = Array.from(new Set(promptState.items.map((item) => item.category)))
      .filter(Boolean)
      .sort((a, b) => compareText(a, b));

    categorySelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "全部分类";
    categorySelect.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    if (promptState.category !== "all" && !categories.includes(promptState.category)) {
      promptState.category = "all";
      applyPromptFilters();
    }

    categorySelect.value = promptState.category;
  };

  const formatPromptTime = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderPromptList = () => {
    const elements = getPromptModalElements();
    if (!elements) {
      return;
    }

    const {
      searchInput,
      categorySelect,
      sortSelect,
      listContainer,
      emptyTip,
      countLabel,
    } = elements;

    if (
      !(searchInput instanceof HTMLInputElement) ||
      !(categorySelect instanceof HTMLSelectElement) ||
      !(sortSelect instanceof HTMLSelectElement) ||
      !(listContainer instanceof HTMLElement) ||
      !(emptyTip instanceof HTMLElement) ||
      !(countLabel instanceof HTMLElement)
    ) {
      return;
    }

    searchInput.value = promptState.searchText;
    sortSelect.value = promptState.sortBy;
    renderPromptCategoryOptions(categorySelect);

    listContainer.innerHTML = "";

    if (promptState.filteredItems.length === 0) {
      emptyTip.style.display = "block";
      countLabel.textContent = `0 / ${promptState.items.length} 条`;
      return;
    }

    emptyTip.style.display = "none";
    countLabel.textContent = `${promptState.filteredItems.length} / ${promptState.items.length} 条`;

    promptState.filteredItems.forEach((item) => {
      const itemNode = document.createElement("article");
      itemNode.className = "chatgpt-toolkit-prompt-item";
      if (item.id === promptState.selectedId) {
        itemNode.classList.add("is-selected");
      }
      itemNode.dataset.promptId = item.id;

      const header = document.createElement("div");
      header.className = "chatgpt-toolkit-prompt-item-header";

      const title = document.createElement("h4");
      title.className = "chatgpt-toolkit-prompt-item-title";
      title.textContent = item.title;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "chatgpt-toolkit-prompt-delete";
      deleteBtn.dataset.promptAction = "delete";
      deleteBtn.dataset.promptId = item.id;
      deleteBtn.textContent = "删除";

      header.appendChild(title);
      header.appendChild(deleteBtn);

      const meta = document.createElement("p");
      meta.className = "chatgpt-toolkit-prompt-item-meta";
      const timestamp = formatPromptTime(item.updatedAt);
      meta.textContent = `${item.category} · ${timestamp} · 单击复制`;

      const content = document.createElement("p");
      content.className = "chatgpt-toolkit-prompt-item-content";
      content.textContent = item.content;

      itemNode.appendChild(header);
      itemNode.appendChild(meta);
      itemNode.appendChild(content);

      listContainer.appendChild(itemNode);
    });
  };

  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fallback below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    textarea.remove();
    return copied;
  };

  const copyPromptById = async (promptId) => {
    const item = promptState.items.find((prompt) => prompt.id === promptId);
    if (!item) {
      updateStatus("复制失败：未找到对应 Prompt。", "info");
      showPromptToast("复制失败", "error");
      return;
    }

    promptState.selectedId = item.id;
    renderPromptList();

    const copied = await copyTextToClipboard(item.content);
    if (copied) {
      updateStatus(`已复制 Prompt：${item.title}`, "success");
      showPromptToast("复制成功", "success");
      return;
    }
    updateStatus("复制失败：浏览器不允许访问剪贴板。", "info");
    showPromptToast("复制失败", "error");
  };

  const addPromptFromModal = async () => {
    const elements = getPromptModalElements();
    if (!elements) {
      return;
    }

    const { addTitle, addCategory, addContent } = elements;
    if (
      !(addTitle instanceof HTMLInputElement) ||
      !(addCategory instanceof HTMLInputElement) ||
      !(addContent instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    const content = toSafeText(addContent.value);
    if (!content) {
      updateStatus("新增失败：Prompt 内容不能为空。", "info");
      return;
    }

    const timestamp = Date.now();
    const title = toSafeText(addTitle.value) || content.replace(/\s+/g, " ").slice(0, 24) || "未命名指令";
    const category = normalizeCategory(addCategory.value);
    const newItem = {
      id: createPromptId(),
      title,
      category,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const nextItems = [newItem, ...promptState.items];
    await savePromptItems(nextItems);
    promptState.selectedId = newItem.id;
    renderPromptList();

    addTitle.value = "";
    addCategory.value = "";
    addContent.value = "";

    updateStatus("已新增 Prompt 指令。", "success");
  };

  const deletePromptById = async (promptId) => {
    const item = promptState.items.find((prompt) => prompt.id === promptId);
    if (!item) {
      return;
    }

    if (!window.confirm(`确认删除 Prompt「${item.title}」吗？`)) {
      return;
    }

    const nextItems = promptState.items.filter((prompt) => prompt.id !== promptId);
    await savePromptItems(nextItems);
    renderPromptList();
    updateStatus("已删除 Prompt 指令。", "success");
  };

  const exportPromptLibrary = () => {
    const payload = buildPromptStoragePayload(promptState.items);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `chatgpt-prompts-${dateTag}.json`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    updateStatus("Prompt 指令已导出为 JSON。", "success");
  };

  const mergeImportedPromptItems = (incomingItems) => {
    const existingSignature = new Set(
      promptState.items.map((item) =>
        `${item.title}\n${item.category}\n${item.content}`.toLowerCase()
      )
    );

    const merged = [...promptState.items];
    let addedCount = 0;

    incomingItems.forEach((item) => {
      const signature = `${item.title}\n${item.category}\n${item.content}`.toLowerCase();
      if (existingSignature.has(signature)) {
        return;
      }
      existingSignature.add(signature);
      merged.unshift({
        ...item,
        id: createPromptId(),
        updatedAt: Date.now(),
      });
      addedCount += 1;
    });

    return { merged, addedCount };
  };

  const importPromptLibrary = async (fileInput) => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files || fileInput.files.length === 0) {
      return;
    }

    const file = fileInput.files[0];
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const incomingItems = extractPromptItems(parsed);
      if (incomingItems.length === 0) {
        updateStatus("导入失败：JSON 文件中没有可用 Prompt。", "info");
        return;
      }

      const { merged, addedCount } = mergeImportedPromptItems(incomingItems);
      if (addedCount === 0) {
        updateStatus("导入完成：没有新增内容。", "info");
        return;
      }

      await savePromptItems(merged);
      renderPromptList();
      updateStatus(`导入完成：新增 ${addedCount} 条 Prompt。`, "success");
    } catch (error) {
      updateStatus("导入失败：请检查 JSON 格式。", "info");
    } finally {
      fileInput.value = "";
    }
  };

  const closePromptModal = () => {
    const modal = document.getElementById(PROMPT_MODAL_ID);
    if (!modal) {
      return;
    }
    if (promptToastTimer) {
      clearTimeout(promptToastTimer);
      promptToastTimer = null;
    }
    hidePromptToast();
    modal.classList.remove("is-visible");
    promptState.isOpen = false;
  };

  const handlePromptModalClick = async (event) => {
    const target = event.target;
    const actionTarget =
      target instanceof Element
        ? target.closest("[data-prompt-action]")
        : target instanceof Node && target.parentElement
          ? target.parentElement.closest("[data-prompt-action]")
          : null;

    if (actionTarget instanceof HTMLElement) {
      const action = actionTarget.dataset.promptAction;
      if (action === "close") {
        closePromptModal();
        return;
      }
      if (action === "add") {
        await addPromptFromModal();
        return;
      }
      if (action === "export") {
        exportPromptLibrary();
        return;
      }
      if (action === "import") {
        const elements = getPromptModalElements();
        const fileInput = elements?.fileInput;
        if (fileInput instanceof HTMLInputElement) {
          fileInput.click();
        }
        return;
      }
      if (action === "delete") {
        const promptId = actionTarget.dataset.promptId;
        if (promptId) {
          await deletePromptById(promptId);
        }
        return;
      }
    }

    const promptNode =
      target instanceof Element
        ? target.closest("[data-prompt-id]")
        : target instanceof Node && target.parentElement
          ? target.parentElement.closest("[data-prompt-id]")
          : null;

    if (!(promptNode instanceof HTMLElement)) {
      return;
    }

    const promptId = promptNode.dataset.promptId;
    if (promptId) {
      await copyPromptById(promptId);
    }
  };

  const ensurePromptModal = () => {
    const existingModal = document.getElementById(PROMPT_MODAL_ID);
    if (existingModal) {
      return existingModal;
    }

    if (!document.body) {
      return null;
    }

    const modal = document.createElement("section");
    modal.id = PROMPT_MODAL_ID;
    modal.className = "chatgpt-toolkit-prompt-modal";
    modal.innerHTML = `
      <div class="chatgpt-toolkit-prompt-backdrop" data-prompt-action="close"></div>
      <div class="chatgpt-toolkit-prompt-panel" role="dialog" aria-modal="true" aria-label="Prompt 指令列表">
        <div class="chatgpt-toolkit-prompt-header">
          <strong>Prompt 指令列表</strong>
          <button type="button" class="chatgpt-toolkit-prompt-close" data-prompt-action="close">关闭</button>
        </div>
        <div id="${PROMPT_TOAST_ID}" class="chatgpt-toolkit-prompt-toast" aria-live="polite"></div>
        <div class="chatgpt-toolkit-prompt-filters">
          <input id="chatgpt-toolkit-prompt-search" type="text" placeholder="搜索标题/内容/分类" />
          <select id="chatgpt-toolkit-prompt-category-filter">
            <option value="all">全部分类</option>
          </select>
          <select id="chatgpt-toolkit-prompt-sort">
            <option value="updated-desc">最近更新</option>
            <option value="updated-asc">最早更新</option>
            <option value="title-asc">标题 A-Z</option>
            <option value="title-desc">标题 Z-A</option>
            <option value="category-asc">分类排序</option>
          </select>
        </div>
        <div id="chatgpt-toolkit-prompt-list" class="chatgpt-toolkit-prompt-list"></div>
        <p id="chatgpt-toolkit-prompt-empty" class="chatgpt-toolkit-prompt-empty">暂无可用 Prompt。</p>
        <div class="chatgpt-toolkit-prompt-editor">
          <input id="chatgpt-toolkit-prompt-add-title" type="text" placeholder="标题（可选）" />
          <input id="chatgpt-toolkit-prompt-add-category" type="text" placeholder="分类（可选）" />
          <textarea id="chatgpt-toolkit-prompt-add-content" rows="4" placeholder="输入 Prompt 内容"></textarea>
          <button type="button" class="chatgpt-toolkit-prompt-add" data-prompt-action="add">添加 Prompt</button>
        </div>
        <div class="chatgpt-toolkit-prompt-footer">
          <span id="chatgpt-toolkit-prompt-count">0 / 0 条</span>
          <div class="chatgpt-toolkit-prompt-footer-actions">
            <button type="button" data-prompt-action="import">导入 JSON</button>
            <button type="button" data-prompt-action="export">导出 JSON</button>
          </div>
        </div>
        <input id="${PROMPT_FILE_INPUT_ID}" type="file" accept=".json,application/json" />
      </div>
    `;

    document.body.appendChild(modal);
    syncToolkitTheme();

    modal.addEventListener("click", (event) => {
      void handlePromptModalClick(event);
    });

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePromptModal();
      }

      const target = event.target;
      const isSingleLineInput =
        target instanceof HTMLInputElement &&
        (target.id === "chatgpt-toolkit-prompt-add-title" || target.id === "chatgpt-toolkit-prompt-add-category");
      const isTextarea = target instanceof HTMLTextAreaElement && target.id === "chatgpt-toolkit-prompt-add-content";
      const isSubmitInTextarea = isTextarea && (event.ctrlKey || event.metaKey) && event.key === "Enter";

      if (isSingleLineInput && event.key === "Enter") {
        event.preventDefault();
        void addPromptFromModal();
      }

      if (isSubmitInTextarea) {
        event.preventDefault();
        void addPromptFromModal();
      }
    });

    const elements = getPromptModalElements();
    if (elements?.searchInput instanceof HTMLInputElement) {
      elements.searchInput.addEventListener("input", () => {
        promptState.searchText = elements.searchInput.value;
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.categorySelect instanceof HTMLSelectElement) {
      elements.categorySelect.addEventListener("change", () => {
        promptState.category = elements.categorySelect.value || "all";
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.sortSelect instanceof HTMLSelectElement) {
      elements.sortSelect.addEventListener("change", () => {
        promptState.sortBy = elements.sortSelect.value || "updated-desc";
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.fileInput instanceof HTMLInputElement) {
      elements.fileInput.addEventListener("change", () => {
        void importPromptLibrary(elements.fileInput);
      });
    }

    return modal;
  };

  const openPromptModal = async () => {
    const modal = ensurePromptModal();
    if (!modal) {
      return;
    }

    await ensurePromptLibraryLoaded();
    syncToolkitTheme();
    applyPromptFilters();
    renderPromptList();

    promptState.isOpen = true;
    modal.classList.add("is-visible");
    hidePromptToast();
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

  const enableDrag = (button) => {
    const DRAG_THRESHOLD = 5; // 拖拽阈值：超过5px才判定为拖拽
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

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      // 只有超过阈值才判定为拖拽
      if (!moved) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < DRAG_THRESHOLD) {
          return; // 未超过阈值，不算拖拽
        }
        moved = true; // 超过阈值，标记为拖拽
      }

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
    if (!document.body) {
      return;
    }
    observeThemeOnBodyIfNeeded();
    const toolbar = buildToolbar();
    document.body.appendChild(toolbar);
    ensureMinimizedButton();
    syncToolkitTheme();
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

  setupThemeSync();
  attachToolbar();
  setupResizeListener();

  const observer = new MutationObserver(() => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimizedButton = document.getElementById(MINIMIZED_ID);
    const promptModal = document.getElementById(PROMPT_MODAL_ID);

    if (!toolbar) {
      attachToolbar();
      observeThemeOnBodyIfNeeded();
      syncToolkitTheme();
      return;
    }

    if (!minimizedButton) {
      ensureMinimizedButton();
    }

    if (promptState.isOpen && !promptModal) {
      const restoredModal = ensurePromptModal();
      if (restoredModal) {
        restoredModal.classList.add("is-visible");
        renderPromptList();
      }
    }

    observeThemeOnBodyIfNeeded();
    syncToolkitTheme();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
