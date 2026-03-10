import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
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

const COLL_VALIDACAO = "gcredito_faturas_validacao";
const COLL_EMITIDAS = "gcredito_faturas_emitidas";
const COLL_INVOICE_DATA = "invoice_data";
const COLL_INVOICE_DATA_ALT = "gcredito_invoice_data";
const COLL_ASAAS_KEYS = "asaas_keys";

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const refreshBtn = document.getElementById("refreshBtn");

const scorePendentes = document.getElementById("scorePendentes");
const scoreAprovadas = document.getElementById("scoreAprovadas");
const scoreRejeitadas = document.getElementById("scoreRejeitadas");
const scoreTaxa = document.getElementById("scoreTaxa");

const updatedAtLabel = document.getElementById("updatedAtLabel");
const pendingCounterLabel = document.getElementById("pendingCounterLabel");
const invoiceTableBody = document.getElementById("invoiceTableBody");
const LAST_VALIDACAO_KEY = "gcsolar_last_validacao_id";
const LAST_EMITIDA_KEY = "gcsolar_last_emitida_id";
const LOCAL_DELETED_EMITIDAS_KEY = "gcsolar_emitidas_deleted_ids";

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let pendingInvoices = [];
let allValidacao = [];
let allEmitidas = [];
let html2pdfLoader = null;
let pdfLibsLoader = null;
let asaasConfig = null;

function getLocallyDeletedEmitidasIds() {
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_EMITIDAS_KEY) || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x || "").trim()).filter(Boolean));
  } catch (_) {
    return new Set();
  }
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

function parseBrDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = match;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss)
  );

  if (
    d.getFullYear() !== Number(yyyy) ||
    d.getMonth() !== Number(mm) - 1 ||
    d.getDate() !== Number(dd)
  ) {
    return null;
  }
  return d;
}

function asDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const br = parseBrDate(value);
    if (br) return br;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTime(value) {
  if (typeof value === "string") {
    const raw = String(value).trim();
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  }
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeStatus(item) {
  const raw = String(item.status_validacao || item.status || "pendente").toLowerCase().trim();

  if (raw.includes("aprov")) return "aprovada";
  if (raw.includes("rejeit")) return "rejeitada";
  if (raw.includes("pend")) return "pendente";
  return "pendente";
}

function isNotValidatedStatus(item) {
  const status = normalizeStatus(item);
  return status === "pendente";
}

function buildValidatedIdSet() {
  const validated = new Set();

  for (const item of allEmitidas) {
    const origem = String(item.origem_validacao_id || item.validacao_id || "").trim();
    if (origem) validated.add(origem);
  }

  for (const item of allValidacao) {
    const ownId = String(item.id || "").trim();
    if (!ownId) continue;

    const status = normalizeStatus(item);
    const alreadyLinked = String(item.fatura_emitida_ref || item.emitida_ref || "").trim();
    const hasApprovedMeta = Boolean(item.aprovado_em || item.aprovado_em_iso);
    const hasRejectedMeta = Boolean(item.rejeitado_em || item.rejeitado_por);

    if (status !== "pendente" || alreadyLinked || hasApprovedMeta || hasRejectedMeta) {
      validated.add(ownId);
    }
  }

  return validated;
}

function statusPill(status) {
  if (status === "aprovada") return '<span class="status-pill approved"><i class="ph ph-check-circle"></i>Aprovada</span>';
  if (status === "rejeitada") return '<span class="status-pill rejected"><i class="ph ph-x-circle"></i>Rejeitada</span>';
  return '<span class="status-pill pending"><i class="ph ph-hourglass"></i>Pendente</span>';
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

function resolveReferencia(item) {
  return item.referencia || item.month_reference || item.mes_referencia || "-";
}

function parseRefMonth(monthRef) {
  const raw = String(monthRef || "").trim().toUpperCase();
  if (!raw.includes("/")) return null;
  const [mRaw, yRaw] = raw.split("/");
  const year = Number(yRaw);
  if (!Number.isFinite(year)) return null;

  const map = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
  const numericMonth = Number(mRaw);
  const month = Number.isFinite(numericMonth) && numericMonth >= 1 && numericMonth <= 12 ? numericMonth : (map[mRaw] || null);
  if (!month) return null;
  return { month, year };
}

function fallbackDueFromReference(item) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 5);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
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

function resolveVencimento(item) {
  const topLevel =
    item.vencimento ||
    item.data_vencimento ||
    item.due_date ||
    item.expiration_date ||
    "";

  const extracted =
    item?.extraction_result?.info_fatura?.vencimento ||
    item?.extraction_result?.info_fatura?.due_date ||
    item?.extraction_result?.info_fatura?.expiration_date ||
    item?.extraction_result?.dados_extraidos?.expiration_date ||
    item?.dados_calculados?.full_result?.info_fatura?.vencimento ||
    item?.dados_calculados?.full_result?.info_fatura?.due_date ||
    item?.dados_calculados?.full_result?.info_fatura?.expiration_date ||
    item?.dados_calculados?.full_result?.dados_extraidos?.expiration_date ||
    "";

  const emissao = item.data_emissao || "";
  const toKey = (v) => String(v || "").replace(/\D/g, "");

  // Compatibilidade com registros antigos: se vencimento == emissao, preferir o valor extraido.
  if (topLevel && emissao && toKey(topLevel) === toKey(emissao) && extracted) {
    return extracted;
  }

  return topLevel || extracted || fallbackDueFromReference(item) || null;
}

function resolveTipoPessoa(item) {
  const doc = onlyDigits(resolveDocumento(item));
  if (doc.length === 14) return "PJ";
  if (doc.length === 11) return "PF";
  const raw = String(item.tipo_pessoa || item.tipoPessoa || "").toUpperCase();
  if (raw.includes("J")) return "PJ";
  if (raw.includes("F")) return "PF";
  return "-";
}

function resolveInvoiceUrl(item) {
  return (
    item.fatura_url ||
    item.invoice_url ||
    item.pdf_url ||
    item.downloadUrl ||
    item.attachments?.invoice?.downloadUrl ||
    item.attachments?.bill?.downloadUrl ||
    ""
  );
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

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const d = asDate(raw);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getAsaasDueDatePlus5() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 5);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    iso: `${yyyy}-${mm}-${dd}`,
    br: `${dd}/${mm}/${yyyy}`,
  };
}

function normalizeDoc(value) {
  const digits = onlyDigits(value);
  if (digits.length === 11 || digits.length === 14) return digits;
  return "";
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
    return null;
  }

  asaasConfig = {
    environment: String(chosen.environment || "production").toLowerCase() === "sandbox" ? "sandbox" : "production",
    apiKey: String(chosen.api_key || ""),
  };
  return asaasConfig;
}

function applyAsaasDataToEnergyHtml(energyHtml, asaasData) {
  const raw = String(energyHtml || "").trim();
  if (!raw) return raw;

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");

  const rawLine =
    String(asaasData?.charges?.boleto?.identificationField || "").trim() ||
    String(asaasData?.charges?.boleto?.barCode || "").trim() ||
    "";
  const lineDigits = onlyDigits(rawLine);
  const lineReadable = lineDigits || "Linha digitavel indisponivel";
  const barcodeDigits = onlyDigits(asaasData?.charges?.boleto?.barCode || "") || lineDigits;
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

  const qrEl = doc.querySelector(".j7-qrcode-placeholder");
  const qrImage = asaasData?.charges?.pix?.qrCodeImage || "";
  if (qrEl) {
    if (qrImage) {
      qrEl.innerHTML = `<img src="${qrImage}" alt="QR Code PIX" style="width:100%;height:100%;object-fit:contain;display:block;">`;
    } else {
      qrEl.textContent = "QR indisponivel";
    }
  }

  return doc.body.innerHTML;
}

