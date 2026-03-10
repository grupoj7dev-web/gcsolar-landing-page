import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

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
const storage = getStorage(app);

const COLL_PENDING = "assinantes_pendentes";
const COLL_COLLABORATORS = "gcredito_funcionarios";
const COLL_SUBSCRIBERS = "gcredito_subscribers";

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");

const updatedText = document.getElementById("updatedText");
const statusMsg = document.getElementById("statusMsg");
const listSection = document.getElementById("listSection");
const wizardCard = document.getElementById("wizardCard");
const indicacoesTableBody = document.getElementById("indicacoesTableBody");
const vendedorHead = document.getElementById("vendedorHead");
const novaIndicacaoTopBtn = document.getElementById("novaIndicacaoTopBtn");
const voltarListaTopBtn = document.getElementById("voltarListaTopBtn");
const voltarListaBtn = document.getElementById("voltarListaBtn");
const indicacaoModal = document.getElementById("indicacaoModal");
const indicacaoModalBody = document.getElementById("indicacaoModalBody");
const indicacaoModalStatus = document.getElementById("indicacaoModalStatus");
const indicacaoModalCloseBtn = document.getElementById("indicacaoModalCloseBtn");
const indicacaoModalCancelBtn = document.getElementById("indicacaoModalCancelBtn");
const indicacaoRateioBtn = document.getElementById("indicacaoRateioBtn");
const indicacaoApproveBtn = document.getElementById("indicacaoApproveBtn");
const indicacaoRejectBtn = document.getElementById("indicacaoRejectBtn");

const step1Panel = document.getElementById("step1");
const step2Panel = document.getElementById("step2");
const successPanel = document.getElementById("successPanel");
const stepChip1 = document.getElementById("stepChip1");
const stepChip2 = document.getElementById("stepChip2");
const stepChip3 = document.getElementById("stepChip3");

const form = document.getElementById("indicacaoForm");
const summaryBar = document.getElementById("summaryBar");

const tipoPessoaInput = document.getElementById("tipoPessoa");
const typeButtons = Array.from(document.querySelectorAll(".type-card"));
const pfFields = document.getElementById("pfFields");
const pjFields = document.getElementById("pjFields");

const nomeCompletoInput = document.getElementById("nomeCompleto");
const cpfInput = document.getElementById("cpf");
const dataNascimentoInput = document.getElementById("dataNascimento");

const razaoSocialInput = document.getElementById("razaoSocial");
const nomeFantasiaInput = document.getElementById("nomeFantasia");
const cnpjInput = document.getElementById("cnpj");
const nomeRepresentanteInput = document.getElementById("nomeRepresentante");
const dataFundacaoInput = document.getElementById("dataFundacao");

const emailInput = document.getElementById("email");
const telefoneInput = document.getElementById("telefone");
const ucInput = document.getElementById("uc");
const consumoMedioInput = document.getElementById("consumoMedio");
const descontoInput = document.getElementById("desconto");
const isencaoImpostosInput = document.getElementById("isencaoImpostos");
const isencaoFioBInput = document.getElementById("isencaoFioB");

const cepInput = document.getElementById("cep");
const buscarCepBtn = document.getElementById("buscarCepBtn");
const logradouroInput = document.getElementById("logradouro");
const numeroInput = document.getElementById("numero");
const complementoInput = document.getElementById("complemento");
const bairroInput = document.getElementById("bairro");
const cidadeInput = document.getElementById("cidade");
const estadoInput = document.getElementById("estado");

const contaNoNomeInputs = Array.from(document.querySelectorAll('input[name="contaNoNome"]'));
const terceiroFields = document.getElementById("terceiroFields");
const nomeDonoContaInput = document.getElementById("nomeDonoConta");
const cpfCnpjDonoContaInput = document.getElementById("cpfCnpjDonoConta");
const dataNascimentoDonoContaInput = document.getElementById("dataNascimentoDonoConta");

const modalidadeInputs = Array.from(document.querySelectorAll('input[name="modalidade"]'));

const continuarBtn = document.getElementById("continuarBtn");
const voltarBtn = document.getElementById("voltarBtn");
const salvarBtn = document.getElementById("salvarBtn");
const novaIndicacaoBtn = document.getElementById("novaIndicacaoBtn");

const contratoSocialCard = document.getElementById("contratoSocialCard");
const docTerceiroCard = document.getElementById("docTerceiroCard");

const docContaEnergiaInput = document.getElementById("docContaEnergia");
const docIdentificacaoInput = document.getElementById("docIdentificacao");
const docContratoSocialInput = document.getElementById("docContratoSocial");
const docTerceiroInput = document.getElementById("docTerceiro");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let pdfjsLibPromise = null;
let tesseractPromise = null;
let indicacoesCache = [];
let editingIndicacaoId = "";
let editingIndicacaoData = null;
let partnerFingerprints = {
  docs: new Set(),
  emails: new Set(),
  phones: new Set(),
};
let sellerByUid = new Map();
let activeIndicacaoModalId = "";

const FLOW_META = {
  aguardando_aprovacao: {
    label: "Aguardando aprovação",
    pillClass: "pending",
    badgeClass: "pending",
    step: 1,
    helper: "Pré-cadastro recebido e aguardando revisão interna.",
  },
  pendente_rateio: {
    label: "Pendente para rateio",
    pillClass: "rateio",
    badgeClass: "rateio",
    step: 2,
    helper: "Cadastro aprovado. Próximo passo: criar o rateio da UC.",
  },
  rejeitado: {
    label: "Rejeitado",
    pillClass: "rejected",
    badgeClass: "rejected",
    step: 0,
    helper: "Cadastro encerrado sem avanço no fluxo.",
  },
  ativo: {
    label: "Virou assinante",
    pillClass: "done",
    badgeClass: "approved",
    step: 3,
    helper: "Fluxo concluído e cadastro já migrado para assinantes.",
  },
};

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function setStatus(message, type = "info") {
  statusMsg.textContent = message || "";
  if (type === "error") statusMsg.style.color = "#b91c1c";
  else if (type === "success") statusMsg.style.color = "#166534";
  else statusMsg.style.color = "";
}

