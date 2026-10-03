import { TRIP, PLACES, PLAN, FOOD, QUESTS, FACTS, TIPS, PHONES } from "./data.js?v=4";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- 时间：?t=2026-10-04T09:00 可模拟任意时刻（时钟会继续走） ----------
const sim = new URLSearchParams(location.search).get("t");
const offset = sim ? new Date(sim + (sim.includes("+") ? "" : "+08:00")) - Date.now() : 0;
const now = () => new Date(Date.now() + offset);
const DAYS = { 1: "2026-10-03", 2: "2026-10-04" };
const at = (day, hm) => new Date(`${DAYS[day]}T${hm}:00+08:00`);
const items = PLAN.map((p, i) => ({ ...p, n: i + 1, s: at(p.day, p.t), en: at(p.day, p.e) }));
const START = new Date(TRIP.start), END = new Date(TRIP.end);
const SUNSET = new Date(TRIP.sun.d1Sunset), SUNRISE = new Date(TRIP.sun.d2Sunrise);
const hm = (d) => d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
const dur = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
};
const amap = (kw) => `https://uri.amap.com/search?keyword=${encodeURIComponent(kw)}&city=350200&callnative=1`;

// ---------- 存储 ----------
const KEY = "gly21h";
const state = Object.assign({ checks: {}, food: {}, quests: {}, kidName: "", phone: "", theme: "" }, JSON.parse(localStorage.getItem(KEY) || "{}"));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const idb = (() => {
  let p;
  const db = () => (p ??= new Promise((res, rej) => {
    const r = indexedDB.open(KEY, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("photos", mode);
      const req = fn(t.objectStore("photos"));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    del: (k) => tx("readwrite", (s) => s.delete(k)),
    all: () => tx("readonly", (s) => s.getAllKeys()),
  };
})();
const photos = {};

// ---------- 邮戳 ----------
let sid = 0;
function stamp({ ring = "GULANGYU", mid = "10.03", sub = "", color = "var(--bloom)", rot = -12, size = 120 }) {
  const id = `sp${++sid}`;
  return `<svg viewBox="0 0 120 120" width="100%" height="100%" style="transform:rotate(${rot}deg)" aria-hidden="true">
    <defs><path id="${id}" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0"/>
    <filter id="${id}f"><feTurbulence baseFrequency=".9" numOctaves="1" seed="${sid}"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter></defs>
    <g fill="none" stroke="${color}" filter="url(#${id}f)" opacity=".9">
      <circle cx="60" cy="60" r="56" stroke-width="3"/><circle cx="60" cy="60" r="33" stroke-width="1.5"/>
      <text font-family="WenKai,serif" font-size="12.5" fill="${color}" stroke="none" letter-spacing="2.2"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(ring)}</textPath></text>
      <text x="60" y="${sub ? 62 : 66}" text-anchor="middle" font-family="WenKai,serif" font-size="${mid.length > 5 ? 13 : 17}" fill="${color}" stroke="none">${esc(mid)}</text>
      ${sub ? `<text x="60" y="78" text-anchor="middle" font-family="WenKai,serif" font-size="11" fill="${color}" stroke="none">${esc(sub)}</text>` : ""}
    </g></svg>`;
}

// ---------- 小工具 ----------
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}
function confetti(chars = ["🌺", "✨", "🎹", "🐚", "⭐"]) {
  for (let i = 0; i < 26; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.textContent = chars[i % chars.length];
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * .4 + "s";
    document.body.append(c);
    setTimeout(() => c.remove(), 3800);
  }
}
const modal = $("#modal");
function openModal(html) {
  $("#modalBody").innerHTML = html;
  modal.hidden = false;
}
modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest("[data-close]")) { modal.querySelector("video")?.pause(); modal.hidden = true; }
});

// ---------- 主题：日落后 30 分钟到日出，自动切换夜色 ----------
function applyTheme() {
  const t = now();
  let night = t >= START && t <= END ? t >= new Date(+SUNSET + 30 * 60000) && t < SUNRISE : (t.getHours() >= 19 || t.getHours() < 6);
  if (state.theme) night = state.theme === "night";
  document.documentElement.dataset.theme = night ? "night" : "day";
  $('meta[name="theme-color"]').content = night ? "#17222C" : "#F4EBDD";
}

