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

const COLLABORATORS_COLLECTION = "gcredito_funcionarios";
const themeKey = "gcsolar_theme";
const collapsedKey = "gcsolar_sidebar_collapsed";
const IDENTITY_SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
const GLOBAL_ADMIN_EMAILS = new Set(["projetos@goldtechenergia.com"]);

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const logoutBtn = document.getElementById("logoutBtn");
const statusText = document.getElementById("statusText");
const tableBody = document.getElementById("partnersTableBody");
const reloadBtn = document.getElementById("reloadBtn");
const newPartnerBtn = document.getElementById("newPartnerBtn");

const modal = document.getElementById("partnerModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const formTitle = document.getElementById("formTitle");
const form = document.getElementById("partnerForm");

const partnerIdInput = document.getElementById("partnerId");
const originalEmailInput = document.getElementById("originalEmail");
const nomeInput = document.getElementById("nomeInput");
const emailInput = document.getElementById("emailInput");
const telefoneInput = document.getElementById("telefoneInput");
const statusInput = document.getElementById("statusInput");
const passwordField = document.getElementById("passwordField");
const passwordInput = document.getElementById("passwordInput");

const commissionBox = document.getElementById("commissionBox");
const commissionPercentageInput = document.getElementById("commissionPercentageInput");
const commissionMonthsInput = document.getElementById("commissionMonthsInput");
const permissionInputs = Array.from(document.querySelectorAll("[data-perm]"));

let currentScope = null;
let partners = [];
let editingPartner = null;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  statusText.textContent = message;
  if (type === "error") statusText.style.color = "#b91c1c";
  else if (type === "success") statusText.style.color = "#166534";
  else statusText.style.color = "";
}

function openModal() {
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

function getPermissionsFromForm() {
  const permissions = {};
  permissionInputs.forEach((input) => {
    permissions[input.dataset.perm] = input.checked;
  });
  return permissions;
}

function applyPermissionsToForm(permissions = {}) {
  permissionInputs.forEach((input) => {
    input.checked = permissions[input.dataset.perm] === true;
  });
  updateCommissionState();
}

function updateCommissionState() {
  const indicarAllowed =
    permissionInputs.find((x) => x.dataset.perm === "indicarAssinante")?.checked === true;
  commissionBox.classList.toggle("disabled", !indicarAllowed);
  commissionPercentageInput.disabled = !indicarAllowed;
  commissionMonthsInput.disabled = !indicarAllowed;
  commissionPercentageInput.required = indicarAllowed;
  commissionMonthsInput.required = indicarAllowed;
  if (!indicarAllowed) {
    commissionPercentageInput.value = "";
    commissionMonthsInput.value = "";
  }
}

function resetForm() {
  form.reset();
  partnerIdInput.value = "";
  originalEmailInput.value = "";
  editingPartner = null;
  passwordInput.required = true;
  passwordField.style.display = "";
  statusInput.value = "ativo";
  applyPermissionsToForm({});
  formTitle.textContent = "Novo parceiro";
}

async function getUserScope(user) {
  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  const email = String(user?.email || "").toLowerCase().trim();
  if (GLOBAL_ADMIN_EMAILS.has(email)) {
    return { uid: user.uid, email, tenantId: user.uid, isAdmin: true };
  }
  const isSuperAdmin = token.claims.superadmin === true || role === "superadmin";

  if (isSuperAdmin) {
    return { uid: user.uid, email, tenantId: user.uid, isAdmin: true };
  }

  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) {
    const data = adminSnap.docs[0].data();
    return { uid: user.uid, email, tenantId: data.tenantId || user.uid, isAdmin: true };
  }

  return { uid: user.uid, email, tenantId: user.uid, isAdmin: false };
}

async function createAuthUser(email, password) {
  const response = await fetch(IDENTITY_SIGNUP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: false,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.error?.message || "CREATE_AUTH_FAILED";
    if (code === "EMAIL_EXISTS") {
      throw new Error("Este e-mail ja esta cadastrado no Firebase Auth.");
    }
    throw new Error(`Falha ao criar usuario de login: ${code}`);
  }

  return { uid: body.localId };
}

