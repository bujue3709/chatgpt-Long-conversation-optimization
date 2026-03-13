/*
 * ChatGPT Conversation Toolkit - Prompt library
 */
// ============ Prompt 指令库 ============

const createPromptId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeCategory = (value) => toSafeText(value) || "未分类";

const getPromptStorageArea = () => getExtensionStorageArea();

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

  const fragment = document.createDocumentFragment();
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

    fragment.appendChild(itemNode);
  });
  listContainer.appendChild(fragment);
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
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
