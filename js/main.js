
import {
  APP_VERSION,
  defaultState,
  loadState,
  saveState,
  getAllPdfs,
  savePdf,
  removePdf,
  clearPdfs,
  round2
} from "./storage.js";

import {
  drawLineChart,
  drawDonutChart,
  drawPercentBars
} from "./charts.js";

const state = loadState();
let calendarCursor = new Date();
let deferredInstallPrompt = null;

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(Number(value || 0));
const dateText = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
const shiftDate = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function numberValue(id){
  return Number($(id).value || 0);
}

function toast(message){
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2200);
}

function persist(){
  saveState(state);
}

function totals(records = state.records){
  return records.reduce((result, record) => ({
    gross: round2(result.gross + Number(record.gross)),
    federal: round2(result.federal + Number(record.federal)),
    medicare: round2(result.medicare + Number(record.medicare)),
    social: round2(result.social + Number(record.social)),
    retirement401k: round2(result.retirement401k + Number(record.retirement401k || 0)),
    insurance: round2(result.insurance + Number(record.insurance || 0)),
    other: round2(result.other + Number(record.other || 0)),
    net: round2(result.net + Number(record.net))
  }), {gross: 0, federal: 0, medicare: 0, social: 0, retirement401k: 0, insurance: 0, other: 0, net: 0});
}

function years(){
  const values = new Set(state.records.map(record => record.payDate.slice(0, 4)));
  values.add(new Date().getFullYear().toString());
  return [...values].sort();
}

function fillYearSelect(element, includeAll = false){
  const current = element.value;
  element.innerHTML = `${includeAll ? '<option value="all">All years</option>' : ""}${years().map(year => `<option value="${year}">${year}</option>`).join("")}`;
  if([...element.options].some(option => option.value === current)) element.value = current;
  else if([...element.options].some(option => option.value === "2026")) element.value = "2026";
}

function frequencyDays(){
  if(state.profile.frequency === "biweekly") return 14;
  if(state.profile.frequency === "monthly") return 30;
  return 7;
}

function expectedPaydays(count = 12){
  const dates = state.records.map(record => new Date(`${record.payDate}T12:00:00`)).sort((a, b) => a - b);
  const profileStart = state.profile.joiningDate ? new Date(state.profile.joiningDate + "T12:00:00") : null;
  let current = dates.at(-1) || profileStart;
  const result = [];
  if(!current || Number.isNaN(current.getTime())) return result;

  for(let index = 0; index < count; index++){
    current = new Date(current);
    current.setDate(current.getDate() + frequencyDays());
    result.push(new Date(current));
  }
  return result;
}

function nextPaydayText(){
  const now = new Date();
  const candidates = expectedPaydays(30);
  const next = candidates.find(date => date >= now) || candidates.at(-1);
  return next ? next.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) : "Set profile details";
}

function tenureText(){
  if(!state.profile.joiningDate) return "Not set";
  const start = new Date(`${state.profile.joiningDate}T12:00:00`);
  const now = new Date();
  let yearsValue = now.getFullYear() - start.getFullYear();
  let monthsValue = now.getMonth() - start.getMonth();
  let daysValue = now.getDate() - start.getDate();

  if(daysValue < 0){
    daysValue += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    monthsValue -= 1;
  }

  if(monthsValue < 0){
    monthsValue += 12;
    yearsValue -= 1;
  }

  return `${yearsValue} Years, ${monthsValue} Months, ${daysValue} Days`;
}

function applyTheme(theme = state.theme){
  state.theme = theme;
  persist();
  const isDark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  $("themeQuickToggle").textContent = isDark ? "Light mode" : "Dark mode";
  window.setTimeout(renderCharts, 40);
}

function showView(viewName){
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(button => button.classList.toggle("active", button.dataset.view === viewName));

  const target = $(`${viewName}View`);
  if(!target){
    toast("This section is unavailable.");
    return;
  }

  target.classList.add("active");
  $("pageTitle").textContent = {
    dashboard: "Dashboard",
    payroll: "Payroll Entry",
    reports: "Reports",
    analytics: "Analytics",
    calendar: "Pay Calendar",
    vault: "PDF Vault",
    settings: "Profile & Settings"
  }[viewName];

  $("sidebar").classList.remove("open");

  if(viewName === "vault") renderPdfList();
  if(viewName === "settings") renderSettings();
  if(viewName === "calendar") renderCalendar();
  if(viewName !== "payroll") renderAll();
}

