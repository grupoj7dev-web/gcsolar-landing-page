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

const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");
const source = params.get("source") || "gcredito_generators";
const TOTAL_STEPS = 7;

const wizardForm = document.getElementById("wizardForm");
const steps = Array.from(document.querySelectorAll(".step"));
const panes = Array.from(document.querySelectorAll(".pane"));
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const saveBtn = document.getElementById("saveBtn");
const validationBar = document.getElementById("validationBar");
const stepLabel = document.getElementById("stepLabel");
const plantsList = document.getElementById("plantsList");
const uploadGrid = document.getElementById("uploadGrid");
const reviewJson = document.getElementById("reviewJson");
const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

const DOCS = [
  { key: "saleContract", label: "Contrato da Venda dos Creditos", req: () => true },
  { key: "cnh", label: "Carteira Nac. de Habilitacao (CNH)", req: () => false },
  { key: "companyContract", label: "Contrato Social da Empresa", req: (t) => t === "company" },
  { key: "energyBill", label: "Comprovante da Conta da Geradora", req: () => true },
  { key: "proxy", label: "Procuração (se aplicavel)", req: () => false },
];

const FACTOR = { GO: 145, MT: 145, MG: 140, SP: 132, BA: 145, PR: 128, RS: 122, SC: 124 };

const state = { plants: [], documents: {} };
let scope = null;
let currentStep = 1;

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

const id = (x) => document.getElementById(x);
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
const digits = (v) => String(v || "").replace(/\D+/g, "");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function show(msg, type = "error") {
  validationBar.textContent = msg;
  validationBar.classList.remove("hidden", "error", "success", "warn");
  validationBar.classList.add(type);
}

function hide() {
  validationBar.classList.add("hidden");
  validationBar.classList.remove("error", "success", "warn");
}

function mask(v, t) {
  const d = digits(v);
  if (t === "cpf") return d.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  if (t === "cnpj") return d.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  if (t === "cpfcnpj") return d.length > 11 ? mask(d, "cnpj") : mask(d, "cpf");
  if (t === "cep") return d.slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
  if (t === "phone") return d.length <= 10 ? d.slice(0, 10).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2") : d.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  return v;
}

