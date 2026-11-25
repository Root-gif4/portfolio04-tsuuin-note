// 通院ノート：画面に関係しない計算（Googleマップの文の振り分け・日付・お薬の数え方）
// ブラウザでは window.TsuuinParse、node のテストでは require() で使う
(() => {
  "use strict";

  const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const DAY_LINE = /^(?:[月火水木金土日](?:曜日?)?|祝日|祝祭日|祝)(?:[\s・、,～〜\-]|$)/;
  const TIME_RANGE = /\d{1,2}\s*(?:[:：]\s*\d{2}|時\s*(?:\d{1,2}\s*分)?)\s*[～〜~\-－–—]\s*\d{1,2}\s*(?:[:：]\s*\d{2}|時)/;
  const CLOSED = /^(?:定休日|休診|休業|休み|24\s*時間営業)/;
  // 「営業中」「営業時間外 ⋅ 営業開始: 9:00」のような、今の状態を示す行（保存しない）
  const STATUS = /^(?:営業中|営業時間外|まもなく|診療時間外|本日の営業は終了|閉店)/;
  const PHONE = /(?:\+81[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{3,4}|0\d{1,4}[\s-]\d{1,4}[\s-]\d{3,4}|0\d{9,10})/;
  const URL_LIKE = /^(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:[\/?#]\S*)?$/i;
  const MAP_URL = /(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.)/i;
  const ADDRESS = /(?:〒\s*\d{3}-?\d{4}|^(?:日本、)?\s*(?:北海道|東京都|京都府|大阪府|.{2,3}県)\S*?[市区町村郡])/;
  const LABEL = /^(住所|所在地|営業時間|診療時間|受付時間|電話番号?|TEL|Tel|ウェブサイト|ホームページ|HP|URL|サイト)\s*[:：]\s*/;
  // マップのコピーに混ざる、名前ではない行
  const NOISE = /^(?:[\d.,]+|\(\s*[\d,]+\s*\)|★+.*|クチコミ.*|レビュー.*|ルート|保存|共有|付近を検索|スマートフォンに送信|電話|営業中.*|営業時間外.*|まもなく.*|閉店.*|診療時間外.*|写真.*|概要|情報|Plus Code.*|[A-Z0-9]{4}\+[A-Z0-9]{2,}.*|〒?\d{3}-\d{4})$/;

  function cleanLine(line) {
    return String(line)
      .replace(/[​-‏-]/g, "") // マップの記号（私用領域の文字）を消す
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeUrl(text) {
    const t = text.trim();
    if (/^https?:\/\//i.test(t)) return t;
    return "https://" + t;
  }

  function isHoursLine(line) {
    return DAY_LINE.test(line) || TIME_RANGE.test(line) || CLOSED.test(line);
  }

  // Googleマップ・Google検索の「お店の情報」をコピーした文から、項目を取り出す
  function parsePlaceText(text) {
    const result = { name: "", address: "", tel: "", url: "", hours: "", mapUrl: "" };
    const hours = [];
    let labeledHours = false;

    const lines = String(text || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
    for (let raw of lines) {
      let line = raw;
      const label = line.match(LABEL);
      let kind = "";
      if (label) {
        line = line.slice(label[0].length).trim();
        const l = label[1];
        if (/住所|所在地/.test(l)) kind = "address";
        else if (/時間/.test(l)) kind = "hours";
        else if (/電話|TEL|Tel/.test(l)) kind = "tel";
        else kind = "url";
        if (!line) {
          if (kind === "hours") labeledHours = true;
          continue;
        }
      }

      if (!kind && STATUS.test(line)) continue;

      const urlMatch = line.match(/https?:\/\/\S+/);
      if (MAP_URL.test(line) && urlMatch) {
        if (!result.mapUrl) result.mapUrl = urlMatch[0];
        continue;
      }
      if (kind === "tel" || (!kind && PHONE.test(line) && line.replace(PHONE, "").replace(/[\s()（）電話番号:：]/g, "").length <= 2)) {
        const m = line.match(PHONE);
        if (m && !result.tel) result.tel = m[0].replace(/\s/g, "-");
        continue;
      }
      if (kind === "url" || (!kind && (urlMatch || URL_LIKE.test(line)))) {
        if (!result.url) result.url = normalizeUrl(urlMatch ? urlMatch[0] : line);
        continue;
      }
      if (kind === "address" || (!kind && ADDRESS.test(line))) {
        if (!result.address) result.address = line.replace(/^日本、\s*/, "");
        continue;
      }
      if (kind === "hours" || isHoursLine(line) || (labeledHours && TIME_RANGE.test(line))) {
        hours.push(line);
        continue;
      }
      if (!result.name && !NOISE.test(line) && line.length <= 60) {
        result.name = line;
      }
    }

    result.hours = joinHours(hours);
    return result;
  }

  // 「月曜日」「9時00分～12時30分」のように曜日と時間が別の行なら1行にまとめる
  function joinHours(lines) {
    const out = [];
    let waitingTime = false; // 直前の行が曜日だけだった
    for (const line of lines) {
      const startsWithDay = DAY_LINE.test(line);
      const dayOnly = startsWithDay && !TIME_RANGE.test(line) && !/休|定休/.test(line);
      if (dayOnly) {
        out.push(line);
        waitingTime = true;
      } else if (waitingTime) {
        out[out.length - 1] += " " + line;
        waitingTime = false;
      } else if (!startsWithDay && out.length) {
        out[out.length - 1] += "、" + line; // 午前・午後のように2つ目の時間
      } else {
        out.push(line);
      }
    }
    return out.join("\n");
  }

  // ---------- 日付 ----------

  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function parseIso(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function formatDate(iso, withDay = true) {
    const d = parseIso(iso);
    if (!d) return "";
    const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return withDay ? `${base}（${DAYS[d.getDay()]}）` : base;
  }

  // 今日から見て何日後か（今日=0、過ぎていれば負）
  function daysUntil(iso, today = new Date()) {
    const d = parseIso(iso);
    if (!d) return null;
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((d - t) / 86400000);
  }

  // ---------- お薬 ----------

  const TIMINGS = [
    ["morning", "朝"],
    ["noon", "昼"],
    ["evening", "夕"],
    ["bed", "寝る前"],
  ];

  // その日に飲むお薬（頓服は数えない）と、飲んだ数
  function medProgress(meds, log, iso) {
    const day = (log && log[iso]) || {};
    let total = 0;
    let done = 0;
    for (const med of meds) {
      if (!med.active) continue;
      if (med.start && med.start > iso) continue;
      if (med.end && med.end < iso) continue;
      for (const [key] of TIMINGS) {
        if (!(med.timings || []).includes(key)) continue;
        total++;
        if ((day[med.id] || []).includes(key)) done++;
      }
    }
    return { total, done };
  }

  // 「1錠」「0.5 包」のような量を数字と単位に分ける（数字がなければ単位なしで返す）
  function parseDose(text) {
    const m = String(text || "").trim().match(/^([\d.]+)\s*(.*)$/);
    return m ? { num: m[1], unit: m[2] } : { num: "", unit: "" };
  }

  // 処方された数から飲み終わりの日を出す（飲み始めの日を1日目として数える）
  function calcEndDate(start, total, perDose, timesPerDay) {
    const s = parseIso(start);
    const t = Number(total);
    const perDay = Number(perDose) * Number(timesPerDay);
    if (!s || !(t > 0) || !(perDay > 0)) return null;
    const days = Math.ceil(t / perDay);
    const end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + days - 1);
    return { end: isoDate(end), days, perDay };
  }

  // 同じお薬がまた処方されたときの、次の飲み始め・飲み終わり
  // 前の分がまだ残っていれば（飲み終わりが受診日以降）その次の日から、なければ受診日から飲み始める
  function renewMed(med, visitDate) {
    const end = parseIso(med.end);
    let start = visitDate;
    if (end && med.end >= visitDate) start = isoDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1));
    const perDose = med.doseNum || parseDose(med.dose).num;
    const calc = calcEndDate(start, med.total, perDose, (med.timings || []).length);
    if (calc) return { start, end: calc.end, total: med.total };
    // 数がわからなければ、前回と同じ日数分にする
    const s0 = parseIso(med.start);
    if (s0 && end) {
      const days = Math.round((end - s0) / 86400000);
      const s1 = parseIso(start);
      return { start, end: isoDate(new Date(s1.getFullYear(), s1.getMonth(), s1.getDate() + days)), total: med.total || "" };
    }
    return { start, end: "", total: med.total || "" };
  }

  // 「朝食後 8:00」のような、飲むときの言い方
  function slotLabel(key, meal, time) {
    const base = (TIMINGS.find(([k]) => k === key) || [])[1] || "";
    let text = base;
    if (key !== "bed" && meal) text = meal === "食後" || meal === "食前" ? base + meal : `${base}（${meal}）`;
    return time ? `${text} ${time.replace(/^0(\d)/, "$1")}` : text;
  }

  function medScheduleText(med) {
    const parts = TIMINGS.filter(([k]) => (med.timings || []).includes(k)).map(([k]) => {
      const meal = med.slotMeal && k in med.slotMeal ? med.slotMeal[k] : med.meal;
      return slotLabel(k, meal, (med.slotTime || {})[k]);
    });
    const out = [];
    if (parts.length) out.push(parts.join("・"));
    if (med.prn) out.push("頓服（必要なとき）");
    return out.join("／");
  }

  // 次回予約をカレンダーに入れるための .ics ファイルの中身
  function buildIcs({ title, date, time, location, memo, uid }) {
    const d = String(date).replace(/-/g, "");
    const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tsuuin-note//JA", "BEGIN:VEVENT", `UID:${uid}@tsuuin-note`];
    const now = new Date();
    lines.push(`DTSTAMP:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`);
    if (time) {
      const [h, m] = time.split(":").map(Number);
      const endH = h + 1;
      lines.push(`DTSTART:${d}T${pad(h)}${pad(m)}00`, `DTEND:${d}T${pad(endH % 24)}${pad(m)}00`);
    } else {
      const next = parseIso(date);
      next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${isoDate(next).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(title)}`);
    if (location) lines.push(`LOCATION:${esc(location)}`);
    if (memo) lines.push(`DESCRIPTION:${esc(memo)}`);
    lines.push("BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "END:VALARM");
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }

  const api = { parsePlaceText, joinHours, isoDate, parseIso, formatDate, daysUntil, TIMINGS, medProgress, parseDose, calcEndDate, renewMed, slotLabel, medScheduleText, buildIcs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.TsuuinParse = api;
})();
