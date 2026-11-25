/* =====================================================================
   🗺️ 6학년 활동지 학습맵 — 교수학습 포털
   - 서버 없이 작동하는 정적 웹앱이에요. (바닐라 JS, 외부 라이브러리 없음)
   - 데이터: data/bundle.js (window.PORTAL_DATA)
     · bundle.js가 없으면 data/*.json을 fetch로 읽어요.
   - 화면 주소(해시):
     #map  #find?q=…  #ws=6과02-03  #plan  #set  #play=ID,ID&t=제목&m=안내
   ===================================================================== */

/* ---------- 👩‍🏫 선생님이 바꿀 수 있는 설정 ---------- */
const SETTINGS = {
  schoolName: "6학년 인터랙티브 활동지 · 2022 개정 교육과정",  // 상단 로고 아래 작은 글씨
  weeks: 20,                 // 진도표 기본 주차 수 (한 학기)
  maxSetItems: 6,            // 수업 세트에 담을 수 있는 활동지 수
  planKey: "portal_plan_v1", // 진도표 저장 이름 (바꾸면 기존 진도표가 안 보여요)
};

/* ---------- 공통 도구 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
};
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2400); }
async function copyText(text, msg = "📋 복사했어요!") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch (e) {
    const a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); toast(msg); } catch (_) { toast("복사가 안 돼요. 길게 눌러 직접 복사해 주세요."); }
    a.remove();
  }
}
/* 색을 조금 진하게 (테두리·띠 색) */
function shade(hex, p = -0.25) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(p < 0 ? v * (1 + p) : v + (255 - v) * p)));
  return "#" + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}
/* 한글 검색 하이라이트 */
function hl(text, q) {
  const t = esc(text); if (!q) return t;
  const words = q.trim().split(/\s+/).filter(Boolean).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return t;
  return t.replace(new RegExp("(" + words.join("|") + ")", "gi"), "<mark>$1</mark>");
}

/* =====================================================================
   📦 데이터 불러오기
   ===================================================================== */
let DATA = null;              // {subjects, items, standards, activityTypes}
const BY_ID = {};             // 성취기준 id → 활동지 item
const STD = {};               // 성취기준 id → standard
const SUBJ = {};              // 과목 이름 → subject
const SUBJ_ID = {};           // 과목 id(kor…) → subject
const TYPE_ICON = { sort: "🗂️", match: "🔗", order: "🔢", fill: "✏️", write: "📝", listen: "🎧", calc: "🧮", map: "🗺️", numline: "📏", darkroom: "🔦", beaker: "🧪", arm: "💪", shadow: "🎙️", dynamics: "🎚️", audioquiz: "🎵", compose: "🎼", layer: "🪨" };

async function loadData() {
  let raw = window.PORTAL_DATA;
  if (!raw) {
    try {
      const [c, s, sub] = await Promise.all(["catalog", "standards", "subjects"].map(n => fetch(`data/${n}.json`).then(r => { if (!r.ok) throw 0; return r.json(); })));
      raw = { catalog: c, standards: s, subjects: sub };
    } catch (e) { return null; }
  }
  const subjects = raw.subjects.subjects;
  subjects.forEach(s => { SUBJ[s.name] = s; SUBJ_ID[s.id] = s; s.dark = s.accent || shade(s.color, -0.45); s.mid = shade(s.color, -0.12); });
  const items = raw.catalog.items;
  items.forEach(o => { BY_ID[o.id] = o; o.fileTag = o.file.replace(/_활동지\.html$/, ""); o.search = [o.id, o.title, o.standard, o.goal, o.unit, o.subjectShort, ...(o.concepts || []), ...(o.activities || []).map(a => a.title)].join(" ").toLowerCase(); });
  raw.standards.forEach(s => { STD[s.id] = s; s.made = !!BY_ID[s.id]; s.search = (s.id + " " + s.text + " " + s.subject).toLowerCase(); });
  return { subjects, items, standards: raw.standards, activityTypes: raw.catalog.activityTypes };
}

/* =====================================================================
   💾 진도표 · 즐겨찾기 (교사 개인, 이 기기에 저장)
   ===================================================================== */
let PLAN = store.get(SETTINGS.planKey, null) || { weeks: SETTINGS.weeks, start: "", items: [] };
// items: [{id, week, done, memo}]
function savePlan() { if (!store.set(SETTINGS.planKey, PLAN)) toast("⚠️ 이 기기에 저장할 수 없어요 (개인정보 보호 모드인지 확인해 주세요)"); }
const inPlan = id => PLAN.items.filter(p => p.id === id);
const isDone = id => PLAN.items.some(p => p.id === id && p.done);
/* 활동지에서 결과를 저장하면 남는 기록 (ws_파일태그) → 이 기기에서 해 본 활동지 */
function triedHere(item) { return !!(item && store.raw("ws_" + item.fileTag)); }
function weekDate(w) {
  if (!PLAN.start) return "";
  const d = new Date(PLAN.start); if (isNaN(d)) return "";
  d.setDate(d.getDate() + (w - 1) * 7); const e = new Date(d); e.setDate(e.getDate() + 4);
  const f = x => `${x.getMonth() + 1}/${x.getDate()}`; return `${f(d)} ~ ${f(e)}`;
}
function currentWeek() {
  if (!PLAN.start) return 0; const d = new Date(PLAN.start); if (isNaN(d)) return 0;
  const w = Math.floor((Date.now() - d.getTime()) / (7 * 864e5)) + 1; return w >= 1 && w <= PLAN.weeks ? w : 0;
}

/* =====================================================================
   🧭 라우터 (해시)
   ===================================================================== */
function parseHash() {
  const raw = location.hash.slice(1) || "map";
  // #play=…&t=…&m=…  (URLSearchParams가 직접 풀어요)
  if (raw.startsWith("play=")) { const p = new URLSearchParams(raw); return { view: "play", ids: (p.get("play") || "").split(",").filter(Boolean), t: p.get("t") || "", m: p.get("m") || "" }; }
  let h = raw; try { h = decodeURIComponent(raw); } catch (e) {}
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  if (path.startsWith("ws=")) return { view: "ws", id: path.slice(3) };
  return { view: path || "map", params };
}
let lastView = "map";
function route() {
  const r = parseHash();
  document.body.classList.toggle("play", r.view === "play");
  if (r.view === "ws") { if (!$("#main").dataset.view) renderView("map"); openDetail(r.id, false); return; }
  closeModal(false);
  if (r.view === "play") { renderPlay(r); return; }
  renderView(r.view, r.params);
}
function renderView(v, params) {
  if (!["map", "find", "plan", "set"].includes(v)) v = "map";
  lastView = v; $("#main").dataset.view = v;
  if (v !== "find") $("#gSearch").value = "";
  $$(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === v));
  ({ map: renderMap, find: renderFind, plan: renderPlan, set: renderSet })[v](params || new URLSearchParams());
}
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