function autoFillPayPeriod(){
  const payDate = $("payDate").value;
  if(!payDate){
    $("periodStart").value = "";
    $("periodEnd").value = "";
    return;
  }
  $("periodStart").value = shiftDate(payDate, -11);
  $("periodEnd").value = shiftDate(payDate, -5);
}

function calculateNet(){
  $("net").value = round2(numberValue("gross") - numberValue("federal") - numberValue("medicare") - numberValue("social") - numberValue("retirement401k") - numberValue("insurance") - numberValue("other")).toFixed(2);
}

function clearPaycheckForm(){
  ["payDate", "periodStart", "periodEnd", "gross", "federal", "medicare", "social", "retirement401k", "insurance", "other", "editIndex"].forEach(id => $(id).value = "");
  $("net").value = "0.00";
  $("payrollFormTitle").textContent = "Add paycheck";
}

function savePaycheck(){
  if(!$("payDate").value){
    toast("Enter a pay date.");
    return;
  }

  calculateNet();

  const record = {
    payDate: $("payDate").value,
    periodStart: $("periodStart").value || shiftDate($("payDate").value, -11),
    periodEnd: $("periodEnd").value || shiftDate($("payDate").value, -5),
    gross: numberValue("gross"),
    federal: numberValue("federal"),
    medicare: numberValue("medicare"),
    social: numberValue("social"),
    retirement401k: numberValue("retirement401k"),
    insurance: numberValue("insurance"),
    other: numberValue("other"),
    net: numberValue("net")
  };

  const editIndex = $("editIndex").value;
  if(editIndex === "") state.records.push(record);
  else state.records[Number(editIndex)] = record;

  state.records.sort((a, b) => a.payDate.localeCompare(b.payDate));
  persist();
  clearPaycheckForm();
  refreshYearSelects();
  renderAll();
  toast("Paycheck saved.");
}

window.editPaycheck = index => {
  const record = state.records[index];
  if(!record) return;

  $("payDate").value = record.payDate;
  $("periodStart").value = record.periodStart || shiftDate(record.payDate, -11);
  $("periodEnd").value = record.periodEnd || shiftDate(record.payDate, -5);
  $("gross").value = record.gross;
  $("federal").value = record.federal;
  $("medicare").value = record.medicare;
  $("social").value = record.social;
  $("retirement401k").value = record.retirement401k || 0;
  $("insurance").value = record.insurance || 0;
  $("other").value = record.other || 0;
  $("editIndex").value = index;
  $("payrollFormTitle").textContent = "Edit paycheck";
  calculateNet();
  showView("payroll");
  window.scrollTo({top: 0, behavior: "smooth"});
};

window.deletePaycheck = index => {
  if(!confirm("Delete this paycheck?")) return;
  state.records.splice(index, 1);
  persist();
  refreshYearSelects();
  renderAll();
  toast("Paycheck deleted.");
};

