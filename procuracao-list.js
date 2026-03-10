import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
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

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const tableBody = document.getElementById("procTableBody");
const totalLabel = document.getElementById("totalLabel");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let records = [];

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

function asDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

function formatDateTime(value) {
  const d = asDate(value);
  if (!d) return "-";
  return d.toLocaleString("pt-BR");
}

function rowTemplate(record) {
  const data = record.data || {};
  const type = record.tipoPessoa === "juridica" ? "Pessoa Jurídica" : "Pessoa Física";
  const docOutorgante = record.documentoOutorgante || "-";
  const localData = `${record.cidade || "-"}-${record.estado || "-"} | ${record.dataDocumento || "-"}`;

  return `
    <tr>
      <td>${record.nomeOutorgante || data.nomeOutorgante || "-"}</td>
      <td>${type}</td>
      <td>${docOutorgante}</td>
      <td>${localData}</td>
      <td>${formatDateTime(record.createdAt || record.createdAtISO)}</td>
      <td class="actions-col">
        <div class="action-wrap">
          <button class="action-btn download" type="button" data-download="${record.id}">
            <i class="ph ph-download-simple"></i>
            Baixar
          </button>
          <button class="action-btn delete" type="button" data-delete="${record.id}">
            <i class="ph ph-trash"></i>
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `;
}

function render() {
  totalLabel.textContent = `${records.length} procuracoes`;

  if (!records.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhuma procuracao gerada ainda.</td></tr>';
    return;
  }

  tableBody.innerHTML = records.map(rowTemplate).join("");
}

async function loadRecords() {
  if (!scope) return;

  const byTenant = query(collection(db, COLLECTION_PROCURACOES), where("tenantId", "==", scope.tenantId));
  let snap;

  try {
    snap = await getDocs(byTenant);
  } catch (_) {
    const byUser = query(collection(db, COLLECTION_PROCURACOES), where("uid", "==", scope.uid));
    snap = await getDocs(byUser);
  }

  records = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ad = asDate(a.createdAt || a.createdAtISO) || new Date(0);
      const bd = asDate(b.createdAt || b.createdAtISO) || new Date(0);
      return bd.getTime() - ad.getTime();
    });

  render();
}

async function downloadRecord(id) {
  const record = records.find((x) => x.id === id);
  if (!record) return;

  const generator = new ProcuracaoPDFGenerator();
  const bytes = await generator.generatePDF(record.data || {}, record.template || {});

  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `procuracao_${(record.nomeOutorgante || "cliente").replace(/\s+/g, "_")}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

async function removeRecord(id) {
  const confirmed = window.confirm("Deseja excluir esta procuracao?");
  if (!confirmed) return;

  await deleteDoc(doc(db, COLLECTION_PROCURACOES, id));
  records = records.filter((x) => x.id !== id);
  render();
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

  tableBody.addEventListener("click", async (event) => {
    const downloadBtn = event.target.closest("[data-download]");
    if (downloadBtn) {
      await downloadRecord(downloadBtn.dataset.download);
      return;
    }

    const deleteBtn = event.target.closest("[data-delete]");
    if (deleteBtn) {
      try {
        await removeRecord(deleteBtn.dataset.delete);
      } catch (error) {
        console.error(error);
        window.alert("Não foi possível excluir a procuracao.");
      }
    }
  });

  window.addEventListener("resize", applySidebarState);
}

function initUi() {
  initTheme();
  applySidebarState();
  bindEvents();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    scope = await getUserScope(user);
    await loadRecords();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Falha ao carregar procuracoes do banco.</td></tr>';
  }
});

initUi();
