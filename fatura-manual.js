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

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const uploadInput = document.getElementById("manualInvoiceInput");
const uploadFileName = document.getElementById("uploadFileName");
const invoiceRenderHost = document.getElementById("invoiceRenderHost");
const originalInvoiceHost = document.getElementById("originalInvoiceHost");
const sendValidationBtn = document.getElementById("sendValidationBtn");

const COLL_VALIDACAO = "gcredito_faturas_validacao";
const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let currentUser = null;
let currentUserEmail = "";
let originalInvoiceUrl = "";
let originalPreviewDataUrl = "";
let pdfjsLibPromise = null;
let lastExtractData = null;
let authReady = false;

const debugLines = [];

function debug(msg) {
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`;
  debugLines.push(line);
  if (debugLines.length > 140) debugLines.shift();
  console.log("[FATURA-MANUAL]", msg);
}

function resetDebug() {
  debugLines.length = 0;
}

function setValidationButtonState(enabled, busy = false) {
  if (!sendValidationBtn) return;
  sendValidationBtn.disabled = !enabled || busy;
  sendValidationBtn.textContent = busy ? "Enviando..." : "Enviar para validação";
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

function applySidebarState() {
  const collapsed = localStorage.getItem(collapsedKey) === "1";
  if (!isMobile() && collapsed) appShell.classList.add("sidebar-collapsed");
  else appShell.classList.remove("sidebar-collapsed");
}

function onlyDigits(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function brl(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

function brNumber(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return (0).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function kwhCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 kWh";
  const isInt = Math.abs(n - Math.round(n)) < 0.001;
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  })} kWh`;
}

function rateBr(value, decimals = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "R$ 0,00000000";
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return "";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function isValidDocValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "-" || raw === "n/a" || raw === "na" || raw === "null" || raw === "undefined") return false;
  const digits = onlyDigits(raw);
  return digits.length === 11 || digits.length === 14;
}

function extractCpfFromSubscriber(docData = {}) {
  const candidates = [
    docData.cpfCnpjDonoConta,
    docData.cpfCnpj_dono_conta,
    docData.cpfDonoConta,
    docData.cpf,
    docData.cpfCnpj,
    docData?.energy?.cpf,
    docData?.energy?.cpfCnpj,
    docData?.dadosCliente?.cpf,
    docData?.dadosCliente?.cpfCnpj,
    docData?.documento?.cpf,
    docData?.titular?.cpf,
  ];
  for (const c of candidates) {
    const f = formatCpf(c);
    if (f) return f;
  }
  return "";
}

function extractUcFromSubscriber(docData = {}) {
  const candidates = [
    docData.uc,
    docData.consumer_unit,
    docData.installationId,
    docData?.energy?.uc,
    docData?.energy?.consumer_unit,
    docData?.dadosEnergia?.uc,
    docData?.dados_energia?.uc,
    docData?.invoice?.uc,
  ];
  for (const c of candidates) {
    const d = onlyDigits(c);
    if (d.length >= 8 && d.length <= 12) return d;
  }
  return "";
}

function findUcDeep(obj, targetUc, maxDepth = 6, depth = 0) {
  if (!obj || depth > maxDepth) return false;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (findUcDeep(item, targetUc, maxDepth, depth + 1)) return true;
    }
    return false;
  }
  if (typeof obj !== "object") return false;

  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = String(k).toLowerCase();

    if (typeof v === "string" || typeof v === "number") {
      const digits = onlyDigits(v);
      if (digits && digits === targetUc) return true;
      if ((key.includes("uc") || key.includes("instal") || key.includes("consumer")) && digits === targetUc) return true;
    } else if (typeof v === "object") {
      if (findUcDeep(v, targetUc, maxDepth, depth + 1)) return true;
    }
  }
  return false;
}