function payrollTable(records, includeActions = true){
  if(!records.length) return '<p class="helper">No payroll records found.</p>';

  const rows = records.map(record => {
    const index = state.records.indexOf(record);
    return `<tr>
      <td><strong>${dateText(record.payDate)}</strong><br><span>${dateText(record.periodStart || shiftDate(record.payDate, -11))} to ${dateText(record.periodEnd || shiftDate(record.payDate, -5))}</span></td>
      <td class="amount">${money(record.gross)}</td>
      <td class="amount">${money(record.federal)}</td>
      <td class="amount">${money(record.medicare)}</td>
      <td class="amount">${money(record.social)}</td>
      <td class="amount">${money(record.retirement401k || 0)}</td>
      <td class="amount">${money(record.insurance || 0)}</td>
      <td class="amount">${money(record.other || 0)}</td>
      <td class="amount"><span class="badge">${money(record.net)}</span></td>
      ${includeActions ? `<td><div class="actions"><button class="secondary" onclick="editPaycheck(${index})">Edit</button><button class="danger" onclick="deletePaycheck(${index})">Delete</button></div></td>` : ""}
    </tr>`;
  }).join("");

  return `<table>
    <thead><tr><th>Pay date and period</th><th class="amount">Gross</th><th class="amount">Federal</th><th class="amount">Medicare</th><th class="amount">Social Security</th><th class="amount">401(K)</th><th class="amount">Insurance</th><th class="amount">Other</th><th class="amount">Net</th>${includeActions ? "<th>Actions</th>" : ""}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPayrollTables(){
  $("recentPayroll").innerHTML = payrollTable(state.records.slice(-5).reverse(), false);

  const search = $("payrollSearch").value.toLowerCase();
  const selectedYear = $("payrollYear").value;

  const filtered = state.records.filter(record => {
    const yearMatch = selectedYear === "all" || record.payDate.startsWith(selectedYear);
    const searchMatch = !search || record.payDate.includes(search) || dateText(record.payDate).toLowerCase().includes(search);
    return yearMatch && searchMatch;
  });

  $("payrollTable").innerHTML = payrollTable(filtered, true);
}

function monthlyTotals(year){
  return Array.from({length: 12}, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return totals(state.records.filter(record => record.payDate.startsWith(`${year}-${month}`)));
  });
}

function updateBranding(){
  const employeeName = state.profile.name || "Employee";
  const companyName = state.profile.company || "Company";
  const companyInitial = companyName.trim().charAt(0).toUpperCase() || "P";

  $("brandCompany").textContent = state.profile.company?.trim() || "Payroll Pro";
  $("brandEmployee").textContent = state.profile.name?.trim() || "Payroll Management";
  $("brandLogo").textContent = state.profile.company?.trim() ? companyInitial : "P";
  document.title = `Payroll Pro v${APP_VERSION}${employeeName !== "Employee" ? ` | ${employeeName}` : ""}`;
}

function renderDashboard(){
  const profile = state.profile;
  const year = $("dashboardYear").value || years().at(-1);
  const yearRecords = state.records.filter(record => record.payDate.startsWith(year));
  const summary = totals(yearRecords);
  const average = yearRecords.length ? summary.net / yearRecords.length : 0;
  const maxNet = yearRecords.length ? Math.max(...yearRecords.map(record => record.net)) : 0;
  const minNet = yearRecords.length ? Math.min(...yearRecords.map(record => record.net)) : 0;

  $("dashboardName").textContent = profile.name || "Employee";
  $("dashboardCompany").textContent = profile.company || "Company";
  $("joiningText").textContent = profile.joiningDate
    ? new Date(`${profile.joiningDate}T12:00:00`).toLocaleDateString("en-US", {month: "long", day: "numeric", year: "numeric"})
    : "Not set";
  $("tenureText").textContent = tenureText();
  $("frequencyText").textContent = profile.frequency[0].toUpperCase() + profile.frequency.slice(1);
  $("nextPayday").textContent = nextPaydayText();

  const photo = profile.photo || "assets/avatar.png";
  $("dashboardPhoto").src = photo;
  $("settingsPhoto").src = photo;

  $("dashboardKpis").innerHTML = [
    ["Gross Pay YTD", money(summary.gross), "Selected year"],
    ["Net Payment YTD", money(summary.net), "Take-home pay"],
    ["Federal Tax YTD", money(summary.federal), "Withheld"],
    ["Average Paycheck", money(average), `${yearRecords.length} paychecks`],
    ["Net Pay Range", `${money(minNet)} to ${money(maxNet)}`, "Lowest to highest"]
  ].map(item => `<article class="card kpi"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join("");
}

