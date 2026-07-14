export const APP_VERSION = "1.5.2";
export const STORAGE_KEY = "payrollProV15";
const PREVIOUS_STORAGE_KEY = "payrollProV1";
const LEGACY_STORAGE_KEY = "personalPayrollHubV1";
export const PDF_DB = "payrollProV15Vault";
export const PDF_STORE = "pdfs";

export function round2(value){
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function shiftedDate(dateValue, days){
  if(!dateValue) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const initialRecords = [];

export function defaultState(){
  return {
    version: APP_VERSION,
    profile: {
      name: "",
      company: "",
      joiningDate: "",
      frequency: "weekly",
      photo: null
    },
    records: [],
    theme: "system",
    notifications: {
      daysBefore: 1,
      missingPaycheck: false,
      backupReminder: false,
      lastBackup: null
    }
  };
}

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREVIOUS_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved = JSON.parse(raw || "null");
    if(!saved) return defaultState();

    const merged = defaultState();
    merged.profile = {...merged.profile, ...(saved.profile || {})};
    merged.records = Array.isArray(saved.records)
      ? saved.records.map(record => ({
          ...record,
          retirement401k: Number(record.retirement401k || 0),
          insurance: Number(record.insurance || 0),
          other: Number(record.other || 0),
          sourcePdfId: record.sourcePdfId || "",
          sourcePdfName: record.sourcePdfName || "",
          extractionConfidence: Number(record.extractionConfidence || 0),
          ytdGross: Number(record.ytdGross || 0),
          ytdNet: Number(record.ytdNet || 0),
          periodStart: record.periodStart || shiftedDate(record.payDate, -11),
          periodEnd: record.periodEnd || shiftedDate(record.payDate, -5)
        }))
      : [];
    merged.theme = saved.theme || merged.theme;
    merged.notifications = {...merged.notifications, ...(saved.notifications || {})};
    return merged;
  }catch{
    return defaultState();
  }
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function openPdfDatabase(){
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PDF_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(PDF_STORE)){
        db.createObjectStore(PDF_STORE, {keyPath: "id"});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPdfs(){
  const db = await openPdfDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(PDF_STORE).objectStore(PDF_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdf(document){
  const db = await openPdfDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put(document);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePdf(id){
  const db = await openPdfDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPdfs(){
  const db = await openPdfDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
