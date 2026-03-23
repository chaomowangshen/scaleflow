const state = {
  token: "",
  baseUrl: window.location.origin,
  sessionId: "",
  participantId: "",
  totalItems: 0,
  currentIndex: 0,
  currentItem: null,
  currentAnswer: null,
  eventQueue: [],
  timerStartedAt: 0,
  timerHandle: null,
  fingerprint: "",
  isSubmitting: false,
  consentText:
    "继续作答即表示你已知悉：本问卷用于研究分析，题目将逐一展示，系统会记录每题作答时间和交互事件。你可以选择同意并继续，或拒绝并结束本次作答。",
};

const els = {
  participant: document.getElementById("meta-participant"),
  progressText: document.getElementById("meta-progress"),
  timerText: document.getElementById("meta-timer"),
  progressBar: document.getElementById("progress-bar"),
  consentSection: document.getElementById("consent-section"),
  consentText: document.getElementById("consent-text"),
  questionSection: document.getElementById("question-section"),
  messageSection: document.getElementById("message-section"),
  questionTitle: document.getElementById("question-title"),
  questionNote: document.getElementById("question-note"),
  answersWrap: document.getElementById("answers-wrap"),
  questionStatus: document.getElementById("question-status"),
  btnSkipBranch: document.getElementById("btn-skip-branch"),
  btnSubmit: document.getElementById("btn-submit"),
  btnConsentAccept: document.getElementById("btn-consent-accept"),
  btnConsentReject: document.getElementById("btn-consent-reject"),
};

function getTokenFromUrl() {
  const pathMatch = window.location.pathname.match(/\/take\/([^/]+)/);
  if (pathMatch && pathMatch[1]) {
    return decodeURIComponent(pathMatch[1]);
  }
  const token = new URLSearchParams(window.location.search).get("token");
  return token || "";
}

function buildFingerprint() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const screenDesc = `${window.screen.width}x${window.screen.height}`;
  return `${navigator.userAgent}|${navigator.language}|${zone}|${screenDesc}`;
}

function toIsoNow() {
  return new Date().toISOString();
}

function setHidden(element, hidden) {
  element.classList.toggle("hidden", hidden);
}

function formatTimer(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function startQuestionTimer() {
  stopQuestionTimer();
  state.timerStartedAt = Date.now();
  els.timerText.textContent = "00:00";
  state.timerHandle = window.setInterval(() => {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - state.timerStartedAt) / 1000));
    els.timerText.textContent = formatTimer(elapsedSec);
  }, 1000);
}

function stopQuestionTimer() {
  if (state.timerHandle) {
    window.clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
}

function setMessage(text, tone = "") {
  els.messageSection.textContent = text;
  els.messageSection.classList.remove("hidden", "error", "ok");
  if (tone === "error") {
    els.messageSection.classList.add("error");
  }
  if (tone === "ok") {
    els.messageSection.classList.add("ok");
  }
}

function clearMessage() {
  els.messageSection.textContent = "";
  els.messageSection.classList.add("hidden");
  els.messageSection.classList.remove("error", "ok");
}

function setConsentText(text) {
  if (!els.consentText) {
    return;
  }
  const raw = typeof text === "string" ? text.trim() : "";
  if (raw) {
    els.consentText.textContent = raw;
    return;
  }
  els.consentText.textContent = state.consentText;
}

function pushEvent(eventType, payload = {}) {
  const row = {
    event_type: eventType,
    client_ts: toIsoNow(),
    payload,
  };
  state.eventQueue.push(row);
  if (state.eventQueue.length > 120) {
    state.eventQueue.shift();
  }
}

async function api(path, options = {}) {
  return fetch(`${state.baseUrl}${path}`, options);
}

function applyMeta(payload) {
  state.sessionId = payload.session_id || state.sessionId;
  state.participantId = payload.participant_id || state.participantId;
  state.currentIndex = Number(payload.current_index || 0);
  state.totalItems = Number(payload.total_items || state.totalItems || 0);
  els.participant.textContent = state.participantId || "-";

  const currentDisplay = Math.min(state.currentIndex + 1, Math.max(state.totalItems, 1));
  if (!state.totalItems) {
    els.progressText.textContent = "0 / 0";
    els.progressBar.style.width = "0%";
    return;
  }
  const ratio = Math.max(0, Math.min(100, Math.floor((state.currentIndex / state.totalItems) * 100)));
  els.progressText.textContent = `${currentDisplay} / ${state.totalItems}`;
  els.progressBar.style.width = `${ratio}%`;
}

function renderLikert(item) {
  const grid = document.createElement("div");
  grid.className = "likert-grid";
  const buttons = [];
  (item.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "likert-btn";
    btn.innerHTML = `<span class="likert-value">${String(opt.value)}</span><span>${opt.label}</span>`;
    btn.addEventListener("click", () => {
      if (state.isSubmitting) {
        return;
      }
      state.currentAnswer = opt.value;
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      pushEvent("likert_selected", { item_id: item.item_id, value: opt.value });
      void submitCurrentItem("likert_auto");
    });
    buttons.push(btn);
    grid.appendChild(btn);
  });
  return grid;
}

