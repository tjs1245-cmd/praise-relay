// 사용자가 쓴 글은 textContent로만 넣어요. (HTML로 넣지 않아요)
const $ = (id) => document.getElementById(id);
let cfg, user = localStorage.getItem("diaryUser") || "user1", emotion = null, year = new Date().getFullYear();
const sticker = (u, e) => `/stickers/${u}_${e}.png`;
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};
const api = async (url, opt) => {
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "서버 오류가 났어요.");
  return j;
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const say = (t, err) => { $("msg").textContent = t; $("msg").className = err ? "err" : ""; };

function renderWho() {
  $("who").replaceChildren(...Object.entries(cfg.users).map(([k, name]) => {
    const b = el("button", { className: k === user ? "on" : "" },
      el("img", { src: sticker(k, "happy"), alt: "" }), `${name}의 일기장`);
    b.onclick = () => { user = k; localStorage.setItem("diaryUser", k); emotion = null; renderWho(); renderStickers(); refresh(); };
    return b;
  }));
}
function renderStickers() {
  $("stickers").replaceChildren(...Object.entries(cfg.emotions).map(([k, label]) => {
    const b = el("button", { className: k === emotion ? "on" : "", type: "button" },
      el("img", { src: sticker(user, k), alt: label }), label);
    b.onclick = () => { emotion = k; renderStickers(); };
    return b;
  }));
}
async function loadToday() {
  renderStickers(); // DB가 안 돼도 스티커는 보여요
  const { entries } = await api(`/api/entries?user=${user}&year=${new Date().getFullYear()}`);
  const t = entries.find((e) => e.date === todayStr());
  if (t) { emotion = t.emotion; $("sentence").value = t.sentence; say("오늘 일기가 이미 있어요. 고쳐서 다시 저장할 수 있어요."); }
  else { $("sentence").value = ""; say(""); }
  renderStickers();
}
async function loadList() {
  const { entries } = await api(`/api/entries?user=${user}&year=${new Date().getFullYear()}`);
  $("cards").replaceChildren(...(entries.length ? entries.map((e) =>
    el("div", { className: "card" },
      el("img", { src: sticker(user, e.emotion), alt: cfg.emotions[e.emotion] }),
      el("div", {}, el("small", { textContent: `${e.date} · ${cfg.emotions[e.emotion]}` }), el("p", { textContent: e.sentence })))
  ) : [el("p", { className: "empty", textContent: "아직 쓴 일기가 없어요." })]));
}
async function loadYear() {
  $("yearLabel").textContent = `${year}년`;
  const s = await api(`/api/summary?user=${user}&year=${year}`);
  if (!s.total) { $("summary").replaceChildren(el("p", { className: "empty", textContent: "이 해에 쓴 일기가 없어요." })); return; }
  const top = el("div", { className: "top" }, el("img", { src: sticker(user, s.top), alt: "" }),
    el("p", { textContent: `${year}년에는 ${s.total}일 기록했고, '${cfg.emotions[s.top]}'이 가장 많았어요!` }));
  const bars = Object.entries(cfg.emotions).map(([k, label]) => el("div", { className: "bar" },
    el("img", { src: sticker(user, k), alt: label }),
    el("div", { className: "track" }, el("div", { className: "fill", style: `width:${(s.by_emotion[k] || 0) / s.total * 100}%` })),
    el("b", { textContent: `${s.by_emotion[k] || 0}` })));
  const byM = Object.fromEntries(s.months.map((m) => [m.month, m]));
  const months = el("div", { className: "months" }, ...Array.from({ length: 12 }, (_, i) => {
    const m = byM[i + 1];
    return el("div", {}, m ? el("img", { src: sticker(user, m.top), alt: "" }) : el("div", { className: "none", textContent: "·" }), `${i + 1}월`);
  }));
  $("summary").replaceChildren(top, ...bars, el("h2", { textContent: "달마다 대표 감정" }), months);
}
function refresh() {
  const v = document.querySelector(".views .on").dataset.view;
  ({ today: loadToday, list: loadList, year: loadYear })[v]().catch((e) => say(e.message, true));
}
document.querySelectorAll(".views button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".views button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".view").forEach((s) => s.hidden = s.id !== b.dataset.view);
  refresh();
});
$("prevY").onclick = () => { year--; loadYear(); };
$("nextY").onclick = () => { year++; loadYear(); };
$("save").onclick = async () => {
  $("save").disabled = true;
  try {
    await api("/api/entries", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, date: todayStr(), emotion, sentence: $("sentence").value }) });
    say("오늘의 일기를 붙였어요! 🎉");
  } catch (e) { say(e.message, true); }
  $("save").disabled = false;
};
if (location.protocol === "file:") {
  document.body.prepend(el("p", { className: "err", style: "text-align:center;padding:12px", textContent: "파일로 직접 열면 동작하지 않아요. 터미널에서 python app.py 를 실행하고 http://127.0.0.1:8090 으로 열어 주세요." }));
}
(async () => {
  cfg = await api("/api/config");
  if (!cfg.users[user]) user = "user1";
  $("todayLabel").textContent = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  renderWho(); refresh();
})().catch((e) => say(e.message, true));