/* =====================================================================
   🗺️ ① 학습맵
   ===================================================================== */
let mapMode = store.get("portal_map_mode", "grid");
let mapFocus = "";
function chipHTML(s, wide) {
  const sub = SUBJ[s.subject], it = BY_ID[s.id];
  const badges = (isDone(s.id) ? "✅" : inPlan(s.id).length ? "⭐" : "") + (triedHere(it) ? "👣" : "");
  const label = s.id.slice(-5);
  const style = s.made ? `background:${sub.color};border-color:${sub.mid}` : "";
  const aria = `${s.code} ${s.made ? it.title.replace(/^\S+\s/, "") : "준비 중"}`;
  if (wide) return `<button class="chip wide ${s.made ? "made" : "todo"}" style="${style}" data-std="${s.id}" aria-label="${esc(aria)}"><span>${label} ${s.made ? esc(it.title) : "⏳ 준비 중"}</span><small>${esc(s.text.length > 48 ? s.text.slice(0, 48) + "…" : s.text)}</small>${badges ? `<span class="bdg">${badges}</span>` : ""}</button>`;
  return `<button class="chip ${s.made ? "made" : "todo"}" style="${style}" data-std="${s.id}" aria-label="${esc(aria)}">${label}${badges ? `<span class="bdg">${badges}</span>` : ""}</button>`;
}
function renderMap() {
  const total = DATA.standards.length, made = DATA.items.length, pct = Math.round(made / total * 100);
  const bars = DATA.subjects.map(s => {
    const all = DATA.standards.filter(x => x.subject === s.name), m = all.filter(x => x.made).length;
    return `<button class="bar" data-focus="${s.name}" title="${s.name}만 크게 보기"><span>${s.emoji} <b>${s.name}</b></span><span class="tr"><i style="width:${m / all.length * 100}%;background:${s.dark}"></i></span><span class="n">${m}/${all.length}</span></button>`;
  }).join("");
  const C = 2 * Math.PI * 50;
  let body = "";
  const subjects = mapFocus ? DATA.subjects.filter(s => s.name === mapFocus) : DATA.subjects;
  if (mapMode === "list") {
    body = `<div class="card"><table class="list"><thead><tr><th>성취기준</th><th>과목</th><th>영역</th><th>활동지</th><th>성취기준 원문</th></tr></thead><tbody>${DATA.standards.filter(s => !mapFocus || s.subject === mapFocus).map(s => {
      const it = BY_ID[s.id], sub = SUBJ[s.subject], dn = (sub.domains.find(d => d.id === s.domain) || {}).name || `영역 ${s.domain}`;
      return `<tr><td><button class="chip ${s.made ? "made" : "todo"}" style="${s.made ? `background:${sub.color}` : ""}" data-std="${s.id}">${esc(s.code)}</button></td><td>${sub.emoji} ${s.subject}</td><td>${esc(dn)}</td><td>${it ? `<b>${esc(it.title)}</b>` : `<span class="muted">⏳ 준비 중</span>`}</td><td class="muted">${esc(s.text)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  } else {
    body = subjects.map(sub => {
      const stds = DATA.standards.filter(x => x.subject === sub.name);
      const doms = [...new Set(stds.map(x => x.domain))].sort();
      const m = stds.filter(x => x.made).length;
      return `<section class="subj" style="border-color:${sub.color}" aria-label="${sub.name}">
        <div class="subj-h"><span style="font-size:1.4rem">${sub.emoji}</span><b>${sub.name}</b><span class="pill" style="background:${sub.color}">${m} / ${stds.length}</span>
        ${mapFocus ? `<button class="btn sm ghost noprint" data-focus="" style="margin-left:auto">↩ 전체 과목 보기</button>` : `<button class="btn sm ghost noprint" data-focus="${sub.name}" style="margin-left:auto">🔍 크게</button>`}</div>
        ${doms.map(d => {
          const dn = (sub.domains.find(x => x.id === d) || {}).name || `영역 ${d}`;
          const list = stds.filter(x => x.domain === d);
          return `<div class="domain"><div class="dname">${d}. ${esc(dn)} <span class="muted">(${list.filter(x => x.made).length}/${list.length})</span></div>
            <div class="${mapFocus ? "focus-grid" : "chips"}">${list.map(s => chipHTML(s, !!mapFocus)).join("")}</div></div>`;
        }).join("")}
      </section>`;
    }).join("");
  }
  $("#main").innerHTML = `
  <div class="card hero">
    <div class="row" style="gap:16px">
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="#eee9f6" stroke-width="14"/><circle cx="60" cy="60" r="50" fill="none" stroke="#7c5cff" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C * pct / 100} ${C}" transform="rotate(-90 60 60)"/><text x="60" y="67" text-anchor="middle" font-size="22" font-weight="900" fill="#352f4a">${pct}%</text></svg>
      <div><div class="muted">5~6학년군 성취기준</div><div class="big-num">${made} <span style="font-size:1.1rem;color:var(--sub)">/ ${total}</span></div><div class="muted">인터랙티브 활동지 제작 · 나머지 ${total - made}개는 준비 중</div></div>
    </div>
    <div><div class="bars">${bars}</div></div>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <h1>🗺️ 성취기준 학습맵 ${mapFocus ? `— ${SUBJ[mapFocus].emoji} ${mapFocus}` : ""}</h1>
      <div class="row noprint">
        <div class="viewsw" role="tablist"><button data-mode="grid" class="${mapMode === "grid" ? "on" : ""}">▦ 격자</button><button data-mode="list" class="${mapMode === "list" ? "on" : ""}">☰ 목록</button></div>
        <button class="btn ghost sm" id="printMap">🖨️ 학습맵 인쇄</button>
      </div>
    </div>
    <div class="legend"><span><i class="chip made" style="background:#ffd6e0;min-width:0;padding:0 8px">01-01</i> 활동지 있음 (누르면 열려요)</span><span><i class="chip todo" style="min-width:0;padding:0 8px">01-07</i> 준비 중</span><span>⭐ 진도표에 담음</span><span>✅ 수업함</span><span>👣 이 기기에서 해 봄</span></div>
    ${body}
  </div>`;
  $$("[data-focus]").forEach(b => b.onclick = () => { mapFocus = b.dataset.focus; renderMap(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $$(".viewsw button").forEach(b => b.onclick = () => { mapMode = b.dataset.mode; store.set("portal_map_mode", mapMode); renderMap(); });
  $("#printMap").onclick = () => window.print();
  bindChips();
}
/* 칩 공통: 클릭 → 상세, 마우스 올리면 툴팁 */
let tipEl = null;
function bindChips(root = document) {
  $$("[data-std]", root).forEach(c => {
    c.onclick = () => go("#ws=" + c.dataset.std);
    c.onmouseenter = e => showTip(c);
    c.onmouseleave = hideTip; c.onfocus = () => showTip(c); c.onblur = hideTip;
  });
}
function showTip(c) {
  const s = STD[c.dataset.std]; if (!s || c.classList.contains("wide")) return;
  const it = BY_ID[s.id]; hideTip();
  tipEl = document.createElement("div"); tipEl.className = "tip";
  tipEl.innerHTML = `<b>${esc(s.code)}</b> ${it ? esc(it.title) : "⏳ 준비 중"}<br><span style="opacity:.85">${esc(s.text)}</span>`;
  document.body.appendChild(tipEl);
  const r = c.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2)), y = r.top - th - 8; if (y < 70) y = r.bottom + 8;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

/* =====================================================================
   🔎 ② 활동지 찾기
   ===================================================================== */
const F = { q: "", subs: [], domain: "", types: [], todo: false, sort: "code" };
function renderFind(params) {
  if (params && params.get("q") != null) F.q = params.get("q");
  if (params && params.get("s")) F.subs = params.get("s").split(",");
  $("#gSearch").value = F.q;
  const typesUsed = Object.entries(DATA.activityTypes).filter(([k]) => DATA.items.some(o => o.activities.some(a => a.type === k)));
  const oneSub = F.subs.length === 1 ? SUBJ[F.subs[0]] : null;
  $("#main").innerHTML = `
  <div class="findwrap">
    <details class="card filters" id="fbox" ${window.innerWidth > 1000 || F.subs.length || F.types.length ? "open" : ""}><summary>🎛️ 필터 (과목·영역·활동 유형) ${F.subs.length + F.types.length ? `<span class="pill">${F.subs.length + F.types.length}개 선택</span>` : ""}</summary>
      <h3>🔍 검색어</h3>
      <input type="text" id="fq" value="${esc(F.q)}" placeholder="예: 비례, 지층, 토의" style="width:100%">
      <h3>📚 과목</h3>
      <div class="fchips">${DATA.subjects.map(s => `<button class="fchip ${F.subs.includes(s.name) ? "on" : ""}" data-sub="${s.name}" aria-pressed="${F.subs.includes(s.name)}">${s.emoji} ${s.name}</button>`).join("")}</div>
      ${oneSub ? `<h3>🧩 영역</h3><select id="fdom" style="width:100%"><option value="">전체 영역</option>${oneSub.domains.map(d => `<option value="${d.id}" ${F.domain === d.id ? "selected" : ""}>${d.id}. ${esc(d.name)}</option>`).join("")}</select>` : `<p class="muted">과목을 하나만 고르면 영역으로도 좁힐 수 있어요.</p>`}
      <h3>🧪 활동 유형</h3>
      <div class="fchips">${typesUsed.map(([k, v]) => `<button class="fchip ${F.types.includes(k) ? "on" : ""}" data-type="${k}" aria-pressed="${F.types.includes(k)}">${TYPE_ICON[k] || "•"} ${v}</button>`).join("")}</div>
      <h3>⚙️ 보기</h3>
      <label class="row" style="font-size:.9rem"><input type="checkbox" id="ftodo" ${F.todo ? "checked" : ""}> 준비 중인 성취기준도 보기</label>
      <select id="fsort" style="width:100%;margin-top:8px"><option value="code" ${F.sort === "code" ? "selected" : ""}>성취기준 순</option><option value="title" ${F.sort === "title" ? "selected" : ""}>제목 가나다순</option></select>
      <button class="btn ghost sm" id="freset" style="margin-top:12px">↺ 필터 모두 지우기</button>
    </details>
    <section>
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><h1 id="fcount"></h1></div>
      <div class="results" id="results"></div>
    </section>
  </div>`;
  const rerender = () => renderFind();
  $("#fq").oninput = e => { F.q = e.target.value; $("#gSearch").value = F.q; drawResults(); };
  $$("[data-sub]").forEach(b => b.onclick = () => { const n = b.dataset.sub; F.subs = F.subs.includes(n) ? F.subs.filter(x => x !== n) : [...F.subs, n]; F.domain = ""; rerender(); });
  $$("[data-type]").forEach(b => b.onclick = () => { const n = b.dataset.type; F.types = F.types.includes(n) ? F.types.filter(x => x !== n) : [...F.types, n]; rerender(); });
  if ($("#fdom")) $("#fdom").onchange = e => { F.domain = e.target.value; drawResults(); };
  $("#ftodo").onchange = e => { F.todo = e.target.checked; drawResults(); };
  $("#fsort").onchange = e => { F.sort = e.target.value; drawResults(); };
  $("#freset").onclick = () => { Object.assign(F, { q: "", subs: [], domain: "", types: [], todo: false, sort: "code" }); $("#gSearch").value = ""; rerender(); };
  drawResults();
}
function matchQ(text, q) { const ws = q.toLowerCase().trim().split(/\s+/).filter(Boolean); return ws.every(w => text.includes(w)); }
function drawResults() {
  const q = F.q.trim();
  let list = DATA.standards.filter(s => {
    if (F.subs.length && !F.subs.includes(s.subject)) return false;
    if (F.domain && F.subs.length === 1 && s.domain !== F.domain) return false;
    const it = BY_ID[s.id];
    if (!it && (!F.todo || F.types.length)) return false;
    if (it && F.types.length && !it.activities.some(a => F.types.includes(a.type))) return false;
    if (q) return matchQ(it ? it.search : s.search, q);
    return true;
  });
  if (F.sort === "title") list.sort((a, b) => ((BY_ID[a.id] || {}).title || "~" + a.text).replace(/^\S+\s/, "").localeCompare(((BY_ID[b.id] || {}).title || "~" + b.text).replace(/^\S+\s/, ""), "ko"));
  const madeN = list.filter(s => BY_ID[s.id]).length;
  $("#fcount").innerHTML = `🔎 활동지 ${madeN}개${F.todo ? ` <span class="muted">+ 준비 중 ${list.length - madeN}개</span>` : ""}`;
  $("#results").innerHTML = list.length ? list.map(s => cardHTML(s, q)).join("") : `<div class="empty card">😢 찾는 활동지가 없어요.<br>검색어를 줄이거나 필터를 지워 보세요.</div>`;
  $$("#results [data-open]").forEach(b => b.onclick = () => go("#ws=" + b.dataset.open));
  $$("#results [data-print]").forEach(b => b.onclick = () => printWS(BY_ID[b.dataset.print]));
  $$("#results [data-share]").forEach(b => b.onclick = () => showQR(BY_ID[b.dataset.share]));
  $$("#results [data-plan]").forEach(b => b.onclick = () => addToPlanPrompt(b.dataset.plan, b));
}
function cardHTML(s, q) {
  const it = BY_ID[s.id], sub = SUBJ[s.subject];
  const dn = (sub.domains.find(d => d.id === s.domain) || {}).name || "";
  if (!it) return `<article class="wcard todo"><div class="band" style="background:#ddd"></div><div class="body"><div class="row"><span class="pill">${esc(s.code)}</span><span class="pill">${sub.emoji} ${s.subject}</span></div><div class="t" data-open="${s.id}">⏳ 준비 중인 성취기준</div><div class="g">${hl(s.text, q)}</div></div></article>`;
  const badges = (isDone(s.id) ? " ✅" : inPlan(s.id).length ? " ⭐" : "") + (triedHere(it) ? " 👣" : "");
  return `<article class="wcard"><div class="band" style="background:${sub.dark}"></div>
    <div class="body">
      <div class="row"><span class="pill" style="background:${sub.color}">${esc(s.code)}</span><span class="pill">${sub.emoji} ${s.subject} · ${esc(dn)}</span>${badges ? `<span title="⭐진도표 ✅수업함 👣해 봄">${badges}</span>` : ""}</div>
      <div class="t" data-open="${s.id}" role="button" tabindex="0">${hl(it.title, q)}</div>
      <div class="g">🎯 ${hl(it.goal, q)}</div>
      <div class="acts">${it.activities.map(a => `<span class="pill" title="${esc(a.title)}">${TYPE_ICON[a.type] || "•"} ${esc(DATA.activityTypes[a.type] || a.type)}</span>`).join("")}<span class="pill">📝 형성평가 ${it.quiz}</span></div>
    </div>
    <div class="foot"><button class="btn sm main" data-open="${s.id}">👀 미리보기</button><button class="btn sm" data-share="${s.id}">🖥️ 온라인 배포</button><button class="btn sm ghost" data-print="${s.id}">🖨️ 인쇄</button><button class="btn sm ghost" data-plan="${s.id}">⭐ 담기</button></div>
  </article>`;
}

/* =====================================================================
   📄 ③ 활동지 상세 (모달)
   ===================================================================== */
let modalReturnFocus = null;
function openDetail(id, push = true) {
  const s = STD[id]; if (!s) { toast("없는 성취기준이에요."); go("#" + lastView); return; }
  if (push && location.hash !== "#ws=" + id) { location.hash = "#ws=" + id; return; }
  const it = BY_ID[id], sub = SUBJ[s.subject];
  const dn = (sub.domains.find(d => d.id === s.domain) || {}).name || `영역 ${s.domain}`;
  const sibs = DATA.standards.filter(x => x.subject === s.subject && x.domain === s.domain), i = sibs.indexOf(s);
  const prev = sibs[i - 1], next = sibs[i + 1];
  modalReturnFocus = document.activeElement;
  $("#modalBox").innerHTML = `
    <div class="m-head" style="border-top:8px solid ${sub.dark}">
      <div><div class="row"><span class="pill" style="background:${sub.color}">${esc(s.code)}</span><span class="pill">${sub.emoji} ${s.subject} · ${esc(dn)}</span>${it && it.unit.replace(/^\d+\.\s*/, "") !== dn && !it.unit.includes(dn) ? `<span class="pill">${esc(it.unit)}</span>` : ""}</div>
      <h2 id="mTitle">${it ? esc(it.title) : "⏳ 준비 중인 성취기준"}</h2></div>
      <button class="m-close" id="mClose" aria-label="닫기">✖</button>
    </div>
    <div class="m-body">
      <div class="m-info">
        <div class="box" style="background:#f6f3ff"><b>📌 성취기준</b><br>${esc(s.code)} ${esc(s.text)}</div>
        ${it ? `
        <div class="box" style="background:#fff6cc"><b>🎯 학생 눈높이 목표</b><br>${esc(it.goal)}</div>
        <div class="box" style="background:${sub.color}"><b>💡 개념 쏙쏙</b><ul>${it.concepts.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>
        <div class="box" style="background:#e9f7f0"><b>🧪 탐구 활동</b><ul>${it.activities.map(a => `<li>${TYPE_ICON[a.type] || "•"} <b>${esc(a.title)}</b> <span class="muted">(${esc(DATA.activityTypes[a.type] || a.type)})</span></li>`).join("")}</ul></div>
        <div class="box" style="background:#eef6ff"><b>📝 형성평가</b> ${it.quiz}문항 · 즉시 피드백과 점수 · 결과 저장(.txt) · 인쇄/PDF</div>
        ${inPlan(id).length ? `<div class="box" style="background:#fff0f6">⭐ 진도표: ${inPlan(id).map(p => `${p.week}주차${p.done ? " ✅" : ""}`).join(", ")}</div>` : ""}
        ` : `<div class="notice">⏳ 이 성취기준의 인터랙티브 활동지는 아직 준비 중이에요.<br><span class="muted">새 활동지를 만들어 <code>worksheets/${sub.id}/</code>에 넣고 tools/build_catalog.py를 실행하면 자동으로 연결돼요.</span></div>`}
        <div class="row" style="margin-top:8px">${prev ? `<button class="btn sm ghost" data-goto="${prev.id}">◀ ${prev.id.slice(-5)}</button>` : ""}${next ? `<button class="btn sm ghost" data-goto="${next.id}">${next.id.slice(-5)} ▶</button>` : ""}</div>
      </div>
      <div class="preview" id="preview">${it ? `<div class="ph"><div style="font-size:2.5rem">👀</div><div>활동지를 미리 보려면 눌러 주세요</div><button class="btn main" id="loadPrev">▶ 미리보기 불러오기</button></div>` : `<div class="ph">⏳ 준비 중</div>`}</div>
    </div>
    ${it ? `<div class="m-foot">
      <a class="btn main" href="${encodeURI(it.href)}" target="_blank" rel="noopener">↗ 새 탭에서 열기</a>
      <button class="btn" id="mLink">🖥️ 학생용 링크 복사</button>
      <button class="btn" id="mQR">📱 QR 크게 보기</button>
      <button class="btn ghost" id="mPrint">🖨️ 인쇄하기</button>
      <span class="weekpop"><select id="mWeek" aria-label="주차 선택">${Array.from({ length: PLAN.weeks }, (_, k) => `<option value="${k + 1}" ${currentWeek() === k + 1 ? "selected" : ""}>${k + 1}주차</option>`).join("")}</select><button class="btn pink" id="mPlan">⭐ 진도표에 담기</button></span>
      <button class="btn ghost" id="mSet">🎒 수업 세트에 추가</button>
    </div>` : ""}`;
  $("#modal").hidden = false; document.body.style.overflow = "hidden";
  $("#mClose").onclick = () => closeModal(true);
  $$("[data-goto]").forEach(b => b.onclick = () => go("#ws=" + b.dataset.goto));
  if (it) {
    $("#loadPrev").onclick = () => { $("#preview").innerHTML = `<iframe src="${encodeURI(it.href)}" title="${esc(it.title)} 미리보기" loading="lazy"></iframe>`; };
    if (window.innerWidth > 1000) $("#loadPrev").click(); // 큰 화면은 바로 미리보기
    $("#mLink").onclick = () => copyText(wsLink(it), "📋 학생용 링크를 복사했어요!");
    $("#mQR").onclick = () => showQR(it);
    $("#mPrint").onclick = () => printWS(it);
    $("#mPlan").onclick = () => { addToPlan(id, +$("#mWeek").value); openDetail(id, false); };
    $("#mSet").onclick = () => { addToSet(id); };
  }
  $("#mClose").focus();
}
function closeModal(nav) {
  if ($("#modal").hidden) return;
  $("#modal").hidden = true; $("#modalBox").innerHTML = ""; document.body.style.overflow = "";
  if (nav) { history.replaceState(null, "", "#" + lastView); renderView(lastView); }
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
}
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(true); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("#qrfull").hidden) $("#qrfull").hidden = true; else closeModal(true); }
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.body.classList.contains("play")) { e.preventDefault(); $("#gSearch").focus(); }
});