function buildPayload(nowIso, authUid) {
  const permissions = getPermissionsFromForm();
  const existingPermissions = editingPartner?.permissions || {};
  const indicarAllowed = permissions.indicarAssinante === true;
  const commissionPercentage = indicarAllowed ? toNumber(commissionPercentageInput.value) : 0;
  const commissionMonths = indicarAllowed ? Math.max(0, Math.floor(toNumber(commissionMonthsInput.value))) : 0;

  return {
    nome: cleanText(nomeInput.value),
    email: cleanText(emailInput.value).toLowerCase(),
    telefone: cleanText(telefoneInput.value),
    status: cleanText(statusInput.value) || "ativo",
    auth_user_id: authUid || editingPartner?.auth_user_id || editingPartner?.uid || null,
    uid: authUid || editingPartner?.uid || editingPartner?.auth_user_id || null,
    cargo: "parceiro",
    user_id: currentScope.uid,
    tenantId: currentScope.tenantId,
    permissions: {
      ...existingPermissions,
      dashboard: permissions.dashboard === true,
      assinantes: permissions.assinantes === true,
      indicarAssinante: permissions.indicarAssinante === true,
      rateio: permissions.rateio === true,
      geradoras: permissions.geradoras === true,
      faturas: permissions.faturas === true,
      procuracao: permissions.procuracao === true,
      whatsapp: permissions.whatsapp === true,
      representantes: permissions.representantes === true,
      asaas: false,
    },
    commission_percentage: commissionPercentage,
    commission_months: commissionMonths,
    can_see_manager_percentage: false,
    updated_at: nowIso,
    updatedAt: nowIso,
    updatedAtISO: nowIso,
  };
}

