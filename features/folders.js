/*
 * ChatGPT Conversation Toolkit - Conversation folders
 */
const FOLDER_ITEM_ATTR = "data-toolkit-folder-id";
const FOLDER_COLLAPSED_ATTR = "data-toolkit-folder-collapsed";
const FOLDER_HIGHLIGHT_ATTR = "data-toolkit-folder-highlight";
const FOLDER_THEME_TARGET_ATTR = "data-toolkit-theme-target";
const FOLDER_DROPZONE_ATTR = "data-toolkit-folder-dropzone";
const FOLDER_BOUND_ATTR = "data-toolkit-folder-bound";
const FOLDER_MANAGER_BOUND_ATTR = "data-toolkit-folder-manager-bound";
const FOLDER_HEADER_CLASS = "chatgpt-toolkit-folder-header";
const FOLDER_EMPTY_CLASS = "chatgpt-toolkit-folder-empty";
const FOLDER_DRAGGING_ATTR = "data-toolkit-folder-dragging";
const FOLDER_HEADING_TEXTS = ["你的聊天", "Chats", "Your chats"];

const getSafeEventTarget = (event) => (event?.target instanceof Element ? event.target : null);

const withFolderRenderLock = (callback) => {
  const previousValue = Boolean(window.__toolkitIsRendering);
  window.__toolkitIsRendering = true;
  try {
    callback();
  } finally {
    window.__toolkitIsRendering = previousValue;
  }
};

const createFolderId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeFolderName = (value, fallbackIndex = 1) => {
  const nextName = typeof value === "string" ? value.trim() : "";
  return nextName || `新文件夹 ${fallbackIndex}`;
};

const getSortedFolders = () =>
  [...folderState.folders].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.createdAt - right.createdAt;
  });

