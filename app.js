const APP_KEY_PREFIX = "kidslog_";
let classMaster = [];
let childMaster = [];
let selectedClassId = "";
let selectedMode = "in";
let currentContext = null;

const el = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  setupTabs();
  setupEventHandlers();
  await loadChildMaster();
  applyDefaultModeByTime();
  renderTodayLabel();
  renderClassSelect();
  renderChildrenList();
  setupAdminButtons();
});

function cacheElements() {
  el.todayLabel = document.getElementById("today-label");
  el.classSelect = document.getElementById("class-select");
  el.childrenList = document.getElementById("children-list");
  el.parentScreen = document.getElementById("parent-screen");
  el.parentClass = document.getElementById("parent-class");
  el.parentName = document.getElementById("parent-name");
  el.parentActionBtn = document.getElementById("parent-action-btn");
  el.parentCancelBtn = document.getElementById("parent-cancel-btn");
  el.resultDialog = document.getElementById("result-dialog");
  el.dialogChildName = document.getElementById("dialog-child-name");
  el.dialogTime = document.getElementById("dialog-time");
  el.dialogMessage = document.getElementById("dialog-message");
  el.dialogOkBtn = document.getElementById("dialog-ok-btn");
  el.restoreFile = document.getElementById("restore-file");
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`tab-${button.dataset.tab}`).classList.add("active");
      if (button.dataset.tab === "record") {
        renderTodayLabel();
        renderChildrenList();
      }
    });
  });
}

function setupEventHandlers() {
  el.classSelect.addEventListener("change", (e) => {
    selectedClassId = e.target.value;
    renderChildrenList();
  });

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      selectedMode = e.target.value;
    });
  });

  el.parentCancelBtn.addEventListener("click", closeParentScreen);
  el.parentActionBtn.addEventListener("click", submitCurrentRecord);
  el.dialogOkBtn.addEventListener("click", () => {
    hideOverlay(el.resultDialog);
    currentContext = null;
    renderChildrenList();
  });
}

async function loadChildMaster() {
  const response = await fetch("./child.json");
  const data = await response.json();
  classMaster = Array.isArray(data.classes) ? data.classes.slice() : [];
  childMaster = Array.isArray(data.children) ? data.children.slice() : [];
  childMaster.sort((a, b) => {
    if (a.classId !== b.classId) return a.classId.localeCompare(b.classId, "ja");
    return Number(a.no || 0) - Number(b.no || 0);
  });
  selectedClassId = classMaster[0] ? classMaster[0].id : "";
}

function applyDefaultModeByTime() {
  const now = new Date();
  selectedMode = now.getHours() < 12 ? "in" : "out";
  const target = document.querySelector(`input[name="mode"][value="${selectedMode}"]`);
  if (target) target.checked = true;
}

