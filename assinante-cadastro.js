import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, limit, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDownloadURL, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

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
const storageFallbacks = [
  storage,
  getStorage(app, "gs://gcredito.firebasestorage.app"),
  getStorage(app, "gs://gcredito.appspot.com"),
];
const COLL = "gcredito_subscribers";
const editingId = new URLSearchParams(window.location.search).get("id");

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));
const id = (s) => document.getElementById(s);
const form = id("subscriberWizardForm");
const DRAFT_VERSION = 1;
const toNumber = (v) => { const n = Number(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
const onlyDigits = (v) => String(v || "").replace(/\D+/g, "");
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const state = {
  scope: null,
  step: 1,
  discountTouched: false,
  accounts: [],
  personContacts: [],
  companyContacts: [],
  transfer: {},
  notifications: {},
  draftReady: false,
};

const DISCOUNT_RANGES = [
  { min: 0, max: 400, none: 13, m12: 15, m24: 20 },
  { min: 401, max: 600, none: 15, m12: 18, m24: 20 },
  { min: 601, max: 1100, none: 18, m12: 20, m24: 22 },
  { min: 1101, max: 3100, none: 20, m12: 22, m24: 25 },
  { min: 3101, max: 7000, none: 22, m12: 25, m24: 27 },
];

const stepTimeline = [
  { label: "Concessionária", icon: "ph-lightning" },
  { label: "Tipo", icon: "ph-identification-card" },
  { label: "Dados", icon: "ph-user-list" },
  { label: "UCs", icon: "ph-plugs" },
  { label: "Transferência", icon: "ph-arrows-left-right" },
  { label: "Contrato", icon: "ph-file-text" },
  { label: "Resumo", icon: "ph-chart-line-up" },
  { label: "Notificações", icon: "ph-bell-ringing" },
  { label: "Anexos", icon: "ph-paperclip" },
];
const stepTitles = stepTimeline.map((x) => x.label);

function draftStorageKey() {
  const uid = state.scope?.uid || "anon";
  const mode = editingId || "new";
  return `gcsolar_subscriber_draft:v${DRAFT_VERSION}:${uid}:${mode}`;
}

function saveDraft() {
  if (!form || !state.scope?.uid || !state.draftReady) return;
  try {
    const fieldValues = {};
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      if (!el.id || el.type === "file") return;
      if (el.type === "checkbox" || el.type === "radio") fieldValues[el.id] = !!el.checked;
      else fieldValues[el.id] = el.value;
    });
    const draft = {
      v: DRAFT_VERSION,
      step: state.step,
      holderType: holderType(),
      discountTouched: state.discountTouched,
      accounts: state.accounts.map((a) => ({
        personType: a.personType || "person",
        doc: a.doc || "",
        name: a.name || "",
        birthDate: a.birthDate || "",
        uc: a.uc || "",
        partner: a.partner || "",
        address: a.address || { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" },
      })),
      personContacts: state.personContacts || [],
      companyContacts: state.companyContacts || [],
      transfer: state.transfer || {},
      notifications: state.notifications || {},
      fields: fieldValues,
      savedAt: Date.now(),
    };
    localStorage.setItem(draftStorageKey(), JSON.stringify(draft));
  } catch (err) {
    console.warn("Falha ao salvar rascunho local:", err);
  }
}

function restoreDraft() {
  if (!form || !state.scope?.uid) return false;
  try {
    const raw = localStorage.getItem(draftStorageKey());
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || draft.v !== DRAFT_VERSION) return false;

    const type = draft.holderType === "company" ? "company" : "person";
    const typeRadio = qsa('input[name="holderType"]').find((x) => x.value === type);
    if (typeRadio) typeRadio.checked = true;
    toggleStep3();

    Object.entries(draft.fields || {}).forEach(([fieldId, value]) => {
      const el = id(fieldId);
      if (!el) return;
      if (el.type === "checkbox" || el.type === "radio") el.checked = !!value;
      else el.value = value ?? "";
    });

    state.discountTouched = !!draft.discountTouched;
    state.accounts = Array.isArray(draft.accounts) && draft.accounts.length
      ? draft.accounts.map((a) => createAccount(a))
      : [createAccount()];
    state.personContacts = Array.isArray(draft.personContacts) ? draft.personContacts : [];
    state.companyContacts = Array.isArray(draft.companyContacts) ? draft.companyContacts : [];
    state.transfer = draft.transfer && typeof draft.transfer === "object" ? draft.transfer : {};
    state.notifications = draft.notifications && typeof draft.notifications === "object" ? draft.notifications : {};
    state.step = Math.max(1, Math.min(9, Number(draft.step) || 1));

    renderAccounts();
    renderContacts("person");
    renderContacts("company");
    renderNotifications();
    renderTransfer();
    toggleAdminBlock();
    renderSummary();
    updateStepUI();
    return true;
  } catch (err) {
    console.warn("Falha ao restaurar rascunho local:", err);
    return false;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(draftStorageKey());
  } catch (err) {
    console.warn("Falha ao limpar rascunho local:", err);
  }
}

function applyMask(value, type) {
  const d = onlyDigits(value);
  if (type === "cpf") return d.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  if (type === "cnpj") return d.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  if (type === "cpfcnpj") return d.length > 11 ? applyMask(d, "cnpj") : applyMask(d, "cpf");
  if (type === "cep") return d.slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
  if (type === "phone") return d.length <= 10 ? d.slice(0, 10).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2") : d.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  return value;
}

function bindMasks(root = document) {
  root.querySelectorAll("[data-mask]").forEach((el) => {
    if (el.dataset.masked === "1") return;
    el.dataset.masked = "1";
    el.addEventListener("input", () => { el.value = applyMask(el.value, el.dataset.mask); });
  });
}

