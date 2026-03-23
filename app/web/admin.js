
const STORAGE_ACTIVE_PAGE = "admin_active_page_v1";
const STORAGE_BASE_URL = "admin_base_url_v1";

const state = {
  token: localStorage.getItem("admin_token") || "",
  baseUrl: (localStorage.getItem(STORAGE_BASE_URL) || window.location.origin).replace(/\/+$/, ""),
  activePage: localStorage.getItem(STORAGE_ACTIVE_PAGE) || "import",
  projects: [],
  projectSearch: "",
  projectStatus: "all",
  projectPage: 1,
  projectPageSize: 8,
  selectedProject: null,
  projectQuestionnaires: {},
  batchProjectId: "",
  batchQuestionnaireId: "",
  projectBatches: [],
};

const els = {
  loginPanel: document.getElementById("login-panel"),
  appPanel: document.getElementById("app-panel"),
  statusAuth: document.getElementById("status-auth"),
  statusImport: document.getElementById("status-import"),
  statusProjects: document.getElementById("status-projects"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  baseUrlLogin: document.getElementById("base-url"),
  baseUrlMain: document.getElementById("base-url-main"),
  workspaceTitle: document.getElementById("workspace-title"),
  workspaceSubtitle: document.getElementById("workspace-subtitle"),
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  pages: {
    import: document.getElementById("page-import"),
    projects: document.getElementById("page-projects"),
    batches: document.getElementById("page-batches"),
  },
  importJson: document.getElementById("import-json"),
  importFile: document.getElementById("import-file"),
  btnPickFile: document.getElementById("btn-pick-file"),
  btnFillTemplate: document.getElementById("btn-fill-template"),
  btnImport: document.getElementById("btn-import"),
  btnLogin: document.getElementById("btn-login"),
  btnLogout: document.getElementById("btn-logout"),
  btnRefresh: document.getElementById("btn-refresh"),
  btnPurgeDue: document.getElementById("btn-purge-due"),
  projectSearch: document.getElementById("project-search"),
  projectStatusFilter: document.getElementById("project-status-filter"),
  projectPageSize: document.getElementById("project-page-size"),
  includePurged: document.getElementById("include-purged"),
  projectsTableBody: document.getElementById("projects-table-body"),
  btnPagePrev: document.getElementById("btn-page-prev"),
  btnPageNext: document.getElementById("btn-page-next"),
  pageIndicator: document.getElementById("page-indicator"),
  drawerMask: document.getElementById("drawer-mask"),
  projectDrawer: document.getElementById("project-drawer"),
  btnCloseDrawer: document.getElementById("btn-close-drawer"),
  drawerProjectName: document.getElementById("drawer-project-name"),
  drawerProjectMeta: document.getElementById("drawer-project-meta"),
  drawerStatus: document.getElementById("drawer-status"),
  drawerQuestionnaires: document.getElementById("drawer-questionnaires"),
  btnDrawerSoftDelete: document.getElementById("btn-drawer-soft-delete"),
  btnDrawerPurge: document.getElementById("btn-drawer-purge"),
  batchStats: document.getElementById("batch-stats"),
  batchProjectSelect: document.getElementById("batch-project-select"),
  batchQuestionnaireSelect: document.getElementById("batch-questionnaire-select"),
  batchCount: document.getElementById("batch-count"),
  batchExpire: document.getElementById("batch-expire"),
  btnCreateBatch: document.getElementById("btn-create-batch"),
  btnRefreshBatches: document.getElementById("btn-refresh-batches"),
  btnExportProjectCsv: document.getElementById("btn-export-project-csv"),
  btnExportProjectTxt: document.getElementById("btn-export-project-txt"),
  batchTableBody: document.getElementById("batch-table-body"),
};

const PAGE_META = {
  import: {
    title: "导入中心",
    subtitle: "导入项目与问卷 JSON，统一管理导入流程",
  },
  projects: {
    title: "项目管理",
    subtitle: "支持搜索、筛选、分页，并在详情抽屉中维护问卷设置",
  },
  batches: {
    title: "链接批次",
    subtitle: "按项目管理链接批次，可导出单批次或全项目链接",
  },
};

function ensureSelectOption(selectEl, value, label) {
  if (!selectEl) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  selectEl.appendChild(option);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setBaseUrlInput(value) {
  els.baseUrlLogin.value = value;
  els.baseUrlMain.value = value;
}

function getBaseUrlFromInput() {
  const raw = (els.baseUrlMain.value || els.baseUrlLogin.value || window.location.origin).trim();
  return raw.replace(/\/+$/, "");
}

function showStatus(el, message, tone = "normal") {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("error", "ok");
  if (tone === "error") el.classList.add("error");
  if (tone === "ok") el.classList.add("ok");
}

function setAuthedUI(authed) {
  els.loginPanel.classList.toggle("hidden", authed);
  els.appPanel.classList.toggle("hidden", !authed);
}

function formatTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return String(value);
  }
}