/* 링크 만들기 (현재 주소 기준 → 어디에 올려도 작동) */
const baseURL = () => { const u = location.href.split("#")[0]; return location.protocol.startsWith("http") ? u.replace(/index\.html$/, "") : u; };
const wsLink = it => baseURL() + encodeURI(it.href);
function playLink(ids, t, m) {
  const p = new URLSearchParams(); p.set("play", ids.join(",")); if (t) p.set("t", t); if (m) p.set("m", m);
  return baseURL() + "#" + p.toString();
}

/* 🖨️ 인쇄: 같은 출처라면 새 창을 열고 자동으로 인쇄 창을 띄워요 */
function printWS(it) {
  const w = window.open(it.href, "_blank");
  if (!w) { toast("팝업이 막혔어요. ‘새 탭에서 열기’ 후 활동지 아래 🖨️ 인쇄 버튼을 눌러 주세요."); return; }
  const tryPrint = () => { try { w.focus(); w.print(); } catch (e) { toast("새 탭의 활동지 아래 🖨️ 인쇄 버튼을 눌러 주세요."); } };
  try { w.addEventListener("load", () => setTimeout(tryPrint, 600)); } catch (e) { toast("새 탭의 활동지 아래 🖨️ 인쇄 버튼을 눌러 주세요."); }
}

