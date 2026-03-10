import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const proposalRoot = document.getElementById("proposalRoot");
const params = new URLSearchParams(window.location.search);
const proposalId = params.get("id");

const DEFAULT_CIP = 1.44;
const DEFAULT_FLAG_GREEN = 0;
const DEFAULT_FLAG_YELLOW = 0.02885;
const DEFAULT_FLAG_RED1 = 0.05463;
const DEFAULT_FLAG_RED2 = 0.086477;
const GOLDTECH_EMAIL = "projetos@goldtechenergia.com";

function applySinglePagePrintFit() {
  const card = document.querySelector(".proposal-card");
  if (!card) return;

  const mmToPx = 96 / 25.4;
  const pageWidthPx = (210 - 12) * mmToPx;
  const pageHeightPx = (297 - 12) * mmToPx;

  const contentWidth = card.scrollWidth || 1;
  const contentHeight = card.scrollHeight || 1;
  const scale = Math.min(1, pageWidthPx / contentWidth, pageHeightPx / contentHeight) * 0.995;

  document.documentElement.style.setProperty("--proposal-print-scale", String(Math.max(0.85, scale)));
}

function safeNum(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(value) {
  return safeNum(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(value) {
  return safeNum(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPerc(value) {
  return `${fmtNum(value)}%`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildProposalHtml(proposal) {
  const data = proposal.proposal_data || {};
  const templateKey = proposal.template_key || "";
  const ownerEmail = String(proposal.user_email || "").toLowerCase().trim();
  const useJ7Template = templateKey === "j7_orange" || ownerEmail === "jheferson@gmail.com";
  const useGoldtechTemplate = templateKey === "goldtech_classic" || ownerEmail === GOLDTECH_EMAIL;

  const proposalCode = data.proposalCode || proposal.proposal_code || "-";
  const clientName = data.clientName || proposal.client_name || "-";
  const cnpj = data.cnpj || proposal.cnpj || "-";
  const installationId = data.installationId || "-";
  const distributor = data.distributor || "-";

  const monthlyConsumption = safeNum(data.monthlyConsumption);
  const currentRate = safeNum(data.currentRate);
  const dbMinCost = safeNum(data.minCost);
  const discountPercent = safeNum(data.discountPercent);
  const publicLighting = safeNum(data.publicLighting);
  const gdRule = data.gdRule || "GD1";

  const flagGreenCost =
    data.flagGreenCost !== undefined && data.flagGreenCost !== null && data.flagGreenCost !== ""
      ? safeNum(data.flagGreenCost)
      : DEFAULT_FLAG_GREEN;
  const flagYellowCost =
    data.flagYellowCost !== undefined && data.flagYellowCost !== null && data.flagYellowCost !== ""
      ? safeNum(data.flagYellowCost)
      : DEFAULT_FLAG_YELLOW;
  const flagRed1Cost =
    data.flagRedICost !== undefined && data.flagRedICost !== null && data.flagRedICost !== ""
      ? safeNum(data.flagRedICost)
      : DEFAULT_FLAG_RED1;
  const flagRed2Cost =
    data.flagRedIICost !== undefined && data.flagRedIICost !== null && data.flagRedIICost !== ""
      ? safeNum(data.flagRedIICost)
      : DEFAULT_FLAG_RED2;

  const networkType = String(data.networkType || "bifasico")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let availabilityKwh = 50;
  if (gdRule === "GD1") {
    if (networkType.includes("mono")) availabilityKwh = 30;
    else if (networkType.includes("bi")) availabilityKwh = 50;
    else if (networkType.includes("tri")) availabilityKwh = 100;
  }

  const availabilityCost = availabilityKwh * currentRate;
  const effectiveLighting = publicLighting > 0 ? publicLighting : DEFAULT_CIP;
  const computedMinCost = availabilityCost + effectiveLighting;
  const minCostDisplay = Math.max(dbMinCost, computedMinCost);

  const compensableConsumption = Math.max(0, monthlyConsumption - availabilityKwh);
  const currentMonthlyCost = monthlyConsumption * currentRate + minCostDisplay;

  const bcRate = currentRate * (1 - discountPercent / 100);
  const newMonthlyCost = compensableConsumption * bcRate + minCostDisplay;

  const calcSavings = (flagCost) => {
    const utilityRateWithFlag = currentRate + flagCost;
    return compensableConsumption * (utilityRateWithFlag - bcRate);
  };

  const savingsGreen = calcSavings(flagGreenCost);
  const savingsYellow = calcSavings(flagYellowCost);
  const savingsRed1 = calcSavings(flagRed1Cost);
  const savingsRed2 = calcSavings(flagRed2Cost);
  const annualSavings = savingsGreen * 12;

  const getPercent = (savings) => {
    const base = compensableConsumption * currentRate;
    return base > 0 ? (savings / base) * 100 : 0;
  };

  const companyTitle = useJ7Template
    ? "GRUPO J7 - GESTORA E COMERCIALIZADORA DE ENERGIA"
    : "GRUPO GC SOLAR - ENERGIA POR ASSINATURA";
  const companyCnpj = useJ7Template ? "CNPJ: 33.333.398/0001-37" : "CNPJ: 00.000.000/0001-00";
  const companyAddress = useJ7Template ? "Av. Antonio Fidelis, 205, Goiânia-GO" : "Goiânia-GO";

  let html = `
    <div class="proposal-view-container">
      <div class="screen-actions no-print">
        <button onclick="history.back()" class="btn-action">
          <i class="ph ph-arrow-left"></i> Voltar
        </button>
        <button id="shareBtn" class="btn-action success">
          <i class="ph ph-share-network"></i> Compartilhar
        </button>
        <button onclick="window.print()" class="btn-action primary">
          <i class="ph ph-printer"></i> Imprimir / PDF
        </button>
      </div>

      <div class="proposal-card">
        <header class="proposal-header">
          <div class="header-company-info">
            <h2>${escapeHtml(companyTitle)}</h2>
            <p>${escapeHtml(companyCnpj)}</p>
            <p>${escapeHtml(companyAddress)}</p>
          </div>
          <div class="header-logo-area">
            <div class="logo-text">ENERGIA LIVRE</div>
          </div>
        </header>

        <div class="proposal-body">
          <div class="proposal-title-section">
            <h1>Proposta Comercial</h1>
            <p class="proposal-subtitle">Energia Inteligente para seu Negócio</p>
          </div>

          <div class="client-grid">
            <div class="info-group"><label>Cliente</label><div class="value">${escapeHtml(clientName)}</div></div>
            <div class="info-group"><label>CNPJ / CPF</label><div class="value">${escapeHtml(cnpj)}</div></div>
            <div class="info-group"><label>Código</label><div class="value">${escapeHtml(proposalCode)}</div></div>
            <div class="info-group"><label>Instalação</label><div class="value">${escapeHtml(installationId)}</div></div>
          </div>

          <div class="comparison-container">
            <div class="comp-column gray-col">
              <div class="col-header">CUSTO SEM A<br />J7 SOLAR</div>
              <div class="col-body">
                <div class="data-box"><label>CONSUMO MENSAL</label><div class="value-pill gray">${fmtNum(monthlyConsumption)} kWh</div></div>
                <div class="data-box"><label>CUSTO MÍNIMO</label><div class="value-pill gray">${fmtMoney(minCostDisplay)}</div></div>
                <div class="data-box"><label>PREÇO ATUAL R$/KWH</label><div class="value-pill gray">R$ ${fmtNum(currentRate)}</div></div>
                <div class="data-box"><label>CUSTO MÉDIO (MENSAL)</label><div class="value-pill gray">${fmtMoney(currentMonthlyCost)}</div></div>
              </div>
            </div>

            <div class="comp-column teal-col">
              <div class="col-header">DESCONTO<br />J7 SOLAR</div>
              <div class="col-body">
                <div class="data-box"><label>DESCONTO (%)</label><div class="value-pill teal">${fmtNum(discountPercent)}%</div></div>
                <div class="data-box"><label>CUSTO MÍNIMO</label><div class="value-pill teal">${fmtMoney(minCostDisplay)}</div></div>
                <div class="data-box"><label>PREÇO J7 R$/KWH</label><div class="value-pill teal">R$ ${fmtNum(bcRate)}</div></div>
                <div class="data-box"><label>CUSTO MÉDIO (MENSAL)</label><div class="value-pill teal">${fmtMoney(newMonthlyCost)}</div></div>
              </div>
            </div>

            <div class="comp-column green-col">
              <div class="col-header">ECONOMIA MENSAL<br />POR BANDEIRA</div>
              <div class="col-body">
                <div class="data-box"><label>BANDEIRA VERDE</label><div class="value-pill light"><span class="txt-green">${fmtMoney(savingsGreen)}</span><span class="txt-green-light">${fmtPerc(getPercent(savingsGreen))}</span></div></div>
                <div class="data-box"><label>BANDEIRA AMARELA</label><div class="value-pill light"><span class="txt-orange">${fmtMoney(savingsYellow)}</span><span class="txt-orange-light">${fmtPerc(getPercent(savingsYellow))}</span></div></div>
                <div class="data-box"><label>BANDEIRA VERMELHA I</label><div class="value-pill light"><span class="txt-red">${fmtMoney(savingsRed1)}</span><span class="txt-red-light">${fmtPerc(getPercent(savingsRed1))}</span></div></div>
                <div class="data-box"><label>BANDEIRA VERMELHA II</label><div class="value-pill light"><span class="txt-darkred">${fmtMoney(savingsRed2)}</span><span class="txt-darkred-light">${fmtPerc(getPercent(savingsRed2))}</span></div></div>
              </div>
            </div>
          </div>

          <div class="total-savings-banner">
            <span class="label">ECONOMIA ANUAL SEM INVESTIMENTO</span>
            <span class="value">${fmtMoney(annualSavings)}</span>
          </div>

          <div class="tariff-explanation">
            <h3>Entenda as Bandeiras</h3>
            <p>A cor da bandeira indica se a energia está mais cara ou mais barata. Com a J7, você economiza sempre.</p>
            <div class="flags-legend">
              <div class="flag-item"><div class="dot green"></div> Verde: Sem acréscimo</div>
              <div class="flag-item"><div class="dot yellow"></div> Amarela: Mais caro (+ custo)</div>
              <div class="flag-item"><div class="dot red"></div> Vermelha: Muito caro (++ custo)</div>
            </div>
          </div>
        </div>

        <footer class="proposal-footer">Gerado por GC Solar</footer>
      </div>
    </div>
  `;

  if (useGoldtechTemplate) {
    html = html
      .replace('class="proposal-view-container"', 'class="proposal-view-container proposal-view-container--goldtech"')
      .replace('class="proposal-card"', 'class="proposal-card proposal-card--goldtech"')
      .replace('class="proposal-header"', 'class="proposal-header proposal-header--goldtech"')
      .replace('class="proposal-title-section"', 'class="proposal-title-section proposal-title-section--goldtech"')
      .replace('class="comparison-container"', 'class="comparison-container comparison-container--goldtech"')
      .replace('class="total-savings-banner"', 'class="total-savings-banner total-savings-banner--goldtech"')
      .replace('class="tariff-explanation"', 'class="tariff-explanation tariff-explanation--goldtech"')
      .replace('ENERGIA LIVRE', 'GOLDTECH')
      .replace('Proposta Comercial', 'Proposta Comercial Goldtech')
      .replace('CUSTO SEM A<br />J7 SOLAR', 'CUSTO SEM A<br />GOLDTECH')
      .replace('DESCONTO<br />J7 SOLAR', 'DESCONTO<br />GOLDTECH')
      .replace('PREÇO J7 R$/KWH', 'PREÇO GOLDTECH R$/KWH')
      .replace('Com a J7, você economiza sempre.', 'Com a Goldtech, você economiza sempre.')
      .replace('ECONOMIA ANUAL SEM INVESTIMENTO', 'ECONOMIA ANUAL COM GOLDTECH')
      .replace('Gerado por GC Solar', 'Gerado por Goldtech')
      .replace(/GRUPO GC SOLAR - ENERGIA POR ASSINATURA/g, 'GOLDTECH ENGENHARIA')
      .replace(/CNPJ:\s*00\.000\.000\/0001-00/g, 'CNPJ: 48.467.586/0001-25')
      .replace(/Goi[^<]*-GO/g, 'Av. Xingu, 388 - Parque Amazônia - Goiânia/GO');
  }

  return html;
}

async function loadProposal() {
  if (!proposalId) {
    proposalRoot.innerHTML = '<div class="error-state">ID da proposta não informado.</div>';
    return;
  }

  const snap = await getDoc(doc(db, "proposals", proposalId));
  if (!snap.exists()) {
    proposalRoot.innerHTML = '<div class="error-state">Proposta não encontrada.</div>';
    return;
  }

  const proposal = { id: snap.id, ...snap.data() };
  proposalRoot.innerHTML = buildProposalHtml(proposal);
  setTimeout(applySinglePagePrintFit, 60);

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const data = proposal.proposal_data || {};
      const msg = `Olá! Segue em anexo a proposta comercial.\n\nCliente: ${data.clientName || proposal.client_name || "-"}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    });
  }
}

window.addEventListener("resize", () => {
  applySinglePagePrintFit();
});

window.addEventListener("beforeprint", () => {
  applySinglePagePrintFit();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    await loadProposal();
  } catch (error) {
    console.error("Erro ao carregar proposta:", error);
    proposalRoot.innerHTML = '<div class="error-state">Falha ao carregar proposta.</div>';
  }
});


