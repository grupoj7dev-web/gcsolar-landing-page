import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
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
const DEBUG_KEY = "gcsolar_debug_auth";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberInput = document.getElementById("remember");
const submitButton = document.getElementById("submitButton");
const statusMessage = document.getElementById("statusMessage");
const forgotPasswordLink = document.getElementById("forgotPassword");

function debugLog(event, payload = {}) {
  try {
    const enabled = localStorage.getItem(DEBUG_KEY) !== "0";
    if (!enabled) return;
    const entry = {
      ts: new Date().toISOString(),
      module: "login",
      page: "login.html",
      event,
      ...payload,
    };
    console.log("[GC-AUTH]", entry);
    const raw = sessionStorage.getItem("__gc_auth_trace__") || "[]";
    const arr = JSON.parse(raw);
    arr.push(entry);
    sessionStorage.setItem("__gc_auth_trace__", JSON.stringify(arr.slice(-80)));
  } catch (_) { }
}

const BLOCKED_STATUSES = new Set(["inativo", "inactive", "bloqueado", "blocked", "suspenso"]);
const ENTRY_BY_PERMISSION_ORDER = [
  ["dashboard", "dashboard.html"],
  ["indicarAssinante", "indicar-assinante.html"],
  ["assinantes", "assinantes.html"],
  ["geradoras", "geradoras.html"],
  ["rateio", "cadastrar-rateio.html"],
  ["faturas", "faturas-validacao.html"],
  ["procuracao", "procuracao.html"],
  ["whatsapp", "whatsapp.html"],
];
const GLOBAL_ADMIN_EMAILS = new Set(["projetos@goldtechenergia.com"]);

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isBlockedStatus(value) {
  const normalized = normalizeStatus(value);
  if (!normalized) return false;
  if (BLOCKED_STATUSES.has(normalized)) return true;
  if (normalized.includes("inativ")) return true;
  if (normalized.includes("bloque")) return true;
  if (normalized.includes("suspens")) return true;
  return false;
}

async function findAdminByUid(uid) {
  const q = query(collection(db, "gcredito_admins"), where("uid", "==", uid), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function findEmployeeByUid(uid) {
  const byUid = query(collection(db, "gcredito_funcionarios"), where("uid", "==", uid), limit(1));
  const byUidSnap = await getDocs(byUid);
  if (!byUidSnap.empty) return byUidSnap.docs[0].data();

  const byAuth = query(
    collection(db, "gcredito_funcionarios"),
    where("auth_user_id", "==", uid),
    limit(1)
  );
  const byAuthSnap = await getDocs(byAuth);
  if (byAuthSnap.empty) return null;
  return byAuthSnap.docs[0].data();
}

function getRedirectByPermissions(permissions = {}) {
  for (const [permission, target] of ENTRY_BY_PERMISSION_ORDER) {
    if (permissions[permission] === true) return target;
  }
  return null;
}

async function getRedirectByUser(user) {
  debugLog("get-redirect-start", { uid: user?.uid || null, email: user?.email || null });
  const token = await getIdTokenResult(user, true);
  const email = String(user?.email || "").toLowerCase().trim();
  if (GLOBAL_ADMIN_EMAILS.has(email)) {
    debugLog("redirect-global-admin", { target: "dashboard.html", email });
    return { target: "dashboard.html", blocked: false };
  }
  if (token.claims.superadmin === true || token.claims.role === "superadmin") {
    debugLog("redirect-superadmin", { target: "dashboard.html" });
    return { target: "dashboard.html", blocked: false };
  }

  const admin = await findAdminByUid(user.uid);
  if (admin) {
    debugLog("redirect-admin", { target: "dashboard.html", tenantId: admin.tenantId || null });
    return { target: "dashboard.html", blocked: false };
  }

  const employee = await findEmployeeByUid(user.uid);
  if (!employee) {
    debugLog("redirect-no-employee", { target: "dashboard.html" });
    return { target: "dashboard.html", blocked: false };
  }

  if (isBlockedStatus(employee.status)) {
    debugLog("redirect-blocked", { status: employee.status || null });
    return { target: null, blocked: true };
  }

  const target = getRedirectByPermissions(employee.permissions || {});
  const resolved = target || "dashboard.html";
  debugLog("redirect-employee", {
    target: resolved,
    tenantId: employee.tenantId || null,
    permissions: employee.permissions || {},
  });
  return { target: resolved, blocked: false };
}

function setStatus(message, kind = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message${kind ? ` ${kind}` : ""}`;
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "Entrando..." : "Entrar";
}

function mapAuthError(code) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Informe a senha.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/user-disabled": "Usuário desativado.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
  };
  return map[code] || "Não foi possível autenticar agora.";
}

onAuthStateChanged(auth, async (user) => {
  debugLog("auth-state", { userPresent: !!user, uid: user?.uid || null });
  if (!user) return;
  try {
    const redirectInfo = await getRedirectByUser(user);
    if (redirectInfo.blocked) {
      await signOut(auth);
      setStatus("Seu acesso foi bloqueado. Fale com o administrador.", "error");
      debugLog("blocked-signout");
      return;
    }
    debugLog("redirect", { target: redirectInfo.target, source: "onAuthStateChanged" });
    window.location.href = redirectInfo.target;
  } catch (error) {
    console.error("Falha ao resolver redirecionamento no login:", error);
    debugLog("redirect-fallback-error", { message: String(error?.message || error), target: "dashboard.html" });
    window.location.href = "dashboard.html";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  setLoading(true);

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const persistence = rememberInput.checked
    ? browserLocalPersistence
    : browserSessionPersistence;

  try {
    debugLog("submit-start", { email });
    await setPersistence(auth, persistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const redirectInfo = await getRedirectByUser(cred.user);
    if (redirectInfo.blocked) {
      await signOut(auth);
      setStatus("Seu acesso foi bloqueado. Fale com o administrador.", "error");
      debugLog("submit-blocked-signout");
      return;
    }
    setStatus("Login realizado com sucesso. Redirecionando...", "success");
    debugLog("redirect", { target: redirectInfo.target, source: "submit" });
    window.location.href = redirectInfo.target;
  } catch (error) {
    debugLog("submit-error", { code: error?.code || null, message: String(error?.message || error) });
    setStatus(mapAuthError(error.code), "error");
  } finally {
    setLoading(false);
  }
});

forgotPasswordLink.addEventListener("click", async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  if (!email) {
    setStatus("Digite seu e-mail para recuperar a senha.", "error");
    emailInput.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setStatus("E-mail de recuperação enviado.", "success");
  } catch (error) {
    setStatus(mapAuthError(error.code), "error");
  }
});