/* 📱 QR 전체 화면 */
function makeQR(text) {
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
function showQR(it, title, link) {
  const url = link || wsLink(it);
  $("#qrTitle").textContent = title || it.title;
  try { $("#qrBox").innerHTML = makeQR(url); } catch (e) { $("#qrBox").innerHTML = `<p class="notice">주소가 너무 길어 QR을 만들 수 없어요. 링크를 복사해 나눠 주세요.</p>`; }
  $("#qrLink").innerHTML = `${esc(url)} <button class="btn sm" id="qrCopy">📋 복사</button>`;
  $("#qrCopy").onclick = () => copyText(url);
  $("#qrfull").hidden = false; $("#qrClose").focus();
}
$("#qrClose").onclick = () => { $("#qrfull").hidden = true; };

/* =====================================================================
   📅 ④ 내 진도표
   ===================================================================== */
function addToPlan(id, week) {
  if (!BY_ID[id]) return;
  if (PLAN.items.some(p => p.id === id && p.week === week)) { toast(`이미 ${week}주차에 있어요.`); return; }
  PLAN.items.push({ id, week, done: false, memo: "" }); savePlan(); toast(`⭐ ${week}주차 진도표에 담았어요!`);
}
function addToPlanPrompt(id, btn) {
  // 카드의 ⭐ 담기: 작은 주차 선택 상자
  const sel = document.createElement("select"); sel.setAttribute("aria-label", "주차 선택");
  sel.innerHTML = `<option value="">주차?</option>` + Array.from({ length: PLAN.weeks }, (_, k) => `<option value="${k + 1}">${k + 1}주차</option>`).join("");
  btn.replaceWith(sel); sel.focus();
  sel.onchange = () => { if (sel.value) { addToPlan(id, +sel.value); drawResults(); } };
  sel.onblur = () => setTimeout(() => { if (document.contains(sel) && !sel.value) drawResults(); }, 200);
}
function renderPlan() {
  const cw = currentWeek();
  $("#main").innerHTML = `
  <div class="card">
    <div class="row" style="justify-content:space-between"><h1>📅 내 진도표</h1>
      <div class="row noprint">
        <label class="muted">학기 시작(1주차 월요일) <input type="date" id="pStart" value="${esc(PLAN.start)}"></label>
        <label class="muted">주차 수 <input type="number" id="pWeeks" min="1" max="30" value="${PLAN.weeks}" style="width:70px"></label>
      </div></div>
    <p class="muted">카드를 끌어 다른 주차로 옮기거나 ◀ ▶ 버튼으로 옮겨요. ‘수업함’을 체크하면 학습맵에 ✅가 표시돼요. 진도표는 이 기기(브라우저)에 저장돼요.</p>
    <div class="row noprint">
      <button class="btn" id="pCSV">⬇️ CSV 내보내기</button><button class="btn" id="pJSON">⬇️ JSON 내보내기</button>
      <button class="btn ghost" id="pImport">⬆️ 파일 가져오기</button><input type="file" id="pFile" accept=".csv,.json,text/csv,application/json" hidden>
      <button class="btn ghost" id="pPasteBtn">📋 엑셀에서 붙여 넣기</button>
      <button class="btn ghost" id="pClear">🗑️ 모두 비우기</button>
    </div>
    <div id="pPaste" class="hidden" style="margin-top:10px">
      <p class="muted">엑셀·한글 표에서 <b>주차 | 과목 | 성취기준코드 | 메모</b> 순서로 복사해 붙여 넣으세요. (과목 열은 없어도 돼요. 예: <code>3	사회	6사01-02	모둠 활동</code>)</p>
      <textarea id="pPasteTxt" placeholder="3	사회	6사01-02&#10;3	수학	[6수01-03]&#10;4	과학	6과01-02	실험실"></textarea>
      <button class="btn main" id="pPasteGo">✅ 진도표에 배치하기</button>
    </div>
  </div>
  <div class="board" id="board">${Array.from({ length: PLAN.weeks }, (_, k) => k + 1).map(w => {
    const items = PLAN.items.map((p, i) => ({ ...p, i })).filter(p => p.week === w);
    return `<section class="week ${w === cw ? "now" : ""}" data-week="${w}" aria-label="${w}주차">
      <h4>${w}주차 ${w === cw ? `<span class="pill" style="background:#ece4ff">이번 주</span>` : ""}${items.length ? `<button class="btn sm" data-setweek="${w}" title="이 주차 활동지로 수업 세트 만들기">🎒</button>` : ""}</h4>
      <div class="date">${weekDate(w)}</div>
      ${items.map(p => { const it = BY_ID[p.id], sub = it ? SUBJ[it.subjectShort] : null; return it ? `
        <div class="pcard ${p.done ? "done" : ""}" draggable="true" data-i="${p.i}" style="background:${sub.color}">
          <div class="pt" data-open="${p.id}">${sub.emoji} ${esc(it.title)}</div>
          <div class="muted" style="font-size:.74rem">${esc(it.code)}</div>
          <input class="pm" data-memo="${p.i}" value="${esc(p.memo || "")}" placeholder="메모 (예: 6-2반 3교시)">
          <div class="pb"><label><input type="checkbox" data-done="${p.i}" ${p.done ? "checked" : ""}> 수업함</label>
            <button data-mv="${p.i}" data-d="-1" aria-label="앞 주차로">◀</button><button data-mv="${p.i}" data-d="1" aria-label="뒤 주차로">▶</button><button data-del="${p.i}" aria-label="빼기">✖</button></div>
        </div>` : ""; }).join("")}
      ${items.length ? "" : `<div class="muted" style="font-size:.8rem">학습맵이나 찾기에서 ⭐ 담기를 눌러요</div>`}
    </section>`;
  }).join("")}</div>`;
  $("#pStart").onchange = e => { PLAN.start = e.target.value; savePlan(); renderPlan(); };
  $("#pWeeks").onchange = e => { const n = Math.max(1, Math.min(30, +e.target.value || 20)); PLAN.weeks = n; PLAN.items.forEach(p => p.week = Math.min(p.week, n)); savePlan(); renderPlan(); };
  $$("[data-open]").forEach(b => b.onclick = () => go("#ws=" + b.dataset.open));
  $$("[data-memo]").forEach(inp => inp.oninput = () => { PLAN.items[+inp.dataset.memo].memo = inp.value; savePlan(); });
  $$("[data-done]").forEach(c => c.onchange = () => { PLAN.items[+c.dataset.done].done = c.checked; savePlan(); renderPlan(); });
  $$("[data-mv]").forEach(b => b.onclick = () => { const p = PLAN.items[+b.dataset.mv]; p.week = Math.max(1, Math.min(PLAN.weeks, p.week + +b.dataset.d)); savePlan(); renderPlan(); });
  $$("[data-del]").forEach(b => b.onclick = () => { PLAN.items.splice(+b.dataset.del, 1); savePlan(); renderPlan(); });
  $$("[data-setweek]").forEach(b => b.onclick = () => { const w = +b.dataset.setweek; SET.ids = [...new Set(PLAN.items.filter(p => p.week === w).map(p => p.id))].slice(0, SETTINGS.maxSetItems); SET.t = `${w}주차 활동`; saveSet(); go("#set"); });
  // 끌어서 옮기기
  $$(".pcard").forEach(c => { c.ondragstart = e => { e.dataTransfer.setData("text/plain", c.dataset.i); }; });
  $$(".week").forEach(w => {
    w.ondragover = e => { e.preventDefault(); w.classList.add("dragover"); };
    w.ondragleave = () => w.classList.remove("dragover");
    w.ondrop = e => { e.preventDefault(); w.classList.remove("dragover"); const i = +e.dataTransfer.getData("text/plain"); if (PLAN.items[i]) { PLAN.items[i].week = +w.dataset.week; savePlan(); renderPlan(); } };
  });
  $("#pCSV").onclick = () => download("진도표.csv", "﻿" + planCSV(), "text/csv;charset=utf-8");
  $("#pJSON").onclick = () => download("진도표.json", JSON.stringify(PLAN, null, 1), "application/json");
  $("#pImport").onclick = () => $("#pFile").click();
  $("#pFile").onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importPlan(r.result, f.name); r.readAsText(f, "utf-8"); e.target.value = ""; };
  $("#pPasteBtn").onclick = () => $("#pPaste").classList.toggle("hidden");
  $("#pPasteGo").onclick = () => importRows($("#pPasteTxt").value, "\t");
  $("#pClear").onclick = () => { if (PLAN.items.length && confirmBox("진도표의 활동지를 모두 뺄까요?")) { PLAN.items = []; savePlan(); renderPlan(); } };
  if (cw) { const el = $(`.week[data-week="${cw}"]`); el && el.scrollIntoView({ inline: "start", block: "nearest" }); }
}
function confirmBox(msg) { try { return window.confirm(msg); } catch (e) { return true; } }
function planCSV() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["주차", "날짜", "과목", "성취기준코드", "활동지", "수업함", "메모"]];
  PLAN.items.slice().sort((a, b) => a.week - b.week).forEach(p => { const it = BY_ID[p.id]; rows.push([p.week, weekDate(p.week), it ? it.subjectShort : "", p.id, it ? it.title : "", p.done ? "O" : "", p.memo || ""]); });
  return rows.map(r => r.map(q).join(",")).join("\r\n");
}
function download(name, content, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("⬇️ 파일을 저장했어요!");
}
function parseCSV(t) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function importPlan(text, name) {
  text = text.replace(/^﻿/, "");
  if (/\.json$/i.test(name) || text.trim().startsWith("{")) {
    try { const o = JSON.parse(text); if (!Array.isArray(o.items)) throw 0; if (!confirmBox(`진도표 파일을 불러올까요? (${o.items.length}개) 지금 진도표는 바뀌어요.`)) return; PLAN = { weeks: o.weeks || SETTINGS.weeks, start: o.start || "", items: o.items.filter(p => BY_ID[p.id]) }; savePlan(); renderPlan(); toast("✅ 진도표를 불러왔어요!"); }
    catch (e) { toast("⚠️ 진도표 파일이 아니에요."); }
    return;
  }
  importRows(parseCSV(text).map(r => r.join("\t")).join("\n"), "\t");
}
/* 행마다 주차(숫자)와 성취기준 코드를 찾아 배치 — 열 순서가 조금 달라도 괜찮아요 */
function importRows(text, sep) {
  let ok = 0, miss = [];
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const cells = line.split(sep).map(c => c.trim());
    const codeCell = cells.find(c => /6[가-힣]{1,2}\d{2}-\d{2}/.test(c)); if (!codeCell) return;
    const id = codeCell.match(/6[가-힣]{1,2}\d{2}-\d{2}/)[0];
    const wk = cells.map(c => c.match(/^(\d{1,2})(주차?)?$/)).find(Boolean);
    const week = wk ? Math.min(PLAN.weeks, Math.max(1, +wk[1])) : (currentWeek() || 1);
    if (!BY_ID[id]) { miss.push(id); return; }
    const memoIdx = cells.indexOf(codeCell) + 1;
    const memo = cells.slice(memoIdx).filter(c => c && !/^(O|X|o|x)$/.test(c) && c !== BY_ID[id].title).join(" ");
    if (!PLAN.items.some(p => p.id === id && p.week === week)) { PLAN.items.push({ id, week, done: cells.includes("O"), memo }); ok++; }
  });
  savePlan(); renderPlan();
  toast(`✅ ${ok}개를 배치했어요${miss.length ? ` · 활동지가 없는 성취기준 ${miss.length}개는 건너뛰었어요` : ""}`);
}