function renderReports(){
  const year = $("reportYear").value || years().at(-1);
  const records = state.records.filter(record => record.payDate.startsWith(year));
  const summary = totals(records);
  const average = records.length ? summary.net / records.length : 0;
  const deductions = summary.federal + summary.medicare + summary.social + summary.retirement401k + summary.insurance + summary.other;

  $("reportKpis").innerHTML = [
    ["Annual Gross", money(summary.gross), year],
    ["Annual Net", money(summary.net), year],
    ["Total Deductions", money(deductions), "Federal and payroll taxes"],
    ["Average Net Pay", money(average), `${records.length} paychecks`],
    ["Net Pay Rate", summary.gross ? `${(summary.net / summary.gross * 100).toFixed(1)}%` : "0%", "Net divided by gross"]
  ].map(item => `<article class="card kpi"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join("");

  $("reportTaxSummary").innerHTML = [
    ["Federal Tax", summary.federal],
    ["Medicare", summary.medicare],
    ["Social Security", summary.social],
    ["401(K)", summary.retirement401k],
    ["Insurance", summary.insurance],
    ["Other", summary.other],
    ["Total Deductions", deductions]
  ].map(item => `<div class="metric-row"><span>${item[0]}</span><strong>${money(item[1])}</strong></div>`).join("");

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthly = monthlyTotals(year);

  $("monthlyReportTable").innerHTML = `<table>
    <thead><tr><th>Month</th><th class="amount">Gross</th><th class="amount">Federal</th><th class="amount">Medicare</th><th class="amount">Social Security</th><th class="amount">401(K)</th><th class="amount">Insurance</th><th class="amount">Other</th><th class="amount">Net</th></tr></thead>
    <tbody>${monthly.map((value, index) => `<tr><td>${monthNames[index]}</td><td class="amount">${money(value.gross)}</td><td class="amount">${money(value.federal)}</td><td class="amount">${money(value.medicare)}</td><td class="amount">${money(value.social)}</td><td class="amount">${money(value.net)}</td></tr>`).join("")}</tbody>
  </table>`;
}

function renderAnalytics(){
  const year = $("analyticsYear").value || years().at(-1);
  const records = state.records.filter(record => record.payDate.startsWith(year));
  const summary = totals(records);
  const averageGross = records.length ? summary.gross / records.length : 0;
  const averageNet = records.length ? summary.net / records.length : 0;
  const deductions = summary.federal + summary.medicare + summary.social + summary.retirement401k + summary.insurance + summary.other;
  const netValues = records.map(record => record.net);
  const variability = netValues.length ? Math.max(...netValues) - Math.min(...netValues) : 0;
  const trend = netValues.length > 1 ? netValues.at(-1) - netValues[0] : 0;

  $("analyticsKpis").innerHTML = [
    ["Average Gross", money(averageGross), "Per paycheck"],
    ["Average Net", money(averageNet), "Per paycheck"],
    ["Deduction Rate", summary.gross ? `${(deductions / summary.gross * 100).toFixed(1)}%` : "0%", "All deductions"],
    ["Net Pay Rate", summary.gross ? `${(summary.net / summary.gross * 100).toFixed(1)}%` : "0%", "Take-home ratio"],
    ["Net Trend", `${trend >= 0 ? "+" : ""}${money(trend)}`, "First to latest"]
  ].map(item => `<article class="card kpi"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join("");

  const current = records.at(-1);
  const previous = records.at(-2);

  if(!current || !previous){
    $("comparisonGrid").innerHTML = '<p class="helper">At least two paychecks are required.</p>';
    return;
  }

  const metrics = [
    ["Gross", current.gross, previous.gross],
    ["Federal", current.federal, previous.federal],
    ["Medicare", current.medicare, previous.medicare],
    ["Social Security", current.social, previous.social],
    ["401(K)", current.retirement401k || 0, previous.retirement401k || 0],
    ["Insurance", current.insurance || 0, previous.insurance || 0],
    ["Other", current.other || 0, previous.other || 0],
    ["Net", current.net, previous.net]
  ];

  $("comparisonGrid").innerHTML = metrics.map(([label, currentValue, previousValue]) => {
    const difference = round2(currentValue - previousValue);
    const percentage = previousValue ? difference / previousValue * 100 : 0;
    return `<div class="comparison-card"><span>${label}</span><strong>${money(currentValue)}</strong><small class="${difference >= 0 ? "up" : "down"}">${difference >= 0 ? "+" : ""}${money(difference)} (${percentage >= 0 ? "+" : ""}${percentage.toFixed(1)}%)</small></div>`;
  }).join("");
}

function renderCalendar(){
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $("calendarTitle").textContent = calendarCursor.toLocaleDateString("en-US", {month: "long", year: "numeric"});

  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const actualDates = new Set(state.records.map(record => record.payDate));
  const expectedDates = new Set(expectedPaydays(40).map(date => date.toISOString().slice(0, 10)));
  const today = new Date().toISOString().slice(0, 10);

  let calendar = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => `<div class="calendar-head">${day}</div>`).join("");

  for(let index = 0; index < 42; index++){
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const classes = ["calendar-day"];

    if(date.getMonth() !== month) classes.push("muted");
    if(iso === today) classes.push("today");
    if(actualDates.has(iso)) classes.push("payday");
    else if(expectedDates.has(iso)) classes.push("expected");

    const tag = actualDates.has(iso) ? "Recorded payday" : expectedDates.has(iso) ? "Expected payday" : "";

    calendar += `<div class="${classes.join(" ")}"><span class="day-number">${date.getDate()}</span>${tag ? `<span class="day-tag">${tag}</span>` : ""}</div>`;
  }

  $("calendarGrid").innerHTML = calendar;

  $("upcomingEvents").innerHTML = expectedPaydays(6).map((date, index) =>
    `<div class="event-item"><strong>${date.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric", year: "numeric"})}</strong><span>${index === 0 ? "Next expected payday" : "Expected payroll date"}</span></div>`
  ).join("");
}

