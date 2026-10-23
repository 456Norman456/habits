/* Огонёк — трекер привычек. Все данные хранятся только в localStorage этого телефона. */
(function(){
"use strict";

var KEY = "ogonek.v1";
var VERSION = "1.1";

/* ───────── даты: работаем с номерами дней (дни от 1970-01-01 по местному календарю) ───────── */
var DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
var DOWFULL = ["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"];
var MON = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
var MONS = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var MONN = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function pad(n){ return (n < 10 ? "0" : "") + n; }
function today(){ var d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function D(n){ return new Date(n * 864e5); }
function key(n){ var d = D(n); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
function dn(k){ var p = String(k).split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function dow(n){ return (D(n).getUTCDay() + 6) % 7; }
function wk(n){ return n - dow(n); }
function dnum(n){ return D(n).getUTCDate(); }
function mon(n){ return D(n).getUTCMonth(); }
function dateLong(n){ return dnum(n) + " " + MON[mon(n)]; }
function weekLabel(w){
  var e = w + 6;
  if (mon(w) === mon(e)) return dnum(w) + "–" + dnum(e) + " " + MONS[mon(e)];
  return dnum(w) + " " + MONS[mon(w)] + " – " + dnum(e) + " " + MONS[mon(e)];
}

function plural(n, a, b, c){
  n = Math.abs(n); var m = n % 100; if (m >= 11 && m <= 14) return c;
  var k = n % 10; return k === 1 ? a : (k >= 2 && k <= 4 ? b : c);
}
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(n){
  var neg = n < 0, v = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "−" : "") + v;
}
function signed(n){ return (n > 0 ? "+" : "") + money(n); }

/* ───────── состояние ───────── */
function defaults(){
  return {
    v: 1, name: "", theme: "dark",
    habits: [], log: {},
    shop: { items: [], purchases: [] },
    lastBackup: null, created: key(today())
  };
}
function normalize(s){
  var d = defaults();
  if (!s || typeof s !== "object") return d;
  Object.keys(d).forEach(function(k){ if (s[k] === undefined) s[k] = d[k]; });
  delete s.piggy; // старая копилка (версия 1.0) больше не используется
  if (!Array.isArray(s.shop.items)) s.shop.items = [];
  if (!Array.isArray(s.shop.purchases)) s.shop.purchases = [];
  if (!Array.isArray(s.habits)) s.habits = [];
  if (!s.log || typeof s.log !== "object") s.log = {};
  s.habits.forEach(function(h){
    if (!Array.isArray(h.off)) h.off = [];
    if (!h.created) h.created = s.created || key(today());
    if (!h.status) h.status = "active";
    if (!h.freq) h.freq = { t: "daily" };
    if (!s.log[h.id]) s.log[h.id] = {};
  });
  return s;
}

var storageOk = true;
function load(){
  try {
    localStorage.setItem(KEY + ".test", "1"); localStorage.removeItem(KEY + ".test");
    var raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { storageOk = false; }
  return defaults();
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
  catch (e) { storageOk = false; }
}
function askPersist(){
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
}

var S = load();
var U = { tab: "today", screen: S.name ? "today" : "onboarding", detail: null, dayOff: 0, sheet: null, draft: null, toast: null, celebrate: false };

/* ───────── логика привычек ───────── */
function hById(id){ for (var i = 0; i < S.habits.length; i++) if (S.habits[i].id === id) return S.habits[i]; return null; }
function isOff(h, n){
  for (var i = 0; i < h.off.length; i++){
    var a = dn(h.off[i][0]), b = h.off[i][1] ? dn(h.off[i][1]) : Infinity;
    if (n >= a && n < b) return true;
  }
  return false;
}
function anyOff(h, a, b){ for (var n = a; n <= b; n++) if (isOff(h, n)) return true; return false; }
function marked(h, n){ var L = S.log[h.id]; return !!(L && L[key(n)]); }
function marksIn(h, a, b){ var r = [], L = S.log[h.id] || {}; for (var n = a; n <= b; n++) if (L[key(n)]) r.push(n); return r; }
function dueDay(h, n){ return h.freq.t === "daily" || (h.freq.t === "dows" && (h.freq.d || []).indexOf(dow(n)) >= 0); }
function perWeekN(h){ return h.freq.t === "weekly" ? 1 : (h.freq.n || 1); }
function weekReq(h, w){
  var n = perWeekN(h), s = dn(h.created), a = Math.max(w, s), days = w + 6 - a + 1;
  return days >= 7 ? n : Math.min(n, Math.ceil(n * days / 7));
}
function periodStart(h, n){ var s = dn(h.created), N = h.freq.n || 2; return s + Math.floor((n - s) / N) * N; }

/* «единицы» выполнения: {n: день, d: 1 = сделано / 0 = пропуск}. Пропуск появляется только когда период закончился. */
function units(h, t){
  var out = [], f = h.freq, s = dn(h.created), n, e, m, i;
  if (s > t) return out;
  if (f.t === "daily" || f.t === "dows"){
    for (n = s; n <= t; n++){
      if (isOff(h, n) || !dueDay(h, n)) continue;
      if (marked(h, n)) out.push({ n: n, d: 1 }); else if (n < t) out.push({ n: n, d: 0 });
    }
  } else if (f.t === "everyN"){
    var N = f.n || 2;
    for (var p = s; p <= t; p += N){
      e = p + N - 1; m = marksIn(h, p, Math.min(e, t));
      if (m.length) out.push({ n: m[0], d: 1 });
      else if (e < t && !anyOff(h, p, e)) out.push({ n: e, d: 0 });
    }
  } else {
    for (var w = wk(s); w <= t; w += 7){
      var a = Math.max(w, s), req = weekReq(h, w); e = w + 6;
      m = marksIn(h, a, Math.min(e, t));
      var k = Math.min(m.length, req);
      for (i = 0; i < k; i++) out.push({ n: m[i], d: 1 });
      if (e < t && !anyOff(h, a, e)) for (i = k; i < req; i++) out.push({ n: e, d: 0 });
    }
  }
  return out;
}

function streak(h, t){
  var f = h.freq, s = dn(h.created), c = 0, n, e;
  if (f.t === "daily" || f.t === "dows"){
    for (n = t; n >= s; n--){
      if (isOff(h, n) || !dueDay(h, n)) continue;
      if (marked(h, n)) c++; else if (n === t) continue; else break;
    }
    return { c: c, u: "" };
  }
  if (f.t === "everyN"){
    var N = f.n || 2;
    for (var p = periodStart(h, t); p >= s; p -= N){
      e = p + N - 1;
      if (marksIn(h, p, Math.min(e, t)).length) c++;
      else if (e >= t || anyOff(h, p, e)) continue; else break;
    }
    return { c: c, u: "" };
  }
  for (var w = wk(t); w >= wk(s); w -= 7){
    var a = Math.max(w, s); e = w + 6;
    if (marksIn(h, a, Math.min(e, t)).length >= weekReq(h, w)) c++;
    else if (e >= t || anyOff(h, a, e)) continue; else break;
  }
  return { c: c, u: "нед" };
}

function freqText(h){
  var f = h.freq;
  if (f.t === "daily") return "каждый день";
  if (f.t === "everyN") return "каждые " + f.n + " " + plural(f.n, "день", "дня", "дней");
  if (f.t === "perWeek") return f.n + " " + plural(f.n, "раз", "раза", "раз") + " в неделю";
  if (f.t === "dows") return (f.d || []).map(function(i){ return DOW[i]; }).join(", ");
  if (f.t === "weekly") return "раз в неделю";
  return "";
}

/* что показывать на экране дня n */
function dueList(n){
  return S.habits.filter(function(h){
    if (h.status !== "active" || isOff(h, n) || dn(h.created) > n) return false;
    var f = h.freq;
    if (f.t === "daily" || f.t === "dows") return dueDay(h, n);
    if (marked(h, n)) return true;
    if (f.t === "everyN"){
      var p = periodStart(h, n);
      return marksIn(h, p, p + f.n - 1).length === 0;
    }
    return marksIn(h, wk(n), wk(n) + 6).length < perWeekN(h);
  });
}
function cardLabel(h, n){
  var f = h.freq, base = freqText(h);
  if (f.t === "everyN"){
    if (marked(h, n)) return base + " · сделано";
    var left = periodStart(h, n) + f.n - 1 - n;
    return base + " · " + (left === 0 ? "последний день" : "в запасе ещё " + left + " " + plural(left, "день", "дня", "дней"));
  }
  if (f.t === "perWeek"){
    var c = Math.min(marksIn(h, wk(n), wk(n) + 6).length, f.n);
    return base + " · " + c + "/" + f.n;
  }
  if (f.t === "weekly") return base + (marked(h, n) ? " · сделано" : "");
  return base;
}
function activeCount(){ return S.habits.filter(function(h){ return h.status === "active"; }).length; }

/* ───────── статистика недель и баллы ─────────
   +1 балл за каждое выполнение, −1 за каждый пропуск, покупки в магазине списывают баллы. */
function stats(t){
  var weeks = {}, first = null, earned = 0, missed = 0;
  S.habits.forEach(function(h){
    units(h, t).forEach(function(u){
      var w = wk(u.n);
      var W = weeks[w] || (weeks[w] = { w: w, d: 0, m: 0 });
      if (u.d){ W.d++; earned++; } else { W.m++; missed++; }
      if (first === null || w < first) first = w;
    });
  });
  var list = [], cw = wk(t);
  for (var w = first === null ? cw : first; w <= cw; w += 7){
    var W = weeks[w] || { w: w, d: 0, m: 0 };
    W.pct = (W.d + W.m) ? Math.round(100 * W.d / (W.d + W.m)) : null;
    W.pts = W.d - W.m;
    W.finished = w + 6 < t;
    list.push(W);
  }
  var spent = S.shop.purchases.reduce(function(a, p){ return a + p.price; }, 0);
  return { weeks: list, cur: list[list.length - 1], earned: earned, missed: missed, spent: spent, balance: earned - missed - spent };
}
function pts(n){ return n + " " + plural(n, "балл", "балла", "баллов"); }
function nextReward(balance){
  var list = S.shop.items.filter(function(i){ return i.price > balance; }).sort(function(a, b){ return a.price - b.price; });
  return list[0] || null;
}

/* ───────── действия ───────── */
function toggleMark(h, n){
  var L = S.log[h.id] || (S.log[h.id] = {}), k = key(n);
  if (L[k]) delete L[k];
  else {
    L[k] = 1;
    if (n < dn(h.created)) h.created = k; // отметка раньше создания = привычка началась раньше
    askPersist();
  }
  save();
}
function setStatus(h, st){
  var t = key(today());
  var open = h.off.filter(function(o){ return !o[1]; })[0];
  if (st === "active"){
    if (open){ if (open[0] === t) h.off.splice(h.off.indexOf(open), 1); else open[1] = t; }
  } else if (!open) h.off.push([t, null]);
  h.status = st; save();
}
function vibrate(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* ───────── иконки ───────── */
function icon(name){
  var st = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var P = {
    today: '<circle cx="11" cy="11" r="7.4"/><path d="M11 7v4.3l2.8 1.8"/>',
    habits: '<path d="M4 6.2h12.5M4 11h12.5M4 15.8h12.5"/>',
    shop: '<path d="M4.5 7.5h13l-1 11h-11l-1-11Z"/><path d="M8 9.5V6.5a3 3 0 0 1 6 0v3"/>',
    settings: '<path d="M11 14.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M11 3.2v1.6M11 17.2v1.6M4.5 11H2.9M19.1 11h-1.6M6.4 6.4 5.3 5.3M16.7 16.7l-1.1-1.1M6.4 15.6l-1.1 1.1M16.7 5.3l-1.1 1.1"/>',
    back: '<path d="M13 5.5 7.5 11l5.5 5.5"/>'
  };
  return '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" ' + st + '>' + P[name] + '</svg>';
}
function fireHTML(h, t){
  var s = streak(h, t);
  if (!s.c) return '<span class="fire">—</span>';
  return '<span class="fire"><em>🔥</em>' + s.c + (s.u ? '<small>&nbsp;' + s.u + '</small>' : '') + '</span>';
}

/* ───────── экраны ───────── */
function ring(doneN, total){
  var r = 32, c = 2 * Math.PI * r, p = total ? doneN / total : 0;
  return '<div class="ring"><svg width="76" height="76" viewBox="0 0 76 76">' +
    '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="7"/>' +
    '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"/></svg>' +
    '<span class="rt"><b>' + doneN + '/' + total + '</b><i>за день</i></span></div>';
}
function pointsStrip(st){
  var b = st.balance, nx = nextReward(b);
  if (!S.shop.items.length){
    return '<button class="strip card" data-act="tab" data-v="shop"><span class="sr"><b>🪙 ' + pts(b) + '</b><span>в магазин ›</span></span>' +
      '<small>добавь награды в магазин — и копи на них баллы</small></button>';
  }
  if (!nx){
    return '<button class="strip card" data-act="tab" data-v="shop"><span class="sr"><b>🪙 ' + pts(b) + '</b><span>в магазин ›</span></span>' +
      '<span class="bar"><i style="width:100%"></i></span><small>хватает на любую награду в магазине</small></button>';
  }
  var pct = Math.max(0, Math.min(100, Math.round(b / nx.price * 100)));
  return '<button class="strip card" data-act="tab" data-v="shop"><span class="sr"><b>🪙 ' + pts(b) + '</b>' +
    '<span>' + esc(nx.em) + ' ' + esc(nx.name) + ' · ' + nx.price + '</span></span>' +
    '<span class="bar"><i style="width:' + pct + '%"></i></span><small>до награды ещё ' + pts(nx.price - b) + '</small></button>';
}
function vToday(){
  var t = today(), n = t + U.dayOff, list = dueList(n), st = stats(t);
  var doneN = list.filter(function(h){ return marked(h, n); }).length;
  var all = list.length > 0 && doneN === list.length;
  var h = '<div class="greet"><h1>Привет, ' + esc(S.name) + '</h1><p>' +
    (U.dayOff === 0 ? "Сегодня" : "Вчера") + ", " + dateLong(n) + ", " + DOWFULL[dow(n)] + '</p></div>';

  if (activeCount() === 0){
    h += '<div class="card empty"><div class="big">🔥</div><h3>Пока ни одной привычки</h3>' +
      '<p>Начни с одной — маленькой и понятной. Нажми «+» внизу справа.</p></div>';
    return h + pointsStrip(st);
  }

  h += '<div class="card sum">' + ring(doneN, list.length) + '<div class="sum-txt"><h3>' + doneN + ' из ' + list.length + '</h3><p>' +
    (list.length === 0 ? (U.dayOff === 0 ? "На сегодня ничего не запланировано." : "На вчера ничего не было запланировано.")
      : all ? "День закрыт. Можно выдохнуть."
      : doneN === 0 ? "Ещё ничего не отмечено — и это нормально."
      : "Осталось " + (list.length - doneN) + " " + plural(list.length - doneN, "привычка", "привычки", "привычек") + ".") +
    '</p></div></div>';
  h += pointsStrip(st);
  h += '<div class="dayswitch" role="group" aria-label="День">' +
    '<button data-act="day" data-v="-1" aria-pressed="' + (U.dayOff === -1) + '">‹ Вчера</button>' +
    '<button data-act="day" data-v="0" aria-pressed="' + (U.dayOff === 0) + '">Сегодня ›</button></div>';

  if (all){
    var sparks = "";
    if (U.celebrate) for (var i = 0; i < 11; i++)
      sparks += '<span class="spark" style="left:' + (8 + i * 8) + '%;bottom:14px;--dx:' + ((i % 2 ? 1 : -1) * (8 + i * 2)) + 'px;animation-delay:' + (i * 55) + 'ms"></span>';
    h += '<div class="alldone' + (U.celebrate ? " go" : "") + '">' + sparks + '<h3>' + (U.dayOff === 0 ? "Всё на сегодня сделано" : "Вчерашний день закрыт") + '</h3>' +
      '<p>+' + pts(list.length) + ' за день. ' +
      (U.dayOff === 0 ? "Вчерашний день тоже ещё можно закрыть." : "Отмечать задним числом — нормально.") + '</p></div>';
  }

  if (list.length){
    h += '<div class="seclabel"><h2>' + (U.dayOff === 0 ? "На сегодня" : "За вчера") + '</h2><span>' + doneN + '/' + list.length + '</span></div>';
    h += '<div class="habits">' + list.map(function(x){
      var d = marked(x, n);
      return '<button class="hcard" data-act="toggle" data-v="' + x.id + '" data-done="' + (d ? 1 : 0) + '" aria-pressed="' + d + '">' +
        '<span class="em">' + esc(x.em) + '</span><span class="tx"><b>' + esc(x.name) + '</b><span>' + cardLabel(x, n) + '</span></span>' +
        fireHTML(x, t) + '</button>';
    }).join("") + '</div>';
  }

  if (needBackupNudge(t)){
    h += '<button class="nudge" data-act="tab" data-v="settings"><span>💾</span><span><b>Давно не было резервной копии.</b> ' +
      'Настройки → «Отчёт для Claude» — файл заодно спасёт данные, если телефон их потеряет.</span></button>';
  }
  h += '<p class="hintline">Тап по карточке — отметка. Долгий тап — детали и календарь.</p>';
  return h;
}
function needBackupNudge(t){
  var has = Object.keys(S.log).some(function(k){ return Object.keys(S.log[k]).length > 0; });
  if (!has) return false;
  if (!S.lastBackup) return t - dn(S.created) >= 7;
  return t - dn(S.lastBackup.slice(0, 10)) >= 14;
}

function vHabits(){
  var t = today(), groups = [["active", "Активные"], ["paused", "На паузе"], ["archived", "В архиве"]];
  var h = '<div class="greet"><h1>Привычки</h1><p>' + activeCount() + ' ' + plural(activeCount(), "активная", "активные", "активных") + ' · всего ' + S.habits.length + '</p></div>';
  if (!S.habits.length){
    return h + '<div class="card empty"><div class="big">🌱</div><h3>Список пуст</h3><p>Добавь первую привычку кнопкой «+».</p></div>';
  }
  groups.forEach(function(g){
    var list = S.habits.filter(function(x){ return x.status === g[0]; });
    if (!list.length) return;
    h += '<div class="seclabel"><h2>' + g[1] + '</h2><span>' + list.length + '</span></div><div class="divided">';
    h += list.map(function(x){
      return '<button class="hrow" data-act="open" data-v="' + x.id + '" data-dim="' + (x.status === "active" ? 0 : 1) + '">' +
        '<span class="em">' + esc(x.em) + '</span><span class="tx"><b>' + esc(x.name) + '</b><span>' + freqText(x) + '</span></span>' +
        fireHTML(x, t) + '</button>';
    }).join("") + '</div>';
  });
  return h;
}

function vDetail(){
  var x = hById(U.detail);
  if (!x){ U.screen = U.tab = "habits"; return vHabits(); }
  var t = today(), weeks = 26, endW = wk(t), s = dn(x.created), cols = "", lastM = -1;
  var periodic = !(x.freq.t === "daily" || x.freq.t === "dows");
  for (var w = weeks - 1; w >= 0; w--){
    var ws = endW - 7 * w, cells = "", m = mon(ws);
    cells += '<span class="ml">' + (m !== lastM ? MONN[m] : "") + '</span>'; lastM = m;
    for (var i = 0; i < 7; i++){
      var n = ws + i, state;
      if (n > t){ cells += '<span class="hc" data-s="future"></span>'; continue; }
      if (marked(x, n)) state = "done";
      else if (n < s || isOff(x, n)) state = "na";
      else if (periodic) state = "free";
      else if (!dueDay(x, n)) state = "rest";
      else state = n < t ? "miss" : "free";
      cells += '<button class="hc' + (n === t ? " today" : "") + '" data-s="' + state + '" data-act="heat" data-v="' + n + '" aria-label="' +
        dateLong(n) + (state === "done" ? ", отмечено" : ", не отмечено") + '"></button>';
    }
    cols += '<div class="heat-col">' + cells + '</div>';
  }
  var total = Object.keys(S.log[x.id] || {}).length;
  var u30 = units(x, t).filter(function(u){ return u.n > t - 30; });
  var d30 = u30.filter(function(u){ return u.d; }).length;
  var p30 = u30.length ? Math.round(100 * d30 / u30.length) + "%" : "—";
  var sk = streak(x, t);
  var dows = '<div class="heat-dows"><span></span>' + DOW.map(function(d, i){ return '<span>' + (i % 2 === 0 ? d : "") + '</span>'; }).join("") + '</div>';

  return '<div class="topbar"><button data-act="back">' + icon("back") + 'Назад</button></div>' +
    '<div class="detail-head"><span class="em">' + esc(x.em) + '</span><h1>' + esc(x.name) + '</h1><p>' + freqText(x) + '</p>' +
    '<div class="chipline"><span class="chip">серия <b>🔥 ' + sk.c + (sk.u ? " " + sk.u : "") + '</b></span>' +
    '<span class="chip">всего <b>' + total + '</b></span><span class="chip">за 30 дней <b>' + p30 + '</b></span>' +
    (x.status !== "active" ? '<span class="chip">' + (x.status === "paused" ? "на паузе" : "в архиве") + '</span>' : '') + '</div></div>' +
    '<div class="card heat"><div class="heat-top"><h3>Последние полгода</h3><span>тап по дню — отметка</span></div>' +
    '<div class="heat-wrap">' + dows + '<div class="heat-grid" id="heatGrid">' + cols + '</div></div>' +
    '<div class="heat-legend"><span><i style="background:var(--accent)"></i>отмечено</span>' +
    (periodic ? '' : '<span><i style="background:color-mix(in srgb,var(--danger) 22%,var(--surface-2))"></i>пропуск</span><span><i style="box-shadow:inset 0 0 0 1px var(--line)"></i>не по графику</span>') +
    '</div></div>' +
    '<div class="btnrow">' +
    '<button class="btn" data-act="edit" data-v="' + x.id + '">Изменить<span>эмодзи, название, частота</span></button>' +
    (x.status === "archived" ? '' : '<button class="btn" data-act="pause" data-v="' + x.id + '">' + (x.status === "paused" ? "Вернуть из паузы" : "Поставить на паузу") +
      '<span>' + (x.status === "paused" ? "снова в «Сегодня»" : "пропуски не считаются") + '</span></button>') +
    '<button class="btn quiet" data-act="archive" data-v="' + x.id + '">' + (x.status === "archived" ? "Вернуть из архива" : "В архив") +
      '<span>' + (x.status === "archived" ? "" : "история сохранится") + '</span></button>' +
    '<button class="btn danger" data-act="delete" data-v="' + x.id + '">Удалить<span>вместе с историей</span></button>' +
    '</div><p class="hintline">Отметить задним числом — нормально. Приложение не считает это нарушением.</p>';
}

function vShop(){
  var t = today(), st = stats(t), b = st.balance, W = st.cur;
  var h = '<div class="greet"><h1>Магазин</h1><p>Выполнил привычку — +1 балл, пропустил — −1. Баллы тратишь на награды.</p></div>';
  h += '<div class="card goalcard"><div class="gl">мой баланс</div>' +
    '<div class="amt"><b>' + b + '</b><span>' + plural(b, "балл", "балла", "баллов") + '</span></div>' +
    '<div class="rules">заработано ' + st.earned + ' · пропусков ' + st.missed + ' · потрачено ' + st.spent + '</div>' +
    '<div class="wk-rows" style="margin-top:16px;text-align:left">' +
    '<div class="wk-row"><span>Эта неделя · ' + weekLabel(W.w) + '</span><b>' + (W.pts > 0 ? "+" : "") + W.pts + '</b></div></div></div>';

  h += '<div class="seclabel"><h2>Награды</h2><span>' + S.shop.items.length + '</span></div>';
  if (!S.shop.items.length){
    h += '<div class="card empty" style="padding:34px 22px 30px"><div class="big">🎁</div><h3>Пока пусто</h3>' +
      '<p>Придумай, чем себя порадовать: «Киндер — 5 баллов», «Кино — 30 баллов».</p></div>';
  } else {
    h += '<div class="divided">' + S.shop.items.slice().sort(function(a, c){ return a.price - c.price; }).map(function(i){
      var can = b >= i.price;
      return '<div class="hrow shoprow"><button class="shopinfo" data-act="editreward" data-v="' + i.id + '">' +
        '<span class="em">' + esc(i.em) + '</span><span class="tx"><b>' + esc(i.name) + '</b><span>' + pts(i.price) +
        (can ? '' : ' · не хватает ' + (i.price - b)) + '</span></span></button>' +
        '<button class="buybtn" data-act="buy" data-v="' + i.id + '"' + (can ? '' : ' disabled') + '>Купить</button></div>';
    }).join("") + '</div>';
  }
  h += '<button class="btn center" data-act="addreward" style="margin-top:12px">+ Добавить награду</button>';

  var P = S.shop.purchases;
  if (P.length){
    h += '<div class="seclabel"><h2>Покупки</h2><span>' + P.length + '</span></div><div class="card hist">' +
      P.slice(-15).reverse().map(function(p){
        return '<div class="hist-row"><div class="hl"><div>' + esc(p.em) + ' ' + esc(p.name) + '</div><span>' + dateLong(dn(p.at)) + '</span></div>' +
          '<div class="hr"><b data-neg="1">−' + p.price + '</b><button class="bchip" data-act="unbuy" data-v="' + p.id + '">отменить</button></div></div>';
      }).join("") + '</div>';
  }
  h += '<p class="hintline">Тап по награде — изменить или удалить. Отметки задним числом тоже приносят баллы, а снятая отметка их забирает.</p>';
  return h;
}

function vSettings(){
  var h = '<div class="greet"><h1>Настройки</h1><p>Данные хранятся только на этом телефоне</p></div>';
  if (!storageOk) h += '<div class="warnbox">⚠️ Браузер не даёт сохранять данные (приватный режим?). Отметки пропадут после закрытия страницы.</div>';
  h += '<div class="grouptitle">Я</div><div class="card fieldset">' +
    '<div class="field"><label for="s-name">Имя</label><input id="s-name" type="text" value="' + esc(S.name) + '" data-act="name" maxlength="30"></div></div>';
  h += '<div class="grouptitle">Тема</div><div class="segfield" role="group" aria-label="Тема">' +
    '<button data-act="theme" data-v="system" aria-pressed="' + (S.theme === "system") + '">Как в системе</button>' +
    '<button data-act="theme" data-v="dark" aria-pressed="' + (S.theme === "dark") + '">Тёмная</button>' +
    '<button data-act="theme" data-v="light" aria-pressed="' + (S.theme === "light") + '">Светлая</button></div>';
  var canShare = !!(navigator.canShare && window.File);
  h += '<div class="grouptitle">Данные</div><div class="btnrow">' +
    '<button class="btn" data-act="report">Отчёт для Claude<span>он же резервная копия</span></button>' +
    (canShare ? '<button class="btn quiet" data-act="download">Скачать файлом<span>без «Поделиться»</span></button>' : '') +
    '<button class="btn quiet" data-act="import">Импорт из файла<span>вернуть всё как было</span></button></div>';
  h += '<p class="hintline">Последняя копия: ' + (S.lastBackup ? dateLong(dn(S.lastBackup.slice(0, 10))) : "ещё не делал") + '. ' +
    'Отчёт — обычный файл: пришли его Claude, чтобы обсудить прогресс, или храни как бэкап. Импорт заменяет все текущие данные.</p>';
  h += '<p class="hintline">Огонёк ' + VERSION + '</p>';
  return h;
}

function vOnboarding(){
  return '<div class="onb"><div class="mark">🔥</div><h1>Как тебя зовут?</h1>' +
    '<p>Имя хранится только на этом телефоне. Оно попадёт в отчёт, чтобы Claude понимал, чей он.</p>' +
    '<input class="big-input" id="onb-name" type="text" placeholder="Имя" maxlength="30" autocomplete="given-name" enterkeyhint="go">' +
    '<button class="btn primary" data-act="start">Начать</button>' +
    '<button class="linkbtn" data-act="import" style="margin-top:14px">У меня есть файл с резервной копией</button></div>';
}

/* ───────── шторка добавления ───────── */
var EMOJIS = ["💧","🏃","📖","🧘","🚶","😴","🍎","🧹","✍️","🎸","🧠","🦷","🌿","💪","📵","🚿","💊","🙏"];
function vSheet(){
  var dr = U.draft, f = dr.freq, many = activeCount() >= 5 && !dr.editing;
  function seg(t, lab, wide){ return '<button data-act="freqt" data-v="' + t + '" aria-pressed="' + (f.t === t) + '"' + (wide ? ' class="wide"' : '') + '>' + lab + '</button>'; }
  var still = U.sheetShown ? " still" : "";
  U.sheetShown = true;
  var h = '<div class="scrim' + still + '" data-act="closesheet"></div><div class="sheet' + still + '" role="dialog" aria-label="' + (dr.editing ? "Изменить привычку" : "Новая привычка") + '">' +
    '<div class="handle"></div><h2>' + (dr.editing ? "Изменить привычку" : "Новая привычка") + '</h2>' +
    '<p class="sub">Одна привычка — одно маленькое действие.</p>';
  if (many) h += '<div class="soft-hint"><span>🫧</span><div><b>Многовато, не перегрузишься?</b><p>Сейчас активных ' + activeCount() + '. Добавить можно — просто проверь, что остальные по силам.</p></div></div>';
  h += '<div class="emoji-pick"><input class="cur" id="d-em" type="text" value="' + esc(dr.em) + '" maxlength="8" aria-label="Эмодзи (можно свой)" data-act="draftem">' +
    '<input class="name" type="text" id="d-name" placeholder="Название" value="' + esc(dr.name) + '" maxlength="40" data-act="draftname"></div>' +
    '<div class="emoji-row">' + EMOJIS.map(function(e){ return '<button data-act="em" data-v="' + e + '" aria-pressed="' + (dr.em === e) + '">' + e + '</button>'; }).join("") + '</div>' +
    '<p class="lbl">Частота</p><div class="freq-seg">' +
    seg("daily", "Каждый день") + seg("everyN", "Каждые N дней") + seg("perWeek", "N раз в неделю") + seg("weekly", "Раз в неделю") +
    seg("dows", "По дням недели", true) + '</div>';
  if (f.t === "everyN" || f.t === "perWeek"){
    h += '<div class="stepper"><span>' + (f.t === "everyN" ? "Раз в сколько дней" : "Сколько раз в неделю") + '</span>' +
      '<button data-act="n" data-v="-1" aria-label="Меньше">−</button><b>' + f.n + '</b><button data-act="n" data-v="1" aria-label="Больше">+</button></div>';
  }
  if (f.t === "dows"){
    h += '<div class="dows">' + DOW.map(function(d, i){ return '<button data-act="dow" data-v="' + i + '" aria-pressed="' + ((f.d || []).indexOf(i) >= 0) + '">' + d + '</button>'; }).join("") + '</div>';
  }
  h += '<button class="btn primary" data-act="save">' + (dr.editing ? "Сохранить" : "Добавить привычку") + '</button>' +
    '<button class="btn quiet center" data-act="closesheet" style="margin-top:9px">Отмена</button></div>';
  return h;
}

var REWARD_EMOJIS = ["🍫","🍦","🍰","🍕","🍿","☕","🎬","🎮","📚","🛍️","💆","🌹","🎧","🛁","😴","🎁"];
function vRewardSheet(){
  var dr = U.draft;
  var still = U.sheetShown ? " still" : "";
  U.sheetShown = true;
  return '<div class="scrim' + still + '" data-act="closesheet"></div><div class="sheet' + still + '" role="dialog" aria-label="Награда">' +
    '<div class="handle"></div><h2>' + (dr.editing ? "Изменить награду" : "Новая награда") + '</h2>' +
    '<p class="sub">Чем порадуешь себя, когда накопишь баллы?</p>' +
    '<div class="emoji-pick"><input class="cur" id="r-em" type="text" value="' + esc(dr.em) + '" maxlength="8" aria-label="Эмодзи (можно свой)" data-act="draftem">' +
    '<input class="name" type="text" id="r-name" placeholder="Например, Киндер" value="' + esc(dr.name) + '" maxlength="40" data-act="draftname"></div>' +
    '<div class="emoji-row">' + REWARD_EMOJIS.map(function(e){ return '<button data-act="em" data-v="' + e + '" aria-pressed="' + (dr.em === e) + '">' + e + '</button>'; }).join("") + '</div>' +
    '<p class="lbl">Цена в баллах</p>' +
    '<div class="stepper"><button data-act="price" data-v="-5" aria-label="Минус 5">−5</button><button data-act="price" data-v="-1" aria-label="Меньше">−</button>' +
    '<input class="priceinp" id="r-price" type="number" inputmode="numeric" value="' + dr.price + '" data-act="draftprice" aria-label="Цена">' +
    '<button data-act="price" data-v="1" aria-label="Больше">+</button><button data-act="price" data-v="5" aria-label="Плюс 5">+5</button></div>' +
    '<button class="btn primary" data-act="savereward">' + (dr.editing ? "Сохранить" : "Добавить в магазин") + '</button>' +
    (dr.editing ? '<button class="btn danger center" data-act="delreward" style="margin-top:9px">Удалить награду</button>' : '') +
    '<button class="btn quiet center" data-act="closesheet" style="margin-top:9px">Отмена</button></div>';
}
function rById(id){ for (var i = 0; i < S.shop.items.length; i++) if (S.shop.items[i].id === id) return S.shop.items[i]; return null; }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ───────── сборка ───────── */
function applyTheme(){
  document.documentElement.setAttribute("data-theme", S.theme || "dark");
  var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#08080a";
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", bg);
}
function render(){
  applyTheme();
  var app = document.getElementById("app"), ov = document.getElementById("overlay");
  var hg = document.getElementById("heatGrid"), keepScroll = (hg && U.screen === "detail") ? hg.scrollLeft : null;
  var html;
  if (U.screen === "onboarding"){
    app.className = "app bare"; app.innerHTML = vOnboarding(); ov.innerHTML = toastHTML(); return;
  }
  app.className = "app";
  html = U.screen === "habits" ? vHabits() : U.screen === "detail" ? vDetail() : U.screen === "shop" ? vShop() : U.screen === "settings" ? vSettings() : vToday();
  app.innerHTML = html;
  var tabs = [["today", "Сегодня"], ["habits", "Привычки"], ["shop", "Магазин"], ["settings", "Настройки"]];
  var o = '<nav class="nav"><div class="nav-in">' + tabs.map(function(t){
    return '<button data-act="tab" data-v="' + t[0] + '"' + (U.tab === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[0]) + '<span>' + t[1] + '</span></button>';
  }).join("") + '</div></nav>';
  if (U.screen === "today" || U.screen === "habits") o += '<button class="fab" data-act="add" aria-label="Добавить привычку">+</button>';
  if (U.sheet === "habit") o += vSheet();
  else if (U.sheet === "reward") o += vRewardSheet();
  else U.sheetShown = false;
  o += toastHTML();
  var sh = ov.querySelector(".sheet"), shTop = sh ? sh.scrollTop : 0;
  ov.innerHTML = o;
  sh = ov.querySelector(".sheet"); if (sh && shTop) sh.scrollTop = shTop;
  hg = document.getElementById("heatGrid");
  if (hg) hg.scrollLeft = keepScroll !== null ? keepScroll : hg.scrollWidth;
  U.celebrate = false;
}
function toastHTML(){ return U.toast ? '<div class="toast" role="status">' + esc(U.toast) + '</div>' : ''; }
var toastT;
function toast(msg){
  U.toast = msg; render();
  clearTimeout(toastT); toastT = setTimeout(function(){ U.toast = null; render(); }, 2400);
}
function go(screen){ U.screen = screen; U.tab = screen === "detail" ? "habits" : screen; U.sheet = null; window.scrollTo(0, 0); render(); }

/* ───────── отчёт / резервная копия ───────── */
function buildReport(){
  var t = today(), st = stats(t);
  return {
    "что_это": "Отчёт трекера привычек «Огонёк». Сверху — сводка для Claude, в поле data — полная резервная копия (её можно импортировать обратно). " +
      "Процент недели = отметки / (отметки + пропуски). Пропуск засчитывается только когда период закончился (день, интервал или неделя). Отметки задним числом разрешены. " +
      "Баллы: +1 за выполнение, −1 за пропуск; баллы тратятся на награды в магазине.",
    "формат": "ogonek-report-2", "версия_приложения": VERSION,
    "имя": S.name, "выгружено": new Date().toISOString(), "сегодня": key(t),
    "баллы": { "баланс": st.balance, "заработано": st.earned, "пропусков": st.missed, "потрачено": st.spent },
    "магазин": S.shop.items.map(function(i){ return { "награда": i.em + " " + i.name, "цена": i.price }; }),
    "покупки": S.shop.purchases.map(function(p){ return { "дата": p.at, "награда": p.em + " " + p.name, "цена": p.price }; }),
    "недели": st.weeks.map(function(W){
      return { "неделя": key(W.w) + " — " + key(W.w + 6), "закончилась": W.finished, "процент": W.pct, "отметок": W.d, "пропусков": W.m, "баллов": W.pts };
    }),
    "привычки": S.habits.map(function(h){
      var u = units(h, t), d = u.filter(function(x){ return x.d; }).length, s = streak(h, t);
      return { "эмодзи": h.em, "название": h.name, "частота": freqText(h), "статус": h.status, "создана": h.created,
        "серия": s.c + (s.u ? " " + s.u : ""), "выполнено": d, "пропущено": u.length - d,
        "процент_за_всё_время": u.length ? Math.round(100 * d / u.length) : null,
        "отметки": Object.keys(S.log[h.id] || {}).sort() };
    }),
    "data": S
  };
}
function reportFile(){
  var t = today();
  var name = "ogonek-" + (S.name || "я").replace(/[\\\/:*?"<>|\s]+/g, "_") + "-" + key(t) + ".json";
  var blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: "application/json" });
  return { name: name, blob: blob };
}
function markBackup(){ S.lastBackup = new Date().toISOString().slice(0, 10); save(); }
function downloadReport(){
  var f = reportFile(), url = URL.createObjectURL(f.blob), a = document.createElement("a");
  a.href = url; a.download = f.name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 4000);
  markBackup(); toast("Файл сохранён: " + f.name);
}
function shareReport(){
  var f = reportFile(), file;
  try { file = new File([f.blob], f.name, { type: "application/json" }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })){
    navigator.share({ files: [file], title: "Огонёк — отчёт" }).then(function(){ markBackup(); toast("Отчёт отправлен"); render(); })
      .catch(function(err){ if (err && err.name === "AbortError") return; downloadReport(); });
  } else downloadReport();
}
function importFile(file){
  var r = new FileReader();
  r.onload = function(){
    var obj;
    try { obj = JSON.parse(r.result); } catch (e) { toast("Это не файл Огонька"); return; }
    var data = obj && obj.data ? obj.data : obj;
    if (!data || !Array.isArray(data.habits) || typeof data.log !== "object"){ toast("В файле нет данных Огонька"); return; }
    var info = (data.name ? data.name + ", " : "") + data.habits.length + " " + plural(data.habits.length, "привычка", "привычки", "привычек");
    if (S.habits.length && !confirm("Заменить текущие данные копией из файла (" + info + ")? Текущие отметки пропадут.")) return;
    S = normalize(data); save(); askPersist();
    U.screen = U.tab = S.name ? "today" : "onboarding"; render(); toast("Данные восстановлены: " + info);
  };
  r.readAsText(file);
}

/* ───────── события ───────── */
var press = null, suppressClick = false;
document.addEventListener("pointerdown", function(ev){
  var el = ev.target.closest(".hcard"); if (!el) return;
  var id = el.getAttribute("data-v");
  press = { x: ev.clientX, y: ev.clientY, timer: setTimeout(function(){
    press = null; suppressClick = true; setTimeout(function(){ suppressClick = false; }, 700);
    vibrate(20); U.detail = id; go("detail");
  }, 480) };
});
function cancelPress(){ if (press){ clearTimeout(press.timer); press = null; } }
document.addEventListener("pointerup", cancelPress);
document.addEventListener("pointercancel", cancelPress);
document.addEventListener("pointermove", function(ev){ if (press && (Math.abs(ev.clientX - press.x) > 10 || Math.abs(ev.clientY - press.y) > 10)) cancelPress(); });
document.addEventListener("contextmenu", function(ev){ if (ev.target.closest(".hcard")) ev.preventDefault(); });

document.addEventListener("click", function(ev){
  if (suppressClick){ suppressClick = false; ev.preventDefault(); return; }
  var el = ev.target.closest("[data-act]"); if (!el) return;
  var a = el.getAttribute("data-act"), v = el.getAttribute("data-v"), x, t = today();
  switch (a){
    case "tab": U.dayOff = v === "today" ? U.dayOff : 0; go(v); break;
    case "back": go("habits"); break;
    case "day": U.dayOff = parseInt(v, 10); render(); break;
    case "toggle": {
      x = hById(v); if (!x) return;
      var n = t + U.dayOff, was = marked(x, n);
      var before = dueList(n), allBefore = before.length && before.every(function(h){ return marked(h, n); });
      toggleMark(x, n);
      var after = dueList(n), allAfter = after.length && after.every(function(h){ return marked(h, n); });
      if (!was){ vibrate(allAfter && !allBefore ? [15, 60, 25] : 12); el.classList.add("closing", "flare"); }
      U.celebrate = !!(allAfter && !allBefore);
      setTimeout(render, was ? 0 : 180);
      break;
    }
    case "open": U.detail = v; go("detail"); break;
    case "heat": {
      x = hById(U.detail); var hn = parseInt(v, 10); if (!x || hn > t) return;
      toggleMark(x, hn); vibrate(10); render();
      toast((marked(x, hn) ? "Отмечено: " : "Снято: ") + dateLong(hn));
      break;
    }
    case "add":
      U.draft = { em: "💧", name: "", freq: { t: "daily" }, editing: null }; U.sheet = "habit"; render();
      setTimeout(function(){ var i = document.getElementById("d-name"); if (i) i.focus(); }, 320);
      break;
    case "edit":
      x = hById(v); U.draft = { em: x.em, name: x.name, freq: JSON.parse(JSON.stringify(x.freq)), editing: x.id }; U.sheet = "habit"; render(); break;
    case "closesheet": U.sheet = null; U.draft = null; render(); break;
    case "em": U.draft.em = v; render(); break;
    case "freqt": {
      var f = { t: v };
      if (v === "everyN") f.n = 3; if (v === "perWeek") f.n = 3; if (v === "dows") f.d = [0, 2, 4];
      U.draft.freq = f; render(); break;
    }
    case "n": {
      var max = U.draft.freq.t === "perWeek" ? 6 : 30, min = U.draft.freq.t === "perWeek" ? 1 : 2;
      U.draft.freq.n = Math.max(min, Math.min(max, U.draft.freq.n + parseInt(v, 10))); render(); break;
    }
    case "dow": {
      var idx = parseInt(v, 10), dd = U.draft.freq.d || [], at = dd.indexOf(idx);
      if (at >= 0) dd.splice(at, 1); else dd.push(idx);
      dd.sort(); U.draft.freq.d = dd; render(); break;
    }
    case "save": {
      var dr = U.draft, nm = dr.name.trim();
      if (!nm){ toast("Дай привычке название"); return; }
      if (dr.freq.t === "dows" && !(dr.freq.d || []).length){ toast("Выбери хотя бы один день"); return; }
      var em = (dr.em || "").trim() || "✨";
      if (dr.editing){
        x = hById(dr.editing); x.em = em; x.name = nm; x.freq = dr.freq;
        save(); U.sheet = null; U.draft = null; render(); toast("Сохранено");
      } else {
        var id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        S.habits.push({ id: id, em: em, name: nm, freq: dr.freq, created: key(t), status: "active", off: [] });
        S.log[id] = {}; save(); askPersist();
        U.sheet = null; U.draft = null; U.dayOff = 0; go("today"); toast("Привычка добавлена");
      }
      break;
    }
    case "pause": x = hById(v); setStatus(x, x.status === "paused" ? "active" : "paused"); render(); toast(x.status === "paused" ? "На паузе — пропуски не считаются" : "Снова в «Сегодня»"); break;
    case "archive": x = hById(v); setStatus(x, x.status === "archived" ? "active" : "archived"); render(); toast(x.status === "archived" ? "В архиве" : "Вернули из архива"); break;
    case "delete":
      x = hById(v);
      if (!confirm("Удалить «" + x.name + "» вместе со всей историей? Это не отменить.")) return;
      S.habits.splice(S.habits.indexOf(x), 1); delete S.log[x.id]; save(); go("habits"); toast("Удалено");
      break;
    case "addreward":
      U.draft = { em: "🍫", name: "", price: 5, editing: null }; U.sheet = "reward"; render();
      setTimeout(function(){ var i = document.getElementById("r-name"); if (i) i.focus(); }, 320);
      break;
    case "editreward":
      x = rById(v); if (!x) return;
      U.draft = { em: x.em, name: x.name, price: x.price, editing: x.id }; U.sheet = "reward"; render(); break;
    case "price": {
      var inpP = document.getElementById("r-price"), cur = parseInt(inpP && inpP.value, 10);
      if (!isNaN(cur)) U.draft.price = cur;
      U.draft.price = Math.max(1, Math.min(9999, (U.draft.price || 0) + parseInt(v, 10))); render(); break;
    }
    case "savereward": {
      var rd = U.draft, rn = rd.name.trim(), rp = parseInt(rd.price, 10);
      if (!rn){ toast("Дай награде название"); return; }
      if (!(rp >= 1)){ toast("Цена — хотя бы 1 балл"); return; }
      var rem = (rd.em || "").trim() || "🎁";
      if (rd.editing){ x = rById(rd.editing); x.em = rem; x.name = rn; x.price = rp; }
      else S.shop.items.push({ id: uid("r"), em: rem, name: rn, price: rp });
      save(); U.sheet = null; U.draft = null; render(); toast(rd.editing ? "Сохранено" : "Награда в магазине");
      break;
    }
    case "delreward":
      x = rById(U.draft.editing); if (!x) return;
      if (!confirm("Удалить награду «" + x.name + "»? Прошлые покупки останутся в истории.")) return;
      S.shop.items.splice(S.shop.items.indexOf(x), 1); save(); U.sheet = null; U.draft = null; render(); toast("Удалено");
      break;
    case "buy": {
      x = rById(v); if (!x) return;
      var bal = stats(t).balance;
      if (bal < x.price){ toast("Не хватает " + pts(x.price - bal)); return; }
      if (!confirm("Купить «" + x.name + "» за " + pts(x.price) + "?")) return;
      S.shop.purchases.push({ id: uid("p"), itemId: x.id, em: x.em, name: x.name, price: x.price, at: key(t) });
      save(); vibrate([15, 60, 25]); render(); toast("Куплено: " + x.em + " " + x.name + ". Осталось " + pts(bal - x.price));
      break;
    }
    case "unbuy": {
      var pi = -1; S.shop.purchases.forEach(function(p, i){ if (p.id === v) pi = i; });
      if (pi < 0) return;
      var pp = S.shop.purchases[pi];
      if (!confirm("Отменить покупку «" + pp.name + "»? Баллы (" + pp.price + ") вернутся.")) return;
      S.shop.purchases.splice(pi, 1); save(); render(); toast("Покупка отменена, баллы вернулись");
      break;
    }
    case "theme": S.theme = v; save(); render(); break;
    case "start": {
      var inp = document.getElementById("onb-name"), nm2 = inp && inp.value.trim();
      if (!nm2){ toast("Впиши имя"); return; }
      S.name = nm2; S.created = key(t); save(); askPersist(); go("today"); break;
    }
    case "report": shareReport(); break;
    case "download": downloadReport(); render(); break;
    case "import": document.getElementById("importFile").click(); break;
  }
});
document.addEventListener("input", function(ev){
  var el = ev.target, a = el.getAttribute("data-act"); if (!a) return;
  if (a === "draftname"){ U.draft.name = el.value; return; }
  if (a === "draftem"){ U.draft.em = el.value; return; }
  if (a === "name"){ if (el.value.trim()){ S.name = el.value.trim(); save(); } return; }
  if (a === "draftprice"){ U.draft.price = parseInt(el.value, 10) || 0; return; }
});
document.addEventListener("keydown", function(ev){
  if (ev.key === "Enter" && ev.target.id === "onb-name"){ ev.preventDefault(); document.querySelector('[data-act="start"]').click(); }
});
document.getElementById("importFile").addEventListener("change", function(ev){
  var f = ev.target.files && ev.target.files[0]; if (f) importFile(f); ev.target.value = "";
});

/* новый день, пока страница открыта */
var lastDay = today();
function checkDay(){ if (today() !== lastDay){ lastDay = today(); U.dayOff = 0; if (U.screen !== "onboarding" && !U.sheet) render(); } }
document.addEventListener("visibilitychange", function(){ if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

/* офлайн-режим */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
}

render();
window.__ogonek = { get S(){ return S; }, stats: stats, units: units, streak: streak, key: key, dn: dn, today: today };
})();
