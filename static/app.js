const form = document.getElementById("form");
const submit = document.getElementById("submit");
const errorBox = document.getElementById("error");
const list = document.getElementById("list");
const empty = document.getElementById("empty");

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = !text;
}

function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}

function makeCard(entry) {
  const li = document.createElement("li");
  if (entry.to) {
    const to = document.createElement("p");
    to.className = "card-to";
    to.textContent = `${entry.to}님께`;
    li.append(to);
  }
  const message = document.createElement("p");
  message.className = "card-message";
  message.textContent = entry.message;
  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = `${entry.name} · ${formatTime(entry.created_at)}`;
  li.append(message, meta);
  return li;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadEntries() {
  try {
    const response = await fetch("/api/entries");
    const data = await readJson(response);
    if (!response.ok || !data) {
      throw new Error(data?.error || "목록을 불러오지 못했어요.");
    }
    list.replaceChildren(...data.entries.map(makeCard));
    empty.hidden = data.entries.length > 0;
  } catch (e) {
    showError(e instanceof TypeError ? "서버에 연결할 수 없어요. 잠시 뒤에 다시 시도해 주세요." : e.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  submit.disabled = true;
  submit.textContent = "저장하는 중...";
  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.value,
        message: form.message.value,
        to: form.to.value,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data?.error || "저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    }
    form.message.value = "";
    form.to.value = "";
    await loadEntries();
  } catch (e) {
    showError(e instanceof TypeError ? "서버에 연결할 수 없어요. 잠시 뒤에 다시 시도해 주세요." : e.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "칭찬 남기기";
  }
});

loadEntries();
