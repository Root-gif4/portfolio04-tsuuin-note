// 通院ノート：画面と保存
// データはこのブラウザの localStorage に保存する（サーバー不要・無料）
(() => {
  "use strict";

  const P = window.TsuuinParse;
  const STORAGE_KEY = "tsuuin-note-v1";
  // ?demo で開いたときは見本データで動かし、何も保存しない（本物のデータには触れない）
  const DEMO = new URLSearchParams(location.search).has("demo") && !!window.TsuuinDemo;
  const KINDS = {
    symptom: "症状・体調",
    question: "質問",
    request: "お願い",
    other: "そのほか",
  };
  const KIND_ORDER = ["symptom", "question", "request", "other"];
  const MOODS = ["😣", "😟", "😐", "🙂", "😊"];
  const MEAL = ["食後", "食前", "食間", ""];
  const DOSE_UNITS = ["錠", "カプセル", "包", "mL", "滴", "枚", "本", "回"];
  const SHOW_SIZES = [18, 22, 26, 32];
  const BIRD_SRC = "img/bird.png";
  const EMPTY_BIRD = `<img class="empty-bird" src="${BIRD_SRC}" alt="" width="72" height="61">`;
  const QUESTION_IDEAS = [
    "この薬はいつまで飲みますか？",
    "副作用で気をつけることはありますか？",
    "日常生活（運動・お風呂・食事）で気をつけることは？",
    "次はいつ来ればいいですか？",
    "検査の結果はどうでしたか？",
    "ジェネリックにできますか？",
  ];

  const view = document.getElementById("view");
  const sheetEl = document.getElementById("sheet");
  const sheetBody = document.getElementById("sheet-body");
  const toastEl = document.getElementById("toast");

  // ---------- データ ----------

  function defaultState() {
    return {
      profile: {
        name: "",
        birth: "",
        blood: "",
        allergies: "",
        conditions: "",
        history: "",
        contact1Name: "",
        contact1Tel: "",
        contact2Name: "",
        contact2Tel: "",
        memo: "",
      },
      settings: { showSize: 1, showPlaceId: "" },
      notes: [],
      meds: [],
      medLog: {},
      tweets: [],
      places: [],
      visits: [],
      appts: [],
    };
  }

  function load() {
    const base = defaultState();
    if (DEMO) return merge(base, window.TsuuinDemo.buildDemo());
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      return merge(base, JSON.parse(raw));
    } catch {
      return base;
    }
  }

  function merge(base, data) {
    const list = (v) => (Array.isArray(v) ? v : []);
    return {
      profile: { ...base.profile, ...(data.profile || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      notes: list(data.notes),
      meds: list(data.meds),
      medLog: data.medLog && typeof data.medLog === "object" ? data.medLog : {},
      tweets: list(data.tweets),
      places: list(data.places),
      visits: list(data.visits),
      appts: list(data.appts),
    };
  }

  function save() {
    if (DEMO) return true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      toast("保存できませんでした（ブラウザの保存領域が使えません）");
      return false;
    }
  }

  let state = load();

  if (DEMO) {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = `<span>見本データで試せるデモです。入力した内容は保存されません。</span><a href="./">自分で使う</a>`;
    document.body.prepend(bar);
    document.body.classList.add("demo");
  }

  // ---------- 小さな道具 ----------

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const todayIso = () => P.isoDate(new Date());
  const pad = (n) => String(n).padStart(2, "0");
  const nowTime = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const shortDate = (iso) => (String(iso).startsWith(String(new Date().getFullYear())) ? P.formatDate(iso).replace(/^\d+年/, "") : P.formatDate(iso));
  const backLink = `<a class="back" href="#/">‹ ホーム</a>`;
  const placeName = (id) => (state.places.find((p) => p.id === id) || {}).name || "";
  const byId = (list, id) => list.find((x) => x.id === id);

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2200);
  }

  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") {
        if (el.dataset.multi) {
          out[el.name] = out[el.name] || [];
          if (el.checked) out[el.name].push(el.value);
        } else out[el.name] = el.checked;
      } else out[el.name] = el.value.trim();
    }
    return out;
  }

  function placeOptions(selected, emptyLabel = "どの病院でも") {
    return [`<option value="">${esc(emptyLabel)}</option>`]
      .concat(state.places.map((p) => `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}>${esc(p.name)}</option>`))
      .join("");
  }

  function telHref(tel) {
    return "tel:" + String(tel).replace(/[^\d+]/g, "");
  }

  // リンクにしてよいのは http(s) のアドレスだけ（javascript: などは押すと動いてしまうため）
  function safeUrl(url) {
    return /^https?:\/\//i.test(String(url || "").trim()) ? String(url).trim() : "";
  }

  function mapsSearchUrl(q) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  // ---------- 下から出る画面（確認ダイアログの代わりにも使う） ----------

  let sheetCleanup = null;

  function openSheet(html, mount) {
    sheetBody.innerHTML = html;
    sheetEl.hidden = false;
    document.body.style.overflow = "hidden";
    sheetCleanup = mount ? mount(sheetBody) : null;
    sheetBody.querySelectorAll("textarea[data-grow]").forEach(growTextarea);
    const first = sheetBody.querySelector("[autofocus]");
    if (first) first.focus();
  }

  // 長い文でも全体が見えるよう、入力欄を中身の高さに合わせる（画面の7割まで）
  function growTextarea(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.7) + "px";
  }

  document.addEventListener("input", (e) => {
    if (e.target.matches && e.target.matches("textarea[data-grow]")) growTextarea(e.target);
  });

  function closeSheet() {
    sheetEl.hidden = true;
    sheetBody.innerHTML = "";
    document.body.style.overflow = "";
    if (typeof sheetCleanup === "function") sheetCleanup();
    sheetCleanup = null;
  }

  sheetEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheetEl.hidden) closeSheet();
  });

  // confirm() はアプリによっては出ないので、画面下の確認画面にする
  function ask(message, okLabel, onOk) {
    openSheet(
      `<h2>${esc(message)}</h2>
      <div class="sheet-foot">
        <button type="button" class="btn" data-close>やめる</button>
        <button type="button" class="btn danger armed" id="ask-ok">${esc(okLabel)}</button>
      </div>`,
      (root) => {
        root.querySelector("#ask-ok").addEventListener("click", () => {
          closeSheet();
          onOk();
        });
      },
    );
  }

  // ---------- 画面の切り替え ----------

  const routes = {
    "": renderHome,
    notes: renderNotes,
    show: renderShow,
    meds: renderMeds,
    tweets: renderTweets,
    places: renderPlaces,
    visits: renderVisits,
    profile: renderProfile,
    settings: renderSettings,
  };

  function route() {
    if (!sheetEl.hidden) closeSheet();
    const name = location.hash.replace(/^#\/?/, "").split("/")[0];
    const render = routes[name] || renderHome;
    document.body.classList.toggle("show-mode", name === "show");
    const navName = name || "home";
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const sub = ["visits", "profile", "settings"].includes(navName); // ホームから開く画面
      a.classList.toggle("active", a.dataset.nav === navName || (sub && a.dataset.nav === "home"));
    });
    render();
    window.scrollTo(0, 0);
  }

  function rerender() {
    const y = window.scrollY;
    const name = location.hash.replace(/^#\/?/, "").split("/")[0];
    (routes[name] || renderHome)();
    window.scrollTo(0, y);
  }

  window.addEventListener("hashchange", route);

  // ---------- ホーム ----------

  function upcomingAppts() {
    const today = todayIso();
    return state.appts.filter((a) => a.date >= today).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }

  function renderHome() {
    const open = state.notes.filter((n) => n.status !== "done");
    const important = open.filter((n) => n.important).length;
    const appts = upcomingAppts();
    const today = todayIso();
    const prog = P.medProgress(state.meds, state.medLog, today);
    const p = state.profile;
    const hasEmergency = p.name || p.allergies || p.contact1Tel;

    view.innerHTML = `
      <div class="home-head">
        <div class="home-date">${esc(shortDate(today))}</div>
        <h1>通院ノート</h1>
      </div>

      <div class="buddy">
        <button type="button" class="buddy-bird" id="buddy" aria-label="インコに話しかける">
          <img src="${BIRD_SRC}" alt="" width="104" height="89">
        </button>
        <p class="buddy-bubble" id="buddy-msg" aria-live="polite"></p>
      </div>

      <a class="home-show" href="#/show">
        <span class="home-show-text">
          <strong>先生に見せる</strong>
          <span>${open.length ? `伝えたいこと ${open.length} 件${important ? `（大事 ${important}）` : ""}` : "伝えたいことを大きな文字で表示します"}</span>
        </span>
        <span class="home-show-arrow" aria-hidden="true">›</span>
      </a>

      <div class="section-head"><h2>次の予約</h2><a href="#/visits">記録・予約</a></div>
      ${appts.length ? appts.slice(0, 2).map(apptCard).join("") : `<div class="card empty-card"><span class="muted">予約はまだありません</span><button type="button" class="btn small" data-act="add-appt">＋ 予約を入れる</button></div>`}

      <div class="section-head"><h2>今日のお薬</h2><a href="#/meds">お薬一覧</a></div>
      <div class="card">
        ${prog.total ? `<div class="prog-head"><span>${prog.done === prog.total ? "今日のお薬はすべて飲みました" : "飲んだら押してください"}</span><b>${prog.done} / ${prog.total}</b></div><div class="progress"><i style="width:${Math.round((prog.done / prog.total) * 100)}%"></i></div>` : ""}
        ${doseGrid(today)}
      </div>

      <h2>そのほか</h2>
      <div class="card list-card">
        <a class="list-row" href="#/visits"><span><b>受診の記録</b><small>${state.visits.length ? `これまで ${state.visits.length} 回` : "診察で言われたことを残す"}</small></span><i aria-hidden="true">›</i></a>
        <a class="list-row" href="#/profile"><span><b>緊急情報</b><small>${hasEmergency ? (p.allergies ? `アレルギー：${esc(p.allergies)}` : "登録済み") : "アレルギー・緊急連絡先を登録"}</small></span><i aria-hidden="true">›</i></a>
        <a class="list-row" href="#/settings"><span><b>設定</b><small>バックアップ・データの管理</small></span><i aria-hidden="true">›</i></a>
      </div>
    `;
    bindDoseGrid(today);
    view.querySelectorAll("[data-act=add-appt]").forEach((b) => b.addEventListener("click", () => editAppt()));
    bindApptCards();
    bindBuddy();
  }

  // ---------- インコのひとこと ----------

  // その日の状況から、言うことを大事な順に並べる
  function buddyMessages() {
    const now = new Date();
    const hour = now.getHours();
    const today = todayIso();
    const msgs = [];
    const next = upcomingAppts()[0];
    if (next) {
      const days = P.daysUntil(next.date);
      const place = placeName(next.placeId);
      if (days === 0) msgs.push(`今日は${place ? place + "に行く" : "通院の"}日だよ。気をつけていってらっしゃい！`);
      else if (days === 1) msgs.push("明日は通院の日！伝えたいこと、まとめておこうね");
      else if (days <= 3) msgs.push(`通院まであと${days}日。気になることはメモしておこうね`);
    }
    const prog = P.medProgress(state.meds, state.medLog, today);
    if (prog.total && prog.done >= prog.total) msgs.push("今日のお薬、ぜんぶ飲めたね。えらい！");
    else if (prog.total) {
      // まだ飲んでいない、いちばん早い時間のお薬
      const day = state.medLog[today] || {};
      const meds = todaysMeds(today);
      const next = P.TIMINGS.find(([k]) => meds.some((m) => (m.timings || []).includes(k) && !(day[m.id] || []).includes(k)));
      const label = { morning: "朝", noon: "昼", evening: "夕方", bed: "寝る前" }[next[0]];
      msgs.push(`${label}のお薬、飲んだかな？（今日はあと${prog.total - prog.done}回）`);
    }
    const tweetedToday = state.tweets.some((t) => P.isoDate(new Date(t.at)) === today);
    if (!tweetedToday) msgs.push("今日の体調はどう？つぶやいてみてね");
    const open = state.notes.filter((n) => n.status !== "done").length;
    if (open) msgs.push(`先生に伝えたいこと、${open}件メモしてあるよ`);
    msgs.push(hour >= 5 && hour < 10 ? "おはよう！今日もいっしょにがんばろうね" : hour < 18 && hour >= 10 ? "こんにちは！無理しないでね" : "こんばんは。今日もおつかれさま");
    msgs.push("お水もちゃんと飲んでね");
    msgs.push("しんどいときは、ゆっくり休もうね");
    return msgs;
  }

  let buddyIndex = 0;

  function bindBuddy() {
    const bird = view.querySelector("#buddy");
    const bubble = view.querySelector("#buddy-msg");
    if (!bird) return;
    const msgs = buddyMessages();
    buddyIndex = 0;
    bubble.textContent = msgs[0];
    bird.addEventListener("click", () => {
      buddyIndex = (buddyIndex + 1) % msgs.length;
      bubble.textContent = msgs[buddyIndex];
      bird.classList.remove("hop");
      void bird.offsetWidth; // 続けて押しても毎回跳ねるように
      bird.classList.add("hop");
    });
  }

  function apptCard(a) {
    const days = P.daysUntil(a.date);
    const label = days === 0 ? "今日" : days === 1 ? "明日" : `あと ${days} 日`;
    const place = byId(state.places, a.placeId);
    return `
      <div class="card appt">
        <div class="appt-top">
          <span class="appt-badge${days <= 2 ? " soon" : ""}">${label}</span>
          <span class="appt-when">${esc(shortDate(a.date))}${a.time ? `　${esc(a.time)}` : ""}</span>
        </div>
        <div class="appt-place">${esc(place ? place.name : "病院の指定なし")}</div>
        ${a.memo ? `<div class="small muted pre">${esc(a.memo)}</div>` : ""}
        <div class="appt-actions">
          <button type="button" class="btn small" data-appt-edit="${esc(a.id)}">変更</button>
          <button type="button" class="btn small" data-appt-ics="${esc(a.id)}">カレンダー</button>
          ${place && place.tel ? `<a class="btn small" href="${esc(telHref(place.tel))}">電話</a>` : ""}
        </div>
      </div>`;
  }

  function bindApptCards() {
    view.querySelectorAll("[data-appt-edit]").forEach((b) => b.addEventListener("click", () => editAppt(byId(state.appts, b.dataset.apptEdit))));
    view.querySelectorAll("[data-appt-ics]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = byId(state.appts, b.dataset.apptIcs);
        const place = byId(state.places, a.placeId) || {};
        const ics = P.buildIcs({
          title: `通院：${place.name || "病院"}`,
          date: a.date,
          time: a.time,
          location: place.address || "",
          memo: [a.memo, place.tel ? `電話 ${place.tel}` : ""].filter(Boolean).join("\n"),
          uid: a.id,
        });
        download(`通院予約_${a.date}.ics`, ics, "text/calendar");
        toast("カレンダー用のファイルを作りました。開くと予定に追加できます");
      }),
    );
  }

  function editAppt(appt, defaults = {}) {
    const a = appt || { id: "", placeId: defaults.placeId || "", date: defaults.date || "", time: "", memo: "" };
    openSheet(
      `<h2>${appt ? "予約を変更" : "予約を入れる"}</h2>
      <form id="appt-form">
        <label class="field"><span>病院</span><select name="placeId">${placeOptions(a.placeId, "選ばない")}</select></label>
        <div class="two">
          <label class="field"><span>日にち</span><input type="date" name="date" value="${esc(a.date)}" required></label>
          <label class="field"><span>時間</span><input type="time" name="time" value="${esc(a.time)}"></label>
        </div>
        <label class="field"><span>メモ（持ち物・検査など）</span><textarea name="memo" placeholder="例：朝ごはん抜き、保険証と診察券">${esc(a.memo)}</textarea></label>
        <div class="sheet-foot">
          ${appt ? `<button type="button" class="btn danger" id="appt-del">削除</button>` : `<button type="button" class="btn" data-close>やめる</button>`}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`,
      (root) => {
        root.querySelector("#appt-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const data = formData(e.target);
          if (!data.date) return toast("日にちを入れてください");
          if (appt) Object.assign(appt, data);
          else state.appts.push({ id: uid(), ...data });
          save();
          closeSheet();
          toast("予約を保存しました");
          rerender();
        });
        const del = root.querySelector("#appt-del");
        if (del)
          del.addEventListener("click", () =>
            ask("この予約を削除しますか？", "削除する", () => {
              state.appts = state.appts.filter((x) => x.id !== appt.id);
              save();
              rerender();
            }),
          );
      },
    );
  }

  // ---------- お薬のチェック（ホームとお薬の画面で使う） ----------

  function todaysMeds(iso) {
    return state.meds.filter((m) => m.active && !(m.start && m.start > iso) && !(m.end && m.end < iso));
  }

  function doseGrid(iso) {
    const meds = todaysMeds(iso);
    const day = state.medLog[iso] || {};
    const rows = P.TIMINGS.map(([key, label]) => {
      const list = meds.filter((m) => (m.timings || []).includes(key));
      if (!list.length) return "";
      return `<div class="dose-time"><b>${label}</b><div class="dose-list">${list
        .map((m) => {
          const meal = key === "bed" ? "" : m.slotMeal && key in m.slotMeal ? m.slotMeal[key] : m.meal;
          const when = [meal, ((m.slotTime || {})[key] || "").replace(/^0(\d)/, "$1")].filter(Boolean).join(" ");
          return `<button type="button" class="dose${(day[m.id] || []).includes(key) ? " taken" : ""}" data-dose="${esc(m.id)}" data-time="${key}">${esc(m.name)}${when ? `<small>${esc(when)}</small>` : ""}</button>`;
        })
        .join("")}</div></div>`;
    }).join("");
    const prn = meds.filter((m) => m.prn);
    const prnRow = prn.length
      ? `<div class="dose-time"><b>頓服</b><div class="dose-list">${prn
          .map((m) => `<button type="button" class="dose" data-prn="${esc(m.id)}">${esc(m.name)}${(day[m.id] || []).filter((t) => t.startsWith("prn")).length ? `（${(day[m.id] || []).filter((t) => t.startsWith("prn")).length}回）` : ""}</button>`)
          .join("")}</div></div>`
      : "";
    if (!rows && !prnRow) return `<p class="muted small" style="margin:0">飲むお薬はまだ登録されていません。<a href="#/meds">お薬を追加</a></p>`;
    return `<div class="dose-grid">${rows}${prnRow}</div>`;
  }

  function bindDoseGrid(iso) {
    view.querySelectorAll("[data-dose]").forEach((b) =>
      b.addEventListener("click", () => {
        const day = (state.medLog[iso] = state.medLog[iso] || {});
        const list = (day[b.dataset.dose] = day[b.dataset.dose] || []);
        const i = list.indexOf(b.dataset.time);
        if (i >= 0) list.splice(i, 1);
        else list.push(b.dataset.time);
        save();
        const prog = P.medProgress(state.meds, state.medLog, iso);
        if (i < 0 && prog.total && prog.done === prog.total) toast("今日のお薬、ぜんぶ飲めたね。えらい！");
        rerender();
      }),
    );
    view.querySelectorAll("[data-prn]").forEach((b) =>
      b.addEventListener("click", () => {
        const med = byId(state.meds, b.dataset.prn);
        openSheet(
          `<h2>${esc(med.name)}（頓服）</h2>
          <p>今（${nowTime()}）飲んだことを記録しますか？</p>
          <div class="sheet-foot">
            <button type="button" class="btn" data-close>やめる</button>
            <button type="button" class="btn primary" id="prn-ok">飲んだ</button>
          </div>`,
          (root) =>
            root.querySelector("#prn-ok").addEventListener("click", () => {
              const day = (state.medLog[iso] = state.medLog[iso] || {});
              (day[med.id] = day[med.id] || []).push("prn@" + nowTime());
              save();
              closeSheet();
              toast(`${med.name} を記録しました`);
              rerender();
            }),
        );
      }),
    );
  }

  // ---------- 伝えたいこと ----------

  let notesFilter = "open";

  function noteSub(n) {
    const parts = [];
    if (n.since) parts.push(`いつから：${n.since}`);
    if (n.where) parts.push(`どこ：${n.where}`);
    if (n.level) parts.push(`つらさ：${n.level}/10`);
    if (n.trigger) parts.push(`きっかけ・変化：${n.trigger}`);
    return parts.join("　");
  }

  // 一覧用：項目ごとに区切って、途中で折り返さないようにする
  function noteSubHtml(n) {
    return noteSub(n)
      .split("　")
      .filter(Boolean)
      .map((x) => `<span class="meta-item">${esc(x)}</span>`)
      .join("");
  }

  function sortedNotes(list) {
    return list
      .slice()
      .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.order ?? 0) - (b.order ?? 0));
  }

  function renderNotes() {
    const list = sortedNotes(state.notes.filter((n) => (notesFilter === "done" ? n.status === "done" : n.status !== "done")));
    view.innerHTML = `
      <div class="page-head"><h1>伝えたいこと</h1><a class="btn small primary" href="#/show">先生に見せる</a></div>
      <button type="button" class="btn primary block" id="note-add">＋ 伝えたいことを書く</button>
      <div class="chips" style="margin-top:12px">
        <button type="button" class="chip${notesFilter === "open" ? " on" : ""}" data-filter="open">これから伝える</button>
        <button type="button" class="chip${notesFilter === "done" ? " on" : ""}" data-filter="done">伝えた（済み）</button>
      </div>
      ${list.length ? list.map(noteCard).join("") : `<p class="empty">${EMPTY_BIRD}${notesFilter === "done" ? "済みのものはまだありません" : "まだありません。<br>症状・聞きたいこと・お願いを書いておくと、診察のときに見せられます。"}</p>`}
    `;
    view.querySelector("#note-add").addEventListener("click", () => editNote());
    view.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        notesFilter = b.dataset.filter;
        renderNotes();
      }),
    );
    view.querySelectorAll("[data-note]").forEach((b) =>
      b.addEventListener("click", (e) => {
        const more = e.target.closest("[data-more]");
        if (more) {
          const text = more.previousElementSibling;
          const open = text.classList.toggle("clamp");
          more.textContent = open ? "全文を見る" : "たたむ";
          return;
        }
        editNote(byId(state.notes, b.dataset.note));
      }),
    );
    view.querySelectorAll("[data-star]").forEach((b) =>
      b.addEventListener("click", () => {
        const n = byId(state.notes, b.dataset.star);
        n.important = !n.important;
        save();
        rerender();
      }),
    );
  }

  // 4行を超えそうな文（改行が多い、または長い）
  function isLong(text, chars = 70) {
    const t = String(text || "");
    return t.split("\n").length > 4 || t.length > chars;
  }

  function noteCard(n) {
    const sub = noteSubHtml(n);
    return `
      <div class="card item">
        <div class="item-main" data-note="${esc(n.id)}" style="cursor:pointer">
          <div><span class="tag ${esc(n.kind)}">${esc(KINDS[n.kind] || "")}</span> ${n.placeId ? `<span class="small muted">${esc(placeName(n.placeId))}</span>` : ""}</div>
          ${n.title ? `<div class="item-title${n.status === "done" ? " done-text" : ""}">${esc(n.title)}</div>` : ""}
          <div class="item-text long-text${isLong(n.text) ? " clamp" : ""}${n.status === "done" && !n.title ? " done-text" : ""}">${esc(n.text)}</div>
          ${isLong(n.text) ? `<button type="button" class="more-btn" data-more>全文を見る</button>` : ""}
          ${sub ? `<div class="item-meta">${sub}</div>` : ""}
          ${n.answer ? `<div class="item-meta">先生の答え：${esc(n.answer)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button type="button" class="icon-btn${n.important ? " star" : ""}" data-star="${esc(n.id)}" aria-label="大事なこと">${n.important ? "★" : "☆"}</button>
        </div>
      </div>`;
  }

  function editNote(note, defaults = {}) {
    const n = note || { kind: defaults.kind || "symptom", text: defaults.text || "", since: defaults.since || "", where: "", level: "", trigger: "", placeId: state.settings.showPlaceId || "", important: false, answer: "" };
    let kind = n.kind;
    let level = n.level || "";

    openSheet(
      `<h2>${note ? "伝えたいことを直す" : "伝えたいことを書く"}</h2>
      <form id="note-form">
        <div class="chips">${KIND_ORDER.map((k) => `<button type="button" class="chip${k === kind ? " on" : ""}" data-kind="${k}">${KINDS[k]}</button>`).join("")}</div>
        <div id="note-hint"></div>
        <label class="field"><span>見出し（ひとことで・なくてもOK）</span><input type="text" name="title" value="${esc(n.title || "")}" placeholder="例：頭痛が続いている"></label>
        <label class="field"><span id="text-label">内容</span><textarea name="text" class="long-input" data-grow required autofocus>${esc(n.text)}</textarea>
          <span class="small muted">長くても大丈夫です。段落の間は1行あけると読みやすくなります。</span></label>
        <div id="symptom-fields">
          <div class="two">
            <label class="field"><span>いつから</span><input type="text" name="since" value="${esc(n.since)}" placeholder="例：3日前の夜から"></label>
            <label class="field"><span>どこが</span><input type="text" name="where" value="${esc(n.where)}" placeholder="例：右の下腹"></label>
          </div>
          <div class="field"><span class="small muted">つらさ（0＝なし、10＝いちばんつらい）</span>
            <div class="level">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-level="${i}" class="${String(i) === String(level) ? "on" : ""}">${i}</button>`).join("")}</div>
          </div>
          <label class="field"><span>きっかけ・変化（よくなった／悪くなった）</span><input type="text" name="trigger" value="${esc(n.trigger)}" placeholder="例：食後にひどくなる、薬を飲むと楽"></label>
        </div>
        <div id="question-ideas"></div>
        <label class="field"><span>どの病院で伝える？</span><select name="placeId">${placeOptions(n.placeId)}</select></label>
        <label class="check"><input type="checkbox" name="important"${n.important ? " checked" : ""}> いちばん大事（先に表示する）</label>
        ${note ? `<label class="field"><span>先生の答え・言われたこと</span><textarea name="answer" data-grow>${esc(n.answer)}</textarea></label>
        <label class="check"><input type="checkbox" name="done"${n.status === "done" ? " checked" : ""}> 伝えた（済みにする）</label>` : ""}
        <div class="sheet-foot">
          ${note ? `<button type="button" class="btn danger" id="note-del">削除</button>` : `<button type="button" class="btn" data-close>やめる</button>`}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`,
      (root) => {
        const form = root.querySelector("#note-form");
        const syncKind = () => {
          root.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
          root.querySelector("#symptom-fields").hidden = kind !== "symptom";
          root.querySelector("#text-label").textContent = kind === "symptom" ? "どんなふうに（症状・体調）" : kind === "question" ? "先生に聞きたいこと" : kind === "request" ? "お願いしたいこと" : "内容";
          root.querySelector("#note-hint").innerHTML =
            kind === "symptom"
              ? `<div class="hint">「いつから・どこが・どんなふうに・どのくらい」の順に書くと、先生に伝わりやすくなります。</div>`
              : kind === "request"
                ? `<div class="hint">例：薬を減らしたい、診断書がほしい、紹介状がほしい、次の予約を土曜にしたい</div>`
                : "";
          root.querySelector("#question-ideas").innerHTML =
            kind === "question"
              ? `<details class="more"><summary>よくある質問から選ぶ</summary><div class="chips">${QUESTION_IDEAS.map((q) => `<button type="button" class="chip" data-idea="${esc(q)}">${esc(q)}</button>`).join("")}</div></details>`
              : "";
          root.querySelectorAll("[data-idea]").forEach((b) =>
            b.addEventListener("click", () => {
              const ta = form.elements.text;
              ta.value = ta.value ? ta.value + "\n" + b.dataset.idea : b.dataset.idea;
            }),
          );
        };
        syncKind();
        root.querySelectorAll("[data-kind]").forEach((b) =>
          b.addEventListener("click", () => {
            kind = b.dataset.kind;
            syncKind();
          }),
        );
        root.querySelectorAll("[data-level]").forEach((b) =>
          b.addEventListener("click", () => {
            level = String(level) === b.dataset.level ? "" : b.dataset.level;
            root.querySelectorAll("[data-level]").forEach((x) => x.classList.toggle("on", x.dataset.level === String(level)));
          }),
        );
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.text) return toast("内容を書いてください");
          const fields = {
            kind,
            title: d.title,
            text: d.text,
            since: kind === "symptom" ? d.since : "",
            where: kind === "symptom" ? d.where : "",
            level: kind === "symptom" ? level : "",
            trigger: kind === "symptom" ? d.trigger : "",
            placeId: d.placeId,
            important: d.important,
          };
          if (note) {
            Object.assign(note, fields, { answer: d.answer, status: d.done ? "done" : "open" });
          } else {
            state.notes.push({ id: uid(), ...fields, answer: "", status: "open", order: state.notes.length, createdAt: new Date().toISOString() });
          }
          save();
          closeSheet();
          toast("保存しました");
          if (location.hash.startsWith("#/notes")) rerender();
          else location.hash = "#/notes";
        });
        const del = root.querySelector("#note-del");
        if (del)
          del.addEventListener("click", () =>
            ask("この伝えたいことを削除しますか？", "削除する", () => {
              state.notes = state.notes.filter((x) => x.id !== note.id);
              save();
              rerender();
            }),
          );
      },
    );
  }

  // ---------- 先生に見せる ----------

  function renderShow() {
    const s = state.settings;
    const pid = s.showPlaceId && byId(state.places, s.showPlaceId) ? s.showPlaceId : "";
    const notes = sortedNotes(state.notes.filter((n) => n.status !== "done" && (!pid || !n.placeId || n.placeId === pid)));
    const meds = state.meds.filter((m) => m.active);
    const pinned = state.tweets.filter((t) => t.pin).sort((a, b) => a.at.localeCompare(b.at));
    const p = state.profile;
    const size = SHOW_SIZES[s.showSize] || SHOW_SIZES[1];
    const who = [p.name && `${p.name}`, p.birth && `生年月日 ${P.formatDate(p.birth, false)}`, p.blood && `${p.blood}型`].filter(Boolean).join("　");

    const groups = KIND_ORDER.map((k) => {
      const list = notes.filter((n) => n.kind === k);
      if (!list.length) return "";
      return `<h2>${KINDS[k]}</h2><ol>${list
        .map((n) => {
          const sub = noteSub(n);
          const imp = n.important ? '<span class="imp">【大事】</span>' : "";
          const told = '<span class="told-badge">✓ 伝えた</span>';
          // 見出しがあれば見出しを太字に。長い文は太字にせず、段落を残して読みやすくする
          const body = n.title
            ? `<span class="show-main">${imp}${esc(n.title)}</span>${told}<span class="show-body">${esc(n.text)}</span>`
            : isLong(n.text, 40) || n.text.includes("\n")
              ? `${imp ? `<span class="show-main">${imp}</span>` : ""}${told}<span class="show-body">${esc(n.text)}</span>`
              : `<span class="show-main">${imp}${esc(n.text)}</span>${told}`;
          return `<li data-told="${esc(n.id)}" class="${n.told ? "told" : ""}">${body}${sub ? `<span class="show-sub">${esc(sub)}</span>` : ""}</li>`;
        })
        .join("")}</ol>`;
    }).join("");

    view.innerHTML = `
      <div class="show" style="--show-size:${size}px">
        <div class="show-inner">
          <div class="show-bar">
            <a class="btn small" href="#/">← 戻る</a>
            <select id="show-place" style="max-width:40%;min-height:36px;font-size:14px;padding:4px 8px;background:#fff;color:#111;border-color:#999">${placeOptions(pid, "すべての病院")}</select>
            <span class="row">
              <button type="button" class="btn small" id="size-down" aria-label="文字を小さく">A−</button>
              <button type="button" class="btn small" id="size-up" aria-label="文字を大きく">A＋</button>
            </span>
          </div>
          <p class="show-title">先生へお伝えしたいこと</p>
          <div class="show-who">${who ? `<b>${esc(who)}</b><br>` : ""}${esc(P.formatDate(todayIso()))}</div>
          ${p.allergies ? `<div class="alert">アレルギー：${esc(p.allergies)}</div>` : ""}
          ${groups || `<p style="color:#666">伝えたいことはまだありません。「伝えたいこと」から書けます。</p>`}
          ${pinned.length ? `<h2>最近の体調（メモ）</h2><table>${pinned.map((t) => `<tr><td style="white-space:nowrap">${esc(shortDateTime(t.at))}</td><td>${t.mood ? MOODS[t.mood - 1] + " " : ""}${esc(t.text)}</td></tr>`).join("")}</table>` : ""}
          ${meds.length ? `<h2>今飲んでいるお薬</h2><table>${meds.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.dose ? `　${esc(m.dose)}` : ""}<br><span class="show-med-sub">${esc([medTimingText(m), m.placeId && placeName(m.placeId)].filter(Boolean).join("　"))}</span></td></tr>`).join("")}</table>` : ""}
          ${p.conditions || p.history ? `<h2>持病・これまでの病気</h2><p style="margin:0" class="pre">${esc([p.conditions, p.history].filter(Boolean).join("\n"))}</p>` : ""}
          <div class="show-foot">
            <p style="font-size:14px;color:#555">項目を押すと「✓ 伝えた」になります。</p>
            <button type="button" class="btn block" id="show-finish">受診を記録して終わる</button>
          </div>
        </div>
      </div>
    `;

    view.querySelector("#show-place").addEventListener("change", (e) => {
      s.showPlaceId = e.target.value;
      save();
      renderShow();
    });
    view.querySelector("#size-down").addEventListener("click", () => {
      s.showSize = Math.max(0, s.showSize - 1);
      save();
      rerender();
    });
    view.querySelector("#size-up").addEventListener("click", () => {
      s.showSize = Math.min(SHOW_SIZES.length - 1, s.showSize + 1);
      save();
      rerender();
    });
    view.querySelectorAll("[data-told]").forEach((li) =>
      li.addEventListener("click", () => {
        const n = byId(state.notes, li.dataset.told);
        n.told = !n.told;
        save();
        li.classList.toggle("told", n.told);
      }),
    );
    view.querySelector("#show-finish").addEventListener("click", () => recordVisit(notes, pid));
  }

  function shortDateTime(isoString) {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function medTimingText(m) {
    return P.medScheduleText(m);
  }

  // 診察のあと：伝えたこと・先生の話・次の予約をまとめて記録する
  function recordVisit(shownNotes, placeId) {
    // 同じ病院のお薬を先に並べる
    const byPlace = (a, b) => (b.placeId === placeId ? 1 : 0) - (a.placeId === placeId ? 1 : 0);
    const activeMeds = state.meds.filter((m) => m.active).sort(byPlace);
    const stoppedMeds = state.meds.filter((m) => !m.active).sort(byPlace);
    const renewRow = (m) => `
      <label class="renew-row">
        <input type="checkbox" name="renew" value="${esc(m.id)}" data-multi="1">
        <span><b>${esc(m.name)}</b>${m.dose ? `　<small>${esc(m.dose)}</small>` : ""}
          <small class="renew-when" data-renew-preview="${esc(m.id)}"></small></span>
      </label>`;
    const medsHtml = state.meds.length
      ? `<div class="field"><span>今回も出たお薬<small class="muted">（チェックすると、同じ内容で続けて登録します）</small></span>
          <div class="renew-list">${activeMeds.map(renewRow).join("") || `<p class="small muted" style="margin:8px 0">飲んでいるお薬はありません</p>`}</div>
          ${stoppedMeds.length ? `<details class="more"><summary>やめたお薬から選ぶ（${stoppedMeds.length}）</summary><div class="renew-list">${stoppedMeds.map(renewRow).join("")}</div></details>` : ""}
        </div>`
      : "";

    openSheet(
      `<h2>受診を記録する</h2>
      <form id="visit-form">
        <div class="two">
          <label class="field"><span>日にち</span><input type="date" name="date" value="${todayIso()}" required></label>
          <label class="field"><span>病院</span><select name="placeId">${placeOptions(placeId, "選ばない")}</select></label>
        </div>
        ${shownNotes.length ? `<div class="field"><span class="small muted">伝えたこと（チェックしたものは「済み」になります）</span>
          ${shownNotes
            .map(
              (n) => `<div class="card" style="padding:10px 12px;margin-bottom:6px">
                <label class="check"><input type="checkbox" name="done" value="${esc(n.id)}" data-multi="1"${n.told ? " checked" : ""}> <span class="clamp2">${esc(n.title || n.text)}</span></label>
                ${n.kind === "question" ? `<input type="text" name="ans-${esc(n.id)}" placeholder="先生の答え（あれば）" value="${esc(n.answer || "")}">` : ""}
              </div>`,
            )
            .join("")}</div>` : ""}
        ${medsHtml}
        <label class="field"><span>先生の話・言われたこと</span><textarea name="memo" data-grow placeholder="例：様子見。薬を1週間分追加。熱が38度を超えたら連絡"></textarea></label>
        <div class="two">
          <label class="field"><span>次の予約（日にち）</span><input type="date" name="nextDate"></label>
          <label class="field"><span>時間</span><input type="time" name="nextTime"></label>
        </div>
        <label class="field"><span>支払った金額（メモ）</span><input type="text" name="cost" inputmode="numeric" placeholder="例：1,520円"></label>
        <div class="sheet-foot">
          <button type="button" class="btn" data-close>やめる</button>
          <button type="submit" class="btn primary">記録する</button>
        </div>
      </form>`,
      (root) => {
        const form = root.querySelector("#visit-form");
        // チェックしたお薬の「いつからいつまで」を、受診日に合わせて表示する
        const preview = () => {
          root.querySelectorAll("[data-renew-preview]").forEach((el) => {
            const med = byId(state.meds, el.dataset.renewPreview);
            const on = form.querySelector(`input[name=renew][value="${CSS.escape(med.id)}"]`).checked;
            if (!on) return (el.textContent = medTimingText(med));
            const r = P.renewMed(med, form.elements.date.value || todayIso());
            const md = (iso) => shortDate(iso).replace(/（.）$/, "");
            el.textContent = `→ ${md(r.start)}から${r.end ? `　${md(r.end)}まで` : ""}`;
          });
        };
        form.elements.date.addEventListener("input", preview);
        form.querySelectorAll("input[name=renew]").forEach((x) => x.addEventListener("change", preview));
        preview();

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const d = formData(e.target);
          const doneIds = d.done || [];
          const items = [];
          for (const n of shownNotes) {
            const ans = d["ans-" + n.id];
            if (ans !== undefined) n.answer = ans;
            if (doneIds.includes(n.id)) {
              n.status = "done";
              n.told = false;
              items.push({ kind: n.kind, title: n.title || "", text: n.text, answer: n.answer || "" });
            }
          }
          // 今回も出たお薬：前の期間を履歴に残して、次の期間に進める
          const renewed = [];
          for (const id of d.renew || []) {
            const med = byId(state.meds, id);
            if (!med) continue;
            const r = P.renewMed(med, d.date);
            if (med.start || med.end) med.history = (med.history || []).concat({ start: med.start || "", end: med.end || "", total: med.total || "" });
            Object.assign(med, r, { active: true });
            renewed.push(med.name);
          }
          state.visits.push({ id: uid(), date: d.date, placeId: d.placeId, items, meds: renewed, memo: d.memo, cost: d.cost });
          if (d.nextDate) state.appts.push({ id: uid(), placeId: d.placeId, date: d.nextDate, time: d.nextTime, memo: "" });
          save();
          closeSheet();
          toast(renewed.length ? `受診を記録し、お薬${renewed.length}件を続けました` : "受診を記録しました");
          // すでに受診の記録の画面にいるときは、移動ではなく描き直す
          if (location.hash === "#/visits") rerender();
          else location.hash = "#/visits";
        });
      },
    );
  }

  // ---------- 受診の記録 ----------

  function renderVisits() {
    const appts = upcomingAppts();
    const visits = state.visits.slice().sort((a, b) => b.date.localeCompare(a.date));
    view.innerHTML = `
      ${backLink}
      <h1>受診の記録</h1>
      <div class="row" style="margin-bottom:8px">
        <button type="button" class="btn primary grow" id="visit-add">＋ 受診を記録</button>
        <button type="button" class="btn grow" id="appt-add">＋ 予約を入れる</button>
      </div>
      <h2>これからの予約</h2>
      ${appts.length ? appts.map(apptCard).join("") : `<p class="muted small">予約はありません</p>`}
      <h2>これまでの受診</h2>
      ${visits.length ? visits.map(visitCard).join("") : `<p class="empty">${EMPTY_BIRD}まだありません。<br>「先生に見せる」画面のいちばん下からも記録できます。</p>`}
    `;
    view.querySelector("#visit-add").addEventListener("click", () => recordVisit([], state.settings.showPlaceId || ""));
    view.querySelector("#appt-add").addEventListener("click", () => editAppt());
    bindApptCards();
    view.querySelectorAll("[data-visit-del]").forEach((b) =>
      b.addEventListener("click", () =>
        ask("この受診の記録を削除しますか？", "削除する", () => {
          state.visits = state.visits.filter((v) => v.id !== b.dataset.visitDel);
          save();
          rerender();
        }),
      ),
    );
  }

  function visitCard(v) {
    return `
      <div class="card">
        <div class="row"><b class="grow">${esc(P.formatDate(v.date))}</b><span class="small muted">${esc(placeName(v.placeId))}</span></div>
        ${v.items && v.items.length ? `<ul style="margin:6px 0;padding-left:1.2em">${v.items.map((i) => `<li>${i.title ? `<b>${esc(i.title)}</b><br>` : ""}<span class="pre">${esc(i.text)}</span>${i.answer ? `<br><span class="small muted">→ ${esc(i.answer)}</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${v.memo ? `<div class="pre" style="margin-top:4px">${esc(v.memo)}</div>` : ""}
        ${v.meds && v.meds.length ? `<div class="small" style="margin-top:4px">お薬：${esc(v.meds.join("、"))}</div>` : ""}
        ${v.cost ? `<div class="small muted">支払い：${esc(v.cost)}</div>` : ""}
        <div class="row end"><button type="button" class="btn small danger" data-visit-del="${esc(v.id)}">削除</button></div>
      </div>`;
  }

  // ---------- お薬 ----------

  function renderMeds() {
    const today = todayIso();
    const active = state.meds.filter((m) => m.active);
    const stopped = state.meds.filter((m) => !m.active);
    view.innerHTML = `
      <h1>お薬</h1>
      <button type="button" class="btn primary block" id="med-add">＋ お薬を追加</button>
      <h2>今日のチェック（${esc(P.formatDate(today))}）</h2>
      <div class="card">${doseGrid(today)}</div>
      <h2>飲んでいるお薬（${active.length}）</h2>
      ${active.length ? active.map(medCard).join("") : `<p class="empty">${EMPTY_BIRD}まだありません</p>`}
      ${stopped.length ? `<h2>やめたお薬（${stopped.length}）</h2>${stopped.map(medCard).join("")}` : ""}
    `;
    view.querySelector("#med-add").addEventListener("click", () => editMed());
    bindDoseGrid(today);
    view.querySelectorAll("[data-med]").forEach((b) => b.addEventListener("click", () => editMed(byId(state.meds, b.dataset.med))));
  }

  function medCard(m) {
    const md = (iso) => shortDate(iso).replace(/（.）$/, "");
    const meta = [medTimingText(m), m.placeId && placeName(m.placeId), m.start && `${md(m.start)}から`, m.end && `${md(m.end)}まで`]
      .filter(Boolean)
      .map((x) => `<span class="meta-item">${esc(x)}</span>`)
      .join("");
    return `
      <div class="card item" data-med="${esc(m.id)}" style="cursor:pointer">
        <div class="item-main">
          <div class="item-text${m.active ? "" : " done-text"}"><b>${esc(m.name)}</b>${m.dose ? `　<span class="small">${esc(m.dose)}</span>` : ""}</div>
          ${m.purpose ? `<div class="small pre">${esc(m.purpose)}</div>` : ""}
          ${meta ? `<div class="item-meta">${meta}</div>` : ""}
          ${m.memo ? `<div class="item-meta pre">${esc(m.memo)}</div>` : ""}
        </div>
      </div>`;
  }

  function editMed(med) {
    const m = med || { name: "", dose: "", timings: [], meal: "食後", prn: false, purpose: "", placeId: "", start: todayIso(), end: "", total: "", memo: "", active: true };
    const dose = { num: m.doseNum ?? P.parseDose(m.dose).num, unit: m.doseUnit || P.parseDose(m.dose).unit || "錠" };
    const units = DOSE_UNITS.includes(dose.unit) ? DOSE_UNITS : [dose.unit, ...DOSE_UNITS];
    const slotMeal = (k) => (m.slotMeal && k in m.slotMeal ? m.slotMeal[k] : m.meal ?? "食後");
    const slots = P.TIMINGS.map(([k, l]) => {
      const on = (m.timings || []).includes(k);
      return `<div class="slot${on ? "" : " off"}" data-slot="${k}">
        <label class="check"><input type="checkbox" name="timings" value="${k}" data-multi="1"${on ? " checked" : ""}> <b>${l}</b></label>
        ${k === "bed" ? `<span class="slot-none">—</span>` : `<select name="meal-${k}" aria-label="${l}の食事との関係">${MEAL.map((x) => `<option value="${x}"${x === (slotMeal(k) || "") ? " selected" : ""}>${x || "指定なし"}</option>`).join("")}</select>`}
        <input type="time" name="time-${k}" value="${esc((m.slotTime || {})[k] || "")}" aria-label="${l}の時刻（なくてもOK）">
      </div>`;
    }).join("");

    openSheet(
      `<h2>${med ? "お薬を直す" : "お薬を追加"}</h2>
      <form id="med-form">
        <label class="field"><span>お薬の名前</span><input type="text" name="name" value="${esc(m.name)}" required autofocus placeholder="例：ロキソプロフェン錠60mg"></label>
        <div class="field"><span>1回の量</span>
          <div class="dose-input">
            <input type="number" name="doseNum" value="${esc(dose.num)}" inputmode="decimal" min="0" step="any" placeholder="1">
            <select name="doseUnit" aria-label="単位">${units.map((u) => `<option${u === dose.unit ? " selected" : ""}>${esc(u)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><span>飲むとき<small class="muted">（時刻はなくてもOK）</small></span>
          <div class="slots">${slots}</div>
          <label class="check"><input type="checkbox" name="prn"${m.prn ? " checked" : ""}> 頓服（痛いときなど、必要なときだけ）</label>
        </div>
        <label class="field"><span>何のお薬？</span><textarea name="purpose" class="short-input" data-grow placeholder="例：痛み止め&#10;胃が荒れないように一緒に飲む">${esc(m.purpose)}</textarea></label>
        <label class="field"><span>出してもらった病院</span><select name="placeId">${placeOptions(m.placeId, "選ばない")}</select></label>
        <div class="two">
          <label class="field"><span>飲み始め</span><input type="date" name="start" value="${esc(m.start)}"></label>
          <label class="field"><span>処方された数</span>
            <div class="dose-input"><input type="number" name="total" value="${esc(m.total || "")}" inputmode="numeric" min="0" step="any" placeholder="例：21"><span class="unit" id="total-unit">${esc(dose.unit)}</span></div>
          </label>
        </div>
        <label class="field"><span>飲み終わり（予定）</span><input type="date" name="end" value="${esc(m.end)}"></label>
        <p class="calc-note" id="end-note" hidden></p>
        <label class="field"><span>メモ（副作用・飲み合わせなど）</span><textarea name="memo" data-grow>${esc(m.memo)}</textarea></label>
        ${med ? `<label class="check"><input type="checkbox" name="stopped"${m.active ? "" : " checked"}> もう飲んでいない（やめたお薬にする）</label>` : ""}
        <div class="sheet-foot">
          ${med ? `<button type="button" class="btn danger" id="med-del">削除</button>` : `<button type="button" class="btn" data-close>やめる</button>`}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`,
      (root) => {
        const form = root.querySelector("#med-form");
        const note = root.querySelector("#end-note");
        const checkedTimings = () => [...form.querySelectorAll("input[name=timings]:checked")].map((x) => x.value);

        // 飲み始め・処方された数・1回の量・飲むときから、飲み終わりを入れる
        const recalc = (fromUser) => {
          const unit = form.elements.doseUnit.value;
          root.querySelector("#total-unit").textContent = unit;
          form.querySelectorAll("[data-slot]").forEach((row) => row.classList.toggle("off", !row.querySelector("input[type=checkbox]").checked));
          const total = form.elements.total.value;
          if (!total) return (note.hidden = true);
          const times = checkedTimings().length;
          const r = P.calcEndDate(form.elements.start.value, total, form.elements.doseNum.value, times);
          note.hidden = false;
          if (!r) {
            note.textContent = !form.elements.start.value ? "飲み始めを入れると、飲み終わりを計算します" : !times ? "飲むとき（朝・昼など）を選ぶと、飲み終わりを計算します" : "1回の量を入れると、飲み終わりを計算します";
            return;
          }
          if (fromUser) form.elements.end.value = r.end;
          note.textContent = `1日 ${r.perDay}${unit}（1回 ${form.elements.doseNum.value}${unit} × ${times}回）なので ${r.days}日分 → ${P.formatDate(r.end)}まで`;
        };
        ["start", "total", "doseNum", "doseUnit"].forEach((n) => form.elements[n].addEventListener("input", () => recalc(true)));
        form.querySelectorAll("input[name=timings]").forEach((x) => x.addEventListener("change", () => recalc(true)));
        recalc(false);

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.name) return toast("お薬の名前を入れてください");
          const timings = d.timings || [];
          const slotMealOut = {};
          const slotTimeOut = {};
          for (const k of timings) {
            if (k !== "bed") slotMealOut[k] = d["meal-" + k];
            if (d["time-" + k]) slotTimeOut[k] = d["time-" + k];
          }
          const fields = {
            name: d.name,
            dose: d.doseNum ? d.doseNum + d.doseUnit : "",
            doseNum: d.doseNum,
            doseUnit: d.doseUnit,
            timings,
            slotMeal: slotMealOut,
            slotTime: slotTimeOut,
            prn: d.prn,
            purpose: d.purpose,
            placeId: d.placeId,
            start: d.start,
            total: d.total,
            end: d.end,
            memo: d.memo,
          };
          if (med) Object.assign(med, fields, { active: !d.stopped });
          else state.meds.push({ id: uid(), ...fields, active: true });
          save();
          closeSheet();
          toast("お薬を保存しました");
          rerender();
        });
        const del = root.querySelector("#med-del");
        if (del)
          del.addEventListener("click", () =>
            ask(`「${med.name}」を削除しますか？（飲んだ記録も見えなくなります）`, "削除する", () => {
              state.meds = state.meds.filter((x) => x.id !== med.id);
              save();
              rerender();
            }),
          );
      },
    );
  }

  // ---------- つぶやき ----------

  let tweetMood = 0;

  function renderTweets() {
    const list = state.tweets.slice().sort((a, b) => b.at.localeCompare(a.at));
    let lastDay = "";
    const items = list
      .map((t) => {
        const day = P.isoDate(new Date(t.at));
        const head = day !== lastDay ? `<div class="tweet-day">${esc(P.formatDate(day))}</div>` : "";
        lastDay = day;
        return `${head}<div class="card tweet">
          <div class="tweet-mood">${t.mood ? MOODS[t.mood - 1] : "・"}</div>
          <div class="grow">
            <div class="pre" style="overflow-wrap:anywhere">${esc(t.text)}</div>
            <div class="row" style="margin-top:4px">
              <span class="tweet-time grow">${esc(shortDateTime(t.at).split(" ")[1])}${t.pin ? "　★先生に見せる" : ""}</span>
              <button type="button" class="btn small" data-tw-menu="${esc(t.id)}">…</button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    view.innerHTML = `
      <h1>つぶやき</h1>
      <form id="tw-form" class="card">
        <textarea name="text" placeholder="今の気持ち・体調・気づいたこと" style="min-height:72px"></textarea>
        <div class="moods">${MOODS.map((m, i) => `<button type="button" data-mood="${i + 1}" class="${tweetMood === i + 1 ? "on" : ""}" aria-label="体調 ${i + 1}">${m}</button>`).join("")}</div>
        <div class="mood-caption"><span>つらい</span><span>体調（えらばなくてもOK）</span><span>げんき</span></div>
        <button type="submit" class="btn primary block" style="margin-top:8px">つぶやく</button>
      </form>
      ${moodChart()}
      ${items || `<p class="empty">${EMPTY_BIRD}ひとりごとのように、気軽に書いてください。<br>あとで「伝えたいこと」に入れたり、先生に見せたりできます。</p>`}
    `;
    const form = view.querySelector("#tw-form");
    view.querySelectorAll("[data-mood]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number(b.dataset.mood);
        tweetMood = tweetMood === v ? 0 : v;
        view.querySelectorAll("[data-mood]").forEach((x) => x.classList.toggle("on", Number(x.dataset.mood) === tweetMood));
      }),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text && !tweetMood) return toast("ひとことか、体調の顔を選んでください");
      state.tweets.push({ id: uid(), text, mood: tweetMood, at: new Date().toISOString(), pin: false });
      tweetMood = 0;
      save();
      renderTweets();
    });
    view.querySelectorAll("[data-tw-menu]").forEach((b) => b.addEventListener("click", () => tweetMenu(byId(state.tweets, b.dataset.twMenu))));
  }

  // 直近14日の体調（その日の平均）を棒で表示
  function moodChart() {
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push(P.isoDate(d));
    }
    const byDay = {};
    for (const t of state.tweets) {
      if (!t.mood) continue;
      const day = P.isoDate(new Date(t.at));
      (byDay[day] = byDay[day] || []).push(t.mood);
    }
    if (!days.some((d) => byDay[d])) return "";
    const bars = days
      .map((d) => {
        const list = byDay[d];
        if (!list) return `<i class="none" title="${esc(d)}：記録なし"></i>`;
        const avg = list.reduce((a, b) => a + b, 0) / list.length;
        return `<i style="height:${Math.round((avg / 5) * 100)}%" title="${esc(d)}：${avg.toFixed(1)}"></i>`;
      })
      .join("");
    return `<div class="card"><div class="small muted">この2週間の体調</div><div class="mood-bars">${bars}</div><div class="mood-caption"><span>2週間前</span><span>今日</span></div></div>`;
  }

  function tweetMenu(t) {
    openSheet(
      `<h2>つぶやき</h2>
      <p class="pre card">${t.mood ? MOODS[t.mood - 1] + " " : ""}${esc(t.text)}</p>
      <div style="display:grid;gap:8px">
        <button type="button" class="btn" id="tw-note">「伝えたいこと」に入れる</button>
        <button type="button" class="btn" id="tw-pin">${t.pin ? "先生に見せるのをやめる" : "先生に見せる（最近の体調に載せる）"}</button>
        <button type="button" class="btn danger" id="tw-del">削除</button>
        <button type="button" class="btn" data-close>閉じる</button>
      </div>`,
      (root) => {
        root.querySelector("#tw-note").addEventListener("click", () => {
          closeSheet();
          const d = new Date(t.at);
          editNote(null, { kind: "symptom", text: t.text, since: `${d.getMonth() + 1}月${d.getDate()}日ごろ` });
        });
        root.querySelector("#tw-pin").addEventListener("click", () => {
          t.pin = !t.pin;
          save();
          closeSheet();
          toast(t.pin ? "「先生に見せる」画面に載せます" : "載せないようにしました");
          rerender();
        });
        root.querySelector("#tw-del").addEventListener("click", () =>
          ask("このつぶやきを削除しますか？", "削除する", () => {
            state.tweets = state.tweets.filter((x) => x.id !== t.id);
            save();
            rerender();
          }),
        );
      },
    );
  }

  // ---------- 病院（利用先） ----------

  function renderPlaces() {
    view.innerHTML = `
      <h1>病院・薬局</h1>
      <button type="button" class="btn primary block" id="place-add">＋ 病院・薬局を追加</button>
      <div style="margin-top:12px">${state.places.length ? state.places.map(placeCard).join("") : `<p class="empty">${EMPTY_BIRD}まだありません。<br>Googleマップでコピーした情報を貼り付けると、電話番号やHPを自動で入れます。</p>`}</div>
    `;
    view.querySelector("#place-add").addEventListener("click", () => editPlace());
    view.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => editPlace(byId(state.places, b.dataset.place))));
  }

  function placeCard(p) {
    const mapHref = safeUrl(p.mapUrl) || mapsSearchUrl([p.name, p.address].filter(Boolean).join(" "));
    return `
      <div class="card">
        <div class="row"><span class="place-name grow">${esc(p.name)}</span>${p.dept ? `<span class="tag">${esc(p.dept)}</span>` : ""}</div>
        <dl class="kv">
          ${p.hours ? `<dt>受付時間</dt><dd>${esc(p.hours)}</dd>` : ""}
          ${p.tel ? `<dt>電話</dt><dd>${esc(p.tel)}</dd>` : ""}
          ${p.address ? `<dt>住所</dt><dd>${esc(p.address)}</dd>` : ""}
          ${p.cardNo ? `<dt>診察券</dt><dd>${esc(p.cardNo)}</dd>` : ""}
          ${p.memo ? `<dt>メモ</dt><dd>${esc(p.memo)}</dd>` : ""}
        </dl>
        <div class="place-actions">
          ${p.tel ? `<a class="btn small" href="${esc(telHref(p.tel))}">電話する</a>` : ""}
          ${safeUrl(p.url) ? `<a class="btn small" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">HP</a>` : ""}
          <a class="btn small" href="${esc(mapHref)}" target="_blank" rel="noopener">地図</a>
          <button type="button" class="btn small" data-place="${esc(p.id)}">編集</button>
        </div>
      </div>`;
  }

  function editPlace(place) {
    const p = place || { name: "", dept: "", tel: "", url: "", hours: "", address: "", mapUrl: "", cardNo: "", memo: "" };
    openSheet(
      `<h2>${place ? "病院・薬局を直す" : "病院・薬局を追加"}</h2>
      <form id="place-form">
        <details class="more"${place ? "" : " open"}>
          <summary>Googleの情報を貼り付けて入れる</summary>
          <div class="hint">
            1. 下に病院の名前を入れて「Googleマップで探す」<br>
            2. 病院の情報（住所・営業時間・電話・HP）を長押し／選んでコピー<br>
            3. ここに貼り付けて「振り分ける」
          </div>
          <div class="row" style="margin-bottom:8px">
            <input type="search" id="place-q" placeholder="病院の名前（例：岩出 内科）" value="${esc(p.name)}" class="grow" style="width:auto;flex:1">
          </div>
          <div class="row" style="margin-bottom:8px">
            <a class="btn small grow" id="open-maps" href="#" target="_blank" rel="noopener">Googleマップで探す</a>
            <a class="btn small grow" id="open-google" href="#" target="_blank" rel="noopener">Googleで検索</a>
          </div>
          <textarea id="paste" placeholder="ここにコピーした文を貼り付け"></textarea>
          <button type="button" class="btn block" id="do-parse" style="margin:8px 0 4px">振り分ける</button>
          <p class="small muted" id="parse-result" style="margin:0"></p>
        </details>
        <label class="field"><span>名前</span><input type="text" name="name" value="${esc(p.name)}" required></label>
        <label class="field"><span>診療科・種類</span><input type="text" name="dept" value="${esc(p.dept)}" placeholder="例：内科、歯科、薬局" list="dept-list"></label>
        <datalist id="dept-list">${["内科", "外科", "整形外科", "皮膚科", "眼科", "耳鼻科", "歯科", "婦人科", "小児科", "心療内科", "精神科", "薬局"].map((d) => `<option value="${d}">`).join("")}</datalist>
        <label class="field"><span>電話番号</span><input type="tel" name="tel" value="${esc(p.tel)}"></label>
        <label class="field"><span>ホームページ</span><input type="url" name="url" value="${esc(p.url)}" placeholder="https://"></label>
        <label class="field"><span>営業時間・受付時間</span><textarea name="hours" placeholder="例：月〜金 9:00〜12:00、15:00〜18:00">${esc(p.hours)}</textarea></label>
        <label class="field"><span>住所</span><input type="text" name="address" value="${esc(p.address)}"></label>
        <label class="field"><span>地図のリンク</span><input type="url" name="mapUrl" value="${esc(p.mapUrl)}" placeholder="なければ名前と住所で地図を開きます"></label>
        <label class="field"><span>診察券の番号</span><input type="text" name="cardNo" value="${esc(p.cardNo)}"></label>
        <label class="field"><span>メモ（担当の先生・駐車場・予約の方法など）</span><textarea name="memo">${esc(p.memo)}</textarea></label>
        <div class="sheet-foot">
          ${place ? `<button type="button" class="btn danger" id="place-del">削除</button>` : `<button type="button" class="btn" data-close>やめる</button>`}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`,
      (root) => {
        const form = root.querySelector("#place-form");
        const q = root.querySelector("#place-q");
        const updateLinks = () => {
          const text = q.value.trim() || form.elements.name.value.trim();
          root.querySelector("#open-maps").href = mapsSearchUrl(text || "病院");
          root.querySelector("#open-google").href = "https://www.google.com/search?q=" + encodeURIComponent(text ? text + " 診療時間 電話" : "病院");
        };
        q.addEventListener("input", updateLinks);
        updateLinks();

        root.querySelector("#do-parse").addEventListener("click", () => {
          const r = P.parsePlaceText(root.querySelector("#paste").value);
          const filled = [];
          const labels = { name: "名前", tel: "電話", url: "HP", hours: "営業時間", address: "住所", mapUrl: "地図" };
          for (const key of Object.keys(labels)) {
            if (!r[key]) continue;
            // 名前は空のときだけ入れる（自分で付けた名前を消さない）
            if (key === "name" && form.elements.name.value.trim()) continue;
            form.elements[key].value = r[key];
            filled.push(labels[key]);
          }
          root.querySelector("#parse-result").textContent = filled.length
            ? `入れました：${filled.join("・")}。下で確かめてください。`
            : "うまく読み取れませんでした。下の欄に直接入れてください。";
        });

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.name) return toast("名前を入れてください");
          if (d.url && !/^https?:\/\//i.test(d.url)) d.url = "https://" + d.url;
          if (d.mapUrl && !safeUrl(d.mapUrl)) return toast("地図のリンクは https:// で始まるアドレスを入れてください");
          const fields = { name: d.name, dept: d.dept, tel: d.tel, url: d.url, hours: d.hours, address: d.address, mapUrl: d.mapUrl, cardNo: d.cardNo, memo: d.memo };
          if (place) Object.assign(place, fields);
          else state.places.push({ id: uid(), ...fields });
          save();
          closeSheet();
          toast("保存しました");
          rerender();
        });
        const del = root.querySelector("#place-del");
        if (del)
          del.addEventListener("click", () =>
            ask(`「${place.name}」を削除しますか？`, "削除する", () => {
              state.places = state.places.filter((x) => x.id !== place.id);
              save();
              rerender();
            }),
          );
      },
    );
  }

  // ---------- 緊急情報 ----------

  function renderProfile() {
    const p = state.profile;
    const has = Object.values(p).some(Boolean);
    const contacts = [
      [p.contact1Name, p.contact1Tel],
      [p.contact2Name, p.contact2Tel],
    ].filter(([n, t]) => n || t);
    view.innerHTML = `
      ${backLink}
      <div class="page-head"><h1>緊急情報</h1><button type="button" class="btn small" id="profile-edit">編集</button></div>
      <p class="small muted">急に具合が悪くなったときや、初めての病院で見せられるカードです。</p>
      ${has ? `<div class="card emergency">
        <dl class="kv">
          ${p.name ? `<dt>名前</dt><dd><b>${esc(p.name)}</b></dd>` : ""}
          ${p.birth ? `<dt>生年月日</dt><dd>${esc(P.formatDate(p.birth, false))}</dd>` : ""}
          ${p.blood ? `<dt>血液型</dt><dd>${esc(p.blood)}型</dd>` : ""}
          ${p.allergies ? `<dt>アレルギー</dt><dd><b>${esc(p.allergies)}</b></dd>` : ""}
          ${p.conditions ? `<dt>持病</dt><dd>${esc(p.conditions)}</dd>` : ""}
          ${p.history ? `<dt>病気・手術</dt><dd>${esc(p.history)}</dd>` : ""}
          ${state.meds.some((m) => m.active) ? `<dt>飲んでいる薬</dt><dd>${esc(state.meds.filter((m) => m.active).map((m) => m.name).join("、"))}</dd>` : ""}
          ${p.memo ? `<dt>メモ</dt><dd>${esc(p.memo)}</dd>` : ""}
        </dl>
        ${contacts.length ? `<h3 style="margin-top:12px">緊急連絡先</h3>${contacts.map(([n, t]) => `<div class="row"><span class="grow">${esc(n)}</span>${t ? `<a class="btn small" href="${esc(telHref(t))}">${esc(t)}</a>` : ""}</div>`).join("")}` : ""}
      </div>` : `<p class="empty">${EMPTY_BIRD}まだ登録されていません。「編集」から入れてください。</p>`}
    `;
    view.querySelector("#profile-edit").addEventListener("click", editProfile);
  }

  function editProfile() {
    const p = state.profile;
    const f = (name, label, ph = "", type = "text") => `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(p[name])}" placeholder="${esc(ph)}"></label>`;
    openSheet(
      `<h2>緊急情報を編集</h2>
      <form id="profile-form">
        ${f("name", "名前")}
        <div class="two">
          ${f("birth", "生年月日", "", "date")}
          <label class="field"><span>血液型</span><select name="blood">${["", "A", "B", "O", "AB"].map((b) => `<option value="${b}"${b === p.blood ? " selected" : ""}>${b ? b + "型" : "—"}</option>`).join("")}</select></label>
        </div>
        ${f("allergies", "アレルギー（薬・食べ物）", "例：ペニシリン、そば")}
        ${f("conditions", "持病", "例：ぜんそく、高血圧")}
        <label class="field"><span>これまでの病気・手術</span><textarea name="history">${esc(p.history)}</textarea></label>
        <div class="two">${f("contact1Name", "緊急連絡先1（名前・続柄）", "例：母")}${f("contact1Tel", "電話", "", "tel")}</div>
        <div class="two">${f("contact2Name", "緊急連絡先2", "")}${f("contact2Tel", "電話", "", "tel")}</div>
        <label class="field"><span>メモ（かかりつけ医・保険証の場所など）</span><textarea name="memo">${esc(p.memo)}</textarea></label>
        <div class="sheet-foot">
          <button type="button" class="btn" data-close>やめる</button>
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`,
      (root) =>
        root.querySelector("#profile-form").addEventListener("submit", (e) => {
          e.preventDefault();
          Object.assign(state.profile, formData(e.target));
          save();
          closeSheet();
          toast("保存しました");
          rerender();
        }),
    );
  }

  // ---------- 設定 ----------

  function renderSettings() {
    view.innerHTML = `
      ${backLink}
      <h1>設定</h1>
      ${DEMO ? `<div class="hint">いまはデモです。ここで読み込んだり消したりしても、ページを開き直すと見本データに戻ります。</div>` : ""}
      <h2>バックアップ</h2>
      <div class="card">
        <p class="small" style="margin-top:0">データはこのスマホ（ブラウザ）の中だけに保存されています。ブラウザのデータを消したり、機種を変えたりすると消えるので、ときどき書き出してください。</p>
        <div class="row">
          <button type="button" class="btn grow" id="export">書き出す</button>
          <label class="btn grow">読み込む<input type="file" id="import" accept="application/json,.json" hidden></label>
        </div>
      </div>
      <h2>このアプリについて</h2>
      <div class="card small">
        <p style="margin-top:0">ホーム画面に追加すると、アプリのように開けます（iPhone：共有 → ホーム画面に追加／Android：︙ → ホーム画面に追加）。</p>
        <p style="margin-bottom:0">病院の情報は、Googleマップからコピーした文を貼り付けて入れます（Googleの有料の仕組みは使っていません）。</p>
      </div>
      <h2>すべて消す</h2>
      <div class="card">
        <p class="small" style="margin-top:0">このアプリのデータをすべて消します。元に戻せません。</p>
        <button type="button" class="btn danger" id="wipe">すべて消す</button>
      </div>
    `;
    view.querySelector("#export").addEventListener("click", () => {
      download(`通院ノート_${todayIso()}.json`, JSON.stringify({ app: "tsuuin-note", version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2), "application/json");
      toast("書き出しました");
    });
    view.querySelector("#import").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        e.target.value = "";
        return toast("ファイルが大きすぎます（20MBまで）");
      }
      try {
        const json = JSON.parse(await file.text());
        const data = json && json.app === "tsuuin-note" ? json.data : null;
        if (!data) throw new Error("bad");
        ask("今のデータを、このファイルの内容に置き換えますか？", "置き換える", () => {
          state = merge(defaultState(), data);
          save();
          toast("読み込みました");
          rerender();
        });
      } catch {
        toast("通院ノートのバックアップではないようです");
      }
      e.target.value = "";
    });
    view.querySelector("#wipe").addEventListener("click", () =>
      ask("すべてのデータを消しますか？元に戻せません", "すべて消す", () => {
        state = defaultState();
        save();
        toast("消しました");
        location.hash = "#/";
      }),
    );
  }

  route();
})();