function renderCharts(){
  const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const dashboardYear = $("dashboardYear").value || years().at(-1);
  const dashboardMonthly = monthlyTotals(dashboardYear);
  drawLineChart($("dashboardTrendChart"), monthLabels, [
    {label: "Gross pay", data: dashboardMonthly.map(value => value.gross), color: "#5b2c6f"},
    {label: "Net pay", data: dashboardMonthly.map(value => value.net), color: "#00a6a6"}
  ]);

  const dashboardSummary = totals(state.records.filter(record => record.payDate.startsWith(dashboardYear)));
  drawDonutChart($("dashboardDonutChart"), ["Net pay","Federal tax","Medicare","Social Security","401(K)","Insurance","Other"], [dashboardSummary.net, dashboardSummary.federal, dashboardSummary.medicare, dashboardSummary.social, dashboardSummary.retirement401k, dashboardSummary.insurance, dashboardSummary.other]);

  const reportYear = $("reportYear").value || dashboardYear;
  const reportMonthly = monthlyTotals(reportYear);
  drawLineChart($("reportTrendChart"), monthLabels, [
    {label: "Gross pay", data: reportMonthly.map(value => value.gross), color: "#5b2c6f"},
    {label: "Net pay", data: reportMonthly.map(value => value.net), color: "#00a6a6"}
  ]);

  const analyticsYear = $("analyticsYear").value || dashboardYear;
  const analyticsRecords = state.records.filter(record => record.payDate.startsWith(analyticsYear));

  drawLineChart(
    $("analyticsTrendChart"),
    analyticsRecords.map(record => new Date(`${record.payDate}T12:00:00`).toLocaleDateString("en-US", {month: "short", day: "numeric"})),
    [{label: "Net pay", data: analyticsRecords.map(record => record.net), color: "#00a6a6"}],
    300
  );

  drawPercentBars(
    $("analyticsRateChart"),
    analyticsRecords.map(record => new Date(`${record.payDate}T12:00:00`).toLocaleDateString("en-US", {month: "short", day: "numeric"})),
    [
      {label: "Federal rate", data: analyticsRecords.map(record => record.gross ? record.federal / record.gross * 100 : 0), color: "#5b2c6f"},
      {label: "Payroll tax rate", data: analyticsRecords.map(record => record.gross ? (record.medicare + record.social) / record.gross * 100 : 0), color: "#f59e0b"}
    ]
  );
}

function exportCsv(records = state.records, filename = "Payroll_YTD_Report.csv"){
  let grossYtd = 0;
  let federalYtd = 0;
  let medicareYtd = 0;
  let socialYtd = 0;
  let retirement401kYtd = 0;
  let insuranceYtd = 0;
  let otherYtd = 0;
  let netYtd = 0;

  const rows = [["Sl No","Pay Date","Period From","Period To","Gross Pay","Gross YTD","Federal Tax","Federal YTD","Medicare","Medicare YTD","Soc Security","Soc Security YTD","401(K)","401(K) YTD","Insurance","Insurance YTD","Other","Other YTD","Net Payment","Net YTD"]];

  records.forEach((record, index) => {
    grossYtd = round2(grossYtd + record.gross);
    federalYtd = round2(federalYtd + record.federal);
    medicareYtd = round2(medicareYtd + record.medicare);
    socialYtd = round2(socialYtd + record.social);
    retirement401kYtd = round2(retirement401kYtd + Number(record.retirement401k || 0));
    insuranceYtd = round2(insuranceYtd + Number(record.insurance || 0));
    otherYtd = round2(otherYtd + Number(record.other || 0));
    netYtd = round2(netYtd + record.net);

    rows.push([
      index + 1,
      record.payDate,
      record.periodStart || shiftDate(record.payDate, -11),
      record.periodEnd || shiftDate(record.payDate, -5),
      record.gross,
      grossYtd,
      record.federal,
      federalYtd,
      record.medicare,
      medicareYtd,
      record.social,
      socialYtd,
      record.retirement401k || 0,
      retirement401kYtd,
      record.insurance || 0,
      insuranceYtd,
      record.other || 0,
      otherYtd,
      record.net,
      netYtd
    ]);
  });

  downloadBlob(
    rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"),
    filename,
    "text/csv"
  );
}