function setUpdated(extra = "") {
  const suffix = extra ? ` (${extra})` : "";
  updatedText.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}${suffix}`;
}

function updateSaveButtonLabel() {
  if (!salvarBtn) return;
  if (editingIndicacaoId) salvarBtn.textContent = "Salvar alterações";
  else salvarBtn.textContent = "Salvar como aguardando aprovacao";
}

function existingDocUrl(key) {
  return String(editingIndicacaoData?.documentos?.[key] || "");
}

function showListMode() {
  listSection?.classList.remove("hidden");
  wizardCard?.classList.add("hidden");
}

function showCadastroMode() {
  listSection?.classList.add("hidden");
  wizardCard?.classList.remove("hidden");
}

function getContaNoNome() {
  return contaNoNomeInputs.find((item) => item.checked)?.value || "sim";
}

function getModalidade() {
  return modalidadeInputs.find((item) => item.checked)?.value || "nao_mudar_titularidade";
}

function updateTypeUI() {
  const tipo = tipoPessoaInput.value;
  const isPf = tipo === "fisica";

  pfFields.classList.toggle("hidden", !isPf);
  pjFields.classList.toggle("hidden", isPf);

  typeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.personType === tipo);
  });

  if (isPf) {
    nomeCompletoInput.required = true;
    cpfInput.required = true;
    dataNascimentoInput.required = true;

    razaoSocialInput.required = false;
    cnpjInput.required = false;
    nomeRepresentanteInput.required = false;
    dataFundacaoInput.required = false;
  } else {
    nomeCompletoInput.required = false;
    cpfInput.required = false;
    dataNascimentoInput.required = false;

    razaoSocialInput.required = true;
    cnpjInput.required = true;
    nomeRepresentanteInput.required = true;
    dataFundacaoInput.required = true;
  }

  updateUploadRules();
}

function updateTitularidadeUI() {
  const isTerceiro = getContaNoNome() === "nao";
  terceiroFields.classList.toggle("hidden", !isTerceiro);

  nomeDonoContaInput.required = isTerceiro;
  cpfCnpjDonoContaInput.required = isTerceiro;
  dataNascimentoDonoContaInput.required = isTerceiro;

  updateUploadRules();
}

function updateUploadRules() {
  const isPj = tipoPessoaInput.value === "juridica";
  const isTerceiro = getContaNoNome() === "nao";

  contratoSocialCard.classList.toggle("hidden", !isPj);
  docContratoSocialInput.required = isPj;

  docTerceiroCard.classList.toggle("hidden", !isTerceiro);
  docTerceiroInput.required = isTerceiro;
}

function setStep(step) {
  step1Panel.classList.toggle("hidden", step !== 1);
  step2Panel.classList.toggle("hidden", step !== 2);
  successPanel.classList.toggle("hidden", step !== 3);

  stepChip1.classList.toggle("active", step >= 1);
  stepChip2.classList.toggle("active", step >= 2);
  stepChip3.classList.toggle("active", step >= 3);
}

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

function formatDate(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function normalizeIndicacaoStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "aguardando_aprovacao";
  if (raw.includes("rejeit")) return "rejeitado";
  if (raw.includes("aguardando_aprov") || raw.includes("aprovacao")) return "aguardando_aprovacao";
  if (raw.includes("pendente_rateio") || raw.includes("rateio")) return "pendente_rateio";
  if (raw.includes("assinado")) return "pendente_rateio";
  if (raw.includes("contrato_enviado")) return "pendente_rateio";
  if (raw.includes("assin")) return "pendente_rateio";
  if (raw.includes("aprov")) return "pendente_rateio";
  if (raw.includes("ativo")) return "ativo";
  return "aguardando_aprovacao";
}

function getIndicacaoFlowMeta(item) {
  const key = normalizeIndicacaoStatus(item?.status || item?.statusLabel);
  return { key, ...FLOW_META[key] };
}

function statusPill(item) {
  const meta = getIndicacaoFlowMeta(item);
  return `<span class="status-pill ${meta.pillClass}">${escapeHtml(meta.label)}</span>`;
}

function statusLabel(item) {
  return getIndicacaoFlowMeta(item).label;
}

function canReviewIndicacao(item) {
  return normalizeIndicacaoStatus(item?.status || item?.statusLabel) === "aguardando_aprovacao";
}

function buildFlowTimeline(item) {
  const meta = getIndicacaoFlowMeta(item);
  const steps = [
    { number: 1, title: "Triagem", desc: "Aprovar ou reprovar o pré-assinante." },
    { number: 2, title: "Rateio", desc: "Após aprovação, preparar o rateio da unidade." },
    { number: 3, title: "Assinante", desc: "Concluir a migração para a base ativa." },
  ];

  return `
    <section class="flow-strip">
      ${steps.map((step) => {
        const stateClass = meta.step === 0
          ? "blocked"
          : step.number < meta.step
            ? "done"
            : step.number === meta.step
              ? "current"
              : "todo";
        return `
          <article class="flow-step ${stateClass}">
            <span class="flow-step-number">${step.number}</span>
            <div class="flow-step-copy">
              <strong>${escapeHtml(step.title)}</strong>
              <small>${escapeHtml(step.desc)}</small>
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function getTableColspan() {
  return scope?.isSuperAdmin ? 7 : 6;
}

function resolveSellerName(item) {
  const uid = String(item.createdBy || item.user_id || item.created_by || "");
  const mapped = uid ? sellerByUid.get(uid) : "";
  return cleanText(mapped || item.nomeAdmin || item.createdByName || item.createdByEmail || uid || "-");
}

async function normalizeWesleyIndicacoes(docsList) {
  const updates = docsList
    .filter((item) => resolveSellerName(item).toLowerCase() === "wesley")
    .filter((item) => normalizeIndicacaoStatus(item.status || item.statusLabel) !== "aguardando_aprovacao")
    .map(async (item) => {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, COLL_PENDING, item.id), {
        status: "aguardando_aprovacao",
        statusLabel: "Aguardando aprovação",
        updatedAt: serverTimestamp(),
        updatedAtISO: nowIso,
      });
      return {
        ...item,
        status: "aguardando_aprovacao",
        statusLabel: "Aguardando aprovação",
        updatedAtISO: nowIso,
      };
    });

  if (!updates.length) return docsList;

  const updatedItems = await Promise.all(updates);
  const updatedById = new Map(updatedItems.map((item) => [String(item.id), item]));
  return docsList.map((item) => updatedById.get(String(item.id)) || item);
}

function renderIndicacoesList() {
  if (vendedorHead) vendedorHead.classList.toggle("hidden", !scope?.isSuperAdmin);
  if (!indicacoesTableBody) return;
  if (!indicacoesCache.length) {
    indicacoesTableBody.innerHTML =
      `<tr><td colspan="${getTableColspan()}" class="empty-row">Nenhuma indicação encontrada.</td></tr>`;
    return;
  }

  indicacoesTableBody.innerHTML = indicacoesCache
    .map((item) => {
      const nome = cleanText(item.nome || item.razaoSocial || item.nomeFantasia || "-");
      const doc = onlyDigits(item.cpfCnpj || item.cpf || item.cnpj || "-");
      const uc = onlyDigits(item.uc || "-");
      const vendedor = resolveSellerName(item);
      const created = formatDate(item.createdAt || item.createdAtISO || item.created_at);
      return `
      <tr class="indicacao-row">
        <td>
          <div class="cell-primary">
            <strong>${escapeHtml(nome || "-")}</strong>
          </div>
        </td>
        <td>
          <span class="cell-code">${escapeHtml(doc || "-")}</span>
        </td>
        <td>
          <span class="cell-code">${escapeHtml(uc || "-")}</span>
        </td>
        ${scope?.isSuperAdmin ? `<td><span class="cell-muted">${escapeHtml(vendedor || "-")}</span></td>` : ""}
        <td>${statusPill(item)}</td>
        <td>
          <span class="cell-date">${escapeHtml(created)}</span>
        </td>
        <td class="actions-cell">
          <div class="list-actions">
            <button type="button" class="btn-secondary action-btn action-btn-view" data-view-id="${escapeHtml(item.id)}">
              <i class="ph ph-eye"></i>
              Ver detalhes
            </button>
            <button type="button" class="btn-secondary action-btn action-btn-edit" data-edit-id="${escapeHtml(item.id)}">
              <i class="ph ph-pencil-simple"></i>
              Editar
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function resetToNewIndicacaoForm(message) {
  editingIndicacaoId = "";
  editingIndicacaoData = null;
  form.reset();
  tipoPessoaInput.value = "fisica";
  updateTypeUI();
  updateTitularidadeUI();
  updateSummary();
  setStep(1);
  showCadastroMode();
  updateSaveButtonLabel();
  setStatus(message);
}

function populateFormForEdit(item) {
  if (!item) return;
  editingIndicacaoId = String(item.id || "");
  editingIndicacaoData = item;

  const tipoPessoa = item.tipoPessoa === "juridica" ? "juridica" : "fisica";
  tipoPessoaInput.value = tipoPessoa;
  updateTypeUI();

  nomeCompletoInput.value = item.nome || "";
  cpfInput.value = item.cpf || item.cpfCnpj || "";
  dataNascimentoInput.value = item.dataNascimento || "";

  razaoSocialInput.value = item.razaoSocial || "";
  nomeFantasiaInput.value = item.nomeFantasia || "";
  cnpjInput.value = item.cnpj || item.cpfCnpj || "";
  nomeRepresentanteInput.value = item.nomeRepresentante || "";
  dataFundacaoInput.value = item.dataFundacao || "";

  emailInput.value = item.email || "";
  telefoneInput.value = item.telefone || "";
  ucInput.value = item.uc || "";
  consumoMedioInput.value = String(item.consumoMedio ?? "");
  descontoInput.value = String(item.desconto ?? "");
  isencaoImpostosInput.checked = Boolean(item.isencaoImpostos);
  isencaoFioBInput.checked = Boolean(item.isencaoFioB);

  cepInput.value = item.endereco?.cep || "";
  logradouroInput.value = item.endereco?.logradouro || "";
  numeroInput.value = item.endereco?.numero || "";
  complementoInput.value = item.endereco?.complemento || "";
  bairroInput.value = item.endereco?.bairro || "";
  cidadeInput.value = item.endereco?.cidade || "";
  estadoInput.value = item.endereco?.estado || "";

  const contaNoNomeValue = item.contaEnergiaNoNomeDoContratante ? "sim" : "nao";
  contaNoNomeInputs.forEach((input) => {
    input.checked = input.value === contaNoNomeValue;
  });
  updateTitularidadeUI();

  nomeDonoContaInput.value = item.nomeDonoConta || "";
  cpfCnpjDonoContaInput.value = item.cpfCnpjDonoConta || "";
  dataNascimentoDonoContaInput.value = item.dataNascimentoDonoConta || "";

  const modalidadeValue = item.modalidade === "mudar_titularidade"
    ? "mudar_titularidade"
    : "nao_mudar_titularidade";
  modalidadeInputs.forEach((input) => {
    input.checked = input.value === modalidadeValue;
  });

  docContaEnergiaInput.value = "";
  docIdentificacaoInput.value = "";
  docContratoSocialInput.value = "";
  docTerceiroInput.value = "";

  updateSummary();
  updateUploadRules();
  setStep(1);
  showCadastroMode();
  updateSaveButtonLabel();
  setStatus("Modo edição: ajuste os dados e reenvie documentos se necessário.");
  setUpdated("edicao");
}

function buildDocLink(label, url, description = "") {
  if (!url) return "";
  return `
    <a class="dossier-doc-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
      <span class="dossier-doc-icon"><i class="ph ph-file-arrow-down"></i></span>
      <span class="dossier-doc-meta">
        <small>${escapeHtml(description || "Documento disponível")}</small>
        <strong>${escapeHtml(label)}</strong>
      </span>
      <i class="ph ph-arrow-up-right dossier-doc-open"></i>
    </a>
  `;
}

function buildDetailField(label, value, wide = false) {
  return `<div class="dossier-item ${wide ? "wide" : ""}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function prettyTipoPessoa(value) {
  return String(value || "").toLowerCase() === "juridica" ? "Pessoa Jurídica" : "Pessoa Física";
}

function prettyModalidade(value) {
  return String(value || "") === "mudar_titularidade"
    ? "Mudar titularidade (autoconsumo remoto)"
    : "Não mudar titularidade (geração compartilhada)";
}

function buildIndicacaoDetails(item) {
  if (!item) return "";
  const endereco = item?.endereco || {};
  const docs = item?.documentos || {};
  const nomePrincipal = item.nome || item.razaoSocial || item.nomeFantasia || "-";
  const flowMeta = getIndicacaoFlowMeta(item);
  const tipoPessoa = prettyTipoPessoa(item.tipoPessoa);
  const vendedor = resolveSellerName(item);
  const criadoEm = formatDate(item.createdAt || item.createdAtISO || item.created_at);
  const consumo = item.consumoMedio ? `${item.consumoMedio} kWh` : "-";
  const desconto = item.desconto ? `${item.desconto}%` : "-";
  const titularidade = item.contaEnergiaNoNomeDoContratante
    ? "Conta no nome do contratante"
    : "Conta em nome de terceiro";
  const docLinks = [
    buildDocLink("Conta de energia", docs.contaEnergiaUrl, "Fatura da unidade consumidora"),
    buildDocLink("Documento principal", docs.cnhUrl, "CNH ou RG do titular"),
    buildDocLink("Contrato social", docs.contratoSocialUrl, "Documento societário da empresa"),
    buildDocLink("Documento do terceiro", docs.cnhDonoContaUrl, "CNH ou RG do titular da conta"),
  ].filter(Boolean);

  return `
    <section class="dossier-hero">
      <div class="dossier-hero-main">
        <span class="dossier-kicker">Pré-assinante em análise</span>
        <h4>${escapeHtml(nomePrincipal)}</h4>
        <p>${escapeHtml(tipoPessoa)} • Documento ${escapeHtml(item.cpfCnpj || "-")} • UC ${escapeHtml(item.uc || "-")}</p>
      </div>
      <div class="dossier-hero-side">
        <span class="dossier-status-badge ${flowMeta.badgeClass}">${escapeHtml(flowMeta.label)}</span>
        <div class="dossier-hero-meta">
          <span><i class="ph ph-calendar-blank"></i>${escapeHtml(criadoEm)}</span>
          <span><i class="ph ph-user-circle"></i>${escapeHtml(vendedor || "-")}</span>
        </div>
      </div>
    </section>
    ${buildFlowTimeline(item)}
    <section class="dossier-summary-grid">
      <article class="dossier-summary-card">
        <small>Contato principal</small>
        <strong>${escapeHtml(item.email || "-")}</strong>
        <span>${escapeHtml(item.telefone || "-")}</span>
      </article>
      <article class="dossier-summary-card">
        <small>Consumo e desconto</small>
        <strong>${escapeHtml(consumo)}</strong>
        <span>${escapeHtml(desconto)} de desconto contratado</span>
      </article>
      <article class="dossier-summary-card">
        <small>Modalidade</small>
        <strong>${escapeHtml(prettyModalidade(item.modalidade))}</strong>
        <span>${escapeHtml(titularidade)}</span>
      </article>
      <article class="dossier-summary-card">
        <small>Etapa atual</small>
        <strong>${escapeHtml(flowMeta.label)}</strong>
        <span>${escapeHtml(flowMeta.helper)}</span>
      </article>
    </section>
    <section class="dossier-section">
      <div class="dossier-section-head">
        <h4>Próximos passos</h4>
        <p>Controle a jornada do pré-assinante até ele virar assinante ativo.</p>
      </div>
      <div class="dossier-grid">
        ${buildDetailField("Etapa atual", flowMeta.label)}
        ${buildDetailField("Próxima ação", flowMeta.step === 1 ? "Aprovar ou reprovar" : flowMeta.step === 2 ? "Criar/concluir rateio" : flowMeta.step === 3 ? "Fluxo finalizado" : "Cadastro encerrado")}
      </div>
    </section>
    <section class="dossier-section">
      <div class="dossier-section-head">
        <h4>Cadastro</h4>
        <p>Dados cadastrais e comerciais do titular indicado.</p>
      </div>
      <div class="dossier-grid">
        ${buildDetailField("Tipo de pessoa", tipoPessoa)}
        ${buildDetailField("Nome / Razão social", nomePrincipal)}
        ${buildDetailField("Nome fantasia", item.nomeFantasia)}
        ${buildDetailField("Representante", item.nomeRepresentante)}
        ${buildDetailField("CPF/CNPJ", item.cpfCnpj)}
        ${buildDetailField("Nascimento/Fundação", item.dataNascimento || item.dataFundacao)}
        ${buildDetailField("Criado em", criadoEm)}
        ${buildDetailField("Vendedor", vendedor)}
      </div>
    </section>
    <section class="dossier-section">
      <div class="dossier-section-head">
        <h4>Contato e Energia</h4>
        <p>Informações de comunicação e parâmetros da unidade consumidora.</p>
      </div>
      <div class="dossier-grid">
        ${buildDetailField("E-mail", item.email)}
        ${buildDetailField("Telefone", item.telefone)}
        ${buildDetailField("UC", item.uc)}
        ${buildDetailField("Consumo médio", consumo)}
        ${buildDetailField("Desconto", desconto)}
        ${buildDetailField("Modalidade", prettyModalidade(item.modalidade), true)}
        ${buildDetailField("Isenção de impostos", item.isencaoImpostos ? "Sim" : "Não")}
        ${buildDetailField("Isenção de fio B", item.isencaoFioB ? "Sim" : "Não")}
      </div>
    </section>
    <section class="dossier-section">
      <div class="dossier-section-head">
        <h4>Endereço e Titularidade</h4>
        <p>Endereço da instalação e vínculo entre contratante e titular da conta.</p>
      </div>
      <div class="dossier-grid">
        ${buildDetailField("CEP", endereco.cep)}
        ${buildDetailField("Cidade/UF", `${endereco.cidade || "-"} / ${endereco.estado || "-"}`)}
        ${buildDetailField("Logradouro", endereco.logradouro, true)}
        ${buildDetailField("Número", endereco.numero)}
        ${buildDetailField("Complemento", endereco.complemento)}
        ${buildDetailField("Bairro", endereco.bairro)}
        ${buildDetailField("Titularidade", titularidade, true)}
        ${buildDetailField("Nome do titular na conta", item.nomeDonoConta)}
        ${buildDetailField("CPF/CNPJ do titular na conta", item.cpfCnpjDonoConta)}
        ${buildDetailField("Nascimento/Fundação do titular na conta", item.dataNascimentoDonoConta)}
      </div>
    </section>
    <section class="dossier-section">
      <div class="dossier-section-head">
        <h4>Documentos enviados</h4>
        <p>Acesse os arquivos anexados para revisão antes da aprovação.</p>
      </div>
      <div class="dossier-docs">
        ${docLinks.length ? docLinks.join("") : '<p class="dossier-empty-docs">Nenhum documento encontrado para este cadastro.</p>'}
      </div>
    </section>
  `;
}

function openIndicacaoModal(item) {
  if (!item) return;
  activeIndicacaoModalId = String(item.id || "");
  indicacaoModalStatus.textContent = `Status: ${statusLabel(item)}`;
  indicacaoModalBody.innerHTML = buildIndicacaoDetails(item);
  const stage = normalizeIndicacaoStatus(item.status || item.statusLabel);
  indicacaoApproveBtn.classList.toggle("hidden", stage !== "aguardando_aprovacao");
  indicacaoRejectBtn.classList.toggle("hidden", stage !== "aguardando_aprovacao");
  indicacaoRateioBtn.classList.toggle("hidden", stage !== "pendente_rateio");
  indicacaoModal.classList.remove("hidden");
}

function closeIndicacaoModal() {
  activeIndicacaoModalId = "";
  indicacaoModalBody.innerHTML = "";
  indicacaoModalStatus.textContent = "";
  indicacaoModal.classList.add("hidden");
}

function buildSubscriberPayloadFromIndicacao(item) {
  const isCompany = String(item.tipoPessoa || "").toLowerCase() === "juridica";
  const holderType = isCompany ? "company" : "person";
  const holderName = item.nome || item.razaoSocial || item.nomeFantasia || "";
  const cpfCnpj = item.cpfCnpj || "";
  const nowIso = new Date().toISOString();

  return {
    user_id: item.createdBy || item.user_id || scope.uid,
    tenantId: item.tenantId || scope.tenantId,
    status: "active",
    concessionaria: item.concessionaria || "Equatorial",
    subscriber: {
      fullName: isCompany ? "" : holderName,
      companyName: isCompany ? holderName : "",
      cpf: isCompany ? "" : cpfCnpj,
      cnpj: isCompany ? cpfCnpj : "",
      email: item.email || "",
      phone: item.telefone || "",
      observations: item.modalidade || "",
      partnerNumber: "",
      contacts: {},
    },
    energy_account: {
      holderType,
      cpfCnpj,
      holderName,
      uc: item.uc || "",
      partnerNumber: "",
    },
    plan_details: {
      contractedKwh: Number(item.consumoMedio || 0),
      discountPercentage: Number(item.desconto || 0),
    },
    plan_contract: {
      contractedKwh: Number(item.consumoMedio || 0),
      discountPercentage: Number(item.desconto || 0),
    },
    created_at: item.createdAtISO || nowIso,
    updated_at: nowIso,
    pending_source_id: item.id,
  };
}

async function approveIndicacao(item) {
  const nowIso = new Date().toISOString();
  await updateDoc(doc(db, COLL_PENDING, item.id), {
    status: "pendente_rateio",
    statusLabel: "Pendente para rateio",
    approved_by: scope.uid,
    approved_at: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtISO: nowIso,
  });
}

async function rejectIndicacao(item) {
  await updateDoc(doc(db, COLL_PENDING, item.id), {
    status: "rejeitado",
    reviewed_by: scope.uid,
    reviewed_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
    updatedAtISO: new Date().toISOString(),
  });
}

async function completeIndicacaoRateio(item) {
  const subscriberPayload = {
    ...buildSubscriberPayloadFromIndicacao(item),
    status: "active",
    onboarding_stage: "rateio_concluido",
    onboarding_origin_status: normalizeIndicacaoStatus(item.status || item.statusLabel),
    migrated_at: new Date().toISOString(),
  };
  await addDoc(collection(db, COLL_SUBSCRIBERS), subscriberPayload);
  await deleteDoc(doc(db, COLL_PENDING, item.id));
}

function isPartnerLikeRecord(item) {
  const cargo = cleanText(item?.cargo).toLowerCase();
  const role = cleanText(item?.role).toLowerCase();
  if (["parceiro", "vendedor", "representante"].includes(cargo)) return true;
  if (["parceiro", "vendedor", "representante"].includes(role)) return true;
  const perms = item?.permissions || {};
  return perms.representantes === true;
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizePhone(value) {
  return onlyDigits(value);
}

function buildPartnerFingerprints(list) {
  const docs = new Set();
  const emails = new Set();
  const phones = new Set();

  list.forEach((p) => {
    const doc = onlyDigits(p.cpfCnpj || p.cpf || p.cnpj || "");
    const email = normalizeEmail(p.email || p.mail || "");
    const phone = normalizePhone(p.telefone || p.phone || "");
    if (doc) docs.add(doc);
    if (email) emails.add(email);
    if (phone) phones.add(phone);
  });

  partnerFingerprints = { docs, emails, phones };
}

function matchesPartner(item) {
  const doc = onlyDigits(item.cpfCnpj || item.cpf || item.cnpj || "");
  const email = normalizeEmail(item.email || item.mail || "");
  const phone = normalizePhone(item.telefone || item.phone || "");
  if (doc && partnerFingerprints.docs.has(doc)) return true;
  if (email && partnerFingerprints.emails.has(email)) return true;
  if (phone && partnerFingerprints.phones.has(phone)) return true;
  return false;
}

function isPreAssinanteRecord(item) {
  if (!item || typeof item !== "object") return false;

  const hasPartnerSignals =
    Boolean(cleanText(item.cargo)) ||
    Boolean(cleanText(item.role)) ||
    Boolean(item.permissions && typeof item.permissions === "object") ||
    Boolean(cleanText(item.auth_user_id)) ||
    Boolean(cleanText(item.uid));
  if (hasPartnerSignals) return false;

  const hasCoreFields =
    Boolean(cleanText(item.nome || item.razaoSocial || item.nomeFantasia)) &&
    Boolean(onlyDigits(item.cpfCnpj || item.cpf || item.cnpj)) &&
    Boolean(onlyDigits(item.uc));
  if (!hasCoreFields) return false;

  const hasIndicacaoShape =
    Object.prototype.hasOwnProperty.call(item, "contaEnergiaNoNomeDoContratante") ||
    Object.prototype.hasOwnProperty.call(item, "modalidade") ||
    Object.prototype.hasOwnProperty.call(item, "desconto") ||
    Object.prototype.hasOwnProperty.call(item, "consumoMedio");

  return hasIndicacaoShape;
}

async function loadIndicacoesList() {
  if (!scope) return;
  indicacoesTableBody.innerHTML =
    `<tr><td colspan="${getTableColspan()}" class="empty-row">Carregando indicações...</td></tr>`;

  try {
    const collabsQueries = scope.isSuperAdmin
      ? [query(collection(db, COLL_COLLABORATORS))]
      : [
        query(collection(db, COLL_COLLABORATORS), where("tenantId", "==", scope.tenantId)),
        query(collection(db, COLL_COLLABORATORS), where("tenant_id", "==", scope.tenantId)),
        query(collection(db, COLL_COLLABORATORS), where("user_id", "==", scope.uid)),
        query(collection(db, COLL_COLLABORATORS), where("user_id", "==", scope.tenantId)),
      ];
    const collabsSnaps = await Promise.all(
      collabsQueries.map(async (q) => {
        try {
          return await getDocs(q);
        } catch {
          return { docs: [] };
        }
      })
    );
    const partnerMap = new Map();
    sellerByUid = new Map();
    collabsSnaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        const sellerUid = String(data.auth_user_id || data.uid || "");
        const sellerName = cleanText(data.nome || data.name || data.email || "");
        if (sellerUid) sellerByUid.set(sellerUid, sellerName || sellerUid);
        if (isPartnerLikeRecord(data)) partnerMap.set(d.id, data);
      });
    });
    buildPartnerFingerprints(Array.from(partnerMap.values()));

    let pendingDocs = [];
    if (scope.isSuperAdmin) {
      const allSnap = await getDocs(query(collection(db, COLL_PENDING)));
      pendingDocs = allSnap.docs;
    } else if (scope.isEmployee) {
      const ownQueries = [
        query(collection(db, COLL_PENDING), where("createdBy", "==", scope.uid)),
        query(collection(db, COLL_PENDING), where("user_id", "==", scope.uid)),
      ];
      const ownSnaps = await Promise.all(
        ownQueries.map(async (q) => {
          try {
            return await getDocs(q);
          } catch {
            return { docs: [] };
          }
        })
      );
      const byId = new Map();
      ownSnaps.forEach((snap) => snap.docs.forEach((d) => byId.set(d.id, d)));
      pendingDocs = Array.from(byId.values());
    } else {
      const byTenantQ = query(collection(db, COLL_PENDING), where("tenantId", "==", scope.tenantId));
      const snap = await getDocs(byTenantQ);
      pendingDocs = snap.docs;
    }

    indicacoesCache = pendingDocs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(isPreAssinanteRecord)
      .filter((x) => !matchesPartner(x))
      .sort((a, b) => {
        const ad = asDate(a.createdAt || a.createdAtISO || a.created_at)?.getTime() || 0;
        const bd = asDate(b.createdAt || b.createdAtISO || b.created_at)?.getTime() || 0;
        return bd - ad;
      });

    indicacoesCache = await normalizeWesleyIndicacoes(indicacoesCache);

    renderIndicacoesList();
    setUpdated("lista");
  } catch (error) {
    console.error(error);
    indicacoesTableBody.innerHTML =
      `<tr><td colspan="${getTableColspan()}" class="empty-row">Falha ao carregar indicações.</td></tr>`;
  }
}

function readStep1Data() {
  const tipoPessoa = tipoPessoaInput.value;
  const contaNoNome = getContaNoNome();

  return {
    tipoPessoa,
    nome: tipoPessoa === "fisica" ? cleanText(nomeCompletoInput.value) : cleanText(razaoSocialInput.value),
    razaoSocial: cleanText(razaoSocialInput.value),
    nomeFantasia: cleanText(nomeFantasiaInput.value),
    nomeRepresentante: cleanText(nomeRepresentanteInput.value),
    cpfCnpj: tipoPessoa === "fisica" ? onlyDigits(cpfInput.value) : onlyDigits(cnpjInput.value),
    dataNascimento: dataNascimentoInput.value || "",
    dataFundacao: dataFundacaoInput.value || "",
    email: cleanText(emailInput.value),
    telefone: cleanText(telefoneInput.value),
    uc: onlyDigits(ucInput.value),
    consumoMedio: Number(consumoMedioInput.value || 0),
    desconto: Number(descontoInput.value || 0),
    isencaoImpostos: Boolean(isencaoImpostosInput.checked),
    isencaoFioB: Boolean(isencaoFioBInput.checked),
    endereco: {
      cep: onlyDigits(cepInput.value),
      logradouro: cleanText(logradouroInput.value),
      numero: cleanText(numeroInput.value),
      complemento: cleanText(complementoInput.value),
      bairro: cleanText(bairroInput.value),
      cidade: cleanText(cidadeInput.value),
      estado: cleanText(estadoInput.value).toUpperCase(),
    },
    contaEnergiaNoNomeDoContratante: contaNoNome === "sim",
    nomeDonoConta: cleanText(nomeDonoContaInput.value),
    cpfCnpjDonoConta: onlyDigits(cpfCnpjDonoContaInput.value),
    dataNascimentoDonoConta: dataNascimentoDonoContaInput.value || "",
    modalidade: getModalidade(),
  };
}

function updateSummary() {
  const data = readStep1Data();
  summaryBar.innerHTML = `Cliente: <strong>${escapeHtml(data.nome || "- ")}</strong> | Documento: <strong>${escapeHtml(data.cpfCnpj || "-")}</strong> | UC: <strong>${escapeHtml(data.uc || "-")}</strong> | Modalidade: <strong>${escapeHtml(data.modalidade)}</strong>`;
}

function validateStep1() {
  const required = [
    emailInput,
    telefoneInput,
    ucInput,
    consumoMedioInput,
    descontoInput,
    cepInput,
    logradouroInput,
    numeroInput,
    bairroInput,
    cidadeInput,
    estadoInput,
  ];

  if (tipoPessoaInput.value === "fisica") {
    required.push(nomeCompletoInput, cpfInput, dataNascimentoInput);
  } else {
    required.push(razaoSocialInput, cnpjInput, nomeRepresentanteInput, dataFundacaoInput);
  }

  if (getContaNoNome() === "nao") {
    required.push(nomeDonoContaInput, cpfCnpjDonoContaInput, dataNascimentoDonoContaInput);
  }

  for (const input of required) {
    if (!input.value || !String(input.value).trim()) {
      input.reportValidity();
      return false;
    }
  }

  return true;
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

async function fillAddressFromCep() {
  const data = await lookupAddressByCep(cepInput.value);
  if (!data) {
    setStatus("Não foi possível encontrar endereco para o CEP informado.", "error");
    return false;
  }

  cepInput.value = data.cep;
  if (!logradouroInput.value.trim()) logradouroInput.value = data.logradouro;
  if (!bairroInput.value.trim()) bairroInput.value = data.bairro;
  cidadeInput.value = data.cidade || cidadeInput.value;
  estadoInput.value = (data.estado || estadoInput.value).toUpperCase();

  setStatus("Endereço preenchido com base no CEP.", "success");
  setUpdated("CEP");
  return true;
}

function sanitizeName(raw) {
  let text = cleanText(raw);
  if (!text) return "";

  text = normalizeAscii(text);
  text = text.replace(
    /^(RESIDENCIAL|COMERCIAL|INDUSTRIAL|RURAL|SERVICOS?\s+E\s+OUTRAS\s+ATIVIDADES|PODER\s+PUBLICO)\s+/i,
    ""
  );
  text = text.replace(/^(BAIXA\s+TENSAO|ALTA\s+TENSAO)\s+/i, "");
  text = text.replace(/\bCONVENCIONAL\b\s*/i, "");
  text = text.replace(/\b(CNPJ|CPF|UC|INSTALACAO|ENDERECO|CEP|FATURA|CONSUMO)\b.*$/i, "");
  text = cleanText(text);

  return text;
}

function sanitizeAddress(raw) {
  let text = cleanText(raw);
  if (!text) return "";
  text = text.replace(/^(ENDERECO|LOGRADOURO)\s*[:\-]?\s*/i, "");
  text = text.replace(/^DE\s+ENTREGA\s*[:\-]?\s*/i, "");
  return cleanText(text);
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
  const source = String(text || "");
  const data = {};

  const nomeMatch = source.match(/([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{8,}?)\s+(?:CNPJ\/CPF|CPF\/CNPJ|CPF|CNPJ)\s*[:\-]/i);
  if (nomeMatch) {
    const nome = sanitizeName(nomeMatch[1]);
    if (nome) data.nome = nome;
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

  const ucMatch = source.match(/(?:UC|INSTALACAO|UNIDADE\s+CONSUMIDORA)\s*[:\-]?\s*(\d{6,12})/i);
  if (ucMatch) data.uc = onlyDigits(ucMatch[1]);

  const consumoMatch = source.match(/(?:CONSUMO(?:\s+MEDIO)?|TOTAL\s+KWH)\s*[:\-]?\s*(\d+[\.,]?\d*)\s*(?:KWH)?/i);
  if (consumoMatch) {
    data.consumoMedio = Number(String(consumoMatch[1]).replace(".", "").replace(",", ".")) || 0;
  }

  Object.assign(data, extractAddressFields(source));
  return data;
}

function extractIdentityData(text) {
  const source = String(text || "");
  const data = {};

  const nomeMatch = source.match(/(?:NOME(?:\s*E\s*SOBRENOME)?)\s*[:\-]?\s*([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{8,})/i);
  if (nomeMatch) data.nome = cleanText(nomeMatch[1]);
  else {
    const firstBigLine = source.match(/\b([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da\s]{14,})\b/);
    if (firstBigLine) data.nome = cleanText(firstBigLine[1]);
  }

  const cpfMatch = source.match(/CPF\s*[:\-]?\s*([\d.\-]{11,14})/i);
  if (cpfMatch) data.cpf = onlyDigits(cpfMatch[1]);

  const rgMatch = source.match(/(?:RG|IDENTIDADE|REGISTRO\s+GERAL)\s*[:\-]?\s*([\dA-Z.\-]{5,20})/i);
  if (rgMatch) data.rg = cleanText(rgMatch[1]);

  return data;
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
  for (let i = 1; i <= pages; i += 1) {
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

async function applyExtractedData() {
  const billFile = docContaEnergiaInput.files?.[0];
  const idFile = docIdentificacaoInput.files?.[0];

  if (!billFile && !idFile) {
    setStatus("Selecione a conta de energia ou o documento para extracao.", "error");
    return;
  }



  try {
    setStatus("Lendo documentos e extraindo dados...");

    const billText = billFile ? await extractTextFromFile(billFile) : "";
    const idText = idFile ? await extractTextFromFile(idFile) : "";

    const billData = extractEnergyData(billText);
    const idData = extractIdentityData(idText);

    if (billData.tipoPessoa && billData.tipoPessoa !== tipoPessoaInput.value) {
      tipoPessoaInput.value = billData.tipoPessoa;
      updateTypeUI();
    }

    if (tipoPessoaInput.value === "fisica") {
      if (idData.nome && !nomeCompletoInput.value.trim()) nomeCompletoInput.value = idData.nome;
      if (idData.cpf && !cpfInput.value.trim()) cpfInput.value = idData.cpf;
      if (billData.nome && !nomeCompletoInput.value.trim()) nomeCompletoInput.value = billData.nome;
      if (billData.cpf && !cpfInput.value.trim()) cpfInput.value = billData.cpf;
    } else {
      if (billData.nome && !razaoSocialInput.value.trim()) razaoSocialInput.value = billData.nome;
      if (billData.cnpj && !cnpjInput.value.trim()) cnpjInput.value = billData.cnpj;
      if (idData.nome && !nomeRepresentanteInput.value.trim()) nomeRepresentanteInput.value = idData.nome;
    }

    if (billData.uc && !ucInput.value.trim()) ucInput.value = billData.uc;
    if (billData.consumoMedio && !consumoMedioInput.value.trim()) consumoMedioInput.value = String(billData.consumoMedio);

    if (billData.cep && !cepInput.value.trim()) cepInput.value = billData.cep;
    if (billData.endereco && !logradouroInput.value.trim()) logradouroInput.value = billData.endereco;
    if (billData.cidade && !cidadeInput.value.trim()) cidadeInput.value = billData.cidade;
    if (billData.estado && !estadoInput.value.trim()) estadoInput.value = billData.estado;

    if (cepInput.value) {
      await fillAddressFromCep();
    }

    const count = [
      nomeCompletoInput.value,
      cpfInput.value,
      razaoSocialInput.value,
      cnpjInput.value,
      nomeRepresentanteInput.value,
      ucInput.value,
      consumoMedioInput.value,
      cepInput.value,
      logradouroInput.value,
      cidadeInput.value,
      estadoInput.value,
    ].filter(Boolean).length;

    setStatus(`Extracao concluida. ${count} campos preenchidos/atualizados.`, "success");
    setUpdated("extracao");
    updateSummary();
  } catch (error) {
    console.error(error);
    setStatus("Falha ao extrair dados dos documentos.", "error");
  } finally {

  }
}

async function getUserScope(user) {
  const token = await getIdTokenResult(user, true);
  const role = String(token?.claims?.role || "").toLowerCase();
  const isSuperAdmin = token?.claims?.superadmin === true || role === "superadmin";
  const result = {
    uid: user.uid,
    tenantId: user.uid,
    email: user.email || "",
    name: "",
    isSuperAdmin,
    isEmployee: false,
    isAdmin: false,
  };

  if (isSuperAdmin) {
    result.isAdmin = true;
    result.name = user.email || "";
    return result;
  }

  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) {
    const d = adminSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    result.name = d.name || "";
    result.isAdmin = true;
    return result;
  }

  const funcQ = query(collection(db, "gcredito_funcionarios"), where("auth_user_id", "==", user.uid), limit(1));
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) {
    const d = funcSnap.docs[0].data();
    result.tenantId = d.tenantId || result.tenantId;
    result.name = d.nome || d.name || "";
    result.isEmployee = true;
    return result;
  }

  return result;
}

function makeSafeFileName(fileName) {
  return String(fileName || "arquivo")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(-90);
}

async function uploadDocument(file, key) {
  if (!file) return "";

  const now = Date.now();
  const safeName = makeSafeFileName(file.name);
  const path = `assinantes_pendentes/${scope.tenantId}/${scope.uid}/${now}_${key}_${safeName}`;

  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  return getDownloadURL(fileRef);
}

function validateStep2Files() {
  const hasContaEnergia = docContaEnergiaInput.files?.length || existingDocUrl("contaEnergiaUrl");
  if (!hasContaEnergia) {
    docContaEnergiaInput.reportValidity();
    return false;
  }

  const hasIdentificacao = docIdentificacaoInput.files?.length || existingDocUrl("cnhUrl");
  if (!hasIdentificacao) {
    docIdentificacaoInput.reportValidity();
    return false;
  }

  const isPj = tipoPessoaInput.value === "juridica";
  const hasContratoSocial = docContratoSocialInput.files?.length || existingDocUrl("contratoSocialUrl");
  if (isPj && !hasContratoSocial) {
    docContratoSocialInput.reportValidity();
    return false;
  }

  const isTerceiro = getContaNoNome() === "nao";
  const hasDocTerceiro = docTerceiroInput.files?.length || existingDocUrl("cnhDonoContaUrl");
  if (isTerceiro && !hasDocTerceiro) {
    docTerceiroInput.reportValidity();
    return false;
  }

  return true;
}

async function saveIndicacao() {
  if (!scope) {
    setStatus("Usuario ainda nao autenticado.", "error");
    return;
  }

  if (!validateStep2Files()) return;

  salvarBtn.disabled = true;
  continuarBtn.disabled = true;
  voltarBtn.disabled = true;

  try {
    setStatus("Enviando documentos para o storage...");

    const [contaEnergiaUrl, cnhUrl, contratoSocialUrl, cnhDonoContaUrl] = await Promise.all([
      uploadDocument(docContaEnergiaInput.files?.[0], "conta_energia"),
      uploadDocument(docIdentificacaoInput.files?.[0], "doc_identificacao"),
      uploadDocument(docContratoSocialInput.files?.[0], "contrato_social"),
      uploadDocument(docTerceiroInput.files?.[0], "doc_terceiro"),
    ]);

    const data = readStep1Data();
    const nowIso = new Date().toISOString();

    const payload = {
      tipoPessoa: data.tipoPessoa,
      nome: data.nome,
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      nomeRepresentante: data.nomeRepresentante,
      cpfCnpj: data.cpfCnpj,
      dataNascimento: data.dataNascimento,
      dataFundacao: data.dataFundacao,
      email: data.email,
      telefone: data.telefone,
      uc: data.uc,
      consumoMedio: data.consumoMedio,
      desconto: data.desconto,
      isencaoImpostos: data.isencaoImpostos,
      isencaoFioB: data.isencaoFioB,
      endereco: {
        cep: data.endereco.cep,
        logradouro: data.endereco.logradouro,
        numero: data.endereco.numero,
        complemento: data.endereco.complemento,
        bairro: data.endereco.bairro,
        cidade: data.endereco.cidade,
        estado: data.endereco.estado,
      },
      contaEnergiaNoNomeDoContratante: data.contaEnergiaNoNomeDoContratante,
      nomeDonoConta: data.nomeDonoConta || data.nome,
      cpfCnpjDonoConta: data.cpfCnpjDonoConta || data.cpfCnpj,
      dataNascimentoDonoConta: data.dataNascimentoDonoConta || data.dataNascimento || data.dataFundacao || "",
      modalidade: data.modalidade,
      documentos: {
        contaEnergiaUrl: contaEnergiaUrl || existingDocUrl("contaEnergiaUrl"),
        cnhUrl: cnhUrl || existingDocUrl("cnhUrl"),
        contratoSocialUrl: contratoSocialUrl || existingDocUrl("contratoSocialUrl"),
        cnhDonoContaUrl: cnhDonoContaUrl || existingDocUrl("cnhDonoContaUrl"),
      },
      status: "aguardando_aprovacao",
      statusLabel: "Aguardando Aprovacao",
      tenantId: scope.tenantId,
      createdBy: scope.uid,
      user_id: scope.uid,
      nomeAdmin: scope.name || scope.email || scope.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAtISO: nowIso,
      updatedAtISO: nowIso,
    };

    if (editingIndicacaoId) {
      delete payload.createdAt;
      delete payload.createdAtISO;
      await updateDoc(doc(db, COLL_PENDING, editingIndicacaoId), payload);
    } else {
      await addDoc(collection(db, COLL_PENDING), payload);
    }

    await loadIndicacoesList();
    setStep(3);
    setStatus(editingIndicacaoId ? "Indicação atualizada com sucesso." : "Indicacao salva com sucesso.", "success");
    setUpdated(editingIndicacaoId ? "atualizado" : "salvo");
    editingIndicacaoId = "";
    editingIndicacaoData = null;
    updateSaveButtonLabel();
  } catch (error) {
    console.error(error);
    setStatus(`Falha ao salvar indicacao: ${error.message || "erro desconhecido"}`, "error");
  } finally {
    salvarBtn.disabled = false;
    continuarBtn.disabled = false;
    voltarBtn.disabled = false;
  }
}

function bindEvents() {
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

  typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tipoPessoaInput.value = button.dataset.personType || "fisica";
      updateTypeUI();
    });
  });

  contaNoNomeInputs.forEach((input) => {
    input.addEventListener("change", updateTitularidadeUI);
  });

  continuarBtn?.addEventListener("click", () => {
    if (!validateStep1()) {
      setStatus("Preencha os campos obrigatórios da fase 1.", "error");
      return;
    }

    updateSummary();
    updateUploadRules();
    setStep(2);
    setStatus("Agora envie os documentos para concluir.");
  });

  voltarBtn?.addEventListener("click", () => {
    setStep(1);
    setStatus("Revise ou ajuste os dados da fase 1.");
  });

  buscarCepBtn?.addEventListener("click", () => {
    fillAddressFromCep();
  });

  cepInput?.addEventListener("blur", () => {
    if (onlyDigits(cepInput.value).length === 8) fillAddressFromCep();
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!step2Panel.classList.contains("hidden")) saveIndicacao();
  });

  novaIndicacaoBtn?.addEventListener("click", () => {
    resetToNewIndicacaoForm("Formulario limpo para nova indicacao.");
  });

  novaIndicacaoTopBtn?.addEventListener("click", () => {
    resetToNewIndicacaoForm("Preencha os dados e avance para o upload.");
  });

  voltarListaTopBtn?.addEventListener("click", async () => {
    await loadIndicacoesList();
    showListMode();
    setStatus("Lista de indicações atualizada.");
  });

  voltarListaBtn?.addEventListener("click", async () => {
    await loadIndicacoesList();
    showListMode();
    setStatus("Lista de indicações atualizada.");
  });

  indicacoesTableBody?.addEventListener("click", async (event) => {
    const viewBtn = event.target.closest("[data-view-id]");
    if (viewBtn) {
      const id = String(viewBtn.getAttribute("data-view-id") || "");
      const item = indicacoesCache.find((x) => String(x.id) === id);
      if (item) openIndicacaoModal(item);
      return;
    }

    const editBtn = event.target.closest("[data-edit-id]");
    if (editBtn) {
      const id = String(editBtn.getAttribute("data-edit-id") || "");
      const item = indicacoesCache.find((x) => String(x.id) === id);
      if (item) populateFormForEdit(item);
      return;
    }

  });

  indicacaoModalCloseBtn?.addEventListener("click", closeIndicacaoModal);
  indicacaoModalCancelBtn?.addEventListener("click", closeIndicacaoModal);
  indicacaoModal?.addEventListener("click", (event) => {
    if (event.target === indicacaoModal) closeIndicacaoModal();
  });

  indicacaoApproveBtn?.addEventListener("click", async () => {
    if (!activeIndicacaoModalId) return;
    const item = indicacoesCache.find((x) => String(x.id) === activeIndicacaoModalId);
    if (!item || !canReviewIndicacao(item)) return;
    const ok = window.confirm(`Aprovar o pré-assinante "${item.nome || item.razaoSocial || "-"}" e enviar para etapa de rateio?`);
    if (!ok) return;
    indicacaoApproveBtn.disabled = true;
    indicacaoRejectBtn.disabled = true;
    try {
      await approveIndicacao(item);
      await loadIndicacoesList();
      const updated = indicacoesCache.find((x) => String(x.id) === activeIndicacaoModalId);
      if (updated) openIndicacaoModal(updated);
      setStatus("Pré-assinante aprovado. Agora ele está pendente para rateio.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível aprovar o pré-assinante.", "error");
    } finally {
      indicacaoApproveBtn.disabled = false;
      indicacaoRejectBtn.disabled = false;
    }
  });

  indicacaoRejectBtn?.addEventListener("click", async () => {
    if (!activeIndicacaoModalId) return;
    const item = indicacoesCache.find((x) => String(x.id) === activeIndicacaoModalId);
    const stage = normalizeIndicacaoStatus(item?.status || item?.statusLabel);
    if (!item || stage !== "aguardando_aprovacao") return;
    const ok = window.confirm(`Rejeitar o pré-assinante "${item.nome || item.razaoSocial || "-"}"?`);
    if (!ok) return;
    indicacaoApproveBtn.disabled = true;
    indicacaoRejectBtn.disabled = true;
    try {
      await rejectIndicacao(item);
      await loadIndicacoesList();
      const updated = indicacoesCache.find((x) => String(x.id) === activeIndicacaoModalId);
      if (updated) openIndicacaoModal(updated);
      setStatus("Pré-assinante rejeitado com sucesso.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível rejeitar o pré-assinante.", "error");
    } finally {
      indicacaoApproveBtn.disabled = false;
      indicacaoRejectBtn.disabled = false;
    }
  });

  indicacaoRateioBtn?.addEventListener("click", async () => {
    if (!activeIndicacaoModalId) return;
    const item = indicacoesCache.find((x) => String(x.id) === activeIndicacaoModalId);
    if (!item || normalizeIndicacaoStatus(item.status || item.statusLabel) !== "pendente_rateio") return;
    const ok = window.confirm(`Concluir o rateio de "${item.nome || item.razaoSocial || "-"}" e migrar para assinantes?`);
    if (!ok) return;
    indicacaoRateioBtn.disabled = true;
    try {
      await completeIndicacaoRateio(item);
      closeIndicacaoModal();
      await loadIndicacoesList();
      setStatus("Rateio concluído. O cadastro foi movido para assinantes.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível concluir o rateio.", "error");
    } finally {
      indicacaoRateioBtn.disabled = false;
    }
  });

  window.addEventListener("resize", applySidebarState);
}

function initUi() {
  initTheme();
  applySidebarState();
  updateTypeUI();
  updateTitularidadeUI();
  updateSummary();
  setStep(1);
  showListMode();
  updateSaveButtonLabel();
  bindEvents();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    scope = await getUserScope(user);
    if (!emailInput.value) emailInput.value = user.email || "";
    await loadIndicacoesList();
    setUpdated("autenticado");
    setStatus("Selecione uma indicação da lista ou clique em Nova indicação.");
  } catch (error) {
    console.error(error);
    setStatus("Falha ao carregar contexto do usuário.", "error");
  }
});

initUi();