function bindMasks(root = document) {
  root.querySelectorAll("[data-mask]").forEach((el) => {
    if (el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    el.addEventListener("input", () => {
      el.value = mask(el.value, el.dataset.mask);
    });
  });
}

toggleSidebarBtn?.addEventListener("click", () => {
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

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

function ownerType() {
  return document.querySelector('input[name="ownerType"]:checked')?.value || "person";
}

function emptyAddress() {
  return { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
}

function readAddress(key) {
  const wrap = document.querySelector(`[data-address="${key}"]`);
  const a = emptyAddress();
  if (!wrap) return a;
  Object.keys(a).forEach((f) => {
    a[f] = clean(wrap.querySelector(`[data-address-field="${f}"]`)?.value || "");
  });
  a.state = a.state.toUpperCase();
  return a;
}

function setAddress(key, a) {
  const wrap = document.querySelector(`[data-address="${key}"]`);
  if (!wrap) return;
  const s = { ...emptyAddress(), ...(a || {}) };
  Object.keys(s).forEach((f) => {
    const el = wrap.querySelector(`[data-address-field="${f}"]`);
    if (el) el.value = s[f] || "";
  });
}

async function fillByCep(key, rawCep) {
  const cep = digits(rawCep);
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return;
    const d = await r.json();
    if (d.erro) return;
    const now = readAddress(key);
    setAddress(key, {
      ...now,
      cep: d.cep || now.cep,
      street: now.street || d.logradouro || "",
      district: now.district || d.bairro || "",
      city: now.city || d.localidade || "",
      state: (now.state || d.uf || "").toUpperCase(),
    });
  } catch {}
}

function createPlant(seed = {}) {
  return {
    basic: { nickname: seed.nickname || "", uc: seed.uc || "", type: "micro", mode: "autoconsumo" },
    holder: { type: seed.holderType || "person", document: seed.document || "", partner: seed.partner || "", name: seed.name || "", birth: seed.birth || "" },
    address: seed.address || emptyAddress(),
    contacts: [{ name: "", phone: "", role: "" }],
    installation: { moduleBrand: "", modulePowerW: 580, moduleQty: 1, totalKwp: 0.58, manualTotal: false, inverters: [{ brand: "", powerKw: 0, qty: 1 }], totalInv: 0, compatible: true, projected: 84 },
    autoSync: true,
  };
}

function ensurePlant() {
  if (!state.plants.length) {
    state.plants.push(createPlant(ownerSeed()));
    recalc(0);
  }
}

function ownerSeed() {
  if (ownerType() === "person") {
    return {
      holderType: "person",
      document: id("ownerCpf").value,
      partner: id("ownerPartnerNumberPf").value,
      name: id("ownerNamePf").value,
      birth: id("ownerBirthPf").value,
      address: readAddress("ownerAddress"),
    };
  }
  return {
    holderType: "company",
    document: id("ownerCnpj").value,
    partner: id("ownerPartnerNumberPj").value,
    name: id("ownerNamePj").value,
    birth: "",
    address: readAddress("ownerAddress"),
  };
}

function recalc(i) {
  const p = state.plants[i];
  if (!p) return;
  const calc = (num(p.installation.modulePowerW) * num(p.installation.moduleQty)) / 1000;
  if (!p.installation.manualTotal) p.installation.totalKwp = Number(calc.toFixed(3));
  if (num(p.installation.totalKwp) > 75) p.basic.type = "mini";
  if (num(p.installation.totalKwp) <= 75 && p.basic.type !== "mini") p.basic.type = "micro";
  p.installation.totalInv = Number(p.installation.inverters.reduce((s, x) => s + num(x.powerKw) * num(x.qty), 0).toFixed(3));
  p.installation.compatible = p.installation.totalInv >= num(p.installation.totalKwp) * 0.9;
  const uf = clean(p.address.state).toUpperCase();
  const factor = FACTOR[uf] || 135;
  p.installation.projected = Number((num(p.installation.totalKwp) * factor).toFixed(2));
}

function ucOk(v) {
  const d = digits(v);
  return d.length >= 6 && d.length <= 12;
}

function plantCard(p, i) {
  const ucBadge = ucOk(p.basic.uc) ? '<span class="mini-badge ok">UC valida</span>' : '<span class="mini-badge warn">validar UC</span>';
  const invBadge = p.installation.compatible ? '<span class="mini-badge ok">Inversores compativeis</span>' : '<span class="mini-badge warn">Alerta amarelo</span>';
  return `
  <article class="plant-card">
    <header class="plant-head"><h3>Usina ${i + 1}</h3><div class="action-row"><button type="button" class="btn-secondary" data-act="dup" data-i="${i}">Duplicar</button><button type="button" class="btn-secondary danger" data-act="del" data-i="${i}">Remover</button></div></header>
    <div class="section-block soft"><h4>Dados Básicos</h4><div class="grid cols-4">
      <label class="field"><span>Apelido *</span><input data-pf="basic.nickname" data-i="${i}" value="${clean(p.basic.nickname)}"></label>
      <label class="field"><span>UC *</span><input data-pf="basic.uc" data-i="${i}" value="${clean(p.basic.uc)}"></label>
      <label class="field"><span>Tipo *</span><select data-pf="basic.type" data-i="${i}"><option value="micro" ${p.basic.type === "micro" ? "selected" : ""}>Micro</option><option value="mini" ${p.basic.type === "mini" ? "selected" : ""}>Mini</option></select></label>
      <label class="field"><span>Modalidade *</span><select data-pf="basic.mode" data-i="${i}"><option value="autoconsumo" ${p.basic.mode === "autoconsumo" ? "selected" : ""}>Autoconsumo</option><option value="geracao_compartilhada" ${p.basic.mode === "geracao_compartilhada" ? "selected" : ""}>Geração Compartilhada</option><option value="mista" ${p.basic.mode === "mista" ? "selected" : ""}>Autoconsumo + Compartilhada</option></select></label>
    </div><div class="badge-row">${ucBadge}</div></div>
    <div class="section-block soft"><h4>Titular da Usina</h4><div class="grid cols-4">
      <label class="field"><span>Tipo *</span><select data-pf="holder.type" data-i="${i}"><option value="person" ${p.holder.type === "person" ? "selected" : ""}>PF</option><option value="company" ${p.holder.type === "company" ? "selected" : ""}>PJ</option></select></label>
      <label class="field"><span>CPF/CNPJ *</span><input data-pf="holder.document" data-mask="cpfcnpj" data-i="${i}" value="${clean(p.holder.document)}"></label>
      <label class="field"><span>Parceiro *</span><input data-pf="holder.partner" data-i="${i}" value="${clean(p.holder.partner)}"></label>
      <label class="field"><span>Nome *</span><input data-pf="holder.name" data-i="${i}" value="${clean(p.holder.name)}"></label>
      <label class="field"><span>Nascimento ${p.holder.type === "person" ? "*" : ""}</span><input type="date" data-pf="holder.birth" data-i="${i}" value="${clean(p.holder.birth)}"></label>
    </div></div>
    <div class="section-block soft"><h4>Endereço da Usina</h4><div class="grid cols-4">
      <label class="field"><span>CEP *</span><div class="inline-field"><input data-pa="cep" data-mask="cep" data-i="${i}" value="${clean(p.address.cep)}"><button type="button" class="btn-secondary" data-act="cep" data-i="${i}">Buscar</button></div></label>
      <label class="field span-2"><span>Rua *</span><input data-pa="street" data-i="${i}" value="${clean(p.address.street)}"></label>
      <label class="field"><span>Numero *</span><input data-pa="number" data-i="${i}" value="${clean(p.address.number)}"></label>
      <label class="field"><span>Complemento</span><input data-pa="complement" data-i="${i}" value="${clean(p.address.complement)}"></label>
      <label class="field"><span>Bairro *</span><input data-pa="district" data-i="${i}" value="${clean(p.address.district)}"></label>
      <label class="field"><span>Cidade *</span><input data-pa="city" data-i="${i}" value="${clean(p.address.city)}"></label>
      <label class="field"><span>Estado *</span><input data-pa="state" data-i="${i}" value="${clean(p.address.state)}"></label>
    </div></div>
    <div class="section-block soft"><h4>Instalacao Fotovoltaica</h4><div class="grid cols-4">
      <label class="field"><span>Marca Modulo *</span><input data-pf="installation.moduleBrand" data-i="${i}" value="${clean(p.installation.moduleBrand)}"></label>
      <label class="field"><span>Potencia Modulo (W) *</span><input type="number" data-pf="installation.modulePowerW" data-i="${i}" value="${num(p.installation.modulePowerW)}"></label>
      <label class="field"><span>Qtd Modulos *</span><input type="number" data-pf="installation.moduleQty" data-i="${i}" value="${num(p.installation.moduleQty)}"></label>
      <label class="field"><span>Potencia Total (kWp)</span><div class="inline-field"><input type="number" data-pf="installation.totalKwp" data-i="${i}" value="${num(p.installation.totalKwp)}"><button type="button" class="btn-secondary" data-act="auto" data-i="${i}">Auto</button></div></label>
    </div><div class="badge-row">${num(p.installation.modulePowerW) === 580 ? '<span class="mini-badge ok">Sugerido 2024</span>' : ''} ${invBadge} <span class="mini-badge ok">Estimado: ${num(p.installation.projected).toLocaleString("pt-BR")} kWh/mes</span></div></div>
    <div class="section-block soft"><div class="dynamic-head"><h4>Inversores</h4><button type="button" class="btn-secondary" data-act="addInv" data-i="${i}">Adicionar</button></div>
      ${(p.installation.inverters || []).map((inv, ii) => `<div class="grid cols-4 dynamic-item"><label class="field"><span>Marca *</span><input data-if="brand" data-i="${i}" data-ii="${ii}" value="${clean(inv.brand)}"></label><label class="field"><span>Potencia (kW) *</span><input type="number" data-if="powerKw" data-i="${i}" data-ii="${ii}" value="${num(inv.powerKw)}"></label><label class="field"><span>Quantidade *</span><input type="number" data-if="qty" data-i="${i}" data-ii="${ii}" value="${num(inv.qty)}"></label><div class="field control-field"><span>Acao</span><button type="button" class="btn-secondary danger" data-act="rmInv" data-i="${i}" data-ii="${ii}">Remover</button></div></div>`).join("")}
    </div>
    <div class="section-block soft"><div class="dynamic-head"><h4>Contatos</h4><button type="button" class="btn-secondary" data-act="addCt" data-i="${i}">Adicionar</button></div>
      ${(p.contacts || []).map((c, ci) => `<div class="grid cols-4 dynamic-item"><label class="field"><span>Nome</span><input data-cf="name" data-i="${i}" data-ci="${ci}" value="${clean(c.name)}"></label><label class="field"><span>Telefone</span><input data-cf="phone" data-mask="phone" data-i="${i}" data-ci="${ci}" value="${clean(c.phone)}"></label><label class="field"><span>Funcao</span><input data-cf="role" data-i="${i}" data-ci="${ci}" value="${clean(c.role)}"></label><div class="field control-field"><span>Acao</span><button type="button" class="btn-secondary danger" data-act="rmCt" data-i="${i}" data-ci="${ci}">Remover</button></div></div>`).join("")}
    </div>
  </article>`;
}

function renderPlants() {
  ensurePlant();
  plantsList.innerHTML = state.plants.map((p, i) => plantCard(p, i)).join("");
  bindMasks(plantsList);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!o[keys[i]] || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function syncOwnerView() {
  const isPf = ownerType() === "person";
  id("ownerPersonBlock").classList.toggle("hidden", !isPf);
  id("ownerCompanyBlock").classList.toggle("hidden", isPf);
  id("adminSection").classList.toggle("hidden", isPf);
  renderUploads();
}

function syncFirstPlant(force = false) {
  ensurePlant();
  const p = state.plants[0];
  if (!p.autoSync && !force) return;
  const s = ownerSeed();
  p.holder.type = s.holderType;
  p.holder.document = s.document;
  p.holder.partner = s.partner;
  p.holder.name = s.name;
  p.holder.birth = s.birth;
  p.address = { ...p.address, ...s.address };
  p.autoSync = true;
  recalc(0);
  renderPlants();
  syncPortal(true);
}

function syncPortal(force = false) {
  const p = state.plants[0];
  if (force || !clean(id("portalUc").value)) id("portalUc").value = p?.basic?.uc || "";
  const doc = ownerType() === "person" ? id("ownerCpf").value : id("ownerCnpj").value;
  if (force || !clean(id("portalDoc").value)) id("portalDoc").value = doc;
  if (ownerType() === "person" && (force || !clean(id("portalBirth").value))) id("portalBirth").value = id("ownerBirthPf").value || "";
}

function renderUploads() {
  const t = ownerType();
  uploadGrid.innerHTML = DOCS.map((d) => {
    const req = d.req(t);
    const info = state.documents[d.key] || {};
    return `<label class="upload-card"><span>${d.label} ${req ? "*" : ""}</span><input type="file" data-doc="${d.key}" accept=".pdf,.jpg,.jpeg,.png" ${req ? "required" : ""}><div class="upload-meta"><small>${clean(info.name) || "Nenhum arquivo"}</small><span class="mini-badge ${info.url ? "ok" : "warn"}">${info.url ? "Enviado" : "Pendente"}</span></div></label>`;
  }).join("");
}

function payload(withMeta = true) {
  const ownerAddress = readAddress("ownerAddress");
  const owner = ownerType() === "person" ? {
    type: "person",
    cpf: digits(id("ownerCpf").value),
    cpfCnpj: digits(id("ownerCpf").value),
    numeroParceiroNegocio: clean(id("ownerPartnerNumberPf").value),
    partnerNumber: clean(id("ownerPartnerNumberPf").value),
    name: clean(id("ownerNamePf").value),
    dataNascimento: id("ownerBirthPf").value || "",
    birthDate: id("ownerBirthPf").value || "",
    telefone: clean(id("ownerPhonePf").value),
    phone: clean(id("ownerPhonePf").value),
    email: clean(id("ownerEmailPf").value),
    observacoes: clean(id("ownerObservations").value),
    observations: clean(id("ownerObservations").value),
    address: {
      cep: digits(ownerAddress.cep),
      endereco: clean(ownerAddress.street),
      numero: clean(ownerAddress.number),
      complemento: clean(ownerAddress.complement),
      bairro: clean(ownerAddress.district),
      cidade: clean(ownerAddress.city),
      estado: clean(ownerAddress.state).toUpperCase(),
      street: clean(ownerAddress.street),
      number: clean(ownerAddress.number),
      complement: clean(ownerAddress.complement),
      district: clean(ownerAddress.district),
      city: clean(ownerAddress.city),
      state: clean(ownerAddress.state).toUpperCase(),
    },
  } : {
    type: "company",
    cnpj: digits(id("ownerCnpj").value),
    cpfCnpj: digits(id("ownerCnpj").value),
    numeroParceiroNegocio: clean(id("ownerPartnerNumberPj").value),
    partnerNumber: clean(id("ownerPartnerNumberPj").value),
    name: clean(id("ownerNamePj").value),
    razaoSocial: clean(id("ownerRazaoSocial").value),
    nomeFantasia: clean(id("ownerNomeFantasia").value),
    telefone: clean(id("ownerPhonePj").value),
    phone: clean(id("ownerPhonePj").value),
    email: clean(id("ownerEmailPj").value),
    observacoes: clean(id("ownerObservations").value),
    observations: clean(id("ownerObservations").value),
    address: {
      cep: digits(ownerAddress.cep),
      endereco: clean(ownerAddress.street),
      numero: clean(ownerAddress.number),
      complemento: clean(ownerAddress.complement),
      bairro: clean(ownerAddress.district),
      cidade: clean(ownerAddress.city),
      estado: clean(ownerAddress.state).toUpperCase(),
      street: clean(ownerAddress.street),
      number: clean(ownerAddress.number),
      complement: clean(ownerAddress.complement),
      district: clean(ownerAddress.district),
      city: clean(ownerAddress.city),
      state: clean(ownerAddress.state).toUpperCase(),
    },
  };

  const plants = state.plants.map((p, i) => {
    recalc(i);
    return {
      apelido: clean(p.basic.nickname),
      uc: clean(p.basic.uc),
      concessionaria: clean(id("concessionaria").value || "Equatorial Goiás"),
      tipoUsina: p.basic.type,
      modalidade: p.basic.mode,
      modalidadeCompensacao: p.basic.mode,
      geracaoProjetada: num(p.installation.projected),
      potenciaTotalUsina: num(p.installation.totalKwp),
      potenciaTotalInversores: num(p.installation.totalInv),
      potenciaTotalUsinaOverride: !!p.installation.manualTotal,
      inverterCompatible: !!p.installation.compatible,
      ownerType: p.holder.type,
      ownerCpfCnpj: digits(p.holder.document),
      ownerNumeroParceiroNegocio: clean(p.holder.partner),
      ownerName: clean(p.holder.name),
      ownerDataNascimento: p.holder.birth || "",
      holder: { type: p.holder.type, cpfCnpj: digits(p.holder.document), partnerNumber: clean(p.holder.partner), name: clean(p.holder.name), birthDate: p.holder.birth || "" },
      address: {
        cep: digits(p.address.cep),
        endereco: clean(p.address.street),
        numero: clean(p.address.number),
        complemento: clean(p.address.complement),
        bairro: clean(p.address.district),
        cidade: clean(p.address.city),
        estado: clean(p.address.state).toUpperCase(),
        street: clean(p.address.street),
        number: clean(p.address.number),
        complement: clean(p.address.complement),
        district: clean(p.address.district),
        city: clean(p.address.city),
        state: clean(p.address.state).toUpperCase(),
      },
      contacts: (p.contacts || []).map((c) => ({ nome: clean(c.name), telefone: clean(c.phone), funcao: clean(c.role), name: clean(c.name), phone: clean(c.phone), role: clean(c.role) })),
      marcaModulo: clean(p.installation.moduleBrand),
      potenciaModulo: num(p.installation.modulePowerW),
      quantidadeModulos: num(p.installation.moduleQty),
      installation: {
        moduleBrand: clean(p.installation.moduleBrand),
        modulePowerW: num(p.installation.modulePowerW),
        moduleQty: num(p.installation.moduleQty),
        totalPowerKwp: num(p.installation.totalKwp),
        projectedGenerationKwh: num(p.installation.projected),
        inverters: (p.installation.inverters || []).map((x) => ({ brand: clean(x.brand), powerKw: num(x.powerKw), quantity: num(x.qty) })),
      },
      inversores: (p.installation.inverters || []).map((x) => ({ marca: clean(x.brand), potencia: num(x.powerKw), quantidade: num(x.qty) })),
    };
  });

  const docs = state.documents || {};
  const mapDoc = (d) => d?.url ? ({
    name: d.name || "",
    size: d.size || 0,
    type: d.type || "",
    storagePath: d.path || "",
    url: d.url || "",
    uploadedAt: d.uploadedAtISO || d.uploadedAt || new Date().toISOString(),
  }) : null;

  const out = {
    concessionaria: clean(id("concessionaria").value || "Equatorial Goiás"), status: clean(id("statusInput").value || "active"), ownerType: ownerType(), owner,
    administrator: ownerType() === "company" ? (() => {
      const a = readAddress("adminAddress");
      return {
        cpf: digits(id("adminCpf").value),
        nome: clean(id("adminName").value),
        name: clean(id("adminName").value),
        dataNascimento: id("adminBirth").value || "",
        birthDate: id("adminBirth").value || "",
        telefone: clean(id("adminPhone").value),
        phone: clean(id("adminPhone").value),
        email: clean(id("adminEmail").value),
        address: {
          cep: digits(a.cep),
          endereco: clean(a.street),
          numero: clean(a.number),
          complemento: clean(a.complement),
          bairro: clean(a.district),
          cidade: clean(a.city),
          estado: clean(a.state).toUpperCase(),
          street: clean(a.street),
          number: clean(a.number),
          complement: clean(a.complement),
          district: clean(a.district),
          city: clean(a.city),
          state: clean(a.state).toUpperCase(),
        },
      };
    })() : null,
    plants,
    distributorLogin: { uc: clean(id("portalUc").value), cpfCnpj: digits(id("portalDoc").value), birthDate: id("portalBirth").value || "" },
    distributor_login: { uc: clean(id("portalUc").value), cpfCnpj: digits(id("portalDoc").value), dataNascimento: id("portalBirth").value || "" },
    paymentData: { favorecido: clean(id("payFavorecido").value), banco: clean(id("payBanco").value), agencia: clean(id("payAgencia").value), conta: clean(id("payConta").value), tipoConta: clean(id("payTipo").value), pix: clean(id("payPix").value) },
    payment_data: { favorecido: clean(id("payFavorecido").value), banco: clean(id("payBanco").value), agencia: clean(id("payAgencia").value), conta: clean(id("payConta").value), tipoConta: clean(id("payTipo").value), pix: clean(id("payPix").value) },
    attachments: {
      contrato: mapDoc(docs.saleContract),
      cnh: mapDoc(docs.cnh),
      contratoSocial: mapDoc(docs.companyContract),
      conta: mapDoc(docs.energyBill),
      procuracao: mapDoc(docs.proxy),
    },
    documents: state.documents,
  };

  if (withMeta) {
    out.user_id = scope.uid;
    out.tenantId = scope.tenantId;
    out.updated_at = serverTimestamp();
  }
  return out;
}

function review() { reviewJson.textContent = JSON.stringify(payload(false), null, 2); }

function stepUI() {
  steps.forEach((x) => x.classList.toggle("active", Number(x.dataset.step) === currentStep));
  panes.forEach((x) => x.classList.toggle("active", Number(x.dataset.pane) === currentStep));
  prevBtn.disabled = currentStep <= 1;
  nextBtn.disabled = currentStep >= TOTAL_STEPS;
  saveBtn.classList.toggle("hidden", currentStep !== TOTAL_STEPS);
  stepLabel.textContent = `Etapa ${currentStep} de ${TOTAL_STEPS}`;
  if (currentStep === TOTAL_STEPS) review();
}

function validAddress(a) {
  return !!(clean(a.cep) && clean(a.street) && clean(a.number) && clean(a.district) && clean(a.city) && clean(a.state));
}

function validate(step) {
  if (step === 1) {
    if (!clean(id("concessionaria").value)) return "Concessionária obrigatória.";
    if (ownerType() === "person") {
      if (digits(id("ownerCpf").value).length !== 11) return "CPF inválido.";
      if (!clean(id("ownerPartnerNumberPf").value) || !clean(id("ownerNamePf").value) || !clean(id("ownerPhonePf").value) || !clean(id("ownerEmailPf").value)) return "Preencha os dados obrigatórios do proprietario PF.";
    } else {
      if (digits(id("ownerCnpj").value).length !== 14) return "CNPJ inválido.";
      if (!clean(id("ownerPartnerNumberPj").value) || !clean(id("ownerNamePj").value) || !clean(id("ownerPhonePj").value) || !clean(id("ownerEmailPj").value)) return "Preencha os dados obrigatórios do proprietario PJ.";
    }
    if (!validAddress(readAddress("ownerAddress"))) return "Endereço do proprietario incompleto.";
  }

  if (step === 3) {
    if (!state.plants.length) return "Adicione ao menos uma usina.";
    for (let i = 0; i < state.plants.length; i += 1) {
      const p = state.plants[i]; recalc(i);
      if (!clean(p.basic.nickname) || !ucOk(p.basic.uc) || !clean(p.holder.document) || !clean(p.holder.partner) || !clean(p.holder.name)) return `Usina ${i + 1} com dados obrigatórios faltando.`;
      if (p.holder.type === "person" && !clean(p.holder.birth)) return `Usina ${i + 1}: nascimento do titular PF obrigatório.`;
      if (!validAddress(p.address)) return `Usina ${i + 1}: endereco incompleto.`;
      if (!clean(p.installation.moduleBrand) || num(p.installation.modulePowerW) <= 0 || num(p.installation.moduleQty) <= 0) return `Usina ${i + 1}: instalacao incompleta.`;
      if (!(p.installation.inverters || []).length) return `Usina ${i + 1}: adicione inversor.`;
      if (p.installation.inverters.some((x) => !clean(x.brand) || num(x.powerKw) <= 0 || num(x.qty) <= 0)) return `Usina ${i + 1}: inversores inválidos.`;
    }
  }

  if (step === 4) {
    if (!clean(id("portalUc").value) || digits(id("portalDoc").value).length < 11) return "Dados de acesso da distribuidora inválidos.";
  }
  if (step === 5) {
    if (!clean(id("payBanco").value) || !clean(id("payAgencia").value) || !clean(id("payConta").value)) return "Preencha banco, agencia e conta.";
  }
  if (step === 6) {
    for (const d of DOCS) if (d.req(ownerType()) && !state.documents[d.key]?.url) return `Documento obrigatório: ${d.label}`;
  }
  return "";
}

async function lookupCnpj(cnpj) {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!r.ok) return null;
    const d = await r.json();
    return { razao: clean(d.razao_social || ""), fantasia: clean(d.nome_fantasia || ""), email: clean(d.email || ""), phone: clean(d.ddd_telefone_1 || d.ddd_telefone_2 || ""), cep: mask(d.cep || "", "cep"), street: clean(d.logradouro || ""), number: clean(d.numero || ""), district: clean(d.bairro || ""), city: clean(d.municipio || ""), state: clean(d.uf || "").toUpperCase(), complement: clean(d.complemento || "") };
  } catch { return null; }
}

async function uploadDoc(file, key) {
  const safe = String(file.name || "arquivo").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").slice(-90);
  const path = `gcredito/generators/temp/${scope.uid}/${Date.now()}_${key}_${safe}`;
  const rf = ref(storage, path);
  await uploadBytes(rf, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(rf);
  state.documents[key] = { key, name: file.name, size: file.size, type: file.type, path, url, uploadedAtISO: new Date().toISOString() };
}

function bind() {
  bindMasks(document);
  id("addPlantBtn").addEventListener("click", () => { state.plants.push(createPlant()); recalc(state.plants.length - 1); renderPlants(); });
  id("syncFirstPlantBtn").addEventListener("click", () => { syncFirstPlant(true); show("Primeira usina sincronizada.", "success"); });

  steps.forEach((b) => b.addEventListener("click", () => {
    const t = Number(b.dataset.step); if (t > currentStep) { const m = validate(currentStep); if (m) return show(m); }
    currentStep = t; stepUI();
  }));
  prevBtn.addEventListener("click", () => { if (currentStep > 1) currentStep -= 1; stepUI(); });
  nextBtn.addEventListener("click", () => { const m = validate(currentStep); if (m) return show(m); if (currentStep < TOTAL_STEPS) currentStep += 1; stepUI(); });

  document.querySelectorAll('input[name="ownerType"]').forEach((x) => x.addEventListener("change", () => { syncOwnerView(); syncFirstPlant(); syncPortal(true); review(); }));

  id("lookupOwnerCpfBtn").addEventListener("click", async () => {
    const cpf = digits(id("ownerCpf").value); if (cpf.length !== 11) return show("CPF inválido para consulta.", "warn");
    const q = query(collection(db, "gcredito_generators"), where("owner.cpfCnpj", "==", cpf), limit(1)); const s = await getDocs(q);
    if (s.empty) return show("Nenhum dado encontrado para esse CPF.", "warn");
    const o = s.docs[0].data()?.owner || {};
    if (o.name) id("ownerNamePf").value = o.name;
    if (o.birthDate) id("ownerBirthPf").value = o.birthDate;
    if (o.phone) id("ownerPhonePf").value = o.phone;
    if (o.email) id("ownerEmailPf").value = o.email;
    syncFirstPlant(); syncPortal(true); show("Dados do CPF preenchidos.", "success");
  });

  id("lookupOwnerCnpjBtn").addEventListener("click", async () => {
    const cnpj = digits(id("ownerCnpj").value); if (cnpj.length !== 14) return show("CNPJ inválido para consulta.", "warn");
    const d = await lookupCnpj(cnpj); if (!d) return show("Não foi possível consultar CNPJ.", "warn");
    id("ownerRazaoSocial").value = d.razao; id("ownerNomeFantasia").value = d.fantasia; if (!id("ownerNamePj").value) id("ownerNamePj").value = d.razao;
    if (d.email) id("ownerEmailPj").value = d.email; if (d.phone) id("ownerPhonePj").value = mask(d.phone, "phone");
    const a = readAddress("ownerAddress"); setAddress("ownerAddress", { ...a, cep: a.cep || d.cep, street: a.street || d.street, number: a.number || d.number, district: a.district || d.district, city: a.city || d.city, state: a.state || d.state, complement: a.complement || d.complement });
    syncFirstPlant(); syncPortal(true); show("Dados do CNPJ preenchidos.", "success");
  });

  id("lookupAdminCpfBtn").addEventListener("click", async () => {
    const cpf = digits(id("adminCpf").value); if (cpf.length !== 11) return show("CPF do admin inválido.", "warn");
    const q = query(collection(db, "gcredito_generators"), where("administrator.cpf", "==", cpf), limit(1)); const s = await getDocs(q);
    if (s.empty) return show("Nenhum dado encontrado para esse CPF de admin.", "warn");
    const a = s.docs[0].data()?.administrator || {}; if (a.name) id("adminName").value = a.name; if (a.birthDate) id("adminBirth").value = a.birthDate; if (a.phone) id("adminPhone").value = a.phone; if (a.email) id("adminEmail").value = a.email;
    show("Dados do administrador preenchidos.", "success");
  });

  document.querySelectorAll("[data-address-lookup]").forEach((b) => b.addEventListener("click", () => fillByCep(b.dataset.addressLookup, readAddress(b.dataset.addressLookup).cep)));

  wizardForm.addEventListener("input", (e) => {
    hide();
    if (["ownerCpf", "ownerCnpj", "ownerNamePf", "ownerNamePj", "ownerBirthPf", "ownerPartnerNumberPf", "ownerPartnerNumberPj"].includes(e.target.id)) { syncFirstPlant(); syncPortal(); }
    if (e.target.closest('[data-address="ownerAddress"]')) syncFirstPlant();
    review();
  });

  plantsList.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const i = Number(b.dataset.i); const p = state.plants[i]; const act = b.dataset.act;
    if (act === "del") { state.plants = state.plants.filter((_, idx) => idx !== i); ensurePlant(); renderPlants(); return; }
    if (act === "dup" && p) { state.plants.splice(i + 1, 0, JSON.parse(JSON.stringify(p))); renderPlants(); return; }
    if (act === "addInv" && p) { p.installation.inverters.push({ brand: "", powerKw: 0, qty: 1 }); recalc(i); renderPlants(); return; }
    if (act === "rmInv" && p) { const ii = Number(b.dataset.ii); p.installation.inverters = p.installation.inverters.filter((_, x) => x !== ii); if (!p.installation.inverters.length) p.installation.inverters = [{ brand: "", powerKw: 0, qty: 1 }]; recalc(i); renderPlants(); return; }
    if (act === "addCt" && p) { p.contacts.push({ name: "", phone: "", role: "" }); renderPlants(); return; }
    if (act === "rmCt" && p) { const ci = Number(b.dataset.ci); p.contacts = p.contacts.filter((_, x) => x !== ci); if (!p.contacts.length) p.contacts = [{ name: "", phone: "", role: "" }]; renderPlants(); return; }
    if (act === "auto" && p) { p.installation.manualTotal = false; recalc(i); renderPlants(); return; }
    if (act === "cep" && p) { await fillByCep("plant", p.address.cep); const f = await (async () => { const c = digits(p.address.cep); if (c.length !== 8) return null; try { const r = await fetch(`https://viacep.com.br/ws/${c}/json/`); if (!r.ok) return null; const d = await r.json(); if (d.erro) return null; return d; } catch { return null; } })(); if (f) { p.address.cep = f.cep || p.address.cep; p.address.street = p.address.street || f.logradouro || ""; p.address.district = p.address.district || f.bairro || ""; p.address.city = p.address.city || f.localidade || ""; p.address.state = (p.address.state || f.uf || "").toUpperCase(); recalc(i); renderPlants(); } }
  });

  plantsList.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-pf]")) {
      const i = Number(t.dataset.i); const p = state.plants[i]; if (!p) return;
      setPath(p, t.dataset.pf, t.type === "number" ? num(t.value) : clean(t.value));
      if (t.dataset.pf === "installation.totalKwp") p.installation.manualTotal = true;
      if (i === 0 && (t.dataset.pf.startsWith("holder.") || t.dataset.pf.startsWith("address."))) p.autoSync = false;
      recalc(i); renderPlants(); syncPortal(); return;
    }
    if (t.matches("[data-pa]")) { const i = Number(t.dataset.i); const p = state.plants[i]; if (!p) return; p.address[t.dataset.pa] = clean(t.value).toUpperCase(); if (t.dataset.pa !== "state") p.address[t.dataset.pa] = clean(t.value); if (i === 0) p.autoSync = false; recalc(i); renderPlants(); return; }
    if (t.matches("[data-if]")) { const i = Number(t.dataset.i); const ii = Number(t.dataset.ii); const p = state.plants[i]; if (!p || !p.installation.inverters[ii]) return; p.installation.inverters[ii][t.dataset.if] = t.type === "number" ? num(t.value) : clean(t.value); recalc(i); renderPlants(); return; }
    if (t.matches("[data-cf]")) { const i = Number(t.dataset.i); const ci = Number(t.dataset.ci); const p = state.plants[i]; if (!p || !p.contacts[ci]) return; p.contacts[ci][t.dataset.cf] = clean(t.value); }
  });

  uploadGrid.addEventListener("change", async (e) => {
    const input = e.target; if (!input.matches("input[data-doc]")) return;
    const file = input.files?.[0]; if (!file) return;
    const okExt = [".pdf", ".jpg", ".jpeg", ".png"].some((x) => String(file.name || "").toLowerCase().endsWith(x));
    if (!okExt) { input.value = ""; return show("Formato inválido. Use PDF/JPG/PNG.", "warn"); }
    if (file.size > 10 * 1024 * 1024) { input.value = ""; return show("Arquivo acima de 10MB.", "warn"); }
    input.disabled = true; show(`Enviando ${file.name}...`, "warn");
    try { await uploadDoc(file, input.dataset.doc); renderUploads(); review(); show(`${file.name} enviado com sucesso.`, "success"); }
    catch (err) { console.error(err); show("Falha no upload."); input.disabled = false; }
  });

  wizardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (let s = 1; s < TOTAL_STEPS; s += 1) { const m = validate(s); if (m) { currentStep = s; stepUI(); return show(m); } }
    saveBtn.disabled = true;
    try {
      const data = payload(true);
      if (editingId) await updateDoc(doc(db, source, editingId), data);
      else { data.created_at = serverTimestamp(); await addDoc(collection(db, "gcredito_generators"), data); }
      show("Geradora salva com sucesso.", "success");
      setTimeout(() => { window.location.href = "geradoras.html"; }, 800);
    } catch (err) { console.error(err); show("Falha ao salvar geradora."); }
    finally { saveBtn.disabled = false; }
  });
}

