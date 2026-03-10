import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ProcuracaoPDFGenerator } from "./procuracao-pdf-generator.js";

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

const COLLECTION_PROCURACOES = "gcredito_procuracoes";

const USER_TEMPLATE_MAP = {
  "jheferson@gmail.com": {
    templateName: "Jheferson - Equatorial GO",
    logoCandidates: [
      "/lovable-uploads/0d549a83-76bb-4884-8e15-0d0c41c35f65.png",
      "./equatoriallogo.png",
      "../equatoriallogo.png",
    ],
    title: "INSTRUMENTO PARTICULAR DE PROCURACAO",
    procuradoresText:
      "Sr. JHEFERSON FERNANDES DOS SANTOS, ENGENHEIRO ELETRICISTA portador do CREA No 1016143800D-GO, residente em GOIANIA - GO e Sr. JOAO VICTOR FREITAS VELASCO portador do CPF: 707.555.141-81, RG: 6693164 SSP, residente em GOIANIA - GO, Telefone (62) 98111-3178",
    powersText:
      "Com poderes para junto a Equatorial, solicitar Liberacao de Carga, assinar documentos, cadastros, projetos, firmar termo de compromisso e responsabilidade, enfim praticar todos os atos necessarios ao fiel cumprimento deste mandato junto a propriedade do outorgante.",
    footerLine1: "CAP - CENTRAL DE ANALISE DE PROJETOS",
    footerLine2:
      "RUA 2, QD-A37 - JARDIM GOIAS - EDIFICIO JONAS ARAUJO - CEP 74.805-180 - GOIANIA - GOIAS - BRASIL.",
  },
};

const DEFAULT_TEMPLATE = {
  templateName: "Padrao",
  logoCandidates: ["./equatoriallogo.png", "../equatoriallogo.png"],
};

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");

const tipoPessoaInput = document.getElementById("tipoPessoaInput");
const dataInput = document.getElementById("dataInput");
const nomeOutorganteInput = document.getElementById("nomeOutorganteInput");
const cpfOutorganteInput = document.getElementById("cpfOutorganteInput");
const rgOutorganteInput = document.getElementById("rgOutorganteInput");
const cepOutorganteInput = document.getElementById("cepOutorganteInput");
const cnpjOutorganteInput = document.getElementById("cnpjOutorganteInput");
const nomeRepresentanteInput = document.getElementById("nomeRepresentanteInput");
const cpfRepresentanteInput = document.getElementById("cpfRepresentanteInput");
const rgRepresentanteInput = document.getElementById("rgRepresentanteInput");
const enderecoOutorganteInput = document.getElementById("enderecoOutorganteInput");
const cidadeOutorganteInput = document.getElementById("cidadeOutorganteInput");
const estadoOutorganteInput = document.getElementById("estadoOutorganteInput");

const contaEnergiaInput = document.getElementById("contaEnergiaInput");
const cnhInput = document.getElementById("cnhInput");
const extrairDadosBtn = document.getElementById("extrairDadosBtn");
const extractStatusText = document.getElementById("extractStatusText");
const templateInfo = document.getElementById("templateInfo");

const gerarPdfBtn = document.getElementById("gerarPdfBtn");
const statusText = document.getElementById("statusText");

const pfFields = document.getElementById("pfFields");
const pjFields = document.getElementById("pjFields");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let currentUserEmail = "";
let activeTemplate = DEFAULT_TEMPLATE;
let pdfjsLibPromise = null;
let tesseractPromise = null;

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function sanitizeOutorganteName(value) {
  let name = cleanText(value);
  if (!name) return "";

  name = normalizeAscii(name);
  name = name.replace(
    /^(RESIDENCIAL|COMERCIAL|INDUSTRIAL|RURAL|SERVICOS?\s+E\s+OUTRAS\s+ATIVIDADES|PODER\s+PUBLICO)\s+/i,
    ""
  );
  name = name.replace(/^(BAIXA\s+TENSAO|ALTA\s+TENSAO)\s+/i, "");
  name = name.replace(/\bB\s*B\d+\b\s*/i, "");
  name = name.replace(/\bCONVENCIONAL\b\s*/i, "");
  name = name.replace(/\b(CNPJ|CPF|UC|INSTALACAO|ENDERECO|CEP|FATURA|CONSUMO)\b.*$/i, "");
  name = cleanText(name);

  if (name.split(" ").length < 2) return "";
  return name;
}

