import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
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

const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const themeBtn = document.getElementById("themeBtn");
const logoutBtn = document.getElementById("logoutBtn");

const userBadge = document.getElementById("userBadge");
const environmentSelect = document.getElementById("environmentSelect");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveBtn = document.getElementById("saveBtn");
const testBtn = document.getElementById("testBtn");
const statusMessage = document.getElementById("statusMessage");
const savedInfo = document.getElementById("savedInfo");
const lastTestInfo = document.getElementById("lastTestInfo");

const collapsedKey = "gcsolar_sidebar_collapsed";
const themeKey = "gcsolar_theme";
const collAsaasKeys = "asaas_keys";

let currentUser = null;
let currentScope = null;
let keysByEnv = new Map();

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
  statusMessage.textContent = message;
  statusMessage.classList.remove("success", "error", "info");
  statusMessage.classList.add(type);
}

function maskKey(value) {
  const clean = String(value || "").trim();
  if (!clean) return "-";
  if (clean.length <= 8) return "********";
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return "-";
  return d.toLocaleString("pt-BR");
}

async function getUserScope(user) {
  const scope = { uid: user.uid, email: user.email || "", tenantId: user.uid };

  const adminQ = query(collection(db, "gcredito_admins"), where("uid", "==", user.uid), limit(1));
  const adminSnap = await getDocs(adminQ);
  if (!adminSnap.empty) {
    const data = adminSnap.docs[0].data();
    scope.tenantId = data.tenantId || scope.tenantId;
    return scope;
  }

  const funcQ = query(collection(db, "gcredito_funcionarios"), where("auth_user_id", "==", user.uid), limit(1));
  const funcSnap = await getDocs(funcQ);
  if (!funcSnap.empty) {
    const data = funcSnap.docs[0].data();
    scope.tenantId = data.tenantId || scope.tenantId;
    return scope;
  }

  return scope;
}

async function testViaBackend(environment, apiKey) {
  const endpoints = [];
  if (window.location.port === "3001") {
    endpoints.push("/api/asaas-test");
  }
  endpoints.push("http://127.0.0.1:3001/api/asaas-test");
  endpoints.push("http://localhost:3001/api/asaas-test");

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ environment, apiKey }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        const msg = body?.error || `HTTP ${response.status}`;
        throw new Error(msg);
      }

      return {
        ok: true,
        account: body?.account || {},
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Não foi possível conectar ao backend de teste.");
}

function applyEnvironmentView() {
  const env = environmentSelect.value;
  const saved = keysByEnv.get(env);
  apiKeyInput.value = saved?.api_key || "";
  if (!saved) {
    savedInfo.textContent = "Nenhuma chave carregada para este ambiente.";
    lastTestInfo.textContent = "Teste ainda nao executado.";
    return;
  }

  savedInfo.textContent = `Chave salva: ${maskKey(saved.api_key)} | Atualizada em ${formatDateTime(saved.updated_at || saved.created_at)}`;
  lastTestInfo.textContent = saved.last_used
    ? `Ultimo teste/sincronismo: ${formatDateTime(saved.last_used)}`
    : "Teste ainda nao executado.";
}

async function loadUserKeys() {
  keysByEnv = new Map();

  const keyQuery = query(collection(db, collAsaasKeys), where("user_id", "==", currentUser.uid));
  const keySnap = await getDocs(keyQuery);
  keySnap.forEach((row) => {
    const data = row.data();
    const env = String(data.environment || "production").toLowerCase();
    keysByEnv.set(env, { id: row.id, ...data });
  });

  applyEnvironmentView();
}

async function saveKey() {
  const environment = environmentSelect.value;
  const apiKey = String(apiKeyInput.value || "").trim();
  if (!apiKey) {
    setStatus("Informe a chave da API ASAAS para salvar.", "error");
    apiKeyInput.focus();
    return;
  }

  saveBtn.disabled = true;
  testBtn.disabled = true;
  setStatus("Salvando chave...", "info");

  try {
    const nowIso = new Date().toISOString();
    const docId = `${currentUser.uid}_${environment}`;
    const previous = keysByEnv.get(environment);

    const payload = {
      id: docId,
      user_id: currentUser.uid,
      tenant_id: currentScope?.tenantId || currentUser.uid,
      environment,
      api_key: apiKey,
      is_active: true,
      created_at: previous?.created_at || nowIso,
      updated_at: nowIso,
      last_used: previous?.last_used || null,
    };

    await setDoc(doc(db, collAsaasKeys, docId), payload, { merge: true });
    await loadUserKeys();
    setStatus("Chave ASAAS salva com sucesso.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Não foi possível salvar a chave ASAAS.", "error");
  } finally {
    saveBtn.disabled = false;
    testBtn.disabled = false;
  }
}

async function testAsaas() {
  const environment = environmentSelect.value;
  const apiKey = String(apiKeyInput.value || "").trim();
  if (!apiKey) {
    setStatus("Informe a chave da API antes de testar.", "error");
    apiKeyInput.focus();
    return;
  }

  saveBtn.disabled = true;
  testBtn.disabled = true;
  setStatus("Testando conexão com o ASAAS...", "info");

  try {
    let account = {};
    try {
      const result = await testViaBackend(environment, apiKey);
      account = result.account || {};
    } catch (backendError) {
      const directError = `Teste via backend indisponivel (${backendError.message}).`;
      const directHint =
        "Inicie o servidor local em geradordeproposta/server (porta 3001) para testar sem bloqueio de CORS.";
      throw new Error(`${directError} ${directHint}`);
    }

    const accountName = account?.name || account?.companyName || "Conta validada";

    const existing = keysByEnv.get(environment);
    if (existing?.id) {
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, collAsaasKeys, existing.id),
        { last_used: nowIso, updated_at: nowIso },
        { merge: true }
      );
    }

    await loadUserKeys();
    setStatus(`Integracao OK no ambiente ${environment}. Conta: ${accountName}.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(`Falha no teste ASAAS: ${error.message}`, "error");
  } finally {
    saveBtn.disabled = false;
    testBtn.disabled = false;
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

  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });

  environmentSelect?.addEventListener("change", () => {
    applyEnvironmentView();
    setStatus("Ambiente alterado.", "info");
  });

  saveBtn?.addEventListener("click", saveKey);
  testBtn?.addEventListener("click", testAsaas);

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

  currentUser = user;
  try {
    currentScope = await getUserScope(user);
    userBadge.textContent = user.email || user.uid;
    await loadUserKeys();
    setStatus("Configure ou teste sua chave ASAAS.", "info");
  } catch (error) {
    console.error(error);
    setStatus("Falha ao carregar configuracoes do usuário.", "error");
  }
});

initUi();