function statusClass(status) {
  if (status === "active") return "active";
  if (status === "pending_purge") return "pending_purge";
  return "purged";
}

function parseApiError(payload, statusCode) {
  if (payload && typeof payload.detail === "string") return payload.detail;
  if (payload && Array.isArray(payload.detail)) {
    const lines = payload.detail.map((item) => {
      const loc = Array.isArray(item.loc) ? item.loc.join(".") : "body";
      const msg = item.msg || "invalid value";
      return `${loc}: ${msg}`;
    });
    return lines.join("\n");
  }
  return `请求失败 (${statusCode})`;
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${state.baseUrl}${path}`, { ...options, headers });
  if (response.status === 401) {
    logout();
  }
  return response;
}

async function switchPage(page) {
  state.activePage = page in els.pages ? page : "import";
  localStorage.setItem(STORAGE_ACTIVE_PAGE, state.activePage);
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === state.activePage));
  Object.entries(els.pages).forEach(([key, pageEl]) => {
    pageEl.classList.toggle("hidden", key !== state.activePage);
  });

  const meta = PAGE_META[state.activePage];
  els.workspaceTitle.textContent = meta.title;
  els.workspaceSubtitle.textContent = meta.subtitle;

  if (state.activePage === "projects") {
    renderProjectTable();
  }
  if (state.activePage === "batches") {
    await ensureBatchPageReady();
  }
}

function templateJson() {
  return JSON.stringify(
    {
      project: {
        project_key: "demo_project_001",
        name: "演示项目",
        description: "管理员端导入示例",
      },
      questionnaire: {
        id: "scale_v1",
        version: "1.0.0",
        title: "演示量表",
        consent_enabled: true,
        consent_text: "继续作答即表示你已知悉：本问卷用于研究分析，系统会记录作答时间和交互事件。你可以选择同意并继续，或拒绝并结束本次作答。",
        randomization: {
          randomize_groups: true,
          randomize_items: true,
        },
        groups: [
          {
            group_id: "g1",
            title: "维度A",
            flow_mode: "linear",
            items: [
              {
                item_id: "q1",
                type: "likert",
                stem: ["我对当前生活满意", "我对最近一周情绪状态满意"],
                required: true,
                options: [
                  { value: 1, label: "非常不同意" },
                  { value: 2, label: "不同意" },
                  { value: 3, label: "一般" },
                  { value: 4, label: "同意" },
                  { value: 5, label: "非常同意" },
                ],
              },
              {
                item_id: "q2",
                type: "blank",
                stem: "请输入最近一次运动时长（分钟）",
                required: false,
              },
              {
                item_id: "q3",
                type: "text",
                stem: "请简述最近的主要压力来源",
                required: false,
              },
            ],
          },
          {
            group_id: "g2",
            title: "分支维度B",
            flow_mode: "branch",
            items: [
              {
                item_id: "q4",
                type: "single_choice",
                stem: "你是否正在工作？",
                required: false,
                options: [
                  { value: "yes", label: "是" },
                  { value: "no", label: "否" },
                ],
                routing: {
                  yes: "q5",
                  no: "__END_BLOCK__",
                },
              },
              {
                item_id: "q5",
                type: "multiple_choice",
                stem: "你目前最常见的压力来源（可多选）",
                required: false,
                options: [
                  { value: "workload", label: "工作量" },
                  { value: "manager", label: "管理关系" },
                  { value: "commute", label: "通勤" },
                ],
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  );
}

function getFilteredProjects() {
  let rows = state.projects.slice();
  const q = state.projectSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter((item) => {
      const sample = [item.name, item.project_key, item.id].join(" ").toLowerCase();
      return sample.includes(q);
    });
  }
  if (state.projectStatus !== "all") {
    rows = rows.filter((item) => item.delete_status === state.projectStatus);
  }
  return rows;
}

function renderProjectTable() {
  const filtered = getFilteredProjects();
  const pageSize = state.projectPageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.projectPage = Math.min(Math.max(1, state.projectPage), totalPages);
  const start = (state.projectPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  els.projectsTableBody.innerHTML = "";
  if (!pageRows.length) {
    els.projectsTableBody.innerHTML = `<tr><td colspan="5">暂无项目</td></tr>`;
  } else {
    pageRows.forEach((project) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="cell-main">${escapeHTML(project.name)}</div>
          <div class="cell-sub">id: ${escapeHTML(project.id)}</div>
        </td>
        <td><div class="cell-sub">${escapeHTML(project.project_key)}</div></td>
        <td><span class="pill ${statusClass(project.delete_status)}">${escapeHTML(project.delete_status)}</span></td>
        <td><div class="cell-sub">${escapeHTML(formatTime(project.created_at))}</div></td>
        <td>
          <div class="cell-actions">
            <button class="btn btn-light btn-view">详情</button>
            <button class="btn btn-danger btn-soft-delete">软删除</button>
            <button class="btn btn-warn btn-purge">清理</button>
          </div>
        </td>
      `;
      tr.querySelector(".btn-view").addEventListener("click", () => openProjectDrawer(project));
      tr.querySelector(".btn-soft-delete").addEventListener("click", async () => {
        try {
          await softDeleteProject(project);
          await loadProjects();
        } catch (err) {
          showStatus(els.statusProjects, String(err.message || err), "error");
        }
      });
      tr.querySelector(".btn-purge").addEventListener("click", async () => {
        try {
          await purgeProject(project.id);
          await loadProjects();
        } catch (err) {
          showStatus(els.statusProjects, String(err.message || err), "error");
        }
      });
      els.projectsTableBody.appendChild(tr);
    });
  }

  els.pageIndicator.textContent = `第 ${state.projectPage} / ${totalPages} 页（共 ${filtered.length} 项）`;
  els.btnPagePrev.disabled = state.projectPage <= 1;
  els.btnPageNext.disabled = state.projectPage >= totalPages;
}
function getAvailableBatchProjects() {
  return state.projects.filter((item) => item.delete_status !== "purged");
}