const normalizeFolderSnapshot = (snapshot) => {
  const rawFolders = Array.isArray(snapshot?.folders) ? snapshot.folders : [];
  const folders = rawFolders
    .map((folder, index) => {
      if (!folder || typeof folder !== "object") {
        return null;
      }

      const id = typeof folder.id === "string" ? folder.id.trim() : "";
      if (!id) {
        return null;
      }

      const orderValue = Number(folder.order);
      const createdAtValue = Number(folder.createdAt);

      return {
        id,
        name: normalizeFolderName(folder.name, index + 1),
        collapsed: Boolean(folder.collapsed),
        order: Number.isFinite(orderValue) ? orderValue : index,
        createdAt: Number.isFinite(createdAtValue) ? createdAtValue : Date.now() + index,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.createdAt - right.createdAt;
    });

  folders.forEach((folder, index) => {
    folder.order = index;
  });

  const validFolderIds = new Set(folders.map((folder) => folder.id));
  const rawAssignments = snapshot?.assignments && typeof snapshot.assignments === "object" ? snapshot.assignments : {};
  const assignments = {};

  Object.entries(rawAssignments).forEach(([conversationId, folderId]) => {
    if (
      typeof conversationId === "string" &&
      conversationId &&
      typeof folderId === "string" &&
      validFolderIds.has(folderId)
    ) {
      assignments[conversationId] = folderId;
    }
  });

  return {
    version: 1,
    folders,
    assignments,
  };
};

const buildFolderSnapshot = () => {
  const folderIds = new Set(folderState.folders.map((folder) => folder.id));
  const assignments = {};

  Object.entries(folderState.assignments).forEach(([conversationId, folderId]) => {
    if (typeof conversationId === "string" && conversationId && folderIds.has(folderId)) {
      assignments[conversationId] = folderId;
    }
  });

  return {
    version: 1,
    folders: getSortedFolders().map((folder, index) => ({
      id: folder.id,
      name: folder.name,
      collapsed: folder.collapsed,
      order: index,
      createdAt: folder.createdAt,
    })),
    assignments,
  };
};

const setFolderSnapshot = (snapshot) => {
  const normalized = normalizeFolderSnapshot(snapshot);
  folderState.folders = normalized.folders;
  folderState.assignments = normalized.assignments;
  folderState.loaded = true;
  return normalized;
};

const persistFolderState = () => {
  if (!folderState.loaded) {
    return;
  }
  saveFolderSnapshot(buildFolderSnapshot());
};

const hydrateFolders = () => {
  if (folderState.loaded) {
    return;
  }
  setFolderSnapshot(loadFolderSnapshot());
};

const hydrateFoldersFromExtension = async () => {
  const extensionSnapshot = await loadFolderSnapshotFromExtension();
  if (!extensionSnapshot) {
    return;
  }

  const currentSerialized = JSON.stringify(buildFolderSnapshot());
  const nextNormalized = normalizeFolderSnapshot(extensionSnapshot);
  const nextSerialized = JSON.stringify(nextNormalized);

  if (currentSerialized === nextSerialized) {
    return;
  }

  setFolderSnapshot(nextNormalized);
  persistFolderState();
  scheduleFolderRefresh();
};

const findChatHistorySection = () => {
  const history = document.querySelector('nav[aria-label] #history');
  if (!(history instanceof HTMLElement)) {
    return null;
  }

  const section = history.closest(".group\\/sidebar-expando-section");
  const fallbackHeaderButton =
    history.previousElementSibling instanceof HTMLElement ? history.previousElementSibling : null;

  if (!(section instanceof HTMLElement)) {
    if (!(fallbackHeaderButton instanceof HTMLElement)) {
      return null;
    }

    return {
      history,
      section: history.parentElement instanceof HTMLElement ? history.parentElement : history,
      headerButton: fallbackHeaderButton,
    };
  }

  const headerButton =
    Array.from(section.querySelectorAll("button")).find((button) => {
      const label = button.querySelector("h2.__menu-label")?.textContent?.trim();
      if (!label) {
        return false;
      }
      return FOLDER_HEADING_TEXTS.includes(label) || label.toLowerCase().includes("chat");
    }) || fallbackHeaderButton;

  if (!(headerButton instanceof HTMLElement)) {
    return null;
  }

  return {
    history,
    section,
    headerButton,
  };
};

const getConversationItems = (history) =>
  Array.from(history.children).filter(
    (child) =>
      child instanceof HTMLAnchorElement &&
      child.matches('[data-sidebar-item="true"][href*="/c/"]'),
  );

const getConversationItemFromTarget = (target) => {
  if (!(target instanceof Element) || !(folderState.history instanceof HTMLElement)) {
    return null;
  }

  const item = target.closest('a[data-sidebar-item="true"][href*="/c/"]');
  if (!(item instanceof HTMLAnchorElement) || item.parentElement !== folderState.history) {
    return null;
  }

  return item;
};

const getConversationIdFromItem = (item) => {
  if (!(item instanceof HTMLElement)) {
    return "";
  }

  const href = item.getAttribute("href") || "";
  const matched = href.match(/\/c\/([^/?#]+)/);
  if (matched?.[1]) {
    return matched[1];
  }

  const optionsTrigger = item.querySelector("[data-conversation-options-trigger]");
  return optionsTrigger?.getAttribute("data-conversation-options-trigger") || "";
};

const getVisibleRect = (node) => {
  if (!(node instanceof HTMLElement)) {
    return null;
  }

  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return rect;
};

const isPointInsideRect = (clientX, clientY, rect, padding = 0) => {
  if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }

  return (
    clientX >= rect.left - padding &&
    clientX <= rect.right + padding &&
    clientY >= rect.top - padding &&
    clientY <= rect.bottom + padding
  );
};

const getFolderById = (folderId) =>
  folderState.folders.find((folder) => folder.id === folderId) || null;

const getNextFolderName = () => `新文件夹 ${folderState.folders.length + 1}`;

const closeFolderMenu = () => {
  const menu = document.getElementById(FOLDER_MENU_ID);
  if (!(menu instanceof HTMLElement)) {
    folderState.menuFolderId = null;
    return;
  }

  folderState.menuFolderId = null;
  menu.classList.remove("is-visible");
  menu.style.left = "";
  menu.style.top = "";
};

const ensureFolderMenu = () => {
  let menu = document.getElementById(FOLDER_MENU_ID);
  if (menu instanceof HTMLElement) {
    return menu;
  }

  menu = document.createElement("div");
  menu.id = FOLDER_MENU_ID;
  menu.className = "chatgpt-toolkit-folder-menu";
  menu.setAttribute(FOLDER_THEME_TARGET_ATTR, "folders");
  menu.innerHTML = `
    <button type="button" data-folder-menu-action="rename">重命名</button>
    <button type="button" data-folder-menu-action="delete">删除</button>
  `;
  menu.addEventListener("click", (event) => {
    const target = getSafeEventTarget(event);
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest("[data-folder-menu-action]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const folderId = folderState.menuFolderId;
    closeFolderMenu();

    if (!folderId) {
      return;
    }

    if (actionButton.dataset.folderMenuAction === "rename") {
      renameFolder(folderId);
      return;
    }

    if (actionButton.dataset.folderMenuAction === "delete") {
      deleteFolder(folderId);
    }
  });
  document.body.appendChild(menu);
  return menu;
};

const openFolderMenu = (folderId, trigger) => {
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  const folder = getFolderById(folderId);
  if (!folder) {
    closeFolderMenu();
    return;
  }

  const menu = ensureFolderMenu();
  if (folderState.menuFolderId === folderId && menu.classList.contains("is-visible")) {
    closeFolderMenu();
    return;
  }

  folderState.menuFolderId = folderId;
  menu.classList.add("is-visible");
  syncToolkitTheme();

  const triggerRect = trigger.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;

  let left = triggerRect.right - menuWidth;
  if (left < 8) {
    left = 8;
  }
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8);
  }

  let top = triggerRect.bottom + 6;
  if (top + menuHeight > window.innerHeight - 8) {
    top = Math.max(8, triggerRect.top - menuHeight - 6);
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
};

const clearDropZoneHighlight = () => {
  if (!(folderState.history instanceof HTMLElement)) {
    folderState.currentDropZoneKey = "";
    return;
  }

  folderState.currentDropZoneKey = "";

  const manager = document.getElementById(FOLDER_MANAGER_ID);
  manager
    ?.querySelectorAll(".is-drop-target")
    .forEach((node) => node.classList.remove("is-drop-target"));

  folderState.history
    .querySelectorAll(".is-drop-target")
    .forEach((node) => node.classList.remove("is-drop-target"));
};

const setDropZoneHighlight = (element, key) => {
  if (!(element instanceof HTMLElement)) {
    clearDropZoneHighlight();
    return;
  }

  if (folderState.currentDropZoneKey === key && element.classList.contains("is-drop-target")) {
    return;
  }

  clearDropZoneHighlight();
  folderState.currentDropZoneKey = key;
  element.classList.add("is-drop-target");
};

const clearFolderDragState = () => {
  folderState.draggingConversationId = null;
  document.documentElement.removeAttribute(FOLDER_DRAGGING_ATTR);
  clearDropZoneHighlight();

  if (folderState.refreshPending) {
    folderState.refreshPending = false;
    scheduleFolderRefresh();
  }
};

const flashUngroupedConversations = (items) => {
  if (folderHighlightTimer) {
    clearTimeout(folderHighlightTimer);
    folderHighlightTimer = null;
  }

  items.forEach((item) => item.setAttribute(FOLDER_HIGHLIGHT_ATTR, "1"));
  folderHighlightTimer = setTimeout(() => {
    items.forEach((item) => item.removeAttribute(FOLDER_HIGHLIGHT_ATTR));
    folderHighlightTimer = null;
  }, 1200);
};

const focusUngroupedConversations = () => {
  if (!(folderState.history instanceof HTMLElement)) {
    return;
  }

  const ungroupedItems = getConversationItems(folderState.history).filter((item) => {
    const conversationId = getConversationIdFromItem(item);
    return !conversationId || !folderState.assignments[conversationId];
  });

  if (ungroupedItems.length === 0) {
    return;
  }

  flashUngroupedConversations(ungroupedItems);
  ungroupedItems[0].scrollIntoView({ block: "nearest" });
};

const scheduleSettledFolderRefresh = () => {
  if (folderSettledRefreshTimer) {
    clearTimeout(folderSettledRefreshTimer);
    folderSettledRefreshTimer = null;
  }

  requestAnimationFrame(() => {
    scheduleFolderRefresh();
  });

  folderSettledRefreshTimer = setTimeout(() => {
    folderSettledRefreshTimer = null;
    renderFolders();
  }, 96);
};

const createFolder = () => {
  const inputName = window.prompt("输入文件夹名称", getNextFolderName());
  if (inputName === null) {
    return;
  }

  const name = inputName.trim();
  if (!name) {
    return;
  }

  const folders = getSortedFolders();
  folderState.folders = [
    ...folders,
    {
      id: createFolderId(),
      name,
      collapsed: false,
      order: folders.length,
      createdAt: Date.now(),
    },
  ];
  persistFolderState();
  scheduleFolderRefresh();
};

const renameFolder = (folderId) => {
  const folder = getFolderById(folderId);
  if (!folder) {
    return;
  }

  const inputName = window.prompt("重命名文件夹", folder.name);
  if (inputName === null) {
    return;
  }

  const nextName = inputName.trim();
  if (!nextName || nextName === folder.name) {
    return;
  }

  folder.name = nextName;
  persistFolderState();
  scheduleFolderRefresh();
};

const deleteFolder = (folderId) => {
  const folder = getFolderById(folderId);
  if (!folder) {
    return;
  }

  const confirmed = window.confirm(`删除文件夹“${folder.name}”？其中会话会回到未分组。`);
  if (!confirmed) {
    return;
  }

  folderState.folders = getSortedFolders()
    .filter((item) => item.id !== folderId)
    .map((item, index) => ({
      ...item,
      order: index,
    }));

  Object.keys(folderState.assignments).forEach((conversationId) => {
    if (folderState.assignments[conversationId] === folderId) {
      delete folderState.assignments[conversationId];
    }
  });

  closeFolderMenu();
  persistFolderState();
  scheduleFolderRefresh();
};

const toggleFolder = (folderId) => {
  const folder = getFolderById(folderId);
  if (!folder) {
    return;
  }

  folder.collapsed = !folder.collapsed;
  persistFolderState();
  scheduleFolderRefresh();
};

const assignConversationToFolder = (conversationId, folderId) => {
  if (!conversationId || !getFolderById(folderId)) {
    return;
  }

  if (folderState.assignments[conversationId] === folderId) {
    return;
  }

  folderState.assignments[conversationId] = folderId;
  persistFolderState();
  scheduleFolderRefresh();
  scheduleSettledFolderRefresh();
};

const unassignConversation = (conversationId) => {
  if (!conversationId || !folderState.assignments[conversationId]) {
    return;
  }

  delete folderState.assignments[conversationId];
  persistFolderState();
  scheduleFolderRefresh();
  scheduleSettledFolderRefresh();
};

const clearHistoryPresentation = (history) => {
  if (!(history instanceof HTMLElement)) {
    return;
  }

  history.removeAttribute(FOLDER_ROOT_ATTR);
  history.removeAttribute(FOLDER_THEME_TARGET_ATTR);
  history.removeAttribute(THEME_ATTR);

  Array.from(history.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) {
      return;
    }

    if (child.classList.contains(FOLDER_HEADER_CLASS) || child.classList.contains(FOLDER_EMPTY_CLASS)) {
      child.remove();
      return;
    }

    child.style.order = "";
    child.removeAttribute(FOLDER_ITEM_ATTR);
    child.removeAttribute(FOLDER_COLLAPSED_ATTR);
    child.removeAttribute(FOLDER_HIGHLIGHT_ATTR);
  });
};

const cleanupFolderUi = () => {
  clearHistoryPresentation(folderState.history);

  const manager = document.getElementById(FOLDER_MANAGER_ID);
  if (manager) {
    manager.remove();
  }

  const menu = document.getElementById(FOLDER_MENU_ID);
  if (menu) {
    menu.remove();
  }

  folderState.section = null;
  folderState.headerButton = null;
  folderState.history = null;
  folderState.menuFolderId = null;
  folderState.currentDropZoneKey = "";
};

const ensureFolderManager = (section, headerButton) => {
  let manager = document.getElementById(FOLDER_MANAGER_ID);
  if (!(manager instanceof HTMLElement)) {
    manager = document.createElement("div");
    manager.id = FOLDER_MANAGER_ID;
    manager.className = "chatgpt-toolkit-folder-manager";
    manager.setAttribute(FOLDER_THEME_TARGET_ATTR, "folders");
    manager.innerHTML = `
      <div class="chatgpt-toolkit-folder-manager-label">文件夹</div>
      <div class="chatgpt-toolkit-folder-manager-actions">
        <button type="button" class="chatgpt-toolkit-folder-pill" data-folder-action="show-ungrouped">
          <span>未分组</span>
          <span class="chatgpt-toolkit-folder-pill-count">0</span>
        </button>
        <button type="button" class="chatgpt-toolkit-folder-pill is-primary" data-folder-action="create">
          新建
        </button>
      </div>
    `;
  }

  if (!manager.hasAttribute(FOLDER_MANAGER_BOUND_ATTR)) {
    manager.addEventListener("click", (event) => {
      const target = getSafeEventTarget(event);
      if (!(target instanceof Element)) {
        return;
      }

      const actionButton = target.closest("[data-folder-action]");
      if (!(actionButton instanceof HTMLButtonElement)) {
        return;
      }

      if (actionButton.dataset.folderAction === "create") {
        createFolder();
        return;
      }

      if (actionButton.dataset.folderAction === "show-ungrouped") {
        focusUngroupedConversations();
      }
    });
    manager.setAttribute(FOLDER_MANAGER_BOUND_ATTR, "1");
  }

  if (manager.parentElement !== section || manager.nextElementSibling !== headerButton) {
    section.insertBefore(manager, headerButton);
  }

  return manager;
};

const getDropZoneFromTarget = (target) => {
  if (!(target instanceof Element)) {
    return null;
  }

  const manager = document.getElementById(FOLDER_MANAGER_ID);
  const ungroupedButton = target.closest('[data-folder-action="show-ungrouped"]');
  if (
    ungroupedButton instanceof HTMLButtonElement &&
    manager instanceof HTMLElement &&
    manager.contains(ungroupedButton)
  ) {
    return {
      type: "ungrouped",
      key: "ungrouped",
      element: ungroupedButton,
    };
  }

  const dropZone = target.closest(`[${FOLDER_DROPZONE_ATTR}="folder"]`);
  if (!(dropZone instanceof HTMLElement) || dropZone.parentElement !== folderState.history) {
    const folderConversationItem = target.closest(`a[${FOLDER_ITEM_ATTR}]`);
    if (
      folderConversationItem instanceof HTMLAnchorElement &&
      folderConversationItem.parentElement === folderState.history
    ) {
      const folderIdFromItem = folderConversationItem.getAttribute(FOLDER_ITEM_ATTR) || "";
      if (!folderIdFromItem) {
        return null;
      }

      return {
        type: "folder",
        key: `folder:${folderIdFromItem}`,
        folderId: folderIdFromItem,
        element: folderConversationItem,
      };
    }

    return null;
  }

  const folderId = dropZone.dataset.folderId || "";
  if (!folderId) {
    return null;
  }

  return {
    type: "folder",
    key: `folder:${folderId}`,
    folderId,
    element: dropZone,
  };
};

const getDropZoneFromManagedArea = (clientX, clientY) => {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const manager = document.getElementById(FOLDER_MANAGER_ID);
  const ungroupedButton =
    manager?.querySelector?.('[data-folder-action="show-ungrouped"]') instanceof HTMLButtonElement
      ? manager.querySelector('[data-folder-action="show-ungrouped"]')
      : null;
  const ungroupedButtonRect = getVisibleRect(ungroupedButton);

  if (ungroupedButtonRect && isPointInsideRect(clientX, clientY, ungroupedButtonRect, 10)) {
    return {
      type: "ungrouped",
      key: "ungrouped",
      element: ungroupedButton,
      indirect: true,
      allowHighlight: true,
    };
  }

  if (!(folderState.history instanceof HTMLElement)) {
    return null;
  }

  const historyRect = folderState.history.getBoundingClientRect();
  if (
    clientX < historyRect.left ||
    clientX > historyRect.right ||
    clientY < historyRect.top ||
    clientY > historyRect.bottom
  ) {
    return null;
  }

  const historyChildren = Array.from(folderState.history.children).filter(
    (child) => child instanceof HTMLElement,
  );
  const sortedFolders = getSortedFolders();
  const firstUngroupedItem = historyChildren.find(
    (child) => child instanceof HTMLAnchorElement && !child.hasAttribute(FOLDER_ITEM_ATTR),
  );
  const firstUngroupedRect = getVisibleRect(firstUngroupedItem);
  const fallbackBottomBoundary = firstUngroupedRect ? firstUngroupedRect.top : historyRect.bottom;

  const folderZones = sortedFolders
    .map((folder, index) => {
      const header = historyChildren.find(
        (child) =>
          child.classList.contains(FOLDER_HEADER_CLASS) &&
          child.dataset.folderId === folder.id,
      );
      if (!(header instanceof HTMLElement)) {
        return null;
      }

      const segmentNodes = historyChildren.filter((child) => {
        if (!(child instanceof HTMLElement)) {
          return false;
        }

        if (child === header) {
          return true;
        }

        if (child.classList.contains(FOLDER_EMPTY_CLASS) && child.dataset.folderId === folder.id) {
          return true;
        }

        if (
          child instanceof HTMLAnchorElement &&
          child.getAttribute(FOLDER_ITEM_ATTR) === folder.id &&
          !child.hasAttribute(FOLDER_COLLAPSED_ATTR)
        ) {
          return true;
        }

        return false;
      });

      const segmentRects = segmentNodes.map((node) => getVisibleRect(node)).filter(Boolean);
      if (segmentRects.length === 0) {
        return null;
      }

      let nextBoundaryTop = fallbackBottomBoundary;
      for (let cursor = index + 1; cursor < sortedFolders.length; cursor += 1) {
        const nextHeader = historyChildren.find(
          (child) =>
            child.classList.contains(FOLDER_HEADER_CLASS) &&
            child.dataset.folderId === sortedFolders[cursor].id,
        );
        const nextHeaderRect = getVisibleRect(nextHeader);
        if (nextHeaderRect) {
          nextBoundaryTop = nextHeaderRect.top;
          break;
        }
      }

      const naturalTop = Math.min(...segmentRects.map((rect) => rect.top));
      const naturalBottom = Math.max(...segmentRects.map((rect) => rect.bottom));
      const availableGap = Math.max(0, nextBoundaryTop - naturalBottom);
      const extendedBottom = naturalBottom + Math.min(18, availableGap / 2);

      return {
        type: "folder",
        key: `folder:${folder.id}`,
        folderId: folder.id,
        element: null,
        indirect: true,
        top: naturalTop - 6,
        bottom: extendedBottom + 6,
      };
    })
    .filter(Boolean);

  const matchedFolderZone = folderZones.find((zone) => clientY >= zone.top && clientY <= zone.bottom) || null;
  if (matchedFolderZone) {
    return matchedFolderZone;
  }

  const ungroupedItems = historyChildren.filter(
    (child) => child instanceof HTMLAnchorElement && !child.hasAttribute(FOLDER_ITEM_ATTR),
  );
  const ungroupedRects = ungroupedItems.map((node) => getVisibleRect(node)).filter(Boolean);
  if (ungroupedRects.length === 0) {
    return null;
  }

  const ungroupedTop = Math.min(...ungroupedRects.map((rect) => rect.top)) - 6;
  const ungroupedBottom = Math.max(...ungroupedRects.map((rect) => rect.bottom)) + 6;
  if (clientY < ungroupedTop || clientY > ungroupedBottom) {
    return null;
  }

  return {
    type: "ungrouped",
    key: "ungrouped",
    element: ungroupedButton || ungroupedItems[0],
    indirect: true,
    allowHighlight: true,
  };
};

const getDropZoneFromEvent = (event) => {
  const directDropZone = getDropZoneFromTarget(getSafeEventTarget(event));
  if (directDropZone) {
    return directDropZone;
  }

  return getDropZoneFromManagedArea(event?.clientX, event?.clientY);
};

const renderFolders = () => {
  hydrateFolders();

  const sectionData = findChatHistorySection();
  if (!sectionData) {
    cleanupFolderUi();
    return;
  }

  const { section, headerButton, history } = sectionData;
  if (folderState.history && folderState.history !== history) {
    clearHistoryPresentation(folderState.history);
  }

  folderState.section = section;
  folderState.headerButton = headerButton;
  folderState.history = history;

  bindFolderHistoryEvents(history);
  const manager = ensureFolderManager(section, headerButton);
  ensureFolderMenu();

  const conversationItems = getConversationItems(history);
  const sortedFolders = getSortedFolders();
  const validFolderIds = new Set(sortedFolders.map((folder) => folder.id));
  const groupedItems = new Map();
  const ungroupedItems = [];

  conversationItems.forEach((item) => {
    item.style.order = "";
    item.removeAttribute(FOLDER_ITEM_ATTR);
    item.removeAttribute(FOLDER_COLLAPSED_ATTR);

    const conversationId = getConversationIdFromItem(item);
    const folderId = conversationId ? folderState.assignments[conversationId] : "";

    if (conversationId && folderId && validFolderIds.has(folderId)) {
      item.setAttribute(FOLDER_ITEM_ATTR, folderId);
      if (!groupedItems.has(folderId)) {
        groupedItems.set(folderId, []);
      }
      groupedItems.get(folderId).push(item);
      return;
    }

    ungroupedItems.push(item);
  });

  const otherNativeChildren = Array.from(history.children).filter(
    (child) =>
      child instanceof HTMLElement &&
      !child.classList.contains(FOLDER_HEADER_CLASS) &&
      !child.classList.contains(FOLDER_EMPTY_CLASS) &&
      !conversationItems.includes(child),
  );

  withFolderRenderLock(() => {
    history.setAttribute(FOLDER_ROOT_ATTR, "1");
    history.setAttribute(FOLDER_THEME_TARGET_ATTR, "folders");

    const currentHeaders = new Map();
    const currentEmptyStates = new Map();

    Array.from(history.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }
      if (child.classList.contains(FOLDER_HEADER_CLASS)) {
        currentHeaders.set(child.dataset.folderId || "", child);
        return;
      }
      if (child.classList.contains(FOLDER_EMPTY_CLASS)) {
        currentEmptyStates.set(child.dataset.folderId || "", child);
      }
    });

    let nextOrder = 0;

    sortedFolders.forEach((folder) => {
      let header = currentHeaders.get(folder.id);
      if (!(header instanceof HTMLElement)) {
        header = document.createElement("div");
        header.className = FOLDER_HEADER_CLASS;
        header.setAttribute(FOLDER_DROPZONE_ATTR, "folder");
        header.innerHTML = `
          <span class="chatgpt-toolkit-folder-chevron" aria-hidden="true"></span>
          <span class="chatgpt-toolkit-folder-name"></span>
          <span class="chatgpt-toolkit-folder-count"></span>
          <button type="button" class="chatgpt-toolkit-folder-menu-btn" data-folder-action="open-menu" aria-label="打开文件夹菜单">
            <span aria-hidden="true">···</span>
          </button>
        `;
        history.appendChild(header);
      }

      currentHeaders.delete(folder.id);
      header.dataset.folderId = folder.id;
      header.dataset.collapsed = folder.collapsed ? "1" : "0";
      header.style.order = String(nextOrder++);

      const folderName = header.querySelector(".chatgpt-toolkit-folder-name");
      if (folderName) {
        folderName.textContent = folder.name;
      }

      const countNode = header.querySelector(".chatgpt-toolkit-folder-count");
      if (countNode) {
        countNode.textContent = String((groupedItems.get(folder.id) || []).length);
      }

      const menuButton = header.querySelector("[data-folder-action='open-menu']");
      if (menuButton instanceof HTMLElement) {
        menuButton.dataset.folderId = folder.id;
      }

      const folderItems = groupedItems.get(folder.id) || [];
      if (!folder.collapsed && folderItems.length === 0) {
        let emptyState = currentEmptyStates.get(folder.id);
        if (!(emptyState instanceof HTMLElement)) {
          emptyState = document.createElement("div");
          emptyState.className = FOLDER_EMPTY_CLASS;
          emptyState.setAttribute(FOLDER_DROPZONE_ATTR, "folder");
          emptyState.textContent = "拖动聊天到这里";
          history.appendChild(emptyState);
        }

        currentEmptyStates.delete(folder.id);
        emptyState.dataset.folderId = folder.id;
        emptyState.style.order = String(nextOrder++);
      } else {
        const emptyState = currentEmptyStates.get(folder.id);
        if (emptyState instanceof HTMLElement) {
          emptyState.remove();
        }
        currentEmptyStates.delete(folder.id);
      }

      folderItems.forEach((item) => {
        item.style.order = String(nextOrder++);
        if (folder.collapsed) {
          item.setAttribute(FOLDER_COLLAPSED_ATTR, "1");
        }
      });
    });

    ungroupedItems.forEach((item) => {
      item.style.order = String(nextOrder++);
    });

    otherNativeChildren.forEach((child) => {
      child.style.order = String(nextOrder++);
    });

    currentHeaders.forEach((node) => node.remove());
    currentEmptyStates.forEach((node) => node.remove());

    const ungroupedButton = manager.querySelector('[data-folder-action="show-ungrouped"]');
    if (ungroupedButton instanceof HTMLButtonElement) {
      ungroupedButton.classList.toggle("is-empty", ungroupedItems.length === 0);
      const countNode = ungroupedButton.querySelector(".chatgpt-toolkit-folder-pill-count");
      if (countNode) {
        countNode.textContent = String(ungroupedItems.length);
      }
    }
  });

  if (folderState.menuFolderId && !getFolderById(folderState.menuFolderId)) {
    closeFolderMenu();
  }

  syncToolkitTheme();
};