async function requestAsaasCreateCharges(payload) {
  const endpoints = [];
  if (window.location.port === "3001") {
    endpoints.push("/api/asaas-create-charges");
  }
  endpoints.push("http://127.0.0.1:3001/api/asaas-create-charges");
  endpoints.push("http://localhost:3001/api/asaas-create-charges");

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
        const msg = body?.error || `HTTP ${response.status}`;
        throw new Error(msg);
      }
      return body;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Falha ao criar cobrancas no ASAAS.");
}

function buildEmitidaPayload(record, paid = false, extra = {}) {
  return {
    ...record,
    origem_validacao_id: record.id,
    status_validacao: "aprovada",
    status: "aprovada",
    status_pagamento: paid ? "pago" : "pendente",
    asaas_sync_status: "pendente_integracao",
    enviado_para_asaas: false,
    aprovado_em: serverTimestamp(),
    aprovado_em_iso: new Date().toISOString(),
    aprovado_por: scope.uid,
    aprovado_por_email: scope.email,
    tenantId: record.tenantId || record.tenant_id || scope.tenantId,
    uid: record.uid || record.user_id || scope.uid,
    created_at: record.created_at || record.createdAt || new Date().toISOString(),
    updated_at: serverTimestamp(),
    ...extra,
  };
}

function renderScoreboard() {
  const pendentes = allValidacao.filter((x) => normalizeStatus(x) === "pendente").length;
  const rejeitadas = allValidacao.filter((x) => normalizeStatus(x) === "rejeitada").length;

  // "Aprovadas" deve refletir o volume atual efetivamente emitido.
  // Se a emitida foi excluída, o contador também reduz.
  const aprovadas = allEmitidas.length;

  const reviewed = aprovadas + rejeitadas;
  const taxa = reviewed > 0 ? (aprovadas / reviewed) * 100 : 0;

  scorePendentes.textContent = String(pendentes);
  scoreAprovadas.textContent = String(aprovadas);
  scoreRejeitadas.textContent = String(rejeitadas);
  scoreTaxa.textContent = `${taxa.toFixed(1).replace(".", ",")}%`;
}

function tableRow(record) {
  const status = normalizeStatus(record);
  const lastId = localStorage.getItem(LAST_VALIDACAO_KEY) || "";
  const rowClass = lastId && String(record.id) === String(lastId) ? "just-sent" : "";

  return `
    <tr class="${rowClass}" data-row-id="${record.id}">
      <td>${resolveUc(record)}</td>
      <td>${resolveNome(record)}</td>
      <td>${resolveDocumento(record)}</td>
      <td>${resolveReferencia(record)}</td>
      <td>${brl(resolveValor(record))}</td>
      <td>${formatDateTime(resolveVencimento(record))}</td>
      <td>${statusPill(status)}</td>
      <td class="actions-col actions-cell">
        <button class="actions-btn" type="button" data-menu-toggle aria-label="Ações"><i class="ph ph-dots-three"></i></button>
        <div class="actions-menu hidden">
          <button class="menu-item view" type="button" data-action="view" data-id="${record.id}"><i class="ph ph-eye"></i>Ver</button>
          <button class="menu-item download" type="button" data-action="download" data-id="${record.id}"><i class="ph ph-download-simple"></i>Baixar Fatura</button>
          <button class="menu-item approve" type="button" data-action="approve" data-id="${record.id}"><i class="ph ph-check"></i>Aprovar</button>
          <button class="menu-item reject" type="button" data-action="reject" data-id="${record.id}"><i class="ph ph-thumbs-down"></i>Rejeitar</button>
          <button class="menu-item delete" type="button" data-action="delete" data-id="${record.id}"><i class="ph ph-trash"></i>Excluir</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  pendingCounterLabel.textContent = `${pendingInvoices.length} itens`;

  if (!pendingInvoices.length) {
    invoiceTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhuma fatura pendente no momento.</td></tr>';
    return;
  }

  invoiceTableBody.innerHTML = pendingInvoices.map(tableRow).join("");

  const lastId = localStorage.getItem(LAST_VALIDACAO_KEY) || "";
  if (lastId) {
    const row = invoiceTableBody.querySelector(`tr[data-row-id="${lastId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => localStorage.removeItem(LAST_VALIDACAO_KEY), 2500);
    }
  }
}

