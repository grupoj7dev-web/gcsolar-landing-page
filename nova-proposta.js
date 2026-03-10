import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  runTransaction,
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

const DEFAULTS = {
  distributor: "Equatorial",
  networkType: "bifasico",
  discountPercent: 20,
  gdRule: "GD1",
  generationMode: "remoto",
  flagGreenCost: 0,
  flagYellowCost: 0.028,
  flagRedICost: 0.054,
  flagRedIICost: 0.086,
};

const PROPOSAL_CODE_START = 10293;
const COUNTER_DOC_PATH = ["system_counters", "proposal_counter"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const saveProposalBtn = document.getElementById("saveProposalBtn");
const saveProposalLabel = document.getElementById("saveProposalLabel");
const pickPdfBtn = document.getElementById("pickPdfBtn");
const pdfInput = document.getElementById("pdfInput");
const pdfStatusText = document.getElementById("pdfStatusText");
const proposalPageTitle = document.getElementById("proposalPageTitle");

const proposalStatusText = document.getElementById("proposalStatusText");
const validationBar = document.getElementById("validationBar");
const warningBar = document.getElementById("warningBar");
const proposalForm = document.getElementById("proposalForm");

const proposalCodeInput = document.getElementById("proposalCodeInput");
const clientNameInput = document.getElementById("clientNameInput");
const cnpjInput = document.getElementById("cnpjInput");
const installationIdInput = document.getElementById("installationIdInput");
const distributorInput = document.getElementById("distributorInput");
const networkTypeInput = document.getElementById("networkTypeInput");
const discountPercentInput = document.getElementById("discountPercentInput");
const gdRuleInput = document.getElementById("gdRuleInput");
const generationModeInput = document.getElementById("generationModeInput");
const monthlyConsumptionInput = document.getElementById("monthlyConsumptionInput");
const currentRateInput = document.getElementById("currentRateInput");
const publicLightingInput = document.getElementById("publicLightingInput");
const minCostInput = document.getElementById("minCostInput");
const flagGreenCostInput = document.getElementById("flagGreenCostInput");
const flagYellowCostInput = document.getElementById("flagYellowCostInput");
const flagRedICostInput = document.getElementById("flagRedICostInput");
const flagRedIICostInput = document.getElementById("flagRedIICostInput");

const adminBlock = document.getElementById("adminBlock");
const returnFioBInput = document.getElementById("returnFioBInput");
const returnPisCofinsInput = document.getElementById("returnPisCofinsInput");
const pisCofinsPctInput = document.getElementById("pisCofinsPctInput");
const returnIcmsInput = document.getElementById("returnIcmsInput");
const icmsPctInput = document.getElementById("icmsPctInput");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";
const params = new URLSearchParams(window.location.search);
const editingProposalId = params.get("id");

let scope = null;
let isAdminUser = false;
let saving = false;
let isEditMode = Boolean(editingProposalId);
let originalProposal = null;

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

function showValidation(message, type = "error") {
  validationBar.textContent = message;
  validationBar.classList.remove("hidden", "error", "success");
  validationBar.classList.add(type);
}

function hideValidation() {
  validationBar.classList.add("hidden");
  validationBar.classList.remove("error", "success");
}

function showWarning(message) {
  warningBar.textContent = message;
  warningBar.classList.remove("hidden");
}

function hideWarning() {
  warningBar.classList.add("hidden");
}

function toNumber(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isLikelyCpfCnpj(value) {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}

function isLikelyUc(value) {
  const digits = onlyDigits(value);
  return digits.length >= 6 && digits.length <= 14;
}

function sanitizeClientName(value) {
  let name = normalizeSpaces(value);
  if (!name) return "";
  name = name.replace(
    /^(RESIDENCIAL|COMERCIAL|INDUSTRIAL|RURAL|SERVICOS?\s+E\s+OUTRAS\s+ATIVIDADES|PODER\s+PUBLICO)\s+/i,
    ""
  );
  if (/CONVENCIONAL/i.test(name)) {
    name = name.split(/CONVENCIONAL/i).pop();
  }
  name = name.replace(/^(BAIXA\s+TENSAO|ALTA\s+TENSAO)\s+/i, "");
  name = name
    .replace(/\b(CNPJ|CPF|UC|INSTALACAO|ENDERECO|CEP|FATURA|CONSUMO)\b.*$/i, "")
    .replace(/[|;:_-]{2,}.*/g, "")
    .trim();
  if (name.length < 4) return "";
  return name;
}

function normalizeNetwork(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function mapNetworkType(value) {
  const network = normalizeNetwork(value);
  if (network.includes("mono")) return "monofasico";
  if (network.includes("tri")) return "trifasico";
  if (network.includes("bi")) return "bifasico";
  return "";
}

function extractFilenameUcCandidates(fileName) {
  const base = String(fileName || "");
  const matches = base.match(/\d{8,14}/g) || [];
  return matches.map((x) => onlyDigits(x)).filter((x) => isLikelyUc(x));
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function detectBestInstallationId(text, fileName, cnpjOrCpf = "", currentValue = "") {
  const source = normalizeForSearch(text);
  const scores = new Map();
  const addScore = (value, score) => {
    const digits = onlyDigits(value);
    if (!isLikelyUc(digits)) return;
    scores.set(digits, (scores.get(digits) || 0) + score);
  };

  const docDigits = onlyDigits(cnpjOrCpf);

  extractFilenameUcCandidates(fileName).forEach((uc) => addScore(uc, 120));
  if (currentValue) addScore(currentValue, 20);

  const labeledPatterns = [
    /(?:N[Oº°]?\s*DA\s*INSTALACAO|NUMERO\s*DA\s*INSTALACAO|CODIGO\s*DA\s*INSTALACAO|UNIDADE\s*CONSUMIDORA|UC(?:\s*N[Oº°])?)\D{0,25}(\d[\d\s.-]{7,16}\d)/g,
  ];
  for (const pattern of labeledPatterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      addScore(match[1], 90);
    }
  }

  const allNumeric = source.match(/\b\d{8,14}\b/g) || [];
  for (const num of allNumeric) addScore(num, 8);

  for (const [candidate] of scores.entries()) {
    if (candidate === docDigits) addScore(candidate, -200);
    if (candidate.length === 11) addScore(candidate, 10);
  }

  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : onlyDigits(currentValue || "");
}

function getAvailabilityKwh() {
  if (gdRuleInput.value !== "GD1") return 0;
  const network = normalizeNetwork(networkTypeInput.value);
  if (network.includes("mono")) return 30;
  if (network.includes("tri")) return 100;
  return 50;
}

function updateMinCost() {
  const availabilityKwh = getAvailabilityKwh();
  const rate = toNumber(currentRateInput.value);
  const minCost = availabilityKwh * rate;
  minCostInput.value = minCost.toFixed(2);
}

function evaluateDiscountRules() {
  const value = toNumber(discountPercentInput.value);
  hideWarning();

  if (value > 30) {
    showValidation("Desconto maior que o permitido (maximo 30%).", "error");
    saveProposalBtn.disabled = true;
    return false;
  }

  hideValidation();
  saveProposalBtn.disabled = false;

  if (!isAdminUser && value >= 21 && value <= 30) {
    showWarning("Desconto entre 21% e 30%: proposta ficara pendente de autorizacao.");
  }

  return true;
}

function updateAdminBlock() {
  const show = isAdminUser && (gdRuleInput.value === "GD2" || generationModeInput.value === "compartilhado");
  adminBlock.classList.toggle("hidden", !show);
}

async function getUserScope(user) {
  const result = {
    uid: user.uid,
    tenantId: user.uid,
    email: user.email || "",
    name: user.displayName || "",
    phone: "",
  };

  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) {
    const d = adminSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    result.name = d.nome || d.name || result.name;
    result.email = d.email || result.email;
    result.phone = d.telefone || d.phone || d.celular || "";
    result.role = "admin";
    isAdminUser = true;
    return result;
  }

  const funcQ = query(
    collection(db, "gcredito_funcionarios"),
    where("auth_user_id", "==", user.uid),
    limit(1)
  );
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) {
    const d = funcSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    result.name = d.nome || d.name || result.name;
    result.email = d.email || result.email;
    result.phone = d.telefone || d.phone || d.celular || "";
    result.role = "funcionario";
    return result;
  }

  result.role = "user";
  return result;
}

function inferTemplateKey(email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (normalized === "jheferson@gmail.com") return "j7_orange";
  return "gc_default";
}

async function generateCodeFromApi() {
  try {
    const endpoints = ["http://127.0.0.1:3001/api/proposal-code", "http://localhost:3001/api/proposal-code"];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { method: "GET" });
        if (!response.ok) continue;
        const payload = await response.json();
        const raw = String(payload.proposalCode || "").replace(/[^\d]/g, "");
        if (raw) return `PRP-${raw}`;
      } catch (_) {
        // tenta proximo endpoint
      }
    }
  } catch (_) {
    // fallback abaixo
  }
  return null;
}

