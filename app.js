const STORAGE_KEY = "yokai-sales-ledger-v2";
const SYNC_CONFIG_KEY = "yokai-sales-sync-config-v1";
const PERSONAL_SYNC_ID_KEY = "yokai-sales-personal-sync-id-v1";
const AUTH_SESSION_KEY = "yokai-sales-auth-session-v1";
const LOCAL_BACKUP_KEY = "yokai-sales-ledger-backup-before-cloud-v1";
const STORAGE_SCHEMA_VERSION = 1;

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const colors = {
  red: ["#e95464", "#cf3d4e", "#fff5f7", "#ffe5eb", "#8f2d39"],
  pink: ["#f4b3c2", "#e58da4", "#fff8fb", "#ffeef4", "#8a5262"],
  orange: ["#ee7948", "#d96032", "#fff6f1", "#ffe8dd", "#8d4429"],
  yellow: ["#ffdb4f", "#e6bd2e", "#fffbea", "#fff2ba", "#7b661c"],
  lime: ["#c7dc68", "#a9bf48", "#fbfff0", "#f1facd", "#61712e"],
  green: ["#68be8d", "#49a572", "#f2fff8", "#ddf7e8", "#366b50"],
  cyan: ["#c1e4e9", "#83c9d3", "#f4fdff", "#e4f7fa", "#4f7780"],
  blue: ["#274a78", "#1e395d", "#f1f6ff", "#dde8fb", "#223956"],
  purple: ["#7058a3", "#574285", "#f7f3ff", "#e9e1fb", "#473769"],
  black: ["#595857", "#403f3e", "#f7f7f6", "#e9e7e5", "#3f3e3d"],
  white: ["#f7fcfe", "#d8d6d2", "#ffffff", "#f3f1ec", "#5f5d59"],
  gold: ["#b9a46a", "#8f7d4b", "#fbf7ec", "#ede3c7", "#6f623b"],
  silver: ["#aeb4b7", "#858d91", "#f8fafb", "#e3e7e9", "#596267"],
};

const metricLabels = {
  attendance: "動員数",
  cheki: "チェキ枚数",
  newFans: "新規動員数",
  newPhoto: "新規写メ枚数",
  online: "オンラインチェキ券枚数",
};

const pages = {
  sales: "売上登録",
  monthly: "月間成績",
  annual: "年間成績",
  products: "商品登録",
  settings: "設定",
  data: "データ",
};

const state = loadState();
const syncConfig = loadSyncConfig();
let authSession = loadAuthSession();
let syncInterval = null;
let syncSaveTimer = null;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.getElementById("mobileMenuButton")?.addEventListener("click", toggleMobileMenu);

document.querySelectorAll("[data-step-target]").forEach((button) => {
  button.addEventListener("click", () => adjustStepper(button));
});

document.getElementById("sampleButton")?.addEventListener("click", addSampleData);
document.getElementById("exportSalesCsv")?.addEventListener("click", exportSalesCsv);
document.getElementById("exportJson").addEventListener("click", exportJson);
document.getElementById("importJson").addEventListener("change", importJson);
document.getElementById("clearData").addEventListener("click", clearData);
document.getElementById("authForm").addEventListener("submit", signIn);
document.getElementById("signUpButton").addEventListener("click", signUp);
document.getElementById("signOutButton").addEventListener("click", signOut);
document.getElementById("syncForm").addEventListener("submit", saveSyncSettings);
document.getElementById("pullCloud").addEventListener("click", pullCloud);
document.getElementById("pushCloud").addEventListener("click", () => pushCloud(true));
document.getElementById("monthFilter").addEventListener("change", render);
document.getElementById("monthlyGoalForm").addEventListener("submit", saveMonthlyGoal);
document.getElementById("annualYear").addEventListener("change", render);
document.getElementById("detailMode").addEventListener("change", render);
document.getElementById("detailMonth").addEventListener("change", render);
document.getElementById("detailYear").addEventListener("change", render);
document.getElementById("detailDay").addEventListener("change", render);
document.querySelectorAll("form").forEach((form) => form.addEventListener("keydown", preventEnterSubmit));

document.getElementById("liveSaleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const venue = form.get("venue").trim();
  const eventName = form.get("eventName").trim();
  if (!venue && !eventName) {
    alert("会場名かイベント名のどちらかを入力してください。");
    return;
  }
  addSale({
    channel: "live",
    date: form.get("date"),
    venue,
    eventName,
    productId: form.get("productId"),
    attendance: Number(form.get("attendance")),
    newFans: Number(form.get("newFans") || 0),
    newPhoto: Number(form.get("newPhoto") || 0),
    quantity: Number(form.get("quantity")),
    note: form.get("note").trim(),
  });
  event.target.reset();
  resetSaleForm(event.target);
  event.target.elements.attendance.value = 0;
  event.target.elements.newFans.value = 0;
  event.target.elements.newPhoto.value = 0;
  event.target.elements.quantity.value = 1;
});

document.getElementById("onlineSaleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  addSale({
    channel: "online",
    date: form.get("date"),
    venue: "",
    eventName: "",
    productId: form.get("productId"),
    quantity: Number(form.get("quantity")),
    note: form.get("note").trim(),
  });
  event.target.reset();
  resetSaleForm(event.target);
  event.target.elements.quantity.value = 1;
});

document.getElementById("otherSaleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  addSale({
    channel: "other",
    date: form.get("date"),
    venue: "",
    eventName: "",
    productId: form.get("productId"),
    quantity: Number(form.get("quantity")),
    amountOverride: optionalNumber(form.get("amountOverride")),
    note: form.get("note").trim(),
  });
  event.target.reset();
  resetSaleForm(event.target);
  event.target.elements.quantity.value = 1;
});

document.getElementById("productForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  state.products.push({
    id: id(),
    channel: form.get("channel"),
    name: form.get("name").trim(),
    price: Number(form.get("price")),
    ticketValue: Number(form.get("ticketValue")),
  });
  event.target.reset();
  event.target.elements.price.value = 1500;
  event.target.elements.ticketValue.value = 1;
  saveAndRender();
});

document.getElementById("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  state.settings.backTiers = parseTiers(form.get("backTiers"));
  saveAndRender();
});

render();
startAutoSync();
showFileModeWarning();
initPullToRefresh();
restoreAuthOnLoad();

function loadState() {
  const fallback = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    sales: [],
    products: [],
    settings: {
      backRate: 50,
      backTiers: defaultBackTiers(),
      color: "green",
      monthlyGoals: {},
    },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    const migrated = migrateLegacy(saved);
    const loaded = {
      ...fallback,
      ...migrated,
      settings: { ...fallback.settings, ...(migrated.settings || {}) },
    };
    loaded.schemaVersion = STORAGE_SCHEMA_VERSION;
    if (!loaded.settings.backTiers) {
      loaded.settings.backTiers = loaded.settings.backRule?.tiers?.length ? loaded.settings.backRule.tiers : defaultBackTiers();
    }
    loaded.settings.monthlyGoals = loaded.settings.monthlyGoals || {};
    loaded.sales = (loaded.sales || []).map((sale) => ({
      ...sale,
      amountOverride: optionalNumber(sale.amountOverride),
      attendance: Number(sale.attendance || 0),
      newFans: Number(sale.newFans || 0),
      newPhoto: Number(sale.newPhoto || 0),
    }));
    return loaded;
  } catch {
    return fallback;
  }
}

