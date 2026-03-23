
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
  selectedProjectIds: new Set(),
  projectCurrentPageIds: [],
  selectedProject: null,
  projectQuestionnaires: {},
  batchProjectId: "",
  batchQuestionnaireId: "",
  projectBatches: [],
  batchFilterSearch: "",
  batchFilterQuestionnaireId: "all",
  batchDateFrom: "",
  batchDateTo: "",
  batchPage: 1,
  batchPageSize: 8,
  confirmResolver: null,
  confirmState: {
    requireInput: false,
    expectedValue: "",
  },
};

const els = {
  loginPanel: document.getElementById("login-panel"),
  appPanel: document.getElementById("app-panel"),
  statusAuth: document.getElementById("status-auth"),
  statusImport: document.getElementById("status-import"),
  statusProjects: document.getElementById("status-projects"),
  projectsSummary: document.getElementById("projects-summary"),
  batchContext: document.getElementById("batch-context"),
  projectBulkBar: document.getElementById("project-bulk-bar"),
  projectSelectedCount: document.getElementById("project-selected-count"),

  username: document.getElementById("username"),
  password: document.getElementById("password"),
  baseUrlLogin: document.getElementById("base-url"),
  baseUrlMain: document.getElementById("base-url-main"),

  workspaceTitle: document.getElementById("workspace-title"),
  workspaceSubtitle: document.getElementById("workspace-subtitle"),
  workspaceBadge: document.getElementById("workspace-badge"),

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
  projectCheckAllPage: document.getElementById("project-check-all-page"),
  btnProjectSelectPage: document.getElementById("btn-project-select-page"),
  btnProjectBulkDelete: document.getElementById("btn-project-bulk-delete"),
  btnProjectBulkRestore: document.getElementById("btn-project-bulk-restore"),
  btnProjectBulkPurge: document.getElementById("btn-project-bulk-purge"),
  btnProjectClearSelection: document.getElementById("btn-project-clear-selection"),
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
  btnDrawerRestore: document.getElementById("btn-drawer-restore"),
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
  batchSearch: document.getElementById("batch-search"),
  batchHistoryQuestionnaire: document.getElementById("batch-history-questionnaire"),
  batchDateFrom: document.getElementById("batch-date-from"),
  batchDateTo: document.getElementById("batch-date-to"),
  batchPageSize: document.getElementById("batch-page-size"),
  btnBatchPagePrev: document.getElementById("btn-batch-page-prev"),
  btnBatchPageNext: document.getElementById("btn-batch-page-next"),
  batchPageIndicator: document.getElementById("batch-page-indicator"),
  batchTableBody: document.getElementById("batch-table-body"),

  confirmMask: document.getElementById("confirm-mask"),
  confirmDialog: document.getElementById("confirm-dialog"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmMessage: document.getElementById("confirm-message"),
  confirmInputWrap: document.getElementById("confirm-input-wrap"),
  confirmInput: document.getElementById("confirm-input"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmOk: document.getElementById("confirm-ok"),
};

const STATUS_CLASSES = ["error", "ok", "success", "loading", "empty", "warning"];

const PAGE_META = {
  import: {
    title: "导入中心",
    subtitle: "导入项目与问卷 JSON，统一管理导入流程",
    badge: "导入流程",
  },
  projects: {
    title: "项目管理",
    subtitle: "支持搜索、筛选、分页，并在详情抽屉中维护问卷设置",
    badge: "项目维护",
  },
  batches: {
    title: "链接批次",
    subtitle: "按项目管理链接批次，可导出单批次或全项目链接",
    badge: "发放管理",
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

function setInputInvalid(inputEl, invalid) {
  if (!inputEl) return;
  inputEl.classList.toggle("input-invalid", Boolean(invalid));
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
  const normalizedTone = tone === "success" ? "ok" : tone;
  el.classList.remove(...STATUS_CLASSES);
  el.textContent = String(message || "");
  if (normalizedTone && normalizedTone !== "normal") {
    el.classList.add(normalizedTone);
  }
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
  if (els.workspaceBadge) {
    els.workspaceBadge.textContent = meta.badge;
  }

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

function pruneProjectSelectionToExisting() {
  if (!state.selectedProjectIds.size) return;
  const existingIds = new Set(state.projects.map((item) => item.id));
  for (const projectId of Array.from(state.selectedProjectIds)) {
    if (!existingIds.has(projectId)) {
      state.selectedProjectIds.delete(projectId);
    }
  }
}

function clearProjectSelection({ showMessage = false } = {}) {
  if (!state.selectedProjectIds.size) return;
  state.selectedProjectIds.clear();
  state.projectCurrentPageIds = [];
  if (els.projectCheckAllPage) {
    els.projectCheckAllPage.checked = false;
    els.projectCheckAllPage.indeterminate = false;
    els.projectCheckAllPage.disabled = true;
  }
  renderProjectBulkBar();
  if (showMessage) {
    showStatus(els.statusProjects, "筛选条件已变化，已清空已选项目", "warning");
  }
}

function syncProjectCheckAllState() {
  const pageIds = state.projectCurrentPageIds || [];
  if (!els.projectCheckAllPage) return;
  if (!pageIds.length) {
    els.projectCheckAllPage.checked = false;
    els.projectCheckAllPage.indeterminate = false;
    els.projectCheckAllPage.disabled = true;
    return;
  }

  const selectedCount = pageIds.filter((id) => state.selectedProjectIds.has(id)).length;
  els.projectCheckAllPage.disabled = false;
  els.projectCheckAllPage.checked = selectedCount === pageIds.length;
  els.projectCheckAllPage.indeterminate = selectedCount > 0 && selectedCount < pageIds.length;
}

function renderProjectBulkBar() {
  const count = state.selectedProjectIds.size;
  if (els.projectSelectedCount) {
    els.projectSelectedCount.textContent = String(count);
  }
  if (!els.projectBulkBar) return;
  els.projectBulkBar.classList.toggle("hidden", count <= 0);
}

function summarizeBulkSkippedRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const preview = rows
    .slice(0, 4)
    .map((row) => `${row.project_id || "-"}: ${row.reason || "skipped"}`)
    .join("\n");
  if (rows.length <= 4) return preview;
  return `${preview}\n... 其余 ${rows.length - 4} 条已省略`;
}

function renderProjectSummary(filteredRows) {
  if (!els.projectsSummary) return;
  const total = state.projects.length;
  const active = state.projects.filter((item) => item.delete_status === "active").length;
  const pending = state.projects.filter((item) => item.delete_status === "pending_purge").length;

  els.projectsSummary.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">当前筛选结果</div>
      <div class="summary-value">${filteredRows.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">项目总数</div>
      <div class="summary-value">${total}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">active</div>
      <div class="summary-value">${active}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">pending_purge</div>
      <div class="summary-value">${pending}</div>
    </div>
  `;
}

function renderProjectTable() {
  pruneProjectSelectionToExisting();
  const filtered = getFilteredProjects();
  const pageSize = state.projectPageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.projectPage = Math.min(Math.max(1, state.projectPage), totalPages);
  const start = (state.projectPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  state.projectCurrentPageIds = pageRows.map((item) => item.id);

  renderProjectSummary(filtered);

  els.projectsTableBody.innerHTML = "";
  if (!pageRows.length) {
    els.projectsTableBody.innerHTML = `<tr><td colspan="6">暂无项目</td></tr>`;
  } else {
    pageRows.forEach((project) => {
      const tr = document.createElement("tr");
      const restoreButton = project.delete_status === "pending_purge"
        ? '<button class="btn btn-secondary btn-restore">恢复</button>'
        : "";
      tr.innerHTML = `
        <td class="col-select-cell">
          <input class="project-row-check" type="checkbox" aria-label="选择项目 ${escapeHTML(project.name)}" ${
            state.selectedProjectIds.has(project.id) ? "checked" : ""
          } />
        </td>
        <td>
          <div class="cell-main">${escapeHTML(project.name)}</div>
          <div class="cell-sub">id: ${escapeHTML(project.id)}</div>
        </td>
        <td><div class="cell-sub">${escapeHTML(project.project_key)}</div></td>
        <td><span class="pill ${statusClass(project.delete_status)}">${escapeHTML(project.delete_status)}</span></td>
        <td><div class="cell-sub">${escapeHTML(formatTime(project.created_at))}</div></td>
        <td>
          <div class="cell-actions">
            <button class="btn btn-secondary btn-view">详情</button>
            <button class="btn btn-danger btn-soft-delete">软删除</button>
            ${restoreButton}
            <button class="btn btn-warning btn-purge">清理</button>
          </div>
        </td>
      `;

      tr.querySelector(".project-row-check").addEventListener("change", (event) => {
        if (event.target.checked) {
          state.selectedProjectIds.add(project.id);
        } else {
          state.selectedProjectIds.delete(project.id);
        }
        renderProjectBulkBar();
        syncProjectCheckAllState();
      });

      tr.querySelector(".btn-view").addEventListener("click", () => openProjectDrawer(project));

      tr.querySelector(".btn-soft-delete").addEventListener("click", async () => {
        try {
          const changed = await softDeleteProject(project);
          if (changed) {
            await loadProjects();
            showStatus(els.statusProjects, `项目「${project.name}」已进入待清理状态`, "ok");
          }
        } catch (err) {
          showStatus(els.statusProjects, String(err.message || err), "error");
        }
      });

      const btnRestore = tr.querySelector(".btn-restore");
      if (btnRestore) {
        btnRestore.addEventListener("click", async () => {
          try {
            const changed = await restoreProject(project);
            if (changed) {
              await loadProjects();
              showStatus(els.statusProjects, `项目「${project.name}」已恢复为 active`, "ok");
            }
          } catch (err) {
            showStatus(els.statusProjects, String(err.message || err), "error");
          }
        });
      }

      tr.querySelector(".btn-purge").addEventListener("click", async () => {
        try {
          const changed = await purgeProject(project.id, project.name);
          if (changed) {
            await loadProjects();
            showStatus(els.statusProjects, `项目「${project.name}」已清理`, "ok");
          }
        } catch (err) {
          showStatus(els.statusProjects, String(err.message || err), "error");
        }
      });

      els.projectsTableBody.appendChild(tr);
    });
  }

  renderProjectBulkBar();
  syncProjectCheckAllState();
  els.pageIndicator.textContent = `第 ${state.projectPage} / ${totalPages} 页（共 ${filtered.length} 项）`;
  els.btnPagePrev.disabled = state.projectPage <= 1;
  els.btnPageNext.disabled = state.projectPage >= totalPages;
}
function getAvailableBatchProjects() {
  return state.projects.filter((item) => item.delete_status !== "purged");
}

function renderBatchContext() {
  if (!els.batchContext) return;
  const selectedProject = state.projects.find((item) => item.id === state.batchProjectId);
  const projectQuestionnaires = state.projectQuestionnaires[state.batchProjectId] || [];
  const selectedQuestionnaire = projectQuestionnaires.find((item) => item.id === state.batchQuestionnaireId);
  const filteredRows = getFilteredBatches();
  const totalLinks = filteredRows.reduce((sum, row) => sum + (row.link_count || 0), 0);

  els.batchContext.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">当前项目</div>
      <div class="summary-value">${escapeHTML(selectedProject?.name || "-")}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">当前问卷</div>
      <div class="summary-value">${escapeHTML(selectedQuestionnaire?.title || "-")}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">批次总数</div>
      <div class="summary-value">${state.projectBatches.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">筛选后批次数</div>
      <div class="summary-value">${filteredRows.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">筛选后链接总数</div>
      <div class="summary-value">${totalLinks}</div>
    </div>
  `;
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
    syncBatchHistoryQuestionnaireOptions([]);

    state.projectBatches = [];
    renderBatchTable();
    renderBatchContext();
    state.batchPage = 1;
    showStatus(els.batchStats, "暂无可用项目", "empty");
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
  state.batchPage = 1;
  renderBatchContext();
}

function syncBatchQuestionnaireOptions(preferredId = "") {
  const rows = state.projectQuestionnaires[state.batchProjectId] || [];
  els.batchQuestionnaireSelect.innerHTML = "";

  if (!rows.length) {
    state.batchQuestionnaireId = "";
    ensureSelectOption(els.batchQuestionnaireSelect, "", "当前项目暂无问卷");
    els.batchQuestionnaireSelect.disabled = true;
    syncBatchHistoryQuestionnaireOptions([]);
    renderBatchContext();
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
  syncBatchHistoryQuestionnaireOptions(rows);
  renderBatchContext();
}

function syncBatchHistoryQuestionnaireOptions(rows) {
  els.batchHistoryQuestionnaire.innerHTML = "";
  ensureSelectOption(els.batchHistoryQuestionnaire, "all", "全部问卷");
  rows.forEach((item) => {
    ensureSelectOption(els.batchHistoryQuestionnaire, item.id, `${item.title} (${item.version})`);
  });
  els.batchHistoryQuestionnaire.disabled = rows.length === 0;

  if (!rows.some((item) => item.id === state.batchFilterQuestionnaireId)) {
    state.batchFilterQuestionnaireId = "all";
  }
  els.batchHistoryQuestionnaire.value = state.batchFilterQuestionnaireId;
}

function toStartOfDayTs(rawDate) {
  if (!rawDate) return null;
  const ts = Date.parse(`${rawDate}T00:00:00`);
  return Number.isFinite(ts) ? ts : null;
}

function toEndOfDayTs(rawDate) {
  if (!rawDate) return null;
  const ts = Date.parse(`${rawDate}T23:59:59.999`);
  return Number.isFinite(ts) ? ts : null;
}

function getFilteredBatches() {
  let rows = state.projectBatches.slice();
  const keyword = state.batchFilterSearch.trim().toLowerCase();

  if (keyword) {
    rows = rows.filter((row) => {
      const sample = [row.batch_id, row.questionnaire_title, row.questionnaire_id].join(" ").toLowerCase();
      return sample.includes(keyword);
    });
  }

  if (state.batchFilterQuestionnaireId && state.batchFilterQuestionnaireId !== "all") {
    rows = rows.filter((row) => row.questionnaire_id === state.batchFilterQuestionnaireId);
  }

  const fromTs = toStartOfDayTs(state.batchDateFrom);
  const toTs = toEndOfDayTs(state.batchDateTo);
  if (fromTs !== null || toTs !== null) {
    rows = rows.filter((row) => {
      const createdTs = Date.parse(String(row.created_at || ""));
      if (!Number.isFinite(createdTs)) {
        return false;
      }
      if (fromTs !== null && createdTs < fromTs) {
        return false;
      }
      if (toTs !== null && createdTs > toTs) {
        return false;
      }
      return true;
    });
  }

  return rows;
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
  const filteredRows = getFilteredBatches();
  const pageSize = state.batchPageSize;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  state.batchPage = Math.min(Math.max(1, state.batchPage), totalPages);
  const start = (state.batchPage - 1) * pageSize;
  const rows = filteredRows.slice(start, start + pageSize);

  els.batchTableBody.innerHTML = "";

  if (!filteredRows.length) {
    els.batchTableBody.innerHTML = '<tr><td colspan="6">当前筛选条件下暂无批次</td></tr>';
    els.batchPageIndicator.textContent = "第 1 / 1 页（共 0 项）";
    els.btnBatchPagePrev.disabled = true;
    els.btnBatchPageNext.disabled = true;
    renderBatchContext();
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
          <button class="btn btn-secondary btn-copy">复制链接</button>
          <button class="btn btn-secondary btn-csv">CSV</button>
          <button class="btn btn-secondary btn-txt">TXT</button>
          <button class="btn btn-danger btn-delete-batch">删除</button>
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

    tr.querySelector(".btn-delete-batch").addEventListener("click", async () => {
      try {
        const changed = await deleteBatch(batch);
        if (!changed) return;
        await loadProjectBatches();
        showStatus(els.batchStats, `批次 ${batch.batch_id} 已删除`, "ok");
      } catch (err) {
        showStatus(els.batchStats, String(err.message || err), "error");
      }
    });

    els.batchTableBody.appendChild(tr);
  });

  els.batchPageIndicator.textContent = `第 ${state.batchPage} / ${totalPages} 页（共 ${filteredRows.length} 项）`;
  els.btnBatchPagePrev.disabled = state.batchPage <= 1;
  els.btnBatchPageNext.disabled = state.batchPage >= totalPages;
  renderBatchContext();
}

async function createBatch() {
  if (!state.batchProjectId) {
    showStatus(els.batchStats, "请先选择项目", "warning");
    return;
  }
  if (!state.batchQuestionnaireId) {
    showStatus(els.batchStats, "请先选择问卷", "warning");
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
    showStatus(els.batchStats, "链接数量必须 >= 1", "warning");
    return;
  }

  const payload = { questionnaire_id: state.batchQuestionnaireId, count };
  if (Number.isFinite(expiresInDays) && expiresInDays > 0) {
    payload.expires_in_days = expiresInDays;
  }

  showStatus(els.batchStats, "创建批次中...", "loading");
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
  state.batchPage = 1;
  showStatus(els.batchStats, `创建成功：batch_id=${body.batch_id}，链接数=${body.links?.length || 0}`, "ok");
}

async function deleteBatch(batch) {
  const confirmed = await openConfirmDialog({
    title: "确认删除批次",
    message: `将删除批次记录 ${batch.batch_id}。\n此操作不会删除链接与作答数据。`,
    confirmText: "确认删除",
    danger: true,
    requireInput: false,
  });
  if (!confirmed) {
    return false;
  }

  const response = await api(`/admin/batches/${batch.batch_id}`, { method: "DELETE" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  return true;
}

async function exportProjectBatchesAs(format) {
  if (!state.batchProjectId) {
    showStatus(els.batchStats, "请先选择项目", "warning");
    return;
  }

  showStatus(els.batchStats, "正在汇总项目批次链接...", "loading");
  const listResponse = await api(`/admin/projects/${state.batchProjectId}/batches`);
  const listPayload = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    showStatus(els.batchStats, parseApiError(listPayload, listResponse.status), "error");
    return;
  }

  const allBatches = Array.isArray(listPayload.batches) ? listPayload.batches : [];
  if (!allBatches.length) {
    showStatus(els.batchStats, "当前项目暂无批次可导出", "empty");
    return;
  }

  const results = await Promise.all(allBatches.map((batch) => fetchBatchRows(batch.batch_id)));
  const rows = results.flat();
  if (!rows.length) {
    showStatus(els.batchStats, "当前项目暂无链接可导出", "empty");
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

function syncConfirmButtonState() {
  const { requireInput, expectedValue } = state.confirmState;
  if (!requireInput) {
    els.confirmOk.disabled = false;
    return;
  }

  const value = (els.confirmInput.value || "").trim();
  if (!expectedValue) {
    els.confirmOk.disabled = value.length === 0;
    return;
  }
  els.confirmOk.disabled = value !== expectedValue;
}

function closeConfirmDialog(result) {
  els.confirmMask.classList.add("hidden");
  els.confirmDialog.classList.add("hidden");
  els.confirmDialog.classList.remove("danger");
  els.confirmInput.value = "";
  state.confirmState = { requireInput: false, expectedValue: "" };

  if (state.confirmResolver) {
    state.confirmResolver(Boolean(result));
    state.confirmResolver = null;
  }
}

function openConfirmDialog({
  title,
  message,
  confirmText = "确认",
  danger = true,
  requireInput = false,
  inputLabel = "请输入确认文本",
  expectedValue = "",
}) {
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
    state.confirmState = { requireInput, expectedValue };

    els.confirmTitle.textContent = title || "确认操作";
    els.confirmMessage.textContent = message || "请确认是否继续。";
    els.confirmOk.textContent = confirmText;
    els.confirmDialog.classList.toggle("danger", Boolean(danger));

    const label = els.confirmInputWrap.querySelector("label");
    if (label) {
      label.textContent = inputLabel;
    }

    if (requireInput) {
      els.confirmInputWrap.classList.remove("hidden");
      els.confirmInput.value = "";
      els.confirmInput.placeholder = expectedValue ? `请输入：${expectedValue}` : "请输入确认文本";
    } else {
      els.confirmInputWrap.classList.add("hidden");
      els.confirmInput.value = "";
      els.confirmInput.placeholder = "";
    }

    els.confirmMask.classList.remove("hidden");
    els.confirmDialog.classList.remove("hidden");
    syncConfirmButtonState();

    window.setTimeout(() => {
      if (requireInput) {
        els.confirmInput.focus();
      } else {
        els.confirmOk.focus();
      }
    }, 0);
  });
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
    showStatus(els.statusAuth, "请输入管理员账号和密码", "warning");
    return;
  }

  showStatus(els.statusAuth, "登录中...", "loading");
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
  closeProjectDrawer();
  closeConfirmDialog(false);
  setAuthedUI(false);
}

async function importProject() {
  let data;
  try {
    data = JSON.parse(els.importJson.value);
  } catch (_) {
    setInputInvalid(els.importJson, true);
    showStatus(els.statusImport, "导入 JSON 解析失败，请检查格式（建议先校验逗号与引号）", "error");
    return;
  }

  setInputInvalid(els.importJson, false);
  showStatus(els.statusImport, "导入中...", "loading");

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
    [
      "导入成功",
      `project_id: ${payload.project_id}`,
      `questionnaire_id: ${payload.questionnaire_id}`,
      `project_key: ${payload.project_key}`,
      `题组随机: ${payload.randomize_groups ? "是" : "否"}`,
      `题目随机: ${payload.randomize_items ? "是" : "否"}`,
    ].join("\n"),
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
    setInputInvalid(els.importJson, false);
    showStatus(els.statusImport, `已载入文件：${file.name}`, "ok");
  };
  reader.readAsText(file, "utf-8");
}

async function loadProjects() {
  const includePurged = els.includePurged.checked ? "true" : "false";
  showStatus(els.statusProjects, "加载项目中...", "loading");

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
  const confirmed = await openConfirmDialog({
    title: "确认软删除项目",
    message: `项目「${project.name}」将立即不可见并进入回收期。\n请输入项目名后确认。`,
    confirmText: "确认软删除",
    danger: true,
    requireInput: true,
    inputLabel: `请输入项目名（${project.name}）`,
    expectedValue: project.name,
  });

  if (!confirmed) {
    return false;
  }

  const response = await api(`/admin/projects/${project.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm_project_name: project.name }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  return true;
}

async function restoreProject(project) {
  const confirmed = await openConfirmDialog({
    title: "确认恢复项目",
    message: `项目「${project.name}」将从 pending_purge 恢复为 active。`,
    confirmText: "确认恢复",
    danger: false,
    requireInput: false,
  });
  if (!confirmed) {
    return false;
  }

  const response = await api(`/admin/projects/${project.id}/restore`, {
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  return true;
}

async function purgeProject(projectId, projectName = "该项目") {
  const confirmed = await openConfirmDialog({
    title: "确认立即清理项目",
    message: `项目「${projectName}」下所有数据将永久删除且不可恢复。`,
    confirmText: "确认清理",
    danger: true,
    requireInput: false,
  });

  if (!confirmed) {
    return false;
  }

  const response = await api(`/admin/projects/${projectId}/purge`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }
  return true;
}

async function purgeDueProjects() {
  const confirmed = await openConfirmDialog({
    title: "确认批量清理到期项目",
    message: "系统将清理所有已到期且处于待清理状态的项目数据。",
    confirmText: "确认执行",
    danger: false,
    requireInput: false,
  });
  if (!confirmed) {
    return;
  }

  showStatus(els.statusProjects, "正在清理到期项目...", "loading");
  const response = await api("/admin/projects/purge_due", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }

  showStatus(els.statusProjects, `已处理到期项目：${payload.length || 0}`, "ok");
  await loadProjects();
}

async function bulkSoftDeleteProjects() {
  const selectedIds = Array.from(state.selectedProjectIds);
  if (!selectedIds.length) {
    showStatus(els.statusProjects, "请先勾选项目", "warning");
    return;
  }

  const confirmed = await openConfirmDialog({
    title: "确认批量软删除项目",
    message: `将对已选 ${selectedIds.length} 个项目执行软删除（进入 pending_purge）。`,
    confirmText: "确认软删除",
    danger: true,
    requireInput: false,
  });
  if (!confirmed) return;

  showStatus(els.statusProjects, "批量软删除执行中...", "loading");
  const response = await api("/admin/projects/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_ids: selectedIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }

  clearProjectSelection();
  await loadProjects();
  const skippedRows = Array.isArray(payload.skipped) ? payload.skipped : [];
  const lines = [`批量软删除完成：成功 ${payload.updated_count || 0} / 请求 ${payload.requested_count || 0}`];
  if (skippedRows.length) {
    lines.push(`跳过 ${skippedRows.length} 项：\n${summarizeBulkSkippedRows(skippedRows)}`);
  }
  showStatus(els.statusProjects, lines.join("\n"), skippedRows.length ? "warning" : "ok");
}

async function bulkRestoreProjects() {
  const selectedIds = Array.from(state.selectedProjectIds);
  if (!selectedIds.length) {
    showStatus(els.statusProjects, "请先勾选项目", "warning");
    return;
  }

  const selectedRows = state.projects.filter((item) => state.selectedProjectIds.has(item.id));
  const pendingCount = selectedRows.filter((item) => item.delete_status === "pending_purge").length;
  if (!pendingCount) {
    showStatus(els.statusProjects, "已选项目中没有 pending_purge 项目，无法批量恢复", "warning");
    return;
  }

  const confirmed = await openConfirmDialog({
    title: "确认批量恢复项目",
    message: `已选 ${selectedIds.length} 个项目，其中可恢复项目为 ${pendingCount} 个。\n将把这些项目恢复为 active。`,
    confirmText: "确认恢复",
    danger: false,
    requireInput: false,
  });
  if (!confirmed) return;

  showStatus(els.statusProjects, "批量恢复执行中...", "loading");
  const response = await api("/admin/projects/bulk-restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_ids: selectedIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }

  clearProjectSelection();
  await loadProjects();
  const skippedRows = Array.isArray(payload.skipped) ? payload.skipped : [];
  const lines = [`批量恢复完成：成功 ${payload.restored_count || 0} / 请求 ${payload.requested_count || 0}`];
  if (skippedRows.length) {
    lines.push(`跳过 ${skippedRows.length} 项：\n${summarizeBulkSkippedRows(skippedRows)}`);
  }
  showStatus(els.statusProjects, lines.join("\n"), skippedRows.length ? "warning" : "ok");
}

async function bulkPurgeProjects() {
  const selectedIds = Array.from(state.selectedProjectIds);
  if (!selectedIds.length) {
    showStatus(els.statusProjects, "请先勾选项目", "warning");
    return;
  }

  const selectedRows = state.projects.filter((item) => state.selectedProjectIds.has(item.id));
  const pendingCount = selectedRows.filter((item) => item.delete_status === "pending_purge").length;
  if (!pendingCount) {
    showStatus(els.statusProjects, "已选项目中没有 pending_purge 项目，无法批量清理", "warning");
    return;
  }

  const confirmed = await openConfirmDialog({
    title: "确认批量清理项目",
    message: `已选 ${selectedIds.length} 个项目，其中待清理项目为 ${pendingCount} 个。\n该操作不可恢复，请输入待清理项目数量后确认。`,
    confirmText: "确认清理",
    danger: true,
    requireInput: true,
    inputLabel: `请输入待清理项目数量（${pendingCount}）`,
    expectedValue: String(pendingCount),
  });
  if (!confirmed) return;

  showStatus(els.statusProjects, "批量清理执行中...", "loading");
  const response = await api("/admin/projects/bulk-purge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_ids: selectedIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.statusProjects, parseApiError(payload, response.status), "error");
    return;
  }

  clearProjectSelection();
  await loadProjects();
  const skippedRows = Array.isArray(payload.skipped) ? payload.skipped : [];
  const lines = [`批量清理完成：成功 ${payload.purged_count || 0} / 请求 ${payload.requested_count || 0}`];
  if (skippedRows.length) {
    lines.push(`跳过 ${skippedRows.length} 项：\n${summarizeBulkSkippedRows(skippedRows)}`);
  }
  showStatus(els.statusProjects, lines.join("\n"), skippedRows.length ? "warning" : "ok");
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
  const isActive = project.delete_status === "active";
  const isPending = project.delete_status === "pending_purge";
  els.btnDrawerSoftDelete.disabled = !isActive;
  els.btnDrawerRestore.disabled = !isPending;
  els.btnDrawerPurge.disabled = !isPending;
  showStatus(els.drawerStatus, "加载问卷中...", "loading");

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
    renderBatchContext();
    return;
  }

  showStatus(els.batchStats, "加载批次中...", "loading");
  const response = await api(`/admin/projects/${state.batchProjectId}/batches`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(els.batchStats, parseApiError(payload, response.status), "error");
    state.projectBatches = [];
    renderBatchTable();
    return;
  }

  state.projectBatches = Array.isArray(payload.batches) ? payload.batches : [];
  renderBatchTable();
  const filteredRows = getFilteredBatches();
  const totalLinks = filteredRows.reduce((sum, row) => sum + (row.link_count || 0), 0);

  if (!filteredRows.length) {
    showStatus(els.batchStats, "当前筛选条件下暂无批次", "empty");
  } else {
    showStatus(els.batchStats, `筛选后批次数：${filteredRows.length}，筛选后链接数：${totalLinks}`, "ok");
  }
}

async function ensureBatchPageReady(preferredQuestionnaireId = "") {
  syncBatchProjectOptions();
  if (!state.batchProjectId) {
    renderBatchContext();
    return;
  }

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
  const match = disposition.match(/filename="(.+)"/);
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
            <button class="btn btn-secondary btn-save-consent">保存知情同意设置</button>
            <button class="btn btn-secondary btn-open-batches">去“链接批次”页</button>
            <button class="btn btn-secondary btn-export-xlsx">导出答卷 xlsx</button>
          </div>
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
      showStatus(localStatus, "保存中...", "loading");
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
      showStatus(localStatus, "导出中...", "loading");
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
    setInputInvalid(els.importJson, false);
    showStatus(els.statusImport, "已填充示例模板", "ok");
  });

  els.btnPickFile.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", pickFileAndLoad);
  els.btnImport.addEventListener("click", importProject);
  els.importJson.addEventListener("input", () => setInputInvalid(els.importJson, false));

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
  els.includePurged.addEventListener("change", () => {
    state.projectPage = 1;
    clearProjectSelection({ showMessage: true });
    loadProjects();
  });

  els.projectSearch.addEventListener("input", () => {
    state.projectSearch = els.projectSearch.value || "";
    state.projectPage = 1;
    clearProjectSelection({ showMessage: true });
    renderProjectTable();
  });

  els.projectStatusFilter.addEventListener("change", () => {
    state.projectStatus = els.projectStatusFilter.value || "all";
    state.projectPage = 1;
    clearProjectSelection({ showMessage: true });
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

  els.projectCheckAllPage.addEventListener("change", () => {
    const pageIds = state.projectCurrentPageIds || [];
    if (els.projectCheckAllPage.checked) {
      pageIds.forEach((projectId) => state.selectedProjectIds.add(projectId));
    } else {
      pageIds.forEach((projectId) => state.selectedProjectIds.delete(projectId));
    }
    renderProjectTable();
  });

  els.btnProjectSelectPage.addEventListener("click", () => {
    (state.projectCurrentPageIds || []).forEach((projectId) => state.selectedProjectIds.add(projectId));
    renderProjectTable();
  });

  els.btnProjectClearSelection.addEventListener("click", () => {
    clearProjectSelection();
    renderProjectTable();
  });

  els.btnProjectBulkDelete.addEventListener("click", bulkSoftDeleteProjects);
  els.btnProjectBulkRestore.addEventListener("click", bulkRestoreProjects);
  els.btnProjectBulkPurge.addEventListener("click", bulkPurgeProjects);

  els.btnCloseDrawer.addEventListener("click", closeProjectDrawer);
  els.drawerMask.addEventListener("click", closeProjectDrawer);

  els.btnDrawerSoftDelete.addEventListener("click", async () => {
    if (!state.selectedProject) return;
    try {
      const changed = await softDeleteProject(state.selectedProject);
      if (!changed) return;
      showStatus(els.drawerStatus, "软删除成功", "ok");
      await loadProjects();
    } catch (err) {
      showStatus(els.drawerStatus, String(err.message || err), "error");
    }
  });

  els.btnDrawerRestore.addEventListener("click", async () => {
    if (!state.selectedProject) return;
    try {
      const changed = await restoreProject(state.selectedProject);
      if (!changed) return;
      showStatus(els.drawerStatus, "恢复成功", "ok");
      await loadProjects();
      closeProjectDrawer();
    } catch (err) {
      showStatus(els.drawerStatus, String(err.message || err), "error");
    }
  });

  els.btnDrawerPurge.addEventListener("click", async () => {
    if (!state.selectedProject) return;
    try {
      const changed = await purgeProject(state.selectedProject.id, state.selectedProject.name);
      if (!changed) return;
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
    state.batchPage = 1;
    await ensureBatchPageReady();
  });

  els.batchQuestionnaireSelect.addEventListener("change", async () => {
    state.batchQuestionnaireId = els.batchQuestionnaireSelect.value;
    renderBatchContext();
  });

  els.batchSearch.addEventListener("input", () => {
    state.batchFilterSearch = els.batchSearch.value || "";
    state.batchPage = 1;
    renderBatchTable();
  });

  els.batchHistoryQuestionnaire.addEventListener("change", () => {
    state.batchFilterQuestionnaireId = els.batchHistoryQuestionnaire.value || "all";
    state.batchPage = 1;
    renderBatchTable();
  });

  els.batchDateFrom.addEventListener("change", () => {
    state.batchDateFrom = els.batchDateFrom.value || "";
    state.batchPage = 1;
    renderBatchTable();
  });

  els.batchDateTo.addEventListener("change", () => {
    state.batchDateTo = els.batchDateTo.value || "";
    state.batchPage = 1;
    renderBatchTable();
  });

  els.batchPageSize.addEventListener("change", () => {
    state.batchPageSize = Number(els.batchPageSize.value || 8);
    state.batchPage = 1;
    renderBatchTable();
  });

  els.btnBatchPagePrev.addEventListener("click", () => {
    state.batchPage -= 1;
    renderBatchTable();
  });

  els.btnBatchPageNext.addEventListener("click", () => {
    state.batchPage += 1;
    renderBatchTable();
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

  els.confirmInput.addEventListener("input", syncConfirmButtonState);
  els.confirmCancel.addEventListener("click", () => closeConfirmDialog(false));
  els.confirmMask.addEventListener("click", () => closeConfirmDialog(false));
  els.confirmOk.addEventListener("click", () => {
    if (els.confirmOk.disabled) return;
    closeConfirmDialog(true);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.confirmDialog.classList.contains("hidden")) {
      closeConfirmDialog(false);
      return;
    }
    if (!els.projectDrawer.classList.contains("hidden")) {
      closeProjectDrawer();
    }
  });
}

async function bootstrap() {
  setBaseUrlInput(state.baseUrl);
  els.projectStatusFilter.value = "all";
  els.projectPageSize.value = String(state.projectPageSize);
  els.batchPageSize.value = String(state.batchPageSize);
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
