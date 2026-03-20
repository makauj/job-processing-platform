const form = document.getElementById("task-form");
const formMessage = document.getElementById("form-message");
const taskTypeInput = document.getElementById("task-type");
const payloadInput = document.getElementById("payload");
const taskIdInput = document.getElementById("task-id");
const currentStatus = document.getElementById("current-status");
const currentId = document.getElementById("current-id");
const resultBox = document.getElementById("result-box");
const checkStatusBtn = document.getElementById("check-status");
const togglePollBtn = document.getElementById("toggle-poll");
const sampleFailureBtn = document.getElementById("sample-failure");

let pollTimer = null;

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#a8302a" : "#58695d";
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

  if (["SUCCESS", "FAILURE"].includes(data.status?.toUpperCase()) && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    togglePollBtn.textContent = "Start Polling";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Submitting task...");

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadInput.value || "{}");
  } catch {
    setMessage("Payload must be valid JSON.", true);
    return;
  }

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
    renderStatus({ task_id: data.task_id, status: data.status, result: null, error: null });
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

  pollTimer = setInterval(() => {
    fetchStatus(taskId).catch((error) => {
      setMessage(error.message || "Polling failed.", true);
    });
  }, 2000);

  togglePollBtn.textContent = "Stop Polling";
  setMessage("Polling every 2 seconds...");
});

sampleFailureBtn.addEventListener("click", () => {
  taskTypeInput.value = "report";
  payloadInput.value = JSON.stringify({ should_fail: true }, null, 2);
  setMessage("Failure sample loaded.");
});