// ---------- 此刻 ----------
function renderHero() {
  $("#heroStamp").innerHTML = stamp({ ring: "· GULANGYU · 鼓浪屿 · 琴岛 ", mid: "21h", sub: "10.03—10.04", color: "#FBF3E4", rot: -14 });
}
$("#heroStamp").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme;
  state.theme = cur === "night" ? "day" : "night";
  save();
  applyTheme();
  toast(state.theme === "night" ? "切到夜色" : "切到白天");
});

function renderNow() {
  const t = now();
  const el = $("#nowCard");
  const cur = items.find((p) => t >= p.s && t < p.en);
  const next = items.find((p) => p.s > t);
  let html = "";
  if (t < START) {
    html = `<span class="label"><i class="pulse"></i>即将出发</span>
      <h3>离旅程开始还有</h3><div class="count">${dur(START - t)}</div>`;
  } else if (t >= END) {
    const n = Object.keys(state.checks).length;
    html = `<span class="label">旅程结束</span><h3>鼓浪屿，下次见 👋</h3>
      <p class="when">一共盖了 ${n} 个邮戳。把这 21 小时做成一张明信片吧。</p>
      <div class="now-actions"><button class="btn bloom" data-act="postcard">💌 生成旅行明信片</button></div>`;
  } else if (cur) {
    const pct = ((t - cur.s) / (cur.en - cur.s)) * 100;
    const pl = cur.place && PLACES[cur.place];
    html = `<span class="label"><i class="pulse"></i>现在 · ${hm(t)}</span>
      <h3>${esc(cur.title)}</h3>
      <div class="when">${cur.t}–${cur.e}${pl ? ` · ${pl.name}` : ""} · 还剩 ${dur(cur.en - t)}</div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      ${cur.kid ? `<div class="kidline">🧒 ${esc(cur.kid)}</div>` : ""}
      <div class="now-actions">
        ${pl ? `<a class="btn sea" href="${amap(pl.kw)}" target="_blank" rel="noopener">⌖ 导航</a>` : ""}
        <button class="btn" data-goto="${cur.id}">看详情</button>
        ${state.checks[cur.id] ? "" : `<button class="btn bloom" data-check="${cur.id}">盖章打卡</button>`}
      </div>`;
  } else if (next) {
    html = `<span class="label"><i class="pulse"></i>自由活动 · ${hm(t)}</span>
      <h3>歇一会儿，下一站是</h3><div class="count">${esc(next.title)}</div>
      <div class="when">${next.t} 开始 · 还有 ${dur(next.s - t)}</div>`;
  }
  if (next && t >= START && (cur ? next !== cur : false)) {
    html += `<div class="next"><span>下一站 · <b>${esc(next.title)}</b></span><span>${next.t} · ${dur(next.s - t)}后</span></div>`;
  }
  // 两个关键倒计时：今晚日落、明天离岛
  if (t < SUNSET && SUNSET - t < 6 * 3600e3) {
    html += `<div class="next"><span>🌅 今天日落 17:52</span><span class="count" style="font-size:20px">${dur(SUNSET - t)}</span></div>`;
  } else if (t > SUNRISE && t < END) {
    html += `<div class="next"><span>⛴️ 离岛船 13:00</span><span class="count" style="font-size:20px">${dur(END - t)}</span></div>`;
  }
  el.innerHTML = html;
}