async function generateCodeFromFirestore() {
  const counterRef = doc(db, ...COUNTER_DOC_PATH);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? toNumber(snap.data().lastCode) : PROPOSAL_CODE_START - 1;
    const value = Math.max(PROPOSAL_CODE_START - 1, current) + 1;
    tx.set(counterRef, { lastCode: value, updated_at: serverTimestamp() }, { merge: true });
    return value;
  });
  return `PRP-${next}`;
}

async function generateProposalCode() {
  const fromApi = await generateCodeFromApi();
  if (fromApi) return fromApi;
  try {
    return await generateCodeFromFirestore();
  } catch (_) {
    return `PRP-${Date.now().toString().slice(-6)}`;
  }
}

function applyDefaults() {
  distributorInput.value = DEFAULTS.distributor;
  networkTypeInput.value = DEFAULTS.networkType;
  discountPercentInput.value = String(DEFAULTS.discountPercent);
  gdRuleInput.value = DEFAULTS.gdRule;
  generationModeInput.value = DEFAULTS.generationMode;
  flagGreenCostInput.value = String(DEFAULTS.flagGreenCost);
  flagYellowCostInput.value = String(DEFAULTS.flagYellowCost);
  flagRedICostInput.value = String(DEFAULTS.flagRedICost);
  flagRedIICostInput.value = String(DEFAULTS.flagRedIICost);
  returnFioBInput.checked = true;
  returnPisCofinsInput.checked = true;
  returnIcmsInput.checked = true;
  updateMinCost();
  evaluateDiscountRules();
  updateAdminBlock();
}