function renderSingleChoice(item) {
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  const buttons = [];
  (item.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.innerHTML = `<span class="choice-dot"></span><span>${opt.label}</span>`;
    btn.addEventListener("click", () => {
      if (state.isSubmitting) {
        return;
      }
      state.currentAnswer = opt.value;
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      pushEvent("single_choice_selected", { item_id: item.item_id, value: opt.value });
      void submitCurrentItem("single_auto");
    });
    buttons.push(btn);
    grid.appendChild(btn);
  });
  return grid;
}

function renderMultipleChoice(item) {
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  const selected = new Set();
  (item.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.innerHTML = `<span class="choice-dot"></span><span>${opt.label}</span>`;
    btn.addEventListener("click", () => {
      if (state.isSubmitting) {
        return;
      }
      const key = String(opt.value);
      if (selected.has(key)) {
        selected.delete(key);
        btn.classList.remove("active");
      } else {
        selected.add(key);
        btn.classList.add("active");
      }
      state.currentAnswer = (item.options || [])
        .map((row) => String(row.value))
        .filter((value) => selected.has(value))
        .map((value) => {
          const target = (item.options || []).find((row) => String(row.value) === value);
          return target ? target.value : value;
        });
      pushEvent("multiple_choice_changed", { item_id: item.item_id, count: state.currentAnswer.length });
    });
    grid.appendChild(btn);
  });
  return grid;
}

function getDragAfterElement(container, y) {
  const draggableRows = Array.from(container.querySelectorAll(".ranking-row.draggable-row:not(.dragging)"));
  let closestOffset = Number.NEGATIVE_INFINITY;
  let closestElement = null;
  draggableRows.forEach((row) => {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closestElement = row;
    }
  });
  return closestElement;
}

