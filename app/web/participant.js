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
  const isBranchSkippableSingle = isSingleChoice && item.group_flow_mode === "branch" && !item.required;
  const showManualSubmit = !isLikert && (!isSingleChoice || (!item.required && !isBranchSkippableSingle));

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
  const answerControls = Array.from(els.answersWrap.querySelectorAll("button,input,textarea,select"));
  if (autoItemTypes.has(itemType)) {
    answerControls.forEach((btn) => {
      btn.disabled = true;
    });
  } else {
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
    if (autoItemTypes.has(itemType)) {
      answerControls.forEach((btn) => {
        btn.disabled = false;
      });
    } else {
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
