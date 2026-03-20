const form = document.getElementById("task-form");
const formMessage = document.getElementById("form-message");
const taskTypeInput = document.getElementById("task-type");
const payloadInput = document.getElementById("payload");
const payloadTemplate = document.getElementById("payload-template");
const loadTemplateBtn = document.getElementById("load-template");
const jsonHint = document.getElementById("json-hint");
const serviceMessage = document.getElementById("service-message");
const stopServicesBtn = document.getElementById("stop-services");
const taskIdInput = document.getElementById("task-id");
const currentStatus = document.getElementById("current-status");
const currentId = document.getElementById("current-id");
const resultBox = document.getElementById("result-box");
const statusHistory = document.getElementById("status-history");
const recentTasks = document.getElementById("recent-tasks");
const clearRecentBtn = document.getElementById("clear-recent");
const checkStatusBtn = document.getElementById("check-status");
const togglePollBtn = document.getElementById("toggle-poll");
const copyTaskIdBtn = document.getElementById("copy-task-id");
const pollIntervalSelect = document.getElementById("poll-interval");
const sampleFailureBtn = document.getElementById("sample-failure");

let pollTimer = null;
const terminalStates = ["SUCCESS", "FAILURE"];
const recentStorageKey = "job-platform-recent-tasks";
const templates = {
  email: { task_type: "email", payload: { to: "dev@example.com", subject: "Hello" } },
  image: { task_type: "image", payload: { image_url: "https://example.com/image.png", operation: "resize", width: 1024, height: 768 } },
  report: { task_type: "report", payload: { report_id: "sales-q1", format: "pdf", include_charts: true } },
  failure: { task_type: "report", payload: { should_fail: true } },
};

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#a8302a" : "#58695d";
}

function setServiceMessage(message, isError = false) {
  serviceMessage.textContent = message;
  serviceMessage.style.color = isError ? "#a8302a" : "#58695d";
}

function loadRecentTasks() {
  try {
    const saved = localStorage.getItem(recentStorageKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function persistRecentTasks(items) {
  localStorage.setItem(recentStorageKey, JSON.stringify(items));
}

function addRecentTask(taskId, taskType) {
  if (!taskId) {
    return;
  }

  const existing = loadRecentTasks().filter((item) => item.task_id !== taskId);
  const next = [{ task_id: taskId, task_type: taskType || "unknown", added_at: new Date().toISOString() }, ...existing].slice(0, 12);
  persistRecentTasks(next);
  renderRecentTasks();
}

function renderRecentTasks() {
  const items = loadRecentTasks();
  recentTasks.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No recent tasks yet.";
    recentTasks.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "recent-item";

    const meta = document.createElement("div");
    meta.className = "recent-meta";

    const idLine = document.createElement("span");
    idLine.className = "recent-id";
    idLine.textContent = item.task_id;

    const typeLine = document.createElement("span");
    typeLine.className = "recent-type";
    typeLine.textContent = `type: ${item.task_type}`;

    meta.appendChild(idLine);
    meta.appendChild(typeLine);

    const openBtn = document.createElement("button");
    openBtn.className = "secondary open-recent";
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", async () => {
      taskIdInput.value = item.task_id;
      setMessage(`Loaded task ${item.task_id}`);
      try {
        await fetchStatus(item.task_id);
      } catch (error) {
        setMessage(error.message || "Could not fetch status.", true);
      }
    });

    li.appendChild(meta);
    li.appendChild(openBtn);
    recentTasks.appendChild(li);
  });
}

function addHistory(status, details = "") {
  const line = document.createElement("li");
  const timestamp = new Date().toLocaleTimeString();
  line.textContent = `[${timestamp}] ${status}${details ? ` - ${details}` : ""}`;

  if (statusHistory.children.length === 1 && statusHistory.children[0].textContent.includes("Waiting")) {
    statusHistory.innerHTML = "";
  }

  statusHistory.prepend(line);
  while (statusHistory.children.length > 8) {
    statusHistory.removeChild(statusHistory.lastChild);
  }
}

function validatePayload(showMessage = false) {
  try {
    JSON.parse(payloadInput.value || "{}");
    jsonHint.textContent = "JSON looks valid.";
    jsonHint.classList.remove("invalid");
    return true;
  } catch {
    jsonHint.textContent = "Invalid JSON. Fix payload syntax before submitting.";
    jsonHint.classList.add("invalid");
    if (showMessage) {
      setMessage("Payload must be valid JSON.", true);
    }
    return false;
  }
}