function findCpfDeep(obj, maxDepth = 5, depth = 0) {
  if (!obj || depth > maxDepth) return "";
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findCpfDeep(item, maxDepth, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof obj !== "object") return "";

  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = String(k).toLowerCase();
    if (typeof v === "string" || typeof v === "number") {
      if (key.includes("cpf") || key.includes("documento") || key.includes("cpfcnpj")) {
        const f = formatCpf(v);
        if (f) return f;
      }
    } else if (typeof v === "object") {
      const found = findCpfDeep(v, maxDepth, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

async function findCpfByUC(uc) {
  const normalizedUC = onlyDigits(uc);
  if (!normalizedUC) {
    debug("UC vazia para busca de CPF.");
    return "";
  }

  debug(`Buscando CPF pela UC ${normalizedUC}...`);

  try {
    const collections = ["gcredito_subscribers", "assinantes_pendentes"];
    const attempts = [normalizedUC, String(uc || "").trim(), Number(normalizedUC)].filter((v, i, arr) => v !== "" && arr.indexOf(v) === i);

    for (const collName of collections) {
      const coll = collection(db, collName);

      for (const value of attempts) {
        const q = query(coll, where("uc", "==", value), limit(5));
        const snap = await getDocs(q);
        debug(`${collName}: tentativa uc==${String(value)} -> ${snap.size} resultado(s)`);
        for (const d of snap.docs) {
          const cpf = extractCpfFromSubscriber(d.data()) || findCpfDeep(d.data());
          if (cpf) {
            debug(`${collName}: CPF encontrado por where(uc==...): ${cpf}`);
            return cpf;
          }
        }
      }

      const scan = await getDocs(query(coll, limit(600)));
      debug(`${collName}: varredura fallback em ${scan.size} docs`);
      for (const d of scan.docs) {
        const raw = d.data() || {};
        const docUC = extractUcFromSubscriber(raw);
        const matchField = docUC && docUC === normalizedUC;
        const matchDeep = !matchField && findUcDeep(raw, normalizedUC);
        if (matchField || matchDeep) {
          const cpf = extractCpfFromSubscriber(raw) || findCpfDeep(raw);
          if (cpf) {
            debug(`${collName}: CPF encontrado por varredura (${matchField ? "campo UC" : "busca profunda UC"}): ${cpf}`);
            return cpf;
          }
          debug(`${collName}: UC encontrada (${matchField ? "campo UC" : "busca profunda UC"}), mas sem CPF no doc ${d.id}.`);
        }
      }
    }
  } catch (err) {
    debug(`Erro na busca CPF por UC: ${err?.message || err}`);
  }

  debug("CPF nao encontrado para a UC informada.");
  return "";
}

async function enrichCpfFromSubscriber(data) {
  const info = (data.info_fatura ||= {});
  const extracted = (data.dados_extraidos ||= {});
  const currentDoc = info.cpf || extracted.cpf || extracted.cpf_cnpj || extracted.cnpj || "";

  if (isValidDocValue(currentDoc)) {
    const normalized = formatCpf(currentDoc) || String(currentDoc).trim();
    info.cpf = normalized;
    extracted.cpf = normalized;
    extracted.cpf_cnpj = normalized;
    debug(`CPF ja veio na extracao: ${normalized}`);
    return data;
  }

  const uc = info.uc || extracted.consumer_unit || extracted.uc || "";
  const cpf = await findCpfByUC(uc);

  if (cpf) {
    info.cpf = cpf;
    extracted.cpf = cpf;
    extracted.cpf_cnpj = cpf;
    debug(`CPF aplicado por fallback da UC: ${cpf}`);
  } else {
    info.cpf = "";
    extracted.cpf = "";
  }

  return data;
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

function readTotals(data) {
  const split = data?.fatura_calculada?.split || {};
  const v2 = data?.fatura_calculada_v2?.totals || {};
  return {
    goldtech: Number(v2.goldtech ?? split.goldtech_liquido ?? 0) || 0,
    equatorial: Number(v2.equatorial ?? split.equatorial_total ?? 0) || 0,
    payable: Number(v2.payable ?? split.total_pagar ?? 0) || 0,
    economy: Number(v2.economy ?? split.economia_real ?? 0) || 0,
    noSolar: Number(split.valor_sem_solar ?? 0) || 0,
  };
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

function parseDueDateParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return { day: Number(br[1]), month: Number(br[2]), year: Number(br[3]) };
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { day: Number(iso[3]), month: Number(iso[2]), year: Number(iso[1]) };
  }

  return null;
}

function resolveDueDate(monthRef, rawDue) {
  // Regra solicitada: sempre hoje + 5 dias.
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 5);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function renderInvoiceDefault(data) {
  const info = data?.info_fatura || {};
  const extracted = data?.dados_extraidos || {};
  const totals = readTotals(data);
  const split = data?.fatura_calculada?.split || {};

  const uc = info.uc || extracted.consumer_unit || "-";
  const name = info.nome || extracted.legal_name || "-";
  const cpf = info.cpf || extracted.cpf || extracted.cnpj || extracted.cpf_cnpj || "-";
  const address = info.endereco || extracted.address || "-";
  const monthRef = info.mes_referencia || extracted.month_reference || "-";
  const dueRaw = info.vencimento || extracted.expiration_date || "";
  const yearRef = String(monthRef).includes("/") ? String(monthRef).split("/")[1] : String(new Date().getFullYear());
  const invoiceNumber = extracted.numero_fatura || info.numero_fatura || `44/${yearRef}`;
  const invoiceValue = Number(totals.payable || info.valor_total || extracted.invoice_value || 0);
  const emissao = extracted.data_emissao || new Date().toLocaleDateString("pt-BR");

  const due = resolveDueDate(monthRef, dueRaw);

  const energiaComp = Number(extracted.compensated_energy || 0);
  const energiaNc = Number(extracted.measured_energy || 0);
  const energiaTotal = Math.max(0, energiaComp + energiaNc);
  const tarifaRef = Number(data?.fatura_calculada?.tarifa_referencia || extracted.tarifa_com_tributos || 0);
  const energiaSem = totals.noSolar > 0 ? totals.noSolar : energiaTotal * tarifaRef;
  const energiaCom = totals.payable || totals.goldtech + totals.equatorial;
  const economiaMes = totals.economy;
  const economiaAc = Math.max(0, Number(extracted.economia_acumulada || 0) || economiaMes);
  const ajusteTarifas = Number(split.repasse_encargos || 0);
  const valorEnergiaCompensada = Number(split.goldtech_bruto || totals.goldtech || 0);
  const valorEnergiaNãoCompensada = energiaNc * tarifaRef;

  const [mm, yyyy] = String(monthRef || "01/2026").split("/");
  const refDate = new Date(Number(yyyy) || 2026, (Number(mm) || 1) - 1, 1);
  const m0 = refDate.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").toUpperCase();
  const m1 = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").toUpperCase();
  const m2 = new Date(refDate.getFullYear(), refDate.getMonth() - 2, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").toUpperCase();
  const m3 = new Date(refDate.getFullYear(), refDate.getMonth() - 3, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").toUpperCase();
  const h1 = Math.max(0, economiaMes);
  const h2 = Math.max(0, economiaAc - economiaMes);
  const hMax = Math.max(1, h1, h2);

  const classLabel = extracted.classe || extracted.classificacao || "Residencial Trifasico";

  return `
    <article class="invoice-j7">
      <header class="j7-top">
        <div class="j7-brand"><div class="energy">energy</div><div class="pay">PAY</div></div>
        <div class="j7-contact"><div class="phone">(62) 3140-7070</div><div class="site">energypay.me</div><div class="addr">Av. Antonio Fidelis, 205<br>Parque Amazonia - Goiania - GO</div></div>
      </header>

      <section class="j7-client">
        <div class="j7-grid">
          <div><b>Cliente:</b> ${escapeHtml(name)}</div>
          <div><b>CPF:</b> ${escapeHtml(cpf)}</div>
          <div><b>Endereço:</b> ${escapeHtml(address)}</div>
          <div><b>Data de emissao:</b> ${escapeHtml(emissao)}</div>
          <div><b>No da Instalacao:</b> ${escapeHtml(uc)} <span class="j7-class"><b>Classe:</b> ${escapeHtml(classLabel)}</span></div>
        </div>
        <div class="j7-metrics">
          <div class="j7-metric"><span>N.O DA FATURA:</span><strong>${escapeHtml(invoiceNumber)}</strong></div>
          <div class="j7-metric"><span>VENCIMENTO:</span><strong>${escapeHtml(due)}</strong></div>
          <div class="j7-metric"><span>REF:</span><strong>${escapeHtml(monthRef)}</strong></div>
          <div class="j7-metric"><span>VALOR A PAGAR:</span><strong>${brl(invoiceValue)}</strong></div>
        </div>
      </section>

      <section class="j7-body">
        <div class="j7-columns">
          <div>
            <div class="j7-title-wrap"><div class="j7-title-icon"><i class="ph ph-seal-check"></i></div><div class="j7-title">Economia com<br><span class="accent">a Energy Pay</span></div></div>
            <div class="j7-economy-card">
              <div class="j7-eco-line"><span>ECONOMIA NO MES</span><strong>${brl(economiaMes)}</strong></div>
              <div class="j7-eco-line"><span>ECONOMIA ACUMULADA</span><strong>${brl(economiaAc)}</strong></div>
            </div>
            <div class="j7-history">
              <h3>HISTORICO DE ECONOMIA</h3>
              <div class="j7-history-chart">
                <div class="j7-row"><span>${m0}</span><div class="j7-bar"><i style="width:${(h1 / hMax) * 100}%"></i></div><b>${brl(h1).replace("R$", "R$ ")}</b></div>
                <div class="j7-row"><span>${m1}</span><div class="j7-bar"><i style="width:${(h2 / hMax) * 100}%"></i></div><b>${brl(h2).replace("R$", "R$ ")}</b></div>
                <div class="j7-row"><span>${m2}</span><div class="j7-bar"><i style="width:0%"></i></div><b>R$ 0,00</b></div>
                <div class="j7-row"><span>${m3}</span><div class="j7-bar"><i style="width:0%"></i></div><b>R$ 0,00</b></div>
                <div class="j7-axis"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span><span>125</span><span>150</span><span>175</span><span>200</span></div>
                <div class="j7-axis-rs">R$</div>
              </div>
            </div>
          </div>
          <div class="j7-right">
            <div class="j7-pill">FATURA ENERGY PAY</div>
            <div class="j7-panel white">
              <div class="j7-table-head"><span></span><span>QUANTIDADE</span><span>VALOR A PAGAR</span></div>
              <div class="j7-trow"><span>Energia eletrica compensada</span><span>${kwhCompact(energiaComp)}</span><span>${brl(valorEnergiaCompensada)}</span></div>
              <div class="j7-trow"><span>Desconto ajuste de tarifas</span><span></span><span>-${brl(ajusteTarifas).replace("R$", "R$ ")}</span></div>
              <div class="j7-total"><span>Total:</span><strong>${brl(energiaCom)}</strong></div>
            </div>
            <div class="j7-pill">DEMONSTRATIVO DE ECONOMIA</div>
            <div class="j7-panel white">
              <div class="j7-section-title">VALOR TOTAL DA ENERGIA SEM A ENERGY PAY</div>
              <div class="j7-table-head j7-table-head-4"><span></span><span>QUANTIDADE</span><span>TARIFA</span><span>VALOR A PAGAR</span></div>
              <div class="j7-trow j7-trow-4"><span>Energia eletrica</span><span>${kwhCompact(energiaTotal)}</span><span>${rateBr(tarifaRef, 8)}</span><span>${brl(energiaSem)}</span></div>
              <div class="j7-total"><span>Total:</span><strong>${brl(energiaSem)}</strong></div>
              <div class="j7-section-title">VALOR TOTAL DA ENERGIA COM A ENERGY PAY</div>
              <div class="j7-table-head"><span></span><span>QUANTIDADE</span><span>VALOR A PAGAR</span></div>
              <div class="j7-trow"><span>Energia elétrica não compensada</span><span>${kwhCompact(energiaNc)}</span><span>${brl(valorEnergiaNãoCompensada)}</span></div>
              <div class="j7-trow"><span>Ajuste de tarifas</span><span></span><span>${brl(ajusteTarifas)}</span></div>
              <div class="j7-trow"><span>Fatura ENERGY PAY</span><span></span><span>${brl(energiaCom)}</span></div>
              <div class="j7-total"><span>Total:</span><strong>${brl(energiaCom)}</strong></div>
              <div class="j7-section-title">CALCULO DA ECONOMIA</div>
              <div class="j7-calc"><span>Valor total da energia <b>SEM</b> A ENERGY PAY</span><strong>${brl(energiaSem)}</strong></div>
              <div class="j7-calc"><span>Valor total da energia <b>COM</b> A ENERGY PAY</span><strong>${brl(energiaCom)}</strong></div>
              <div class="j7-calc total"><span>Total Economizado:</span><strong>${brl(economiaMes)}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <footer class="j7-bottom-receiver">
        <strong>RECEBEDOR:</strong> J7 EMPREENDIMENTOS E CONSULTORIA LTDA - CNPJ: 14.375.534/0001-07
        <div class="j7-payment-space"><div class="j7-barcode-placeholder">Espaco reservado para Codigo de Barras</div><div class="j7-qrcode-placeholder">QR<br>Code</div></div>
      </footer>
    </article>
  `;
}

function renderInvoiceGoldtech(data) {
  const info = data?.info_fatura || {};
  const extracted = data?.dados_extraidos || {};
  const totals = readTotals(data);
  const split = data?.fatura_calculada?.split || {};

  const uc = info.uc || extracted.consumer_unit || "-";
  const name = info.nome || extracted.legal_name || "-";
  const cpf = info.cpf || extracted.cpf || extracted.cnpj || extracted.cpf_cnpj || "-";
  const address = info.endereco || extracted.address || "-";
  const monthRef = (info.mes_referencia || extracted.month_reference || "-").toUpperCase();
  const dueRaw = info.vencimento || extracted.expiration_date || "";
  const emissao = extracted.data_emissao || new Date().toLocaleDateString("pt-BR");
  const due = resolveDueDate(monthRef, dueRaw);

  const energiaComp = Number(extracted.compensated_energy || 0);
  const energiaNc = Number(extracted.measured_energy || 0);
  const prodAtual = Number(extracted.generated_energy || 0);
  const saldoAnterior = Math.max(0, Number(extracted.previous_balance_kwh || 0));
  const saldoAtual = Math.max(0, Number(extracted.current_balance_kwh || (saldoAnterior - energiaNc + energiaComp)));
  const tarifaRef = Number(data?.fatura_calculada?.tarifa_referencia || extracted.tarifa_com_tributos || 0);

  const valorSemSolar = Number(totals.noSolar || (energiaComp + energiaNc) * tarifaRef);
  const valorComSolar = Number(totals.payable || totals.goldtech + totals.equatorial || 0);
  const economiaMes = Number(totals.economy || Math.max(0, valorSemSolar - valorComSolar));
  const valorGoldtech = Number(totals.goldtech || split.goldtech_liquido || 0);
  const valorEquatorial = Number(totals.equatorial || split.equatorial_total || 0);

  const rowCompensada = Number(split.goldtech_bruto || valorGoldtech);
  const rowNaoComp = Number(energiaNc * tarifaRef || valorEquatorial);
  const rowBandeira = Number(split.repasse_encargos || 0);
  const rowIlum = Number(extracted.public_lighting_fee || 0);
  const rowOutros = Math.max(0, valorEquatorial - rowNaoComp - rowBandeira - rowIlum);

  const consumoMes = energiaNc + energiaComp;
  const goldtechUnit = energiaComp > 0 ? rowCompensada / energiaComp : 0;
  const eqUnit = energiaNc > 0 ? rowNaoComp / energiaNc : 0;

  return `
    <article class="invoice-j7 invoice-goldtech-v5">
      <div class="invoice-new">
        <div class="top-line"></div>
        <div class="invoice-header-high-fid">
          <div class="header-center-content">
            <div class="company-name">GOLDTECH ENGENHARIA</div>
            <div class="company-cnpj">48.467.586/0001-25</div>
            <div class="invoice-title-main">FATURA</div>
            <div class="invoice-month-line">MES: <span>${escapeHtml(monthRef)}</span></div>
            <div class="contact-info">
              <div>(62) 98161-1110</div>
              <div>contato@goldtechengenharia.com</div>
              <div>388, Av. Xingu, Pq. Amazonia</div>
              <div>Goiania, GO</div>
              <div>74840-350</div>
            </div>
          </div>
          <div class="logo-container-circle"><img src="goldtech.png" alt="Goldtech Logo" class="logo-circle-image"></div>
        </div>

        <div class="invoice-body-middle">
          <div class="energy-summary">
            <div class="summary-row"><span class="summary-label">SALDO ANTERIOR:</span><span class="summary-value">${Math.round(saldoAnterior)} kWh</span></div>
            <div class="summary-row stripe"><span class="summary-label">Consumo desse mês:</span><span class="summary-value">${Math.round(consumoMes)} kWh</span></div>
            <div class="summary-row"><span class="summary-label">Producao atual:</span><span class="summary-value">${Math.round(prodAtual)} kWh</span></div>
            <div class="summary-row stripe"><span class="summary-label">Consumo compensado:</span><span class="summary-value">${Math.round(energiaComp)} kWh</span></div>
            <div class="summary-row"><span class="summary-label">SALDO ATUAL:</span><span class="summary-value">${Math.round(saldoAtual)} kWh</span></div>

            <div class="economy-badge">
              <div class="economy-title">ECONOMIA REAL</div>
              <div class="economy-row"><span class="currency">R$</span><span class="value">${brNumber(economiaMes)}</span></div>
            </div>

            <div class="invoice-demonstration-small">
              <table class="demo-table">
                <thead>
                  <tr><th>Demonstrativo de funcionamento</th><th>QTD</th><th>Preco unitario</th><th>Custo total</th></tr>
                </thead>
                <tbody>
                  <tr class="highlight"><td>ENERGIA COMPENSADA</td><td>${Math.round(energiaComp)} kWh</td><td>${goldtechUnit ? `R$ ${brNumber(goldtechUnit, 6)}` : "-"}</td><td>${brl(rowCompensada)}</td></tr>
                  <tr><td>ENERGIA NAO COMPENSADA</td><td>${Math.round(energiaNc)} kWh</td><td>${eqUnit ? `R$ ${brNumber(eqUnit, 6)}` : "-"}</td><td>${brl(rowNaoComp)}</td></tr>
                  <tr><td>ADICIONAIS DE BANDEIRA</td><td>-</td><td>R$ 0,00</td><td>${brl(rowBandeira)}</td></tr>
                  <tr><td>TAXA DE ILUMINACAO PUBLICA</td><td>-</td><td>-</td><td>${brl(rowIlum)}</td></tr>
                  <tr><td>OUTROS</td><td>-</td><td>-</td><td>${brl(rowOutros)}</td></tr>
                </tbody>
              </table>
            </div>

            <div class="total-banner-small">
              <div class="total-label">TOTAL A PAGAR:</div>
              <div class="total-badge">${brl(valorComSolar)}</div>
            </div>

            <div class="consumer-info-box">
              <div class="info-line-main"><span class="label">UNIDADE CONSUMIDORA:</span><span class="value">${escapeHtml(uc)}</span></div>
              <div class="info-group"><span class="label">Endereço:</span> <span class="value">${escapeHtml(address)}</span></div>
              <div class="info-group"><span class="label">Vencimento em:</span> <span class="value">${escapeHtml(due)}</span></div>
              <div class="info-group payer-info"><div class="label">Pagador</div><div class="value">${escapeHtml(name)}</div><div class="value">${escapeHtml(cpf)}</div></div>
              <div class="info-group service-line"><span class="label">Servico:</span> <span class="value">Locacao de sistema fotovoltaico mensal</span></div>
            </div>
          </div>

          <div class="comparison-section">
            <div class="comparison-item red"><div class="comp-text">Voce pagaria esse mes o valor de</div><div class="comp-value">${brl(valorSemSolar)}</div></div>
            <div class="comparison-item green"><div class="comp-text">Voce esta pagando o equivalente a</div><div class="comp-value">${brl(valorComSolar)}</div><div class="comp-subtext">pela conta desse mês.</div></div>

            <div class="goldtech-pay-summary">
              <div class="goldtech-details"><span>${Math.round(energiaComp)} kWh</span><span>${goldtechUnit ? `R$ ${brNumber(goldtechUnit, 6)}` : "-"}</span><span>${brl(rowCompensada)}</span></div>
              <div class="goldtech-main-line"><span class="goldtech-label">GOLDTECH:</span><span class="goldtech-value">${brl(valorGoldtech)}</span></div>
            </div>

            <div class="equatorial-pay-summary">
              <div class="equatorial-details">
                <div class="eq-row"><span>${Math.round(energiaNc)} kWh</span><span>${eqUnit ? `R$ ${brNumber(eqUnit, 6)}` : "-"}</span><span>${brl(rowNaoComp)}</span></div>
                <div class="eq-row"><span>&nbsp;</span><span>R$ 0,00</span><span>${brl(rowBandeira)}</span></div>
                <div class="eq-row"><span>&nbsp;</span><span>&nbsp;</span><span>${brl(rowIlum)}</span></div>
              </div>
              <div class="equatorial-main-line"><span class="equatorial-label">EQUATORIAL:</span><span class="equatorial-value">${brl(valorEquatorial)}</span></div>
            </div>

            <div class="pix-qr-mini-box">
              <span class="pix-mini-label">PAGUE COM PIX</span>
              <div class="pix-qr-img-wrapper j7-qrcode-placeholder">QR<br>Code</div>
            </div>
          </div>

        </div>

        <div class="barcode-container">
          <div class="barcode-label">CODIGO DE BARRAS - PARA PAGAMENTO NO BANCO</div>
          <div class="barcode-img-wrapper j7-barcode-placeholder">Espaco reservado para Codigo de Barras</div>
          <div class="barcode-numbers">Linha digitavel sera adicionada na emissao.</div>
        </div>

        <footer class="invoice-footer">
          <div class="footer-top-line"></div>
          <div class="footer-content">
            <div class="footer-text">
              <p class="thanks">Muito obrigado pela preferencia e confianca. E um imenso prazer atende-lo como nosso cliente.</p>
              <p class="next-bill">Próxima fatura em 30 dias.</p>
            </div>
            <div class="footer-logo"><span class="footer-logo-text">GOLDTECH<br><small>Energia</small></span></div>
          </div>
        </footer>
      </div>
    </article>
  `;
}

function isGoldtechLayoutUser() {
  const target = "projetos@goldtechenergia.com";
  const candidates = [
    currentUserEmail,
    currentUser?.email,
    auth.currentUser?.email,
  ];
  return candidates.some((value) => String(value || "").trim().toLowerCase() === target);
}

function resolveInvoiceLayoutByUser() {
  if (isGoldtechLayoutUser()) return "goldtech";
  return "default";
}

function renderInvoice(data) {
  const layout = resolveInvoiceLayoutByUser();
  if (layout === "goldtech") return renderInvoiceGoldtech(data);
  return renderInvoiceDefault(data);
}

function renderInvoicePreview(data) {
  if (!invoiceRenderHost) return;
  invoiceRenderHost.innerHTML = renderInvoice(data);
}

function clearOriginalPreview() {
  if (originalInvoiceUrl) {
    URL.revokeObjectURL(originalInvoiceUrl);
    originalInvoiceUrl = "";
  }
  if (originalInvoiceHost) {
    originalInvoiceHost.innerHTML = '<p class="preview-empty">A fatura original aparecera aqui apos selecionar o arquivo.</p>';
  }
}

async function getPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs");
  }
  const lib = await pdfjsLibPromise;
  if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
  }
  return lib;
}

async function renderOriginalInvoice(file) {
  if (!originalInvoiceHost) return;

  if (originalInvoiceUrl) {
    URL.revokeObjectURL(originalInvoiceUrl);
    originalInvoiceUrl = "";
  }

  const type = String(file.type || "").toLowerCase();
  if (type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
    originalInvoiceHost.innerHTML = '<p class="preview-empty">Renderizando fatura original...</p>';
    try {
      const pdfjsLib = await getPdfJsLib();
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement("canvas");
      canvas.className = "original-invoice-canvas";
      const ctx = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      originalPreviewDataUrl = canvas.toDataURL("image/jpeg", 0.62);
      originalInvoiceHost.innerHTML = "";
      originalInvoiceHost.appendChild(canvas);
      debug("Fatura original renderizada (pagina 1).");
    } catch (err) {
      debug(`Erro ao renderizar PDF original: ${err?.message || err}`);
      originalInvoiceHost.innerHTML = '<p class="preview-empty">Não foi possível renderizar a fatura original.</p>';
      originalPreviewDataUrl = "";
    }
    return;
  }

  originalInvoiceUrl = URL.createObjectURL(file);
  if (type.startsWith("image/")) {
    originalInvoiceHost.innerHTML = `<img class="original-invoice-image" src="${originalInvoiceUrl}" alt="Fatura original Equatorial">`;
    originalPreviewDataUrl = originalInvoiceUrl;
    return;
  }

  originalInvoiceHost.innerHTML = '<p class="preview-empty">Formato nao suportado para preview da fatura original.</p>';
  originalPreviewDataUrl = "";
}

async function postInvoiceToV2(file) {
  const form = new FormData();
  form.append("invoice", file);

  const endpoints = [];
  if (window.location.port === "3001") endpoints.push("/api/v2/extract");
  endpoints.push("http://127.0.0.1:3001/api/v2/extract");
  endpoints.push("http://localhost:3001/api/v2/extract");

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        const errText = [body?.error || `HTTP ${response.status}`, body?.details || ""]
          .filter(Boolean)
          .join(": ");
        throw new Error(errText);
      }
      return { data: body, cache: response.headers.get("X-Extract-Cache") || "MISS", endpoint };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Backend indisponivel.");
}

async function sendToValidation() {
  if (!lastExtractData || !currentUser) {
    window.alert("Gere uma fatura antes de enviar para validacao.");
    return;
  }

  setValidationButtonState(true, true);
  try {
    const scope = await getUserScope(currentUser);
    const info = lastExtractData.info_fatura || {};
    const dados = lastExtractData.dados_extraidos || {};
    const totals = lastExtractData.fatura_calculada_v2?.totals || {};
    const dueDate = resolveDueDate(
      info.mes_referencia || dados.month_reference || "",
      info.vencimento || dados.expiration_date || ""
    );

    const payload = {
      status_validacao: "pendente",
      status: "pendente",
      tenantId: scope.tenantId,
      tenant_id: scope.tenantId,
      user_id: scope.uid,
      uid: scope.uid,
      user_email: scope.email || currentUserEmail || "",
      subscriber_name: info.nome || dados.legal_name || "",
      nome_cliente: info.nome || dados.legal_name || "",
      legal_name: dados.legal_name || info.nome || "",
      uc: info.uc || dados.consumer_unit || "",
      consumer_unit: info.uc || dados.consumer_unit || "",
      documento: info.cpf || dados.cpf || dados.cnpj || dados.cpf_cnpj || "",
      cnpj_cpf: info.cpf || dados.cpf || dados.cnpj || dados.cpf_cnpj || "",
      referencia: info.mes_referencia || dados.month_reference || "",
      month_reference: info.mes_referencia || dados.month_reference || "",
      vencimento: dueDate,
      due_date: dueDate,
      expiration_date: dueDate,
      invoice_value: Number(totals.payable || info.valor_total || dados.invoice_value || 0),
      valor_total: Number(totals.payable || info.valor_total || dados.invoice_value || 0),
      data_emissao: dados.data_emissao || new Date().toLocaleDateString("pt-BR"),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      extraction_result: lastExtractData,
      fatura_energypay_html: invoiceRenderHost?.innerHTML || "",
      fatura_equatorial_preview: originalPreviewDataUrl || "",
      fatura_url: "",
      source: "fatura_manual",
    };

    const ref = await addDoc(collection(db, COLL_VALIDACAO), payload);
    localStorage.setItem("gcsolar_last_validacao_id", ref.id);
    debug(`Enviado para validacao: ${ref.id}`);
    window.location.href = "faturas-validacao.html";
  } catch (err) {
    debug(`Erro ao enviar para validacao: ${err?.message || err}`);
    window.alert("Falha ao enviar para validacao.");
    setValidationButtonState(true, false);
  }
}

toggleSidebarBtn?.addEventListener("click", () => {
  if (isMobile()) {
    appShell.classList.toggle("mobile-open");
    return;
  }
  const collapsed = appShell.classList.toggle("sidebar-collapsed");
  localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
});

themeBtn?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(themeKey, next);
});

