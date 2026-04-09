// ======= 配置区：请根据你的仓库修改 =======
const OWNER = "Yang-iyu";   // 你的 GitHub 用户名
const REPO = "Reminder";          // 仓库名
const BRANCH = "main";                  // 分支名（一般是 main 或 master）

// 登录密码的 SHA-256（十六进制字符串）
const PASSWORD_HASH = "REPLACE_WITH_YOUR_SHA256";

// ======= GitHub API 路径 =======
const API_TASKS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/tasks.json`;
const API_LOGS_DIR_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/logs`;

let githubToken = null;
let tasks = [];
let currentTasksSha = null;

// DOM 元素
const loginPanel = document.getElementById("login-panel");
const mainPanel = document.getElementById("main-panel");
const passwordInput = document.getElementById("password-input");
const tokenInput = document.getElementById("token-input");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");

const reloadButton = document.getElementById("reload-button");
const tasksTbody = document.getElementById("tasks-tbody");

const formTitle = document.getElementById("form-title");
const taskUrlInput = document.getElementById("task-url");
const taskCronInput = document.getElementById("task-cron");
const taskRemarkInput = document.getElementById("task-remark");
const taskEnabledCheckbox = document.getElementById("task-enabled");
const taskIdInput = document.getElementById("task-id");
const saveTaskButton = document.getElementById("save-task-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const saveStatus = document.getElementById("save-status");

const logModal = document.getElementById("log-modal");
const logContent = document.getElementById("log-content");
const closeLogButton = document.getElementById("close-log-button");

// 工具：SHA-256
async function sha256Hex(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// 登录逻辑
loginButton.addEventListener("click", async () => {
  loginError.textContent = "";
  const pwd = passwordInput.value.trim();
  const token = tokenInput.value.trim();

  if (!pwd || !token) {
    loginError.textContent = "密码和 GitHub Token 都不能为空。";
    return;
  }

  const hash = await sha256Hex(pwd);
  if (hash !== PASSWORD_HASH) {
    loginError.textContent = "密码错误。";
    return;
  }

  githubToken = token;
  loginPanel.classList.add("hidden");
  mainPanel.classList.remove("hidden");

  loadTasks();
});

// 加载任务
async function loadTasks() {
  saveStatus.textContent = "";
  tasksTbody.innerHTML = "<tr><td colspan='6'>加载中...</td></tr>";

  try {
    const res = await fetch(API_TASKS_URL, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      tasksTbody.innerHTML = `<tr><td colspan='6'>加载失败：${res.status}</td></tr>`;
      return;
    }

    const data = await res.json();
    currentTasksSha = data.sha;

    const content = atob(data.content.replace(/\n/g, ""));
    tasks = JSON.parse(content);

    renderTasks();
  } catch (e) {
    tasksTbody.innerHTML = `<tr><td colspan='6'>加载失败：${e}</td></tr>`;
  }
}

function renderTasks() {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    tasksTbody.innerHTML = "<tr><td colspan='6'>暂无任务</td></tr>";
    return;
  }

  tasksTbody.innerHTML = "";
  tasks.forEach(task => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${task.id}</td>
      <td>${task.url}</td>
      <td>${task.cron}</td>
      <td>${task.remark || ""}</td>
      <td>${task.enabled ? "是" : "否"}</td>
      <td>
        <button class="edit-btn">编辑</button>
        <button class="log-btn">日志</button>
        <button class="danger delete-btn">删除</button>
      </td>
    `;

    tr.querySelector(".edit-btn").addEventListener("click", () => editTask(task.id));
    tr.querySelector(".delete-btn").addEventListener("click", () => deleteTask(task.id));
    tr.querySelector(".log-btn").addEventListener("click", () => viewLog(task.id));

    tasksTbody.appendChild(tr);
  });
}

// 新增/编辑任务
saveTaskButton.addEventListener("click", async () => {
  const url = taskUrlInput.value.trim();
  const cron = taskCronInput.value.trim();
  const remark = taskRemarkInput.value.trim();
  const enabled = taskEnabledCheckbox.checked;
  const id = taskIdInput.value.trim();

  if (!url) {
    saveStatus.textContent = "URL 不能为空。";
    return;
  }
  if (!cron) {
    saveStatus.textContent = "Cron 表达式不能为空。";
    return;
  }

  let newTasks = Array.isArray(tasks) ? [...tasks] : [];

  if (id) {
    const idx = newTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      newTasks[idx] = { ...newTasks[idx], url, cron, remark, enabled };
    }
  } else {
    const newId = "task-" + Date.now();
    newTasks.push({ id: newId, url, cron, remark, enabled });
  }

  await saveTasksToGithub(newTasks);
});

async function saveTasksToGithub(newTasks) {
  saveStatus.textContent = "保存中...";

  try {
    const content = JSON.stringify(newTasks, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: "Update tasks.json",
      content: base64Content,
      branch: BRANCH,
      sha: currentTasksSha
    };

    const res = await fetch(API_TASKS_URL, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      saveStatus.textContent = `保存失败：${res.status} ${text}`;
      return;
    }

    const data = await res.json();
    currentTasksSha = data.content.sha;
    tasks = newTasks;
    renderTasks();
    clearForm();
    saveStatus.textContent = "保存成功。";
  } catch (e) {
    saveStatus.textContent = `保存失败：${e}`;
  }
}

function clearForm() {
  formTitle.textContent = "新增任务";
  taskIdInput.value = "";
  taskUrlInput.value = "";
  taskCronInput.value = "";
  taskRemarkInput.value = "";
  taskEnabledCheckbox.checked = true;
  cancelEditButton.classList.add("hidden");
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  formTitle.textContent = "编辑任务";
  taskIdInput.value = task.id;
  taskUrlInput.value = task.url;
  taskCronInput.value = task.cron;
  taskRemarkInput.value = task.remark || "";
  taskEnabledCheckbox.checked = !!task.enabled;
  cancelEditButton.classList.remove("hidden");
}

cancelEditButton.addEventListener("click", () => clearForm());

// 删除任务
async function deleteTask(id) {
  if (!confirm("确定要删除这个任务吗？")) return;
  const newTasks = tasks.filter(t => t.id !== id);
  await saveTasksToGithub(newTasks);
}

// 查看日志
async function viewLog(taskId) {
  logContent.textContent = "加载中...";

  try {
    const res = await fetch(`${API_LOGS_DIR_URL}/${taskId}.log`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      logContent.textContent = "暂无日志或加载失败。";
    } else {
      const data = await res.json();
      const content = atob(data.content.replace(/\n/g, ""));
      logContent.textContent = content;
    }
  } catch (e) {
    logContent.textContent = "加载失败：" + e;
  }

  logModal.classList.remove("hidden");
}

closeLogButton.addEventListener("click", () => {
  logModal.classList.add("hidden");
});

reloadButton.addEventListener("click", loadTasks);