function parsePdfTextRegex(text) {
  const data = {};
  const clean = String(text || "");
  const cleanAscii = normalizeAscii(clean);

  const cnpjMatch = clean.match(/(?:CNPJ\/CPF|CPF\/CNPJ|CNPJ|CPF)[:\s]*([0-9.\/-]+)/i);
  if (cnpjMatch) {
    data.cnpj = cnpjMatch[1].trim();
  }

  const nameMatch =
    clean.match(/([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{10,}?)\s+CNPJ\/CPF:/i) ||
    clean.match(/(?:Nome|Titular)[:\s]+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)(?:\s{2,}|CPF|CNPJ|RUA|AV\.)/i);
  if (nameMatch) {
    data.clientName = sanitizeClientName(nameMatch[1]);
  }

  const labeledUcPatterns = [
    /(?:N[Oº°]?\s*DA\s*INSTALACAO|INSTALACAO|UNIDADE\s*CONSUMIDORA|UC(?:\s*N[Oº°])?)[:\s-]*([0-9]{6,14})/gi,
    /(?:CODIGO\s*DA\s*INSTALACAO|NUMERO\s*DA\s*INSTALACAO)[:\s-]*([0-9]{6,14})/gi,
  ];
  for (const regex of labeledUcPatterns) {
    const match = regex.exec(cleanAscii);
    if (match && match[1]) {
      data.installationId = match[1];
      break;
    }
  }

  if (!data.installationId) {
    const allCandidates = cleanAscii.match(/\b\d{8,14}\b/g) || [];
    const filtered = allCandidates.filter((x) => !isLikelyCpfCnpj(x));
    if (filtered.length) {
      const byFrequency = filtered.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});
      data.installationId = Object.entries(byFrequency).sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  if (/equatorial/i.test(clean)) {
    data.distributor = "Equatorial";
  }

  const consumptionMatch =
    clean.match(/CONSUMO\s+FATURADO\(kWh\)[^\d]*(\d+[,.]?\d*)/i) ||
    clean.match(/(\d+[,.]?\d*)\s*kWh/i);
  if (consumptionMatch) {
    data.monthlyConsumption = toNumber(consumptionMatch[1]);
  }

  const rateMatch =
    clean.match(/TE\s*\+\s*TUSD[^\d]{0,20}([0-9]+[,.]?[0-9]+)/i) ||
    clean.match(/TARIFA(?:\s+DE)?\s+ENERGIA[^\d]{0,20}([0-9]+[,.]?[0-9]+)/i) ||
    clean.match(/PRECO(?:\s+ATUAL)?\s*R?\$?\/?KWH[^\d]{0,20}([0-9]+[,.]?[0-9]+)/i) ||
    clean.match(/CONSUMO\s+kWh\s+([0-9]+[,.]?[0-9]+)/i) ||
    clean.match(/([0-9]+[,.]?[0-9]+)\s*R?\$?\/kWh/i);
  if (rateMatch) {
    data.currentRate = toNumber(rateMatch[1]);
  } else {
    const decimalCandidates = (clean.match(/\b\d+[,.]\d{3,6}\b/g) || [])
      .map((x) => toNumber(x))
      .filter((x) => x > 0.05 && x < 5);
    if (decimalCandidates.length) {
      data.currentRate = decimalCandidates[0];
    }
  }

  const publicLightingMatch =
    clean.match(/(?:COSIP|CIP|ILUMINACAO\s+PUBLICA|CONTRIBUICAO\s+DE\s+ILUMINACAO\s+PUBLICA)[^0-9]{0,40}([0-9]+[,.][0-9]{2})/i) ||
    clean.match(/(?:CIP-COSIP)[^0-9]{0,40}([0-9]+[,.][0-9]{2})/i);
  if (publicLightingMatch) {
    data.publicLighting = toNumber(publicLightingMatch[1]);
  }

  if (/MONOFASICO/i.test(cleanAscii)) {
    data.networkType = "monofasico";
  } else if (/TRIFASICO/i.test(cleanAscii)) {
    data.networkType = "trifasico";
  } else if (/BIFASICO/i.test(cleanAscii)) {
    data.networkType = "bifasico";
  }

  return data;
}