function readAddress(group) {
  const out = { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
  const root = qs(`[data-address='${group}']`);
  if (!root) return out;
  Object.keys(out).forEach((k) => { out[k] = clean(root.querySelector(`[data-address-field='${k}']`)?.value || ""); });
  out.state = out.state.toUpperCase();
  return out;
}

async function fillCep(group) {
  const addr = readAddress(group);
  const cep = onlyDigits(addr.cep);
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return;
    const root = qs(`[data-address='${group}']`);
    root.querySelector("[data-address-field='street']").value = d.logradouro || "";
    root.querySelector("[data-address-field='district']").value = d.bairro || "";
    root.querySelector("[data-address-field='city']").value = d.localidade || "";
    root.querySelector("[data-address-field='state']").value = (d.uf || "").toUpperCase();
  } catch {}
}

function holderType() { return qsa('input[name="holderType"]').find((x) => x.checked)?.value || "person"; }

function updateStepUI() {
  qsa(".step-pane").forEach((p) => {
    const active = Number(p.dataset.step) === state.step;
    p.classList.toggle("hidden", !active);
    p.classList.toggle("is-active", active);
  });
  id("stepLabel").textContent = `Etapa ${state.step} de 9`;
  id("stepTitle").textContent = stepTitles[state.step - 1];
  id("prevStepBtn").disabled = state.step <= 1;
  id("nextStepBtn").classList.toggle("hidden", state.step >= 9);
  id("saveWizardBtn").classList.toggle("hidden", state.step < 9);
  const progress = ((state.step - 1) / (stepTitles.length - 1)) * 100;
  const dots = id("stepDots");
  dots.style.setProperty("--timeline-progress", `${Math.max(0, Math.min(100, progress))}%`);
  dots.innerHTML = stepTimeline.map((meta, i) => {
    const n = i + 1;
    const stateClass = n < state.step ? "done" : n === state.step ? "current" : "upcoming";
    const indicator = n < state.step ? "<i class='ph ph-check'></i>" : `<i class='ph ${meta.icon}'></i>`;
    return `
      <button type='button' class='step-dot ${stateClass}' data-dot-step='${n}' aria-label='Etapa ${n}: ${meta.label}'>
        <span class='step-dot-index'>${indicator}</span>
        <span class='step-dot-label'>${meta.label}</span>
      </button>
    `;
  }).join("");

  const currentBtn = dots.querySelector(".step-dot.current");
  if (currentBtn) {
    currentBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  saveDraft();
}

function toggleStep3() {
  const person = holderType() === "person";
  id("personStepBlock").classList.toggle("hidden", !person);
  id("companyStepBlock").classList.toggle("hidden", person);
  id("fileCnhWrap").classList.toggle("hidden", !person);
  id("fileContractSocialWrap").classList.toggle("hidden", person);
  toggleAdminBlock();
}

function toggleAdminBlock() {
  const show = holderType() === "company";
  id("companyAdminBlock").classList.toggle("hidden", !show);
}

function createAccount(seed = {}) {
  return {
    personType: seed.personType || holderType() || "person",
    doc: seed.doc || "",
    name: seed.name || "",
    birthDate: seed.birthDate || "",
    uc: seed.uc || "",
    partner: seed.partner || "",
    address: seed.address || { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" },
  };
}

function fillPrimaryToFirstUc() {
  const person = holderType() === "person";
  if (!state.accounts.length) state.accounts.push(createAccount());
  state.accounts[0].personType = person ? "person" : "company";
  state.accounts[0].doc = person ? id("personCpf").value : id("companyCnpj").value;
  state.accounts[0].name = person ? id("personName").value : (id("companyRazao").value || id("companyFantasy").value);
  state.accounts[0].birthDate = person ? (id("personBirth").value || "") : "";
  state.accounts[0].partner = person ? id("personPartner").value : id("companyPartnerSocio").value;
  state.accounts[0].address = person ? readAddress("personAddress") : readAddress("companyAddress");
  renderAccounts();
}

function fillPrimaryToFirstUcIfMissing() {
  const person = holderType() === "person";
  if (!state.accounts.length) state.accounts.push(createAccount());

  const primaryAddress = person ? readAddress("personAddress") : readAddress("companyAddress");
  const account = state.accounts[0];

  account.personType = account.personType || (person ? "person" : "company");
  if (!clean(account.doc)) account.doc = person ? id("personCpf").value : id("companyCnpj").value;
  if (!clean(account.name)) account.name = person ? id("personName").value : (id("companyRazao").value || id("companyFantasy").value);
  if (person && !clean(account.birthDate)) account.birthDate = id("personBirth").value || "";
  if (!clean(account.partner)) account.partner = person ? id("personPartner").value : id("companyPartnerSocio").value;

  account.address = account.address || { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
  Object.keys(primaryAddress).forEach((key) => {
    if (!clean(account.address[key])) account.address[key] = primaryAddress[key];
  });
}

function fillPrimaryToAccountsIfMissing() {
  if (!state.accounts.length) return;
  const person = holderType() === "person";
  const primaryAddress = person ? readAddress("personAddress") : readAddress("companyAddress");
  if (!validateAddress(primaryAddress)) return;

  state.accounts.forEach((account) => {
    if (!account.address) account.address = { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
    const current = account.address || {};
    if (validateAddress(current)) return;
    Object.keys(primaryAddress).forEach((key) => {
      if (!clean(current[key])) current[key] = primaryAddress[key];
    });
  });
}

function renderAccounts() {
  if (!state.accounts.length) state.accounts = [createAccount()];
  const canRemove = state.accounts.length > 1;
  id("energyAccounts").innerHTML = state.accounts.map((x, i) => `
    <article class='account-card'>
      <header class='account-card-head'>
        <div>
          <p class='account-kicker'>Conta de Energia</p>
          <h4>Conta ${i + 1}</h4>
        </div>
        <div class='action-row'>
          ${i > 0 ? `<button type='button' class='btn-secondary' data-copy-account-address='${i}'>Copiar endereco da conta 1</button>` : ""}
          ${canRemove ? `<button type='button' class='btn-secondary uc-remove-btn' data-remove-account='${i}'>Remover Conta</button>` : ""}
        </div>
      </header>
      <div class='grid cols-3 account-fields'>
        <label class='field'><span>Tipo de Pessoa *</span><select data-acc='personType' data-idx='${i}'><option value='person' ${x.personType === "person" ? "selected" : ""}>Pessoa Física</option><option value='company' ${x.personType === "company" ? "selected" : ""}>Pessoa Jurídica</option></select></label>
        <label class='field'><span>CPF ou CNPJ *</span><input data-mask='cpfcnpj' data-acc='doc' data-idx='${i}' value='${x.doc || ""}'></label>
        <label class='field'><span>Nome da PF / Empresa *</span><input data-acc='name' data-idx='${i}' value='${x.name || ""}'></label>
        <label class='field ${x.personType === "company" ? "hidden" : ""}'><span>Data de Nascimento *</span><input type='date' data-acc='birthDate' data-idx='${i}' value='${x.birthDate || ""}'></label>
        <label class='field'><span>UC - Unidade Consumidora *</span><input data-acc='uc' data-idx='${i}' value='${x.uc || ""}'></label>
        <label class='field'><span>Numero do Parceiro *</span><input data-acc='partner' data-idx='${i}' value='${x.partner || ""}'></label>
      </div>
      <h3>Endereço da Instalação</h3>
      <div class='grid cols-4 account-fields' data-account-address='${i}'>
        <label class='field'><span>CEP *</span><input data-mask='cep' data-acc-addr='cep' data-idx='${i}' value='${x.address?.cep || ""}'></label>
        <label class='field span-2'><span>Endereço *</span><input data-acc-addr='street' data-idx='${i}' value='${x.address?.street || ""}'></label>
        <label class='field'><span>Numero *</span><input data-acc-addr='number' data-idx='${i}' value='${x.address?.number || ""}'></label>
        <label class='field'><span>Complemento</span><input data-acc-addr='complement' data-idx='${i}' value='${x.address?.complement || ""}'></label>
        <label class='field'><span>Bairro *</span><input data-acc-addr='district' data-idx='${i}' value='${x.address?.district || ""}'></label>
        <label class='field'><span>Cidade *</span><input data-acc-addr='city' data-idx='${i}' value='${x.address?.city || ""}'></label>
        <label class='field'><span>Estado *</span><input data-acc-addr='state' data-idx='${i}' value='${x.address?.state || ""}'></label>
      </div>
    </article>
  `).join("");
  bindMasks(id("energyAccounts"));
  renderTransfer();
  saveDraft();
}

function transferEnabled() {
  return qsa('input[name="transferRequired"]').find((x) => x.checked)?.value === "yes";
}

function renderTransfer() {
  const details = id("transferDetails");
  if (details) details.classList.toggle("hidden", !transferEnabled());
  id("transferBirthWrap")?.classList.toggle("hidden", clean(id("transferHolderType")?.value) !== "person");
  id("transferDateWrap")?.classList.toggle("hidden", clean(id("transferDone")?.value) !== "yes");
  id("fileTransferProtocolWrap")?.classList.toggle("hidden", !transferEnabled());
  saveDraft();
}

function suggestedDiscount() {
  const kwh = toNumber(id("planContractedKwh")?.value);
  const fidelity = clean(id("planFidelity")?.value || "none");
  const r = DISCOUNT_RANGES.find((x) => kwh >= x.min && kwh <= x.max) || DISCOUNT_RANGES[DISCOUNT_RANGES.length - 1];
  if (fidelity === "24") return r.m24;
  if (fidelity === "12") return r.m12;
  return r.none;
}

function getFidelityKey() {
  const fidelity = clean(id("planFidelity")?.value || "none");
  if (fidelity === "24") return "m24";
  if (fidelity === "12") return "m12";
  return "none";
}

function formatRangeLabel(min, max) {
  if (max >= 7000) return `${min}+`;
  return `${min} - ${max}`;
}

function renderPlanDiscountDemo() {
  const panel = id("planDiscountDemoPanel");
  const body = id("planDiscountDemoBody");
  const hint = id("planDiscountDemoHint");
  if (!panel || !body) return;

  const show = id("planShowDiscountTable")?.checked !== false;
  panel.classList.toggle("hidden", !show);
  if (!show) return;

  const kwh = toNumber(id("planContractedKwh")?.value);
  const fidelityKey = getFidelityKey();
  const activeIdx = DISCOUNT_RANGES.findIndex((x) => kwh >= x.min && kwh <= x.max);
  const chosenIdx = activeIdx >= 0 ? activeIdx : DISCOUNT_RANGES.length - 1;
  const chosen = DISCOUNT_RANGES[chosenIdx];
  const suggested = chosen?.[fidelityKey] ?? 0;

  body.innerHTML = DISCOUNT_RANGES.map((range, idx) => {
    const isRowActive = idx === chosenIdx;
    const cellClass = (key) => isRowActive && key === fidelityKey ? "cell-active" : "";
    return `
      <tr class="${isRowActive ? "row-active" : ""}">
        <td>${formatRangeLabel(range.min, range.max)}</td>
        <td class="${cellClass("none")}">${Number(range.none).toFixed(2)}%</td>
        <td class="${cellClass("m12")}">${Number(range.m12).toFixed(2)}%</td>
        <td class="${cellClass("m24")}">${Number(range.m24).toFixed(2)}%</td>
      </tr>
    `;
  }).join("");

  if (hint) {
    hint.textContent = `Faixa ativa: ${formatRangeLabel(chosen.min, chosen.max)} kWh | Fidelidade selecionada | Desconto sugerido: ${Number(suggested).toFixed(2)}%.`;
  }
}

function renderSummary() {
  if (id("discountPreview")) id("discountPreview").textContent = `Desconto sugerido automaticamente: ${suggestedDiscount().toFixed(2)}%`;
  renderPlanDiscountDemo();
}

function renderNotifications() {
  const groups = [
    { title: "WhatsApp - Básicas", key: "whatsapp_basic", items: ["Enviar Faturas de Energia por WhatsApp", "Informar Pagamento Recebido por WhatsApp"] },
    { title: "Antes do Vencimento - WhatsApp", key: "whatsapp_before", items: ["Ao Criar Nova Cobrança", "Alteração de Valor ou Data de Vencimento", "Aviso 1 Dia Antes do Vencimento", "Aviso no Dia do Vencimento"] },
    { title: "Antes do Vencimento - Email", key: "email_before", items: ["Ao Criar Nova Cobrança", "Alteração de Valor ou Data de Vencimento", "Aviso 1 Dia Antes do Vencimento", "Aviso no Dia do Vencimento"] },
    { title: "Cobranças Vencidas - WhatsApp", key: "whatsapp_overdue", items: ["1 Dia Após", "3 Dias Após", "5 Dias Após", "7 Dias Após", "15 Dias Após", "20 Dias Após", "25 Dias Após", "30 Dias Após", "Após 30 Dias (de 5 em 5 dias)"] },
    { title: "Cobranças Vencidas - Email", key: "email_overdue", items: ["1 Dia Após", "3 Dias Após", "5 Dias Após", "7 Dias Após", "15 Dias Após", "20 Dias Após", "25 Dias Após", "30 Dias Após", "Após 30 Dias (de 5 em 5 dias)"] },
  ];

  id("notifyGrid").innerHTML = groups.map((group) => {
    const totalEnabled = group.items.filter((_, idx) => state.notifications[`${group.key}.${idx}`] === true).length;
    const checks = group.items.map((label, idx) => {
      const notifyKey = `${group.key}.${idx}`;
      const checked = state.notifications[notifyKey] === true ? "checked" : "";
      return `
        <label class="notify-item">
          <input type="checkbox" data-notify-key="${notifyKey}" ${checked}>
          <span>${label}</span>
        </label>
      `;
    }).join("");
    return `
      <article class="notify-col">
        <div class="notify-col-head">
          <div>
            <p class="notify-kicker">Grupo de automação</p>
            <h4>${group.title}</h4>
          </div>
          <span class="notify-count">${totalEnabled}/${group.items.length} ativos</span>
        </div>
        <div class="notify-list">${checks}</div>
      </article>
    `;
  }).join("");
  saveDraft();
}

function renderContacts(kind) {
  const isPerson = kind === "person";
  const list = isPerson ? state.personContacts : state.companyContacts;
  const root = id(isPerson ? "personContacts" : "companyContacts");
  if (!root) return;
  root.innerHTML = list.map((c, i) => `
    <article class='account-card'>
      <div class='grid cols-3'>
        <label class='field'><span>Nome</span><input data-contact='name' data-kind='${kind}' data-idx='${i}' value='${c.name || ""}'></label>
        <label class='field'><span>Telefone</span><input data-mask='phone' data-contact='phone' data-kind='${kind}' data-idx='${i}' value='${c.phone || ""}'></label>
        <label class='field'><span>Funcao</span><input data-contact='role' data-kind='${kind}' data-idx='${i}' value='${c.role || ""}'></label>
      </div>
      <div class='action-row'><button type='button' class='btn-secondary uc-remove-btn' data-remove-contact='${kind}:${i}'>Remover Contato</button></div>
    </article>
  `).join("");
  bindMasks(root);
}

async function fillCepFromRoot(root, cep) {
  if (!root || !cep || cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return;
    const map = { street: d.logradouro || "", district: d.bairro || "", city: d.localidade || "", state: (d.uf || "").toUpperCase() };
    Object.entries(map).forEach(([k, v]) => {
      const input = root.querySelector(`[data-acc-addr='${k}']`);
      if (input) input.value = v;
    });
    const idx = Number(root.dataset.accountAddress);
    if (Number.isInteger(idx) && state.accounts[idx]) {
      Object.entries(map).forEach(([k, v]) => {
        state.accounts[idx].address[k] = clean(v);
      });
      saveDraft();
    }
  } catch {}
}

function syncAccountsFromDom() {
  qsa("#energyAccounts [data-acc]").forEach((el) => {
    const i = Number(el.dataset.idx);
    const k = el.dataset.acc;
    if (!Number.isInteger(i) || !k || !state.accounts[i]) return;
    state.accounts[i][k] = clean(el.value);
  });
  qsa("#energyAccounts [data-acc-addr]").forEach((el) => {
    const i = Number(el.dataset.idx);
    const k = el.dataset.accAddr;
    if (!Number.isInteger(i) || !k || !state.accounts[i]) return;
    state.accounts[i].address[k] = clean(el.value);
  });
}

function addressValue(addr, ...keys) {
  for (const key of keys) {
    const value = clean(addr?.[key]);
    if (value) return value;
  }
  return "";
}

function validateAddress(addr) {
  const cep = onlyDigits(addressValue(addr, "cep"));
  const street = addressValue(addr, "street", "logradouro", "endereco");
  const number = addressValue(addr, "number", "numero");
  const district = addressValue(addr, "district", "bairro");
  const city = addressValue(addr, "city", "cidade");
  const state = addressValue(addr, "state", "uf", "estado");
  return Boolean(cep.length === 8 && street && number && district && city && state);
}

function getPrimaryAddress() {
  return holderType() === "person" ? readAddress("personAddress") : readAddress("companyAddress");
}

function validateStep(step) {
  if (step >= 4) {
    fillPrimaryToFirstUcIfMissing();
    fillPrimaryToAccountsIfMissing();
  }
  if (step === 1 && !clean(id("concessionaria").value)) return "Selecione a concessionaria.";
  if (step === 3) {
    if (holderType() === "person") {
      if (onlyDigits(id("personCpf").value).length !== 11) return "CPF inválido.";
      if (!clean(id("personName").value)) return "Nome obrigatório.";
      if (!clean(id("personBirth").value)) return "Data de nascimento obrigatória.";
      if (!clean(id("personPartner").value)) return "Numero parceiro obrigatório.";
      if (!clean(id("personPhone").value)) return "Telefone obrigatório.";
      if (!clean(id("personEmail").value)) return "Email obrigatório.";
      if (!validateAddress(readAddress("personAddress"))) return "Endereço incompleto.";
    } else {
      if (onlyDigits(id("companyCnpj").value).length !== 14) return "CNPJ inválido.";
      if (!clean(id("companyRazao").value)) return "Razao social obrigatória.";
      if (!clean(id("companyPhone").value)) return "Telefone da empresa obrigatório.";
      if (!clean(id("companyEmail").value)) return "Email da empresa obrigatório.";
      if (!validateAddress(readAddress("companyAddress"))) return "Endereço da empresa incompleto.";
      if (onlyDigits(id("adminCpf").value).length !== 11) return "CPF do administrador inválido.";
      if (!clean(id("adminName").value)) return "Nome do administrador obrigatório.";
      if (!clean(id("adminBirth").value)) return "Data de nascimento do administrador obrigatória.";
      if (!clean(id("adminPhone").value)) return "Telefone do administrador obrigatório.";
      if (!clean(id("adminEmail").value)) return "Email do administrador obrigatório.";
      if (!validateAddress(readAddress("adminAddress"))) return "Endereço do administrador incompleto.";
    }
  }
  if (step === 4) {
    syncAccountsFromDom();
    if (!state.accounts.length) return "Adicione ao menos uma UC.";
    fillPrimaryToAccountsIfMissing();
    const primaryAddress = getPrimaryAddress();
    for (const a of state.accounts) {
      if (!clean(a.personType)) return "Tipo de pessoa da conta obrigatório.";
      if (onlyDigits(a.doc).length < 11) return "CPF/CNPJ da conta inválido.";
      if (!clean(a.name)) return "Nome da conta obrigatório.";
      if (a.personType === "person" && !clean(a.birthDate)) return "Data de nascimento da conta obrigatória.";
      if (!clean(a.uc)) return "Preencha o numero da UC.";
      if (!clean(a.partner)) return "Numero parceiro da conta obrigatório.";
      if (!validateAddress(a.address || {})) {
        if (!validateAddress(primaryAddress || {})) return "Endereço incompleto.";
        a.address = { ...(primaryAddress || {}) };
      }
    }
  }
  if (step === 6) {
    const filled = [clean(id("planSelected").value), clean(id("planAdhesionDate").value), clean(id("planContractedKwh").value)].filter(Boolean).length;
    if (filled < 2) return "Preencha ao menos 2 campos entre Plano, Data de Adesão e kWh Contratado.";
  }
  return "";
}

async function getUserScope(user) {
  const scope = { uid: user.uid, tenantId: user.uid };
  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) { scope.tenantId = adminSnap.docs[0].data().tenantId || scope.tenantId; return scope; }
  const funcQ = query(collection(db, "gcredito_funcionarios"), where("auth_user_id", "==", user.uid), limit(1));
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) scope.tenantId = funcSnap.docs[0].data().tenantId || scope.tenantId;
  return scope;
}

async function uploadOptional(file, key) {
  if (!file) return null;
  const ext = String(file.name || "").toLowerCase();
  if (![".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"].some((x) => ext.endsWith(x))) throw new Error(`Formato inválido: ${file.name}`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`Arquivo acima de 10MB: ${file.name}`);
  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (!isLocalHost) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/uploads/doc", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      throw new Error(body?.error || `Falha no upload do arquivo ${file.name}`);
    }
    const url = body.url ? (body.url.startsWith("http") ? body.url : `${window.location.origin}${body.url}`) : "";
    return { url, path: body.path || url, name: file.name, size: file.size, type: file.type, source: "backend" };
  }
  const safe = String(file.name || "arquivo").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "") || "arquivo";
  const paths = [
    `assinantes_pendentes/${state.scope.tenantId}/${state.scope.uid}/cadastro_assinante/${Date.now()}_${key}_${safe}`,
    `assinantes_pendentes/${state.scope.tenantId}/${state.scope.uid}/${Date.now()}_${key}_${safe}`,
  ];

  let lastError = null;
  for (const storageInstance of storageFallbacks) {
    for (const path of paths) {
      try {
        const fileRef = ref(storageInstance, path);
        await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
        return { url: await getDownloadURL(fileRef), path, name: file.name, size: file.size, type: file.type };
      } catch (error) {
        lastError = error;
        console.error("Falha no upload do arquivo", {
          key,
          name: file.name,
          path,
          bucket: storageInstance.app.options.storageBucket,
          error,
          serverResponse: error?.serverResponse_ || error?.customData || null,
        });
      }
    }
  }

  const code = lastError?.code ? ` (${lastError.code})` : "";
  throw new Error(`Falha ao enviar "${file.name}"${code}. Verifique as regras do Storage ou tente outro arquivo.`);
}

