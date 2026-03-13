/*
 * ChatGPT Conversation Toolkit - Search
 */
// ============ 搜索功能 ============

const SEARCH_MARK_CLASS = 'chatgpt-toolkit-search-text-match';
const SEARCH_MARK_ACTIVE_CLASS = 'chatgpt-toolkit-search-text-active';

const updateSearchUI = () => {
  const searchResult = document.getElementById('chatgpt-toolkit-search-result');
  const prevBtn = document.getElementById('chatgpt-toolkit-search-prev');
  const nextBtn = document.getElementById('chatgpt-toolkit-search-next');

  if (!searchResult || !prevBtn || !nextBtn) return;

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

// ---- 文本级高亮：在消息节点内为匹配文字注入 <mark> 标签 ----

const clearTextHighlights = () => {
  const marks = document.querySelectorAll(`.${SEARCH_MARK_CLASS}`);
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    // 用纯文本节点替换 mark 元素
    const textNode = document.createTextNode(mark.textContent);
    parent.replaceChild(textNode, mark);
    // 合并相邻文本节点，避免碎片化
    parent.normalize();
  });
};

const injectTextHighlights = (containerNode, query) => {
  if (!query || !(containerNode instanceof HTMLElement)) return;

  // 收集所有文本节点（跳过 script/style/已有 mark 标签）
  const walker = document.createTreeWalker(
    containerNode,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') {
          return NodeFilter.FILTER_REJECT;
        }
        // 跳过已有的 mark 高亮元素内的文本
        if (parent.classList && parent.classList.contains(SEARCH_MARK_CLASS)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes = [];
  let current;
  while ((current = walker.nextNode())) {
    textNodes.push(current);
  }

  const lowerQuery = query.toLowerCase();
  const queryLen = query.length;

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const lowerText = text.toLowerCase();

    if (!lowerText.includes(lowerQuery)) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let matchIndex;

    while ((matchIndex = lowerText.indexOf(lowerQuery, lastIndex)) !== -1) {
      // 匹配前的普通文本
      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
      }

      // 匹配到的文本，包裹在 <mark> 中
      const mark = document.createElement('mark');
      mark.className = SEARCH_MARK_CLASS;
      mark.textContent = text.slice(matchIndex, matchIndex + queryLen);
      fragment.appendChild(mark);

      lastIndex = matchIndex + queryLen;
    }

    // 剩余文本
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });
};

// 高亮当前导航到的匹配消息中的第一个 mark 为 active 状态
const updateActiveTextMark = () => {
  // 移除旧的 active 状态
  document.querySelectorAll(`.${SEARCH_MARK_ACTIVE_CLASS}`).forEach(el => {
    el.classList.remove(SEARCH_MARK_ACTIVE_CLASS);
  });

  if (state.currentMatchIndex < 0 || state.currentMatchIndex >= state.searchMatches.length) {
    return;
  }

  const node = state.searchMatches[state.currentMatchIndex];
  if (!(node instanceof HTMLElement)) return;

  // 为当前消息节点内的所有 mark 添加 active 样式
  const marks = node.querySelectorAll(`.${SEARCH_MARK_CLASS}`);
  marks.forEach(mark => {
    mark.classList.add(SEARCH_MARK_ACTIVE_CLASS);
  });
};

// ---- 消息节点级高亮（外框轮廓） ----

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
  updateActiveTextMark();
};

const performSearch = (query) => {
  state.searchQuery = query.trim().toLowerCase();
  state.searchMatches = [];
  state.currentMatchIndex = -1;

  // 先清除上一次的所有高亮
  clearTextHighlights();
  clearSearchHighlight();

  // 检查是否处于隐藏状态
  if (state.isCollapsed) {
    updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
    updateSearchUI();
    return;
  }

  if (!state.searchQuery) {
    updateSearchUI();
    return;
  }

  // 搜索所有消息节点
  const nodes = getMessageNodes();
  nodes.forEach(node => {
    const text = (node.textContent || '').toLowerCase();
    if (text.includes(state.searchQuery)) {
      state.searchMatches.push(node);
      // 为此消息节点注入文本级高亮
      injectTextHighlights(node, state.searchQuery);
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
    // 优先滚动到当前消息内第一个高亮 mark
    const firstMark = node.querySelector(`.${SEARCH_MARK_CLASS}`);
    const scrollTarget = firstMark || node;
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

// ============ 时间线功能 ============