async function parsePdfTextGemini(text, fileName = "") {
  const endpoints = [
    "http://127.0.0.1:3001/api/extract-invoice",
    "http://localhost:3001/api/extract-invoice",
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fileName }),
      });

      if (!response.ok) continue;
      const payload = await response.json();
      const parsed = payload?.data;
      if (!parsed || typeof parsed !== "object") continue;

      return {
        clientName: sanitizeClientName(parsed.clientName || ""),
        cnpj: String(parsed.cnpj || "").trim(),
        installationId: onlyDigits(parsed.installationId || ""),
        monthlyConsumption: toNumber(parsed.monthlyConsumption),
        currentRate: toNumber(parsed.currentRate),
        publicLighting: toNumber(parsed.publicLighting),
        distributor: normalizeSpaces(parsed.distributor || ""),
        networkType: mapNetworkType(parsed.networkType || ""),
      };
    } catch (_) {
      // tenta proximo endpoint
    }
  }

  return null;
}

function countExtractedFields(data) {
  const checks = [
    !!sanitizeClientName(data.clientName),
    isLikelyCpfCnpj(data.cnpj),
    isLikelyUc(data.installationId),
    toNumber(data.monthlyConsumption) > 0,
    toNumber(data.currentRate) > 0,
    toNumber(data.publicLighting) >= 0,
    !!normalizeSpaces(data.distributor),
    !!mapNetworkType(data.networkType),
  ];
  return checks.filter(Boolean).length;
}

function mergeExtractionData(primary, fallback) {
  const result = { ...fallback, ...primary };

  result.clientName = sanitizeClientName(result.clientName || "");
  if (!isLikelyCpfCnpj(result.cnpj)) result.cnpj = fallback.cnpj || "";
  if (!isLikelyUc(result.installationId)) result.installationId = fallback.installationId || "";
  result.networkType = mapNetworkType(result.networkType || "");
  result.monthlyConsumption = toNumber(result.monthlyConsumption);
  result.currentRate = toNumber(result.currentRate);
  result.publicLighting = toNumber(result.publicLighting);
  result.distributor = normalizeSpaces(result.distributor || "");

  return result;
}

