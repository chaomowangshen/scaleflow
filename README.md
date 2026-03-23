# 逐题量表采集系统（FastAPI）

本系统用于逐题采集量表数据，支持匿名链接发放、题级时长记录、项目生命周期管理和规范化导出。

## 核心能力
- 逐题呈现与不可回退（中断可续答，续答后题序不变）
- 题型支持：`likert`、`blank`、`text`、`single_choice`、`multiple_choice`、`ranking`
- 支持分支块：`flow_mode=branch`（单选题块内前向跳题）
- 随机化开关：`randomize_groups`、`randomize_items`（默认都为 `true`）
- 双端计时与事件日志（事件日志入库，不进入导出三表）
- 项目导入、软删除、延迟清理（默认回收期 7 天）
- Excel 导出：一个 `xlsx`，三个 sheet（答题/时长/顺序）
- 链接批次管理（按项目维度）

## 技术栈
- FastAPI + SQLAlchemy
- PostgreSQL（默认）
- 前端：原生 HTML/CSS/JS（管理员端 + 受试者端）

## 目录结构
- `app/main.py`：应用入口
- `app/models.py`：数据模型
- `app/api/`：管理端与受试者端 API
- `app/services/`：业务服务（问卷、项目、批次等）
- `app/web/`：前端页面与静态资源
- `tests/`：测试用例

## 环境配置（.env）
先复制模板：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

支持两种数据库配置方式：

1. 直接指定 `DATABASE_URL`（优先级最高）
2. 使用 `PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DB` 自动拼接

### 配置优先级
- 若设置了 `DATABASE_URL`，将直接使用该值。
- 若未设置 `DATABASE_URL`，则必须提供完整 `PG_*`。
- 若两者都不完整，服务会在启动时报错（不再默认 SQLite）。

## 本地启动
安装依赖：

```bash
uv pip install -r requirements.txt
```

启动服务：

```bash
uvicorn app.main:app --reload
```

启动后入口：
- 管理员端：`http://127.0.0.1:8000/admin`
- 受试者端：`http://127.0.0.1:8000/take/{token}`
- OpenAPI：`http://127.0.0.1:8000/docs`

## 管理员账号
默认值（可在 `.env` 覆盖）：
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=admin123`

## 批次管理（项目维度）
当前管理员前端“链接批次”页面已改为后端驱动：
- 项目筛选
- 批次列表
- 创建批次并生成链接
- 导出单批次 CSV/TXT
- 导出项目全部批次 CSV/TXT

不再依赖浏览器 localStorage 作为批次主存。

## 主要 API
### 认证
- `POST /admin/auth/login`

### 项目生命周期
- `POST /admin/projects/import`
- `GET /admin/projects`
- `GET /admin/projects/{project_id}/questionnaires`
- `DELETE /admin/projects/{project_id}`（请求体需 `confirm_project_name`）
- `POST /admin/projects/{project_id}/restore`
- `POST /admin/projects/{project_id}/purge`
- `POST /admin/projects/purge_due`
- `POST /admin/projects/bulk-delete`
- `POST /admin/projects/bulk-restore`
- `POST /admin/projects/bulk-purge`

### 批次管理（新增）
- `POST /admin/projects/{project_id}/batches`
- `GET /admin/projects/{project_id}/batches`
- `GET /admin/batches/{batch_id}/links`
- `DELETE /admin/batches/{batch_id}`

### 兼容入口（保留）
- `POST /admin/questionnaires/{questionnaire_id}/links/batch`

### 问卷设置与数据导出
- `PATCH /admin/questionnaires/{questionnaire_id}/settings`
- `GET /admin/exports/{project_id}?questionnaire_id=...`

### 受试者答题
- `GET /survey/{token}/start`
- `POST /survey/{token}/consent`
- `POST /survey/{token}/items/{item_id}/submit`

## 导出规则
- `Sheet1_答题`：按题库固定顺序输出最终答案
- `Sheet2_时长`：按同列顺序输出题级总停留时长（ms）
- `Sheet3_顺序`：按同列顺序输出该题呈现位置（1..J）
- 逻辑跳过题：三表统一填 `-1`
- 非逻辑跳过缺失（如中断）：保持空白

## 示例导入 JSON
可参考 `examples/` 目录下示例文件，例如：
- `examples/import_all_types_demo_20260323.json`

## 测试
安装开发依赖：

```bash
uv pip install -r requirements-dev.txt
```

运行测试：

```bash
pytest
```

说明：测试通过 `tests/conftest.py` 显式覆盖 `DATABASE_URL=sqlite:///:memory:`，与生产/本地默认 PostgreSQL 配置互不冲突。
