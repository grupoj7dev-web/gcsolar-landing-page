import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberInput = document.getElementById("remember");
const submitButton = document.getElementById("submitButton");
const statusMessage = document.getElementById("statusMessage");
const forgotPasswordLink = document.getElementById("forgotPassword");

function getRedirectByClaims(claims = {}) {
  if (claims.superadmin === true || claims.role === "superadmin") {
    return "dashboard.html";
  }
  return "index.html";
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
  if (!user) return;
  const tokenResult = await getIdTokenResult(user, true);
  window.location.href = getRedirectByClaims(tokenResult.claims);
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
    await setPersistence(auth, persistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const tokenResult = await getIdTokenResult(cred.user, true);
    setStatus("Login realizado com sucesso. Redirecionando...", "success");
    window.location.href = getRedirectByClaims(tokenResult.claims);
  } catch (error) {
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