async function extractInvoiceData(text, fileName = "") {
  const regexData = parsePdfTextRegex(text);
  try {
    const geminiData = await parsePdfTextGemini(text, fileName);
    if (!geminiData) {
      const uc = detectBestInstallationId(text, fileName, regexData.cnpj, regexData.installationId);
      const normalized = { ...regexData, installationId: uc, clientName: sanitizeClientName(regexData.clientName) };
      return { data: normalized, fields: countExtractedFields(normalized), source: "regex" };
    }
    const merged = mergeExtractionData(geminiData, regexData);
    merged.installationId = detectBestInstallationId(text, fileName, merged.cnpj, merged.installationId);
    merged.clientName = sanitizeClientName(merged.clientName);
    return { data: merged, fields: countExtractedFields(merged), source: "gemini+regex" };
  } catch (error) {
    console.warn("Gemini indisponivel, usando regex:", error);
    const uc = detectBestInstallationId(text, fileName, regexData.cnpj, regexData.installationId);
    const normalized = { ...regexData, installationId: uc, clientName: sanitizeClientName(regexData.clientName) };
    return { data: normalized, fields: countExtractedFields(normalized), source: "regex" };
  }
}

async function readPdfText(file) {
  if (!window.pdfjsLib) throw new Error("Leitor de PDF indisponivel.");
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(2, pdf.numPages);
  let text = "";
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => item.str).join(" ")}\n`;
  }
  return text;
}

function mergePdfData(data) {
  if (data.clientName) clientNameInput.value = data.clientName;
  if (data.cnpj) cnpjInput.value = data.cnpj;
  if (data.installationId) installationIdInput.value = data.installationId;
  if (data.distributor) distributorInput.value = data.distributor;
  if (data.networkType) networkTypeInput.value = data.networkType;
  if (toNumber(data.monthlyConsumption) > 0) {
    monthlyConsumptionInput.value = String(data.monthlyConsumption);
  }
  if (toNumber(data.currentRate) > 0) {
    currentRateInput.value = String(data.currentRate);
  }
  if (toNumber(data.publicLighting) > 0) {
    publicLightingInput.value = String(data.publicLighting);
  }
  updateMinCost();
}

async function onPdfSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    pdfStatusText.textContent = "Selecione um arquivo PDF valido.";
    showValidation("Arquivo inválido. Envie uma fatura em PDF.", "error");
    return;
  }

  hideValidation();
  pdfStatusText.textContent = "Processando PDF...";

  try {
    const text = await readPdfText(file);
    const { data, fields, source } = await extractInvoiceData(text, file.name);
    mergePdfData(data);
    pdfStatusText.textContent = `${file.name} processado (${fields} campos - ${source}).`;
    if (!fields) {
      showWarning("Não consegui extrair os campos automaticamente. Complete manualmente.");
    }
  } catch (error) {
    console.error(error);
    pdfStatusText.textContent = "Falha ao processar o PDF.";
    showValidation("Erro ao processar o PDF. Preencha os campos manualmente.", "error");
  } finally {
    pdfInput.value = "";
  }
}

function getRequiredFieldErrors() {
  const errors = [];

  if (!proposalCodeInput.value.trim()) errors.push("Codigo da proposta nao gerado.");
  if (!clientNameInput.value.trim()) errors.push("Preencha o campo Cliente.");
  if (!cnpjInput.value.trim()) errors.push("Preencha o campo CNPJ / CPF.");
  if (!installationIdInput.value.trim()) errors.push("Preencha o campo N da Instalacao (UC).");
  if (toNumber(monthlyConsumptionInput.value) <= 0) errors.push("Consumo Mensal deve ser maior que zero.");
  if (toNumber(currentRateInput.value) <= 0) errors.push("Preco Atual deve ser maior que zero.");
  if (toNumber(publicLightingInput.value) < 0) errors.push("Iluminação Pública nao pode ser negativa.");

  return errors;
}

function buildProposalPayload() {
  const discountPercent = toNumber(discountPercentInput.value);
  const needsAuthorization = !isAdminUser && discountPercent >= 21 && discountPercent <= 30;

  const proposalData = {
    proposalCode: proposalCodeInput.value.trim(),
    clientName: clientNameInput.value.trim(),
    cnpj: cnpjInput.value.trim(),
    installationId: installationIdInput.value.trim(),
    distributor: distributorInput.value.trim() || DEFAULTS.distributor,
    networkType: networkTypeInput.value,
    monthlyConsumption: toNumber(monthlyConsumptionInput.value),
    currentRate: toNumber(currentRateInput.value),
    minCost: toNumber(minCostInput.value),
    publicLighting: toNumber(publicLightingInput.value),
    discountPercent,
    flagGreenCost: toNumber(flagGreenCostInput.value),
    flagYellowCost: toNumber(flagYellowCostInput.value),
    flagRedICost: toNumber(flagRedICostInput.value),
    flagRedIICost: toNumber(flagRedIICostInput.value),
    gdRule: gdRuleInput.value,
    generationMode: generationModeInput.value,
    sellerName: scope.name || "",
    sellerPhone: scope.phone || "",
    returnFioB: !!returnFioBInput.checked,
    returnPisCofins: !!returnPisCofinsInput.checked,
    pisCofinsPct: toNumber(pisCofinsPctInput.value),
    returnIcms: !!returnIcmsInput.checked,
    icmsPct: toNumber(icmsPctInput.value),
  };

  return {
    user_id: scope.uid,
    tenant_id: scope.tenantId,
    user_email: scope.email || "",
    user_name: scope.name || "",
    proposal_code: proposalData.proposalCode,
    client_name: proposalData.clientName,
    cnpj: proposalData.cnpj,
    status: "aberta",
    needs_authorization: needsAuthorization,
    template_key: inferTemplateKey(scope.email),
    proposal_data: proposalData,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
}

function fillFormFromProposalData(proposalData = {}) {
  if (!proposalData || typeof proposalData !== "object") return;

  proposalCodeInput.value = proposalData.proposalCode || proposalCodeInput.value || "";
  clientNameInput.value = proposalData.clientName || "";
  cnpjInput.value = proposalData.cnpj || "";
  installationIdInput.value = proposalData.installationId || "";
  distributorInput.value = proposalData.distributor || DEFAULTS.distributor;
  networkTypeInput.value = mapNetworkType(proposalData.networkType || DEFAULTS.networkType) || DEFAULTS.networkType;
  monthlyConsumptionInput.value = String(toNumber(proposalData.monthlyConsumption));
  currentRateInput.value = String(toNumber(proposalData.currentRate));
  publicLightingInput.value = String(toNumber(proposalData.publicLighting));
  discountPercentInput.value = String(toNumber(proposalData.discountPercent || DEFAULTS.discountPercent));
  gdRuleInput.value = proposalData.gdRule || DEFAULTS.gdRule;
  generationModeInput.value = proposalData.generationMode || DEFAULTS.generationMode;

  flagGreenCostInput.value = String(
    proposalData.flagGreenCost ?? DEFAULTS.flagGreenCost
  );
  flagYellowCostInput.value = String(
    proposalData.flagYellowCost ?? DEFAULTS.flagYellowCost
  );
  flagRedICostInput.value = String(
    proposalData.flagRedICost ?? DEFAULTS.flagRedICost
  );
  flagRedIICostInput.value = String(
    proposalData.flagRedIICost ?? DEFAULTS.flagRedIICost
  );

  returnFioBInput.checked = proposalData.returnFioB ?? true;
  returnPisCofinsInput.checked = proposalData.returnPisCofins ?? true;
  pisCofinsPctInput.value = String(toNumber(proposalData.pisCofinsPct));
  returnIcmsInput.checked = proposalData.returnIcms ?? true;
  icmsPctInput.value = String(toNumber(proposalData.icmsPct));

  updateMinCost();
  evaluateDiscountRules();
  updateAdminBlock();
}

async function loadProposalForEdit() {
  if (!isEditMode || !editingProposalId) return;

  proposalStatusText.textContent = "Carregando proposta para edicao...";
  const snap = await getDoc(doc(db, "proposals", editingProposalId));
  if (!snap.exists()) throw new Error("Proposta nao encontrada.");

  const proposal = { id: snap.id, ...snap.data() };
  if (proposal.user_id !== scope.uid) {
    throw new Error("Sem permissao para editar esta proposta.");
  }

  originalProposal = proposal;
  fillFormFromProposalData(proposal.proposal_data || {});

  proposalPageTitle.textContent = "Editar Proposta";
  saveProposalLabel.textContent = "Salvar Alteracoes";
  proposalStatusText.textContent = "Edite os dados e salve as alteracoes.";
}

async function saveProposal() {
  if (saving) return;
  hideValidation();

  if (!evaluateDiscountRules()) return;

  const requiredErrors = getRequiredFieldErrors();
  if (requiredErrors.length) {
    showValidation(requiredErrors[0], "error");
    return;
  }

  saving = true;
  saveProposalBtn.disabled = true;
  proposalStatusText.textContent = "Salvando proposta...";

  try {
    const payload = buildProposalPayload();
    if (isEditMode && editingProposalId) {
      await updateDoc(doc(db, "proposals", editingProposalId), {
        proposal_code: payload.proposal_code,
        client_name: payload.client_name,
        cnpj: payload.cnpj,
        template_key: payload.template_key,
        needs_authorization: payload.needs_authorization,
        proposal_data: payload.proposal_data,
        updated_at: serverTimestamp(),
      });

      showValidation("Proposta atualizada com sucesso.", "success");
      proposalStatusText.textContent = `Proposta ${payload.proposal_code} atualizada.`;
      localStorage.setItem("gcsolar_last_generated_proposal_id", editingProposalId);
      localStorage.setItem("gcsolar_last_generated_proposal_code", payload.proposal_code || "");
      localStorage.setItem("gcsolar_last_generated_proposal_at", new Date().toISOString());
    } else {
      const ref = await addDoc(collection(db, "proposals"), payload);

      showValidation("Proposta salva com sucesso.", "success");
      proposalStatusText.textContent = `Proposta ${payload.proposal_code} salva.`;
      localStorage.setItem("gcsolar_last_generated_proposal_id", ref.id);
      localStorage.setItem("gcsolar_last_generated_proposal_code", payload.proposal_code || "");
      localStorage.setItem("gcsolar_last_generated_proposal_at", new Date().toISOString());
    }

    window.location.href = "calcular-desconto.html";
  } catch (error) {
    console.error("Erro ao salvar proposta:", error);
    showValidation("Falha ao salvar proposta. Tente novamente.", "error");
    proposalStatusText.textContent = "Falha ao salvar proposta.";
  } finally {
    saving = false;
    saveProposalBtn.disabled = false;
  }
}

async function bootstrapProposalCode() {
  if (isEditMode) return;
  proposalStatusText.textContent = "Gerando codigo da proposta...";
  try {
    const code = await generateProposalCode();
    proposalCodeInput.value = code;
    proposalStatusText.textContent = "Preencha os dados e salve para gerar a proposta.";
  } catch (error) {
    console.error("Erro ao gerar codigo:", error);
    proposalStatusText.textContent = "Não foi possível gerar codigo automático.";
    showValidation("Falha ao gerar codigo da proposta.", "error");
  }
}

toggleSidebarBtn.addEventListener("click", () => {
  if (isMobile()) {
    appShell.classList.toggle("mobile-open");
    return;
  }
  const collapsed = appShell.classList.toggle("sidebar-collapsed");
  localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
});

window.addEventListener("resize", () => {
  if (!isMobile()) appShell.classList.remove("mobile-open");
  applySidebarState();
});

themeBtn?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(themeKey, next);
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

pickPdfBtn.addEventListener("click", () => pdfInput.click());
pdfInput.addEventListener("change", onPdfSelected);

[networkTypeInput, currentRateInput, gdRuleInput].forEach((el) => {
  el.addEventListener("change", updateMinCost);
  el.addEventListener("input", updateMinCost);
});

discountPercentInput.addEventListener("input", evaluateDiscountRules);
discountPercentInput.addEventListener("change", evaluateDiscountRules);
gdRuleInput.addEventListener("change", updateAdminBlock);
generationModeInput.addEventListener("change", updateAdminBlock);

proposalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProposal();
});
saveProposalBtn.addEventListener("click", saveProposal);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  const isAllowed = token.claims.superadmin === true || role === "superadmin" || !!user.uid;
  if (!isAllowed) {
    window.location.href = "index.html";
    return;
  }

  scope = await getUserScope(user);
  isAdminUser = isAdminUser || token.claims.superadmin === true || role === "superadmin";
  applySidebarState();
  initTheme();
  applyDefaults();
  updateAdminBlock();
  if (isEditMode) {
    try {
      await loadProposalForEdit();
    } catch (error) {
      console.error("Erro ao carregar proposta para edicao:", error);
      showValidation("Falha ao carregar proposta para edicao.", "error");
      proposalStatusText.textContent = "Falha ao carregar proposta.";
      return;
    }
  } else {
    await bootstrapProposalCode();
  }
});