function setUpdatedNow() {
  updatedAtLabel.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}`;
}

async function loadData() {
  updatedAtLabel.textContent = "Atualizando...";

  const [validacaoSnap, emitidasSnap] = await Promise.all([
    getDocs(collection(db, COLL_VALIDACAO)),
    getDocs(collection(db, COLL_EMITIDAS)),
  ]);

  allValidacao = validacaoSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(belongsToScope);
  const deletedEmitidasIds = getLocallyDeletedEmitidasIds();
  allEmitidas = emitidasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(belongsToScope)
    .filter((x) => !deletedEmitidasIds.has(String(x.id)));

  const validatedIdSet = buildValidatedIdSet();
  pendingInvoices = allValidacao.filter((x) => {
    const id = String(x.id || "").trim();
    if (!id) return false;
    if (!isNotValidatedStatus(x)) return false;
    if (validatedIdSet.has(id)) return false;
    return true;
  });

  renderScoreboard();
  renderTable();
  setUpdatedNow();
}

function findPendingById(id) {
  return pendingInvoices.find((x) => x.id === id) || null;
}

function buildCombinedInvoiceHtml(record) {
  const energyHtml = String(record.fatura_energypay_html || "").trim();
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
.page{
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 6mm;
  background:#fff;
}
.page + .page{
  page-break-before: always;
  break-before: page;
}
.energy-wrap{
  display:flex;
  justify-content:center;
  align-items:flex-start;
}
.energy-wrap .invoice-j7{
  transform: scale(0.90);
  transform-origin: top center;
  width: calc(100% / 0.90);
  margin: 0 auto;
}
.equatorial-wrap{
  width:100%;
  height: calc(297mm - 12mm);
  display:flex;
  align-items:flex-start;
  justify-content:center;
  overflow:hidden;
}
.equatorial-wrap img{
  max-width:100%;
  max-height:100%;
  object-fit:contain;
  display:block;
}
</style></head><body><div class="doc">
<section class="page page-energy"><div class="energy-wrap">${energyHtml || "<p>Sem preview.</p>"}</div></section>
<section class="page page-equatorial"><div class="equatorial-wrap">${equatorialPreview ? `<img src="${equatorialPreview}" alt="Fatura Equatorial">` : "<p>Sem preview.</p>"}</div></section>
</div></body></html>`;
}

function ensureHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (html2pdfLoader) return html2pdfLoader;

  html2pdfLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js";
    script.async = true;
    script.onload = () => {
      if (window.html2pdf) resolve(window.html2pdf);
      else reject(new Error("Biblioteca html2pdf nao carregada."));
    };
    script.onerror = () => reject(new Error("Falha ao carregar html2pdf."));
    document.head.appendChild(script);
  });

  return html2pdfLoader;
}

