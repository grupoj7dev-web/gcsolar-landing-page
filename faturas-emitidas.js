import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlBxFfzmhnapsLJbM1UeYOalrfWYOSr1I",
  authDomain: "gcredito.firebaseapp.com",
  projectId: "gcredito",
  storageBucket: "gcredito.firebasestorage.app",
  messagingSenderId: "697167575956",
  appId: "1:697167575956:web:7a641d00aae7f8676f6d81",
  measurementId: "G-ZS8XN2VECC",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLL_EMITIDAS = "gcredito_faturas_emitidas";
const COLL_VALIDACAO = "gcredito_faturas_validacao";
const COLL_INVOICE_DATA = "invoice_data";
const COLL_INVOICE_DATA_ALT = "gcredito_invoice_data";
const COLL_ASAAS_KEYS = "asaas_keys";

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const refreshBtn = document.getElementById("refreshBtn");

const scoreTotal = document.getElementById("scoreTotal");
const scoreValor = document.getElementById("scoreValor");
const scorePagas = document.getElementById("scorePagas");
const scoreTaxa = document.getElementById("scoreTaxa");

const updatedAtLabel = document.getElementById("updatedAtLabel");
const counterLabel = document.getElementById("counterLabel");
const invoiceTableBody = document.getElementById("invoiceTableBody");
const LAST_EMITIDA_KEY = "gcsolar_last_emitida_id";
const LOCAL_DELETED_KEY = "gcsolar_emitidas_deleted_ids";

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let emittedInvoices = [];
let pollingTimer = null;
let pollingInFlight = false;
let asaasConfig = null;
let pdfLibsLoader = null;

function getLocallyDeletedIds() {
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_KEY) || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x || "").trim()).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

function setLocallyDeletedIds(idsSet) {
  try {
    const arr = [...idsSet].filter(Boolean);
    localStorage.setItem(LOCAL_DELETED_KEY, JSON.stringify(arr));
  } catch (_) { }
}

function isMobile() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = themeBtn?.querySelector("i");
  if (!icon) return;
  icon.classList.remove("ph-moon", "ph-sun");
  icon.classList.add(theme === "dark" ? "ph-sun" : "ph-moon");
}

function initTheme() {
  const saved = localStorage.getItem(themeKey);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (systemDark ? "dark" : "light"));
}

function applySidebarState() {
  const collapsed = localStorage.getItem(collapsedKey) === "1";
  if (!isMobile() && collapsed) appShell.classList.add("sidebar-collapsed");
  else appShell.classList.remove("sidebar-collapsed");
}

function asDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const s = value.trim();
    // DD/MM/YYYY ou DD/MM/YYYY, HH:mm:ss
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      const day = Number(br[1]);
      const month = Number(br[2]) - 1;
      const year = Number(br[3]);
      const hh = Number(br[4] || 0);
      const mm = Number(br[5] || 0);
      const ss = Number(br[6] || 0);
      const d = new Date(year, month, day, hh, mm, ss);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTime(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function brl(value) {
  return toNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function resolveValor(item) {
  return (
    item.invoice_value ??
    item.valor_total ??
    item.dados_calculados?.dadosExtraidos?.valorTotal ??
    item.dados_calculados?.full_result?.dados_extraidos?.invoice_value ??
    0
  );
}

function resolveInvoiceUrl(item) {
  return (
    item.fatura_url ||
    item.invoice_url ||
    item.pdf_url ||
    item.downloadUrl ||
    item.attachments?.invoice?.downloadUrl ||
    ""
  );
}

function applyPaymentDataToEnergyHtml(energyHtml, record) {
  const raw = String(energyHtml || "").trim();
  if (!raw) return raw;

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");

  const rawLine =
    String(record.boleto_identification_field || "").trim() ||
    String(record.boleto_barcode || "").trim() ||
    "";
  const lineDigits = onlyDigits(rawLine);
  const lineReadable = lineDigits || "Linha digitavel indisponivel";
  const barcodeDigits = onlyDigits(record.boleto_barcode || "") || lineDigits;
  const barcodeImgUrl = barcodeDigits
    ? `https://bwipjs-api.metafloor.com/?bcid=code128&scale=2&height=12&includetext=false&text=${encodeURIComponent(barcodeDigits)}`
    : "";

  const barcodeEl = doc.querySelector(".j7-barcode-placeholder");
  if (barcodeEl) {
    if (barcodeImgUrl) {
      barcodeEl.innerHTML = `
        <div style="width:100%;display:grid;gap:6px;">
          <img src="${barcodeImgUrl}" alt="Codigo de barras" style="width:100%;height:44px;object-fit:fill;display:block;">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.01em;word-break:break-all;line-height:1.2;text-align:center;">${lineReadable}</div>
        </div>
      `;
    } else {
      barcodeEl.textContent = "Codigo de barras indisponivel";
      barcodeEl.style.fontSize = "0.82rem";
      barcodeEl.style.fontWeight = "700";
      barcodeEl.style.letterSpacing = "0.02em";
      barcodeEl.style.whiteSpace = "normal";
      barcodeEl.style.wordBreak = "break-word";
    }
  }

  const qrRaw =
    String(record.pix_qr_code || "").trim() ||
    "";
  const qrImage =
    qrRaw && qrRaw.startsWith("data:image")
      ? qrRaw
      : (qrRaw ? `data:image/png;base64,${qrRaw}` : "");

  const qrEl = doc.querySelector(".j7-qrcode-placeholder");
  if (qrEl) {
    if (qrImage) {
      qrEl.innerHTML = `<img src="${qrImage}" alt="QR Code PIX" style="width:100%;height:100%;object-fit:contain;display:block;">`;
    } else {
      const pixText = String(record.pix_payload || "").trim();
      qrEl.textContent = pixText ? "PIX Copia e Cola" : "QR indisponivel";
      qrEl.style.fontSize = "0.74rem";
      qrEl.style.fontWeight = "700";
    }
  }

  return doc.body.innerHTML;
}

function buildCombinedInvoiceHtml(record) {
  const energyHtml = applyPaymentDataToEnergyHtml(
    String(record.fatura_energypay_html || "").trim(),
    record
  );
  const equatorialPreview = String(record.fatura_equatorial_preview || "").trim();
  if (!energyHtml && !equatorialPreview) return "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Fatura Combinada</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${window.location.origin}/dashboard.css">
<link rel="stylesheet" href="${window.location.origin}/fatura-manual.css">
<style>
@page { size: A4; margin: 0; }
html,body{margin:0;padding:0;background:#ffffff;font-family:Inter,Arial,sans-serif}
.doc{width:100%}
.page{width:210mm;min-height:297mm;box-sizing:border-box;margin:0 auto;padding:6mm;background:#fff}
.page + .page{page-break-before:always;break-before:page}
.energy-wrap{display:flex;justify-content:center;align-items:flex-start}
.energy-wrap .invoice-j7{transform:scale(0.90);transform-origin:top center;width:calc(100% / 0.90);margin:0 auto}
.equatorial-wrap{width:100%;height:calc(297mm - 12mm);display:flex;align-items:flex-start;justify-content:center;overflow:hidden}
.equatorial-wrap img{max-width:100%;max-height:100%;object-fit:contain;display:block}
</style></head><body><div class="doc">
<section class="page page-energy"><div class="energy-wrap">${energyHtml || "<p>Sem preview.</p>"}</div></section>
<section class="page page-equatorial"><div class="equatorial-wrap">${equatorialPreview ? `<img src="${equatorialPreview}" alt="Fatura Equatorial">` : "<p>Sem preview.</p>"}</div></section>
</div></body></html>`;
}

async function downloadCombinedAsPdf(record) {
  const energyHtml = applyPaymentDataToEnergyHtml(
    String(record.fatura_energypay_html || "").trim(),
    record
  );
  const equatorialPreview = String(record.fatura_equatorial_preview || "").trim();
  if (!energyHtml && !equatorialPreview) {
    window.alert("Não foi encontrado arquivo para download.");
    return;
  }

  if (!pdfLibsLoader) {
    pdfLibsLoader = (async () => {
      const loadScript = (src) =>
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.onload = resolve;
          s.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
          document.head.appendChild(s);
        });
      if (!window.html2canvas) await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
      if (!window.jspdf?.jsPDF) await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    })();
  }
  await pdfLibsLoader;

  const { jsPDF } = window.jspdf;
  const pageW = 210;
  const pageH = 297;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const fitToPage = (imgW, imgH) => {
    const ratio = Math.min(pageW / imgW, pageH / imgH);
    const w = imgW * ratio;
    const h = imgH * ratio;
    return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  };

  const captureHost = document.createElement("div");
  captureHost.style.position = "fixed";
  captureHost.style.left = "-100000px";
  captureHost.style.top = "0";
  captureHost.style.width = "900px";
  captureHost.style.background = "#ffffff";
  captureHost.innerHTML = `
    <link rel="stylesheet" href="${window.location.origin}/dashboard.css">
    <link rel="stylesheet" href="${window.location.origin}/fatura-manual.css">
    <div style="background:#fff;padding:0;">${energyHtml || "<div></div>"}</div>
  `;
  document.body.appendChild(captureHost);

  try {
    const invoiceEl =
      captureHost.querySelector(".invoice-j7") ||
      captureHost.querySelector("article") ||
      captureHost.firstElementChild ||
      captureHost;

    const canvas = await window.html2canvas(invoiceEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const m = 3;
    pdf.addImage(imgData, "JPEG", m, m, pageW - m * 2, pageH - m * 2, undefined, "FAST");

    if (equatorialPreview) {
      pdf.addPage("a4", "p");
      const sz = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = reject;
        img.src = equatorialPreview;
      });
      const second = fitToPage(sz.w, sz.h);
      pdf.addImage(equatorialPreview, "JPEG", second.x, second.y, second.w, second.h, undefined, "FAST");
    }

    const uc = String(resolveUc(record) || "sem-uc").replace(/[^\w-]/g, "");
    const ref = String(resolveReferencia(record) || "sem-referencia").replace(/[^\w-]/g, "_");
    pdf.save(`fatura-combinada-${uc}-${ref}.pdf`);
  } finally {
    captureHost.remove();
  }
}

function resolvePaymentStatusRaw(item) {
  return String(item.status_pagamento || item.payment_status || "pendente").toLowerCase().trim();
}

function resolvePaymentStatus(item) {
  const raw = resolvePaymentStatusRaw(item);
  if (raw.includes("pago") || raw.includes("receb")) return "pago";
  if (raw.includes("venc")) return "vencido";
  const due = asDate(item.data_vencimento || item.due_date || item.vencimento);
  if (raw.includes("pend") && due && due.getTime() < Date.now()) return "vencido";
  return "pendente";
}

function statusPill(status) {
  if (status === "pago") return '<span class="status-pill pago"><i class="ph ph-check-circle"></i>Pago</span>';
  if (status === "vencido") return '<span class="status-pill vencido"><i class="ph ph-warning-circle"></i>Vencido</span>';
  if (status === "pendente") return '<span class="status-pill pendente"><i class="ph ph-hourglass"></i>Pendente</span>';
  return `<span class="status-pill outro">${status}</span>`;
}

function resolveNumero(item) {
  return item.numero_fatura || item.invoice_number || item.id || "-";
}

function resolveUc(item) {
  return (
    item.uc ||
    item.consumer_unit ||
    item.dados_calculados?.dadosExtraidos?.uc ||
    item.dados_calculados?.full_result?.dados_extraidos?.consumer_unit ||
    "-"
  );
}

function resolveDocumento(item) {
  return (
    item.documento ||
    item.document ||
    item.cnpj_cpf ||
    item.dados_calculados?.dadosExtraidos?.cpfCnpj ||
    item.dados_calculados?.full_result?.dados_extraidos?.cnpj_cpf ||
    "-"
  );
}

function resolveReferencia(item) {
  return item.referencia || item.month_reference || item.mes_referencia || "-";
}

function resolveNome(item) {
  return (
    item.subscriber_name ||
    item.nome_cliente ||
    item.legal_name ||
    item.nome ||
    item.dados_calculados?.dadosExtraidos?.nome ||
    item.dados_calculados?.full_result?.dados_extraidos?.legal_name ||
    "-"
  );
}

function resolveEmissao(item) {
  return item.data_emissao || item.created_at || item.createdAt || item.updated_at || null;
}

function belongsToScope(item) {
  const itemUser = String(item.user_id || item.uid || "");
  const itemTenant = String(item.tenantId || item.tenant_id || "");
  if (itemTenant && scope.tenantId && itemTenant === scope.tenantId) return true;
  if (itemUser && itemUser === scope.uid) return true;
  return false;
}

async function getUserScope(user) {
  const result = { uid: user.uid, tenantId: user.uid, email: user.email || "" };

  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) {
    const d = adminSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    return result;
  }

  const funcQ = query(collection(db, "gcredito_funcionarios"), where("auth_user_id", "==", user.uid), limit(1));
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) {
    const d = funcSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    return result;
  }

  return result;
}

async function loadAsaasConfig() {
  const keysSnap = await getDocs(collection(db, COLL_ASAAS_KEYS));
  const keys = keysSnap.docs.map((row) => ({ id: row.id, ...row.data() }));

  let chosen =
    keys.find((k) => String(k.user_id || "") === scope.uid && k.is_active !== false) ||
    keys.find((k) => String(k.tenant_id || "") === scope.tenantId && k.is_active !== false) ||
    null;

  if (!chosen?.api_key) {
    asaasConfig = null;
    return;
  }

  asaasConfig = {
    environment: String(chosen.environment || "production").toLowerCase() === "sandbox" ? "sandbox" : "production",
    apiKey: String(chosen.api_key || ""),
  };
}

function rowTemplate(record) {
  const status = resolvePaymentStatus(record);
  const canMarkPaid = status !== "pago";
  const lastId = localStorage.getItem(LAST_EMITIDA_KEY) || "";
  const rowClass = lastId && String(record.id) === String(lastId) ? "just-sent" : "";
  return `
    <tr class="${rowClass}" data-row-id="${record.id}">
      <td>${resolveUc(record)}</td>
      <td>${resolveNome(record)}</td>
      <td>${resolveDocumento(record)}</td>
      <td>${resolveReferencia(record)}</td>
      <td>${brl(resolveValor(record))}</td>
      <td>${formatDateTime(resolveEmissao(record))}</td>
      <td>${statusPill(status)}</td>
      <td class="actions-col actions-cell">
        <button class="actions-btn" type="button" data-menu-toggle aria-label="Acoes"><i class="ph ph-dots-three"></i></button>
        <div class="actions-menu hidden">
          <button class="menu-item view" type="button" data-action="view" data-id="${record.id}"><i class="ph ph-eye"></i>Ver</button>
          <button class="menu-item download" type="button" data-action="download" data-id="${record.id}"><i class="ph ph-download-simple"></i>Baixar Fatura</button>
          ${canMarkPaid ? `<button class="menu-item pay" type="button" data-action="mark-paid" data-id="${record.id}"><i class="ph ph-check-circle"></i>Tornar pago</button>` : ""}
          <button class="menu-item delete" type="button" data-action="delete" data-id="${record.id}"><i class="ph ph-trash"></i>Excluir</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  counterLabel.textContent = `${emittedInvoices.length} itens`;
  if (!emittedInvoices.length) {
    invoiceTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhuma fatura emitida encontrada.</td></tr>';
    return;
  }

  const ordered = [...emittedInvoices].sort((a, b) => {
    const ad = asDate(resolveEmissao(a))?.getTime() || 0;
    const bd = asDate(resolveEmissao(b))?.getTime() || 0;
    return bd - ad;
  });

  invoiceTableBody.innerHTML = ordered.map(rowTemplate).join("");

  const lastId = localStorage.getItem(LAST_EMITIDA_KEY) || "";
  if (lastId) {
    const row = invoiceTableBody.querySelector(`tr[data-row-id="${lastId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => localStorage.removeItem(LAST_EMITIDA_KEY), 3000);
    }
  }
}

function renderScoreboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const monthInvoices = emittedInvoices.filter((x) => {
    const d = asDate(resolveEmissao(x));
    return d && d >= monthStart && d <= now;
  });

  const total = monthInvoices.length;
  const totalValue = monthInvoices.reduce((sum, x) => sum + toNumber(resolveValor(x)), 0);
  const paid = monthInvoices.filter((x) => resolvePaymentStatus(x) === "pago").length;
  const rate = total > 0 ? (paid / total) * 100 : 0;

  scoreTotal.textContent = String(total);
  scoreValor.textContent = brl(totalValue);
  scorePagas.textContent = String(paid);
  scoreTaxa.textContent = `${rate.toFixed(1).replace(".", ",")}%`;
}

function setUpdatedNow(suffix = "") {
  const s = suffix ? ` (${suffix})` : "";
  updatedAtLabel.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}${s}`;
}

async function loadData() {
  const emitidasSnap = await getDocsFromServer(collection(db, COLL_EMITIDAS));
  const deletedIds = getLocallyDeletedIds();
  emittedInvoices = emitidasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(belongsToScope)
    .filter((x) => !deletedIds.has(String(x.id)));

  renderScoreboard();
  renderTable();
  setUpdatedNow();
}

function findInvoice(id) {
  return emittedInvoices.find((x) => x.id === id) || null;
}

function openInvoice(record) {
  const url = resolveInvoiceUrl(record);
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const html = buildCombinedInvoiceHtml(record);
  if (html) {
    const blob = new Blob([html], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    return;
  }

  window.alert("Não foi encontrado link de visualização para esta fatura.");
}

function downloadInvoice(record) {
  const url = resolveInvoiceUrl(record);
  if (url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = "";
    a.click();
    return;
  }

  downloadCombinedAsPdf(record).catch((err) => {
    console.error(err);
    window.alert("Falha ao gerar PDF da fatura combinada.");
  });
}

async function markAsPaid(record) {
  const ok = window.confirm("Confirmar marcacao desta fatura como PAGA?");
  if (!ok) return;

  await updateDoc(doc(db, COLL_EMITIDAS, record.id), {
    status_pagamento: "pago",
    pago_em: serverTimestamp(),
    pago_em_iso: new Date().toISOString(),
    pago_por: scope.uid,
    updated_at: serverTimestamp(),
  });

  await loadData();
}

async function deleteInvoice(record) {
  const ok = window.confirm("Excluir esta fatura emitida e remover as cobrancas PIX/BOLETO no ASAAS?");
  if (!ok) return;

  console.log("[EMITIDAS][DELETE] Iniciando exclusao", {
    recordId: record?.id,
    uc: resolveUc(record),
    referencia: resolveReferencia(record),
  });

  if (!asaasConfig) await loadAsaasConfig();
  if (!asaasConfig?.apiKey) {
    console.warn("[EMITIDAS][DELETE] Chave ASAAS ausente.");
    window.alert("Configure a chave ASAAS em Configuracoes antes de excluir faturas emitidas.");
    return;
  }

  const pixPaymentId = String(record.asaas_pix_charge_id || record.pix_id || "").trim();
  const boletoPaymentId = String(record.asaas_boleto_charge_id || "").trim();
  const externalReference = String(record.asaas_external_reference || "").trim();

  console.log("[EMITIDAS][DELETE] Identificadores ASAAS", {
    pixPaymentId,
    boletoPaymentId,
    externalReference,
    environment: asaasConfig.environment,
  });

  const endpoints = [];
  if (window.location.port === "3001") {
    endpoints.push("/api/asaas-delete-charges");
  }
  endpoints.push("http://127.0.0.1:3001/api/asaas-delete-charges");
  endpoints.push("http://localhost:3001/api/asaas-delete-charges");

  let deleteOk = false;
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const reqPayload = {
        environment: asaasConfig.environment,
        apiKey: asaasConfig.apiKey,
        pixPaymentId,
        boletoPaymentId,
        externalReference,
      };
      console.log("[EMITIDAS][DELETE] Chamando endpoint", endpoint, {
        ...reqPayload,
        apiKey: reqPayload.apiKey ? "***" : "",
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqPayload),
      });
      const body = await response.json().catch(() => ({}));
      console.log("[EMITIDAS][DELETE] Resposta endpoint", endpoint, {
        status: response.status,
        ok: response.ok,
        body,
      });
      if (!response.ok || body?.ok === false) {
        const details = body?.failed?.length ? ` | failed=${JSON.stringify(body.failed)}` : "";
        throw new Error(`${body?.error || `HTTP ${response.status}`}${details}`);
      }
      deleteOk = true;
      break;
    } catch (error) {
      console.error("[EMITIDAS][DELETE] Falha endpoint", endpoint, error);
      lastError = error;
    }
  }

  if (!deleteOk) {
    window.alert(`Falha ao excluir cobrancas no ASAAS: ${lastError?.message || "erro desconhecido"}`);
    return;
  }

  const sameValue = (a, b) => String(a || "").trim() && String(a || "").trim() === String(b || "").trim();
  const sameDigits = (a, b) => {
    const da = onlyDigits(a);
    const db = onlyDigits(b);
    return !!da && da === db;
  };
  const sameMoney = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.01;
  const targetAsaasRef = String(record.asaas_external_reference || "").trim();
  const targetOrigem = String(record.origem_validacao_id || record.validacao_id || "").trim();
  const targetEmitidaRef = String(record.fatura_emitida_ref || "").trim();
  const targetPixId = String(record.asaas_pix_charge_id || record.pix_id || "").trim();
  const targetBolId = String(record.asaas_boleto_charge_id || "").trim();
  const targetUcRaw = String(resolveUc(record) || "").trim();
  const targetRefRaw = String(resolveReferencia(record) || "").trim();
  const targetDocRaw = String(resolveDocumento(record) || "").trim();
  const targetUc = targetUcRaw === "-" ? "" : targetUcRaw;
  const targetRef = targetRefRaw === "-" ? "" : targetRefRaw;
  const targetDoc = targetDocRaw === "-" ? "" : targetDocRaw;
  const targetNome = String(resolveNome(record) || "").trim().toLowerCase();
  const targetValor = Number(resolveValor(record) || 0);
  const targetTenant = String(record.tenantId || record.tenant_id || scope.tenantId || "");

  const shouldDeleteByIdentity = (x) => {
    const itemTenant = String(x.tenantId || x.tenant_id || "");
    const tenantCompatible = !itemTenant || !targetTenant || itemTenant === targetTenant;

    if (sameValue(x.id, record.id)) return true;
    if (targetOrigem && sameValue(x.id, targetOrigem)) return true;
    if (targetEmitidaRef && sameValue(x.id, targetEmitidaRef)) return true;

    if (targetAsaasRef && sameValue(x.asaas_external_reference, targetAsaasRef)) return true;
    if (targetOrigem && sameValue(x.origem_validacao_id || x.validacao_id || x.fatura_emitida_ref, targetOrigem)) return true;
    if (sameValue(x.fatura_emitida_ref, record.id)) return true;
    if (targetPixId && sameValue(x.asaas_pix_charge_id || x.pix_id, targetPixId)) return true;
    if (targetBolId && sameValue(x.asaas_boleto_charge_id, targetBolId)) return true;

    const sameUc = targetUc && String(resolveUc(x) || "").trim() === targetUc;
    const sameRef = targetRef && String(resolveReferencia(x) || "").trim() === targetRef;
    const sameDoc = targetDoc && sameDigits(resolveDocumento(x), targetDoc);
    const sameNome = targetNome && String(resolveNome(x) || "").trim().toLowerCase() === targetNome;
    const sameValorDoc = sameMoney(resolveValor(x), targetValor);

    if (tenantCompatible && sameUc && sameRef && sameDoc && sameNome && sameValorDoc) return true;
    if (tenantCompatible && sameUc && sameRef && sameDoc && sameValorDoc) return true;
    if (tenantCompatible && sameUc && sameRef) return true;

    return false;
  };

  console.log("[EMITIDAS][DELETE] Excluindo registro local Firestore", record.id);
  await deleteDoc(doc(db, COLL_EMITIDAS, record.id));

  const cascadeCollections = [
    COLL_EMITIDAS,
    COLL_VALIDACAO,
    COLL_INVOICE_DATA,
    COLL_INVOICE_DATA_ALT,
  ];
  const deletedByCollection = {};

  for (const collectionName of cascadeCollections) {
    try {
      const snap = await getDocsFromServer(collection(db, collectionName));
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(shouldDeleteByIdentity);

      deletedByCollection[collectionName] = matches.map((x) => x.id);

      for (const item of matches) {
        try {
          await deleteDoc(doc(db, collectionName, item.id));
        } catch (err) {
          console.warn(`[EMITIDAS][DELETE] Falha ao remover ${collectionName}/${item.id}`, err);
        }
      }
    } catch (err) {
      console.warn(`[EMITIDAS][DELETE] Falha varrendo colecao ${collectionName}`, err);
    }
  }

  // Tombstone local para evitar item fantasma em caso de cache/race no cliente.
  const deletedIds = getLocallyDeletedIds();
  deletedIds.add(String(record.id));
  const emitidasDeleted = deletedByCollection[COLL_EMITIDAS] || [];
  for (const id of emitidasDeleted) deletedIds.add(String(id));
  setLocallyDeletedIds(deletedIds);

  console.log("[EMITIDAS][DELETE] Exclusao em cascata concluida", deletedByCollection);
  await loadData();
}

function mapAsaasStatusToPayment(status, dueDate) {
  const s = String(status || "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "REFUNDED_PARTIALLY"].includes(s)) return "pago";
  if (s === "OVERDUE") return "vencido";
  if (s === "PENDING") {
    const due = asDate(dueDate);
    if (due && due.getTime() < Date.now()) return "vencido";
    return "pendente";
  }
  return null;
}

function resolveAsaasIdentifier(item) {
  const paymentId =
    item.asaas_payment_id ||
    item.asaasPaymentId ||
    item.payment_id ||
    item.cobranca_id ||
    item.pix_id ||
    "";

  const externalReference =
    item.external_reference ||
    item.asaas_external_reference ||
    item.numero_fatura ||
    item.id ||
    "";

  return {
    paymentId: String(paymentId || "").trim(),
    externalReference: String(externalReference || "").trim(),
  };
}

async function fetchAsaasPaymentStatus(record) {
  if (!asaasConfig?.apiKey) return null;
  const { paymentId, externalReference } = resolveAsaasIdentifier(record);
  if (!paymentId && !externalReference) return null;

  const endpoints = [];
  if (window.location.port === "3001") {
    endpoints.push("/api/asaas-payment-status");
  }
  endpoints.push("http://127.0.0.1:3001/api/asaas-payment-status");
  endpoints.push("http://localhost:3001/api/asaas-payment-status");

  const payload = {
    environment: asaasConfig.environment,
    apiKey: asaasConfig.apiKey,
    paymentId,
    externalReference,
  };

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        const err = body?.error || `HTTP ${response.status}`;
        throw new Error(err);
      }
      return body?.payment || null;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Falha ao consultar pagamento no ASAAS.");
}

async function applyPaymentStatusFromAsaas(record, payment) {
  if (!payment) return false;
  const next = mapAsaasStatusToPayment(payment.status, payment.dueDate || record.data_vencimento);
  if (!next) return false;

  const current = resolvePaymentStatus(record);
  if (next === current) return false;

  await updateDoc(doc(db, COLL_EMITIDAS, record.id), {
    status_pagamento: next,
    asaas_payment_status: payment.status || "",
    asaas_payment_id: payment.id || record.asaas_payment_id || "",
    asaas_sync_status: "sincronizado",
    asaas_last_sync_at: new Date().toISOString(),
    updated_at: serverTimestamp(),
  });
  return true;
}

async function runPaymentPolling(manual = false) {
  if (pollingInFlight || !scope) return;
  pollingInFlight = true;
  try {
    if (!asaasConfig) await loadAsaasConfig();
    if (!asaasConfig?.apiKey) {
      if (manual) window.alert("Configure a chave ASAAS em Configuracoes antes de sincronizar pagamentos.");
      setUpdatedNow("sem chave ASAAS");
      return;
    }

    const target = emittedInvoices.filter((x) => resolvePaymentStatus(x) !== "pago").slice(0, 25);
    let changed = 0;

    for (const record of target) {
      try {
        const payment = await fetchAsaasPaymentStatus(record);
        const updated = await applyPaymentStatusFromAsaas(record, payment);
        if (updated) changed += 1;
      } catch (error) {
        console.warn("Falha ao sincronizar pagamento da fatura", record.id, error);
      }
    }

    if (changed > 0) {
      await loadData();
      setUpdatedNow(`polling ASAAS: ${changed} atualizada(s)`);
      return;
    }

    setUpdatedNow("polling ASAAS");
  } finally {
    pollingInFlight = false;
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(() => {
    runPaymentPolling(false).catch((error) => console.warn("Polling falhou:", error));
  }, 30000);
}

function bindEvents() {
  toggleSidebarBtn?.addEventListener("click", () => {
    const collapsed = appShell.classList.toggle("sidebar-collapsed");
    localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  });

  themeBtn?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(themeKey, next);
  });

  refreshBtn?.addEventListener("click", async () => {
    try {
      refreshBtn.disabled = true;
      await loadData();
      await runPaymentPolling(true);
    } catch (error) {
      console.error(error);
      window.alert("Falha ao atualizar financeiro.");
    } finally {
      refreshBtn.disabled = false;
    }
  });

  invoiceTableBody?.addEventListener("click", async (event) => {
    const menuToggle = event.target.closest("[data-menu-toggle]");
    if (menuToggle) {
      const row = menuToggle.closest(".actions-cell");
      const menu = row?.querySelector(".actions-menu");
      const willOpen = menu?.classList.contains("hidden");
      document.querySelectorAll(".actions-menu").forEach((m) => m.classList.add("hidden"));
      if (menu && willOpen) menu.classList.remove("hidden");
      return;
    }

    const btn = event.target.closest("[data-action][data-id]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const record = findInvoice(id);
    if (!record) return;

    try {
      btn.disabled = true;
      if (action === "view") openInvoice(record);
      if (action === "download") downloadInvoice(record);
      if (action === "mark-paid") await markAsPaid(record);
      if (action === "delete") await deleteInvoice(record);
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível executar esta acao.");
    } finally {
      btn.disabled = false;
      document.querySelectorAll(".actions-menu").forEach((m) => m.classList.add("hidden"));
    }
  });

  document.addEventListener("click", (event) => {
    const clickedToggle = event.target.closest("[data-menu-toggle]");
    const clickedMenu = event.target.closest(".actions-menu");
    if (!clickedToggle && !clickedMenu) {
      document.querySelectorAll(".actions-menu").forEach((m) => m.classList.add("hidden"));
    }
  });

  window.addEventListener("resize", applySidebarState);
}

function initUi() {
  initTheme();
  applySidebarState();
  bindEvents();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    scope = await getUserScope(user);
    await loadAsaasConfig();
    await loadData();
    await runPaymentPolling(false);
    startPolling();
  } catch (error) {
    console.error(error);
    invoiceTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Falha ao carregar faturas emitidas.</td></tr>';
    updatedAtLabel.textContent = "Falha ao carregar dados";
  }
});

initUi();
