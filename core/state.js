/*
 * ChatGPT Conversation Toolkit - Global state and configuration
 */
const TOOLKIT_ID = "chatgpt-conversation-toolkit";
const STATUS_ID = "chatgpt-conversation-toolkit-status";
const MINIMIZED_ID = "chatgpt-conversation-toolkit-minimized";
const POSITION_KEY = "chatgpt-toolkit-position";
const TIMELINE_POSITION_KEY = "chatgpt-toolkit-timeline-position";
const TIMELINE_VISIBLE_KEY = "chatgpt-toolkit-timeline-visible";
const THEME_ATTR = "data-toolkit-theme";
const TIMELINE_ID = "chatgpt-conversation-toolkit-timeline";
const TIMELINE_TRACK_ID = "chatgpt-conversation-toolkit-timeline-track";
const TIMELINE_COUNT_ID = "chatgpt-conversation-toolkit-timeline-count";
const TIMELINE_PREVIEW_ID = "chatgpt-conversation-toolkit-timeline-preview";
const TIMELINE_HINT_ID = "chatgpt-conversation-toolkit-timeline-hint";
const TIMELINE_VISIBLE_NODE_CAPACITY = 10;
const TIMELINE_MAX_NODES = 20;
const TIMELINE_CONTENT_CLASS = "chatgpt-toolkit-timeline-content";
const TIMELINE_WHEEL_DISTANCE_SCALE = 0.24;
const TIMELINE_WHEEL_MIN_STEP = 4;
const TIMELINE_WHEEL_MAX_STEP = 72;
const TIMELINE_DRAG_MARGIN = 8;
const TIMELINE_DRAG_THRESHOLD = 4;
const PROMPT_MODAL_ID = "chatgpt-toolkit-prompt-modal";
const PROMPT_FILE_INPUT_ID = "chatgpt-toolkit-prompt-file";
const PROMPT_TOAST_ID = "chatgpt-toolkit-prompt-toast";
const PROMPT_STORAGE_KEY = "chatgpt-toolkit-prompts-v1";
const PROMPT_LOCAL_FALLBACK_KEY = "chatgpt-toolkit-prompts-fallback";
const FOLDER_MANAGER_ID = "chatgpt-toolkit-folder-manager";
const FOLDER_MENU_ID = "chatgpt-toolkit-folder-menu";
const FOLDER_STORAGE_KEY = "chatgpt-toolkit-folders-v1";
const FOLDER_LOCAL_FALLBACK_KEY = "chatgpt-toolkit-folders-fallback";
const FOLDER_ROOT_ATTR = "data-toolkit-folder-root";

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

const minimizedButtonState = {
  pointerDown: false,
  dragging: false,
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
const timelineState = {
  items: [],
  totalUserCount: 0,
  activeIndex: -1,
  hoverIndex: -1,
  signature: "",
  contentHeight: 0,
  rendered: false,
  visible: true,
  manualPosition: null,
  pointerDown: false,
  dragging: false,
  refreshPending: false,
};
const folderState = {
  initialized: false,
  loaded: false,
  folders: [],
  assignments: {},
  section: null,
  headerButton: null,
  history: null,
  menuFolderId: null,
  draggingConversationId: null,
  currentDropZoneKey: "",
  refreshQueued: false,
  refreshPending: false,
};
let promptToastTimer = null;
let timelineHintTimer = null;
let timelineHighlightTimer = null;
let timelineRefreshTimer = null;
let folderHighlightTimer = null;
let folderSettledRefreshTimer = null;
let timelineScrollTicking = false;
let timelineScrollListenerAdded = false;
let themeObserver = null;
let themeMediaQuery = null;
let bodyThemeObserved = false;

const themeAttributeFilter = ["class", "data-theme", "style"];

const TOOLKIT_BOOTSTRAP_FLAG = "__chatgptConversationToolkitBootstrapped";