async function downloadCombinedAsPdf(record) {
  const energyHtml = String(record.fatura_energypay_html || "").trim();
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

      if (!window.html2canvas) {
        await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
      }
      if (!window.jspdf?.jsPDF) {
        await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
      }
    })();
  }
  await pdfLibsLoader;

  const { jsPDF } = window.jspdf;
  const uc = String(resolveUc(record) || "sem-uc").replace(/[^\w-]/g, "");
  const ref = String(resolveReferencia(record) || "sem-referencia").replace(/[^\w-]/g, "_");
  const fileName = `fatura-combinada-${uc}-${ref}.pdf`;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;

  const fitToPage = (imgW, imgH) => {
    const ratio = Math.min(pageW / imgW, pageH / imgH);
    const w = imgW * ratio;
    const h = imgH * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    return { x, y, w, h };
  };

  const trimWhiteMargins = (srcCanvas, threshold = 245) => {
    const ctx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return srcCanvas;
    const { width, height } = srcCanvas;
    const img = ctx.getImageData(0, 0, width, height).data;

    let top = height;
    let left = width;
    let right = 0;
    let bottom = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = img[i];
        const g = img[i + 1];
        const b = img[i + 2];
        const a = img[i + 3];
        const isWhite = r >= threshold && g >= threshold && b >= threshold;
        if (a > 0 && !isWhite) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (right <= left || bottom <= top) return srcCanvas;

    const pad = 4;
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(width - 1, right + pad);
    bottom = Math.min(height - 1, bottom + pad);

    const cw = right - left + 1;
    const ch = bottom - top + 1;

    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    const octx = out.getContext("2d");
    if (!octx) return srcCanvas;
    octx.drawImage(srcCanvas, left, top, cw, ch, 0, 0, cw, ch);
    return out;
  };

  const getImageSize = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = reject;
      img.src = src;
    });

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
    const trimmed = trimWhiteMargins(canvas);
    const imgData = trimmed.toDataURL("image/jpeg", 0.95);
    // Leve margem para bordas discretas na pagina 1.
    const m = 3; // mm
    pdf.addImage(imgData, "JPEG", m, m, pageW - (m * 2), pageH - (m * 2), undefined, "FAST");

    if (equatorialPreview) {
      pdf.addPage("a4", "p");
      const sz = await getImageSize(equatorialPreview);
      const second = fitToPage(sz.w, sz.h);
      pdf.addImage(equatorialPreview, "JPEG", second.x, second.y, second.w, second.h, undefined, "FAST");
    }

    pdf.save(fileName);
  } finally {
    captureHost.remove();
  }
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

async function approveInvoice(record, markAsPaid = false) {
  const confirmText = markAsPaid
    ? "Ao confirmar, a fatura sera aprovada e marcada como PAGA. Deseja continuar?"
    : "Ao confirmar, o sistema seguira para emissao (PIX e boleto no Asaas). Deseja continuar?";

  const ok = window.confirm(confirmText);
  if (!ok) return;

  if (!asaasConfig) {
    await loadAsaasConfig();
  }
  if (!asaasConfig?.apiKey) {
    window.alert("Configure a chave ASAAS em Configuracoes antes de aprovar.");
    return;
  }

  const dueFromRule = getAsaasDueDatePlus5();
  const dueBr = dueFromRule.br;
  const dueIso = dueFromRule.iso;

  const docDigits = normalizeDoc(resolveDocumento(record));
  const name = resolveNome(record);
  const value = Number(resolveValor(record) || 0);
  const reference = resolveReferencia(record);
  const uc = resolveUc(record);
  const externalReference = `EP-${scope.tenantId}-${record.id}`;
  const description = `Fatura Energy Pay ${reference} - UC ${uc}`;

  const asaasData = await requestAsaasCreateCharges({
    environment: asaasConfig.environment,
    apiKey: asaasConfig.apiKey,
    customer: {
      name,
      cpfCnpj: docDigits,
      email: String(record.email || record.user_email || "").trim(),
      phone: String(record.telefone || record.phone || "").trim(),
    },
    invoice: {
      value,
      dueDate: dueIso,
      description,
      externalReference,
    },
  });

  const updatedEnergyHtml = applyAsaasDataToEnergyHtml(record.fatura_energypay_html || "", asaasData);
  const pix = asaasData?.charges?.pix || {};
  const boleto = asaasData?.charges?.boleto || {};

  const emitidaPayload = buildEmitidaPayload(record, markAsPaid, {
    status_pagamento: markAsPaid ? "pago" : "pendente",
    vencimento: dueBr,
    due_date: dueBr,
    expiration_date: dueBr,
    data_vencimento: dueBr,
    enviado_para_asaas: true,
    asaas_sync_status: "sincronizado",
    asaas_environment: asaasConfig.environment,
    asaas_customer_id: asaasData?.customer?.id || "",
    asaas_external_reference: externalReference,
    asaas_payment_id: pix.id || boleto.id || "",
    asaas_pix_charge_id: pix.id || "",
    asaas_boleto_charge_id: boleto.id || "",
    pix_id: pix.id || "",
    pix_payload: pix.payload || pix.copyPaste || "",
    pix_qr_code: pix.qrCodeImage || "",
    vencimento_asaas: dueBr,
    vencimento_asaas_iso: dueIso,
    boleto_identification_field: boleto.identificationField || "",
    boleto_barcode: boleto.barCode || "",
    boleto_nosso_numero: boleto.nossoNumero || "",
    boleto_bank_slip_url: boleto.bankSlipUrl || "",
    fatura_energypay_html: updatedEnergyHtml || record.fatura_energypay_html || "",
  });

  const emitidaRef = await addDoc(collection(db, COLL_EMITIDAS), emitidaPayload);

  await updateDoc(doc(db, COLL_VALIDACAO, record.id), {
    status_validacao: "aprovada",
    status: "aprovada",
    status_pagamento: markAsPaid ? "pago" : "pendente",
    aprovado_em: serverTimestamp(),
    aprovado_em_iso: new Date().toISOString(),
    aprovado_por: scope.uid,
    aprovado_por_email: scope.email,
    enviado_para_asaas: true,
    asaas_sync_status: "sincronizado",
    asaas_customer_id: asaasData?.customer?.id || "",
    asaas_external_reference: externalReference,
    asaas_payment_id: pix.id || boleto.id || "",
    asaas_pix_charge_id: pix.id || "",
    asaas_boleto_charge_id: boleto.id || "",
    boleto_identification_field: boleto.identificationField || "",
    boleto_barcode: boleto.barCode || "",
    pix_qr_code: pix.qrCodeImage || "",
    vencimento_asaas: dueBr,
    vencimento_asaas_iso: dueIso,
    fatura_emitida_ref: emitidaRef.id,
    updated_at: serverTimestamp(),
  });

  localStorage.setItem(LAST_EMITIDA_KEY, emitidaRef.id);
  window.location.href = "faturas-emitidas.html";
}