// ---------- 天气（Open-Meteo，无需 key；失败时用出发前查到的预报） ----------
const WMO = (c) => c === 0 ? ["☀️", "晴"] : c <= 2 ? ["🌤", "少云"] : c === 3 ? ["☁️", "阴"] : c <= 48 ? ["🌫", "雾"] : c <= 57 ? ["🌦", "毛毛雨"] : c <= 67 ? ["🌧", "雨"] : c <= 82 ? ["🌦", "阵雨"] : ["⛈", "雷阵雨"];
const FALLBACK = { time: ["2026-10-03T16:00", "2026-10-03T19:00", "2026-10-04T06:00", "2026-10-04T09:00", "2026-10-04T12:00", "2026-10-04T15:00"], temperature_2m: [29.7, 27.1, 24.7, 28.3, 32, 31], precipitation_probability: [29, 30, 1, 0, 3, 70], weathercode: [51, 3, 1, 0, 2, 95] };
async function renderWeather() {
  let h = JSON.parse(localStorage.getItem(KEY + ":wx") || "null") || FALLBACK;
  draw(h);
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${TRIP.coord.lat}&longitude=${TRIP.coord.lng}&hourly=temperature_2m,precipitation_probability,weathercode&timezone=Asia%2FShanghai&start_date=2026-10-03&end_date=2026-10-04`;
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    h = (await r.json()).hourly;
    localStorage.setItem(KEY + ":wx", JSON.stringify(h));
    draw(h);
  } catch { /* 离线就用缓存 */ }
  function draw(h) {
    const pick = (iso) => {
      let i = h.time.findIndex((x) => x >= iso);
      if (i < 0) i = h.time.length - 1;
      return { t: h.temperature_2m[i], p: h.precipitation_probability[i], c: h.weathercode[i] };
    };
    const t = now();
    const iso = new Date(+t + 8 * 3600e3).toISOString().slice(0, 13);
    const slots = [["现在", iso], ["今晚 20 点", "2026-10-03T20"], ["明早 7 点", "2026-10-04T07"], ["明天中午", "2026-10-04T12"], ["明天 15 点", "2026-10-04T15"]];
    $("#weather").innerHTML = slots.filter(([, s]) => s >= iso || s === iso).map(([lab, s]) => {
      const w = pick(s);
      const [ic, tx] = WMO(w.c);
      return `<div class="chip${w.p >= 60 ? " sun" : ""}"><small>${lab}</small><b>${ic} ${Math.round(w.t)}°</b><small>${tx}${w.p >= 20 ? ` ${w.p}%` : ""}</small></div>`;
    }).join("") + `<div class="chip"><small>日落</small><b>🌅 17:52</b><small>10/3</small></div><div class="chip"><small>日出</small><b>🌄 06:00</b><small>10/4</small></div>`;
  }
}

function renderTips() {
  $("#tips").innerHTML = TIPS.map((t) => `<div class="tip postcard"><h3>${esc(t.title)}</h3><ul>${t.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
  $("#phones").innerHTML = PHONES.map((p) => `<a class="btn" href="tel:${p.num.replace(/-/g, "")}">📞 ${esc(p.name)} ${p.num}</a>`).join("");
}

// ---------- 行程 ----------
function renderPlan() {
  const t = now();
  let html = "";
  for (const day of [1, 2]) {
    html += `<div class="day-head"><b>${day === 1 ? "第一天 · 10/3 周六" : "第二天 · 10/4 周日"}</b><span>${day === 1 ? "傍晚 · 日落 · 夜色" : "清晨 · 登高 · 告别"}</span></div>`;
    for (const p of items.filter((x) => x.day === day)) {
      const pl = p.place && PLACES[p.place];
      const done = state.checks[p.id];
      const cls = ["tl", `d${day}`, done && "done", t >= p.s && t < p.en && "now", t >= p.en && "past"].filter(Boolean).join(" ");
      html += `<div class="${cls}" id="p-${p.id}">
        <div class="time">${p.t}<small>${p.e}</small></div><i class="dot"></i>
        <div class="item postcard">
          <img class="thumb" src="img/${p.art}.jpg" alt="" loading="lazy">
          <h3>${esc(p.title)}${p.optional ? '<span class="opt">可选</span>' : ""}</h3>
          ${pl ? `<div class="hint" style="margin:2px 0 0">📍 ${pl.name}</div>` : ""}
          <p>${esc(p.desc)}</p>
          <ul>${p.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ${p.kid ? `<div class="kidline">🧒 ${esc(p.kid)}</div>` : ""}
          <div class="acts">
            ${pl ? `<a class="btn sea" href="${amap(pl.kw)}" target="_blank" rel="noopener">⌖ 导航</a>` : ""}
            ${done ? `<button class="btn" data-photo="${p.id}">📷 ${photos[p.id] ? "换照片" : "加照片"}</button><button class="btn" data-uncheck="${p.id}" style="border-color:transparent;color:var(--ink-soft)">撤销</button>`
              : `<button class="btn bloom" data-check="${p.id}">盖章打卡</button>`}
          </div>
          ${photos[p.id] ? `<img class="photo" src="${photos[p.id]}" alt="打卡照片">` : ""}
          <div class="stamp-slot">${done ? stamp({ ring: `${pl ? pl.name : p.title} · GULANGYU · `, mid: hm(new Date(done)), sub: day === 1 ? "2026.10.03" : "2026.10.04", color: day === 1 ? "var(--brick)" : "var(--sea)", rot: (p.n * 37) % 30 - 15 }) : ""}</div>
        </div></div>`;
    }
  }
  $("#timeline").innerHTML = html;
  $("#planProgress").textContent = `已打卡 ${Object.keys(state.checks).length}/${items.length}`;
}

function check(id) {
  state.checks[id] = +now();
  save();
  renderAll();
  confetti(["🌺", "✨", "📮"]);
  const p = items.find((x) => x.id === id);
  toast(`📮 ${p.title}，盖章成功`);
}

// 照片压缩到长边 1280，存在本机 IndexedDB
let photoFor = null;
$("#photoInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !photoFor) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const data = c.toDataURL("image/jpeg", .82);
  photos[photoFor] = data;
  await idb.set(photoFor, data);
  renderPlan();
  toast("照片已存进手账（只保存在这台手机）");
});

