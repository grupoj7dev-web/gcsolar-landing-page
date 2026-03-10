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
  getDocs,
  getFirestore,
  limit,
  query,
  where,
  writeBatch,
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
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

const modeButtons = Array.from(document.querySelectorAll("[data-view-mode]"));
const newRateioView = document.getElementById("newRateioView");
const historyRateioView = document.getElementById("historyRateioView");
const rateioMain = document.querySelector(".rateio-main");

const rateioUpdatedAt = document.getElementById("rateioUpdatedAt");
const reloadBtn = document.getElementById("reloadBtn");
const saveRateioBtn = document.getElementById("saveRateioBtn");

const generatorSelect = document.getElementById("generatorSelect");
const generationExpectedInput = document.getElementById("generationExpectedInput");
const generatorInfoCard = document.getElementById("generatorInfoCard");
const generatorInfoTitle = document.getElementById("generatorInfoTitle");
const generatorInfoConcessionaria = document.getElementById("generatorInfoConcessionaria");
const generatorInfoNickname = document.getElementById("generatorInfoNickname");
const generatorInfoUc = document.getElementById("generatorInfoUc");
const generatorInfoProjected = document.getElementById("generatorInfoProjected");
const generatorInfoDoc = document.getElementById("generatorInfoDoc");

const subscriberSearchInput = document.getElementById("subscriberSearchInput");
const subscriberSelect = document.getElementById("subscriberSelect");
const addSubscriberBtn = document.getElementById("addSubscriberBtn");

const rateioTypeButtons = Array.from(document.querySelectorAll("[data-rateio-type]"));
const allocationHeader = document.getElementById("allocationHeader");
const linkedSubscribersBody = document.getElementById("linkedSubscribersBody");
const summaryLinkedCount = document.getElementById("summaryLinkedCount");
const summaryTotalPercentage = document.getElementById("summaryTotalPercentage");

const validationBar = document.getElementById("validationBar");

const historySearchInput = document.getElementById("historySearchInput");
const historyTypeFilter = document.getElementById("historyTypeFilter");
const historyCountText = document.getElementById("historyCountText");
const historyListContainer = document.getElementById("historyListContainer");

const confirmModal = document.getElementById("confirmModal");
const confirmModalText = document.getElementById("confirmModalText");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmAddBtn = document.getElementById("confirmAddBtn");

let scope = null;
let generators = [];
let subscribers = [];
let existingLinks = [];
let historyEntries = [];

let selectedGenerator = null;
let linkedSubscribers = [];
let pendingSubscriberToAdd = null;
let rateioType = "percentage";
let currentViewMode = "new";

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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numberFmt(value, fractionDigits = 2) {
  return toNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleString("pt-BR");
}

