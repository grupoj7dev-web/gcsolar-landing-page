import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
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

const COLL_WHATSAPP = "gcredito_whatsapp_instances";

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");

const updatedAtLabel = document.getElementById("updatedAtLabel");
const instanceNameValue = document.getElementById("instanceNameValue");
const statusBadge = document.getElementById("statusBadge");
const userValue = document.getElementById("userValue");
const statusMessage = document.getElementById("statusMessage");
const qrWrap = document.getElementById("qrWrap");

const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const refreshBtn = document.getElementById("refreshBtn");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";

let scope = null;
let userEmail = "";
let instanceName = "";
let statusTimer = null;

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

function setStatusMessage(message, type = "info") {
  statusMessage.textContent = message;
  if (type === "error") statusMessage.style.color = "#b91c1c";
  else if (type === "success") statusMessage.style.color = "#166534";
  else statusMessage.style.color = "";
}

function setUpdatedNow(extra = "") {
  const suffix = extra ? ` (${extra})` : "";
  updatedAtLabel.textContent = `Atualizado em ${new Date().toLocaleString("pt-BR")}${suffix}`;
}

function normalizeInstanceName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return body;
}

async function getJson(url) {
  const response = await fetch(url, { method: "GET" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return body;
}

async function callBackend(path, method = "GET", payload = null) {
  const endpoints = [];
  if (window.location.port === "3001") endpoints.push(path);
  endpoints.push(`http://127.0.0.1:3001${path}`);
  endpoints.push(`http://localhost:3001${path}`);

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      if (method === "GET") return await getJson(endpoint);
      return await postJson(endpoint, payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Backend indisponível.");
}

function updateStatusBadge(state) {
  const s = String(state || "close").toLowerCase();
  statusBadge.classList.remove("open", "connecting", "pending", "close");

  if (s === "open") {
    statusBadge.textContent = "Conectado";
    statusBadge.classList.add("open");
    disconnectBtn.disabled = false;
    return;
  }

  if (s === "connecting") {
    statusBadge.textContent = "Conectando";
    statusBadge.classList.add("connecting");
    disconnectBtn.disabled = false;
    return;
  }

  if (s === "pending") {
    statusBadge.textContent = "Pendente";
    statusBadge.classList.add("pending");
    disconnectBtn.disabled = false;
    return;
  }

  statusBadge.textContent = "Desconectado";
  statusBadge.classList.add("close");
  disconnectBtn.disabled = true;
}

function setQrImage(base64) {
  if (!base64) {
    qrWrap.innerHTML = '<p class="empty">Clique em conectar para gerar o QR.</p>';
    return;
  }
  qrWrap.innerHTML = `<img src="${base64}" alt="QR Code WhatsApp">`;
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

async function saveInstanceMeta(extra = {}) {
  if (!scope?.uid || !instanceName) return;
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: scope.uid,
    user_email: userEmail || "",
    tenantId: scope.tenantId || scope.uid,
    evolution_instance_name: instanceName,
    created_at: extra.created_at || nowIso,
    updated_at: nowIso,
    ...extra,
  };
  await setDoc(doc(db, COLL_WHATSAPP, scope.uid), payload, { merge: true });
}

async function resolveUserInstanceName() {
  if (!scope?.uid) return "";

  const preferred = normalizeInstanceName(`gcsolar-${scope.uid}`);
  const legacyTenantBased = normalizeInstanceName(`gcsolar-${scope.tenantId || scope.uid}`);

  const snap = await getDoc(doc(db, COLL_WHATSAPP, scope.uid));
  if (!snap.exists()) return preferred;

  const savedName = normalizeInstanceName(snap.data()?.evolution_instance_name || "");
  if (!savedName) return preferred;

  // Migra nomes legados baseados apenas no tenant para nome exclusivo por usuário.
  if (savedName === legacyTenantBased && savedName !== preferred) return preferred;

  return savedName;
}

async function ensureInstance() {
  const suggested = await resolveUserInstanceName();
  const data = await callBackend("/api/whatsapp/ensure-instance", "POST", {
    userId: scope.uid,
    tenantId: scope.tenantId,
    instanceName: suggested,
  });
  instanceName = data.instanceName;
  instanceNameValue.textContent = instanceName;
  await saveInstanceMeta({ connection_status: data.instance?.connectionStatus || "close" });
}

async function refreshStatus() {
  if (!instanceName) return;
  const data = await callBackend(`/api/whatsapp/status/${encodeURIComponent(instanceName)}`, "GET");
  const state = data.state || "close";
  updateStatusBadge(state);
  if (state === "open") setQrImage(null);
  await saveInstanceMeta({ connection_status: state });
  setUpdatedNow("status");
}

function startStatusTimer() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    if (!instanceName) return;
    refreshStatus().catch((error) => {
      console.warn("Falha no refresh automático de status:", error);
    });
  }, 15000);
}

async function connectWhatsapp() {
  connectBtn.disabled = true;
  disconnectBtn.disabled = true;
  refreshBtn.disabled = true;
  setStatusMessage("Gerando QR Code de conexão...", "info");

  try {
    await ensureInstance();
    const data = await callBackend("/api/whatsapp/connect", "POST", { instanceName });
    updateStatusBadge(data.state || "connecting");
    setQrImage(data.qr || null);
    await saveInstanceMeta({
      connection_status: data.state || "connecting",
      last_qr_at: new Date().toISOString(),
    });
    setStatusMessage("QR Code atualizado. Escaneie no WhatsApp.", "success");
    setUpdatedNow("connect");
  } catch (error) {
    console.error(error);
    setStatusMessage(`Falha ao conectar: ${error.message}`, "error");
  } finally {
    connectBtn.disabled = false;
    disconnectBtn.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function disconnectWhatsapp() {
  const ok = window.confirm("Deseja desconectar o WhatsApp desta instância?");
  if (!ok) return;

  connectBtn.disabled = true;
  disconnectBtn.disabled = true;
  refreshBtn.disabled = true;
  setStatusMessage("Desconectando WhatsApp...", "info");

  try {
    await ensureInstance();
    await callBackend("/api/whatsapp/disconnect", "POST", { instanceName });
    updateStatusBadge("close");
    setQrImage(null);
    await saveInstanceMeta({ connection_status: "close" });
    setStatusMessage("WhatsApp desconectado.", "success");
    setUpdatedNow("disconnect");
  } catch (error) {
    console.error(error);
    setStatusMessage(`Falha ao desconectar: ${error.message}`, "error");
  } finally {
    connectBtn.disabled = false;
    disconnectBtn.disabled = false;
    refreshBtn.disabled = false;
  }
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

  connectBtn?.addEventListener("click", () => connectWhatsapp());
  disconnectBtn?.addEventListener("click", () => disconnectWhatsapp());
  refreshBtn?.addEventListener("click", async () => {
    try {
      refreshBtn.disabled = true;
      await ensureInstance();
      await refreshStatus();
      setStatusMessage("Status atualizado.", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage(`Falha ao atualizar status: ${error.message}`, "error");
    } finally {
      refreshBtn.disabled = false;
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
    userEmail = user.email || "";
    userValue.textContent = userEmail || scope.uid;
    await ensureInstance();
    await refreshStatus();
    setStatusMessage("Pronto para conectar/desconectar o WhatsApp.", "info");
    startStatusTimer();
  } catch (error) {
    console.error(error);
    setStatusMessage(`Falha ao carregar módulo WhatsApp: ${error.message}`, "error");
    setUpdatedNow("erro");
  }
});

initUi();