// ---------- 地图（手绘示意图） ----------
const X = (lng) => (lng - 118.0555) * 20000;
const Y = (lat) => (24.4570 - lat) * 21980;
const COAST = [[118.064, 24.4556], [118.069, 24.4541], [118.0716, 24.452], [118.0719, 24.4495], [118.0713, 24.4476], [118.0726, 24.4456], [118.074, 24.4441], [118.0716, 24.4424], [118.068, 24.4411], [118.065, 24.4409], [118.062, 24.4417], [118.059, 24.4424], [118.0574, 24.4445], [118.0579, 24.448], [118.0589, 24.4511], [118.061, 24.4541]].map(([a, b]) => [X(a), Y(b)]);
function smooth(pts, closed) {
  const P = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
  let d = `M${P[1][0].toFixed(1)},${P[1][1].toFixed(1)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1.map((v) => v.toFixed(1))} ${c2.map((v) => v.toFixed(1))} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + (closed ? "Z" : "");
}
const LABEL = { longtou: [-9, 4, "end"], rock: [-9, 4, "end"], gangzaihou: [-6, 18, "end"], shuzhuang: [6, 18, "start"], dadeji: [0, 20, "middle"], haoyue: [0, -12, "middle"], organ: [-9, 4, "end"], meihua: [0, 20, "middle"], gulangshi: [-9, 4, "end"] };
const routeOf = (day) => items.filter((p) => p.day === day && p.place).map((p) => p.place).filter((x, i, a) => x !== a[i - 1]);
let selPlace = null;
function renderMap() {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
      const [xi, yi] = COAST[i], [xj, yj] = COAST[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let trees = "";
  for (let k = 0; k < 140; k++) {
    const x = 40 + rnd() * 330, y = 30 + rnd() * 330;
    if (inside(x, y)) trees += rnd() > .45 ? `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + rnd() * 3).toFixed(1)}" fill="#7DA06A" opacity=".45"/>` : `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="5" height="4" fill="#C2583F" opacity=".5" transform="rotate(${(rnd() * 40 - 20).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }
  let waves = "";
  for (let k = 0; k < 26; k++) {
    const x = rnd() * 380, y = rnd() * 380;
    if (!inside(x + 6, y)) waves += `<path d="M${x.toFixed(0)},${y.toFixed(0)} q4,-4 8,0 t8,0" fill="none" stroke="#1E6470" stroke-width="1" opacity=".35"/>`;
  }
  const route = (day, color) => {
    const pts = routeOf(day).map((k) => [X(PLACES[k].lng), Y(PLACES[k].lat)]);
    return `<path d="${smooth(pts, false)}" fill="none" stroke="${color}" stroke-width="2.6" stroke-dasharray="6 5" stroke-linecap="round" opacity=".9"><animate attributeName="stroke-dashoffset" from="22" to="0" dur="1.2s" repeatCount="indefinite"/></path>`;
  };
  const d1 = new Set(routeOf(1)), d2 = new Set(routeOf(2));
  const pins = Object.entries(PLACES).filter(([k]) => !["luqiao", "yuyuan"].includes(k)).map(([k, p]) => {
    const x = X(p.lng), y = Y(p.lat);
    const col = d1.has(k) && d2.has(k) ? "#C7366F" : d1.has(k) ? "#B5452F" : d2.has(k) ? "#1E6470" : "#8C7B6E";
    const [dx, dy, an] = LABEL[k] || [9, 4, "start"];
    return `<g class="pin${selPlace === k ? " sel" : ""}" data-place="${k}">
      <circle cx="${x}" cy="${y}" r="14" fill="transparent"/>
      <circle class="b" cx="${x}" cy="${y}" r="6" fill="${col}" stroke="#FBF6EC" stroke-width="2"/>
      <text x="${x + dx}" y="${y + dy}" text-anchor="${an}" font-size="12" fill="#2B211C" stroke="#F4EBDD" stroke-width="3" paint-order="stroke">${p.name}</text></g>`;
  }).join("");
  $("#mapWrap").innerHTML = `<svg viewBox="0 0 400 390" role="img" aria-label="鼓浪屿示意地图">
    <defs><pattern id="sea" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#CFE3DE"/><circle cx="2" cy="2" r=".7" fill="#1E6470" opacity=".18"/></pattern>
    <filter id="rough"><feTurbulence baseFrequency=".04" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter></defs>
    <rect width="400" height="390" fill="url(#sea)"/>${waves}
    <path d="${smooth(COAST, true)}" fill="#D9C9A3" stroke="#8C6E4A" stroke-width="1.6" filter="url(#rough)"/>
    <path d="${smooth(COAST, true)}" fill="#EFE2C2" transform="translate(4 -3)" opacity=".7" filter="url(#rough)"/>
    ${trees}${route(1, "#B5452F")}${route(2, "#1E6470")}${pins}
    <text x="388" y="70" text-anchor="end" font-size="13" fill="#1E6470" font-family="WenKai,serif">厦门本岛 →</text>
    <text x="378" y="160" text-anchor="end" font-size="11" fill="#1E6470" opacity=".8" font-family="WenKai,serif" writing-mode="tb">鹭江</text>
    <text x="14" y="24" font-size="12" fill="#1E6470" font-family="WenKai,serif">↖ 海沧大桥</text>
    <g transform="translate(30 350)"><circle r="14" fill="#FBF6EC" stroke="#2B211C"/><path d="M0,-11 L4,0 L0,-3 L-4,0Z" fill="#B5452F"/><text y="-17" text-anchor="middle" font-size="10" font-family="WenKai,serif">北</text></g>
  </svg>`;
}
function renderPlaceSheet() {
  if (!selPlace) { $("#placeSheet").innerHTML = ""; return; }
  const p = PLACES[selPlace];
  const rel = items.filter((x) => x.place === selPlace);
  $("#placeSheet").innerHTML = `<div class="postcard"><h3>${p.name}</h3>
    ${rel.length ? `<div class="rel">${rel.map((r) => `<div>第${r.day === 1 ? "一" : "二"}天 ${r.t} · ${esc(r.title)} ${state.checks[r.id] ? "📮" : ""}</div>`).join("")}</div>` : `<p class="hint">不在主路线上，顺路可以去看看。</p>`}
    <div class="row" style="display:flex;gap:8px;margin-top:8px"><a class="btn sea" href="${amap(p.kw)}" target="_blank" rel="noopener">⌖ 用高德导航</a>
    ${rel[0] ? `<button class="btn" data-goto="${rel[0].id}">看行程</button>` : ""}</div></div>`;
}