function loadSyncConfig() {
  const personalSyncId = getPersonalSyncId();
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)) || {
      url: "",
      anonKey: "",
      syncId: personalSyncId,
      autoSync: "on",
    };
    return {
      url: normalizeSupabaseUrl(saved.url),
      anonKey: saved.anonKey || "",
      syncId: saved.syncId && saved.syncId !== "100-yokai-main" ? saved.syncId : personalSyncId,
      autoSync: saved.autoSync || "on",
    };
  } catch {
    return { url: "", anonKey: "", syncId: personalSyncId, autoSync: "on" };
  }
}

function loadAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function saveAuthSession(session) {
  authSession = session;
  if (session) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_SESSION_KEY);
}

function getPersonalSyncId() {
  const saved = localStorage.getItem(PERSONAL_SYNC_ID_KEY);
  if (saved) return saved;
  const random = crypto.randomUUID().slice(0, 8);
  const syncId = `100-yokai-${random}`;
  localStorage.setItem(PERSONAL_SYNC_ID_KEY, syncId);
  return syncId;
}

function normalizeSupabaseUrl(rawUrl) {
  const text = String(rawUrl || "").trim();
  if (!text) return "";
  const withProtocol = /^https?:\/\//.test(text) ? text : `https://${text}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return text.replace(/\/rest\/v1.*$/, "").replace(/\/+$/, "");
  }
}

function migrateLegacy(saved) {
  if (saved.sales?.some((sale) => sale.channel)) return saved;
  if (!saved.ledgerEntries && !saved.products) return saved;

  const products = (saved.products || []).map((product) => ({
    id: product.id || id(),
    channel: product.channel || "live",
    name: product.name,
    price: Number(product.price || 0),
    ticketValue: Number(product.ticketValue ?? 1),
  }));

  const sales = (saved.ledgerEntries || []).map((entry) => {
    const product = ensureMigrationProduct(products, entry.venue?.includes("オンライン") ? "online" : "live", entry.venue || "売上");
    return {
      id: entry.id || id(),
      channel: product.channel,
      date: entry.date,
      venue: product.channel === "live" ? entry.venue : "",
      eventName: "",
      productId: product.id,
      attendance: 0,
      newFans: 0,
      newPhoto: 0,
      quantity: Number(entry.count || 1),
      note: entry.note || "",
      createdAt: entry.createdAt || new Date().toISOString(),
    };
  });

  return { sales, products, settings: saved.settings };
}

function ensureMigrationProduct(products, channel, name) {
  const existing = products.find((product) => product.channel === channel && product.name === name);
  if (existing) return existing;
  const product = { id: id(), channel, name, price: 0, ticketValue: 1 };
  products.push(product);
  return product;
}

function saveAndRender(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (!options.silent) showSaveToast("保存しました");
  if (!options.skipCloud && shouldAutoSync()) {
    queueCloudSave();
  }
}

function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tab);
  });
  document.getElementById("pageTitle").textContent = pages[tab];
  closeMobileMenu();
}

function toggleMobileMenu() {
  const isOpen = document.body.classList.toggle("mobile-menu-open");
  document.getElementById("mobileMenuButton")?.setAttribute("aria-expanded", String(isOpen));
}

function closeMobileMenu() {
  document.body.classList.remove("mobile-menu-open");
  document.getElementById("mobileMenuButton")?.setAttribute("aria-expanded", "false");
}

function render() {
  applyTheme();
  setDefaultDates();
  renderProductSelects();
  renderProductLists();
  renderSalesTables();
  renderMonthly();
  renderDetail();
  renderSettings();
  renderPalette();
  renderAuthSettings();
  renderSyncSettings();
}

function showFileModeWarning() {
  if (location.protocol !== "file:") return;
  const warning = document.createElement("div");
  warning.className = "file-warning";
  warning.textContent = "file:// では同期・ホーム画面追加が正しく動きません。http://localhost:4173/ または公開URLで開いてください。";
  document.querySelector(".main").prepend(warning);
}

function preventEnterSubmit(event) {
  if (event.key !== "Enter") return;
  if (event.currentTarget.id === "authForm") return;
  if (event.target.tagName === "TEXTAREA") return;
  event.preventDefault();
}

function initPullToRefresh() {
  if (!("ontouchstart" in window)) return;
  const revealDistance = 42;
  const refreshDistance = 118;
  const indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.textContent = "下に引いて更新";
  document.body.appendChild(indicator);

  let startY = 0;
  let distance = 0;

  window.addEventListener(
    "touchstart",
    (event) => {
      if (window.scrollY > 0) return;
      startY = event.touches[0].clientY;
      distance = 0;
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (window.scrollY > 0 || !startY) return;
      distance = Math.max(0, event.touches[0].clientY - startY);
      if (distance > revealDistance) {
        indicator.classList.add("show");
        indicator.classList.toggle("ready", distance > refreshDistance);
        indicator.textContent = distance > refreshDistance ? "離して更新" : "下に引いて更新";
      }
    },
    { passive: true },
  );

  window.addEventListener("touchend", () => {
    if (distance > refreshDistance) {
      refreshToLatest(indicator);
    } else {
      indicator.classList.remove("show");
      indicator.classList.remove("ready");
    }
    startY = 0;
    distance = 0;
  });
}

async function refreshToLatest(indicator) {
  indicator.textContent = "更新中...";
  indicator.classList.add("loading");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("hyakki-ledger-")).map((key) => caches.delete(key)));
    }
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch {
    // Reloading still fetches the latest index when cache clearing is unavailable.
  }
  location.href = `${location.origin}${location.pathname}?refresh=${Date.now()}`;
}

function showSaveToast(message) {
  let toast = document.getElementById("saveToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "saveToast";
    toast.className = "save-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1400);
}

function setDefaultDates() {
  const todayValue = today();
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = todayValue;
  });
  const initialMonth = getInitialMonth();
  if (!document.getElementById("monthFilter").value) document.getElementById("monthFilter").value = initialMonth;
  if (!document.getElementById("annualYear").value) document.getElementById("annualYear").value = initialMonth.slice(0, 4);
  if (!document.getElementById("detailMonth").value) document.getElementById("detailMonth").value = initialMonth;
  if (!document.getElementById("detailYear").value) document.getElementById("detailYear").value = initialMonth.slice(0, 4);
}

function resetSaleForm(form) {
  const dateInput = form.querySelector('input[type="date"]');
  if (dateInput) dateInput.value = today();
}