function buildPayload() {
  const person = holderType() === "person";
  const primaryAddress = getPrimaryAddress();
  const ownerDoc = person ? onlyDigits(id("personCpf").value) : onlyDigits(id("companyCnpj").value);
  const ownerName = person ? clean(id("personName").value) : clean(id("companyRazao").value || id("companyFantasy").value);
  const ownerEmail = person ? clean(id("personEmail").value) : clean(id("companyEmail").value);
  const ownerPhone = person ? clean(id("personPhone").value) : clean(id("companyPhone").value);
  const discount = toNumber(id("planDiscountPercent").value || suggestedDiscount());
  const primaryAccount = state.accounts[0] || createAccount();
  const primaryAccountAddress = validateAddress(primaryAccount.address || {})
    ? primaryAccount.address
    : (primaryAddress || primaryAccount.address || {});
  const compensationMode = qsa('input[name="compensationMode"]').find((x) => x.checked)?.value || "autoconsumo-remoto";
  const transfer = transferEnabled() ? {
    enabled: true,
    holderType: clean(id("transferHolderType").value),
    doc: onlyDigits(id("transferDoc").value),
    name: clean(id("transferName").value),
    birthDate: clean(id("transferBirth").value),
    partnerNumber: clean(id("transferPartner").value),
    done: clean(id("transferDone").value) === "yes",
    transferDate: clean(id("transferDate").value),
  } : { enabled: false };

  return {
    concessionaria: clean(id("concessionaria").value || "equatorial-goias"),
    holderType: holderType(),
    status: "active",
    statusLabel: "Ativo",
    name: ownerName,
    cpfCnpj: ownerDoc,
    email: ownerEmail,
    phone: ownerPhone,
    uc: clean(state.accounts[0]?.uc || ""),
    contractedKwh: toNumber(id("planContractedKwh").value),
    discountPercent: discount,
    energy_account: {
      holderType: clean(primaryAccount.personType || holderType()),
      cpfCnpj: onlyDigits(primaryAccount.doc || ownerDoc),
      holderName: clean(primaryAccount.name || ownerName),
      birthDate: clean(primaryAccount.birthDate || ""),
      uc: clean(primaryAccount.uc || ""),
      partnerNumber: clean(primaryAccount.partner || ""),
      address: primaryAccountAddress,
    },
    subscriber: {
      holderType: holderType(),
      fullName: person ? ownerName : "",
      companyName: person ? "" : ownerName,
      cpf: person ? ownerDoc : "",
      cnpj: person ? "" : ownerDoc,
      cpfCnpj: ownerDoc,
      birthDate: person ? id("personBirth").value || "" : "",
      civilStatus: person ? clean(id("personCivil").value) : "",
      profession: person ? clean(id("personJob").value) : "",
      email: ownerEmail,
      phone: ownerPhone,
      partnerNumber: person ? clean(id("personPartner").value) : clean(id("companyPartnerSocio").value),
      razaoSocial: person ? "" : clean(id("companyRazao").value),
      nomeFantasia: person ? "" : clean(id("companyFantasy").value),
      observations: person ? clean(id("personObs").value) : clean(id("companyObs").value),
      address: person ? readAddress("personAddress") : readAddress("companyAddress"),
    },
    administrator: !person ? {
      cpf: onlyDigits(id("adminCpf").value),
      name: clean(id("adminName").value),
      birthDate: id("adminBirth").value || "",
      civilStatus: clean(id("adminCivil").value),
      profession: clean(id("adminJob").value),
      phone: clean(id("adminPhone").value),
      email: clean(id("adminEmail").value),
      address: readAddress("adminAddress"),
    } : null,
    contacts: {
      person: state.personContacts,
      company: state.companyContacts,
    },
    energyAccounts: state.accounts.map((a) => ({
      personType: clean(a.personType),
      cpfCnpj: onlyDigits(a.doc),
      name: clean(a.name),
      birthDate: clean(a.birthDate),
      uc: clean(a.uc),
      partnerNumber: clean(a.partner),
      address: validateAddress(a.address || {}) ? a.address : (primaryAddress || a.address || {}),
    })),
    transfer,
    planContract: {
      planSelected: clean(id("planSelected").value),
      adhesionDate: clean(id("planAdhesionDate").value),
      compensationMode,
      sellerKwh: toNumber(id("planSellerKwh").value),
      contractedKwh: toNumber(id("planContractedKwh").value),
      fidelity: clean(id("planFidelity").value),
      discountPercent: discount,
    },
    planDetails: {
      paysPisCofins: id("detailPisCofins").checked,
      paysFioB: id("detailFioB").checked,
      addDistributorValue: id("detailAddDistributor").checked,
      isExempt: id("detailIsento").checked,
    },
    plan_contract: {
      selectedPlan: clean(id("planSelected").value),
      adhesionDate: clean(id("planAdhesionDate").value),
      compensationMode,
      informedKwh: toNumber(id("planSellerKwh").value),
      contractedKwh: toNumber(id("planContractedKwh").value),
      loyalty: clean(id("planFidelity").value),
      discountPercentage: discount,
    },
    plan_details: {
      selectedPlan: clean(id("planSelected").value),
      adhesionDate: clean(id("planAdhesionDate").value),
      compensationMode,
      informedKwh: toNumber(id("planSellerKwh").value),
      contractedKwh: toNumber(id("planContractedKwh").value),
      loyalty: clean(id("planFidelity").value),
      discountPercentage: discount,
      paysPisAndCofins: id("detailPisCofins").checked,
      paysWireB: id("detailFioB").checked,
      addDistributorValue: id("detailAddDistributor").checked,
      exemptFromPayment: id("detailIsento").checked,
    },
    notifications: state.notifications,
  };
}