async function rejectInvoice(record) {
  const ok = window.confirm("Confirmar rejeicao desta fatura?");
  if (!ok) return;

  await updateDoc(doc(db, COLL_VALIDACAO, record.id), {
    status_validacao: "rejeitada",
    status: "rejeitada",
    rejeitado_em: serverTimestamp(),
    rejeitado_por: scope.uid,
    rejeitado_por_email: scope.email,
    updated_at: serverTimestamp(),
  });

  await loadData();
}

async function deleteInvoice(record) {
  const ok = window.confirm("Excluir esta fatura permanentemente?");
  if (!ok) return;

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

  const cascadeCollections = [
    COLL_VALIDACAO,
    COLL_EMITIDAS,
    COLL_INVOICE_DATA,
    COLL_INVOICE_DATA_ALT,
  ];

  for (const collectionName of cascadeCollections) {
    try {
      const snap = await getDocs(collection(db, collectionName));
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(shouldDeleteByIdentity);

      for (const item of matches) {
        try {
          await deleteDoc(doc(db, collectionName, item.id));
        } catch (err) {
          console.warn(`[VALIDACAO][DELETE] Falha ao remover ${collectionName}/${item.id}`, err);
        }
      }
    } catch (err) {
      console.warn(`[VALIDACAO][DELETE] Falha varrendo colecao ${collectionName}`, err);
    }
  }

  await loadData();
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

  refreshBtn?.addEventListener("click", () => {
    loadData().catch((error) => {
      console.error(error);
      window.alert("Falha ao atualizar dados.");
    });
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
    const record = findPendingById(id);
    if (!record) return;

    try {
      btn.disabled = true;

      if (action === "view") openInvoice(record);
      if (action === "download") downloadInvoice(record);
      if (action === "approve") await approveInvoice(record, false);
      if (action === "reject") await rejectInvoice(record);
      if (action === "delete") await deleteInvoice(record);

      document.querySelectorAll(".actions-menu").forEach((m) => m.classList.add("hidden"));
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível executar esta acao.");
    } finally {
      btn.disabled = false;
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
  } catch (error) {
    console.error(error);
    invoiceTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Falha ao carregar faturas em validacao.</td></tr>';
    updatedAtLabel.textContent = "Falha ao carregar dados";
  }
});

initUi();