uploadInput?.addEventListener("change", () => {
  if (!authReady || !currentUser) {
    window.alert("Aguarde o login ser carregado para gerar a fatura.");
    if (uploadInput) uploadInput.value = "";
    return;
  }

  const file = uploadInput.files?.[0];
  resetDebug();

  if (!file) {
    uploadFileName.textContent = "Nenhum arquivo selecionado.";
    invoiceRenderHost.innerHTML = '<p class="preview-empty">Faca upload de uma fatura para visualizar o modelo final.</p>';
    clearOriginalPreview();
    lastExtractData = null;
    originalPreviewDataUrl = "";
    setValidationButtonState(false, false);
    return;
  }

  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  uploadFileName.textContent = `Arquivo selecionado: ${file.name} (${sizeMb} MB)`;
  debug(`Arquivo selecionado: ${file.name}`);
  renderOriginalInvoice(file);

  postInvoiceToV2(file)
    .then(async ({ data, cache, endpoint }) => {
      debug(`Upload concluido (${cache}) em ${endpoint}`);
      await enrichCpfFromSubscriber(data);
      lastExtractData = data;
      renderInvoicePreview(data);
      setValidationButtonState(true, false);
    })
    .catch((error) => {
      debug(`Falha no upload: ${error.message}`);
      invoiceRenderHost.innerHTML = `<p class="preview-empty">Não foi possível gerar a fatura: ${escapeHtml(error.message)}</p>`;
      lastExtractData = null;
      setValidationButtonState(false, false);
    });
});

sendValidationBtn?.addEventListener("click", sendToValidation);

window.addEventListener("resize", applySidebarState);

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  currentUserEmail = user?.email || "";
  authReady = true;
  debug(`Usuario autenticado: ${currentUserEmail || "nao autenticado"}`);
});

const savedTheme = localStorage.getItem(themeKey);
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (systemDark ? "dark" : "light"));
applySidebarState();
setValidationButtonState(false, false);