// ---------- 吃 ----------
function renderFood() {
  $("#foodGrid").innerHTML = FOOD.map((f) => {
    const s = state.food[f.id] || "";
    return `<div class="food postcard ${s}" data-food="${f.id}">
      <span class="tag">${esc(f.tag)}</span><h3>${esc(f.name)}</h3>
      <div class="what">${esc(f.what)}</div><div class="where">📍 ${esc(f.where)}</div>
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ""}${f.kid ? `<div class="kidok">✓ 小朋友友好</div>` : ""}
      <button class="fbtn">${s === "ate" ? "✓ 吃过啦" : s === "want" ? "♡ 想吃 → 点我标记吃过" : "♡ 想吃"}</button></div>`;
  }).join("");
  const ate = Object.values(state.food).filter((v) => v === "ate").length;
  $("#foodProgress").textContent = `吃过 ${ate}/${FOOD.length}`;
}

// ---------- 探险家 ----------
function renderKid() {
  $("#kidName").value = state.kidName;
  $("#questGrid").innerHTML = QUESTS.map((q) => {
    const d = state.quests[q.id];
    return `<button class="quest${d ? " done" : ""}" data-quest="${q.id}">
      <span class="ic">${q.icon}</span><span class="qt">${esc(q.title)}</span>${q.hint ? `<span class="qh">${esc(q.hint)}</span>` : ""}
      <span class="qs">${d ? stamp({ ring: "· EXPLORER · 探险家 ", mid: "✓", sub: hm(new Date(d)), color: "var(--bloom)", rot: (q.id.length * 23) % 40 - 20 }) : ""}</span></button>`;
  }).join("");
  const n = Object.keys(state.quests).length;
  $("#questProgress").innerHTML = n >= QUESTS.length ? `全部完成！<button class="btn bloom" data-act="cert">🎓 领取结业证书</button>` : `已完成 ${n}/${QUESTS.length}，集齐 ${QUESTS.length} 个邮戳可以领结业证书`;
}
$("#kidName").addEventListener("input", (e) => { state.kidName = e.target.value.trim(); save(); });