function belongsToScope(data, userScope) {
  const userId = String(data.user_id || data.uid || "");
  const tenantId = String(data.tenantId || data.tenant_id || "");
  if (tenantId && tenantId === userScope.tenantId) return true;
  if (userId && userId === userScope.uid) return true;
  return false;
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

function parseSubscriber(data, id) {
  const subscriber = data.subscriber || {};
  const energy = data.energy_account || {};
  const plan = data.plan_contract || data.plan_details || {};

  const cpfCnpj = energy.cpfCnpj || subscriber.cpf || subscriber.cnpj || "";
  const name =
    subscriber.fullName ||
    subscriber.companyName ||
    energy.holderName ||
    data.subscriber_name ||
    "Sem nome";

  return {
    id,
    name,
    cpfCnpj,
    uc: String(energy.uc || ""),
    concessionaria: String(data.concessionaria || ""),
    contractedKwh: toNumber(plan.contractedKwh),
    status: String(data.status || "active"),
  };
}

function flattenGenerators(list, source) {
  const flat = [];
  list.forEach((item) => {
    const plants = Array.isArray(item.plants) && item.plants.length > 0 ? item.plants : [null];
    plants.forEach((plant, plantIndex) => {
      const owner = item.owner || {};
      const distributorLogin = item.distributor_login || item.distributorLogin || {};
      flat.push({
        key: `${source}:${item.id}:${plantIndex}`,
        source,
        generatorId: item.id,
        plantIndex,
        nickname: plant?.apelido || owner.nome || owner.name || `Geradora ${item.id}`,
        uc: String(plant?.uc || distributorLogin.uc || ""),
        projectedGeneration: toNumber(plant?.geracaoProjetada || item.geracaoProjetada || 0),
        concessionaria: String(plant?.concessionaria || item.concessionaria || ""),
        modalidade: String(plant?.modalidade || item.modalidade || ""),
        gdType: String(item.gd_type || plant?.gd_type || "compartilhada"),
        document: owner.cpfCnpj || distributorLogin.cpfCnpj || "",
      });
    });
  });
  return flat;
}

async function loadBaseData() {
  rateioUpdatedAt.textContent = "Carregando dados de rateio...";

  const [
    gcreditoGeneratorsSnap,
    generatorsSnap,
    subscribersSnap,
    linksSnap,
    historySnap,
  ] = await Promise.all([
    getDocs(collection(db, "gcredito_generators")),
    getDocs(collection(db, "generators")),
    getDocs(collection(db, "gcredito_subscribers")),
    getDocs(collection(db, "generator_subscribers")),
    getDocs(collection(db, "gcredito_rateio_history")),
  ]);

  const gcreditoGenerators = gcreditoGeneratorsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope));
  const oldGenerators = generatorsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope));

  generators = [...flattenGenerators(gcreditoGenerators, "gcredito_generators"), ...flattenGenerators(oldGenerators, "generators")]
    .filter((x) => x.uc || x.nickname)
    .sort((a, b) => `${a.nickname} ${a.uc}`.localeCompare(`${b.nickname} ${b.uc}`, "pt-BR"));

  subscribers = subscribersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope))
    .map((d) => parseSubscriber(d, d.id));

  existingLinks = linksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  historyEntries = historySnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => belongsToScope(d, scope))
    .sort((a, b) => (asDate(b.created_at)?.getTime() || 0) - (asDate(a.created_at)?.getTime() || 0));

  renderGeneratorOptions();
  renderSubscriberOptions();
  renderHistory();
  rateioUpdatedAt.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}`;
}

function setViewMode(mode) {
  currentViewMode = mode === "history" ? "history" : "new";
  const history = currentViewMode === "history";

  newRateioView.classList.toggle("hidden", history);
  historyRateioView.classList.toggle("hidden", !history);
  saveRateioBtn.classList.toggle("hidden", history);
  rateioMain?.classList.toggle("history-mode", history);

  modeButtons.forEach((btn) => {
    const active = btn.dataset.viewMode === currentViewMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderGeneratorOptions() {
  const options = ['<option value="">Selecione uma geradora...</option>'];
  generators.forEach((g) => {
    const label = `${g.nickname || "Geradora"} ${g.uc ? `- UC ${g.uc}` : ""}`.trim();
    options.push(`<option value="${g.key}">${label}</option>`);
  });
  generatorSelect.innerHTML = options.join("");
}

function getLinksForSelectedGenerator() {
  if (!selectedGenerator) return [];
  return existingLinks.filter((link) => {
    if (!link || !link.generator_id) return false;
    const sameGenerator = String(link.generator_id) === String(selectedGenerator.generatorId);
    const inScope = belongsToScope(link, scope);
    return sameGenerator && inScope;
  });
}

function mountLinkedSubscribersFromExisting() {
  const links = getLinksForSelectedGenerator();
  let ignoredBrokenLinks = 0;

  linkedSubscribers = links
    .map((link) => {
      const sub = subscribers.find((s) => String(s.id) === String(link.subscriber_id));
      if (!sub) {
        ignoredBrokenLinks += 1;
        return null;
      }
      return {
        subscriberId: link.subscriber_id,
        name: sub.name,
        uc: sub.uc || "-",
        cpfCnpj: sub.cpfCnpj || "-",
        contractedKwh: toNumber(sub.contractedKwh),
        concessionaria: sub.concessionaria || "",
        percentage: toNumber(link.percentage),
        priority: toNumber(link.priority),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  if (ignoredBrokenLinks > 0) {
    showValidation(
      `${ignoredBrokenLinks} vínculo(s) antigo(s) foram ignorados porque o assinante não existe mais.`,
      "error"
    );
  }

  return ignoredBrokenLinks;
}

function availableSubscribers() {
  if (!selectedGenerator) return [];
  const selectedConcessionaria = normalizeText(selectedGenerator.concessionaria);
  const linkedIds = new Set(linkedSubscribers.map((x) => String(x.subscriberId)));
  const search = normalizeText(subscriberSearchInput.value);

  return subscribers
    .filter((sub) => {
      if (linkedIds.has(String(sub.id))) return false;
      if (normalizeText(sub.status).includes("inativ")) return false;
      const subscriberConcessionaria = normalizeText(sub.concessionaria);
      const matchConcessionaria = !selectedConcessionaria || subscriberConcessionaria === selectedConcessionaria;
      if (!matchConcessionaria) return false;
      if (!search) return true;
      const haystack = normalizeText(`${sub.name} ${sub.cpfCnpj} ${sub.uc}`);
      return haystack.includes(search);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function renderSubscriberOptions() {
  const list = availableSubscribers();

  if (!selectedGenerator) {
    subscriberSelect.innerHTML = '<option value="">Selecione uma geradora primeiro...</option>';
    subscriberSelect.disabled = true;
    addSubscriberBtn.disabled = true;
    return;
  }

  if (list.length === 0) {
    subscriberSelect.innerHTML = '<option value="">Nenhum assinante encontrado para este filtro.</option>';
    subscriberSelect.disabled = true;
    addSubscriberBtn.disabled = true;
    return;
  }

  const options = ['<option value="">Selecione um assinante...</option>'];
  list.forEach((sub) => {
    options.push(
      `<option value="${sub.id}">${sub.name} - UC ${sub.uc || "-"} - ${numberFmt(sub.contractedKwh)} kWh</option>`
    );
  });

  subscriberSelect.innerHTML = options.join("");
  subscriberSelect.disabled = false;
  addSubscriberBtn.disabled = false;
}

function renderGeneratorInfo() {
  if (!selectedGenerator) {
    generatorInfoCard.classList.add("hidden");
    return;
  }
  generatorInfoCard.classList.remove("hidden");
  generatorInfoTitle.textContent = selectedGenerator.nickname || "Geradora";
  generatorInfoConcessionaria.textContent =
    selectedGenerator.concessionaria || "Concessionária não informada";
  generatorInfoNickname.textContent = selectedGenerator.nickname || "-";
  generatorInfoUc.textContent = selectedGenerator.uc || "-";
  generatorInfoProjected.textContent = `${numberFmt(selectedGenerator.projectedGeneration)} kWh/mês`;
  generatorInfoDoc.textContent = selectedGenerator.document || "-";
}

function renderRateioTypeUI() {
  rateioTypeButtons.forEach((btn) => {
    const active = btn.dataset.rateioType === rateioType;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  allocationHeader.textContent = rateioType === "percentage" ? "Cota (%)" : "Prioridade";
  summaryTotalPercentage.style.display = rateioType === "percentage" ? "inline-flex" : "none";
}

function recalculateSummary() {
  summaryLinkedCount.textContent = `${linkedSubscribers.length} vinculados`;
  const totalPct = linkedSubscribers.reduce((sum, item) => sum + toNumber(item.percentage), 0);
  summaryTotalPercentage.textContent = `Soma: ${numberFmt(totalPct, 2)}%`;
}

function getGenerationExpected() {
  return toNumber(generationExpectedInput.value);
}

function renderLinkedSubscribersTable(focusTarget = null) {
  renderRateioTypeUI();
  recalculateSummary();

  if (!linkedSubscribers.length) {
    linkedSubscribersBody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum assinante vinculado.</td></tr>';
    return;
  }

  const generationExpected = getGenerationExpected();
  const rows = linkedSubscribers.map((item, index) => {
    const estimated = rateioType === "percentage"
      ? `${numberFmt((generationExpected * toNumber(item.percentage)) / 100)} kWh`
      : "Definido pela ordem";

    const allocationInput = rateioType === "percentage"
      ? `<input type="number" class="rateio-input" min="0" max="100" step="0.01" data-field="percentage" data-id="${item.subscriberId}" value="${toNumber(item.percentage)}">`
      : `<input type="number" class="rateio-input" min="1" step="1" data-field="priority" data-id="${item.subscriberId}" value="${toNumber(item.priority) || index + 1}">`;

    return `
      <tr>
        <td>
          <div class="subscriber-cell">
            <strong>${item.name}</strong>
            <span>${item.cpfCnpj}</span>
          </div>
        </td>
        <td>${item.uc || "-"}</td>
        <td>${numberFmt(item.contractedKwh)} kWh</td>
        <td>${allocationInput}</td>
        <td><span class="energy-estimate">${estimated}</span></td>
        <td>
          <button type="button" class="remove-btn" data-remove-id="${item.subscriberId}">
            <i class="ph ph-trash"></i> Remover
          </button>
        </td>
      </tr>
    `;
  });

  linkedSubscribersBody.innerHTML = rows.join("");

  if (focusTarget?.subscriberId && focusTarget?.field) {
    const selector = `input[data-field="${focusTarget.field}"][data-id="${focusTarget.subscriberId}"]`;
    const inputToFocus = linkedSubscribersBody.querySelector(selector);
    if (inputToFocus) {
      inputToFocus.focus();
      const cursorPos = Number.isFinite(focusTarget.cursorPos) ? focusTarget.cursorPos : null;
      if (cursorPos !== null && typeof inputToFocus.setSelectionRange === "function") {
        const safePos = Math.max(0, Math.min(cursorPos, inputToFocus.value.length));
        inputToFocus.setSelectionRange(safePos, safePos);
      }
    }
  }
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

function validateRateio() {
  if (!selectedGenerator) {
    return { ok: false, message: "Selecione uma geradora para salvar o rateio." };
  }
  if (linkedSubscribers.length === 0) {
    return { ok: false, message: "Erro: adicione pelo menos um assinante antes de salvar." };
  }

  if (rateioType === "percentage") {
    const sumCents = linkedSubscribers.reduce(
      (sum, item) => sum + Math.round(toNumber(item.percentage) * 100),
      0
    );
    if (sumCents !== 10000) {
      const currentPct = (sumCents / 100).toFixed(2).replace(".", ",");
      return {
        ok: false,
        message: `Erro: a soma das cotas deve ser exatamente 100,00%. Soma atual: ${currentPct}%.`,
      };
    }
  }

  if (rateioType === "priority") {
    const priorities = linkedSubscribers.map((item) => Math.trunc(toNumber(item.priority)));
    if (priorities.some((p) => p < 1)) {
      return { ok: false, message: "Erro: prioridades devem iniciar em 1 e ser positivas." };
    }
    const sorted = [...priorities].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] !== i + 1) {
        return {
          ok: false,
          message: "Erro: prioridades devem seguir sequência exata 1, 2, 3... sem repetição.",
        };
      }
    }
  }
  return { ok: true };
}

function buildLinkPayload(item, nowIso) {
  return {
    created_at: nowIso,
    updated_at: nowIso,
    gd_type: selectedGenerator.gdType || "compartilhada",
    generator_id: selectedGenerator.generatorId,
    is_active: true,
    modalidade: selectedGenerator.modalidade || "compensacao",
    percentage: rateioType === "percentage" ? toNumber(item.percentage) : 0,
    priority: rateioType === "priority" ? Math.trunc(toNumber(item.priority)) : 0,
    subscriber_id: item.subscriberId,
    tenantId: scope.tenantId,
    user_id: scope.uid,
  };
}

function buildHistoryPayload(nowIso) {
  const generationExpected = getGenerationExpected();
  const allocations = linkedSubscribers.map((item) => {
    const percentage = rateioType === "percentage" ? toNumber(item.percentage) : 0;
    return {
      subscriber_id: item.subscriberId,
      name: item.name || "-",
      uc: item.uc || "-",
      cpfCnpj: item.cpfCnpj || "-",
      contractedKwh: toNumber(item.contractedKwh),
      percentage,
      priority: rateioType === "priority" ? Math.trunc(toNumber(item.priority)) : 0,
      estimated_kwh: rateioType === "percentage" ? (generationExpected * percentage) / 100 : null,
    };
  });

  return {
    created_at: nowIso,
    tenantId: scope.tenantId,
    user_id: scope.uid,
    generator: {
      id: selectedGenerator.generatorId,
      source: selectedGenerator.source,
      nickname: selectedGenerator.nickname || "-",
      uc: selectedGenerator.uc || "-",
      concessionaria: selectedGenerator.concessionaria || "-",
      document: selectedGenerator.document || "-",
    },
    rateio_type: rateioType,
    generation_expected_kwh: generationExpected,
    total_linked: linkedSubscribers.length,
    total_percentage: allocations.reduce((sum, item) => sum + toNumber(item.percentage), 0),
    allocations,
  };
}

async function saveRateio() {
  const validation = validateRateio();
  if (!validation.ok) {
    showValidation(validation.message, "error");
    return;
  }

  saveRateioBtn.disabled = true;
  saveRateioBtn.textContent = "Salvando...";
  const nowIso = new Date().toISOString();

  try {
    const linksToReplace = getLinksForSelectedGenerator();
    const batch = writeBatch(db);

    linksToReplace.forEach((link) => {
      batch.delete(doc(db, "generator_subscribers", link.id));
    });

    linkedSubscribers.forEach((item) => {
      const newRef = doc(collection(db, "generator_subscribers"));
      batch.set(newRef, buildLinkPayload(item, nowIso));
    });

    await batch.commit();
    await addDoc(collection(db, "gcredito_rateio_history"), buildHistoryPayload(nowIso));

    showValidation("Rateio salvo com sucesso e histórico registrado.", "success");
    await loadBaseData();
    const selectedKey = selectedGenerator?.key;
    if (selectedKey) {
      selectedGenerator = generators.find((g) => g.key === selectedKey) || null;
      if (selectedGenerator) {
        generatorSelect.value = selectedKey;
        mountLinkedSubscribersFromExisting();
      }
    }
    renderGeneratorInfo();
    renderSubscriberOptions();
    renderLinkedSubscribersTable();
    renderHistory();
  } catch (error) {
    console.error("Erro ao salvar rateio:", error);
    showValidation("Falha ao salvar rateio. Tente novamente.", "error");
  } finally {
    saveRateioBtn.disabled = false;
    saveRateioBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Rateio';
  }
}

function renderHistory() {
  const search = normalizeText(historySearchInput.value);
  const type = historyTypeFilter.value || "all";

  const filtered = historyEntries.filter((entry) => {
    if (type !== "all" && entry.rateio_type !== type) return false;
    if (!search) return true;
    const generator = entry.generator || {};
    const allocations = Array.isArray(entry.allocations) ? entry.allocations : [];
    const people = allocations.map((a) => `${a.name} ${a.uc} ${a.cpfCnpj}`).join(" ");
    const haystack = normalizeText(
      `${generator.nickname} ${generator.uc} ${generator.concessionaria} ${generator.document} ${people}`
    );
    return haystack.includes(search);
  });

  historyCountText.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;

  if (!filtered.length) {
    historyListContainer.innerHTML = '<p class="empty-row">Nenhum histórico encontrado.</p>';
    return;
  }

  const cards = filtered.map((entry) => {
    const generator = entry.generator || {};
    const allocations = Array.isArray(entry.allocations) ? entry.allocations : [];
    const typeLabel = entry.rateio_type === "priority" ? "Por Prioridade" : "Por Porcentagem";
    const typeClass = entry.rateio_type === "priority" ? "type-priority" : "type-percentage";

    const rows = allocations.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.name || "-"}</td>
        <td>${item.uc || "-"}</td>
        <td>${item.cpfCnpj || "-"}</td>
        <td>${numberFmt(item.contractedKwh)} kWh</td>
        <td>${entry.rateio_type === "percentage" ? `${numberFmt(item.percentage)}%` : "-"}</td>
        <td>${entry.rateio_type === "priority" ? item.priority || "-" : "-"}</td>
        <td>${item.estimated_kwh != null ? `${numberFmt(item.estimated_kwh)} kWh` : "-"}</td>
      </tr>
    `);

    return `
      <article class="history-item">
        <div class="history-item-head">
          <div>
            <h3>${generator.nickname || "Geradora"} ${generator.uc ? `- UC ${generator.uc}` : ""}</h3>
            <p class="history-item-sub">
              ${generator.concessionaria || "-"} â€¢ ${formatDateTime(entry.created_at)}
            </p>
          </div>
          <div class="history-item-actions">
            <div class="history-pills">
              <span class="history-pill ${typeClass}">${typeLabel}</span>
              <span class="history-pill">${entry.total_linked || allocations.length} vinculados</span>
              <span class="history-pill">Geração: ${numberFmt(entry.generation_expected_kwh)} kWh</span>
              <span class="history-pill">Soma: ${numberFmt(entry.total_percentage)}%</span>
            </div>
            <button type="button" class="btn-secondary clone-rateio-btn" data-clone-history-id="${entry.id}">
              <i class="ph ph-copy"></i>
              Clonar rateio
            </button>
          </div>
        </div>
        <div class="history-item-table-wrap">
          <table class="history-item-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Assinante</th>
                <th>UC</th>
                <th>CPF/CNPJ</th>
                <th>Consumo</th>
                <th>Porcentagem</th>
                <th>Prioridade</th>
                <th>Energia Estimada</th>
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>
      </article>
    `;
  });

  historyListContainer.innerHTML = cards.join("");
}