function renderTable() {
  if (!partners.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty">Nenhum parceiro cadastrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = partners
    .map((partner) => {
      const nome = partner.nome || partner.name || "-";
      const email = partner.email || partner.mail || "-";
      const telefone = partner.telefone || partner.phone || "-";
      const statusRaw = cleanText(partner.status || "ativo").toLowerCase();
      const statusLabel = statusRaw === "bloqueado" ? "Bloqueado" : statusRaw === "inativo" ? "Inativo" : "Ativo";
      const statusClass = statusRaw === "bloqueado" ? "is-blocked" : statusRaw === "inativo" ? "is-inactive" : "is-active";
      return `
      <tr data-id="${partner.id}">
        <td>${nome}</td>
        <td>${email}</td>
        <td>${telefone}</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="row-actions">
            <button class="mini-btn" type="button" data-action="edit"><i class="ph ph-pencil-simple"></i>Editar</button>
            <button class="mini-btn delete" type="button" data-action="delete"><i class="ph ph-trash"></i>Apagar</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function isPartnerLikeRecord(data) {
  const cargo = cleanText(data?.cargo).toLowerCase();
  const role = cleanText(data?.role).toLowerCase();
  const hasLoginIdentity = Boolean(cleanText(data?.auth_user_id || data?.uid));
  const isExplicitPartnerRole =
    ["parceiro", "vendedor", "representante"].includes(cargo) ||
    ["parceiro", "vendedor", "representante"].includes(role);
  if (isExplicitPartnerRole && hasLoginIdentity) return true;

  const perms = data?.permissions || {};
  const hasPartnerPermission = perms.representantes === true;
  const hasPartnerFinancial = Number(data?.commission_percentage || 0) > 0 || Number(data?.commission_months || 0) > 0;
  const hasLeadLikeShape = Boolean(
    data?.subscriberName ||
    data?.cpfCnpj ||
    data?.uc ||
    data?.kwh ||
    data?.concessionaria ||
    data?.planName
  );
  if (hasLeadLikeShape) return false;
  if ((hasPartnerPermission || hasPartnerFinancial) && hasLoginIdentity) return true;
  return false;
}

async function runQuerySafe(q) {
  try {
    return await getDocs(q);
  } catch (error) {
    console.warn("Query ignorada por falha/index:", error?.message || error);
    return { docs: [] };
  }
}

async function loadPartners() {
  setStatus("Carregando parceiros...");
  const collRef = collection(db, COLLABORATORS_COLLECTION);
  const scopes = [
    query(collRef, where("tenantId", "==", currentScope.tenantId)),
    query(collRef, where("tenant_id", "==", currentScope.tenantId)),
    query(collRef, where("user_id", "==", currentScope.uid)),
    query(collRef, where("user_id", "==", currentScope.tenantId)),
    query(collRef, where("createdBy", "==", currentScope.uid)),
  ];
  if (currentScope.email) {
    scopes.push(query(collRef, where("managerEmail", "==", currentScope.email)));
    scopes.push(query(collRef, where("ownerEmail", "==", currentScope.email)));
  }
  const snaps = await Promise.all(scopes.map((q) => runQuerySafe(q)));

  const mapById = new Map();
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      if (!mapById.has(d.id)) mapById.set(d.id, { id: d.id, ...d.data() });
    });
  });

  partners = Array.from(mapById.values())
    .filter(isPartnerLikeRecord)
    .sort((a, b) => String(a.nome || a.name || "").localeCompare(String(b.nome || b.name || ""), "pt-BR"));

  renderTable();
  setStatus(`Parceiros carregados: ${partners.length}.`, "success");
}

function loadInForm(partner) {
  editingPartner = partner;
  partnerIdInput.value = partner.id;
  originalEmailInput.value = cleanText(partner.email || partner.mail).toLowerCase();
  nomeInput.value = partner.nome || partner.name || "";
  emailInput.value = partner.email || partner.mail || "";
  telefoneInput.value = partner.telefone || partner.phone || "";
  statusInput.value = partner.status || "ativo";
  commissionPercentageInput.value = partner.commission_percentage || "";
  commissionMonthsInput.value = partner.commission_months || "";
  applyPermissionsToForm(partner.permissions || {});
  passwordInput.required = false;
  passwordField.style.display = "none";
  formTitle.textContent = `Editar parceiro: ${partner.nome || partner.email || partner.id}`;
  openModal();
}

async function savePartner(event) {
  event.preventDefault();
  if (!currentScope?.isAdmin) {
    setStatus("Sem permissao para gerenciar parceiros.", "error");
    return;
  }

  const email = cleanText(emailInput.value).toLowerCase();
  const password = passwordInput.value;
  const isEditing = !!cleanText(partnerIdInput.value);

  if (!email || !cleanText(nomeInput.value) || !cleanText(telefoneInput.value)) {
    setStatus("Preencha nome, e-mail e telefone.", "error");
    return;
  }

  if (!isEditing && password.length < 6) {
    setStatus("A senha deve ter no minimo 6 caracteres.", "error");
    return;
  }

  if (isEditing) {
    const oldEmail = cleanText(originalEmailInput.value).toLowerCase();
    if (oldEmail && oldEmail !== email) {
      setStatus("Não e possível alterar o e-mail de login deste parceiro por aqui.", "error");
      return;
    }
  }

  const nowIso = new Date().toISOString();

  try {
    let authUid = null;
    if (!isEditing) {
      const created = await createAuthUser(email, password);
      authUid = created.uid;
    }

    const payload = buildPayload(nowIso, authUid);
    const isIndicarAllowed = payload.permissions.indicarAssinante === true;
    if (isIndicarAllowed && (payload.commission_percentage <= 0 || payload.commission_months <= 0)) {
      setStatus("Defina comissao (%) e prazo (meses) para acesso ao Pré-assinante.", "error");
      return;
    }

    if (isEditing) {
      await updateDoc(doc(db, COLLABORATORS_COLLECTION, partnerIdInput.value), payload);
      setStatus("Parceiro atualizado com sucesso.", "success");
    } else {
      await addDoc(collection(db, COLLABORATORS_COLLECTION), {
        ...payload,
        created_at: nowIso,
        createdAt: nowIso,
        createdAtISO: nowIso,
        approved_at: nowIso,
        approved_by: currentScope.uid,
      });
      setStatus("Parceiro cadastrado com sucesso.", "success");
    }

    closeModal();
    resetForm();
    await loadPartners();
  } catch (error) {
    console.error(error);
    setStatus(`Falha ao salvar parceiro: ${error.message || "erro desconhecido"}`, "error");
  }
}

async function deletePartner(partnerId) {
  const partner = partners.find((x) => x.id === partnerId);
  if (!partner) return;
  const ok = window.confirm(`Apagar o parceiro "${partner.nome || partner.email}"?`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, COLLABORATORS_COLLECTION, partnerId));
    setStatus("Parceiro apagado com sucesso.", "success");
    await loadPartners();
  } catch (error) {
    console.error(error);
    setStatus(`Falha ao apagar parceiro: ${error.message || "erro desconhecido"}`, "error");
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

  window.addEventListener("resize", applySidebarState);

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

  newPartnerBtn?.addEventListener("click", () => {
    resetForm();
    openModal();
  });

  reloadBtn?.addEventListener("click", loadPartners);

  closeModalBtn?.addEventListener("click", () => {
    closeModal();
    resetForm();
  });

  cancelBtn?.addEventListener("click", () => {
    closeModal();
    resetForm();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal='1']")) {
      closeModal();
      resetForm();
    }
  });

  permissionInputs.forEach((input) => {
    input.addEventListener("change", updateCommissionState);
  });

  form?.addEventListener("submit", savePartner);

  tableBody?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr[data-id]");
    const partnerId = row?.dataset.id;
    if (!partnerId) return;

    if (btn.dataset.action === "edit") {
      const partner = partners.find((x) => x.id === partnerId);
      if (partner) loadInForm(partner);
      return;
    }
    if (btn.dataset.action === "delete") {
      deletePartner(partnerId);
    }
  });
}

function initUi() {
  initTheme();
  applySidebarState();
  bindEvents();
  resetForm();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    currentScope = await getUserScope(user);
    if (!currentScope.isAdmin) {
      setStatus("Sem permissao para esta tela.", "error");
      window.location.href = "dashboard.html";
      return;
    }
    await loadPartners();
  } catch (error) {
    console.error(error);
    setStatus("Falha ao carregar contexto do usuário.", "error");
  }
});

initUi();