function renderTodayLabel() {
  const now = new Date();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  el.todayLabel.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekday}）`;
}

function renderClassSelect() {
  el.classSelect.innerHTML = classMaster
    .map((cls) => `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`)
    .join("");
  el.classSelect.value = selectedClassId;
}

function renderChildrenList() {
  const todayKey = getDateKey(new Date());
  const dayData = loadDayData(todayKey);
  const rows = getChildrenByClass(selectedClassId).map((child) => {
    const record = findRecordById(dayData, child.id);
    const status = getStatusSymbol(record);
    const disabled = status === "●";
    const label = `${String(child.no).padStart(2, "0")}　${child.name}`;

    return `
      <div class="child-row">
        <div class="child-status">${status}</div>
        <div class="child-no">${escapeHtml(String(child.no))}</div>
        <button class="child-btn" ${disabled ? "disabled" : ""} onclick="openParentScreen('${escapeJs(child.id)}')">${escapeHtml(child.name)}</button>
      </div>
    `;
  });

  el.childrenList.innerHTML = rows.length > 0 ? rows.join("") : `<div class="child-row"><div class="child-status"></div><div class="child-no"></div><div>園児がいません</div></div>`;
}

function getChildrenByClass(classId) {
  return childMaster.filter((child) => child.classId === classId).sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function openParentScreen(childId) {
  const child = childMaster.find((item) => item.id === childId);
  if (!child) return;

  currentContext = {
    child,
    mode: selectedMode
  };

  el.parentClass.textContent = `${child.className}組`;
  el.parentName.textContent = getDisplayName(child);
  el.parentActionBtn.textContent = selectedMode === "in" ? "登園" : "降園";
  el.parentActionBtn.classList.toggle("mode-in", selectedMode === "in");
  el.parentActionBtn.classList.toggle("mode-out", selectedMode === "out");
  showOverlay(el.parentScreen);
}

function closeParentScreen() {
  hideOverlay(el.parentScreen);
  currentContext = null;
}

function submitCurrentRecord() {
  if (!currentContext) return;

  const now = new Date();
  const dateKey = getDateKey(now);
  const time = formatTime(now);
  const dayData = loadDayData(dateKey);
  const child = currentContext.child;
  const mode = currentContext.mode;
  let record = findRecordById(dayData, child.id);

  if (!record) {
    record = {
      date: formatDateKeyForCsv(dateKey),
      id: child.id,
      name: child.name,
      clock_in: "",
      clock_out: ""
    };
    dayData.records.push(record);
  }

  if (mode === "in") {
    record.clock_in = time;
  } else {
    record.clock_out = time;
  }

  saveDayData(dateKey, dayData);
  closeParentScreen();
  showResultDialog(child, mode, time, record);
}

function showResultDialog(child, mode, time, record) {
  el.dialogChildName.textContent = getDisplayName(child);
  el.dialogTime.textContent = time;

  let message = mode === "in" ? "登園時間を記録しました" : "降園時間を記録しました";
  if (mode === "out" && !record.clock_in) {
    message = "登園の記録がありませんが、\n降園を記録しました";
  }

  el.dialogMessage.textContent = message;
  showOverlay(el.resultDialog);
}

function setupAdminButtons() {
  document.getElementById("backup-btn").addEventListener("click", backupCsv);
  document.getElementById("restore-btn").addEventListener("click", () => el.restoreFile.click());
  document.getElementById("restore-file").addEventListener("change", restoreCsv);
  document.getElementById("delete-btn").addEventListener("click", deleteAllData);
}

function loadDayData(dateKey) {
  const raw = localStorage.getItem(APP_KEY_PREFIX + dateKey);
  if (!raw) return { records: [] };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { records: [] };
    if (!Array.isArray(parsed.records)) parsed.records = [];
    parsed.records = parsed.records.map(normalizeRecord);
    return parsed;
  } catch (error) {
    return { records: [] };
  }
}

function saveDayData(dateKey, data) {
  localStorage.setItem(APP_KEY_PREFIX + dateKey, JSON.stringify({
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : []
  }));
}

function normalizeRecord(record) {
  const safe = record && typeof record === "object" ? record : {};
  return {
    date: normalizeCsvDateText(safe.date) || formatDateKeyForCsv(getDateKey(new Date())),
    id: String(safe.id || "").trim(),
    name: String(safe.name || "").trim(),
    clock_in: normalizeTimeText(safe.clock_in),
    clock_out: normalizeTimeText(safe.clock_out)
  };
}

function findRecordById(dayData, id) {
  return Array.isArray(dayData.records) ? dayData.records.find((record) => record.id === id) || null : null;
}

function getStatusSymbol(record) {
  if (!record) return "";
  const hasIn = Boolean(record.clock_in);
  const hasOut = Boolean(record.clock_out);
  if (hasIn && hasOut) return "●";
  if (hasIn || hasOut) return "▲";
  return "";
}

async function backupCsv() {
  try {
    const zip = new JSZip();
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(APP_KEY_PREFIX)).sort();
    keys.forEach((storageKey) => {
      const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
      const dayData = loadDayData(dateKey);
      zip.file(`${storageKey}.csv`, buildCsvText(dateKey, dayData));
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kidslog_backup.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert("バックアップに失敗しました");
  }
}

function buildCsvText(dateKey, dayData) {
  const header = ["date", "id", "name", "clock_in", "clock_out"];
  const csvDate = formatDateKeyForCsv(dateKey);
  const lines = [header.map(toCsvCell).join(",")];
  const sortedRecords = (dayData.records || []).slice().sort((a, b) => a.id.localeCompare(b.id, "ja"));
  sortedRecords.forEach((record) => {
    lines.push([csvDate, record.id, record.name, record.clock_in, record.clock_out].map(toCsvCell).join(","));
  });
  return "\uFEFF" + lines.join("\r\n");
}

async function restoreCsv(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const zip = await JSZip.loadAsync(file);
    const jobs = [];

    zip.forEach((path, fileEntry) => {
      if (fileEntry.dir || !path.toLowerCase().endsWith(".csv")) return;
      jobs.push(fileEntry.async("string").then((text) => {
        const storageKey = path.replace(/^.*\//, "").replace(/\.csv$/i, "");
        if (!storageKey.startsWith(APP_KEY_PREFIX)) return;
        const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
        saveDayData(dateKey, parseCsvTextToDayData(text, dateKey));
      }));
    });

    await Promise.all(jobs);
    e.target.value = "";
    renderChildrenList();
    alert("復元完了");
  } catch (error) {
    console.error(error);
    e.target.value = "";
    alert("復元に失敗しました");
  }
}

function parseCsvTextToDayData(csvText, fallbackDateKey) {
  const rows = parseCsvRows(csvText);
  const dayData = { records: [] };
  if (rows.length === 0) return dayData;

  const header = rows[0].map((v) => normalizeHeader(v));
  const colIndex = {
    date: header.indexOf("date"),
    id: header.indexOf("id"),
    name: header.indexOf("name"),
    clockIn: header.indexOf("clock_in"),
    clockOut: header.indexOf("clock_out")
  };

  const normalizedFallbackDateKey = normalizeCsvDateToKey(fallbackDateKey) || fallbackDateKey;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && String(row[0] || "").trim() === "") continue;
    const id = cleanCsvText(getCsvValue(row, colIndex.id));
    if (!id) continue;

    const rowDateKey = normalizeCsvDateToKey(cleanCsvText(getCsvValue(row, colIndex.date))) || normalizedFallbackDateKey;
    if (rowDateKey !== normalizedFallbackDateKey) continue;

    dayData.records.push(normalizeRecord({
      date: formatDateKeyForCsv(normalizedFallbackDateKey),
      id,
      name: cleanCsvText(getCsvValue(row, colIndex.name)),
      clock_in: getCsvValue(row, colIndex.clockIn),
      clock_out: getCsvValue(row, colIndex.clockOut)
    }));
  }

  return dayData;
}

function parseCsvRows(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === "," && !inQuotes) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" && !inQuotes) { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function deleteAllData() {
  if (!confirm("全データ削除しますか")) return;
  Object.keys(localStorage).filter((key) => key.startsWith(APP_KEY_PREFIX)).forEach((key) => localStorage.removeItem(key));
  renderChildrenList();
}

function normalizeHeader(value) { return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase(); }
function getCsvValue(row, index) { return index < 0 || index >= row.length ? "" : (row[index] || ""); }
function cleanCsvText(value) { return String(value ?? "").replace(/^\uFEFF/, "").trim(); }
function toCsvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function normalizeTimeText(value) {
  const text = cleanCsvText(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}
function normalizeCsvDateToKey(value) {
  const text = cleanCsvText(value).replace(/[.\-]/g, "/").replace(/\s+/g, "");
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
function normalizeCsvDateText(value) {
  const key = normalizeCsvDateToKey(value);
  return key ? formatDateKeyForCsv(key) : "";
}
function formatDateKeyForCsv(dateKey) {
  const key = normalizeCsvDateToKey(dateKey);
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}
function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatTime(date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function getDisplayName(child) { return `${child.name}${child.gender === "m" ? "くん" : "ちゃん"}`; }
function showOverlay(target) { target.classList.remove("hidden"); }
function hideOverlay(target) { target.classList.add("hidden"); }
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeJs(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
window.openParentScreen = openParentScreen;