function findGeneratorFromHistory(entry) {
  const generator = entry?.generator || {};
  const targetId = String(generator.id || "");
  const targetSource = String(generator.source || "");
  const targetUc = normalizeText(generator.uc);
  const targetNickname = normalizeText(generator.nickname);

  const byIdAndSource = generators.find((item) => {
    const sameId = String(item.generatorId || "") === targetId;
    const sameSource = !targetSource || String(item.source || "") === targetSource;
    return sameId && sameSource;
  });
  if (byIdAndSource) return byIdAndSource;

  return generators.find((item) => {
    const ucMatch = targetUc && normalizeText(item.uc) === targetUc;
    const nicknameMatch = targetNickname && normalizeText(item.nickname) === targetNickname;
    return ucMatch || nicknameMatch;
  }) || null;
}

function cloneFromHistory(entryId) {
  const entry = historyEntries.find((item) => String(item.id) === String(entryId));
  if (!entry) {
    showValidation("Não foi possível localizar o histórico selecionado para clonagem.", "error");
    return;
  }

  const generator = findGeneratorFromHistory(entry);
  if (!generator) {
    showValidation("Geradora do histórico não encontrada. Atualize os dados e tente novamente.", "error");
    return;
  }

  selectedGenerator = generator;
  generatorSelect.value = generator.key;
  generationExpectedInput.value = toNumber(entry.generation_expected_kwh || generator.projectedGeneration);
  rateioType = entry.rateio_type === "priority" ? "priority" : "percentage";

  const allocations = Array.isArray(entry.allocations) ? entry.allocations : [];
  linkedSubscribers = allocations.map((allocation, index) => {
    const subscriber = subscribers.find((item) => String(item.id) === String(allocation.subscriber_id));
    return {
      subscriberId: allocation.subscriber_id,
      name: subscriber?.name || allocation.name || "Assinante",
      uc: subscriber?.uc || allocation.uc || "-",
      cpfCnpj: subscriber?.cpfCnpj || allocation.cpfCnpj || "-",
      contractedKwh: toNumber(subscriber?.contractedKwh || allocation.contractedKwh),
      concessionaria: subscriber?.concessionaria || selectedGenerator.concessionaria || "",
      percentage: toNumber(allocation.percentage),
      priority: Math.trunc(toNumber(allocation.priority) || index + 1),
    };
  });

  setViewMode("new");
  renderGeneratorInfo();
  renderSubscriberOptions();
  renderLinkedSubscribersTable();
  showValidation("Clone carregado. Ajuste os dados e clique em Salvar Rateio para criar um novo histórico.", "success");
}

