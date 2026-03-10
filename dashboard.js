import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  getFirestore,
  limit,
  query,
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
const LOCAL_DELETED_EMITIDAS_KEY = "gcsolar_emitidas_deleted_ids";

const appShell = document.getElementById("appShell");
const toggleBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

const periodFilters = document.getElementById("periodFilters");
const cards = {
  totalFaturas: document.getElementById("metricTotalFaturas"),
  totalFaturasMeta: document.getElementById("metricTotalFaturasMeta"),
  valorTotal: document.getElementById("metricValorTotal"),
  valorTotalMeta: document.getElementById("metricValorTotalMeta"),
  assinantes: document.getElementById("metricAssinantes"),
  geradoras: document.getElementById("metricGeradoras"),
  pendentes: document.getElementById("statusPendentes"),
  pendentesMeta: document.getElementById("statusPendentesMeta"),
  processadas: document.getElementById("statusProcessadas"),
  processadasMeta: document.getElementById("statusProcessadasMeta"),
  emitidas: document.getElementById("statusEmitidas"),
  emitidasMeta: document.getElementById("statusEmitidasMeta"),
  pagas: document.getElementById("statusPagas"),
  pagasMeta: document.getElementById("statusPagasMeta"),
  updatedAt: document.getElementById("funnelUpdatedAt"),
};
const recentInvoicesBody = document.getElementById("recentInvoicesBody");

let dashboardLoaded = false;
let selectedPeriod = "month";
let currentScope = null;
let cache = {
  emitidas: [],
  validacao: [],
  invoiceData: [],
  subscribers: [],
  generators: [],
};

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
  const theme = saved || (systemDark ? "dark" : "light");
  applyTheme(theme);
}

function applySidebarState() {
  const collapsed = localStorage.getItem(collapsedKey) === "1";
  if (!isMobile() && collapsed) {
    appShell.classList.add("sidebar-collapsed");
  } else {
    appShell.classList.remove("sidebar-collapsed");
  }
}