function adjustStepper(button) {
  const input = document.getElementById(button.dataset.stepTarget);
  const step = Number(button.dataset.step || 1);
  const min = Number(input.min || 0);
  const current = Number(input.value || 0);
  input.value = Math.max(min, Math.trunc(current + step));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderProductSelects() {
  fillProductSelect("#liveSaleForm select[name='productId']", "live");
  fillProductSelect("#onlineSaleForm select[name='productId']", "online");
  fillProductSelect("#otherSaleForm select[name='productId']", "other");
}

function memberSales() {
  return state.sales;
}

function fillProductSelect(selector, channel) {
  const select = document.querySelector(selector);
  const products = state.products.filter((product) => product.channel === channel);
  const current = select.value;
  select.innerHTML = products.length
    ? products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} (${yen.format(product.price)})</option>`).join("")
    : `<option value="">商品を登録してください</option>`;
  select.value = products.some((product) => product.id === current) ? current : products[0]?.id || "";
}

function renderProductLists() {
  renderProductList("liveProductList", "live");
  renderProductList("onlineProductList", "online");
  renderProductList("otherProductList", "other");
}

function renderProductList(targetId, channel) {
  const target = document.getElementById(targetId);
  const products = state.products.filter((product) => product.channel === channel);
  target.innerHTML = products.length
    ? products
        .map(
          (product) => `
          <article class="card">
            <h4>${escapeHtml(product.name)}</h4>
            <p>${yen.format(product.price)}</p>
            <p>チェキ券 ${formatNumber(product.ticketValue)}枚分</p>
            <div class="row-actions split">
              <button class="secondary small-button" onclick="toggleProductEditor('${product.id}')">編集</button>
            </div>
            <form id="edit-${product.id}" class="product-editor hidden" onsubmit="updateProduct(event, '${product.id}')">
              <select name="channel">
                <option value="live" ${product.channel === "live" ? "selected" : ""}>宴</option>
                <option value="online" ${product.channel === "online" ? "selected" : ""}>オンライン</option>
                <option value="other" ${product.channel === "other" ? "selected" : ""}>その他</option>
              </select>
              <input name="name" value="${escapeAttribute(product.name)}" required />
              <input name="price" type="number" min="0" value="${product.price}" required />
              <input name="ticketValue" type="number" min="0" step="0.1" value="${product.ticketValue}" />
              <button class="primary" type="submit">保存</button>
            </form>
            ${deleteButton("products", product.id)}
          </article>
        `,
        )
        .join("")
    : emptyHtml();
}

function toggleProductEditor(productId) {
  document.getElementById(`edit-${productId}`)?.classList.toggle("hidden");
}

function updateProduct(event, productId) {
  event.preventDefault();
  const product = productById(productId);
  if (!product) return;
  const form = new FormData(event.target);
  product.channel = form.get("channel");
  product.name = form.get("name").trim();
  product.price = Number(form.get("price"));
  product.ticketValue = Number(form.get("ticketValue"));
  saveAndRender();
}

function addSale(sale) {
  if (!sale.productId) {
    alert("商品を登録してから入力してください。");
    return;
  }
  state.sales.push({
    id: id(),
    ...sale,
    attendance: Number(sale.attendance || 0),
    quantity: Math.max(0, Math.trunc(Number(sale.quantity || 0))),
    createdAt: new Date().toISOString(),
  });
  document.getElementById("monthFilter").value = sale.date.slice(0, 7);
  document.getElementById("detailMonth").value = sale.date.slice(0, 7);
  document.getElementById("detailYear").value = sale.date.slice(0, 4);
  document.getElementById("detailDay").value = sale.date;
  saveAndRender();
}

function renderSalesTables() {
  return;
}

function renderMonthly() {
  syncMonthFilterToDetailPeriod();
  const month = document.getElementById("monthFilter").value || getInitialMonth();
  const current = calculateStats(salesForDetail());
  const previous = calculateStats(salesForMonth(previousMonth(month)));
  const goal = monthlyGoal(month);

  document.getElementById("monthlyRevenue").textContent = yen.format(current.revenue);
  document.getElementById("monthlyBack").textContent = yen.format(current.liveBack);
  document.getElementById("monthlyOnline").textContent = yen.format(current.onlineBack);
  document.getElementById("monthlyOther").textContent = yen.format(current.otherBack);
  document.getElementById("monthlyIncome").textContent = yen.format(current.incomeTotal);
  document.getElementById("monthlyLiveCount").textContent = formatNumber(current.liveEntries);
  document.getElementById("monthlyAttendanceTotal").textContent = formatNumber(current.attendance);
  document.getElementById("monthlyAttendanceAverage").textContent = formatNumber(averageAttendance(current));
  document.getElementById("monthlyNewFansTotal").textContent = formatNumber(current.newFans);
  document.getElementById("monthlyTicketTotal").textContent = formatNumber(current.ticketTotal);
  if (document.getElementById("monthlyChekiAverage")) {
    document.getElementById("monthlyChekiAverage").textContent = formatNumber(averageChekiPerLive(current));
  }
  renderProgressPie("monthlyTicketProgressPie", "monthlyTicketProgressText", current.ticketTotal, goal.ticketGoal, "枚");
  renderProgressPie("monthlyAttendanceProgressPie", "monthlyAttendanceProgressText", current.attendance, goal.attendanceGoal, "人");
  renderMonthlyGoalForm(month, goal);

  renderPerformanceStats("liveMonthlyStats", [
    ["チェキ", current.cheki, "枚", "primary"],
    ["宴チェキ平均枚数", averageChekiPerLive(current), "枚", "secondary"],
    ["新規写メ", current.newPhoto, "枚", "secondary"],
  ]);

  const onlineRows = [["オンライン計", current.onlineTickets, "枚", "primary"]].concat(
    Object.entries(current.onlineProductCounts).map(([name, tickets]) => [name, tickets, "枚", "secondary"]),
  );
  renderPerformanceStats("onlineMonthlyStats", onlineRows);

  const otherRows = [["その他計", current.otherTickets, "枚", "primary"]].concat(
    Object.entries(current.otherProductCounts).map(([name, tickets]) => [name, tickets, "枚", "secondary"]),
  );
  renderPerformanceStats("otherMonthlyStats", otherRows);

  renderStatRows(
    "monthlyComparison",
    ["attendance", "cheki", "newFans", "newPhoto", "online"].map((key) => [
      metricLabels[key],
      formatDelta(current[key] - previous[key], false),
    ]),
  );

  renderSuggestions(current, previous);
  renderAnnual();
}

function monthlyGoal(month) {
  return state.settings.monthlyGoals?.[month] || { ticketGoal: 0, attendanceGoal: 0 };
}

function averageAttendance(stats) {
  return stats.liveEntries ? Math.round((stats.attendance / stats.liveEntries) * 10) / 10 : 0;
}

function averageChekiPerLive(stats) {
  return stats.liveEntries ? Math.round((stats.cheki / stats.liveEntries) * 10) / 10 : 0;
}

function syncMonthFilterToDetailPeriod() {
  const mode = document.getElementById("detailMode").value;
  let month = document.getElementById("detailMonth").value || getInitialMonth();
  if (mode === "day") {
    month = (document.getElementById("detailDay").value || today()).slice(0, 7);
  }
  if (mode === "year") {
    const year = document.getElementById("detailYear").value || getInitialMonth().slice(0, 4);
    month = `${year}-01`;
  }
  document.getElementById("monthFilter").value = month;
}

function renderMonthlyGoalForm(month, goal) {
  const form = document.getElementById("monthlyGoalForm");
  form.elements.ticketGoal.value = goal.ticketGoal || "";
  form.elements.attendanceGoal.value = goal.attendanceGoal || "";
}

function saveMonthlyGoal(event) {
  event.preventDefault();
  const month = document.getElementById("monthFilter").value || getInitialMonth();
  const form = new FormData(event.target);
  state.settings.monthlyGoals = state.settings.monthlyGoals || {};
  state.settings.monthlyGoals[month] = {
    ticketGoal: Math.max(0, Math.trunc(Number(form.get("ticketGoal") || 0))),
    attendanceGoal: Math.max(0, Math.trunc(Number(form.get("attendanceGoal") || 0))),
  };
  saveAndRender();
}

function renderProgressPie(pieId, textId, current, goal, unit) {
  const percent = goal ? Math.round((current / goal) * 100) : 0;
  const capped = Math.min(percent, 100);
  const pie = document.getElementById(pieId);
  pie.style.setProperty("--progress", `${capped}%`);
  pie.querySelector("strong").textContent = goal ? `${percent}%` : "目標なし";
  document.getElementById(textId).textContent = goal ? `${formatNumber(current)} / ${formatNumber(goal)} ${unit}` : `${formatNumber(current)} ${unit}`;
}

function renderDetail() {
  const mode = document.getElementById("detailMode").value;
  document.getElementById("detailMonthLabel").classList.toggle("hidden", mode !== "month");
  document.getElementById("detailYearLabel").classList.toggle("hidden", mode !== "year");
  document.getElementById("detailDayLabel").classList.toggle("hidden", mode !== "day");

  const rows = salesForDetail();
  const stats = calculateStats(rows);
  document.getElementById("detailRevenue").textContent = yen.format(stats.revenue);
  document.getElementById("detailTickets").textContent = formatNumber(stats.ticketTotal);
  document.getElementById("detailBack").textContent = yen.format(stats.liveBack);
  document.getElementById("detailRows").textContent = rows.length.toLocaleString("ja-JP");

  renderStatRows("detailLiveStats", [
    ["宴チェキバック", yen.format(stats.liveBack)],
    ["動員数", formatNumber(stats.attendance)],
    ["チェキ枚数", formatNumber(stats.cheki)],
    ["新規動員数", formatNumber(stats.newFans)],
    ["新規写メ枚数", formatNumber(stats.newPhoto)],
  ]);
  renderBreakdown("detailOnlineStats", "オンライン特典チェキ券枚数", stats.onlineTickets, stats.onlineProductCounts);
  renderBreakdown("detailOtherStats", "その他チェキ券枚数", stats.otherTickets, stats.otherProductCounts);
  renderSalesTable("detailSalesTable", [...rows].sort(byDate), { editable: true });
}

function renderAnnual() {
  const year = Number(document.getElementById("annualYear").value || getInitialMonth().slice(0, 4));
  renderAnnualTrend(year);
}

function renderAnnualTrend(year) {
  const canvas = document.getElementById("annualTrendChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  const rows = months.map((monthValue) => {
    const stats = calculateStats(salesForMonth(monthValue));
    const goal = monthlyGoal(monthValue);
    return {
      label: `${Number(monthValue.slice(5, 7))}月`,
      tickets: stats.ticketTotal,
      ticketGoal: goal.ticketGoal || 0,
      attendance: stats.attendance,
      attendanceGoal: goal.attendanceGoal || 0,
    };
  });

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 28, right: 44, bottom: 48, left: 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const ticketMax = Math.max(1, ...rows.flatMap((row) => [row.tickets, row.ticketGoal]));
  const attendanceMax = Math.max(1, ...rows.flatMap((row) => [row.attendance, row.attendanceGoal]));
  const xFor = (index) => padding.left + (chartWidth / 11) * index;
  const ticketY = (value) => padding.top + chartHeight - (value / ticketMax) * chartHeight;
  const attendanceY = (value) => padding.top + chartHeight - (value / attendanceMax) * chartHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.fillRect(0, 0, width, height);
  drawChartGrid(ctx, rows, padding, chartWidth, chartHeight, ticketMax, attendanceMax);
  drawLine(ctx, rows.map((row, index) => [xFor(index), ticketY(row.tickets)]), "#e95464", 4);
  drawLine(ctx, rows.map((row, index) => [xFor(index), ticketY(row.ticketGoal)]), "#f4b3c2", 3, true);
  drawLine(ctx, rows.map((row, index) => [xFor(index), attendanceY(row.attendance)]), "#274a78", 4);
  drawLine(ctx, rows.map((row, index) => [xFor(index), attendanceY(row.attendanceGoal)]), "#c1e4e9", 3, true);
}

function drawChartGrid(ctx, rows, padding, chartWidth, chartHeight, ticketMax, attendanceMax) {
  ctx.save();
  ctx.strokeStyle = "rgba(123, 115, 122, 0.18)";
  ctx.lineWidth = 1;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted") || "#7b737a";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    const ticketValue = Math.round(ticketMax - (ticketMax / 4) * i);
    const attendanceValue = Math.round(attendanceMax - (attendanceMax / 4) * i);
    ctx.textAlign = "right";
    ctx.fillText(`${formatNumber(ticketValue)}枚`, padding.left - 10, y);
    ctx.textAlign = "left";
    ctx.fillText(`${attendanceValue}人`, padding.left + chartWidth + 10, y);
  }

  rows.forEach((row, index) => {
    const x = padding.left + (chartWidth / 11) * index;
    ctx.textAlign = "center";
    ctx.fillText(row.label, x, padding.top + chartHeight + 24);
  });
  ctx.restore();
}

function drawLine(ctx, points, color, width, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dashed ? [8, 8] : []);
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  points.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, dashed ? 3 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function calculateStats(rows) {
  const stats = {
    revenue: 0,
    ticketTotal: 0,
    liveRevenue: 0,
    liveBack: 0,
    onlineRevenue: 0,
    onlineBack: 0,
    onlineTickets: 0,
    otherRevenue: 0,
    otherBack: 0,
    otherManualBack: 0,
    otherTickets: 0,
    incomeTotal: 0,
    attendance: 0,
    liveEntries: 0,
    cheki: 0,
    newFans: 0,
    newPhoto: 0,
    online: 0,
    onlineProductCounts: {},
    otherProductCounts: {},
  };

  rows.forEach((sale) => {
    const product = productById(sale.productId);
    const amount = saleAmount(sale);
    const tickets = saleTickets(sale);
    stats.revenue += amount;
    stats.ticketTotal += tickets;

    if (sale.channel === "live") {
      stats.liveRevenue += amount;
      stats.liveEntries += 1;
      stats.attendance += Number(sale.attendance || 0);
      stats.newFans += Number(sale.newFans || 0);
      stats.newPhoto += Number(sale.newPhoto || 0);
      const metric = liveMetric(product?.name || "");
      if (
        metric &&
        !(metric === "attendance" && Number(sale.attendance || 0) > 0) &&
        !(metric === "newFans" && Number(sale.newFans || 0) > 0) &&
        !(metric === "newPhoto" && Number(sale.newPhoto || 0) > 0)
      ) {
        stats[metric] += sale.quantity;
      }
    } else if (sale.channel === "online") {
      stats.onlineRevenue += amount;
      stats.onlineTickets += tickets;
      stats.online += tickets;
      const name = product?.name || "削除済み";
      stats.onlineProductCounts[name] = (stats.onlineProductCounts[name] || 0) + tickets;
    } else if (sale.channel === "other") {
      stats.otherRevenue += amount;
      if (sale.amountOverride !== null && sale.amountOverride !== undefined && Number.isFinite(Number(sale.amountOverride))) {
        stats.otherManualBack += Math.round(Number(sale.amountOverride));
      }
      stats.otherTickets += tickets;
      const name = product?.name || "削除済み";
      stats.otherProductCounts[name] = (stats.otherProductCounts[name] || 0) + tickets;
    }
  });

  const backUnit = tierRate(state.settings.backTiers, stats.ticketTotal);
  stats.liveBack = Math.round(stats.cheki * backUnit);
  stats.onlineBack = Math.round(stats.onlineTickets * backUnit);
  stats.otherBack = Math.round(stats.otherTickets * backUnit) + stats.otherManualBack;
  stats.incomeTotal = stats.liveBack + stats.onlineBack + stats.otherBack;
  return stats;
}

function tierRate(tiers, totalTickets) {
  const sorted = [...(tiers || [])].sort((a, b) => a.min - b.min);
  let rate = 0;
  sorted.forEach((tier) => {
    if (totalTickets >= tier.min) rate = tier.value;
  });
  return rate;
}

function liveMetric(name) {
  if (name.includes("新規") && name.includes("写メ")) return "newPhoto";
  if (name.includes("新規") && name.includes("動員")) return "newFans";
  if (name.includes("動員")) return "attendance";
  if (name.includes("チェキ")) return "cheki";
  return "";
}

function renderSalesTable(targetId, rows, options = {}) {
  const target = document.getElementById(targetId);
  target.innerHTML = rows.length
    ? rows
        .map((sale) => {
          const product = productById(sale.productId);
          return `
            <tr>
              <td>${escapeHtml(sale.date)}</td>
              <td>${channelLabel(sale.channel)}</td>
              <td>${escapeHtml(salePlace(sale))}</td>
              <td>${formatNumber(sale.attendance || 0)}</td>
              <td>${escapeHtml(product?.name || "削除済み")}</td>
              <td>${formatNumber(sale.quantity)}</td>
              <td>${formatNumber(saleTickets(sale))}</td>
              <td>${yen.format(saleAmount(sale))}</td>
              <td>${formatNote(sale.note)}</td>
              <td>
                <div class="table-actions">
                  ${options.editable ? `<button class="icon-button edit-button" onclick="toggleSaleEditor('${sale.id}')" aria-label="編集" title="編集"><img src="edit-icon.png?v=27" alt="" /></button>` : ""}
                  <button class="icon-button delete-button" onclick="removeItem('sales', '${sale.id}')" aria-label="削除" title="削除"><img src="trash-icon.png?v=27" alt="" /></button>
                </div>
              </td>
            </tr>
            ${options.editable ? saleEditRow(sale) : ""}
          `;
        })
        .join("")
    : `<tr><td colspan="10">${emptyHtml()}</td></tr>`;
}

function saleEditRow(sale) {
  return `
    <tr id="sale-edit-row-${sale.id}" class="sale-edit-row hidden">
      <td colspan="10">
        <form class="sale-editor" onsubmit="updateSale(event, '${sale.id}')">
          <label>日付<input name="date" type="date" value="${escapeAttribute(sale.date)}" required /></label>
          <label>商品<select name="productId" required>${saleProductOptions(sale.productId)}</select></label>
          <label>会場名<input name="venue" value="${escapeAttribute(sale.venue || "")}" /></label>
          <label>イベント名<input name="eventName" value="${escapeAttribute(sale.eventName || "")}" /></label>
          <label>動員<input name="attendance" type="number" min="0" step="1" value="${Number(sale.attendance || 0)}" /></label>
          <label>数量<input name="quantity" type="number" min="0" step="1" value="${Number(sale.quantity || 0)}" required /></label>
          <label>任意金額<input name="amountOverride" type="number" min="0" step="1" value="${sale.amountOverride ?? ""}" placeholder="その他の金額" /></label>
          <label>新規動員<input name="newFans" type="number" min="0" step="1" value="${Number(sale.newFans || 0)}" /></label>
          <label>新規写メ<input name="newPhoto" type="number" min="0" step="1" value="${Number(sale.newPhoto || 0)}" /></label>
          <label class="wide">メモ<textarea name="note" rows="3">${escapeHtml(sale.note || "")}</textarea></label>
          <button class="primary" type="submit">保存</button>
        </form>
      </td>
    </tr>
  `;
}

function saleProductOptions(selectedId) {
  return state.products
    .map(
      (product) =>
        `<option value="${product.id}" ${product.id === selectedId ? "selected" : ""}>${channelLabel(product.channel)}: ${escapeHtml(product.name)} (${yen.format(product.price)})</option>`,
    )
    .join("");
}

function toggleSaleEditor(saleId) {
  document.getElementById(`sale-edit-row-${saleId}`)?.classList.toggle("hidden");
}

function updateSale(event, saleId) {
  event.preventDefault();
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale) return;
  const form = new FormData(event.target);
  const product = productById(form.get("productId"));
  sale.date = form.get("date");
  sale.channel = product?.channel || sale.channel;
  sale.venue = String(form.get("venue") || "").trim();
  sale.eventName = String(form.get("eventName") || "").trim();
  sale.productId = form.get("productId");
  sale.attendance = Math.max(0, Math.trunc(Number(form.get("attendance") || 0)));
  sale.quantity = Math.max(0, Math.trunc(Number(form.get("quantity") || 0)));
  sale.amountOverride = optionalNumber(form.get("amountOverride"));
  sale.newFans = Math.max(0, Math.trunc(Number(form.get("newFans") || 0)));
  sale.newPhoto = Math.max(0, Math.trunc(Number(form.get("newPhoto") || 0)));
  sale.note = String(form.get("note") || "").trim();
  saveAndRender();
}

function formatNote(note) {
  return escapeHtml(note || "").replaceAll("\n", "<br>");
}

function renderStatRows(targetId, rows) {
  document.getElementById(targetId).innerHTML = rows.length
    ? rows
        .map(
          ([label, value]) => `
        <div class="summary-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
        )
        .join("")
    : emptyHtml();
}