function downloadBlob(content, filename, type){
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readJson(file, callback){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      callback(JSON.parse(reader.result));
    }catch{
      toast("The selected backup file is invalid.");
    }
  };
  reader.readAsText(file);
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl){
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], {type: mime});
}

async function uploadPdfs(files){
  for(const file of [...files]){
    if(file.type !== "application/pdf") continue;
    await savePdf({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      created: new Date().toISOString(),
      blob: file
    });
  }

  $("pdfUpload").value = "";
  await renderPdfList();
  toast("PDF upload complete.");
}

window.openStoredPdf = async id => {
  const documents = await getAllPdfs();
  const document = documents.find(item => item.id === id);
  if(!document) return;

  const url = URL.createObjectURL(document.blob);
  window.open(url, "_blank");
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

window.deleteStoredPdf = async id => {
  if(!confirm("Delete this PDF?")) return;
  await removePdf(id);
  await renderPdfList();
  toast("PDF deleted.");
};

async function renderPdfList(){
  const search = $("pdfSearch").value.toLowerCase();
  const sort = $("pdfSort").value;
  let documents = (await getAllPdfs()).filter(document => document.name.toLowerCase().includes(search));

  documents.sort(
    sort === "name" ? (a, b) => a.name.localeCompare(b.name) :
    sort === "oldest" ? (a, b) => a.created.localeCompare(b.created) :
    (a, b) => b.created.localeCompare(a.created)
  );

  $("pdfList").innerHTML = documents.length ? documents.map(document =>
    `<div class="document-card"><strong>${document.name}</strong><span>${(document.size / 1024).toFixed(1)} KB · ${new Date(document.created).toLocaleDateString()}</span><div class="document-actions"><button class="secondary" onclick="openStoredPdf('${document.id}')">Open</button><button class="danger" onclick="deleteStoredPdf('${document.id}')">Delete</button></div></div>`
  ).join("") : '<p class="helper">No PDF files stored.</p>';
}

function renderSettings(){
  $("profileName").value = state.profile.name;
  $("profileCompany").value = state.profile.company;
  $("profileJoining").value = state.profile.joiningDate;
  $("profileFrequency").value = state.profile.frequency;
  $("settingsPhoto").src = state.profile.photo || "assets/avatar.png";

  const supported = "Notification" in window;
  $("notificationStatus").textContent = `Status: ${supported ? Notification.permission : "unsupported"}`;
  $("reminderDays").value = state.notifications.daysBefore;
  $("missingReminder").checked = !!state.notifications.missingPaycheck;
  $("backupReminder").checked = !!state.notifications.backupReminder;

  renderNotificationList();
}

function saveProfile(){
  state.profile.name = $("profileName").value.trim();
  state.profile.company = $("profileCompany").value.trim();
  state.profile.joiningDate = $("profileJoining").value;
  state.profile.frequency = $("profileFrequency").value;
  persist();
  renderAll();
  toast("Profile saved.");
}

function handlePhoto(file){
  const reader = new FileReader();
  reader.onload = () => {
    state.profile.photo = reader.result;
    persist();
    renderAll();
    toast("Profile photo updated.");
  };
  reader.readAsDataURL(file);
}

function buildNotifications(){
  const alerts = [];
  const now = new Date();
  const next = expectedPaydays(30).find(date => date >= now) || expectedPaydays(1)[0];
  if(!next) return alerts;
  const daysUntil = Math.ceil((next - now) / 86400000);

  if(daysUntil >= 0 && daysUntil <= Number(state.notifications.daysBefore)){
    alerts.push({
      title: daysUntil === 0 ? "Payday today" : "Payday approaching",
      body: `Expected payday is ${next.toLocaleDateString("en-US", {month: "short", day: "numeric"})}.`
    });
  }

  if(state.notifications.missingPaycheck && state.records.length){
    const last = new Date(`${state.records.at(-1).payDate}T12:00:00`);
    const gap = Math.floor((now - last) / 86400000);
    if(gap > frequencyDays() + 3){
      alerts.push({
        title: "Missing paycheck entry",
        body: `The last recorded paycheck was ${dateText(state.records.at(-1).payDate)}.`
      });
    }
  }

  if(state.notifications.backupReminder){
    const lastBackup = state.notifications.lastBackup ? new Date(state.notifications.lastBackup) : null;
    if(!lastBackup || (now - lastBackup) / 86400000 > 30){
      alerts.push({
        title: "Backup recommended",
        body: "Download a full backup of payroll data and PDFs."
      });
    }
  }

  return alerts;
}

function renderNotificationList(){
  const alerts = buildNotifications();
  $("notificationList").innerHTML = alerts.length ? alerts.map(alert =>
    `<div class="event-item"><strong>${alert.title}</strong><span>${alert.body}</span></div>`
  ).join("") : '<p class="helper">No current alerts.</p>';
}

async function enableNotifications(){
  if(!("Notification" in window)){
    toast("Notifications are not supported in this browser.");
    return;
  }

  const permission = await Notification.requestPermission();
  renderSettings();

  if(permission === "granted"){
    new Notification("Payroll Pro", {
      body: "Payday reminders are enabled.",
      icon: "assets/icon-192.png"
    });
    toast("Notifications enabled.");
  }else{
    toast("Notification permission was not granted.");
  }
}

function saveNotificationSettings(){
  state.notifications.daysBefore = Number($("reminderDays").value);
  state.notifications.missingPaycheck = $("missingReminder").checked;
  state.notifications.backupReminder = $("backupReminder").checked;
  persist();
  renderNotificationList();
  toast("Reminder settings saved.");
}

function sendDueNotification(){
  if(!("Notification" in window) || Notification.permission !== "granted") return;

  const alerts = buildNotifications();
  if(!alerts.length) return;

  const today = new Date().toISOString().slice(0, 10);
  const notificationKey = "payrollProV1LastNotice";

  if(localStorage.getItem(notificationKey) !== today){
    new Notification(alerts[0].title, {
      body: alerts[0].body,
      icon: "assets/icon-192.png"
    });
    localStorage.setItem(notificationKey, today);
  }
}

function backupPayroll(){
  state.notifications.lastBackup = new Date().toISOString();
  persist();
  downloadBlob(JSON.stringify({version: APP_VERSION, state}, null, 2), "Payroll_Pro_Backup.json", "application/json");
  toast("Payroll backup downloaded.");
}

function restorePayroll(file){
  readJson(file, data => {
    const restored = data.state || data;
    if(!Array.isArray(restored.records) || !restored.profile){
      toast("The backup file is missing required data.");
      return;
    }

    Object.assign(state, restored);
    persist();
    refreshYearSelects();
    applyTheme();
    renderAll();
    toast("Payroll backup restored.");
  });
}

async function backupFull(){
  state.notifications.lastBackup = new Date().toISOString();
  persist();
  toast("Preparing full backup.");

  const documents = await getAllPdfs();
  const pdfs = [];

  for(const document of documents){
    pdfs.push({
      id: document.id,
      name: document.name,
      size: document.size,
      created: document.created,
      dataUrl: await fileToDataUrl(document.blob)
    });
  }

  downloadBlob(
    JSON.stringify({version: APP_VERSION, created: new Date().toISOString(), state, pdfs}, null, 2),
    "Payroll_Pro_Full_Backup.json",
    "application/json"
  );

  toast("Full backup downloaded.");
}

function restoreFull(file){
  readJson(file, async data => {
    if(!data.state || !Array.isArray(data.state.records)){
      toast("The full backup file is invalid.");
      return;
    }

    Object.assign(state, data.state);
    persist();

    await clearPdfs();
    for(const document of data.pdfs || []){
      await savePdf({
        id: document.id || crypto.randomUUID(),
        name: document.name,
        size: document.size,
        created: document.created,
        blob: dataUrlToBlob(document.dataUrl)
      });
    }

    refreshYearSelects();
    applyTheme();
    renderAll();
    await renderPdfList();
    toast("Full backup restored.");
  });
}

async function resetEverything(){
  if(!confirm("Delete payroll records, profile, settings, and stored PDFs from this device?")) return;

  const fresh = defaultState();
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, fresh);
  persist();
  await clearPdfs();
  refreshYearSelects();
  applyTheme();
  renderAll();
  await renderPdfList();
  toast("All local app data was reset.");
}