function renderRanking(item) {
  const wrap = document.createElement("div");
  wrap.className = "ranking-wrap";

  const hint = document.createElement("div");
  hint.className = "ranking-hint";
  hint.textContent = item.required
    ? "拖拽调整顺序后提交。"
    : "可勾选部分选项并拖拽排序；也可直接空答提交。";
  wrap.appendChild(hint);

  const list = document.createElement("div");
  list.className = "ranking-list";
  wrap.appendChild(list);

  const options = item.options || [];
  const orderKeys = options.map((opt) => String(opt.value));
  const valueByKey = new Map(options.map((opt) => [String(opt.value), opt.value]));
  const selectedKeys = new Set(item.required ? orderKeys : []);
  const rowsByKey = new Map();

  let draggingKey = null;
  let dragChanged = false;
  let touchDraggingKey = null;
  let touchChanged = false;

  function moveKeyBefore(movingKey, targetKey, placeAfter = false) {
    if (!movingKey || !targetKey || movingKey === targetKey) {
      return false;
    }
    const fromIndex = orderKeys.indexOf(movingKey);
    const targetIndex = orderKeys.indexOf(targetKey);
    if (fromIndex < 0 || targetIndex < 0) {
      return false;
    }
    orderKeys.splice(fromIndex, 1);
    const adjustedTargetIndex = orderKeys.indexOf(targetKey);
    const insertIndex = placeAfter ? adjustedTargetIndex + 1 : adjustedTargetIndex;
    orderKeys.splice(insertIndex, 0, movingKey);
    return true;
  }

  function emitRankingChanged(reason) {
    const rankedValues = orderKeys
      .filter((key) => selectedKeys.has(key))
      .map((key) => valueByKey.get(key));
    pushEvent("ranking_changed", {
      item_id: item.item_id,
      reason,
      ranked_values: rankedValues,
    });
  }

  function syncRows(emitChange = false, reason = "reorder") {
    const ranked = orderKeys.filter((key) => selectedKeys.has(key));
    const unranked = orderKeys.filter((key) => !selectedKeys.has(key));
    const ordered = ranked.concat(unranked);

    let rank = 1;
    ordered.forEach((key) => {
      const row = rowsByKey.get(key);
      if (!row) {
        return;
      }
      const selected = selectedKeys.has(key);
      row.classList.toggle("unranked", !selected);
      row.classList.toggle("draggable-row", selected);
      row.draggable = selected && !state.isSubmitting;

      const rankBadge = row.querySelector(".ranking-rank");
      if (rankBadge) {
        rankBadge.textContent = selected ? String(rank++) : "-";
      }

      const checkbox = row.querySelector("input[type='checkbox']");
      if (checkbox) {
        checkbox.checked = selected;
        checkbox.disabled = state.isSubmitting;
      }

      row.classList.toggle("disabled", state.isSubmitting);
      list.appendChild(row);
    });

    state.currentAnswer = ranked.map((key) => valueByKey.get(key));
    if (emitChange) {
      emitRankingChanged(reason);
    }
  }

  function endTouchDrag() {
    if (!touchDraggingKey) {
      return;
    }
    const row = rowsByKey.get(touchDraggingKey);
    if (row) {
      row.classList.remove("dragging");
    }
    const changed = touchChanged;
    const endKey = touchDraggingKey;
    touchDraggingKey = null;
    touchChanged = false;
    syncRows(false);
    pushEvent("ranking_drag_end", {
      item_id: item.item_id,
      mode: "touch",
      value: valueByKey.get(endKey),
      changed,
    });
    if (changed) {
      emitRankingChanged("touch_drag");
    }
  }

  orderKeys.forEach((key) => {
    const option = options.find((opt) => String(opt.value) === key);
    const row = document.createElement("div");
    row.className = "ranking-row";
    row.dataset.key = key;

    const rankBadge = document.createElement("span");
    rankBadge.className = "ranking-rank";
    rankBadge.textContent = "-";
    row.appendChild(rankBadge);

    const label = document.createElement("span");
    label.className = "ranking-label";
    label.textContent = option ? option.label : key;
    row.appendChild(label);

    if (!item.required) {
      const checkWrap = document.createElement("label");
      checkWrap.className = "ranking-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = false;
      checkbox.addEventListener("change", () => {
        if (state.isSubmitting) {
          return;
        }
        if (checkbox.checked) {
          selectedKeys.add(key);
        } else {
          selectedKeys.delete(key);
        }
        pushEvent("ranking_toggle", {
          item_id: item.item_id,
          value: valueByKey.get(key),
          selected: checkbox.checked,
        });
        syncRows(true, "toggle");
      });
      checkWrap.appendChild(checkbox);
      const checkText = document.createElement("span");
      checkText.textContent = "纳入排序";
      checkWrap.appendChild(checkText);
      row.appendChild(checkWrap);
    }

    const handle = document.createElement("span");
    handle.className = "ranking-handle";
    handle.textContent = "Drag";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "拖拽排序");
    row.appendChild(handle);

    row.addEventListener("dragstart", (event) => {
      if (state.isSubmitting || !selectedKeys.has(key)) {
        event.preventDefault();
        return;
      }
      draggingKey = key;
      dragChanged = false;
      row.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        try {
          event.dataTransfer.setData("text/plain", key);
        } catch (_) {
          // no-op
        }
      }
      pushEvent("ranking_drag_start", {
        item_id: item.item_id,
        mode: "mouse",
        value: valueByKey.get(key),
      });
    });

    row.addEventListener("dragend", () => {
      if (draggingKey !== key) {
        return;
      }
      row.classList.remove("dragging");
      const changed = dragChanged;
      draggingKey = null;
      dragChanged = false;
      syncRows(false);
      pushEvent("ranking_drag_end", {
        item_id: item.item_id,
        mode: "mouse",
        value: valueByKey.get(key),
        changed,
      });
      if (changed) {
        emitRankingChanged("mouse_drag");
      }
    });

    handle.addEventListener(
      "touchstart",
      (event) => {
        if (state.isSubmitting || !selectedKeys.has(key)) {
          return;
        }
        touchDraggingKey = key;
        touchChanged = false;
        row.classList.add("dragging");
        pushEvent("ranking_drag_start", {
          item_id: item.item_id,
          mode: "touch",
          value: valueByKey.get(key),
        });
        event.preventDefault();
      },
      { passive: false },
    );

    handle.addEventListener(
      "touchmove",
      (event) => {
        if (!touchDraggingKey || state.isSubmitting) {
          return;
        }
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = target ? target.closest(".ranking-row.draggable-row") : null;
        if (!targetRow) {
          event.preventDefault();
          return;
        }
        const targetKey = targetRow.dataset.key || "";
        if (!targetKey || targetKey === touchDraggingKey) {
          event.preventDefault();
          return;
        }
        const box = targetRow.getBoundingClientRect();
        const placeAfter = touch.clientY > box.top + box.height / 2;
        const moved = moveKeyBefore(touchDraggingKey, targetKey, placeAfter);
        if (moved) {
          touchChanged = true;
          syncRows(false);
        }
        event.preventDefault();
      },
      { passive: false },
    );

    handle.addEventListener("touchend", endTouchDrag, { passive: true });
    handle.addEventListener("touchcancel", endTouchDrag, { passive: true });

    rowsByKey.set(key, row);
    list.appendChild(row);
  });

  list.addEventListener("dragover", (event) => {
    if (!draggingKey || state.isSubmitting) {
      return;
    }
    event.preventDefault();

    const afterElement = getDragAfterElement(list, event.clientY);
    if (!afterElement) {
      const rankedWithoutDragging = orderKeys.filter((key) => selectedKeys.has(key) && key !== draggingKey);
      const lastKey = rankedWithoutDragging[rankedWithoutDragging.length - 1];
      if (!lastKey) {
        return;
      }
      const moved = moveKeyBefore(draggingKey, lastKey, true);
      if (moved) {
        dragChanged = true;
        syncRows(false);
      }
      return;
    }

    const targetKey = afterElement.dataset.key || "";
    if (!targetKey || !selectedKeys.has(targetKey)) {
      return;
    }
    const moved = moveKeyBefore(draggingKey, targetKey, false);
    if (moved) {
      dragChanged = true;
      syncRows(false);
    }
  });

  list.addEventListener("drop", (event) => {
    if (!draggingKey) {
      return;
    }
    event.preventDefault();
  });

  syncRows(false, "init");
  return wrap;
}