// ---------- Canvas：明信片 / 证书 ----------
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function cover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k, sh = h / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function paper(ctx, W, H) {
  ctx.fillStyle = "#F4EBDD";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(90,70,50,${Math.random() * .05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}
async function svgImg(svg) {
  const fixed = svg.replaceAll("var(--bloom)", "#C7366F").replaceAll("var(--brick)", "#B5452F").replaceAll("var(--sea)", "#1E6470").replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  return loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(fixed));
}
function wrap(ctx, text, x, y, maxW, lh) {
  let line = "";
  for (const ch of text) {
    if (ch === "\n" || ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y); y += lh; line = ch === "\n" ? "" : ch; } else line += ch;
  }
  ctx.fillText(line, x, y);
  return y + lh;
}

async function makePostcard(msg) {
  await document.fonts.load('40px "WenKai"');
  const W = 1080, H = 1560, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  paper(ctx, W, H);
  const ids = items.map((p) => p.id).filter((id) => photos[id]).slice(0, 4);
  const imgs = ids.length ? await Promise.all(ids.map((id) => loadImg(photos[id]))) : [await loadImg("img/cover.jpg")];
  const box = { x: 50, y: 50, w: W - 100, h: 800 };
  ctx.fillStyle = "#fff";
  ctx.fillRect(box.x - 14, box.y - 14, box.w + 28, box.h + 28);
  const g = 10;
  const cells = imgs.length === 1 ? [[0, 0, 1, 1]] : imgs.length === 2 ? [[0, 0, .5, 1], [.5, 0, .5, 1]] : imgs.length === 3 ? [[0, 0, .6, 1], [.6, 0, .4, .5], [.6, .5, .4, .5]] : [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]];
  imgs.forEach((im, i) => {
    const [a, b, cw, ch] = cells[i];
    cover(ctx, im, box.x + a * box.w + (a ? g / 2 : 0), box.y + b * box.h + (b ? g / 2 : 0), cw * box.w - (cells.length > 1 ? g / 2 : 0), ch * box.h - (cells.length > 2 && ch < 1 ? g / 2 : 0));
  });
  // 左：标题和留言；右：邮票、邮戳、地址线
  ctx.fillStyle = "#2B211C";
  ctx.font = '700 64px "WenKai"';
  ctx.fillText("琴岛二十一小时", 60, 960);
  ctx.font = '28px "WenKai"';
  ctx.fillStyle = "#6B5B50";
  ctx.fillText("鼓浪屿 · 2026.10.03 16:00 — 10.04 13:00", 62, 1008);
  ctx.strokeStyle = "rgba(43,33,28,.25)";
  ctx.beginPath(); ctx.moveTo(640, 1050); ctx.lineTo(640, 1480); ctx.stroke();
  ctx.fillStyle = "#2B211C";
  ctx.font = '34px "WenKai"';
  wrap(ctx, msg, 62, 1080, 550, 52);
  // 邮票
  ctx.save(); ctx.translate(840, 1060);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 170, 210);
  cover(ctx, await loadImg("img/garden.jpg"), 12, 12, 146, 186);
  ctx.restore();
  ctx.drawImage(await svgImg(stamp({ ring: "· GULANGYU · 鼓浪屿 · 厦门 ", mid: "10.04", sub: "13:00", color: "#C7366F", rot: -18 })), 690, 1120, 220, 220);
  const ate = Object.values(state.food).filter((v) => v === "ate").length;
  const stats = [`盖了 ${Object.keys(state.checks).length} 个邮戳`, `吃了 ${ate} 样好吃的`, `完成 ${Object.keys(state.quests).length} 项探险`];
  ctx.font = '30px "WenKai"';
  stats.forEach((s, i) => {
    ctx.fillStyle = "#2B211C"; ctx.fillText(s, 680, 1390 + i * 44);
    ctx.strokeStyle = "rgba(43,33,28,.25)"; ctx.beginPath(); ctx.moveTo(680, 1400 + i * 44); ctx.lineTo(1020, 1400 + i * 44); ctx.stroke();
  });
  ctx.font = '22px "WenKai"'; ctx.fillStyle = "#6B5B50";
  ctx.fillText("POST CARD · 寄给未来的我们", 62, 1510);
  return c.toDataURL("image/jpeg", .9);
}