/* =====================================================================
   🎒 ⑤ 수업 세트 만들기
   ===================================================================== */
let SET = store.get("portal_set_v1", { ids: [], t: "", m: "" });
function saveSet() { store.set("portal_set_v1", SET); }
function addToSet(id) {
  if (SET.ids.includes(id)) { toast("이미 수업 세트에 있어요."); return; }
  if (SET.ids.length >= SETTINGS.maxSetItems) { toast(`수업 세트에는 ${SETTINGS.maxSetItems}개까지 담을 수 있어요.`); return; }
  SET.ids.push(id); saveSet(); toast(`🎒 수업 세트에 담았어요! (${SET.ids.length}/${SETTINGS.maxSetItems})`);
}
let setQ = "";
function renderSet() {
  const link = SET.ids.length ? playLink(SET.ids, SET.t, SET.m) : "";
  $("#main").innerHTML = `
  <div class="setwrap">
    <section class="card">
      <h1>🎒 수업 세트 만들기</h1>
      <p class="muted">활동지를 골라 <b>링크 하나</b>로 학생에게 나눠 줘요. 학생은 링크로 들어와 고른 활동지만 보고 바로 활동해요. (최대 ${SETTINGS.maxSetItems}개)</p>
      <input type="text" id="sq" placeholder="🔍 활동지 검색 (예: 비례, 6사01)" value="${esc(setQ)}" style="width:100%">
      <div id="picks" style="max-height:520px;overflow:auto;margin-top:8px"></div>
    </section>
    <section class="card">
      <h2>📋 오늘의 활동 (${SET.ids.length}/${SETTINGS.maxSetItems})</h2>
      <label class="muted">수업 이름</label><input type="text" id="st" value="${esc(SET.t)}" placeholder="예: 6-2 4월 3주 사회" style="width:100%;margin-bottom:8px">
      <label class="muted">학생 안내 문구</label><input type="text" id="sm" value="${esc(SET.m)}" placeholder="예: 1번부터 차례대로! 다 하면 결과 저장하기 💾" style="width:100%;margin-bottom:10px">
      <div id="sel">${SET.ids.map((id, i) => { const it = BY_ID[id], sub = SUBJ[it.subjectShort]; return `<div class="sel" style="background:${sub.color}"><span class="no">${i + 1}</span><span class="grow"><b>${esc(it.title)}</b><br><span class="muted">${esc(it.code)}</span></span>
        <button class="btn sm ghost" data-up="${i}" aria-label="위로" ${i === 0 ? "disabled" : ""}>▲</button><button class="btn sm ghost" data-down="${i}" aria-label="아래로" ${i === SET.ids.length - 1 ? "disabled" : ""}>▼</button><button class="btn sm ghost" data-rm="${i}" aria-label="빼기">✖</button></div>`; }).join("") || `<div class="empty">왼쪽에서 ➕를 눌러 활동지를 담아요</div>`}</div>
      ${SET.ids.length ? `<h3>🔗 학생용 링크</h3><div class="linkbox" id="slink">${esc(link)}</div>
      <div class="row" style="margin-top:10px"><button class="btn main" id="sCopy">📋 링크 복사</button><button class="btn" id="sQR">📱 QR 크게 보기</button><a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener">👀 학생 화면 미리보기</a><button class="btn ghost" id="sClear">🗑️ 비우기</button></div>
      <p class="muted">💡 링크에 활동지 정보가 담겨 있어서 서버가 없어도 돼요. 학생 기기에서 결과를 저장하면 그 기기의 카드에 ✅가 표시돼요.</p>` : ""}
    </section>
  </div>`;
  const drawPicks = () => {
    const q = setQ.trim();
    const list = DATA.items.filter(o => !q || matchQ(o.search, q)).slice(0, 80);
    $("#picks").innerHTML = list.map(o => { const sub = SUBJ[o.subjectShort], on = SET.ids.includes(o.id); return `<div class="pick"><span class="pill" style="background:${sub.color}">${esc(o.id)}</span><span class="grow">${hl(o.title, q)}</span><button class="btn sm ${on ? "ghost" : "main"}" data-add="${o.id}" ${on ? "disabled" : ""} aria-label="${esc(o.title)} 담기">${on ? "담음" : "➕"}</button></div>`; }).join("") || `<div class="empty">검색 결과가 없어요</div>`;
    $$("[data-add]").forEach(b => b.onclick = () => { addToSet(b.dataset.add); renderSet(); });
  };
  drawPicks();
  $("#sq").oninput = e => { setQ = e.target.value; drawPicks(); };
  $("#st").oninput = e => { SET.t = e.target.value; saveSet(); updLink(); };
  $("#sm").oninput = e => { SET.m = e.target.value; saveSet(); updLink(); };
  const updLink = () => { const l = $("#slink"); if (l) l.textContent = playLink(SET.ids, SET.t, SET.m); };
  $$("[data-up]").forEach(b => b.onclick = () => { const i = +b.dataset.up; [SET.ids[i - 1], SET.ids[i]] = [SET.ids[i], SET.ids[i - 1]]; saveSet(); renderSet(); });
  $$("[data-down]").forEach(b => b.onclick = () => { const i = +b.dataset.down; [SET.ids[i + 1], SET.ids[i]] = [SET.ids[i], SET.ids[i + 1]]; saveSet(); renderSet(); });
  $$("[data-rm]").forEach(b => b.onclick = () => { SET.ids.splice(+b.dataset.rm, 1); saveSet(); renderSet(); });
  if (SET.ids.length) {
    $("#sCopy").onclick = () => copyText(playLink(SET.ids, SET.t, SET.m), "📋 학생용 링크를 복사했어요!");
    $("#sQR").onclick = () => showQR(null, `🎒 ${SET.t || "오늘의 활동"}`, playLink(SET.ids, SET.t, SET.m));
    $("#sClear").onclick = () => { SET = { ids: [], t: "", m: "" }; saveSet(); renderSet(); };
  }
}