function syncBatchProjectOptions() {
  const availableProjects = getAvailableBatchProjects();
  els.batchProjectSelect.innerHTML = "";
  if (!availableProjects.length) {
    state.batchProjectId = "";
    ensureSelectOption(els.batchProjectSelect, "", "暂无可用项目");
    els.batchProjectSelect.disabled = true;
    els.batchQuestionnaireSelect.innerHTML = "";
    ensureSelectOption(els.batchQuestionnaireSelect, "", "请先选择项目");
    els.batchQuestionnaireSelect.disabled = true;
    state.projectBatches = [];
    renderBatchTable();
    showStatus(els.batchStats, "暂无可用项目", "error");
    return;
  }

  els.batchProjectSelect.disabled = false;
  availableProjects.forEach((project) => {
    const suffix = project.delete_status === "active" ? "" : " (pending_purge)";
    ensureSelectOption(els.batchProjectSelect, project.id, `${project.name}${suffix}`);
  });
  if (!availableProjects.some((item) => item.id === state.batchProjectId)) {
    state.batchProjectId = availableProjects[0].id;
  }
  els.batchProjectSelect.value = state.batchProjectId;
}

function syncBatchQuestionnaireOptions(preferredId = "") {
  const rows = state.projectQuestionnaires[state.batchProjectId] || [];
  els.batchQuestionnaireSelect.innerHTML = "";

  if (!rows.length) {
    state.batchQuestionnaireId = "";
    ensureSelectOption(els.batchQuestionnaireSelect, "", "当前项目暂无问卷");
    els.batchQuestionnaireSelect.disabled = true;
    return;
  }

  els.batchQuestionnaireSelect.disabled = false;
  rows.forEach((item) => {
    ensureSelectOption(els.batchQuestionnaireSelect, item.id, `${item.title} (${item.version})`);
  });
  const candidate = preferredId || state.batchQuestionnaireId;
  if (!rows.some((item) => item.id === candidate)) {
    state.batchQuestionnaireId = rows[0].id;
  } else {
    state.batchQuestionnaireId = candidate;
  }
  els.batchQuestionnaireSelect.value = state.batchQuestionnaireId;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function exportRowsToCsv(rows, filenamePrefix) {
  if (!rows.length) {
    throw new Error("没有可导出的链接");
  }
  const headers = [
    "full_url",
    "token",
    "project_id",
    "questionnaire_id",
    "questionnaire_title",
    "batch_id",
    "created_at",
  ];
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = headers.map((key) => csvEscape(row[key])).join(",");
    lines.push(line);
  });
  downloadText(lines.join("\n"), `${filenamePrefix}_${Date.now()}.csv`, "text/csv;charset=utf-8");
}