function renderStatus(data) {
  const status = (data?.status || "-").toUpperCase();
  currentStatus.textContent = status;
  currentStatus.className = "state";

  const key = status.toLowerCase();
  if (["success", "failure", "pending", "started", "retry"].includes(key)) {
    currentStatus.classList.add(key);
  }

  currentId.textContent = data?.task_id || "-";
  addHistory(status, data?.error ? `error: ${data.error}` : "");
  resultBox.textContent = JSON.stringify(
    {
      result: data?.result ?? null,
      error: data?.error ?? null,
      created_at: data?.created_at ?? null,
      updated_at: data?.updated_at ?? null,
    },
    null,
    2,
  );
}

async function fetchStatus(taskId) {
  const response = await fetch(`/tasks/${encodeURIComponent(taskId)}`);
  if (!response.ok) {
    throw new Error(`Status request failed (${response.status})`);
  }
  const data = await response.json();
  renderStatus(data);

  if (terminalStates.includes(data.status?.toUpperCase()) && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    togglePollBtn.textContent = "Start Polling";
    setMessage(`Polling stopped. Task reached ${data.status}.`);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Submitting task...");

  if (!taskTypeInput.value.trim()) {
    setMessage("Task type is required.", true);
    return;
  }

  if (!validatePayload(true)) {
    return;
  }

  const parsedPayload = JSON.parse(payloadInput.value || "{}");

  try {
    const response = await fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_type: taskTypeInput.value.trim(),
        payload: parsedPayload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Submit failed (${response.status})`);
    }

    const data = await response.json();
    taskIdInput.value = data.task_id;
    setMessage(`Task submitted: ${data.task_id}`);
    addRecentTask(data.task_id, taskTypeInput.value.trim());
    addHistory("PENDING", data.task_id);
    renderStatus({ task_id: data.task_id, status: data.status, result: null, error: null });
    if (!pollTimer) {
      startPolling(data.task_id);
    }
  } catch (error) {
    setMessage(error.message || "Submission failed.", true);
  }
});

checkStatusBtn.addEventListener("click", async () => {
  const taskId = taskIdInput.value.trim();
  if (!taskId) {
    setMessage("Enter a task_id first.", true);
    return;
  }

  try {
    await fetchStatus(taskId);
    setMessage("Status refreshed.");
  } catch (error) {
    setMessage(error.message || "Could not fetch status.", true);
  }
});

function startPolling(taskId) {
  if (pollTimer) {
    return;
  }

  const intervalMs = Number(pollIntervalSelect.value || "2000");

  pollTimer = setInterval(() => {
    fetchStatus(taskId).catch((error) => {
      setMessage(error.message || "Polling failed.", true);
    });
  }, intervalMs);

  togglePollBtn.textContent = "Stop Polling";
  setMessage(`Polling every ${intervalMs / 1000} seconds...`);
}

togglePollBtn.addEventListener("click", () => {
  const taskId = taskIdInput.value.trim();
  if (!taskId) {
    setMessage("Enter a task_id first.", true);
    return;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    togglePollBtn.textContent = "Start Polling";
    setMessage("Polling stopped.");
    return;
  }

  startPolling(taskId);
});

sampleFailureBtn.addEventListener("click", () => {
  taskTypeInput.value = "report";
  payloadInput.value = JSON.stringify({ should_fail: true }, null, 2);
  validatePayload();
  setMessage("Failure sample loaded.");
});

loadTemplateBtn.addEventListener("click", () => {
  const selected = templates[payloadTemplate.value];
  if (!selected) {
    return;
  }
  taskTypeInput.value = selected.task_type;
  payloadInput.value = JSON.stringify(selected.payload, null, 2);
  validatePayload();
  setMessage(`Loaded ${payloadTemplate.value} template.`);
});

payloadInput.addEventListener("input", () => validatePayload(false));

copyTaskIdBtn.addEventListener("click", async () => {
  const value = taskIdInput.value.trim();
  if (!value) {
    setMessage("No task_id to copy yet.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setMessage("task_id copied to clipboard.");
  } catch {
    setMessage("Could not copy task_id from this browser context.", true);
  }
});

clearRecentBtn.addEventListener("click", () => {
  persistRecentTasks([]);
  renderRecentTasks();
  setMessage("Recent task list cleared.");
});

stopServicesBtn.addEventListener("click", async () => {
  setServiceMessage("Sending stop signal...");
  try {
    const response = await fetch("/admin/services/stop", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.detail || `Stop failed (${response.status})`);
    }
    setServiceMessage(body.message || "Stop signal sent.");
    setMessage("Services are stopping. API may become unavailable shortly.");
  } catch (error) {
    setServiceMessage(error.message || "Could not stop services.", true);
  }
});

validatePayload();
renderRecentTasks();
