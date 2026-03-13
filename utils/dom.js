/*
 * ChatGPT Conversation Toolkit - DOM utilities
 */
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
  return "unknown";
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

const createRafDragController = (applyPosition) => {
  let frameId = 0;
  let pendingPosition = null;

  const flush = () => {
    frameId = 0;
    if (!pendingPosition) {
      return;
    }
    const nextPosition = pendingPosition;
    pendingPosition = null;
    applyPosition(nextPosition);
  };

  return {
    schedule(position) {
      pendingPosition = position;
      if (frameId) {
        return;
      }
      frameId = requestAnimationFrame(flush);
    },
    flush() {
      if (!pendingPosition) {
        return;
      }
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      const nextPosition = pendingPosition;
      pendingPosition = null;
      applyPosition(nextPosition);
    },
    cancel() {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      pendingPosition = null;
    },
  };
};

const applyDragTransform = (element, translateX, translateY, baseTransform = "") => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const translate = `translate3d(${Math.round(translateX)}px, ${Math.round(translateY)}px, 0)`;
  element.style.transform =
    baseTransform && baseTransform !== "none"
      ? `${baseTransform} ${translate}`
      : translate;
};

const resetDragTransform = (element, baseTransform = "") => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.style.transform = baseTransform && baseTransform !== "none" ? baseTransform : "";
};