/* =====================================================================
   🧒 학생 모드 (#play=…)
   ===================================================================== */
function renderPlay(r) {
  const items = r.ids.map(id => BY_ID[id]).filter(Boolean);
  document.title = `🎒 ${r.t || "오늘의 활동"}`;
  $("#main").dataset.view = "play";
  $("#main").innerHTML = `
    <div class="playhead"><div style="font-size:3rem">🎒</div><h1>${esc(r.t || "오늘의 활동")}</h1>${r.m ? `<div class="msg">📣 ${esc(r.m)}</div>` : ""}
      <p class="muted">카드를 눌러 활동을 시작해요. 다 하면 활동지 아래 <b>💾 결과 저장</b>을 꼭 눌러요!</p></div>
    <div class="playgrid">${items.map((it, i) => { const sub = SUBJ[it.subjectShort], done = triedHere(it); return `
      <button class="pc" data-go="${it.id}" style="background:linear-gradient(160deg,${sub.color},#fff)">
        <span class="num">${i + 1}</span>${done ? `<span class="done">✅ 저장 완료</span>` : ""}
        <span class="pt2">${esc(it.title)}</span><span class="muted">${sub.emoji} ${it.subjectShort} · ${esc(it.code)}</span><span style="font-size:1rem">🎯 ${esc(it.goal)}</span>
      </button>`; }).join("") || `<div class="empty card">😢 활동지를 찾을 수 없어요. 선생님께 링크를 다시 받아 주세요.</div>`}</div>`;
  $$(".pc").forEach(b => b.onclick = () => { const it = BY_ID[b.dataset.go]; $("#playerFrame").src = it.href; $("#player").hidden = false; document.body.style.overflow = "hidden"; $("#backBtn").focus(); });
}
$("#backBtn").onclick = () => { $("#player").hidden = true; $("#playerFrame").src = "about:blank"; document.body.style.overflow = ""; route(); };