function sanitizeAddress(value) {
  let address = cleanText(value);
  if (!address) return "";

  address = address.replace(/^(ENDERECO|ENDEREÇO|LOGRADOURO)\s*[:\-]?\s*/i, "");
  address = address.replace(/^DE\s+ENTREGA\s*[:\-]?\s*/i, "");
  address = cleanText(address);

  return address;
}

function isInvalidAddress(value) {
  const normalized = normalizeAscii(value);
  if (!normalized) return true;
  if (normalized === "DE ENTREGA" || normalized === "DE ENTREGA:") return true;
  if (normalized.length < 8) return true;
  return false;
}

async function lookupAddressByCep(rawCep) {
  const cep = onlyDigits(rawCep);
  if (cep.length !== 8) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.erro) return null;

    return {
      cep: data.cep || rawCep,
      cidade: data.localidade || "",
      estado: data.uf || "",
      bairro: data.bairro || "",
      logradouro: data.logradouro || "",
    };
  } catch {
    return null;
  }
}

function formatTodayBr() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
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

function togglePessoaFields() {
  const isJuridica = tipoPessoaInput.value === "juridica";
  pfFields.classList.toggle("hidden", isJuridica);
  pjFields.classList.toggle("hidden", !isJuridica);
}

function setStatus(text, isError = false) {
  statusText.textContent = text || "";
  statusText.style.color = isError ? "#b91c1c" : "";
}

function setExtractStatus(text, isError = false) {
  extractStatusText.textContent = text || "";
  extractStatusText.style.color = isError ? "#b91c1c" : "";
}

function buildData() {
  return {
    tipoPessoa: tipoPessoaInput.value,
    data: dataInput.value.trim(),
    nomeOutorgante: nomeOutorganteInput.value.trim(),
    cpfOutorgante: cpfOutorganteInput.value.trim(),
    rgOutorgante: rgOutorganteInput.value.trim(),
    cepOutorgante: cepOutorganteInput.value.trim(),
    cnpjOutorgante: cnpjOutorganteInput.value.trim(),
    nomeRepresentante: nomeRepresentanteInput.value.trim(),
    cpfRepresentante: cpfRepresentanteInput.value.trim(),
    rgRepresentante: rgRepresentanteInput.value.trim(),
    enderecoOutorgante: enderecoOutorganteInput.value.trim(),
    cidadeOutorgante: cidadeOutorganteInput.value.trim(),
    estadoOutorgante: estadoOutorganteInput.value.trim(),
    cidade: cidadeOutorganteInput.value.trim(),
    estado: estadoOutorganteInput.value.trim(),
  };
}

function getTemplateForEmail(email) {
  const key = String(email || "").toLowerCase().trim();
  return USER_TEMPLATE_MAP[key] || DEFAULT_TEMPLATE;
}

async function getUserScope(user) {
  const result = { uid: user.uid, tenantId: user.uid };

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

async function getPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.mjs");
  }
  const pdfjsLib = await pdfjsLibPromise;
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.mjs";
  }
  return pdfjsLib;
}

async function getTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm");
  }
  return tesseractPromise;
}

async function extractPdfText(file) {
  const pdfjsLib = await getPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  const pages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += `${pageText}\n`;
  }

  return fullText;
}

async function extractImageText(file) {
  const tesseract = await getTesseract();
  const worker = await tesseract.createWorker("por");
  const { data } = await worker.recognize(file);
  await worker.terminate();
  return String(data?.text || "");
}

async function extractTextFromFile(file) {
  if (!file) return "";
  if (file.type === "application/pdf") return extractPdfText(file);
  return extractImageText(file);
}

function extractDocumentNumber(text) {
  const cpfMatch = text.match(/(?:CPF|CNPJ\/CPF|CPF\/CNPJ)\s*[:\-]?\s*([\d.\/-]+)/i);
  if (cpfMatch) return onlyDigits(cpfMatch[1]);
  const generic = text.match(/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}\b/);
  return onlyDigits(generic?.[0] || "");
}

function extractAddressFields(text) {
  const result = {};
  const cepMatch = text.match(/\b\d{5}\-?\d{3}\b/);
  if (cepMatch) result.cep = cepMatch[0];

  const cityStateMatch = text.match(/([A-Z\u00c0-\u00da\s]{3,})\s*[-\/]\s*([A-Z]{2})\b/i);
  if (cityStateMatch) {
    result.cidade = cleanText(cityStateMatch[1]);
    result.estado = cleanText(cityStateMatch[2]);
  }

  const enderecoMatch = text.match(/(?:ENDERECO|ENDERE\u00c7O|LOGRADOURO)\s*[:\-]?\s*(.+?)(?:\s+CEP\b|\s+CIDADE\b|\s+BAIRRO\b|\n|$)/i);
  if (enderecoMatch) result.endereco = sanitizeAddress(enderecoMatch[1]);

  return result;
}

