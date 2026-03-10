import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function formatCpfCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return String(value || "").trim();
}

function toUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function formatCurrentDateBR(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

async function imageToDataUrl(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function resolveLogoDataUrl(model) {
  const candidates = [
    ...(Array.isArray(model?.logoCandidates) ? model.logoCandidates : []),
    model?.logoPath,
    "./equatoriallogo.png",
    "../equatoriallogo.png",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const logoData = await imageToDataUrl(candidate);
    if (logoData) return logoData;
  }

  return null;
}

function buildOutorganteText(data) {
  if (data.tipoPessoa === "juridica") {
    const representante = toUpper(data.nomeRepresentante || "[NOME DO SOCIO NAO INFORMADO]");
    const cpfRep = formatCpfCnpj(data.cpfRepresentante || "[CPF NAO INFORMADO]");
    const rgRep = String(data.rgRepresentante || "[RG NAO INFORMADO]").trim();

    return `a Outorgante ${toUpper(data.nomeOutorgante)} portadora do CNPJ n\u00ba ${formatCpfCnpj(
      data.cnpjOutorgante
    )}, sediada em ${toUpper(data.enderecoOutorgante)}, ${toUpper(data.cidadeOutorgante)}-${toUpper(
      data.estadoOutorgante
    )}, neste ato representada pelo s\u00f3cio ${representante}, com poderes para assinar procura\u00e7\u00e3o, devidamente indicado no contrato social conforme cl\u00e1usulas de ger\u00eancia, portador do CPF n\u00ba ${cpfRep} RG n\u00ba ${rgRep}`;
  }

  return `o Outorgante ${toUpper(data.nomeOutorgante)}, portador do CPF n\u00ba ${formatCpfCnpj(
    data.cpfOutorgante
  )}, RG n\u00ba ${String(data.rgOutorgante || "").trim()}, residente e domiciliado em ${toUpper(
    data.enderecoOutorgante
  )}, ${toUpper(data.cidadeOutorgante)}-${toUpper(data.estadoOutorgante)}, CEP: ${String(
    data.cepOutorgante || ""
  ).trim()}`;
}

const DEFAULT_MODEL = {
  title: "INSTRUMENTO PARTICULAR DE PROCURACAO",
  procuradoresText:
    "Sr. JHEFERSON FERNANDES DOS SANTOS, ENGENHEIRO ELETRICISTA portador do CREA N\u00ba 1016143800D-GO, residente em GOIANIA - GO e Sr. JOAO VICTOR FREITAS VELASCO portador do CPF: 707.555.141-81, RG: 6693164 SSP, residente em GOIANIA - GO, Telefone (62) 98111-3178",
  powersText:
    "Com poderes para junto a Equatorial, solicitar Liberacao de Carga, assinar documentos, cadastros, projetos, firmar termo de compromisso e responsabilidade, enfim praticar todos os atos necessarios ao fiel cumprimento deste mandato junto a propriedade do outorgante.",
  signatureLabel: "Proprietario: ____________________________________",
  footerLine1: "CAP - CENTRAL DE ANALISE DE PROJETOS",
  footerLine2:
    "RUA 2, QD-A37 - JARDIM GOIAS - EDIFICIO JONAS ARAUJO - CEP 74.805-180 - GOIANIA - GOIAS - BRASIL.",
};

export class ProcuracaoPDFGenerator {
  async generatePDF(data, model = {}) {
    const mergedModel = { ...DEFAULT_MODEL, ...model };

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const margin = 20;
    const textWidth = pageWidth - margin * 2;
    const lineHeight = 6;

    let yPosition = 10;

    pdf.setFont("helvetica", "normal");

    const logoDataUrl = await resolveLogoDataUrl(mergedModel);
    if (logoDataUrl) {
      const logoWidth = Number(mergedModel.logoWidth || 50);
      const logoHeight = Number(mergedModel.logoHeight || 25);
      pdf.addImage(logoDataUrl, "PNG", pageWidth - margin - logoWidth, yPosition, logoWidth, logoHeight);
      yPosition += Number(mergedModel.logoBottomGap || 35);
    } else {
      yPosition += 15;
    }

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    const title = mergedModel.title;
    const titleWidth = pdf.getTextWidth(title);
    pdf.text(title, (pageWidth - titleWidth) / 2, yPosition);
    yPosition += lineHeight * 2;

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");

    const outorganteText = buildOutorganteText(data);
    const bodyText = `Por este instrumento de procuracao e na melhor forma de direito, ${outorganteText}. Nomeia e constitui seus procuradores os Outorgados ${mergedModel.procuradoresText}. ${mergedModel.powersText}`;

    const lines = pdf.splitTextToSize(bodyText, textWidth);
    for (const line of lines) {
      if (yPosition > 270) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }

    yPosition += lineHeight * 2;
    const dataAtual = String(data?.data || "").trim() || formatCurrentDateBR();
    const localCidade = toUpper(data?.cidade || mergedModel.localCidade || "GOIANIA");
    const localEstado = toUpper(data?.estado || mergedModel.localEstado || "GO");

    pdf.text(`${localCidade} - ${localEstado}, ${dataAtual}`, margin, yPosition);
    yPosition += lineHeight * 3;

    pdf.text(mergedModel.signatureLabel, margin, yPosition);
    yPosition += lineHeight * 4;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(mergedModel.footerLine1, margin, yPosition);
    yPosition += lineHeight;

    pdf.setFont("helvetica", "normal");
    pdf.text(mergedModel.footerLine2, margin, yPosition);

    return new Uint8Array(pdf.output("arraybuffer"));
  }
}