const scheduleFolderRefresh = () => {
  hydrateFolders();

  if (folderState.draggingConversationId) {
    folderState.refreshPending = true;
    return;
  }

  if (folderState.refreshQueued) {
    return;
  }

  folderState.refreshQueued = true;
  requestAnimationFrame(() => {
    folderState.refreshQueued = false;
    renderFolders();
  });
};

const handleFolderHistoryClick = (event) => {
  const target = getSafeEventTarget(event);
  if (!(target instanceof Element) || !(folderState.history instanceof HTMLElement)) {
    return;
  }

  const menuButton = target.closest("[data-folder-action='open-menu']");
  if (menuButton instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    openFolderMenu(menuButton.dataset.folderId || "", menuButton);
    return;
  }

  const header = target.closest(`.${FOLDER_HEADER_CLASS}`);
  if (!(header instanceof HTMLElement) || header.parentElement !== folderState.history) {
    return;
  }

  event.preventDefault();
  toggleFolder(header.dataset.folderId || "");
};

const handleFolderDragStart = (event) => {
  const target = getSafeEventTarget(event);
  const conversationItem = getConversationItemFromTarget(target);
  if (!(conversationItem instanceof HTMLAnchorElement)) {
    return;
  }

  const conversationId = getConversationIdFromItem(conversationItem);
  if (!conversationId) {
    return;
  }

  folderState.draggingConversationId = conversationId;
  document.documentElement.setAttribute(FOLDER_DRAGGING_ATTR, "1");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", conversationId);
    } catch (error) {
      // Ignore drag payload errors.
    }
  }
};

