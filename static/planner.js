"use strict";

const get = id => document.getElementById(id);
const storageKey = "xingji.recentTrips.v1";
const apiKey = "travel-planner-secret-2026";
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 });
const statusLabels = { waiting_for_review: "待确认", completed: "已确认", draft: "草案" };
const form = get("trip-form");
const dialog = get("history");
const preferenceButtons = [...form.querySelectorAll(".preferences button")];

let activeTrip = null;
let busy = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(path, body) {
  const options = { headers: { "X-API-Key": apiKey } };
  if (body !== undefined) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const detail = typeof data?.detail === "string" ? data.detail : data?.error;
    throw new Error(detail || "请求未完成，请稍后重试。");
  }
  return data;
}

function setNotice(text, type = "") {
  const notice = get("notice");
  notice.textContent = text;
  notice.hidden = !text;
  notice.className = ["notice", type].filter(Boolean).join(" ");
}

function formatCost(value) {
  return Number.isFinite(value) ? currency.format(value) : "—";
}

function readHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(items) ? items.filter(item => typeof item?.id === "string") : [];
  } catch {
    return [];
  }
}

function rememberTrip(trip) {
  try {
    const items = readHistory().filter(item => item.id !== trip.thread_id);
    const entry = { id: trip.thread_id, destination: trip.destination, days: trip.days, status: trip.status };
    localStorage.setItem(storageKey, JSON.stringify([entry, ...items].slice(0, 18)));
  } catch {
    // Local storage may be disabled. The session can still be retrieved by its URL.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("trip", trip.thread_id);
  window.history.replaceState(null, "", url);
}

function showFeedback(visible) {
  get("feedback-form").hidden = !visible;
  get("edit-plan").setAttribute("aria-expanded", String(visible));
  if (visible) get("feedback").focus();
}

function drawTrip(trip) {
  activeTrip = trip;
  const days = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  const hasTrip = days.length > 0;
  const list = get("day-list");
  list.replaceChildren();
  get("empty").hidden = hasTrip;
  get("itinerary").hidden = !hasTrip;
  get("plan-state").hidden = !hasTrip;
  showFeedback(false);

  if (hasTrip) {
    const reviewable = trip.status === "waiting_for_review";
    get("approve").hidden = !reviewable;
    get("edit-plan").hidden = !reviewable;
    get("plan-state").textContent = statusLabels[trip.status] || "草案";
    get("plan-state").className = "status-pill " + (reviewable ? "" : (trip.status === "completed" ? "completed" : "draft"));
    get("trip-title").textContent = trip.destination || "旅行计划";
    const details = [String(trip.days || days.length) + " 天", trip.start_date, ...(trip.preferences || [])].filter(Boolean);
    get("trip-details").textContent = details.join(" · ");
    get("trip-cost").textContent = formatCost(trip.total_cost);
    get("trip-budget").textContent = trip.budget > 0 ? "预算 " + formatCost(trip.budget) : "";
    const meter = get("budget-meter");
    const hasBudget = trip.budget > 0 && Number.isFinite(trip.total_cost);
    meter.hidden = !hasBudget;
    if (hasBudget) {
      const percent = Math.max(0, Math.round(trip.total_cost / trip.budget * 100));
      meter.classList.toggle("over", percent > 100);
      meter.firstElementChild.style.width = Math.min(percent, 100) + "%";
      meter.setAttribute("aria-label", "预估花费占预算 " + percent + "%");
      meter.setAttribute("role", "img");
    }

    for (const day of days) {
      const card = element("li", "", "day-card");
      const head = element("div", "", "day-header");
      head.append(element("strong", "第 " + day.day + " 天"), element("span", formatCost(day.estimated_cost)));
      card.append(head);
      const activities = element("ul");
      for (const activity of day.activities || []) activities.append(element("li", activity));
      if (activities.children.length) card.append(activities);
      if (day.notes) card.append(element("p", day.notes));
      list.append(card);
    }
  }

  if (trip.destination) get("destination").value = trip.destination;
  if (trip.days >= 1 && trip.days <= 7) get("days").value = trip.days;
  if (trip.budget > 0) get("budget").value = trip.budget;
  get("start-date").value = trip.start_date || "";
  for (const button of preferenceButtons) {
    button.setAttribute("aria-pressed", String((trip.preferences || []).includes(button.textContent.trim())));
  }
  rememberTrip(trip);
}

function setBusy(value, label) {
  busy = value;
  get("preview").setAttribute("aria-busy", String(value));
  get("loading").hidden = !value;
  get("empty").hidden = value || !!activeTrip?.itinerary?.length;
  get("itinerary").hidden = value || !activeTrip?.itinerary?.length;
  get("plan-state").hidden = value || !activeTrip?.itinerary?.length;
  if (value) get("loading-label").textContent = label;
  for (const id of ["generate", "approve", "edit-plan", "export-plan", "open-history"]) get(id).disabled = value;
}

function scrollToPreview() {
  if (matchMedia("(max-width: 650px)").matches) get("preview").scrollIntoView({ block: "start" });
}

async function getTrip(id) {
  const trip = await request("/planner/sessions/" + encodeURIComponent(id));
  if (!trip.exists) throw new Error("没有找到这个会话，请检查编号。");
  return trip;
}

async function updateTrip(route, body, label) {
  if (busy) return;
  setBusy(true, label);
  setNotice("");
  scrollToPreview();
  try {
    const outcome = await request(route, body);
    let trip;
    try {
      trip = await getTrip(outcome.thread_id || body.thread_id);
    } catch (error) {
      if (outcome.success) throw error;
    }
    if (trip) drawTrip(trip);
    if (!outcome.success) {
      setNotice(outcome.error || trip?.feedback || "这一轮未能生成完整方案，请调整条件后重试。", "error");
    } else if (outcome.status === "completed") {
      setNotice("行程已确认，可以下载保存。", "success");
    } else if (trip?.feedback) {
      setNotice(trip.feedback);
    }
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function getRequirements() {
  const preferences = preferenceButtons.filter(button => button.getAttribute("aria-pressed") === "true")
    .map(button => button.textContent.trim());
  return {
    destination: get("destination").value.trim(),
    days: Number(get("days").value),
    budget: Number(get("budget").value),
    start_date: get("start-date").value || null,
    preferences,
  };
}

function textQuery({ destination, days, budget, start_date, preferences }) {
  const extra = get("details").value.trim();
  const sections = ["我想去" + destination + "旅行 " + days + " 天，总预算 " + budget + " 元人民币。"];
  if (start_date) sections.push("出发日期为 " + start_date + "。");
  if (preferences.length) sections.push("旅行偏好：" + preferences.join("、") + "。");
  if (extra) sections.push("补充需求：" + extra);
  return sections.join("\n");
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!get("destination").value.trim()) {
    setNotice("请填写目的地。", "error");
    get("destination").focus();
    return;
  }
  const requirements = getRequirements();
  updateTrip("/plan", {
    user_query: textQuery(requirements),
    thread_id: "trip-" + crypto.randomUUID(),
    requirements,
  }, "正在生成行程");
});

for (const button of form.querySelectorAll("[data-city]")) {
  button.addEventListener("click", () => {
    get("destination").value = button.dataset.city;
    get("days").value = button.dataset.days;
    get("budget").value = button.dataset.budget;
  });
}
for (const button of preferenceButtons) {
  button.addEventListener("click", () => {
    button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
  });
}

get("approve").addEventListener("click", () => {
  if (activeTrip?.status === "waiting_for_review") {
    updateTrip("/resume", { thread_id: activeTrip.thread_id, user_feedback: "通过" }, "正在确认行程");
  }
});
get("edit-plan").addEventListener("click", () => showFeedback(get("feedback-form").hidden));
get("feedback-form").addEventListener("submit", event => {
  event.preventDefault();
  const feedback = get("feedback").value.trim();
  if (!feedback || activeTrip?.status !== "waiting_for_review") return;
  updateTrip("/resume", { thread_id: activeTrip.thread_id, user_feedback: feedback }, "正在根据意见重新规划");
});

get("export-plan").addEventListener("click", () => {
  if (!activeTrip?.itinerary?.length) return;
  const trip = activeTrip;
  const name = trip.destination || "旅行";
  const output = [
    "# " + name + "行程",
    "",
    "状态：" + (statusLabels[trip.status] || "草案"),
    "天数：" + (trip.days || trip.itinerary.length),
    "预估总花费：" + formatCost(trip.total_cost),
  ];
  if (trip.budget > 0) output.push("预算：" + formatCost(trip.budget));
  for (const day of trip.itinerary) {
    output.push("", "## 第 " + day.day + " 天", "预估花费：" + formatCost(day.estimated_cost), "");
    for (const activity of day.activities || []) output.push("- " + activity);
    if (day.notes) output.push("", "备注：" + day.notes);
  }
  const url = URL.createObjectURL(new Blob([output.join("\n") + "\n"], { type: "text/markdown;charset=utf-8" }));
  const link = element("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, "_") + "行程.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function openTrip(id) {
  if (!id || busy) return;
  const message = get("history-message");
  message.hidden = true;
  setBusy(true, "正在读取行程");
  try {
    const trip = await getTrip(id);
    if (dialog.open) dialog.close();
    drawTrip(trip);
    setNotice(trip.feedback);
    scrollToPreview();
  } catch (error) {
    if (dialog.open) {
      message.textContent = error.message;
      message.hidden = false;
    } else {
      setNotice(error.message, "error");
    }
  } finally {
    setBusy(false);
  }
}

get("open-history").addEventListener("click", () => {
  const list = get("history-list");
  list.replaceChildren();
  get("history-message").hidden = true;
  for (const item of readHistory()) {
    const row = element("li");
    const button = element("button");
    button.type = "button";
    button.append(element("span", item.destination || item.id), element("span", statusLabels[item.status] || ""));
    button.addEventListener("click", () => openTrip(item.id));
    row.append(button);
    list.append(row);
  }
  if (!list.children.length) list.append(element("li", "这个浏览器还没有保存过行程。"));
  dialog.showModal();
});
get("close-history").addEventListener("click", () => dialog.close());
get("restore-form").addEventListener("submit", event => {
  event.preventDefault();
  openTrip(get("session-id").value.trim());
});

request("/planner/status").then(status => {
  get("service").classList.add("online");
  get("service-label").textContent = status.local_model ? "本地服务在线" : "服务在线";
  const source = get("data-source");
  source.textContent = status.live_data ? "费用为预估，请在出发前核对实际价格。" : "费用为预估。当前未配置高德实时数据，请在出发前核对。";
  source.hidden = false;
}).catch(() => {
  get("service").classList.add("offline");
  get("service-label").textContent = "服务连接异常";
});

const requestedTrip = new URLSearchParams(window.location.search).get("trip");
if (requestedTrip) openTrip(requestedTrip);