toggleBtn.addEventListener("click", () => {
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

document.addEventListener("click", (event) => {
  if (!isMobile()) return;
  const clickedToggle = event.target.closest("#toggleSidebar");
  const clickedSidebar = event.target.closest("#sidebar");
  if (!clickedToggle && !clickedSidebar) {
    appShell.classList.remove("mobile-open");
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

themeBtn?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(themeKey, next);
});

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    if (typeof value._seconds === "number") return new Date(value._seconds * 1000);
  }
  return null;
}

function getDocDate(item) {
  return (
    asDate(item.created_at) ||
    asDate(item.createdAt) ||
    asDate(item.data_emissao) ||
    asDate(item.updated_at) ||
    null
  );
}

function getRange(period) {
  const now = new Date();
  const end = new Date(now);
  let start;

  if (period === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  return { start, end };
}

function inPeriod(item, period) {
  const d = getDocDate(item);
  if (!d) return false;
  const { start, end } = getRange(period);
  return d >= start && d <= end;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function brl(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function int(value) {
  return value.toLocaleString("pt-BR");
}

function pct(value) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatDate(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function cleanText(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function resolveUc(item) {
  return cleanText(item.uc || item.consumer_unit || item.installationId);
}

function resolveDocumento(item) {
  return cleanText(item.documento || item.document || item.cnpj_cpf || item.cpfCnpj);
}

function resolveReferencia(item) {
  return cleanText(item.referencia || item.month_reference || item.mes_referencia);
}

function resolveNome(item) {
  return cleanText(item.subscriber_name || item.nome_cliente || item.legal_name || item.nome);
}

function resolveValor(item) {
  return toNumber(item.invoice_value || item.valor_total || item.valor);
}

function isActiveStatus(statusValue) {
  if (!statusValue) return true;
  const s = String(statusValue).toLowerCase().trim();
  if (!s) return true;
  if (s.includes("inativ")) return false;
  return s.includes("ativ") || s.includes("active") || s === "ok";
}

async function loadCollection(name) {
  let snap;
  try {
    snap = await getDocsFromServer(collection(db, name));
  } catch (_) {
    snap = await getDocs(collection(db, name));
  }
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

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

async function getUserScope(user) {
  const scope = { uid: user.uid, tenantId: user.uid };
  try {
    const adminQ = query(
      collection(db, "gcredito_admins"),
      where("uid", "==", user.uid),
      limit(1)
    );
    const adminSnap = await getDocs(adminQ);
    if (!adminSnap.empty) {
      const d = adminSnap.docs[0].data();
      scope.tenantId = d.tenantId || scope.tenantId;
      return scope;
    }

    const funcQ = query(
      collection(db, "gcredito_funcionarios"),
      where("uid", "==", user.uid),
      limit(1)
    );
    const funcSnap = await getDocs(funcQ);
    if (!funcSnap.empty) {
      const d = funcSnap.docs[0].data();
      scope.tenantId = d.tenantId || scope.tenantId;
      return scope;
    }

    const funcAuthQ = query(
      collection(db, "gcredito_funcionarios"),
      where("auth_user_id", "==", user.uid),
      limit(1)
    );
    const funcAuthSnap = await getDocs(funcAuthQ);
    if (!funcAuthSnap.empty) {
      const d = funcAuthSnap.docs[0].data();
      scope.tenantId = d.tenantId || scope.tenantId;
      return scope;
    }
  } catch (error) {
    console.warn("Não foi possível resolver tenantId do usuário:", error);
  }
  return scope;
}

function belongsToScope(item, scope) {
  const itemUser = String(item.user_id || item.uid || "");
  const itemTenant = String(item.tenantId || item.tenant_id || "");
  if (itemTenant && scope.tenantId && itemTenant === scope.tenantId) return true;
  if (itemUser && itemUser === scope.uid) return true;
  return false;
}

function renderByPeriod(period) {
  const emitidasPeriodo = cache.emitidas.filter((x) => inPeriod(x, period));
  const validacaoPeriodo = cache.validacao.filter((x) => inPeriod(x, period));
  const processadasPeriodo = cache.invoiceData.filter(
    (x) => inPeriod(x, period) && toNumber(x.invoice_value) > 0
  );

  const totalFaturas = emitidasPeriodo.length;
  const valorTotal = emitidasPeriodo.reduce(
    (sum, x) => sum + toNumber(x.invoice_value || x.valor_total),
    0
  );

  const assinantesAtivos = cache.subscribers.filter((x) => isActiveStatus(x.status)).length;
  const geradorasAtivas = cache.generators.filter((x) => isActiveStatus(x.status)).length;

  const pendentes = validacaoPeriodo.filter((item) => {
    const status = String(item.status_validacao || item.status || "").toLowerCase().trim();
    if (status.includes("aprov")) return false;
    if (status.includes("rejeit")) return false;
    return true;
  }).length;
  const processadas = processadasPeriodo.length;
  const emitidas = emitidasPeriodo.length;
  const pagas = emitidasPeriodo.filter(
    (x) => String(x.status_pagamento || "").toLowerCase() === "pago"
  ).length;

  const totalFunil = pendentes + processadas + emitidas + pagas;
  const pendentesPct = totalFunil > 0 ? (pendentes / totalFunil) * 100 : 0;
  const conversao = emitidas > 0 ? (pagas / emitidas) * 100 : 0;

  cards.totalFaturas.textContent = int(totalFaturas);
  cards.totalFaturasMeta.textContent = `Faturas emitidas no período (${labelPeriod(period)})`;
  cards.valorTotal.textContent = brl(valorTotal);
  cards.valorTotalMeta.textContent = `Montante emitido no período (${labelPeriod(period)})`;
  cards.assinantes.textContent = int(assinantesAtivos);
  cards.geradoras.textContent = int(geradorasAtivas);

  cards.pendentes.textContent = int(pendentes);
  cards.pendentesMeta.textContent = `${pct(pendentesPct)} do total do funil`;
  cards.processadas.textContent = int(processadas);
  cards.processadasMeta.textContent = "Leituras processadas no período";
  cards.emitidas.textContent = int(emitidas);
  cards.emitidasMeta.textContent = "Faturas oficialmente emitidas";
  cards.pagas.textContent = int(pagas);
  cards.pagasMeta.textContent = `Taxa de conversão/pagamento: ${pct(conversao)}`;

  cards.updatedAt.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}`;
  renderRecentInvoices(emitidasPeriodo);
}

function labelPeriod(period) {
  if (period === "week") return "Semana";
  if (period === "year") return "Ano";
  return "Mês";
}

function setLoadingState() {
  cards.updatedAt.textContent = "Atualizando dados...";
  cards.totalFaturas.textContent = "-";
  cards.valorTotal.textContent = "-";
  cards.assinantes.textContent = "-";
  cards.geradoras.textContent = "-";
  cards.pendentes.textContent = "-";
  cards.processadas.textContent = "-";
  cards.emitidas.textContent = "-";
  cards.pagas.textContent = "-";
  recentInvoicesBody.innerHTML =
    '<tr><td colspan="8" class="empty-row">Carregando faturas...</td></tr>';
}

function statusInfo(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pago") return { label: "Pago", cls: "pago" };
  if (s === "pendente") return { label: "Pendente", cls: "pendente" };
  return { label: status ? String(status) : "Não informado", cls: "default" };
}

function renderRecentInvoices(emitidasPeriodo) {
  const ordered = [...emitidasPeriodo].sort((a, b) => {
    const ad = getDocDate(a)?.getTime() || 0;
    const bd = getDocDate(b)?.getTime() || 0;
    return bd - ad;
  });

  if (ordered.length === 0) {
    recentInvoicesBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">Sem faturas recentes no período selecionado.</td></tr>';
    return;
  }

  const rows = ordered.slice(0, 12).map((item) => {
    const uc = resolveUc(item);
    const nome = resolveNome(item);
    const documento = resolveDocumento(item);
    const referencia = resolveReferencia(item);
    const valor = brl(resolveValor(item));
    const emissao = formatDate(item.data_emissao || item.created_at || item.createdAt);
    const status = statusInfo(item.status_pagamento);
    const viewUrl = item.fatura_url || "#";
    const downloadAttr = viewUrl && viewUrl !== "#" ? "download" : "";

    return `
      <tr>
        <td>${uc}</td>
        <td>${nome}</td>
        <td>${documento}</td>
        <td>${referencia}</td>
        <td>${valor}</td>
        <td>${emissao}</td>
        <td><span class="status-badge ${status.cls}">${status.label}</span></td>
        <td class="actions-cell">
          <button class="actions-btn" type="button" data-action-toggle aria-label="Ações">...</button>
          <div class="actions-menu hidden">
            <a href="${viewUrl}" target="_blank" rel="noopener noreferrer">Visualizar</a>
            <a href="${viewUrl}" ${downloadAttr}>Baixar</a>
            <button type="button" data-action="delete-invoice" data-id="${item.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  });

  recentInvoicesBody.innerHTML = rows.join("");
}

function findEmitidaById(id) {
  return cache.emitidas.find((x) => String(x.id) === String(id)) || null;
}

async function deleteInvoiceCascade(record) {
  const ok = window.confirm("Excluir esta fatura em cascata (emitidas, validacao e invoice_data)?");
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
  const targetTenant = String(record.tenantId || record.tenant_id || currentScope?.tenantId || "");

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
    COLL_EMITIDAS,
    COLL_VALIDACAO,
    COLL_INVOICE_DATA,
    COLL_INVOICE_DATA_ALT,
  ];

  for (const collectionName of cascadeCollections) {
    const snap = await getDocs(collection(db, collectionName));
    const matches = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(shouldDeleteByIdentity);
    for (const item of matches) {
      try {
        await deleteDoc(doc(db, collectionName, item.id));
      } catch (err) {
        console.warn(`[DASHBOARD][DELETE] Falha ao remover ${collectionName}/${item.id}`, err);
      }
    }
  }

  await loadDashboardData(auth.currentUser);
}

async function loadDashboardData(user) {
  setLoadingState();
  try {
    const scope = await getUserScope(user);
    currentScope = scope;

    const [emitidas, validacao, invoiceData, subscribers, generators] = await Promise.all([
      loadCollection("gcredito_faturas_emitidas"),
      loadCollection("gcredito_faturas_validacao"),
      loadCollection("invoice_data"),
      loadCollection("gcredito_subscribers"),
      loadCollection("gcredito_generators"),
    ]);

    const scopedSubscribers = subscribers.filter((x) => belongsToScope(x, scope));
    const scopedGenerators = generators.filter((x) => belongsToScope(x, scope));
    const subscriberIds = new Set(
      scopedSubscribers.flatMap((x) => [x.id, x.subscriber_id]).filter(Boolean).map(String)
    );

    const scopedInvoiceData = invoiceData.filter(
      (x) => belongsToScope(x, scope) || subscriberIds.has(String(x.subscriber_id || ""))
    );
    const deletedEmitidasIds = getLocallyDeletedEmitidasIds();
    const scopedEmitidas = emitidas.filter(
      (x) => belongsToScope(x, scope) || subscriberIds.has(String(x.subscriber_id || ""))
    ).filter((x) => !deletedEmitidasIds.has(String(x.id)));
    const scopedValidacao = validacao.filter(
      (x) => belongsToScope(x, scope) || subscriberIds.has(String(x.subscriber_id || ""))
    );

    cache = {
      emitidas: scopedEmitidas,
      validacao: scopedValidacao,
      invoiceData: scopedInvoiceData,
      subscribers: scopedSubscribers,
      generators: scopedGenerators,
    };
    renderByPeriod(selectedPeriod);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
    cards.updatedAt.textContent = "Falha ao carregar dados do dashboard.";
  }
}

periodFilters.addEventListener("click", (event) => {
  const btn = event.target.closest(".period-btn");
  if (!btn) return;
  selectedPeriod = btn.dataset.period;
  document.querySelectorAll(".period-btn").forEach((el) => {
    el.classList.toggle("active", el === btn);
  });
  renderByPeriod(selectedPeriod);
});

document.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-action='delete-invoice'][data-id]");
  if (deleteBtn) {
    event.preventDefault();
    const id = deleteBtn.dataset.id;
    const record = findEmitidaById(id);
    if (record) {
      deleteInvoiceCascade(record).catch((error) => {
        console.error(error);
        window.alert("Falha ao excluir fatura no dashboard.");
      });
    }
    return;
  }

  const toggle = event.target.closest("[data-action-toggle]");
  const allMenus = document.querySelectorAll(".actions-menu");

  if (!toggle) {
    allMenus.forEach((menu) => menu.classList.add("hidden"));
    return;
  }

  const cell = toggle.closest(".actions-cell");
  const menu = cell?.querySelector(".actions-menu");
  if (!menu) return;

  const willOpen = menu.classList.contains("hidden");
  allMenus.forEach((m) => m.classList.add("hidden"));
  if (willOpen) menu.classList.remove("hidden");
});

onAuthStateChanged(auth, async (user) => {
  try {
    console.log("[GC-AUTH]", {
      ts: new Date().toISOString(),
      module: "dashboard",
      event: "auth-state",
      userPresent: !!user,
      uid: user?.uid || null,
    });
  } catch (_) { }
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  await getIdTokenResult(user, true);

  applySidebarState();
  initTheme();

  if (!dashboardLoaded) {
    dashboardLoaded = true;
    await loadDashboardData(user);
  }
});
