import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signOut,
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const DEBUG_KEY = "gcsolar_debug_auth";
let lastNavSignature = "";

function debugLog(event, payload = {}) {
  try {
    const enabled = localStorage.getItem(DEBUG_KEY) !== "0";
    if (!enabled) return;
    const page = window.location.pathname.split("/").pop() || "";
    const entry = {
      ts: new Date().toISOString(),
      module: "access-control",
      page,
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

const PAGE_PERMISSION_MAP = {
  "dashboard.html": "dashboard",
  "assinantes.html": "assinantes",
  "indicar-assinante.html": "indicarAssinante",
  "cadastrar-rateio.html": "rateio",
  "calcular-desconto.html": "rateio",
  "geradoras.html": "geradoras",
  "geradora-wizard.html": "geradoras",
  "fatura-manual.html": "faturas",
  "faturas-validacao.html": "faturas",
  "faturas-emitidas.html": "faturas",
  "procuracao.html": "procuracao",
  "procuracao-nova.html": "procuracao",
  "whatsapp.html": "whatsapp",
  "parceiros.html": "representantes",
  "asaas-config.html": "asaas",
  "nova-proposta.html": "propostas",
  "proposta-view.html": "propostas",
};

const NAV_PERMISSION_BY_HREF = {
  "dashboard.html": "dashboard",
  "assinantes.html": "assinantes",
  "indicar-assinante.html": "indicarAssinante",
  "cadastrar-rateio.html": "rateio",
  "calcular-desconto.html": "rateio",
  "geradoras.html": "geradoras",
  "fatura-manual.html": "faturas",
  "procuracao.html": "procuracao",
  "faturas-validacao.html": "faturas",
  "faturas-emitidas.html": "faturas",
  "whatsapp.html": "whatsapp",
  "parceiros.html": "representantes",
  "asaas-config.html": "asaas",
};

const DEFAULT_ENTRY_ORDER = [
  "dashboard.html",
  "indicar-assinante.html",
  "assinantes.html",
  "geradoras.html",
  "cadastrar-rateio.html",
  "faturas-validacao.html",
  "procuracao.html",
];

const GLOBAL_ADMIN_EMAILS = new Set(["projetos@goldtechenergia.com"]);
const ACL_CACHE_KEY = "gcsolar_acl_cache_v1";
const ACL_ACTIVE_UID_KEY = "gcsolar_acl_active_uid";

const BLOCKED_STATUSES = new Set(["inativo", "inactive", "bloqueado", "blocked", "suspenso"]);

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

function getPageName() {
  const file = window.location.pathname.split("/").pop() || "";
  return file.toLowerCase();
}

function safeRedirect(target) {
  if (!target) return;
  if (window.location.pathname.endsWith(target)) return;
  debugLog("redirect", { target });
  window.location.replace(target);
}

async function findAdminByUid(uid) {
  const q = query(collection(db, "gcredito_admins"), where("uid", "==", uid), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function findEmployeeByUid(uid) {
  const byUid = query(collection(db, "gcredito_funcionarios"), where("uid", "==", uid), limit(1));
  const byUidSnap = await getDocs(byUid);
  if (!byUidSnap.empty) {
    return { id: byUidSnap.docs[0].id, ...byUidSnap.docs[0].data() };
  }

  const byAuth = query(
    collection(db, "gcredito_funcionarios"),
    where("auth_user_id", "==", uid),
    limit(1)
  );
  const byAuthSnap = await getDocs(byAuth);
  if (byAuthSnap.empty) return null;
  return { id: byAuthSnap.docs[0].id, ...byAuthSnap.docs[0].data() };
}

function canAccessPermission(profile, permissionKey) {
  if (!permissionKey) return true;
  if (!profile) return false;
  if (profile.isSuperAdmin || profile.isAdmin) return true;
  if (profile.isBlocked) return false;
  if (permissionKey === "dashboard") return true;

  const permissions = profile.permissions || {};
  const direct = permissions[permissionKey];
  if (typeof direct === "boolean") return direct;

  return false;
}

function setAclPending() {
  if (!document.querySelector(".sidebar-nav")) return;
  document.documentElement.classList.add("gc-acl-pending");
}

function setAclReady() {
  document.documentElement.classList.remove("gc-acl-pending");
}

function ensureAclStyle() {
  if (document.getElementById("gcAclStyle")) return;
  const style = document.createElement("style");
  style.id = "gcAclStyle";
  style.textContent = `
    .sidebar-nav a.nav-item.gc-nav-allowed { display: flex !important; }
  `;
  document.head.appendChild(style);
}

// Bloqueio imediato para evitar flicker de menu completo antes da validacao.
ensureAclStyle();
setAclPending();
applyCachedNavPermissionsIfPossible();

function findFirstAllowedPage(profile) {
  for (const page of DEFAULT_ENTRY_ORDER) {
    const permission = PAGE_PERMISSION_MAP[page];
    if (canAccessPermission(profile, permission)) return page;
  }
  return "dashboard.html";
}

function applyNavPermissions(profile) {
  const navLinks = Array.from(document.querySelectorAll(".sidebar-nav a.nav-item[href]"));
  const allowedHrefs = [];
  const signatureParts = [];

  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const permissionKey = NAV_PERMISSION_BY_HREF[href];
    if (!permissionKey) {
      return;
    }
    const allowed = canAccessPermission(profile, permissionKey);
    signatureParts.push(`${href}:${allowed ? "1" : "0"}`);
    if (allowed) {
      allowedHrefs.push(href);
    }
  });

  const nextSignature = signatureParts.sort().join("|");
  if (nextSignature === lastNavSignature) {
    return;
  }

  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const permissionKey = NAV_PERMISSION_BY_HREF[href];
    if (!permissionKey) return;
    const allowed = canAccessPermission(profile, permissionKey);
    link.classList.toggle("gc-nav-allowed", allowed);
    link.classList.toggle("gc-nav-denied", !allowed);
  });

  lastNavSignature = nextSignature;
  saveAclCache(profile?.uid || "", allowedHrefs);
}

function readAclCache() {
  try {
    const raw = sessionStorage.getItem(ACL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const uid = String(parsed.uid || "");
    const allowed = Array.isArray(parsed.allowed)
      ? parsed.allowed.map((item) => String(item || ""))
      : [];
    if (!uid || !allowed.length) return null;
    return { uid, allowed };
  } catch (_) {
    return null;
  }
}

function saveAclCache(uid, allowedHrefs) {
  try {
    const cleanUid = String(uid || "");
    if (!cleanUid) return;
    const allowed = Array.isArray(allowedHrefs)
      ? Array.from(new Set(allowedHrefs.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
    sessionStorage.setItem(
      ACL_CACHE_KEY,
      JSON.stringify({
        uid: cleanUid,
        allowed,
        ts: Date.now(),
      })
    );
  } catch (_) { }
}

function clearAclCache() {
  try {
    sessionStorage.removeItem(ACL_CACHE_KEY);
  } catch (_) { }
}

function getActiveUidFromSession() {
  try {
    return String(sessionStorage.getItem(ACL_ACTIVE_UID_KEY) || "");
  } catch (_) {
    return "";
  }
}

function setActiveUidInSession(uid) {
  try {
    const cleanUid = String(uid || "");
    if (!cleanUid) {
      sessionStorage.removeItem(ACL_ACTIVE_UID_KEY);
      return;
    }
    sessionStorage.setItem(ACL_ACTIVE_UID_KEY, cleanUid);
  } catch (_) { }
}

function applyCachedNavPermissionsIfPossible() {
  const cached = readAclCache();
  if (!cached) return;
  const currentUid = getActiveUidFromSession();
  if (!currentUid || currentUid !== cached.uid) return;

  const allowedSet = new Set(cached.allowed);
  const navLinks = Array.from(document.querySelectorAll(".sidebar-nav a.nav-item[href]"));
  const signatureParts = [];
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const permissionKey = NAV_PERMISSION_BY_HREF[href];
    if (!permissionKey) return;
    const allowed = allowedSet.has(href);
    signatureParts.push(`${href}:${allowed ? "1" : "0"}`);
    link.classList.toggle("gc-nav-allowed", allowed);
    link.classList.toggle("gc-nav-denied", !allowed);
  });
  lastNavSignature = signatureParts.sort().join("|");
}

async function buildProfile(user) {
  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  const isSuperAdmin = token.claims.superadmin === true || role === "superadmin";
  const email = String(user?.email || "").toLowerCase().trim();
  const isGlobalAdmin = GLOBAL_ADMIN_EMAILS.has(email);
  if (isSuperAdmin) {
    return {
      uid: user.uid,
      isSuperAdmin: true,
      isAdmin: true,
      isBlocked: false,
      permissions: {},
    };
  }

  if (isGlobalAdmin) {
    return {
      uid: user.uid,
      isSuperAdmin: false,
      isAdmin: true,
      isBlocked: false,
      permissions: {},
      tenantId: user.uid,
    };
  }

  const admin = await findAdminByUid(user.uid);
  if (admin) {
    return {
      uid: user.uid,
      isSuperAdmin: false,
      isAdmin: true,
      isBlocked: false,
      permissions: {},
      tenantId: admin.tenantId || user.uid,
    };
  }

  const employee = await findEmployeeByUid(user.uid);
  if (!employee) {
    return {
      uid: user.uid,
      isSuperAdmin: false,
      isAdmin: false,
      isBlocked: false,
      permissions: {},
      tenantId: user.uid,
    };
  }

  return {
    uid: user.uid,
    isSuperAdmin: false,
    isAdmin: false,
    isBlocked: isBlockedStatus(employee.status),
    permissions: employee.permissions || {},
    tenantId: employee.tenantId || user.uid,
    employee,
  };
}

onAuthStateChanged(auth, async (user) => {
  const pageName = getPageName();
  const permissionNeeded = PAGE_PERMISSION_MAP[pageName];
  if (!permissionNeeded && !document.querySelector(".sidebar-nav")) return;

  debugLog("auth-state", {
    userPresent: !!user,
    uid: user?.uid || null,
    permissionNeeded,
  });

  if (!user) {
    setActiveUidInSession("");
    clearAclCache();
    debugLog("no-user-redirect-login");
    safeRedirect("login.html");
    return;
  }

  try {
    setActiveUidInSession(user.uid);
    const profile = await buildProfile(user);
    debugLog("profile", {
      uid: profile.uid,
      isSuperAdmin: profile.isSuperAdmin,
      isAdmin: profile.isAdmin,
      isBlocked: profile.isBlocked,
      tenantId: profile.tenantId || null,
      permissions: profile.permissions || {},
    });
    if (profile.isBlocked) {
      setActiveUidInSession("");
      clearAclCache();
      await signOut(auth);
      debugLog("blocked-signout");
      safeRedirect("login.html");
      return;
    }

    applyNavPermissions(profile);

    if (!permissionNeeded) {
      setAclReady();
      return;
    }
    if (canAccessPermission(profile, permissionNeeded)) {
      setAclReady();
      return;
    }

    const fallback = findFirstAllowedPage(profile);
    debugLog("permission-denied", { permissionNeeded, fallback });
    safeRedirect(fallback);
  } catch (error) {
    console.error("Falha no controle de acesso:", error);
    debugLog("error", { message: String(error?.message || error) });
    // Evita loop de redirecionamento quando houver erro temporario de leitura
    // (ex.: regra/firestore indisponivel). A pagina original decide o fallback.
    setAclReady();
    return;
  }
});