/* =====================================================================
   🚀 시작
   ===================================================================== */
(async function init() {
  $("#schoolName").textContent = SETTINGS.schoolName;
  DATA = await loadData();
  if (!DATA) {
    $("#main").innerHTML = `<div class="card notice"><h2>📂 데이터를 불러올 수 없어요</h2>
      <p><code>data/bundle.js</code> 파일이 있는지 확인해 주세요. bundle.js가 없으면 이 포털은 웹 주소(https://)로 열어야 해요.</p>
      <p>선생님 PC에서 확인하려면 포털 폴더에서 <code>python -m http.server</code>를 실행한 뒤 <b>http://localhost:8000</b> 으로 여세요.<br>
      또는 <code>python tools/make_bundle.py</code>를 실행하면 bundle.js가 다시 만들어져요.</p></div>`;
    return;
  }
  // 전자칠판 모드
  const big = store.get("portal_big", false); document.body.classList.toggle("big", big); $("#bigBtn").setAttribute("aria-pressed", big);
  $("#bigBtn").onclick = () => { const b = !document.body.classList.contains("big"); document.body.classList.toggle("big", b); $("#bigBtn").setAttribute("aria-pressed", b); store.set("portal_big", b); };
  // 상단 검색 → 찾기 화면
  $("#gSearch").addEventListener("input", e => { F.q = e.target.value; if (lastView !== "find" || $("#main").dataset.view !== "find") { renderView("find"); history.replaceState(null, "", "#find"); $("#gSearch").focus(); } else { const fq = $("#fq"); if (fq) fq.value = F.q; drawResults(); } });
  window.addEventListener("hashchange", route);
  window.addEventListener("storage", () => { if (document.body.classList.contains("play")) route(); });
  route();
})();
