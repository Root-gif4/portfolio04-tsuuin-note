// 実行：node --test tsuuin/parse.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePlaceText, formatDate, daysUntil, medProgress, parseDose, calcEndDate, renewMed, medScheduleText, buildIcs } = require("./parse.js");

test("Googleマップ（PC）の情報欄をコピーした文を振り分ける", () => {
  const text = [
    "みどり内科クリニック",
    "4.1",
    "(86)",
    "内科",
    "ルート",
    "保存",
    "〒649-6200 和歌山県岩出市中黒1-2-3",
    "営業時間外 ⋅ 営業開始: 9:00",
    "月曜日",
    "9時00分～12時30分",
    "15時00分～18時30分",
    "火曜日",
    "9時00分～12時30分",
    "日曜日",
    "定休日",
    "midori-clinic.example.jp",
    "0736-12-3456",
    "XXXX+XX 岩出市、和歌山県",
  ].join("\n");
  const r = parsePlaceText(text);
  assert.equal(r.name, "みどり内科クリニック");
  assert.equal(r.address, "〒649-6200 和歌山県岩出市中黒1-2-3");
  assert.equal(r.tel, "0736-12-3456");
  assert.equal(r.url, "https://midori-clinic.example.jp");
  assert.equal(
    r.hours,
    "月曜日 9時00分～12時30分、15時00分～18時30分\n火曜日 9時00分～12時30分\n日曜日 定休日",
  );
});

test("Google検索の「住所: 」のような見出し付きの文を振り分ける", () => {
  const text = [
    "さくら歯科医院",
    "住所: 和歌山県和歌山市本町2-1",
    "営業時間: 9:00～19:00",
    "電話: 073-123-4567",
    "ウェブサイト: https://sakura-dental.example.com/",
    "https://maps.app.goo.gl/abcdEFGH",
  ].join("\n");
  const r = parsePlaceText(text);
  assert.equal(r.name, "さくら歯科医院");
  assert.equal(r.address, "和歌山県和歌山市本町2-1");
  assert.equal(r.hours, "9:00～19:00");
  assert.equal(r.tel, "073-123-4567");
  assert.equal(r.url, "https://sakura-dental.example.com/");
  assert.equal(r.mapUrl, "https://maps.app.goo.gl/abcdEFGH");
});

test("スマホの「共有」で送られる名前とリンクだけでも使える", () => {
  const r = parsePlaceText("岩出中央病院\nhttps://maps.app.goo.gl/xyz123");
  assert.equal(r.name, "岩出中央病院");
  assert.equal(r.mapUrl, "https://maps.app.goo.gl/xyz123");
  assert.equal(r.url, "");
});

test("曜日と時間が1行のときはそのまま並べる", () => {
  const r = parsePlaceText("月・火・木・金 9:00～12:00、16:00～19:00\n水・土 9:00～12:00\n日・祝 休診");
  assert.equal(r.hours, "月・火・木・金 9:00～12:00、16:00～19:00\n水・土 9:00～12:00\n日・祝 休診");
  assert.equal(r.name, "");
});

test("日付の表示と、あと何日か", () => {
  assert.equal(formatDate("2026-11-02"), "2026年11月2日（月）");
  assert.equal(daysUntil("2026-11-02", new Date(2026, 9, 30, 15, 0)), 3);
  assert.equal(daysUntil("2026-10-30", new Date(2026, 9, 30, 23, 59)), 0);
});

test("今日のお薬の数（頓服・やめた薬・期間外は数えない）", () => {
  const meds = [
    { id: "a", active: true, timings: ["morning", "evening"] },
    { id: "b", active: true, timings: ["bed"], prn: true },
    { id: "c", active: false, timings: ["morning"] },
    { id: "d", active: true, timings: [] },
    { id: "e", active: true, timings: ["noon"], end: "2026-10-01" },
  ];
  const log = { "2026-10-30": { a: ["morning"] } };
  assert.deepEqual(medProgress(meds, log, "2026-10-30"), { total: 3, done: 1 });
});

test("次回予約の .ics（時刻あり）", () => {
  const ics = buildIcs({ title: "通院：みどり内科", date: "2026-11-02", time: "09:30", location: "岩出市, 中黒", uid: "x1" });
  assert.match(ics, /DTSTART:20261102T093000/);
  assert.match(ics, /DTEND:20261102T103000/);
  assert.match(ics, /LOCATION:岩出市\\, 中黒/);
});

test("1回の量を数字と単位に分ける", () => {
  assert.deepEqual(parseDose("1錠"), { num: "1", unit: "錠" });
  assert.deepEqual(parseDose("0.5 包"), { num: "0.5", unit: "包" });
  assert.deepEqual(parseDose("適量"), { num: "", unit: "" });
});

test("処方された数から飲み終わりを出す", () => {
  // 21錠、1回1錠、1日3回 → 7日分。11/3 から飲むと 11/9 まで
  assert.deepEqual(calcEndDate("2026-11-03", 21, 1, 3), { end: "2026-11-09", days: 7, perDay: 3 });
  // 割り切れないときは最後の日まで数える（10錠を1日3錠 → 4日目に1錠）
  assert.equal(calcEndDate("2026-11-03", 10, 1, 3).end, "2026-11-06");
  // 月をまたぐ
  assert.equal(calcEndDate("2026-11-25", 28, 2, 2).end, "2026-12-01");
  // 足りない情報があれば出さない
  assert.equal(calcEndDate("2026-11-03", 21, "", 3), null);
  assert.equal(calcEndDate("2026-11-03", 21, 1, 0), null);
  assert.equal(calcEndDate("", 21, 1, 3), null);
});

test("飲むときの言い方", () => {
  const med = { timings: ["morning", "evening", "bed"], slotMeal: { morning: "食前", evening: "食後" }, slotTime: { morning: "07:30", bed: "22:00" } };
  assert.equal(medScheduleText(med), "朝食前 7:30・夕食後・寝る前 22:00");
  // 前の形（全体で1つの食後）でも読める
  assert.equal(medScheduleText({ timings: ["morning", "noon"], meal: "食後", prn: true }), "朝食後・昼食後／頓服（必要なとき）");
  assert.equal(medScheduleText({ timings: ["noon"], slotMeal: { noon: "食間" } }), "昼（食間）");
});

test("同じお薬がまた処方されたとき", () => {
  const med = { start: "2026-11-03", end: "2026-11-09", total: "21", doseNum: "1", timings: ["morning", "noon", "evening"] };
  // まだ残っている（受診日 11/8 ≦ 飲み終わり 11/9）→ 11/10 から 7日分
  assert.deepEqual(renewMed(med, "2026-11-08"), { start: "2026-11-10", end: "2026-11-16", total: "21" });
  // もう飲み終わっている → 受診日から
  assert.deepEqual(renewMed(med, "2026-11-12"), { start: "2026-11-12", end: "2026-11-18", total: "21" });
  // 数がない前の形のお薬は、前回と同じ日数分（11/1〜11/7 の7日間）
  const old = { start: "2026-11-01", end: "2026-11-07", dose: "1錠", timings: ["morning"] };
  assert.deepEqual(renewMed(old, "2026-11-10"), { start: "2026-11-10", end: "2026-11-16", total: "" });
  // 期間がまったくわからなければ飲み始めだけ
  assert.deepEqual(renewMed({ timings: [] }, "2026-11-10"), { start: "2026-11-10", end: "", total: "" });
});