function renderAll(){
  state.records.forEach(record => {
    record.retirement401k = Number(record.retirement401k || 0);
    record.insurance = Number(record.insurance || 0);
    record.other = Number(record.other || 0);
    record.net = round2(Number(record.gross) - Number(record.federal) - Number(record.medicare) - Number(record.social) - record.retirement401k - record.insurance - record.other);
    record.periodStart = record.periodStart || shiftDate(record.payDate, -11);
    record.periodEnd = record.periodEnd || shiftDate(record.payDate, -5);
  });

  persist();
  updateBranding();
  renderDashboard();
  renderPayrollTables();
  renderReports();
  renderAnalytics();
  renderCalendar();
  renderSettings();
  renderCharts();
}

function refreshYearSelects(){
  fillYearSelect($("dashboardYear"));
  fillYearSelect($("payrollYear"), true);
  fillYearSelect($("reportYear"));
  fillYearSelect($("analyticsYear"));
}

function bindEvents(){
  document.querySelectorAll(".nav-btn").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-view-link]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewLink)));

  ["gross","federal","medicare","social","retirement401k","insurance","other"].forEach(id => $(id).addEventListener("input", calculateNet));
  $("payDate").addEventListener("change", autoFillPayPeriod);

  $("savePaycheck").addEventListener("click", savePaycheck);
  $("clearPaycheck").addEventListener("click", clearPaycheckForm);
  $("quickAdd").addEventListener("click", () => showView("payroll"));

  $("payrollSearch").addEventListener("input", renderPayrollTables);
  $("payrollYear").addEventListener("change", renderPayrollTables);
  $("dashboardYear").addEventListener("change", () => {renderDashboard(); renderCharts();});
  $("reportYear").addEventListener("change", () => {renderReports(); renderCharts();});
  $("analyticsYear").addEventListener("change", () => {renderAnalytics(); renderCharts();});

  $("exportPayrollCsv").addEventListener("click", () => exportCsv());
  $("exportReportCsv").addEventListener("click", () => {
    const year = $("reportYear").value;
    exportCsv(state.records.filter(record => record.payDate.startsWith(year)), `Payroll_Report_${year}.csv`);
  });
  $("printReport").addEventListener("click", () => window.print());

  $("calendarPrevious").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  $("calendarNext").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });

  $("pdfUpload").addEventListener("change", event => uploadPdfs(event.target.files));
  $("pdfSearch").addEventListener("input", renderPdfList);
  $("pdfSort").addEventListener("change", renderPdfList);

  $("photoUpload").addEventListener("change", event => {
    if(event.target.files[0]) handlePhoto(event.target.files[0]);
  });
  $("saveProfile").addEventListener("click", saveProfile);

  $("enableNotifications").addEventListener("click", enableNotifications);
  $("saveNotificationSettings").addEventListener("click", saveNotificationSettings);

  $("fullBackup").addEventListener("click", backupFull);
  $("fullRestore").addEventListener("change", event => {
    if(event.target.files[0]) restoreFull(event.target.files[0]);
  });
  $("payrollBackup").addEventListener("click", backupPayroll);
  $("payrollRestore").addEventListener("change", event => {
    if(event.target.files[0]) restorePayroll(event.target.files[0]);
  });

  $("lightTheme").addEventListener("click", () => applyTheme("light"));
  $("darkTheme").addEventListener("click", () => applyTheme("dark"));
  $("systemTheme").addEventListener("click", () => applyTheme("system"));
  $("themeQuickToggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  $("resetEverything").addEventListener("click", resetEverything);
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));

  window.addEventListener("resize", () => window.setTimeout(renderCharts, 100));
}

function setupInstallPrompt(){
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if(!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

function setupServiceWorker(){
  if(!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js?v=1.0").then(registration => {
    registration.update();

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker.addEventListener("statechange", () => {
        if(worker.state === "installed" && navigator.serviceWorker.controller){
          $("updateBanner").classList.remove("hidden");
        }
      });
    });

    window.setInterval(() => registration.update(), 60 * 60 * 1000);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());

  $("applyUpdate").addEventListener("click", async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if(registration?.waiting) registration.waiting.postMessage({type: "SKIP_WAITING"});
    else window.location.reload();
  });
}

function initialize(){
  bindEvents();
  setupInstallPrompt();
  setupServiceWorker();
  refreshYearSelects();

  $("todayText").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  $("versionText").textContent = `Version ${APP_VERSION}`;
  applyTheme(state.theme);
  renderAll();
  renderPdfList();
  sendDueNotification();
}

initialize();
window.setTimeout(updateBranding, 50);