async function makeCert() {
  await document.fonts.load('40px "WenKai"');
  const W = 1080, H = 1440, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  paper(ctx, W, H);
  ctx.strokeStyle = "#B5452F"; ctx.lineWidth = 6; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 2; ctx.strokeRect(58, 58, W - 116, H - 116);
  const hero = await loadImg("img/cover.jpg");
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 290, 150, 0, 7); ctx.clip(); cover(ctx, hero, W / 2 - 150, 140, 300, 300); ctx.restore();
  ctx.textAlign = "center"; ctx.fillStyle = "#2B211C";
  ctx.font = '26px "WenKai"'; ctx.fillText("GULANGYU EXPLORER CERTIFICATE", W / 2, 500);
  ctx.font = '700 76px "WenKai"'; ctx.fillText("小小探险家结业证书", W / 2, 600);
  ctx.font = '700 92px "WenKai"'; ctx.fillStyle = "#C7366F"; ctx.fillText(state.kidName || "小探险家", W / 2, 740);
  ctx.fillStyle = "#2B211C"; ctx.font = '36px "WenKai"';
  ctx.fillText("在鼓浪屿的二十一小时里", W / 2, 830);
  ctx.fillText(`完成了全部 ${QUESTS.length} 项探险任务，特发此证！`, W / 2, 884);
  ctx.font = '60px serif';
  QUESTS.forEach((q, i) => ctx.fillText(q.icon, W / 2 + (i % 5 - 2) * 130, 1000 + Math.floor(i / 5) * 90));
  ctx.font = '30px "WenKai"'; ctx.fillStyle = "#6B5B50";
  ctx.fillText("颁发：爸爸 & 妈妈 · 2026 年 10 月 4 日", W / 2, 1270);
  ctx.drawImage(await svgImg(stamp({ ring: "· 鼓浪屿探险协会 · EXPLORER ", mid: "认证", sub: "2026.10", color: "#C7366F", rot: -16 })), 760, 1110, 230, 230);
  return c.toDataURL("image/jpeg", .9);
}
function showImage(title, data, name) {
  openModal(`<h3>${title}</h3><img class="out" src="${data}" alt="${title}">
    <p class="hint">在微信里打开的话，长按图片保存。</p>
    <div class="row"><a class="btn solid" href="${data}" download="${name}">⬇ 下载</a><button class="btn" data-close>关闭</button></div>`);
}

// ---------- 弹窗动作 ----------
const ACTS = {
  // 托管服务器不支持 Range、也不返回 video/mp4，iOS 无法直接流式播放，所以先整段下载成 blob 再播
  async video() {
    openModal(`<h3>🎬 琴岛二十一小时</h3><video poster="img/cover.jpg" controls playsinline></video>
      <p class="hint" id="vidMsg">正在加载 0%（约 23MB）</p>
      <div class="row"><button class="btn" data-close>关闭</button></div>`);
    const v = $("#modalBody video"), msg = $("#vidMsg");
    try {
      ACTS.blob ??= (async () => {
        const r = await fetch("video/gulangyu-720.mp4");
        const total = +r.headers.get("content-length") || 23.3e6;
        const reader = r.body.getReader(), parts = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.length;
          const m = $("#vidMsg");
          if (m) m.textContent = `正在加载 ${Math.min(99, Math.round(got / total * 100))}%（约 23MB）`;
        }
        return URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
      })();
      v.src = await ACTS.blob;
      msg.textContent = "点播放就能看";
      v.play().catch(() => {});
    } catch {
      ACTS.blob = null;
      msg.textContent = "加载失败，换个网络再试试";
    }
  },
  lost() {
    openModal(`<h3>🆘 防走失卡</h3><p class="hint">填好后截图设成锁屏，或者给工作人员看。信息只保存在这台手机里。</p>
      <input type="text" id="lfName" placeholder="孩子的名字" value="${esc(state.kidName)}">
      <input type="tel" id="lfPhone" placeholder="爸爸/妈妈手机号" value="${esc(state.phone)}" style="margin-top:8px">
      <div class="row"><button class="btn bloom" id="lfGo">生成大字卡</button><button class="btn" data-close>关闭</button></div>`);
    $("#lfGo").onclick = () => {
      state.kidName = $("#lfName").value.trim(); state.phone = $("#lfPhone").value.trim(); save(); renderKid();
      openModal(`<div class="lost"><div class="big">我叫 <b>${esc(state.kidName || "＿＿")}</b><br>我和爸爸妈妈走散了</div>
        <p>请帮我打电话给爸爸妈妈 / Please call my parents</p><div class="num">${esc(state.phone || "＿＿＿＿")}</div>
        <p>鼓浪屿 · 集合点：钢琴码头的钢琴</p></div><div class="row"><button class="btn" data-close>关闭</button></div>`);
    };
  },
  fact() {
    const f = FACTS[Math.floor(Math.random() * FACTS.length)];
    openModal(`<h3>🐚 鼓浪屿冷知识</h3><p class="fact">${esc(f)}</p><div class="row"><button class="btn bloom" data-act="fact">再来一个</button><button class="btn" data-close>关闭</button></div>`);
  },
  postcard() {
    const n = Object.keys(photos).length;
    openModal(`<h3>💌 生成旅行明信片</h3><p class="hint">会用打卡时拍的照片（已有 ${n} 张，最多 4 张），没照片就用插画。写一句话给未来的你们：</p>
      <textarea id="pcMsg" rows="4">${esc(localStorage.getItem(KEY + ":msg") || "在鼓浪屿听到了海浪打鼓，看到了海上的日落。一家三口，二十一小时，刚刚好。")}</textarea>
      <div class="row"><button class="btn bloom" id="pcGo">生成</button><button class="btn" data-close>取消</button></div>`);
    $("#pcGo").onclick = async () => {
      const msg = $("#pcMsg").value;
      localStorage.setItem(KEY + ":msg", msg);
      $("#pcGo").textContent = "正在印刷…";
      showImage("你们的明信片", await makePostcard(msg), "gulangyu-postcard.jpg");
      confetti(["💌", "🌺", "✨"]);
    };
  },
  async cert() {
    confetti(["🎓", "⭐", "🌺", "🎹"]);
    showImage("🎓 结业证书", await makeCert(), "explorer-certificate.jpg");
  },
};

