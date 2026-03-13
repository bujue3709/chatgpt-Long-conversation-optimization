/*
 * ChatGPT Conversation Toolkit - Conversation collapse
 */
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
  renderTimeline();
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
  renderTimeline();
};