function openConfirmModal(subscriber) {
  pendingSubscriberToAdd = subscriber;
  confirmModalText.textContent =
    `Vincular ${subscriber.name} (UC ${subscriber.uc || "-"}) com consumo contratado de ${numberFmt(subscriber.contractedKwh)} kWh?`;
  confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  confirmModal.classList.add("hidden");
  pendingSubscriberToAdd = null;
}

function addPendingSubscriber() {
  if (!pendingSubscriberToAdd) return;
  linkedSubscribers.push({
    subscriberId: pendingSubscriberToAdd.id,
    name: pendingSubscriberToAdd.name,
    uc: pendingSubscriberToAdd.uc,
    cpfCnpj: pendingSubscriberToAdd.cpfCnpj,
    contractedKwh: pendingSubscriberToAdd.contractedKwh,
    concessionaria: pendingSubscriberToAdd.concessionaria,
    percentage: linkedSubscribers.length === 0 ? 100 : 0,
    priority: linkedSubscribers.length + 1,
  });

  closeConfirmModal();
  subscriberSelect.value = "";
  hideValidation();
  renderSubscriberOptions();
  renderLinkedSubscribersTable();
}

function onGeneratorChange() {
  const selectedKey = generatorSelect.value;
  selectedGenerator = generators.find((g) => g.key === selectedKey) || null;

  if (!selectedGenerator) {
    generationExpectedInput.value = 0;
    linkedSubscribers = [];
    renderGeneratorInfo();
    renderSubscriberOptions();
    renderLinkedSubscribersTable();
    hideValidation();
    return;
  }

  generationExpectedInput.value = selectedGenerator.projectedGeneration || 0;
  const ignoredBrokenLinks = mountLinkedSubscribersFromExisting();
  renderGeneratorInfo();
  renderSubscriberOptions();
  renderLinkedSubscribersTable();
  if (ignoredBrokenLinks === 0) hideValidation();
}

