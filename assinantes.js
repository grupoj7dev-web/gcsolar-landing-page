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
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
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
const COLL_SUBSCRIBERS = "gcredito_subscribers";
const COLL_PENDING = "assinantes_pendentes";

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

const refreshBtn = document.getElementById("refreshBtn");
const newSubscriberBtn = document.getElementById("newSubscriberBtn");
const cancelFormBtn = document.getElementById("cancelFormBtn");
const listPanel = document.getElementById("listPanel");
const formPanel = document.getElementById("formPanel");
const subscribersUpdatedAt = document.getElementById("subscribersUpdatedAt");
const subscribersTableBody = document.getElementById("subscribersTableBody");
const subscribersCardsGrid = document.getElementById("subscribersCardsGrid");
const subscribersCardsView = document.getElementById("subscribersCardsView");
const subscribersTableView = document.getElementById("subscribersTableView");
const viewCardsBtn = document.getElementById("viewCardsBtn");
const viewTableBtn = document.getElementById("viewTableBtn");
const cardsTotalCount = document.getElementById("cardsTotalCount");
const paginationInfo = document.getElementById("paginationInfo");
const paginationPages = document.getElementById("paginationPages");
const paginationPrev = document.getElementById("paginationPrev");
const paginationNext = document.getElementById("paginationNext");

const statTotal = document.getElementById("statTotal");
const statAtivos = document.getElementById("statAtivos");
const statPendentes = document.getElementById("statPendentes");
const statInativos = document.getElementById("statInativos");
const statTrend = document.getElementById("statTrend");

const searchInput = document.getElementById("searchInput");
const quickFilterButtons = Array.from(document.querySelectorAll("[data-status-filter]"));
const sortSelect = document.getElementById("sortSelect");
const resultsCountText = document.getElementById("resultsCountText");

const formTitle = document.getElementById("formTitle");
const subscriberForm = document.getElementById("subscriberForm");
const saveSubscriberBtn = document.getElementById("saveSubscriberBtn");
const formHolderType = document.getElementById("formHolderType");
const formName = document.getElementById("formName");
const formCpfCnpj = document.getElementById("formCpfCnpj");
const formEmail = document.getElementById("formEmail");
const formPhone = document.getElementById("formPhone");
const formUc = document.getElementById("formUc");
const formPartner = document.getElementById("formPartner");
const formContractedKwh = document.getElementById("formContractedKwh");
const formDiscount = document.getElementById("formDiscount");
const formStatus = document.getElementById("formStatus");
const formConcessionaria = document.getElementById("formConcessionaria");
const formObs = document.getElementById("formObs");
const dossierModal = document.getElementById("dossierModal");
const dossierBody = document.getElementById("dossierBody");
const dossierStatusText = document.getElementById("dossierStatusText");
const dossierCloseBtn = document.getElementById("dossierCloseBtn");
const dossierCancelBtn = document.getElementById("dossierCancelBtn");
const dossierApproveBtn = document.getElementById("dossierApproveBtn");
const dossierRejectBtn = document.getElementById("dossierRejectBtn");

let scope = null;
let allSubscribers = [];
let filteredSubscribers = [];
let editingDocId = null;
let currentPage = 1;
const pageSize = 9;
let activeStatusFilter = "all";
let activeSort = "name_asc";
let dossierItemId = null;

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

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusType(status, raw = null) {
  const s = String(status || "").toLowerCase();
  if (s.includes("rejeit")) return "inactive";
  if (s.includes("cadastro_pendente") || s.includes("aguardando_aprovacao")) return "pending";
  if (s.includes("aguardando_assinatura") || s.includes("contrato_enviado")) return "awaiting_signature";
  if (s.includes("assinado")) return "awaiting_rateio";
  if (s.includes("assinatura") || s.includes("signature")) return "awaiting_signature";
  if (s.includes("rateio") || s.includes("allocation")) return "awaiting_rateio";
  if (s.includes("pend") || s.includes("aguard")) return "pending";
  if (s.includes("inativ") || s.includes("suspend")) return "inactive";

  const stage = String(
    raw?.workflow_stage || raw?.etapa || raw?.pending_reason || raw?.motivo_pendencia || ""
  ).toLowerCase();
  if (stage.includes("assinatura") || stage.includes("signature")) return "awaiting_signature";
  if (stage.includes("rateio") || stage.includes("allocation")) return "awaiting_rateio";

  return "active";
}