function exportRowsToTxt(rows, filenamePrefix) {
  if (!rows.length) {
    throw new Error("没有可导出的链接");
  }
  const text = rows.map((row) => row.full_url).join("\n");
  downloadText(text, `${filenamePrefix}_${Date.now()}.txt`, "text/plain;charset=utf-8");
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  link.remove();
}

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function buildSurveyUrl(token) {
  return `${state.baseUrl}/take/${token}`;
}

async function fetchBatchRows(batchId) {
  const response = await api(`/admin/batches/${batchId}/links`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  return (payload.links || []).map((link) => ({
    full_url: buildSurveyUrl(link.token),
    token: link.token,
    project_id: payload.project_id,
    questionnaire_id: payload.questionnaire_id,
    questionnaire_title: payload.questionnaire_title,
    batch_id: payload.batch_id,
    created_at: payload.created_at,
  }));
}

function renderBatchTable() {
  const rows = state.projectBatches || [];
  els.batchTableBody.innerHTML = "";
  if (!rows.length) {
    els.batchTableBody.innerHTML = '<tr><td colspan="6">当前筛选条件下暂无批次</td></tr>';
    return;
  }

  rows.forEach((batch) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="cell-sub">${escapeHTML(batch.batch_id)}</div></td>
      <td>
        <div class="cell-main">${escapeHTML(batch.questionnaire_title || "-")}</div>
        <div class="cell-sub">questionnaire_id: ${escapeHTML(batch.questionnaire_id)}</div>
      </td>
      <td><div class="cell-sub">${escapeHTML(formatTime(batch.created_at))}</div></td>
      <td><div class="cell-sub">${escapeHTML(batch.link_count)}</div></td>
      <td><div class="cell-sub">${batch.expires_in_days ?? "-"}</div></td>
      <td>
        <div class="cell-actions">
          <button class="btn btn-light btn-copy">复制链接</button>
          <button class="btn btn-light btn-csv">CSV</button>
          <button class="btn btn-light btn-txt">TXT</button>
        </div>
      </td>
    `;
    tr.querySelector(".btn-copy").addEventListener("click", async () => {
      try {
        const exportRows = await fetchBatchRows(batch.batch_id);
        const text = exportRows.map((row) => row.full_url).join("\n");
        await copyText(text);
        showStatus(els.batchStats, `已复制批次 ${batch.batch_id} 的 ${exportRows.length} 条链接`, "ok");
      } catch (err) {
        showStatus(els.batchStats, String(err.message || err), "error");
      }
    });
    tr.querySelector(".btn-csv").addEventListener("click", async () => {
      try {
        const exportRows = await fetchBatchRows(batch.batch_id);
        exportRowsToCsv(exportRows, `links_${batch.batch_id}`);
        showStatus(els.batchStats, `批次 ${batch.batch_id} CSV 导出完成`, "ok");
      } catch (err) {
        showStatus(els.batchStats, String(err.message || err), "error");
      }
    });
    tr.querySelector(".btn-txt").addEventListener("click", async () => {
      try {
        const exportRows = await fetchBatchRows(batch.batch_id);
        exportRowsToTxt(exportRows, `links_${batch.batch_id}`);
        showStatus(els.batchStats, `批次 ${batch.batch_id} TXT 导出完成`, "ok");
      } catch (err) {
        showStatus(els.batchStats, String(err.message || err), "error");
      }
    });
    els.batchTableBody.appendChild(tr);
  });
}

async function createBatch() {
  if (!state.batchProjectId) {
    showStatus(els.batchStats, "请先选择项目", "error");
    return;
  }
  if (!state.batchQuestionnaireId) {
    showStatus(els.batchStats, "请先选择问卷", "error");
    return;
  }
  const project = state.projects.find((item) => item.id === state.batchProjectId);
  if (project && project.delete_status !== "active") {
    showStatus(els.batchStats, "当前项目不是 active 状态，不能新增链接批次", "error");
    return;
  }

  const count = Number(els.batchCount.value || 0);
  const expiresInDays = Number(els.batchExpire.value || 0);
  if (!Number.isFinite(count) || count < 1) {
    showStatus(els.batchStats, "链接数量必须 >= 1", "error");
    return;
  }

  const payload = { questionnaire_id: state.batchQuestionnaireId, count };
  if (Number.isFinite(expiresInDays) && expiresInDays > 0) {
    payload.expires_in_days = expiresInDays;
  }

  showStatus(els.batchStats, "创建批次中...");
  const response = await api(`/admin/projects/${state.batchProjectId}/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.batchStats, parseApiError(body, response.status), "error");
    return;
  }

  await loadProjectBatches();
  showStatus(els.batchStats, `创建成功：batch_id=${body.batch_id}，链接数=${body.links?.length || 0}`, "ok");
}

