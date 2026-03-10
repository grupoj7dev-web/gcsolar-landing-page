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

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const themeBtn = document.getElementById("themeBtn");
const refreshBtn = document.getElementById("refreshBtn");

const statusText = document.getElementById("descontoStatusText");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const resultsSummary = document.getElementById("resultsSummary");
const proposalsTableBody = document.getElementById("proposalsTableBody");
const validationBar = document.getElementById("validationBar");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let allProposals = [];
let lastGeneratedId = "";
let lastGeneratedCode = "";
let lastGeneratedAt = "";

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

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function showValidation(message, type = "error") {
  validationBar.textContent = message;
  validationBar.classList.remove("hidden", "error", "success");
  validationBar.classList.add(type);
}

function loadLastGeneratedByUser(uid) {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return;

  // Novo formato (por usuario)
  const scopedId = localStorage.getItem(`gcsolar_last_generated_proposal_id:${safeUid}`) || "";
  const scopedCode = localStorage.getItem(`gcsolar_last_generated_proposal_code:${safeUid}`) || "";
  const scopedAt = localStorage.getItem(`gcsolar_last_generated_proposal_at:${safeUid}`) || "";
  if (scopedId) {
    lastGeneratedId = scopedId;
    lastGeneratedCode = scopedCode;
    lastGeneratedAt = scopedAt;
    return;
  }

  // Legado: so aceita se o dono estiver definido e bater com o usuario atual.
  // Se nao houver dono, ignora e limpa para evitar vazamento entre usuarios.
  const legacyOwner = String(localStorage.getItem("gcsolar_last_generated_proposal_owner_uid") || "").trim();
  if (!legacyOwner) {
    localStorage.removeItem("gcsolar_last_generated_proposal_id");
    localStorage.removeItem("gcsolar_last_generated_proposal_code");
    localStorage.removeItem("gcsolar_last_generated_proposal_at");
    return;
  }
  if (legacyOwner !== safeUid) return;

  lastGeneratedId = localStorage.getItem("gcsolar_last_generated_proposal_id") || "";
  lastGeneratedCode = localStorage.getItem("gcsolar_last_generated_proposal_code") || "";
  lastGeneratedAt = localStorage.getItem("gcsolar_last_generated_proposal_at") || "";
}

function hideValidation() {
  validationBar.classList.add("hidden");
  validationBar.classList.remove("error", "success");
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

async function loadProposals() {
  statusText.textContent = "Carregando propostas...";

  // Sem orderBy para evitar erro de índice composto no Firestore
  const q = query(collection(db, "proposals"), where("user_id", "==", scope.uid));
  const snap = await getDocs(q);

  allProposals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (asDate(b.created_at)?.getTime() || 0) - (asDate(a.created_at)?.getTime() || 0));

  renderProposals();
  statusText.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}`;
}

function statusClass(status) {
  if (status === "fechada") return "fechada";
  if (status === "perdida") return "perdida";
  return "aberta";
}

function renderProposals() {
  const term = normalizeText(searchInput.value);
  const filterStatus = statusFilter.value || "all";

  const filtered = allProposals.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (!term) return true;
    const haystack = normalizeText(`${item.proposal_code} ${item.client_name} ${item.cnpj}`);
    return haystack.includes(term);
  });

  resultsSummary.textContent = `${filtered.length} ${filtered.length === 1 ? "proposta" : "propostas"}`;

  if (!filtered.length) {
    proposalsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhuma proposta encontrada.</td></tr>';
    return;
  }

  proposalsTableBody.innerHTML = filtered
    .map((item) => {
      const currentStatus = item.status || "aberta";
      const isLastGenerated = item.id === lastGeneratedId;
      return `
        <tr class="${isLastGenerated ? "last-generated-row" : ""}">
          <td>
            <a class="proposal-link" href="proposta-view.html?id=${item.id}">
              ${item.proposal_code || "-"}
            </a>
            ${isLastGenerated ? '<span class="proposal-badge-new">Ultima gerada</span>' : ""}
          </td>
          <td>${item.client_name || "-"}</td>
          <td>${item.cnpj || "-"}</td>
          <td>${formatDate(item.created_at)}</td>
          <td>
            <select class="status-select ${statusClass(currentStatus)}" data-status-id="${item.id}">
              <option value="aberta" ${currentStatus === "aberta" ? "selected" : ""}>Aberta</option>
              <option value="fechada" ${currentStatus === "fechada" ? "selected" : ""}>Fechada</option>
              <option value="perdida" ${currentStatus === "perdida" ? "selected" : ""}>Perdida</option>
            </select>
          </td>
          <td>
            <div class="row-actions">
              <a class="view-btn" href="proposta-view.html?id=${item.id}">
                <i class="ph ph-eye"></i>
                Ver
              </a>
              <a class="edit-btn" href="nova-proposta.html?id=${item.id}">
                <i class="ph ph-pencil-simple"></i>
                Editar
              </a>
              <button class="delete-btn" type="button" data-delete-id="${item.id}">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function notifyLastGenerated() {
  if (!lastGeneratedId) return;
  const existsForCurrentUser = allProposals.some((x) => String(x.id) === String(lastGeneratedId));
  if (!existsForCurrentUser) return;
  const when = lastGeneratedAt ? new Date(lastGeneratedAt).toLocaleString("pt-BR") : "agora";
  const codeText = lastGeneratedCode ? ` (${lastGeneratedCode})` : "";
  showValidation(`Ultima proposta gerada${codeText} em ${when}.`, "success");
}

async function onStatusChange(event) {
  const select = event.target.closest("[data-status-id]");
  if (!select) return;

  const proposalId = select.dataset.statusId;
  const nextStatus = select.value;

  try {
    await updateDoc(doc(db, "proposals", proposalId), {
      status: nextStatus,
      updated_at: serverTimestamp(),
    });

    const row = allProposals.find((x) => x.id === proposalId);
    if (row) row.status = nextStatus;

    select.classList.remove("aberta", "fechada", "perdida");
    select.classList.add(statusClass(nextStatus));
    hideValidation();
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    showValidation("Falha ao atualizar status da proposta.", "error");
  }
}

async function onDeleteClick(event) {
  const btn = event.target.closest("[data-delete-id]");
  if (!btn) return;

  const proposalId = btn.dataset.deleteId;
  const confirmed = window.confirm("Deseja realmente excluir esta proposta?");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "proposals", proposalId));
    allProposals = allProposals.filter((x) => x.id !== proposalId);
    renderProposals();
    showValidation("Proposta excluída com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao excluir proposta:", error);
    showValidation("Falha ao excluir proposta.", "error");
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

searchInput.addEventListener("input", renderProposals);
statusFilter.addEventListener("change", renderProposals);
refreshBtn.addEventListener("click", async () => {
  try {
    await loadProposals();
    hideValidation();
  } catch (error) {
    console.error(error);
    showValidation("Falha ao atualizar propostas.", "error");
  }
});

proposalsTableBody.addEventListener("change", onStatusChange);
proposalsTableBody.addEventListener("click", onDeleteClick);

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
  loadLastGeneratedByUser(scope.uid);
  applySidebarState();
  initTheme();

  try {
    await loadProposals();
    notifyLastGenerated();
  } catch (error) {
    console.error("Erro ao carregar propostas:", error);
    showValidation("Falha ao carregar as propostas do módulo.", "error");
  }
});