function extractEnergyData(text) {
  const data = {};
  const source = String(text || "");

  const nomeMatch = source.match(/([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{8,}?)\s+(?:CNPJ\/CPF|CPF\/CNPJ|CPF|CNPJ)\s*[:\-]/i);
  if (nomeMatch) {
    const sanitized = sanitizeOutorganteName(nomeMatch[1]);
    data.nome = sanitized || cleanText(nomeMatch[1]);
  }

  const doc = extractDocumentNumber(source);
  if (doc) {
    if (doc.length === 14) {
      data.tipoPessoa = "juridica";
      data.cnpj = doc;
    } else if (doc.length === 11) {
      data.tipoPessoa = "fisica";
      data.cpf = doc;
    }
  }

  Object.assign(data, extractAddressFields(source));
  return data;
}

function extractCnhData(text) {
  const data = {};
  const source = String(text || "");

  const nomeMatch = source.match(/(?:NOME(?:\s*E\s*SOBRENOME)?)\s*[:\-]?\s*([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{8,})/i);
  if (nomeMatch) {
    data.nome = cleanText(nomeMatch[1]);
  } else {
    const firstBigLine = source.match(/\b([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{14,})\b/);
    if (firstBigLine) data.nome = cleanText(firstBigLine[1]);
  }

  const cpfMatch = source.match(/CPF\s*[:\-]?\s*([\d.\-]{11,14})/i);
  if (cpfMatch) data.cpf = onlyDigits(cpfMatch[1]);

  const rgMatch = source.match(/(?:RG|IDENTIDADE|REGISTRO\s+GERAL)\s*[:\-]?\s*([\dA-Z.\-]{5,20})/i);
  if (rgMatch) data.rg = cleanText(rgMatch[1]);

  return data;
}

function applyExtractedData({ billData, cnhData }) {
  const tipo = billData.tipoPessoa || (billData.cnpj ? "juridica" : "fisica");

  if (tipo === "juridica") {
    tipoPessoaInput.value = "juridica";
    cnpjOutorganteInput.value = billData.cnpj || cnpjOutorganteInput.value;
    nomeOutorganteInput.value = billData.nome || nomeOutorganteInput.value;

    if (cnhData.nome) nomeRepresentanteInput.value = cnhData.nome;
    if (cnhData.cpf) cpfRepresentanteInput.value = cnhData.cpf;
    if (cnhData.rg) rgRepresentanteInput.value = cnhData.rg;
  } else {
    tipoPessoaInput.value = "fisica";
    nomeOutorganteInput.value = cnhData.nome || billData.nome || nomeOutorganteInput.value;
    cpfOutorganteInput.value = cnhData.cpf || billData.cpf || cpfOutorganteInput.value;
    rgOutorganteInput.value = cnhData.rg || rgOutorganteInput.value;
  }

  const extractedAddress = sanitizeAddress(billData.endereco || "");
  if (extractedAddress) {
    enderecoOutorganteInput.value = extractedAddress;
  }
  cidadeOutorganteInput.value = billData.cidade || cidadeOutorganteInput.value;
  estadoOutorganteInput.value = billData.estado || estadoOutorganteInput.value;
  cepOutorganteInput.value = billData.cep || cepOutorganteInput.value;

  togglePessoaFields();
}

async function fillCityStateFromCep({ forceAddress = false } = {}) {
  const cep = cepOutorganteInput.value;
  const found = await lookupAddressByCep(cep);
  if (!found) return false;

  cidadeOutorganteInput.value = found.cidade || cidadeOutorganteInput.value;
  estadoOutorganteInput.value = found.estado || estadoOutorganteInput.value;

  const currentAddress = sanitizeAddress(enderecoOutorganteInput.value);
  if (forceAddress || isInvalidAddress(currentAddress)) {
    const addressParts = [found.logradouro, found.bairro].filter(Boolean);
    if (addressParts.length) {
      enderecoOutorganteInput.value = addressParts.join(" - ");
    }
  }

  return true;
}

async function extractAutoData() {
  const billFile = contaEnergiaInput.files?.[0];
  const cnhFile = cnhInput.files?.[0];

  if (!billFile && !cnhFile) {
    setExtractStatus("Selecione a conta de energia ou a CNH.", true);
    return;
  }

  extrairDadosBtn.disabled = true;

  try {
    setExtractStatus("Lendo documentos...");

    const billText = billFile ? await extractTextFromFile(billFile) : "";
    const cnhText = cnhFile ? await extractTextFromFile(cnhFile) : "";

    const billData = extractEnergyData(billText);
    const cnhData = extractCnhData(cnhText);

    applyExtractedData({ billData, cnhData });
    await fillCityStateFromCep({ forceAddress: isInvalidAddress(enderecoOutorganteInput.value) });

    const filledCount = [
      nomeOutorganteInput.value,
      cpfOutorganteInput.value,
      cnpjOutorganteInput.value,
      rgOutorganteInput.value,
      enderecoOutorganteInput.value,
      cidadeOutorganteInput.value,
      estadoOutorganteInput.value,
      cepOutorganteInput.value,
      nomeRepresentanteInput.value,
      cpfRepresentanteInput.value,
      rgRepresentanteInput.value,
    ].filter(Boolean).length;

    if (filledCount === 0) {
      setExtractStatus("Não consegui extrair dados legíveis dos documentos.", true);
      return;
    }

    setExtractStatus(`Dados extraidos e preenchidos (${filledCount} campos).`);
  } catch (error) {
    console.error(error);
    setExtractStatus("Falha ao extrair dados automaticamente.", true);
  } finally {
    extrairDadosBtn.disabled = false;
  }
}

async function saveGeneratedRecordToDb(data, template) {
  if (!scope) throw new Error("Escopo de usuario nao carregado.");

  const documentoOutorgante = data.tipoPessoa === "juridica" ? data.cnpjOutorgante : data.cpfOutorgante;

  const payload = {
    tenantId: scope.tenantId,
    uid: scope.uid,
    userEmail: currentUserEmail,
    nomeOutorgante: data.nomeOutorgante,
    tipoPessoa: data.tipoPessoa,
    documentoOutorgante: documentoOutorgante || "",
    cidade: data.cidade,
    estado: data.estado,
    dataDocumento: data.data,
    data,
    template,
    status: "gerada",
    createdAt: serverTimestamp(),
    createdAtISO: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };

  await addDoc(collection(db, COLLECTION_PROCURACOES), payload);
}

async function generatePdf() {
  const data = buildData();

  if (!scope) {
    setStatus("Aguardando autenticacao...", true);
    return;
  }

  if (!data.nomeOutorgante || !data.enderecoOutorgante || !data.cidadeOutorgante || !data.estadoOutorgante) {
    setStatus("Preencha nome, endereco, cidade e estado.", true);
    return;
  }

  if (data.tipoPessoa === "fisica" && !data.cpfOutorgante) {
    setStatus("Informe o CPF para pessoa fisica.", true);
    return;
  }

  if (data.tipoPessoa === "juridica" && !data.cnpjOutorgante) {
    setStatus("Informe o CNPJ para pessoa juridica.", true);
    return;
  }

  try {
    setStatus("Gerando PDF...");
    gerarPdfBtn.disabled = true;

    const generator = new ProcuracaoPDFGenerator();
    const bytes = await generator.generatePDF(data, activeTemplate);

    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "procuracao.pdf";
    link.click();
    URL.revokeObjectURL(url);

    await saveGeneratedRecordToDb(data, activeTemplate);

    setStatus("Procuração gerada e salva no banco.");
  } catch (error) {
    console.error(error);
    setStatus("Não foi possível gerar/salvar a procuracao.", true);
  } finally {
    gerarPdfBtn.disabled = false;
  }
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

  tipoPessoaInput?.addEventListener("change", togglePessoaFields);
  extrairDadosBtn?.addEventListener("click", extractAutoData);
  gerarPdfBtn?.addEventListener("click", generatePdf);
  cepOutorganteInput?.addEventListener("blur", () => {
    fillCityStateFromCep({ forceAddress: false }).catch(() => {});
  });

  window.addEventListener("resize", applySidebarState);
}

function initUi() {
  dataInput.value = formatTodayBr();
  initTheme();
  applySidebarState();
  togglePessoaFields();
  bindEvents();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    scope = await getUserScope(user);
    currentUserEmail = user.email || "";
    activeTemplate = getTemplateForEmail(currentUserEmail);

    const templateName = activeTemplate.templateName || "Padrao";
    const userLabel = currentUserEmail || "sem usuario autenticado";
    templateInfo.textContent = `Template ativo: ${templateName} (${userLabel})`;
  } catch (error) {
    console.error(error);
    templateInfo.textContent = "Template ativo: Padrao";
  }
});

initUi();
