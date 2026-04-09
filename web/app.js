// ======= 配置区：请根据你的仓库修改 =======
const OWNER = "Yang-iyu";   // 你的 GitHub 用户名
const REPO = "Reminder";          // 仓库名
const BRANCH = "main";                  // 分支名（一般是 main 或 master）

// 登录密码的 SHA-256（十六进制字符串）
// 你可以自己算好 SHA-256，然后填到这里
// 例如：echo -n "your-password" | sha256sum
const PASSWORD_HASH = "40c8d3372b595185f8526bd01936e2a796ae01e7f43039e7cb7a428920f34b62";

// ======= 下面的代码一般不需要改 =======

const RAW_TASKS_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/tasks.json`;
const API_CONTENT_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/tasks.json`;

let githubToken = null;
let tasks = [];
let currentFileSha = null; // 用于 GitHub API 更新文件

// DOM
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
const taskHourInput = document.getElementById("task-hour");
const taskMinuteInput = document.getElementById("task-minute");
const taskWeekdaySelect = document.getElementById("task-weekday");
const taskRemarkInput = document.getElementById("task-remark");
const taskEnabledCheckbox = document.getElementById("task-enabled");
const taskIdInput = document.getElementById("task-id");
const saveTaskButton = document.getElementById("save-task-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const saveStatus = document.getElementById("save-status");

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

// 加载任务（从 raw.githubusercontent.com）
async function loadTasks() {
  saveStatus.textContent = "";
  tasksTbody.innerHTML = "<tr><td colspan='7'>加载中...</td></tr>";

  try {
    const res = await fetch(API_CONTENT_URL, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      tasksTbody.innerHTML = `<tr><td colspan='7'>加载失败：${res.status}</td></tr>`;
      return;
    }

    const data = await res.json();
    currentFileSha = data.sha;

    const content = atob(data.content.replace(/\n/g, ""));
    tasks = JSON.parse(content);

    renderTasks();
  } catch (e) {
    console.error(e);
    tasksTbody.innerHTML = `<tr><td colspan='7'>加载失败：${e}</td></tr>`;
  }
}

function renderTasks() {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    tasksTbody.innerHTML = "<tr><td colspan='7'>暂无任务</td></tr>";
    return;
  }

  tasksTbody.innerHTML = "";
  tasks.forEach(task => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = task.id;

    const tdUrl = document.createElement("td");
    tdUrl.textContent = task.url;

    const tdTime = document.createElement("td");
    tdTime.textContent = `${task.hour}:${task.minute}`;

    const tdWeekday = document.createElement("td");
    tdWeekday.textContent = weekdayToText(task.weekday);

    const tdRemark = document.createElement("td");
    tdRemark.textContent = task.remark || "";

    const tdEnabled = document.createElement("td");
    tdEnabled.textContent = task.enabled ? "是" : "否";

    const tdActions = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => editTask(task.id));

    const delBtn = document.createElement("button");
    delBtn.textContent = "删除";
    delBtn.classList.add("danger");
    delBtn.addEventListener("click", () => deleteTask(task.id));

    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdUrl);
    tr.appendChild(tdTime);
    tr.appendChild(tdWeekday);
    tr.appendChild(tdRemark);
    tr.appendChild(tdEnabled);
    tr.appendChild(tdActions);

    tasksTbody.appendChild(tr);
  });
}

function weekdayToText(w) {
  if (w === null || w === undefined || w === "") return "每天";
  const map = {
    1: "周一",
    2: "周二",
    3: "周三",
    4: "周四",
    5: "周五",
    6: "周六",
    7: "周日"
  };
  return map[w] || String(w);
}

// 新增/编辑任务
saveTaskButton.addEventListener("click", async () => {
  const url = taskUrlInput.value.trim();
  const hour = taskHourInput.value.trim();
  const minute = taskMinuteInput.value.trim();
  const weekdayVal = taskWeekdaySelect.value;
  const remark = taskRemarkInput.value.trim();
  const enabled = taskEnabledCheckbox.checked;
  const id = taskIdInput.value.trim();

  if (!url) {
    saveStatus.textContent = "URL 不能为空。";
    return;
  }
  if (hour === "" || minute === "") {
    saveStatus.textContent = "时间不能为空。";
    return;
  }

  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
    saveStatus.textContent = "时间格式不正确。";
    return;
  }

  const weekday = weekdayVal === "" ? null : parseInt(weekdayVal, 10);

  let newTasks = Array.isArray(tasks) ? [...tasks] : [];

  if (id) {
    // 编辑
    const idx = newTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      newTasks[idx] = {
        ...newTasks[idx],
        url,
        hour: h.toString().padStart(2, "0"),
        minute: m.toString().padStart(2, "0"),
        weekday,
        remark,
        enabled
      };
    }
  } else {
    // 新增
    const newId = "task-" + Date.now();
    newTasks.push({
      id: newId,
      url,
      hour: h.toString().padStart(2, "0"),
      minute: m.toString().padStart(2, "0"),
      weekday,
      remark,
      enabled
    });
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
      branch: BRANCH
    };

    if (currentFileSha) {
      body.sha = currentFileSha;
    }

    const res = await fetch(API_CONTENT_URL, {
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
    currentFileSha = data.content.sha;
    tasks = newTasks;
    renderTasks();
    clearForm();
    saveStatus.textContent = "保存成功。";
  } catch (e) {
    console.error(e);
    saveStatus.textContent = `保存失败：${e}`;
  }
}

function clearForm() {
  formTitle.textContent = "新增任务";
  taskIdInput.value = "";
  taskUrlInput.value = "";
  taskHourInput.value = "";
  taskMinuteInput.value = "";
  taskWeekdaySelect.value = "";
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
  taskHourInput.value = parseInt(task.hour, 10);
  taskMinuteInput.value = parseInt(task.minute, 10);
  taskWeekdaySelect.value = task.weekday == null ? "" : String(task.weekday);
  taskRemarkInput.value = task.remark || "";
  taskEnabledCheckbox.checked = !!task.enabled;
  cancelEditButton.classList.remove("hidden");
}

cancelEditButton.addEventListener("click", () => {
  clearForm();
});

async function deleteTask(id) {
  if (!confirm("确定要删除这个任务吗？")) return;
  const newTasks = tasks.filter(t => t.id !== id);
  await saveTasksToGithub(newTasks);
}

reloadButton.addEventListener("click", () => {
  loadTasks();
});