function renderBlankOrText(item) {
  if (item.type === "blank") {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-answer";
    input.placeholder = "请输入你的回答";
    input.addEventListener("input", () => {
      state.currentAnswer = input.value;
    });
    input.addEventListener("change", () => {
      pushEvent("text_changed", { item_id: item.item_id, length: (input.value || "").length });
    });
    return input;
  }

  const textarea = document.createElement("textarea");
  textarea.className = "text-answer";
  textarea.placeholder = "请输入详细回答";
  textarea.addEventListener("input", () => {
    state.currentAnswer = textarea.value;
  });
  textarea.addEventListener("change", () => {
    pushEvent("text_changed", { item_id: item.item_id, length: (textarea.value || "").length });
  });
  return textarea;
}

function renderQuestion(item, currentIndex, totalItems) {
  clearMessage();
  setHidden(els.consentSection, true);
  setHidden(els.questionSection, false);

  state.currentItem = item;
  state.currentAnswer = null;
  state.eventQueue = [];
  state.isSubmitting = false;
  state.currentIndex = Number(currentIndex || 0);
  state.totalItems = Number(totalItems || state.totalItems || 0);

  els.questionTitle.textContent = item.stem || "题目";
  if (item.required) {
    els.questionNote.textContent = "";
    setHidden(els.questionNote, true);
  } else {
    els.questionNote.textContent = "本题可跳过";
    setHidden(els.questionNote, false);
  }
  els.questionStatus.textContent = `题号 ${state.currentIndex + 1} / ${state.totalItems || "?"}`;
  els.answersWrap.innerHTML = "";

  const isLikert = item.type === "likert";
  const isSingleChoice = item.type === "single_choice";
  const isMultipleChoice = item.type === "multiple_choice";
  const isRanking = item.type === "ranking";
  const isBranchSkippableSingle = isSingleChoice && item.group_flow_mode === "branch" && !item.required;
  const showManualSubmit = isRanking || (!isLikert && (!isSingleChoice || (!item.required && !isBranchSkippableSingle)));

  setHidden(els.btnSubmit, !showManualSubmit);
  setHidden(els.btnSkipBranch, !isBranchSkippableSingle);
  els.btnSkipBranch.disabled = false;
  els.btnSubmit.disabled = false;
  els.btnSubmit.textContent = "提交并继续";

  if (isLikert) {
    els.answersWrap.appendChild(renderLikert(item));
  } else if (isSingleChoice) {
    els.answersWrap.appendChild(renderSingleChoice(item));
  } else if (isMultipleChoice) {
    els.answersWrap.appendChild(renderMultipleChoice(item));
  } else if (isRanking) {
    els.answersWrap.appendChild(renderRanking(item));
  } else {
    els.answersWrap.appendChild(renderBlankOrText(item));
  }

  applyMeta({
    session_id: state.sessionId,
    participant_id: state.participantId,
    current_index: state.currentIndex,
    total_items: state.totalItems,
  });
  pushEvent("item_rendered", { item_id: item.item_id, index: state.currentIndex + 1 });
  startQuestionTimer();
}