function bindEvents() {
  if (!form) return;
  id("prevStepBtn").addEventListener("click", () => { state.step = Math.max(1, state.step - 1); updateStepUI(); });
  id("nextStepBtn").addEventListener("click", () => {
    if (state.step === 3) fillPrimaryToFirstUcIfMissing();
    const err = validateStep(state.step);
    if (err) return alert(err);
    state.step = Math.min(9, state.step + 1);
    updateStepUI();
  });
  id("stepDots").addEventListener("click", (e) => { const b = e.target.closest("[data-dot-step]"); if (!b) return; const t = Number(b.dataset.dotStep); if (t > state.step) { const err = validateStep(state.step); if (err) return alert(err); } state.step = t; updateStepUI(); });

  qsa('input[name="holderType"]').forEach((r) => r.addEventListener("change", () => { toggleStep3(); fillPrimaryToFirstUc(); }));
  id("fillFromStep3Btn").addEventListener("click", fillPrimaryToFirstUc);
  id("addAccountBtn").addEventListener("click", () => { state.accounts.push(createAccount()); renderAccounts(); });
  id("addPersonContactBtn")?.addEventListener("click", () => { state.personContacts.push({ name: "", phone: "", role: "" }); renderContacts("person"); saveDraft(); });
  id("addCompanyContactBtn")?.addEventListener("click", () => { state.companyContacts.push({ name: "", phone: "", role: "" }); renderContacts("company"); saveDraft(); });

  id("energyAccounts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove-account]");
    if (b) {
      const i = Number(b.dataset.removeAccount);
      state.accounts = state.accounts.filter((_, idx) => idx !== i);
      if (!state.accounts.length) state.accounts = [createAccount()];
      renderAccounts();
      return;
    }
    const copyB = e.target.closest("[data-copy-account-address]");
    if (copyB) {
      const i = Number(copyB.dataset.copyAccountAddress);
      state.accounts[i].address = { ...(state.accounts[0]?.address || createAccount().address) };
      renderAccounts();
    }
  });

  id("energyAccounts").addEventListener("input", (e) => {
    const el = e.target;
    const i = Number(el.dataset.idx);
    if (!state.accounts[i]) return;
    if (el.matches("[data-acc]")) {
      const k = el.dataset.acc;
      state.accounts[i][k] = clean(el.value);
      if (k === "personType") {
        if (state.accounts[i].personType === "company") state.accounts[i].birthDate = "";
        renderAccounts();
        return;
      }
      saveDraft();
    }
    if (el.matches("[data-acc-addr]")) {
      const k = el.dataset.accAddr;
      state.accounts[i].address[k] = clean(el.value);
      if (k === "cep") fillCepFromRoot(el.closest(`[data-account-address='${i}']`), onlyDigits(el.value));
      saveDraft();
    }
  });

  form.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.matches("[data-contact]")) return;
    const arr = el.dataset.kind === "person" ? state.personContacts : state.companyContacts;
    const i = Number(el.dataset.idx);
    if (!arr[i]) return;
    arr[i][el.dataset.contact] = clean(el.value);
    saveDraft();
  });

  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove-contact]");
    if (!b) return;
    const [kind, idxRaw] = String(b.dataset.removeContact).split(":");
    const i = Number(idxRaw);
    if (kind === "person") state.personContacts = state.personContacts.filter((_, idx) => idx !== i);
    if (kind === "company") state.companyContacts = state.companyContacts.filter((_, idx) => idx !== i);
    renderContacts(kind);
    saveDraft();
  });

  qsa('input[name="transferRequired"]').forEach((r) => r.addEventListener("change", renderTransfer));
  id("transferHolderType")?.addEventListener("change", renderTransfer);
  id("transferDone")?.addEventListener("change", renderTransfer);

  ["personAddress", "companyAddress", "adminAddress"].forEach((g) => {
    const root = qs(`[data-address='${g}']`);
    root?.addEventListener("change", (e) => { if (e.target.matches("[data-address-field='cep']")) fillCep(g); });
  });

  ["planContractedKwh", "planFidelity", "planDiscountPercent"].forEach((x) => id(x)?.addEventListener("input", () => {
    if (x !== "planDiscountPercent" && (!state.discountTouched || !clean(id("planDiscountPercent").value))) id("planDiscountPercent").value = suggestedDiscount().toFixed(2);
    if (x === "planDiscountPercent") state.discountTouched = true;
    renderSummary();
  }));
  id("planFidelity")?.addEventListener("change", () => {
    if (!state.discountTouched || !clean(id("planDiscountPercent").value)) id("planDiscountPercent").value = suggestedDiscount().toFixed(2);
    renderSummary();
  });
  id("planShowDiscountTable")?.addEventListener("change", () => {
    renderPlanDiscountDemo();
    saveDraft();
  });

  form.addEventListener("change", (e) => {
    if (e.target.matches("input[data-notify-key]")) state.notifications[e.target.dataset.notifyKey] = e.target.checked;
    saveDraft();
  });

  form.addEventListener("input", () => saveDraft());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fillPrimaryToFirstUcIfMissing();
    fillPrimaryToAccountsIfMissing();
    for (let s = 1; s <= 8; s += 1) { const err = validateStep(s); if (err) { state.step = s; updateStepUI(); return alert(err); } }
    id("saveWizardBtn").disabled = true;
    id("saveWizardBtn").textContent = "Salvando...";
    try {
      const payload = buildPayload();
      console.group("[assinante-cadastro] payload");
      console.log("uc:", payload.energy_account?.uc || payload.uc);
      console.log("contractedKwh:", payload.plan_contract?.contractedKwh, payload.contractedKwh);
      console.log("discountPercentage:", payload.plan_contract?.discountPercentage, payload.discountPercent);
      console.log("plan_contract:", payload.plan_contract);
      console.log("plan_details:", payload.plan_details);
      console.groupEnd();
      const uploadErrors = [];
      const uploadSafe = async (file, key, label) => {
        try {
          return await uploadOptional(file, key);
        } catch (err) {
          const reason = err?.message || String(err);
          uploadErrors.push(`${label || file?.name || key}: ${reason}`);
          return null;
        }
      };
      payload.documents = {
        contract: await uploadSafe(id("fileContractRequired")?.files?.[0], "doc_contract", "Contrato"),
        energyBill: await uploadSafe(id("fileEnergyBillRequired")?.files?.[0], "doc_energy_bill", "Conta de energia"),
        cnh: await uploadSafe(id("fileCnh")?.files?.[0], "doc_cnh_rg", "CNH/RG"),
        contractSocial: await uploadSafe(id("fileContractSocial")?.files?.[0], "doc_contrato_social", "Contrato social"),
        procuracao: await uploadSafe(id("fileProcuracao")?.files?.[0], "doc_procuracao", "Procuração"),
        transferProtocol: await uploadSafe(id("fileTransferProtocol")?.files?.[0], "doc_transfer_protocol", "Protocolo de transferência"),
      };
      if (payload.transfer.enabled) {
        payload.transfer.protocol = payload.documents.transferProtocol || null;
      }
      payload.user_id = state.scope.uid;
      payload.tenantId = state.scope.tenantId;
      payload.updated_at = serverTimestamp();
      if (editingId) {
        await updateDoc(doc(db, COLL, editingId), payload);
        console.log("[assinante-cadastro] updateDoc ok", editingId);
      } else {
        payload.created_at = serverTimestamp();
        const docRef = await addDoc(collection(db, COLL), payload);
        console.log("[assinante-cadastro] addDoc ok", docRef.id);
      }
      clearDraft();
      if (uploadErrors.length) {
        alert(`Assinante salvo, mas alguns anexos falharam:\n- ${uploadErrors.join("\n- ")}`);
      } else {
        alert("Assinante salvo com sucesso.");
      }
      window.location.href = "assinantes.html";
    } catch (err) { console.error(err); alert(`Falha ao salvar: ${err.message || "erro inesperado"}`); }
    finally { id("saveWizardBtn").disabled = false; id("saveWizardBtn").textContent = "Salvar Assinante"; }
  });

  id("logoutBtn")?.addEventListener("click", async () => { await signOut(auth); window.location.href = "login.html"; });
}