function renderPerformanceStats(targetId, rows) {
  document.getElementById(targetId).innerHTML = rows.length
    ? rows
        .map(([label, value, unit = "", emphasis = "secondary"]) => {
          const formatted = unit === "円" ? yen.format(value) : formatNumber(value);
          return `
            <div class="performance-stat-row ${emphasis}">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(formatted)}${unit && unit !== "円" ? `<small>${escapeHtml(unit)}</small>` : ""}</strong>
            </div>
          `;
        })
        .join("")
    : emptyHtml();
}

function renderBreakdown(targetId, totalLabel, totalTickets, productCounts) {
  const items = Object.entries(productCounts);
  document.getElementById(targetId).innerHTML = `
    <div class="breakdown-total">
      <span>${escapeHtml(totalLabel)}</span>
      <strong>${formatNumber(totalTickets)}</strong>
    </div>
    <div class="breakdown-section">
      <h4>商品別内訳</h4>
      ${
        items.length
          ? items
              .map(
                ([name, count]) => `
                  <div class="breakdown-row">
                    <span>${escapeHtml(name)}</span>
                    <strong>${formatNumber(count)}個</strong>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty compact-empty">内訳はありません</div>`
      }
    </div>
  `;
}

function renderSuggestions(current, previous) {
  const suggestions = [];
  if (current.attendance < previous.attendance) suggestions.push("動員が前月より下がっています。告知開始日と予約導線を早めに固定すると改善しやすいです。");
  if (current.cheki < previous.cheki) suggestions.push("チェキ枚数が落ちています。終演後の声かけやセット購入の見せ方を増やす余地があります。");
  if (current.newFans <= 0) suggestions.push("新規動員が記録されていません。新規特典や紹介導線を作ると月次で追いやすくなります。");
  if (current.onlineRevenue < previous.onlineRevenue) suggestions.push("オンライン売上が前月より弱めです。販売期間を短く区切り、締切前の再告知を入れると動きが出やすいです。");
  if (!suggestions.length) suggestions.push("主要指標は安定しています。伸びた商品や宴を次月も再現できるよう、メモに要因を残すのがおすすめです。");

  document.getElementById("aiSuggestions").innerHTML = suggestions.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
}

function salesForMonth(month) {
  return memberSales().filter((sale) => sale.date.startsWith(month));
}

function salesForDetail() {
  const mode = document.getElementById("detailMode").value;
  if (mode === "year") {
    const year = document.getElementById("detailYear").value;
    return memberSales().filter((sale) => sale.date.startsWith(year));
  }
  if (mode === "day") {
    const day = document.getElementById("detailDay").value;
    return memberSales().filter((sale) => sale.date === day);
  }
  const month = document.getElementById("detailMonth").value;
  return memberSales().filter((sale) => sale.date.startsWith(month));
}

function renderSettings() {
  document.querySelector("#settingsForm input[name='backTiers']").value = tiersToText(state.settings.backTiers);
}

function renderSyncSettings() {
  const form = document.getElementById("syncForm");
  form.elements.url.value = syncConfig.url || "";
  form.elements.anonKey.value = syncConfig.anonKey || "";
  form.elements.autoSync.value = syncConfig.autoSync || "on";
}

function renderAuthSettings() {
  const status = document.getElementById("authStatus");
  const signOutButton = document.getElementById("signOutButton");
  if (!syncConfig.url || !syncConfig.anonKey) {
    status.textContent = "先にSupabase URL / anon keyを保存してください。";
    signOutButton.disabled = true;
    return;
  }
  if (authSession?.user?.email) {
    status.textContent = `${authSession.user.email} でログイン中です。ページを更新してもログイン状態は保持されます。`;
    signOutButton.disabled = false;
    return;
  }
  status.textContent = "未ログインです。アカウント作成またはログインしてください。";
  signOutButton.disabled = true;
}

function saveSyncSettings(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  syncConfig.url = normalizeSupabaseUrl(form.get("url"));
  syncConfig.anonKey = String(form.get("anonKey") || "").trim();
  syncConfig.autoSync = form.get("autoSync");
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
  render();
  setSyncStatus("同期設定を保存しました。URLはProject URL形式に補正しました。");
  startAutoSync();
}

function authReady() {
  return Boolean(syncConfig.url && syncConfig.anonKey);
}

function currentUserId() {
  return authSession?.user?.id || "";
}

function supabaseAuthUrl(path) {
  syncConfig.url = normalizeSupabaseUrl(syncConfig.url);
  return `${syncConfig.url}/auth/v1/${path}`;
}

function authHeaders() {
  return {
    apikey: syncConfig.anonKey,
    "Content-Type": "application/json",
  };
}

async function signUp() {
  if (!authReady()) {
    setAuthStatus("先にSupabase URL / anon keyを保存してください。");
    return;
  }
  const form = new FormData(document.getElementById("authForm"));
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。");
    return;
  }
  try {
    setAuthStatus("アカウント作成中...");
    const response = await fetch(supabaseAuthUrl("signup"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(payload));
    if (payload.access_token) {
      saveAuthPayload(payload);
      render();
      setAuthStatus(`${payload.user?.email || email} のアカウントを作成してログインしました。クラウド同期を確認しています...`);
      await autoCloudLoad("アカウント作成時");
    } else {
      renderAuthSettings();
      setAuthStatus("確認メールを送信しました。メール内の確認リンクを開いてから、この画面でログインしてください。");
    }
  } catch (error) {
    setAuthStatus(authErrorMessage("作成失敗", error));
  }
}

async function signIn(event) {
  event.preventDefault();
  if (!authReady()) {
    setAuthStatus("先にSupabase URL / anon keyを保存してください。");
    return;
  }
  const form = new FormData(event.target);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。");
    return;
  }
  try {
    setAuthStatus("ログイン中...");
    const response = await fetch(supabaseAuthUrl("token?grant_type=password"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(payload));
    saveAuthPayload(payload);
    render();
    setAuthStatus(`${payload.user?.email || email} でログインしました。クラウドから読み込み中...`);
    await autoCloudLoad("ログイン時");
  } catch (error) {
    setAuthStatus(authErrorMessage("ログイン失敗", error));
  }
}

async function signOut() {
  saveAuthSession(null);
  render();
  setAuthStatus("ログアウトしました。");
  setSyncStatus("ログアウト中はクラウド同期できません。");
}

function saveAuthPayload(payload) {
  saveAuthSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
    user: payload.user,
  });
}

async function ensureAuthSession() {
  if (!authSession?.access_token) return null;
  const expiresAt = Number(authSession.expires_at || 0);
  if (!authSession.refresh_token || expiresAt - Math.floor(Date.now() / 1000) > 60) return authSession;
  const response = await fetch(supabaseAuthUrl("token?grant_type=refresh_token"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: authSession.refresh_token }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }
  saveAuthPayload(payload);
  return authSession;
}

function setAuthStatus(message) {
  document.getElementById("authStatus").textContent = message;
}

async function restoreAuthOnLoad() {
  if (!authSession?.access_token || !authReady()) return;
  try {
    await ensureAuthSession();
    renderAuthSettings();
    await autoCloudLoad("起動時");
  } catch {
    renderAuthSettings();
    setAuthStatus(`${authSession?.user?.email || "前回のアカウント"} のログイン情報を保持しています。同期に失敗する場合だけ再ログインしてください。`);
  }
}

function startAutoSync() {
  if (syncInterval) clearInterval(syncInterval);
  if (shouldAutoSync()) {
    syncInterval = setInterval(() => pushCloud(false), 30000);
  }
}

function queueCloudSave() {
  if (syncSaveTimer) clearTimeout(syncSaveTimer);
  syncSaveTimer = setTimeout(() => pushCloud(false), 1200);
}

function syncReady() {
  return Boolean(syncConfig.url && syncConfig.anonKey && currentUserId() && authSession?.access_token);
}

function shouldAutoSync() {
  return syncConfig.autoSync !== "off";
}

function supabaseTableUrl(query = "") {
  syncConfig.url = normalizeSupabaseUrl(syncConfig.url);
  return `${syncConfig.url}/rest/v1/ledger_sync${query}`;
}

function supabaseEndpoint() {
  return supabaseTableUrl(`?id=eq.${encodeURIComponent(currentUserId())}`);
}

function syncHeaders(prefer = "") {
  const headers = {
    apikey: syncConfig.anonKey,
    Authorization: `Bearer ${authSession?.access_token || syncConfig.anonKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function autoCloudLoad(reason) {
  if (!syncReady()) return;
  const result = await pullCloud({ automatic: true });
  if (result?.action === "loaded") {
    setAuthStatus(`${authSession?.user?.email || "アカウント"} でログイン中です。${reason}にクラウドから自動読み込みしました。`);
  } else if (result?.action === "pushed-local") {
    setAuthStatus(`${authSession?.user?.email || "アカウント"} でログイン中です。クラウドが空だったため、この端末のデータを自動保存しました。`);
  }
}

async function pullCloud(options = {}) {
  const automatic = Boolean(options?.automatic);
  if (!syncReady()) {
    setSyncStatus("Supabase URL / anon key を保存し、ログインしてください。");
    return { action: "not-ready" };
  }
  try {
    await ensureAuthSession();
    setSyncStatus(automatic ? "クラウドを自動確認中..." : "クラウドから読み込み中...");
    const response = await fetch(`${supabaseEndpoint()}&select=data,updated_at`, {
      headers: syncHeaders(),
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    if (!rows.length) {
      if (automatic && hasLedgerData(state)) {
        await pushCloud(false);
        setSyncStatus("クラウドが空だったため、この端末のデータを自動保存しました。");
        return { action: "pushed-local" };
      }
      setSyncStatus("クラウドにデータがありません。先にクラウドへ保存してください。");
      return { action: "empty-cloud" };
    }
    const cloudState = rows[0].data || {};
    if (!hasLedgerData(cloudState) && hasLedgerData(state)) {
      if (automatic) {
        await pushCloud(false);
        setSyncStatus("クラウド側が空だったため、この端末のデータを自動保存しました。");
        return { action: "pushed-local" };
      }
      setSyncStatus("クラウド側が空のため、端末内データを残しました。今の端末データを使う場合は「クラウドへ保存」を押してください。");
      return { action: "empty-cloud" };
    }
    backupLocalState();
    state.sales = cloudState.sales || [];
    state.products = cloudState.products || [];
    state.settings = { ...state.settings, ...(cloudState.settings || {}) };
    saveAndRender({ skipCloud: true });
    setSyncStatus(`クラウドから読み込みました。更新: ${formatSyncTime(rows[0].updated_at)}`);
    return { action: "loaded" };
  } catch (error) {
    setSyncStatus(syncErrorMessage("読み込み失敗", error));
    return { action: "error" };
  }
}

async function pushCloud(showSuccess) {
  if (!syncReady()) {
    if (showSuccess) setSyncStatus("Supabase URL / anon key を保存し、ログインしてください。");
    return;
  }
  try {
    await ensureAuthSession();
    if (showSuccess) setSyncStatus("クラウドへ保存中...");
    const payload = {
      id: currentUserId(),
      data: {
        sales: state.sales,
        products: state.products,
        settings: state.settings,
      },
      updated_at: new Date().toISOString(),
    };
    const response = await fetch(supabaseTableUrl("?on_conflict=id"), {
      method: "POST",
      headers: syncHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    if (showSuccess) setSyncStatus("クラウドへ保存しました。");
  } catch (error) {
    setSyncStatus(syncErrorMessage("保存失敗", error));
  }
}

function setSyncStatus(message) {
  document.getElementById("syncStatus").textContent = message;
}

function hasLedgerData(data) {
  return Boolean((data.sales || []).length || (data.products || []).length);
}

function backupLocalState() {
  localStorage.setItem(
    LOCAL_BACKUP_KEY,
    JSON.stringify({
      backedUpAt: new Date().toISOString(),
      sales: state.sales,
      products: state.products,
      settings: state.settings,
    }),
  );
}

function syncErrorMessage(prefix, error) {
  const rawMessage = error?.message || String(error);
  try {
    const payload = JSON.parse(rawMessage);
    if (payload.code === "PGRST125") {
      return `${prefix}: Supabase URLはProject URLだけを入れてください。例: https://xxxx.supabase.co`;
    }
    if (payload.code === "42P01" || payload.message?.includes("ledger_sync")) {
      return `${prefix}: Supabaseに ledger_sync テーブルが見つかりません。supabase.sql をSQL Editorで実行してください。`;
    }
    if (payload.code === "42501" || payload.message?.includes("row-level security")) {
      return `${prefix}: ログイン権限またはRLS設定を確認してください。supabase.sql を再実行してください。`;
    }
    return `${prefix}: ${payload.message || rawMessage}`;
  } catch {
    return `${prefix}: ${rawMessage}`;
  }
}

function authErrorMessage(prefix, error) {
  const rawMessage = error?.message || String(error);
  try {
    const payload = JSON.parse(rawMessage);
    return `${prefix}: ${payload.msg || payload.message || rawMessage}`;
  } catch {
    return `${prefix}: ${rawMessage}`;
  }
}

function formatSyncTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP");
}

function renderPalette() {
  document.getElementById("colorPalette").innerHTML = Object.entries(colors)
    .map(
      ([key, color]) => `
      <button class="swatch swatch-${key} ${state.settings.color === key ? "active" : ""}" style="--swatch:${color[0]}" onclick="setColor('${key}')" aria-label="${key}">
        <span></span>
      </button>
    `,
    )
    .join("");
}

function setColor(color) {
  state.settings.color = color;
  saveAndRender();
}

function applyTheme() {
  const [accent, accentDark, bg, soft, ink] = colors[state.settings.color] || colors.green;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-dark", accentDark);
  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--accent-soft", soft);
  document.documentElement.style.setProperty("--ink", ink || "#5f5660");
  document.documentElement.style.setProperty("--muted", state.settings.color === "black" ? "#6f6b68" : state.settings.color === "white" ? "#77736c" : "#7b737a");
  document.documentElement.style.setProperty("--line", state.settings.color === "white" ? "#dedbd4" : soft);
  document.documentElement.style.setProperty("--shadow", `0 18px 48px ${hexToRgba(accent, state.settings.color === "white" ? 0.28 : 0.18)}`);
  document.body.dataset.theme = state.settings.color;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function parseTiers(text) {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [min, value] = part.split(":").map((item) => Number(item.trim()));
      return { min, value };
    })
    .filter((tier) => Number.isFinite(tier.min) && Number.isFinite(tier.value))
    .sort((a, b) => a.min - b.min);
}

function defaultBackTiers() {
  return [
    { min: 0, value: 405 },
    { min: 50, value: 425 },
    { min: 100, value: 455 },
    { min: 150, value: 485 },
    { min: 200, value: 520 },
  ];
}

function tiersToText(tiers) {
  return (tiers || []).map((tier) => `${tier.min}:${tier.value}`).join(",");
}

function addSampleData() {
  if (state.sales.length || state.products.length) {
    const ok = confirm("現在のデータにサンプルを追加します。よろしいですか？");
    if (!ok) return;
  }

  const liveProducts = [
    makeProduct("live", "動員", 1500, 0),
    makeProduct("live", "チェキ", 1500, 1),
    makeProduct("live", "新規動員", 0, 0),
    makeProduct("live", "新規写メ", 0, 1),
  ];
  const onlineProducts = [
    makeProduct("online", "オンライン特典チェキ券", 1500, 1),
    makeProduct("online", "オンライン(水着)", 1500, 1),
  ];
  const otherProducts = [makeProduct("other", "タニマチ権", 1500, 1), makeProduct("other", "差し入れ特典", 3000, 2)];
  state.products.push(...liveProducts, ...onlineProducts, ...otherProducts);

  const product = (name) => state.products.find((item) => item.name === name);
  state.sales.push(
    makeSale("live", "2025-08-03", "横浜1000CLUB", "100-YOKAI特典会", product("チェキ").id, 39, "", 29),
    makeSale("live", "2025-08-10", "池袋リヴォイス", "", product("新規動員").id, 1, "ギリちゃん", 2),
    makeSale("live", "2025-08-10", "池袋リヴォイス", "", product("新規写メ").id, 1, "", 0),
    makeSale("online", "2025-08-27", "", "", product("オンライン(水着)").id, 23, "", 0),
    makeSale("other", "2025-08-23", "", "", product("タニマチ権").id, 7, "", 0),
    makeSale("online", "2025-07-27", "", "", product("オンライン特典チェキ券").id, 12, "前月比較用", 0),
    makeSale("live", "2025-07-03", "渋谷音楽堂", "", product("チェキ").id, 28, "前月比較用", 20),
  );
  document.getElementById("monthFilter").value = "2025-08";
  document.getElementById("detailMonth").value = "2025-08";
  document.getElementById("detailYear").value = "2025";
  saveAndRender();
}

function makeProduct(channel, name, price, ticketValue) {
  return { id: id(), channel, name, price, ticketValue };
}

function makeSale(channel, date, venue, eventName, productId, quantity, note, attendance = 0, newFans = 0, newPhoto = 0) {
  return { id: id(), channel, date, venue, eventName, productId, quantity, attendance, newFans, newPhoto, note, createdAt: new Date().toISOString() };
}

function exportSalesCsv() {
  const rows = [...memberSales()].sort(byDate).map((sale) => {
    const product = productById(sale.productId);
    return {
      date: sale.date,
      channel: channelLabel(sale.channel),
      place: salePlace(sale),
      product: product?.name || "",
      quantity: sale.quantity,
      attendance: sale.attendance || 0,
      newFans: sale.newFans || 0,
      newPhoto: sale.newPhoto || 0,
      tickets: saleTickets(sale),
      amount: saleAmount(sale),
      note: sale.note,
    };
  });
  download("100-yokai-sales.csv", toCsv(rows, ["date", "channel", "place", "product", "quantity", "attendance", "newFans", "newPhoto", "tickets", "amount", "note"]), "text/csv");
}

function exportJson() {
  download("100-yokai-ledger-backup.json", JSON.stringify(state, null, 2), "application/json");
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      state.sales = imported.sales || [];
      state.products = imported.products || [];
      state.settings = { ...state.settings, ...(imported.settings || {}) };
      saveAndRender();
      alert("バックアップを取り込みました。");
    } catch {
      alert("JSONファイルを読み込めませんでした。");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function clearData() {
  const ok = confirm("全データを削除します。バックアップを取ってから実行してください。");
  if (!ok) return;
  state.sales = [];
  state.products = [];
  saveAndRender();
}

function removeItem(collection, itemId) {
  const index = state[collection].findIndex((item) => item.id === itemId);
  if (index >= 0) {
    state[collection].splice(index, 1);
    saveAndRender();
  }
}

function deleteButton(collection, itemId) {
  return `<div class="row-actions"><button class="mini-danger" onclick="removeItem('${collection}', '${itemId}')">削除</button></div>`;
}

function productById(productId) {
  return state.products.find((product) => product.id === productId);
}

function saleAmount(sale) {
  if (sale.amountOverride !== null && sale.amountOverride !== undefined && Number.isFinite(Number(sale.amountOverride))) {
    return Math.round(Number(sale.amountOverride));
  }
  const product = productById(sale.productId);
  return Math.round((product?.price || 0) * sale.quantity);
}

function saleTickets(sale) {
  const product = productById(sale.productId);
  return (product?.ticketValue || 0) * sale.quantity;
}

function salePlace(sale) {
  if (sale.channel === "online") return "オンライン";
  if (sale.channel === "other") return "その他";
  return [sale.venue, sale.eventName].filter(Boolean).join(" / ") || "-";
}

function channelLabel(channel) {
  if (channel === "live") return "宴";
  if (channel === "online") return "オンライン";
  return "その他";
}

function byNewest(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

function byDate(a, b) {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

function previousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getInitialMonth() {
  const newest = [...memberSales()].sort(byNewest)[0];
  return newest ? newest.date.slice(0, 7) : today().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function id() {
  return crypto.randomUUID();
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function formatDelta(value, currency = false) {
  const sign = value > 0 ? "+" : "";
  return currency ? `${sign}${yen.format(value)}` : `${sign}${formatNumber(value)}`;
}

function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n");
  return `${header}\n${body}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function emptyHtml() {
  return document.getElementById("emptyTemplate").innerHTML;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