async function exportProjectBatchesAs(format) {
  if (!state.batchProjectId) {
    showStatus(els.batchStats, "请先选择项目", "error");
    return;
  }
  showStatus(els.batchStats, "正在汇总项目批次链接...");
  const listResponse = await api(`/admin/projects/${state.batchProjectId}/batches`);
  const listPayload = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    showStatus(els.batchStats, parseApiError(listPayload, listResponse.status), "error");
    return;
  }
  const allBatches = Array.isArray(listPayload.batches) ? listPayload.batches : [];
  if (!allBatches.length) {
    showStatus(els.batchStats, "当前项目暂无批次可导出", "error");
    return;
  }

  const results = await Promise.all(allBatches.map((batch) => fetchBatchRows(batch.batch_id)));
  const rows = results.flat();
  if (!rows.length) {
    showStatus(els.batchStats, "当前项目暂无链接可导出", "error");
    return;
  }

  const filenamePrefix = `project_${state.batchProjectId}_all_batches`;
  if (format === "csv") {
    exportRowsToCsv(rows, filenamePrefix);
    showStatus(els.batchStats, `项目批次 CSV 导出完成，共 ${rows.length} 条链接`, "ok");
    return;
  }
  exportRowsToTxt(rows, filenamePrefix);
  showStatus(els.batchStats, `项目批次 TXT 导出完成，共 ${rows.length} 条链接`, "ok");
}
async function login() {
  state.baseUrl = getBaseUrlFromInput();
  localStorage.setItem(STORAGE_BASE_URL, state.baseUrl);
  setBaseUrlInput(state.baseUrl);
  const payload = {
    username: els.username.value.trim(),
    password: els.password.value,
  };
  if (!payload.username || !payload.password) {
    showStatus(els.statusAuth, "请输入管理员账号和密码", "error");
    return;
  }

  showStatus(els.statusAuth, "登录中...");
  try {
    const response = await fetch(`${state.baseUrl}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parseApiError(body, response.status));
    }
    state.token = body.access_token;
    localStorage.setItem("admin_token", state.token);
    setAuthedUI(true);
    await switchPage(state.activePage);
    showStatus(els.statusAuth, "登录成功", "ok");
    await loadProjects();
  } catch (err) {
    showStatus(els.statusAuth, String(err.message || err), "error");
  }
}

function logout() {
  state.token = "";
  localStorage.removeItem("admin_token");
  setAuthedUI(false);
}

async function importProject() {
  let data;
  try {
    data = JSON.parse(els.importJson.value);
  } catch (_) {
    showStatus(els.statusImport, "导入 JSON 解析失败，请检查格式", "error");
    return;
  }
  showStatus(els.statusImport, "导入中...");

  const response = await api("/admin/projects/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusImport, parseApiError(payload, response.status), "error");
    return;
  }

  showStatus(
    els.statusImport,
    `导入成功：project_id=${payload.project_id}，questionnaire_id=${payload.questionnaire_id}`,
    "ok",
  );
  await loadProjects();
}

function pickFileAndLoad() {
  const file = els.importFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    els.importJson.value = String(reader.result || "");
  };
  reader.readAsText(file, "utf-8");
}

async function loadProjects() {
  const includePurged = els.includePurged.checked ? "true" : "false";
  const response = await api(`/admin/projects?include_purged=${includePurged}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }
  state.projects = Array.isArray(payload.projects) ? payload.projects : [];
  state.projectPage = 1;
  renderProjectTable();
  syncBatchProjectOptions();
  showStatus(els.statusProjects, `已加载 ${state.projects.length} 个项目`, "ok");
  if (state.activePage === "batches") {
    await ensureBatchPageReady();
  }
}

async function softDeleteProject(project) {
  const confirmed = window.prompt(`请输入项目名确认删除：${project.name}`);
  if (!confirmed) return;
  const response = await api(`/admin/projects/${project.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm_project_name: confirmed }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
}

async function purgeProject(projectId) {
  const sure = window.confirm("确认立即清理该项目全部数据？该操作不可恢复。");
  if (!sure) return;
  const response = await api(`/admin/projects/${projectId}/purge`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
}

async function purgeDueProjects() {
  const response = await api("/admin/projects/purge_due", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }
  showStatus(els.statusProjects, `已处理到期项目：${payload.length || 0}`, "ok");
  await loadProjects();
}

function closeProjectDrawer() {
  els.projectDrawer.classList.add("hidden");
  els.drawerMask.classList.add("hidden");
  state.selectedProject = null;
  els.drawerQuestionnaires.innerHTML = "";
}

function openProjectDrawer(project) {
  state.selectedProject = project;
  els.drawerProjectName.textContent = project.name;
  els.drawerProjectMeta.textContent = `project_key: ${project.project_key} | status: ${project.delete_status}`;
  showStatus(els.drawerStatus, "加载问卷中...");
  els.projectDrawer.classList.remove("hidden");
  els.drawerMask.classList.remove("hidden");
  loadProjectQuestionnaires(project.id, { forceRefresh: true })
    .then((rows) => {
      renderDrawerQuestionnaires(project, rows);
      showStatus(els.drawerStatus, `问卷数：${rows.length}`, "ok");
    })
    .catch((err) => {
      showStatus(els.drawerStatus, String(err.message || err), "error");
    });
}

async function loadProjectQuestionnaires(projectId, { forceRefresh = false } = {}) {
  if (!forceRefresh && Array.isArray(state.projectQuestionnaires[projectId])) {
    return state.projectQuestionnaires[projectId];
  }
  const response = await api(`/admin/projects/${projectId}/questionnaires`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  const questionnaires = Array.isArray(payload.questionnaires) ? payload.questionnaires : [];
  state.projectQuestionnaires[projectId] = questionnaires;
  return questionnaires;
}

async function loadProjectBatches() {
  if (!state.batchProjectId) {
    state.projectBatches = [];
    renderBatchTable();
    return;
  }
  let path = `/admin/projects/${state.batchProjectId}/batches`;
  if (state.batchQuestionnaireId) {
    path += `?questionnaire_id=${encodeURIComponent(state.batchQuestionnaireId)}`;
  }
  const response = await api(path);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.batchStats, parseApiError(payload, response.status), "error");
    state.projectBatches = [];
    renderBatchTable();
    return;
  }
  state.projectBatches = Array.isArray(payload.batches) ? payload.batches : [];
  renderBatchTable();
  const totalLinks = state.projectBatches.reduce((sum, row) => sum + (row.link_count || 0), 0);
  showStatus(els.batchStats, `批次数：${state.projectBatches.length}，链接数：${totalLinks}`, "ok");
}

async function ensureBatchPageReady(preferredQuestionnaireId = "") {
  syncBatchProjectOptions();
  if (!state.batchProjectId) return;
  try {
    await loadProjectQuestionnaires(state.batchProjectId);
    syncBatchQuestionnaireOptions(preferredQuestionnaireId);
    await loadProjectBatches();
  } catch (err) {
    showStatus(els.batchStats, String(err.message || err), "error");
  }
}

async function exportQuestionnaire(projectId, questionnaireId) {
  const response = await api(`/admin/exports/${projectId}?questionnaire_id=${questionnaireId}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(parseApiError(payload, response.status));
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=\"(.+)\"/);
  const filename = match?.[1] || `export_${projectId}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  link.remove();
}

async function updateQuestionnaireSettings(questionnaireId, payload) {
  const response = await api(`/admin/questionnaires/${questionnaireId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(body, response.status));
  }
  return body;
}
function renderDrawerQuestionnaires(project, questionnaires) {
  els.drawerQuestionnaires.innerHTML = "";
  if (!questionnaires.length) {
    els.drawerQuestionnaires.innerHTML = `<div class="acc-item"><div class="acc-body">当前项目没有问卷</div></div>`;
    return;
  }

  questionnaires.forEach((q, idx) => {
    const item = document.createElement("div");
    item.className = "acc-item";
    item.innerHTML = `
      <button class="acc-head" type="button">
        <div class="acc-title">${escapeHTML(q.title)} (${escapeHTML(q.version)})</div>
        <div class="acc-meta">id: ${escapeHTML(q.id)} | 题组随机: ${q.randomize_groups ? "是" : "否"} | 题目随机: ${
      q.randomize_items ? "是" : "否"
    }</div>
      </button>
      <div class="acc-body hidden">
        <div class="mini-grid">
          <div class="mini-card">同意页：${q.consent_enabled ? "开启" : "关闭"}</div>
          <div class="mini-card">创建时间：${escapeHTML(formatTime(q.created_at))}</div>
        </div>
        <div class="consent-editor">
          <label class="check-inline">
            <input class="field-consent-enabled" type="checkbox" ${q.consent_enabled ? "checked" : ""} />
            启用知情同意页
          </label>
          <label>知情同意文案（留空时使用系统默认文案）</label>
          <textarea class="field-consent-text" placeholder="请输入知情同意文案">${escapeHTML(q.consent_text || "")}</textarea>
          <div class="btn-row">
            <button class="btn btn-light btn-save-consent">保存知情同意设置</button>
          </div>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-light btn-open-batches">去“链接批次”页面管理发放链接</button>
          <button class="btn btn-light btn-export-xlsx">导出答卷 xlsx</button>
        </div>
        <div class="status local-status"></div>
      </div>
    `;

    const head = item.querySelector(".acc-head");
    const body = item.querySelector(".acc-body");
    const consentEnabledInput = item.querySelector(".field-consent-enabled");
    const consentTextInput = item.querySelector(".field-consent-text");
    const localStatus = item.querySelector(".local-status");
    const btnOpenBatches = item.querySelector(".btn-open-batches");
    const btnExportXlsx = item.querySelector(".btn-export-xlsx");
    const btnSaveConsent = item.querySelector(".btn-save-consent");

    if (idx === 0) {
      body.classList.remove("hidden");
    }

    head.addEventListener("click", () => {
      body.classList.toggle("hidden");
    });

    btnSaveConsent.addEventListener("click", async () => {
      showStatus(localStatus, "保存中...");
      try {
        const updated = await updateQuestionnaireSettings(q.id, {
          consent_enabled: Boolean(consentEnabledInput.checked),
          consent_text: consentTextInput.value,
        });
        q.consent_enabled = Boolean(updated.consent_enabled);
        q.consent_text = updated.consent_text || "";
        showStatus(localStatus, "知情同意设置已保存", "ok");
      } catch (err) {
        showStatus(localStatus, String(err.message || err), "error");
      }
    });

    btnOpenBatches.addEventListener("click", async () => {
      state.batchProjectId = project.id;
      state.batchQuestionnaireId = q.id;
      await switchPage("batches");
      showStatus(els.batchStats, `已定位到项目「${project.name}」问卷「${q.title}」`, "ok");
    });

    btnExportXlsx.addEventListener("click", async () => {
      showStatus(localStatus, "导出中...");
      try {
        await exportQuestionnaire(project.id, q.id);
        showStatus(localStatus, "答卷导出完成", "ok");
      } catch (err) {
        showStatus(localStatus, String(err.message || err), "error");
      }
    });

    els.drawerQuestionnaires.appendChild(item);
  });
}

function bindEvents() {
  els.btnLogin.addEventListener("click", login);
  els.btnLogout.addEventListener("click", logout);
  els.btnFillTemplate.addEventListener("click", () => {
    els.importJson.value = templateJson();
  });
  els.btnPickFile.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", pickFileAndLoad);
  els.btnImport.addEventListener("click", importProject);

  els.navItems.forEach((item) => {
    item.addEventListener("click", async () => {
      await switchPage(item.dataset.page);
    });
  });

  els.baseUrlMain.addEventListener("change", () => {
    state.baseUrl = getBaseUrlFromInput();
    setBaseUrlInput(state.baseUrl);
    localStorage.setItem(STORAGE_BASE_URL, state.baseUrl);
  });

  els.btnRefresh.addEventListener("click", loadProjects);
  els.btnPurgeDue.addEventListener("click", purgeDueProjects);
  els.includePurged.addEventListener("change", loadProjects);
  els.projectSearch.addEventListener("input", () => {
    state.projectSearch = els.projectSearch.value || "";
    state.projectPage = 1;
    renderProjectTable();
  });
  els.projectStatusFilter.addEventListener("change", () => {
    state.projectStatus = els.projectStatusFilter.value || "all";
    state.projectPage = 1;
    renderProjectTable();
  });
  els.projectPageSize.addEventListener("change", () => {
    state.projectPageSize = Number(els.projectPageSize.value || 8);
    state.projectPage = 1;
    renderProjectTable();
  });
  els.btnPagePrev.addEventListener("click", () => {
    state.projectPage -= 1;
    renderProjectTable();
  });
  els.btnPageNext.addEventListener("click", () => {
    state.projectPage += 1;
    renderProjectTable();
  });

  els.btnCloseDrawer.addEventListener("click", closeProjectDrawer);
  els.drawerMask.addEventListener("click", closeProjectDrawer);
  els.btnDrawerSoftDelete.addEventListener("click", async () => {
    if (!state.selectedProject) return;
    try {
      await softDeleteProject(state.selectedProject);
      showStatus(els.drawerStatus, "软删除成功", "ok");
      await loadProjects();
    } catch (err) {
      showStatus(els.drawerStatus, String(err.message || err), "error");
    }
  });
  els.btnDrawerPurge.addEventListener("click", async () => {
    if (!state.selectedProject) return;
    try {
      await purgeProject(state.selectedProject.id);
      showStatus(els.drawerStatus, "清理成功", "ok");
      await loadProjects();
      closeProjectDrawer();
    } catch (err) {
      showStatus(els.drawerStatus, String(err.message || err), "error");
    }
  });

  els.batchProjectSelect.addEventListener("change", async () => {
    state.batchProjectId = els.batchProjectSelect.value;
    state.batchQuestionnaireId = "";
    await ensureBatchPageReady();
  });
  els.batchQuestionnaireSelect.addEventListener("change", async () => {
    state.batchQuestionnaireId = els.batchQuestionnaireSelect.value;
    await loadProjectBatches();
  });
  els.btnCreateBatch.addEventListener("click", createBatch);
  els.btnRefreshBatches.addEventListener("click", loadProjectBatches);
  els.btnExportProjectCsv.addEventListener("click", async () => {
    try {
      await exportProjectBatchesAs("csv");
    } catch (err) {
      showStatus(els.batchStats, String(err.message || err), "error");
    }
  });
  els.btnExportProjectTxt.addEventListener("click", async () => {
    try {
      await exportProjectBatchesAs("txt");
    } catch (err) {
      showStatus(els.batchStats, String(err.message || err), "error");
    }
  });
}

async function bootstrap() {
  setBaseUrlInput(state.baseUrl);
  els.projectStatusFilter.value = "all";
  els.projectPageSize.value = String(state.projectPageSize);
  bindEvents();

  if (!state.token) {
    setAuthedUI(false);
    return;
  }
  setAuthedUI(true);
  await switchPage(state.activePage);
  await loadProjects();
}

bootstrap();