function renderConsent() {
  clearMessage();
  setConsentText(state.consentText);
  setHidden(els.questionSection, true);
  setHidden(els.consentSection, false);
  stopQuestionTimer();
}

function renderDone(message) {
  stopQuestionTimer();
  setHidden(els.questionSection, true);
  setHidden(els.consentSection, true);
  setMessage(message, "ok");
  if (state.totalItems > 0) {
    els.progressBar.style.width = "100%";
    els.progressText.textContent = `${state.totalItems} / ${state.totalItems}`;
  }
}

async function parseError(response) {
  const payload = await response.json().catch(() => ({}));
  return payload.detail || `请求失败 (${response.status})`;
}

async function startSurvey() {
  const response = await api(`/survey/${encodeURIComponent(state.token)}/start`, {
    headers: {
      "X-Device-Fingerprint": state.fingerprint,
    },
  });
  if (!response.ok) {
    const message = await parseError(response);
    setMessage(`无法开始作答：${message}`, "error");
    return;
  }

  const payload = await response.json();
  applyMeta(payload);
  state.sessionId = payload.session_id;
  state.participantId = payload.participant_id;
  if (typeof payload.consent_text === "string" && payload.consent_text.trim()) {
    state.consentText = payload.consent_text.trim();
  }

  if (payload.status !== "in_progress") {
    renderDone(`当前作答状态：${payload.status}`);
    return;
  }

  if (payload.requires_consent && !payload.consent_given && !payload.next_item) {
    renderConsent();
    return;
  }

  if (payload.next_item) {
    renderQuestion(payload.next_item, payload.current_index, payload.total_items);
    return;
  }

  renderDone("问卷已完成，感谢你的参与。");
}