function onAddSubscriberClick() {
  const selectedSubscriberId = subscriberSelect.value;
  if (!selectedSubscriberId) return;
  const sub = subscribers.find((x) => x.id === selectedSubscriberId);
  if (!sub) return;
  openConfirmModal(sub);
}

function onTableInputChange(event) {
  const input = event.target.closest("input[data-field]");
  if (!input) return;
  const subscriberId = input.dataset.id;
  const field = input.dataset.field;
  const row = linkedSubscribers.find((item) => String(item.subscriberId) === String(subscriberId));
  if (!row) return;
  if (field === "percentage") row.percentage = toNumber(input.value);
  if (field === "priority") row.priority = Math.trunc(toNumber(input.value));
  hideValidation();
  recalculateSummary();

  const tableRow = input.closest("tr");
  const energyCell = tableRow?.querySelector(".energy-estimate");
  if (energyCell) {
    if (rateioType === "percentage") {
      const estimated = (getGenerationExpected() * toNumber(row.percentage)) / 100;
      energyCell.textContent = `${numberFmt(estimated)} kWh`;
    } else {
      energyCell.textContent = "Definido pela ordem";
    }
  }
}

function onTableRemoveClick(event) {
  const btn = event.target.closest("[data-remove-id]");
  if (!btn) return;
  const id = btn.dataset.removeId;
  linkedSubscribers = linkedSubscribers.filter((item) => String(item.subscriberId) !== String(id));
  if (rateioType === "priority") {
    linkedSubscribers = linkedSubscribers
      .sort((a, b) => a.priority - b.priority)
      .map((item, index) => ({ ...item, priority: index + 1 }));
  }
  hideValidation();
  renderSubscriberOptions();
  renderLinkedSubscribersTable();
}