async function userScope(user) {
  const r = { uid: user.uid, tenantId: user.uid };
  const aq = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const as = await getDocs(aq); if (!as.empty) { const d = as.docs[0].data(); r.tenantId = d.tenantId || r.tenantId; return r; }
  const fq = query(collection(db, "gcredito_funcionarios"), where("auth_user_id", "==", user.uid), limit(1));
  const fs = await getDocs(fq); if (!fs.empty) { const d = fs.docs[0].data(); r.tenantId = d.tenantId || r.tenantId; }
  return r;
}

function fill(data = {}) {
  const owner = data.owner || {};
  id("concessionaria").value = data.concessionaria || "Equatorial Goiás";
  id("statusInput").value = data.status || "active";
  const t = data.ownerType || owner.type || (owner.cnpj ? "company" : "person");
  document.querySelector(`input[name="ownerType"][value="${t}"]`).checked = true;
  syncOwnerView();

  id("ownerCpf").value = mask(owner.cpf || owner.cpfCnpj || "", "cpf");
  id("ownerPartnerNumberPf").value = owner.numeroParceiroNegocio || owner.partnerNumber || "";
  id("ownerNamePf").value = owner.name || owner.fullName || owner.nome || "";
  id("ownerBirthPf").value = owner.dataNascimento || owner.birthDate || "";
  id("ownerPhonePf").value = owner.telefone || owner.phone || "";
  id("ownerEmailPf").value = owner.email || "";

  id("ownerCnpj").value = mask(owner.cnpj || owner.cpfCnpj || "", "cnpj");
  id("ownerPartnerNumberPj").value = owner.numeroParceiroNegocio || owner.partnerNumber || "";
  id("ownerNamePj").value = owner.name || owner.razaoSocial || "";
  id("ownerRazaoSocial").value = owner.razaoSocial || "";
  id("ownerNomeFantasia").value = owner.nomeFantasia || "";
  id("ownerPhonePj").value = owner.telefone || owner.phone || "";
  id("ownerEmailPj").value = owner.email || "";
  id("ownerObservations").value = owner.observacoes || owner.observations || "";

  setAddress("ownerAddress", { cep: owner.address?.cep || "", street: owner.address?.street || owner.address?.endereco || "", number: owner.address?.number || owner.address?.numero || "", complement: owner.address?.complement || owner.address?.complemento || "", district: owner.address?.district || owner.address?.bairro || "", city: owner.address?.city || owner.address?.cidade || "", state: owner.address?.state || owner.address?.estado || "" });

  const adm = data.administrator || {};
  id("adminCpf").value = mask(adm.cpf || "", "cpf"); id("adminName").value = adm.nome || adm.name || ""; id("adminBirth").value = adm.dataNascimento || adm.birthDate || ""; id("adminPhone").value = adm.telefone || adm.phone || ""; id("adminEmail").value = adm.email || "";
  setAddress("adminAddress", { cep: adm.address?.cep || "", street: adm.address?.street || adm.address?.endereco || "", number: adm.address?.number || adm.address?.numero || "", complement: adm.address?.complement || adm.address?.complemento || "", district: adm.address?.district || adm.address?.bairro || "", city: adm.address?.city || adm.address?.cidade || "", state: adm.address?.state || adm.address?.estado || "" });

  state.plants = (Array.isArray(data.plants) ? data.plants : []).map((x) => {
    const holderType = x.holder?.type || x.ownerType || "person";
    const holderDoc = x.holder?.cpfCnpj || x.ownerCpfCnpj || "";
    const holderPartner = x.holder?.partnerNumber || x.ownerNumeroParceiroNegocio || "";
    const holderName = x.holder?.name || x.ownerName || "";
    const holderBirth = x.holder?.birthDate || x.ownerDataNascimento || "";
    const p = createPlant({
      nickname: x.apelido || "",
      uc: x.uc || "",
      holderType,
      document: mask(holderDoc, "cpfcnpj"),
      partner: holderPartner || "",
      name: holderName || "",
      birth: holderBirth || "",
      address: {
        cep: x.address?.cep || "",
        street: x.address?.endereco || x.address?.street || "",
        number: x.address?.numero || x.address?.number || "",
        complement: x.address?.complemento || x.address?.complement || "",
        district: x.address?.bairro || x.address?.district || "",
        city: x.address?.cidade || x.address?.city || "",
        state: x.address?.estado || x.address?.state || "",
      },
    });
    p.basic.type = x.tipoUsina || "micro";
    p.basic.mode = x.modalidadeCompensacao || x.modalidade || "autoconsumo";
    p.contacts = Array.isArray(x.contacts) && x.contacts.length
      ? x.contacts.map((c) => ({ name: c.nome || c.name || "", phone: c.telefone || c.phone || "", role: c.funcao || c.role || "" }))
      : [{ name: "", phone: "", role: "" }];
    p.installation.moduleBrand = x.marcaModulo || x.installation?.moduleBrand || "";
    p.installation.modulePowerW = x.potenciaModulo || x.installation?.modulePowerW || 580;
    p.installation.moduleQty = x.quantidadeModulos || x.installation?.moduleQty || 1;
    p.installation.totalKwp = x.potenciaTotalUsina || x.installation?.totalPowerKwp || 0;
    p.installation.projected = x.geracaoProjetada || x.installation?.projectedGenerationKwh || 0;
    if (Array.isArray(x.inversores) && x.inversores.length) {
      p.installation.inverters = x.inversores.map((ii) => ({ brand: ii.marca || "", powerKw: num(ii.potencia), qty: num(ii.quantidade) || 1 }));
    } else if (Array.isArray(x.installation?.inverters) && x.installation.inverters.length) {
      p.installation.inverters = x.installation.inverters.map((ii) => ({ brand: ii.brand || "", powerKw: num(ii.powerKw), qty: num(ii.quantity) || 1 }));
    } else {
      p.installation.inverters = [{ brand: "", powerKw: 0, qty: 1 }];
    }
    p.installation.manualTotal = !!x.potenciaTotalUsinaOverride;
    p.autoSync = false;
    recalc(0);
    return p;
  });
  ensurePlant(); state.plants.forEach((_, i) => recalc(i)); renderPlants();

  const login = data.distributorLogin || data.distributor_login || {};
  id("portalUc").value = login.uc || "";
  id("portalDoc").value = mask(login.cpfCnpj || "", "cpfcnpj");
  id("portalBirth").value = login.birthDate || login.dataNascimento || "";

  const pay = data.paymentData || data.payment_data || {};
  id("payFavorecido").value = pay.favorecido || "";
  id("payBanco").value = pay.banco || "";
  id("payAgencia").value = pay.agencia || "";
  id("payConta").value = pay.conta || "";
  id("payTipo").value = pay.tipoConta || "";
  id("payPix").value = pay.pix || "";

  if (data.documents) {
    state.documents = data.documents;
  } else if (data.attachments) {
    const at = data.attachments || {};
    const back = (d, key) => d ? ({
      key,
      name: d.name || "",
      size: d.size || 0,
      type: d.type || "",
      path: d.storagePath || "",
      url: d.url || "",
      uploadedAtISO: d.uploadedAt || "",
    }) : null;
    state.documents = {
      saleContract: back(at.contrato, "saleContract"),
      cnh: back(at.cnh, "cnh"),
      companyContract: back(at.contratoSocial, "companyContract"),
      energyBill: back(at.conta, "energyBill"),
      proxy: back(at.procuracao, "proxy"),
    };
  } else {
    state.documents = {};
  }
  renderUploads();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  const ok = token.claims.superadmin === true || role === "superadmin" || !!user.uid;
  if (!ok) return (window.location.href = "index.html");

  scope = await userScope(user);
  initTheme();
  applySidebarState();
  ensurePlant(); state.plants.forEach((_, i) => recalc(i));
  syncOwnerView(); renderPlants(); renderUploads(); syncPortal(true); bind();

  if (editingId) {
    id("wizardTitle").textContent = "Editar Geradora";
    id("wizardSubtitle").textContent = "Atualize os dados completos da geradora.";
    const snap = await getDoc(doc(db, source, editingId));
    if (snap.exists()) fill(snap.data());
  }

  stepUI(); review();
});