// ---------- 事件 ----------
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  if (a) return ACTS[a.dataset.act]();
  const c = e.target.closest("[data-check]");
  if (c) return check(c.dataset.check);
  const u = e.target.closest("[data-uncheck]");
  if (u) {
    delete state.checks[u.dataset.uncheck]; save(); renderAll(); return;
  }
  const ph = e.target.closest("[data-photo]");
  if (ph) { photoFor = ph.dataset.photo; $("#photoInput").click(); return; }
  const g = e.target.closest("[data-goto]");
  if (g) { modal.hidden = true; tab("plan"); setTimeout(() => $(`#p-${g.dataset.goto}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); return; }
  const pin = e.target.closest("[data-place]");
  if (pin) { selPlace = pin.dataset.place; renderMap(); renderPlaceSheet(); return; }
  const f = e.target.closest("[data-food]");
  if (f) {
    const id = f.dataset.food, s = state.food[id];
    state.food[id] = !s ? "want" : s === "want" ? "ate" : "";
    if (!state.food[id]) delete state.food[id];
    save(); renderFood();
    if (state.food[id] === "ate") toast("😋 好吃！");
    return;
  }
  const q = e.target.closest("[data-quest]");
  if (q) {
    const id = q.dataset.quest;
    if (state.quests[id]) delete state.quests[id];
    else { state.quests[id] = +now(); confetti(["⭐", "🌟", QUESTS.find((x) => x.id === id).icon]); }
    save(); renderKid();
    if (Object.keys(state.quests).length === QUESTS.length && state.quests[id]) setTimeout(ACTS.cert, 900);
  }
});

function tab(name) {
  $$(".view").forEach((v) => (v.hidden = v.dataset.view !== name));
  $$("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "plan") {
    const cur = items.find((p) => now() >= p.s && now() < p.en) || items.find((p) => p.s > now());
    if (cur) setTimeout(() => $(`#p-${cur.id}`)?.scrollIntoView({ block: "center" }), 30);
  } else scrollTo(0, 0);
  history.replaceState(null, "", `#${name}`);
}
$$("#tabbar button").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));

function renderAll() {
  applyTheme(); renderNow(); renderPlan(); renderMap(); renderPlaceSheet(); renderFood(); renderKid();
}

// ---------- 启动 ----------
renderHero(); renderTips(); renderAll(); renderWeather();
tab(["now", "plan", "map", "food", "kid"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "now");
idb.all().then(async (keys) => {
  for (const k of keys) photos[k] = await idb.get(k);
  if (keys.length) renderPlan();
}).catch(() => {});
setInterval(() => { applyTheme(); renderNow(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) renderAll(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