function onHistoryListClick(event) {
  const cloneBtn = event.target.closest("[data-clone-history-id]");
  if (!cloneBtn) return;
  cloneFromHistory(cloneBtn.dataset.cloneHistoryId);
}

function switchRateioType(nextType) {
  if (!nextType || nextType === rateioType) return;
  rateioType = nextType;
  if (rateioType === "priority") {
    linkedSubscribers = linkedSubscribers.map((item, index) => ({ ...item, priority: index + 1 }));
  }
  hideValidation();
  renderLinkedSubscribersTable();
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setViewMode(btn.dataset.viewMode));
});

generatorSelect.addEventListener("change", onGeneratorChange);
generationExpectedInput.addEventListener("input", renderLinkedSubscribersTable);
subscriberSearchInput.addEventListener("input", renderSubscriberOptions);
addSubscriberBtn.addEventListener("click", onAddSubscriberClick);

rateioTypeButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchRateioType(btn.dataset.rateioType));
});

linkedSubscribersBody.addEventListener("input", onTableInputChange);
linkedSubscribersBody.addEventListener("click", onTableRemoveClick);

historySearchInput.addEventListener("input", renderHistory);
historyTypeFilter.addEventListener("change", renderHistory);
historyListContainer.addEventListener("click", onHistoryListClick);

saveRateioBtn.addEventListener("click", saveRateio);
reloadBtn.addEventListener("click", async () => {
  await loadBaseData();
  onGeneratorChange();
});

confirmCancelBtn.addEventListener("click", closeConfirmModal);
confirmAddBtn.addEventListener("click", addPendingSubscriber);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirmModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.classList.contains("hidden")) {
    closeConfirmModal();
  }
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
  setViewMode("new");
  renderRateioTypeUI();
  renderLinkedSubscribersTable();
  renderHistory();

  try {
    await loadBaseData();
  } catch (error) {
    console.error("Erro ao carregar dados de rateio:", error);
    showValidation("Falha ao carregar dados iniciais da tela de rateio.", "error");
  }
});
