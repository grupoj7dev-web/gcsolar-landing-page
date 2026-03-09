import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
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

const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");
const source = params.get("source") || "gcredito_generators";

const wizardTitle = document.getElementById("wizardTitle");
const wizardSubtitle = document.getElementById("wizardSubtitle");
const wizardForm = document.getElementById("wizardForm");
const steps = Array.from(document.querySelectorAll(".step"));
const panes = Array.from(document.querySelectorAll(".pane"));
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const reviewJson = document.getElementById("reviewJson");
const saveBtn = document.getElementById("saveBtn");
const validationBar = document.getElementById("validationBar");

let scope = null;
let currentStep = 1;

function showValidation(message) {
  validationBar.textContent = message;
  validationBar.classList.remove("hidden");
}

function hideValidation() {
  validationBar.classList.add("hidden");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function id(name) {
  return document.getElementById(name);
}

function getFormData() {
  return {
    owner: {
      razaoSocial: id("ownerRazaoSocial").value.trim(),
      nomeFantasia: id("ownerNomeFantasia").value.trim(),
      cpfCnpj: id("ownerCpfCnpj").value.trim(),
      email: id("ownerEmail").value.trim(),
      telefone: id("ownerTelefone").value.trim(),
      address: {
        endereco: id("addrEndereco").value.trim(),
        numero: id("addrNumero").value.trim(),
        bairro: id("addrBairro").value.trim(),
        cidade: id("addrCidade").value.trim(),
        estado: id("addrEstado").value.trim(),
        cep: id("addrCep").value.trim(),
        complemento: id("addrComplemento").value.trim(),
      },
    },
    status: id("statusInput").value,
    plants: [
      {
        apelido: id("plantApelido").value.trim(),
        uc: id("plantUc").value.trim(),
        concessionaria: id("plantConcessionaria").value.trim(),
        modalidade: id("plantModalidade").value.trim(),
        geracaoProjetada: toNumber(id("plantGeracao").value),
        potenciaTotalUsina: toNumber(id("plantPotencia").value),
      },
    ],
    paymentData: {
      favorecido: id("payFavorecido").value.trim(),
      banco: id("payBanco").value.trim(),
      agencia: id("payAgencia").value.trim(),
      conta: id("payConta").value.trim(),
      tipoConta: id("payTipo").value.trim(),
      pix: id("payPix").value.trim(),
    },
  };
}

function fillForm(data = {}) {
  const owner = data.owner || {};
  const addr = owner.address || {};
  const plant = (Array.isArray(data.plants) && data.plants[0]) || {};
  const pay = data.paymentData || data.payment_data || {};

  id("ownerRazaoSocial").value = owner.razaoSocial || "";
  id("ownerNomeFantasia").value = owner.nomeFantasia || "";
  id("ownerCpfCnpj").value = owner.cpfCnpj || "";
  id("ownerEmail").value = owner.email || "";
  id("ownerTelefone").value = owner.telefone || "";
  id("statusInput").value = data.status || "active";

  id("addrEndereco").value = addr.endereco || "";
  id("addrNumero").value = addr.numero || "";
  id("addrBairro").value = addr.bairro || "";
  id("addrCidade").value = addr.cidade || "";
  id("addrEstado").value = addr.estado || "";
  id("addrCep").value = addr.cep || "";
  id("addrComplemento").value = addr.complemento || "";

  id("plantApelido").value = plant.apelido || "";
  id("plantUc").value = plant.uc || "";
  id("plantConcessionaria").value = plant.concessionaria || "";
  id("plantModalidade").value = plant.modalidade || "";
  id("plantGeracao").value = toNumber(plant.geracaoProjetada);
  id("plantPotencia").value = toNumber(plant.potenciaTotalUsina || plant.potenciaUsina);

  id("payFavorecido").value = pay.favorecido || "";
  id("payBanco").value = pay.banco || "";
  id("payAgencia").value = pay.agencia || "";
  id("payConta").value = pay.conta || "";
  id("payTipo").value = pay.tipoConta || "";
  id("payPix").value = pay.pix || "";
}

function renderStepper() {
  steps.forEach((el) => el.classList.toggle("active", Number(el.dataset.step) === currentStep));
  panes.forEach((el) => el.classList.toggle("active", Number(el.dataset.pane) === currentStep));
  prevBtn.disabled = currentStep <= 1;
  nextBtn.disabled = currentStep >= 5;
  reviewJson.textContent = JSON.stringify(getFormData(), null, 2);
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
  }
  return result;
}

async function loadEditData() {
  if (!editingId) return;
  const snap = await getDoc(doc(db, source, editingId));
  if (!snap.exists()) {
    throw new Error("Geradora não encontrada para edição.");
  }
  fillForm({ id: snap.id, ...snap.data() });
}

steps.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentStep = Number(btn.dataset.step);
    renderStepper();
  });
});

prevBtn.addEventListener("click", () => {
  if (currentStep > 1) currentStep -= 1;
  renderStepper();
});

nextBtn.addEventListener("click", () => {
  if (currentStep < 5) currentStep += 1;
  renderStepper();
});

wizardForm.addEventListener("input", () => {
  hideValidation();
  reviewJson.textContent = JSON.stringify(getFormData(), null, 2);
});

wizardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideValidation();
  saveBtn.disabled = true;

  try {
    const data = getFormData();
    const payload = {
      ...data,
      user_id: scope.uid,
      tenantId: scope.tenantId,
      updated_at: serverTimestamp(),
    };

    if (editingId) {
      await updateDoc(doc(db, source, editingId), payload);
    } else {
      payload.created_at = serverTimestamp();
      await addDoc(collection(db, "gcredito_generators"), payload);
    }
    window.location.href = "geradoras.html";
  } catch (error) {
    console.error(error);
    showValidation("Falha ao salvar geradora.");
  } finally {
    saveBtn.disabled = false;
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
  if (editingId) {
    wizardTitle.textContent = "Editar Geradora";
    wizardSubtitle.textContent = "Wizard de 5 passos para atualizar a geradora";
    await loadEditData();
  }
  renderStepper();
});