const handleFolderDragOver = (event) => {
  if (!folderState.draggingConversationId) {
    return;
  }

  const dropZone = getDropZoneFromEvent(event);
  if (!dropZone) {
    clearDropZoneHighlight();
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  if (dropZone.indirect && !dropZone.allowHighlight) {
    clearDropZoneHighlight();
    return;
  }
  setDropZoneHighlight(dropZone.element, dropZone.key);
};

const handleFolderDrop = (event) => {
  if (!folderState.draggingConversationId) {
    return;
  }

  const conversationId = folderState.draggingConversationId;
  const dropZone = getDropZoneFromEvent(event);
  clearFolderDragState();

  if (!dropZone) {
    return;
  }

  event.preventDefault();

  if (dropZone.type === "ungrouped") {
    unassignConversation(conversationId);
    return;
  }

  if (dropZone.type === "folder" && dropZone.folderId) {
    assignConversationToFolder(conversationId, dropZone.folderId);
    scheduleSettledFolderRefresh();
  }
};

const bindFolderHistoryEvents = (history) => {
  if (!(history instanceof HTMLElement) || history.hasAttribute(FOLDER_BOUND_ATTR)) {
    return;
  }

  history.addEventListener("click", handleFolderHistoryClick);
  history.setAttribute(FOLDER_BOUND_ATTR, "1");
};

const bindFolderGlobalEvents = () => {
  if (folderState.initialized) {
    return;
  }

  folderState.initialized = true;

  document.addEventListener("dragstart", handleFolderDragStart, true);
  document.addEventListener("dragover", handleFolderDragOver, true);
  document.addEventListener("drop", handleFolderDrop, true);
  document.addEventListener("dragend", clearFolderDragState, true);

  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = getSafeEventTarget(event);
      const menu = document.getElementById(FOLDER_MENU_ID);
      if (!(menu instanceof HTMLElement) || !menu.classList.contains("is-visible")) {
        return;
      }

      if (target instanceof Element && (menu.contains(target) || target.closest("[data-folder-action='open-menu']"))) {
        return;
      }

      closeFolderMenu();
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFolderMenu();
    }
  });
};

const initFolders = () => {
  hydrateFolders();
  bindFolderGlobalEvents();
  scheduleFolderRefresh();
  void hydrateFoldersFromExtension();
};