async function hydrateExisting(data) {
  if (!data) return;
  id("concessionaria").value = data.concessionaria || "equatorial-goias";
  const type = data.holderType || data.subscriber?.holderType || "person";
  const radio = qsa('input[name="holderType"]').find((x) => x.value === type);
  if (radio) radio.checked = true;
  toggleStep3();
  const s = data.subscriber || {};
  id("personCpf").value = applyMask(s.cpf || s.cpfCnpj || "", "cpf");
  id("personPartner").value = s.partnerNumber || "";
  id("personName").value = s.fullName || "";
  id("personBirth").value = s.birthDate || "";
  id("personPhone").value = s.phone || "";
  id("personEmail").value = s.email || "";
  id("personCivil").value = s.civilStatus || "";
  id("personJob").value = s.profession || "";
  id("companyCnpj").value = applyMask(s.cnpj || s.cpfCnpj || "", "cnpj");
  id("companyPartnerSocio").value = s.partnerNumber || "";
  id("companyRazao").value = s.razaoSocial || s.companyName || "";
  id("companyFantasy").value = s.nomeFantasia || "";
  id("companyPhone").value = s.phone || "";
  id("companyEmail").value = s.email || "";
  id("personObs").value = s.observations || "";
  id("companyObs").value = s.observations || "";
  const a = data.administrator || {};
  id("adminCpf").value = applyMask(a.cpf || "", "cpf");
  id("adminName").value = a.name || "";
  id("adminBirth").value = a.birthDate || "";
  id("adminPhone").value = a.phone || "";
  id("adminEmail").value = a.email || "";
  id("adminCivil").value = a.civilStatus || "";
  id("adminJob").value = a.profession || "";
  if (a.address) {
    const root = qs("[data-address='adminAddress']");
    Object.entries(a.address).forEach(([k, v]) => {
      const input = root?.querySelector(`[data-address-field='${k}']`);
      if (input) input.value = v || "";
    });
  }
  const plan = data.plan_contract || data.planContract || {};
  id("planSelected").value = plan.planSelected || "";
  id("planAdhesionDate").value = plan.adhesionDate || "";
  id("planSellerKwh").value = plan.sellerKwh || "";
  id("planContractedKwh").value = plan.contractedKwh || "";
  id("planFidelity").value = plan.fidelity || "none";
  id("planDiscountPercent").value = plan.discountPercentage || plan.discountPercent || data.discountPercent || "";
  const comp = qsa('input[name="compensationMode"]').find((x) => x.value === (plan.compensationMode || "autoconsumo-remoto"));
  if (comp) comp.checked = true;
  const details = data.plan_details || data.planDetails || {};
  id("detailPisCofins").checked = !!(details.paysPisAndCofins ?? details.paysPisCofins);
  id("detailFioB").checked = !!(details.paysWireB ?? details.paysFioB);
  id("detailAddDistributor").checked = !!details.addDistributorValue;
  id("detailIsento").checked = !!(details.exemptFromPayment ?? details.isExempt);
  if (data.transfer?.enabled === true) id("transferRequiredYes").checked = true;
  else id("transferRequiredNo").checked = true;
  id("transferHolderType").value = data.transfer?.holderType || "person";
  id("transferDoc").value = applyMask(data.transfer?.doc || "", "cpfcnpj");
  id("transferName").value = data.transfer?.name || "";
  id("transferBirth").value = data.transfer?.birthDate || "";
  id("transferPartner").value = data.transfer?.partnerNumber || "";
  id("transferDone").value = data.transfer?.done ? "yes" : "no";
  id("transferDate").value = data.transfer?.transferDate || "";
  state.personContacts = Array.isArray(data.contacts?.person) ? data.contacts.person : [];
  state.companyContacts = Array.isArray(data.contacts?.company) ? data.contacts.company : [];
  const energyAccounts = Array.isArray(data.energyAccounts) ? data.energyAccounts : null;
  const energyAccount = data.energy_account || data.energyAccount || null;
  if (energyAccounts && energyAccounts.length) {
    state.accounts = energyAccounts.map((x) => createAccount({
      personType: x.personType || "person",
      doc: applyMask(x.cpfCnpj || "", "cpfcnpj"),
      name: x.name || "",
      birthDate: x.birthDate || "",
      uc: x.uc || "",
      partner: x.partnerNumber || "",
      address: x.address || { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" },
    }));
  } else if (energyAccount) {
    state.accounts = [createAccount({
      personType: energyAccount.holderType || "person",
      doc: applyMask(energyAccount.cpfCnpj || "", "cpfcnpj"),
      name: energyAccount.holderName || "",
      birthDate: energyAccount.birthDate || "",
      uc: energyAccount.uc || "",
      partner: energyAccount.partnerNumber || "",
      address: energyAccount.address || { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" },
    })];
  } else {
    state.accounts = [createAccount()];
  }
  renderAccounts();
  renderContacts("person");
  renderContacts("company");
  renderTransfer();
  toggleAdminBlock();
  renderSummary();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  if (!(token.claims.superadmin === true || role === "superadmin" || !!user.uid)) return (window.location.href = "index.html");

  state.scope = await getUserScope(user);
  bindMasks(document);
  toggleStep3();
  fillPrimaryToFirstUc();
  renderContacts("person");
  renderContacts("company");
  renderNotifications();
  id("planDiscountPercent").value = suggestedDiscount().toFixed(2);
  renderSummary();
  renderTransfer();
  updateStepUI();
  bindEvents();

  if (editingId) {
    const snap = await getDoc(doc(db, COLL, editingId));
    if (snap.exists()) await hydrateExisting(snap.data());
  }
  restoreDraft();
  state.draftReady = true;
  updateStepUI();
});