async function submitConsent(accepted) {
  const response = await api(`/survey/${encodeURIComponent(state.token)}/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepted }),
  });
  if (!response.ok) {
    const message = await parseError(response);
    setMessage(`同意提交失败：${message}`, "error");
    return;
  }
  const payload = await response.json();
  applyMeta(payload);
  if (typeof payload.consent_text === "string" && payload.consent_text.trim()) {
    state.consentText = payload.consent_text.trim();
  }
  if (!accepted || payload.status === "abandoned") {
    renderDone("你已拒绝并退出作答，感谢参与。");
    return;
  }
  if (payload.next_item) {
    renderQuestion(payload.next_item, payload.current_index, payload.total_items);
    return;
  }
  renderDone("当前暂无可作答题目。");
}

function readAnswer() {
  return state.currentAnswer;
}

function validateCurrentAnswer() {
  const answer = readAnswer();
  if (!state.currentItem) {
    return "当前没有可提交题目";
  }
  if (
    state.currentItem.required &&
    (answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0))
  ) {
    return "这是必答题，请先完成作答。";
  }
  return "";
}

async function submitCurrentItem(trigger = "manual_button") {
  if (state.isSubmitting) {
    return;
  }
  if (!state.currentItem) {
    setMessage("当前没有可提交题目", "error");
    return;
  }

  const validationMessage = validateCurrentAnswer();
  if (validationMessage) {
    setMessage(validationMessage, "error");
    return;
  }

  state.isSubmitting = true;
  const itemType = state.currentItem.type;
  const autoItemTypes = new Set(["likert", "single_choice"]);
  const shouldLockAnswerControls = autoItemTypes.has(itemType) || itemType === "ranking";
  const answerControls = Array.from(els.answersWrap.querySelectorAll("button,input,textarea,select"));
  if (shouldLockAnswerControls) {
    answerControls.forEach((btn) => {
      btn.disabled = true;
    });
  }
  if (!autoItemTypes.has(itemType)) {
    els.btnSubmit.disabled = true;
    els.btnSubmit.textContent = "提交中...";
  }
  els.btnSkipBranch.disabled = true;

  pushEvent("submit_click", {
    item_id: state.currentItem.item_id,
    index: state.currentIndex + 1,
    trigger,
  });
  const events = state.eventQueue.slice();
  const answer = readAnswer();

  try {
    const response = await api(`/survey/${encodeURIComponent(state.token)}/items/${encodeURIComponent(state.currentItem.item_id)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, events }),
    });

    if (!response.ok) {
      const message = await parseError(response);
      setMessage(`提交失败：${message}`, "error");
      pushEvent("submit_error", { message });
      return;
    }

    const payload = await response.json();
    state.currentIndex = Number(payload.current_index || state.currentIndex);
    if (payload.completed || !payload.next_item) {
      await api(`/survey/${encodeURIComponent(state.token)}/complete`, { method: "POST" }).catch(() => {});
      renderDone("作答完成，感谢你的参与。");
      return;
    }

    renderQuestion(payload.next_item, payload.current_index, state.totalItems);
  } finally {
    state.isSubmitting = false;
    if (shouldLockAnswerControls) {
      answerControls.forEach((btn) => {
        btn.disabled = false;
      });
    }
    if (!autoItemTypes.has(itemType)) {
      els.btnSubmit.disabled = false;
      els.btnSubmit.textContent = "提交并继续";
    }
    els.btnSkipBranch.disabled = false;
  }
}

function bindGlobalEvents() {
  window.addEventListener("focus", () => pushEvent("window_focus"));
  window.addEventListener("blur", () => pushEvent("window_blur"));
  document.addEventListener("visibilitychange", () => {
    pushEvent(document.hidden ? "document_hidden" : "document_visible");
  });
}

async function bootstrap() {
  state.token = getTokenFromUrl();
  state.fingerprint = buildFingerprint();
  bindGlobalEvents();

  if (!state.token) {
    setMessage("链接无效：缺少 token。", "error");
    return;
  }

  pushEvent("survey_open", { token_present: true });
  await startSurvey();
}

els.btnSubmit.addEventListener("click", () => submitCurrentItem("manual_button"));
els.btnSkipBranch.addEventListener("click", () => {
  state.currentAnswer = null;
  pushEvent("branch_skip_click", {
    item_id: state.currentItem?.item_id,
    index: state.currentIndex + 1,
  });
  void submitCurrentItem("branch_skip_button");
});
els.btnConsentAccept.addEventListener("click", () => submitConsent(true));
els.btnConsentReject.addEventListener("click", () => submitConsent(false));

bootstrap();