function statusLabel(status, raw = null) {
  const s = String(status || "").toLowerCase();
  if (s.includes("rejeit")) return "Rejeitado";
  const t = statusType(status, raw);
  if (t === "awaiting_signature") return "Aguardando assinatura";
  if (t === "awaiting_rateio") return "Aguardando rateio";
  if (t === "pending") return "Aguardando";
  if (t === "inactive") return "Inativo";
  return "Ativo";
}

function isAwaitingItem(item) {
  return item.sourceCollection === COLL_PENDING &&
    ["pending", "awaiting_signature", "awaiting_rateio"].includes(item.statusType);
}

function asText(value) {
  return String(value || "").trim() || "-";
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dossierField(label, value) {
  return `
    <div class="dossier-item">
      <small>${escHtml(label)}</small>
      <strong>${escHtml(asText(value))}</strong>
    </div>
  `;
}

function docLink(label, url) {
  if (!url) return "";
  return `<a class="dossier-doc-link" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-file-arrow-down"></i>${escHtml(label)}</a>`;
}

function firstFilled(...values) {
  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function openDossierModal(item) {
  if (!item || item.sourceCollection !== COLL_PENDING) return;
  const raw = item.raw || {};
  const endereco = raw.endereco || {};
  const docs = raw.documentos || {};
  const docsLegacy = raw.documents || raw.anexos || {};
  const contrato = raw.contrato || {};
  const contratoAssinatura = contrato.assinatura || {};
  const contaEnergiaUrl = firstFilled(docs.contaEnergiaUrl, docsLegacy.contaEnergiaUrl, raw.contaEnergiaUrl);
  const cnhUrl = firstFilled(docs.cnhUrl, docsLegacy.cnhUrl, raw.cnhUrl);
  const contratoSocialUrl = firstFilled(docs.contratoSocialUrl, docsLegacy.contratoSocialUrl, raw.contratoSocialUrl);
  const cnhDonoContaUrl = firstFilled(docs.cnhDonoContaUrl, docsLegacy.cnhDonoContaUrl, raw.cnhDonoContaUrl);
  const contratoPdfUrl = firstFilled(contrato.pdfUrl, raw.contratoPdfUrl);
  const selfieAssinaturaUrl = firstFilled(contratoAssinatura.selfieImagem);
  const assinaturaUrl = firstFilled(contratoAssinatura.assinaturaImagem);
  const renderedDocs = [
    docLink("Conta de energia", contaEnergiaUrl),
    docLink("CNH/RG do responsável", cnhUrl),
    docLink("Contrato social", contratoSocialUrl),
    docLink("Documento do terceiro", cnhDonoContaUrl),
    docLink("Contrato gerado (PDF)", contratoPdfUrl),
    docLink("Selfie da assinatura", selfieAssinaturaUrl),
    docLink("Imagem da assinatura", assinaturaUrl),
  ].filter(Boolean);
  const titularConta = raw.contaEnergiaNoNomeDoContratante === false ? "Conta em nome de terceiro" : "Conta no nome do contratante";

  dossierItemId = item.id;
  dossierStatusText.textContent = `Status: ${statusLabel(item.status, raw)}`;
  dossierBody.innerHTML = `
    <section class="dossier-section">
      <h4>Cadastro</h4>
      <div class="dossier-grid">
        ${dossierField("Tipo de pessoa", raw.tipoPessoa)}
        ${dossierField("Nome", raw.nome || raw.razaoSocial)}
        ${dossierField("Nome fantasia", raw.nomeFantasia)}
        ${dossierField("Representante", raw.nomeRepresentante)}
        ${dossierField("CPF/CNPJ", raw.cpfCnpj)}
        ${dossierField("Nascimento/Fundação", raw.dataNascimento || raw.dataFundacao)}
      </div>
    </section>
    <section class="dossier-section">
      <h4>Contato e Energia</h4>
      <div class="dossier-grid">
        ${dossierField("E-mail", raw.email)}
        ${dossierField("Telefone", raw.telefone)}
        ${dossierField("UC", raw.uc)}
        ${dossierField("Consumo médio", raw.consumoMedio ? `${numberFmt(raw.consumoMedio)} kWh` : "-")}
        ${dossierField("Desconto", raw.desconto ? `${numberFmt(raw.desconto)}%` : "-")}
        ${dossierField("Modalidade", raw.modalidade)}
      </div>
    </section>
    <section class="dossier-section">
      <h4>Endereço e Titularidade</h4>
      <div class="dossier-grid">
        ${dossierField("CEP", endereco.cep)}
        ${dossierField("Cidade/UF", `${asText(endereco.cidade)} / ${asText(endereco.estado)}`)}
        ${dossierField("Logradouro", endereco.logradouro)}
        ${dossierField("Número", endereco.numero)}
        ${dossierField("Complemento", endereco.complemento)}
        ${dossierField("Bairro", endereco.bairro)}
        ${dossierField("Titularidade", titularConta)}
        ${dossierField("Nome do titular na conta", raw.nomeDonoConta)}
        ${dossierField("CPF/CNPJ do titular na conta", raw.cpfCnpjDonoConta)}
        ${dossierField("Nascimento do titular na conta", raw.dataNascimentoDonoConta)}
      </div>
    </section>
    <section class="dossier-section">
      <h4>Documentos enviados</h4>
      <div class="dossier-docs">
        ${renderedDocs.length ? renderedDocs.join("") : '<p class="dossier-empty-docs">Nenhum documento encontrado para este cadastro.</p>'}
      </div>
    </section>
  `;

  dossierModal.classList.remove("hidden");
}

function closeDossierModal() {
  dossierModal.classList.add("hidden");
  dossierBody.innerHTML = "";
  dossierStatusText.textContent = "";
  dossierItemId = null;
}

function buildSubscriberPayloadFromPending(item) {
  const raw = item.raw || {};
  const isCompany = String(raw.tipoPessoa || "").toLowerCase() === "juridica";
  const holderType = isCompany ? "company" : "person";
  const holderName = raw.nome || raw.razaoSocial || raw.nomeFantasia || "";
  const cpfCnpj = raw.cpfCnpj || "";
  const nowIso = new Date().toISOString();

  return {
    user_id: raw.createdBy || raw.user_id || scope.uid,
    tenantId: raw.tenantId || scope.tenantId,
    status: "active",
    concessionaria: raw.concessionaria || "Equatorial",
    subscriber: {
      fullName: isCompany ? "" : holderName,
      companyName: isCompany ? holderName : "",
      cpf: isCompany ? "" : cpfCnpj,
      cnpj: isCompany ? cpfCnpj : "",
      email: raw.email || "",
      phone: raw.telefone || "",
      observations: raw.modalidade || "",
      partnerNumber: "",
      contacts: {},
    },
    energy_account: {
      holderType,
      cpfCnpj,
      holderName,
      uc: raw.uc || "",
      partnerNumber: "",
    },
    plan_details: {
      contractedKwh: Number(raw.consumoMedio || 0),
      discountPercentage: Number(raw.desconto || 0),
    },
    plan_contract: {
      contractedKwh: Number(raw.consumoMedio || 0),
      discountPercentage: Number(raw.desconto || 0),
    },
    created_at: raw.createdAtISO || nowIso,
    updated_at: nowIso,
    pending_source_id: item.id,
  };
}

async function approvePendingSubscriber(item) {
  if (!isAwaitingItem(item)) return;
  const payload = buildSubscriberPayloadFromPending(item);
  await addDoc(collection(db, COLL_SUBSCRIBERS), payload);
  await deleteDoc(doc(db, COLL_PENDING, item.id));
}

async function rejectPendingSubscriber(item) {
  if (!isAwaitingItem(item)) return;
  await updateDoc(doc(db, COLL_PENDING, item.id), {
    status: "rejeitado",
    reviewed_by: scope.uid,
    reviewed_at: new Date().toISOString(),
  });
}

function holderTypeLabel(holderType) {
  return holderType === "company" ? "Pessoa Jurídica" : "Pessoa Física";
}
function applyStatusFilterUI() {
  quickFilterButtons.forEach((btn) => {
    const isActive = btn.dataset.statusFilter === activeStatusFilter;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function formatDate(value) {
  const d = parseDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function normalizeSubscriber(docData, id) {
  const subscriber = docData.subscriber || {};
  const energy = docData.energy_account || docData.energyAccount || {};
  const energyAccounts = [
    ...(Array.isArray(docData.energyAccounts) ? docData.energyAccounts : []),
    ...(Array.isArray(docData.energy_accounts) ? docData.energy_accounts : []),
  ];
  const isCompany = energy.holderType === "company" || !!subscriber.cnpj;
  const cpfCnpj = energy.cpfCnpj || subscriber.cnpj || subscriber.cpf || subscriber.cpfCnpj || "";
  const name =
    subscriber.fullName || subscriber.companyName || energy.holderName || docData.subscriber_name || "";
  const email = subscriber.email || "";
  const uc = firstFilled(
    energy.uc,
    docData.uc,
    docData.UC,
    energyAccounts[0]?.uc,
    docData.energy_account?.uc,
    docData.energyAccount?.uc
  );

  const planDetails = docData.plan_details || docData.planDetails || {};
  const planContract = docData.plan_contract || docData.planContract || {};
  const contractedKwh = Number(
    planDetails.contractedKwh ??
      planContract.contractedKwh ??
      planContract.contracted_kwh ??
      docData.contractedKwh ??
      docData.kwhContratado ??
      docData.kwh_contratado ??
      docData.consumoMedio ??
      0
  );
  const discountPercentage = Number(
    planDetails.discountPercentage ??
      planContract.discountPercentage ??
      planContract.discountPercent ??
      planContract.discount_percent ??
      docData.discountPercent ??
      docData.discountPercentage ??
      docData.discount_percent ??
      docData.desconto ??
      0
  );

  return {
    id,
    sourceCollection: COLL_SUBSCRIBERS,
    raw: docData,
    status: docData.status || "active",
    statusType: statusType(docData.status, docData),
    concessionaria: String(docData.concessionaria || ""),
    holderType: isCompany ? "company" : "person",
    name,
    cpfCnpj,
    email,
    phone: subscriber.phone || "",
    uc,
    partnerNumber: energy.partnerNumber || subscriber.partnerNumber || "",
    contractedKwh: Number.isFinite(contractedKwh) ? contractedKwh : 0,
    discountPercentage: Number.isFinite(discountPercentage) ? discountPercentage : 0,
    observations: subscriber.observations || "",
    createdAt: parseDate(docData.created_at),
  };
}

function normalizePendingSubscriber(docData, id) {
  const isCompany = String(docData.tipoPessoa || "").toLowerCase() === "juridica";
  const endereco = docData.endereco || {};
  const nome = docData.nome || docData.razaoSocial || docData.nomeFantasia || "";
  const cpfCnpj = docData.cpfCnpj || "";

  return {
    id,
    sourceCollection: COLL_PENDING,
    raw: docData,
    status: docData.status || "cadastro_pendente",
    statusType: statusType(docData.status, docData),
    concessionaria: String(docData.concessionaria || "Equatorial"),
    holderType: isCompany ? "company" : "person",
    name: nome,
    cpfCnpj,
    email: docData.email || "",
    phone: docData.telefone || "",
    uc: String(docData.uc || ""),
    partnerNumber: "",
    contractedKwh: Number(docData.consumoMedio || 0),
    discountPercentage: Number(docData.desconto || 0),
    observations: docData.modalidade || "",
    createdAt: parseDate(docData.createdAt || docData.createdAtISO || docData.created_at),
    cidadeEstado: `${endereco.cidade || ""}${endereco.estado ? `/${endereco.estado}` : ""}`,
  };
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

  const funcQ = query(
    collection(db, "gcredito_funcionarios"),
    where("auth_user_id", "==", user.uid),
    limit(1)
  );
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) {
    const d = funcSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    return result;
  }

  return result;
}

function belongsToScope(data, userScope) {
  const userId = String(data.user_id || data.createdBy || "");
  const tenantId = String(data.tenantId || data.tenant_id || "");
  if (tenantId && tenantId === userScope.tenantId) return true;
  if (userId && userId === userScope.uid) return true;
  return false;
}

function setView(view) {
  const cardsActive = view === "cards";
  subscribersCardsView.classList.toggle("hidden", !cardsActive);
  subscribersTableView.classList.toggle("hidden", cardsActive);
  viewCardsBtn.classList.toggle("active", cardsActive);
  viewTableBtn.classList.toggle("active", !cardsActive);
  viewCardsBtn.setAttribute("aria-selected", cardsActive ? "true" : "false");
  viewTableBtn.setAttribute("aria-selected", cardsActive ? "false" : "true");
}

function showForm(show) {
  formPanel.classList.toggle("hidden", !show);
  listPanel.classList.toggle("hidden", show);
}

function clearForm() {
  subscriberForm.reset();
  formStatus.value = "active";
  formHolderType.value = "person";
  editingDocId = null;
  formTitle.textContent = "Novo Assinante";
  saveSubscriberBtn.textContent = "Salvar Assinante";
}

function fillForm(item) {
  editingDocId = item.id;
  formTitle.textContent = "Editar Assinante";
  saveSubscriberBtn.textContent = "Salvar Alterações";
  formHolderType.value = item.holderType;
  formName.value = item.name;
  formCpfCnpj.value = item.cpfCnpj;
  formEmail.value = item.email;
  formPhone.value = item.phone;
  formUc.value = item.uc;
  formPartner.value = item.partnerNumber;
  formContractedKwh.value = item.contractedKwh ?? "";
  formDiscount.value = item.discountPercentage ?? "";
  formStatus.value =
    item.statusType === "awaiting_signature" || item.statusType === "awaiting_rateio"
      ? "pending"
      : item.statusType;
  formConcessionaria.value = item.concessionaria;
  formObs.value = item.observations;
}

function renderStats(list) {
  const total = list.length;
  const ativos = list.filter((x) => x.statusType === "active").length;
  const pend = list.filter((x) =>
    ["pending", "awaiting_signature", "awaiting_rateio"].includes(x.statusType)
  ).length;
  const inat = list.filter((x) => x.statusType === "inactive").length;

  statTotal.textContent = total.toLocaleString("pt-BR");
  statAtivos.textContent = ativos.toLocaleString("pt-BR");
  statPendentes.textContent = pend.toLocaleString("pt-BR");
  statInativos.textContent = inat.toLocaleString("pt-BR");

  const now = new Date();
  const aStart = new Date(now);
  aStart.setDate(now.getDate() - 30);
  const bStart = new Date(now);
  bStart.setDate(now.getDate() - 60);
  const bEnd = new Date(now);
  bEnd.setDate(now.getDate() - 31);

  const current30 = list.filter((x) => x.createdAt && x.createdAt >= aStart).length;
  const prev30 = list.filter((x) => x.createdAt && x.createdAt >= bStart && x.createdAt <= bEnd).length;
  const trend = prev30 > 0 ? ((current30 - prev30) / prev30) * 100 : current30 > 0 ? 100 : 0;
  const sign = trend > 0 ? "+" : "";
  statTrend.textContent = `${sign}${trend.toFixed(0)}% de tendência`;
}

function numberFmt(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function sortSubscribers(list, sortBy) {
  const sorted = [...list];

  sorted.sort((a, b) => {
    if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "", "pt-BR");
    if (sortBy === "newest") return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    if (sortBy === "oldest") return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
    if (sortBy === "discount_desc") return (b.discountPercentage || 0) - (a.discountPercentage || 0);
    if (sortBy === "discount_asc") return (a.discountPercentage || 0) - (b.discountPercentage || 0);
    return (a.name || "").localeCompare(b.name || "", "pt-BR");
  });

  return sorted;
}

function renderTable(list) {
  if (list.length === 0) {
    subscribersTableBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">Nenhum assinante encontrado.</td></tr>';
    return;
  }

  const rows = list.map((item) => {
    const dossierAction = isAwaitingItem(item)
      ? `<button class="actions-item" type="button" data-action="dossier" data-id="${item.id}">Dossiê completo</button>`
      : "";
    const editAction =
      item.sourceCollection === COLL_SUBSCRIBERS
        ? `<button class="actions-item" type="button" data-action="edit" data-id="${item.id}">Editar</button>`
        : "";
    return `
      <tr>
        <td>${item.name || "-"}</td>
        <td>${item.cpfCnpj || "-"}</td>
        <td>${item.email || "-"}</td>
        <td>${item.uc || "-"}</td>
        <td>${numberFmt(item.contractedKwh)} kWh</td>
        <td>${numberFmt(item.discountPercentage)}%</td>
        <td><span class="status-pill ${item.statusType}">${statusLabel(item.status, item.raw)}</span></td>
        <td>
          <div class="actions-wrap">
            <button class="actions-trigger" type="button" data-menu-toggle aria-label="Ações">
              <i class="ph ph-dots-three-vertical"></i>
            </button>
            <div class="actions-menu hidden">
              <button class="actions-item" type="button" data-action="view" data-id="${item.id}">Visualizar</button>
              ${dossierAction}
              ${editAction}
              <button class="actions-item delete" type="button" data-action="delete" data-id="${item.id}">Excluir</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  });

  subscribersTableBody.innerHTML = rows.join("");
}

function renderCards(list) {
  if (cardsTotalCount) cardsTotalCount.textContent = String(filteredSubscribers.length || 0);

  if (list.length === 0) {
    subscribersCardsGrid.innerHTML = '<p class="empty-row">Nenhum assinante encontrado.</p>';
    return;
  }

  const cards = list.map((item) => {
    const avatarIcon = item.holderType === "company" ? "ph-buildings" : "ph-user-circle";
    const dossierButton = isAwaitingItem(item)
      ? `<button class="card-action-btn dossier" type="button" data-action="dossier" data-id="${item.id}">
            <i class="ph ph-folder-open"></i>
            Dossiê completo
          </button>`
      : "";
    const editButton =
      item.sourceCollection === COLL_SUBSCRIBERS
        ? `<button class="card-action-btn edit" type="button" data-action="edit" data-id="${item.id}">
            <i class="ph ph-pencil-simple"></i>
            Editar
          </button>`
        : "";
    return `
      <article class="subscriber-card ${item.statusType}">
        <div class="subscriber-card-top">
          <div class="subscriber-title-wrap">
            <span class="subscriber-avatar-icon"><i class="ph ${avatarIcon}"></i></span>
            <div>
              <p class="subscriber-name">${item.name || "-"}</p>
            </div>
          </div>
          <div class="card-badges">
            <span class="status-pill ${item.statusType}">${statusLabel(item.status, item.raw)}</span>
            <span class="type-pill">${holderTypeLabel(item.holderType)}</span>
          </div>
        </div>

        <div class="subscriber-mini-grid">
          <div class="mini-item document">
            <p class="mini-item-label">CPF/CNPJ</p>
            <p class="mini-item-value">${item.cpfCnpj || "-"}</p>
          </div>
          <div class="mini-item uc">
            <p class="mini-item-label">UC</p>
            <p class="mini-item-value">${item.uc || "-"}</p>
          </div>
          <div class="mini-item consumption">
            <p class="mini-item-label">kWh Contratado</p>
            <p class="mini-item-value">${numberFmt(item.contractedKwh)} kWh/mês</p>
          </div>
          <div class="mini-item discount">
            <p class="mini-item-label">Desconto</p>
            <p class="mini-item-value">${numberFmt(item.discountPercentage)}%</p>
          </div>
        </div>

        <div class="card-created">
          <span><i class="ph ph-calendar-blank"></i> Cadastrado em</span>
          <strong>${formatDate(item.createdAt)}</strong>
        </div>

        <div class="card-contact">
          <p class="card-contact-title">Informações de Contato</p>
          <p><i class="ph ph-phone"></i> ${item.phone || "-"}</p>
          <p><i class="ph ph-envelope-simple"></i> ${item.email || "-"}</p>
          <p><i class="ph ph-map-pin"></i> ${item.concessionaria || "-"}</p>
        </div>

        <div class="card-actions">
          <button class="card-action-btn view" type="button" data-action="view" data-id="${item.id}">
            <i class="ph ph-eye"></i>
            Ver
          </button>
          ${dossierButton}
          ${editButton}
          <button class="card-action-btn delete" type="button" data-action="delete" data-id="${item.id}">
            <i class="ph ph-trash"></i>
            Excluir
          </button>
        </div>
      </article>
    `;
  });

  subscribersCardsGrid.innerHTML = cards.join("");
}

function paginateList(list) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return {
    total,
    totalPages,
    start: total === 0 ? 0 : start + 1,
    end: Math.min(end, total),
    pageItems: list.slice(start, end),
  };
}

function renderPagination(total, start, end, totalPages) {
  paginationInfo.textContent = `Mostrando ${start}-${end} de ${total} assinantes`;
  paginationPrev.disabled = currentPage <= 1;
  paginationNext.disabled = currentPage >= totalPages;

  if (total <= pageSize) {
    paginationPages.innerHTML = "";
    return;
  }

  const pages = [];
  const maxButtons = 5;
  let first = Math.max(1, currentPage - 2);
  let last = Math.min(totalPages, first + maxButtons - 1);
  first = Math.max(1, last - maxButtons + 1);

  for (let page = first; page <= last; page += 1) {
    pages.push(`
      <button
        type="button"
        class="page-number ${page === currentPage ? "active" : ""}"
        data-page="${page}">
        ${page}
      </button>
    `);
  }

  paginationPages.innerHTML = pages.join("");
}

function renderCurrentPage() {
  const { total, totalPages, start, end, pageItems } = paginateList(filteredSubscribers);
  renderCards(pageItems);
  renderTable(pageItems);
  renderPagination(total, start, end, totalPages);
}

function applyFilters() {
  const q = (searchInput.value || "").toLowerCase().trim();
  const filtered = allSubscribers.filter((item) => {
    const haystack = `${item.name} ${item.cpfCnpj} ${item.email} ${item.uc}`.toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const matchesStatus = activeStatusFilter === "all" || item.statusType === activeStatusFilter;
    return matchesSearch && matchesStatus;
  });

  filteredSubscribers = sortSubscribers(filtered, activeSort);

  currentPage = 1;
  renderCurrentPage();
  renderStats(filteredSubscribers);
  if (resultsCountText) {
    const qtd = filteredSubscribers.length;
    resultsCountText.textContent = `${qtd} ${qtd === 1 ? "resultado" : "resultados"}`;
  }
}

async function loadSubscribers() {
  subscribersUpdatedAt.textContent = "Atualizando lista...";
  const [activeSnap, pendingSnap] = await Promise.all([
    getDocs(collection(db, COLL_SUBSCRIBERS)),
    getDocs(collection(db, COLL_PENDING)),
  ]);

  const activeItems = activeSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope))
    .map((d) => normalizeSubscriber(d, d.id));

  const pendingItems = pendingSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope))
    .map((d) => normalizePendingSubscriber(d, d.id));

  allSubscribers = [...activeItems, ...pendingItems].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "pt-BR")
  );

  applyFilters();
  subscribersUpdatedAt.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}`;
}

function buildPayloadFromForm(existingRaw = null) {
  const holderType = formHolderType.value;
  const isCompany = holderType === "company";
  const name = formName.value.trim();
  const cpfCnpj = formCpfCnpj.value.trim();
  const email = formEmail.value.trim();
  const phone = formPhone.value.trim();
  const uc = formUc.value.trim();
  const partnerNumber = formPartner.value.trim();
  const contractedKwh = Number(formContractedKwh.value || 0);
  const discountPercentage = Number(formDiscount.value || 0);
  const status = formStatus.value;
  const concessionaria = formConcessionaria.value.trim();
  const observations = formObs.value.trim();

  const base = existingRaw ? { ...existingRaw } : {};
  const nowIso = new Date().toISOString();

  const subscriber = {
    ...(base.subscriber || {}),
    phone,
    email,
    observations,
    partnerNumber,
    contacts: base.subscriber?.contacts || {},
  };

  if (isCompany) {
    subscriber.cnpj = cpfCnpj;
    subscriber.companyName = name;
    subscriber.fullName = "";
    subscriber.cpf = "";
  } else {
    subscriber.cpf = cpfCnpj;
    subscriber.fullName = name;
    subscriber.companyName = "";
    subscriber.cnpj = "";
  }

  const energyAccount = {
    ...(base.energy_account || {}),
    holderType,
    cpfCnpj,
    holderName: name,
    uc,
    partnerNumber,
  };

  const plan_details = {
    ...(base.plan_details || {}),
    contractedKwh,
    discountPercentage,
  };

  const plan_contract = {
    ...(base.plan_contract || {}),
    contractedKwh,
    discountPercentage,
  };

  return {
    ...base,
    user_id: scope.uid,
    tenantId: scope.tenantId,
    status,
    concessionaria,
    subscriber,
    energy_account: energyAccount,
    plan_details,
    plan_contract,
    updated_at: nowIso,
    created_at: base.created_at || nowIso,
  };
}

async function createSubscriber() {
  await addDoc(collection(db, COLL_SUBSCRIBERS), buildPayloadFromForm(null));
}

async function updateSubscriber(docId) {
  const current = allSubscribers.find((x) => x.id === docId);
  await updateDoc(doc(db, COLL_SUBSCRIBERS, docId), buildPayloadFromForm(current?.raw || null));
}

async function deleteSubscriber(docId, sourceCollection = COLL_SUBSCRIBERS) {
  await deleteDoc(doc(db, sourceCollection, docId));
}

async function handleSubscriberAction(action, item) {
  if (!item) return;

  if (action === "dossier") {
    openDossierModal(item);
    return;
  }

  if (action === "view") {
    alert(
      `Nome: ${item.name}\nCPF/CNPJ: ${item.cpfCnpj}\nEmail: ${item.email || "-"}\nUC: ${item.uc || "-"}\nkWh Contratado: ${
        item.contractedKwh
      }\nDesconto: ${item.discountPercentage}%\nStatus: ${statusLabel(item.status, item.raw)}`
    );
    return;
  }

  if (action === "edit") {
    if (item.sourceCollection !== COLL_SUBSCRIBERS) {
      alert("Edicao disponivel apenas para assinantes ativos. Pendencias devem ser tratadas no fluxo de aprovacao.");
      return;
    }
    window.location.href = `assinante-cadastro.html?id=${encodeURIComponent(item.id)}`;
    return;
  }

  if (action === "delete") {
    const ok = window.confirm(`Deseja excluir o assinante "${item.name}"?`);
    if (!ok) return;
    try {
      await deleteSubscriber(item.id, item.sourceCollection || COLL_SUBSCRIBERS);
      await loadSubscribers();
    } catch (error) {
      console.error("Erro ao excluir assinante:", error);
      alert("Não foi possível excluir o assinante.");
    }
  }
}

dossierCloseBtn?.addEventListener("click", closeDossierModal);
dossierCancelBtn?.addEventListener("click", closeDossierModal);
dossierModal?.addEventListener("click", (event) => {
  if (event.target === dossierModal) closeDossierModal();
});

dossierApproveBtn?.addEventListener("click", async () => {
  if (!dossierItemId) return;
  const item = allSubscribers.find((x) => x.id === dossierItemId);
  if (!item || !isAwaitingItem(item)) return;

  const ok = window.confirm(`Aprovar o assinante "${item.name}" e mover para ativos?`);
  if (!ok) return;

  try {
    dossierApproveBtn.disabled = true;
    dossierRejectBtn.disabled = true;
    await approvePendingSubscriber(item);
    closeDossierModal();
    await loadSubscribers();
  } catch (error) {
    console.error("Erro ao aprovar assinante pendente:", error);
    alert("Não foi possível aprovar o assinante.");
  } finally {
    dossierApproveBtn.disabled = false;
    dossierRejectBtn.disabled = false;
  }
});

dossierRejectBtn?.addEventListener("click", async () => {
  if (!dossierItemId) return;
  const item = allSubscribers.find((x) => x.id === dossierItemId);
  if (!item || !isAwaitingItem(item)) return;

  const ok = window.confirm(`Rejeitar o assinante "${item.name}"?`);
  if (!ok) return;

  try {
    dossierApproveBtn.disabled = true;
    dossierRejectBtn.disabled = true;
    await rejectPendingSubscriber(item);
    closeDossierModal();
    await loadSubscribers();
  } catch (error) {
    console.error("Erro ao rejeitar assinante pendente:", error);
    alert("Não foi possível rejeitar o assinante.");
  } finally {
    dossierApproveBtn.disabled = false;
    dossierRejectBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", async () => {
  await loadSubscribers();
});

newSubscriberBtn.addEventListener("click", () => {
  window.location.href = "assinante-cadastro.html";
});

cancelFormBtn.addEventListener("click", () => {
  showForm(false);
});

searchInput.addEventListener("input", applyFilters);
quickFilterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeStatusFilter = btn.dataset.statusFilter || "all";
    applyStatusFilterUI();
    applyFilters();
  });
});
sortSelect?.addEventListener("change", () => {
  activeSort = sortSelect.value || "name_asc";
  applyFilters();
});
viewCardsBtn.addEventListener("click", () => setView("cards"));
viewTableBtn.addEventListener("click", () => setView("table"));
paginationPrev.addEventListener("click", () => {
  currentPage -= 1;
  renderCurrentPage();
});
paginationNext.addEventListener("click", () => {
  currentPage += 1;
  renderCurrentPage();
});
paginationPages.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-page]");
  if (!btn) return;
  currentPage = Number(btn.dataset.page || "1");
  renderCurrentPage();
});

subscriberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSubscriberBtn.disabled = true;
  saveSubscriberBtn.textContent = "Salvando...";
  try {
    if (editingDocId) await updateSubscriber(editingDocId);
    else await createSubscriber();
    showForm(false);
    clearForm();
    await loadSubscribers();
  } catch (error) {
    console.error("Erro ao salvar assinante:", error);
    alert("Não foi possível salvar o assinante.");
  } finally {
    saveSubscriberBtn.disabled = false;
    saveSubscriberBtn.textContent = editingDocId ? "Salvar Alterações" : "Salvar Assinante";
  }
});

document.addEventListener("click", async (event) => {
  const menuToggle = event.target.closest("[data-menu-toggle]");
  const actionBtn = event.target.closest("button[data-action]");
  const allMenus = document.querySelectorAll(".actions-menu");

  if (menuToggle) {
    const wrap = menuToggle.closest(".actions-wrap");
    const menu = wrap?.querySelector(".actions-menu");
    const willOpen = menu?.classList.contains("hidden");
    allMenus.forEach((m) => m.classList.add("hidden"));
    if (menu && willOpen) menu.classList.remove("hidden");
    return;
  }

  if (actionBtn) {
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    const item = allSubscribers.find((x) => x.id === id);
    allMenus.forEach((m) => m.classList.add("hidden"));
    await handleSubscriberAction(action, item);
    return;
  }

  allMenus.forEach((m) => m.classList.add("hidden"));
});

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
  applySidebarState();
  initTheme();
  applyStatusFilterUI();
  if (sortSelect) sortSelect.value = activeSort;
  setView("cards");
  showForm(false);
  await loadSubscribers();
});

