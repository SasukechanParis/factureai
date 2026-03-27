// FacturAI — PDF Service
// Generates professional A4 French invoice PDFs using jsPDF (loaded from CDN)

/**
 * Generate and download a PDF invoice.
 * @param {Object} docData     - Document data from Firestore
 * @param {Object} userProfile - Issuer profile from Firestore
 */
export function generatePDF(docData, userProfile) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;

  // ─── Colors ────────────────────────────────────────────────────────────────
  const blue = [37, 99, 235];       // #2563EB
  const gray = [100, 116, 139];     // slate-500
  const lightGray = [241, 245, 249]; // slate-100
  const black = [15, 23, 42];       // slate-900

  // ─── Fonts ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica');

  let y = margin;

  // ─── Header Band ───────────────────────────────────────────────────────────
  pdf.setFillColor(...blue);
  pdf.rect(0, 0, pageW, 12, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FacturAI', margin, 8);

  y = 22;

  // ─── Issuer Info (left) ────────────────────────────────────────────────────
  pdf.setTextColor(...black);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(userProfile.nom_prenom || '', margin, y);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...gray);
  const issuerLines = [
    userProfile.adresse || '',
    `SIRET : ${userProfile.siret || ''}`,
    userProfile.telephone || '',
    userProfile.rib_iban ? `IBAN : ${userProfile.rib_iban}` : ''
  ].filter(Boolean);

  issuerLines.forEach((line) => {
    y += 5;
    pdf.text(line, margin, y);
  });

  // ─── Document Title (right) ────────────────────────────────────────────────
  const titleY = 22;
  pdf.setTextColor(...blue);
  pdf.setFontSize(26);
  pdf.setFont('helvetica', 'bold');
  const typeLabel = (docData.type || 'facture').toUpperCase();
  pdf.text(typeLabel, pageW - margin, titleY, { align: 'right' });

  pdf.setFontSize(10);
  pdf.setTextColor(...gray);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`N° ${docData.numero || ''}`, pageW - margin, titleY + 8, { align: 'right' });

  const dateEmission = formatDateFR(docData.date_emission);
  const dateEcheance = formatDateFR(docData.date_echeance);
  pdf.text(`Date d'émission : ${dateEmission}`, pageW - margin, titleY + 14, { align: 'right' });
  pdf.text(`Date d'échéance : ${dateEcheance}`, pageW - margin, titleY + 20, { align: 'right' });

  y = Math.max(y, titleY + 26) + 8;

  // ─── Divider ───────────────────────────────────────────────────────────────
  pdf.setDrawColor(...lightGray);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  // ─── Client Block ──────────────────────────────────────────────────────────
  pdf.setFillColor(...lightGray);
  pdf.roundedRect(margin, y, contentW, 28, 2, 2, 'F');

  pdf.setTextColor(...gray);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FACTURÉ À', margin + 4, y + 5);

  const client = docData.client_snapshot || {};
  pdf.setTextColor(...black);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(client.nom_entreprise || '', margin + 4, y + 11);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...gray);
  let clientY = y + 16;
  if (client.adresse) {
    pdf.text(client.adresse, margin + 4, clientY);
    clientY += 5;
  }
  if (client.siret_client) {
    pdf.text(`SIRET : ${client.siret_client}`, margin + 4, clientY);
  }

  y += 36;

  // ─── Prestations Table Header ──────────────────────────────────────────────
  pdf.setFillColor(...blue);
  pdf.rect(margin, y, contentW, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');

  const cols = {
    desc: margin + 2,
    qty: margin + 95,
    pu: margin + 120,
    total: margin + 148
  };

  pdf.text('Description', cols.desc, y + 5);
  pdf.text('Qté', cols.qty, y + 5);
  pdf.text('Prix unit. HT', cols.pu, y + 5);
  pdf.text('Total HT', cols.total, y + 5);

  y += 7;

  // ─── Prestations Rows ──────────────────────────────────────────────────────
  const lignes = docData.lignes && docData.lignes.length > 0
    ? docData.lignes
    : [{
        description: docData.description_input || 'Prestation de services',
        quantite: 1,
        prix_unitaire: docData.montant_ht || 0,
        total: docData.montant_ht || 0
      }];

  lignes.forEach((ligne, i) => {
    const rowH = 8;
    if (i % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, contentW, rowH, 'F');
    }
    pdf.setTextColor(...black);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    // Wrap description text
    const descLines = pdf.splitTextToSize(ligne.description || '', 88);
    pdf.text(descLines, cols.desc, y + 5);

    pdf.text(String(ligne.quantite || 1), cols.qty, y + 5);
    pdf.text(formatEuro(ligne.prix_unitaire || 0), cols.pu, y + 5);
    pdf.text(formatEuro(ligne.total || 0), cols.total, y + 5);

    y += Math.max(rowH, descLines.length * 5);
  });

  y += 4;

  // ─── Totals Section ────────────────────────────────────────────────────────
  const totalsX = margin + 95;
  const totalsW = contentW - 95;

  const drawTotalRow = (label, value, bold = false) => {
    if (bold) {
      pdf.setFillColor(...blue);
      pdf.rect(totalsX, y, totalsW, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
    } else {
      pdf.setFillColor(...lightGray);
      pdf.rect(totalsX, y, totalsW, 7, 'F');
      pdf.setTextColor(...black);
      pdf.setFont('helvetica', 'normal');
    }
    const rowH = bold ? 8 : 7;
    pdf.setFontSize(9);
    pdf.text(label, totalsX + 4, y + rowH - 2);
    pdf.text(value, totalsX + totalsW - 4, y + rowH - 2, { align: 'right' });
    y += rowH;
  };

  drawTotalRow('Montant HT', formatEuro(docData.montant_ht || 0));

  if (docData.tva_applicable) {
    drawTotalRow(`TVA (${docData.taux_tva || 20}%)`, formatEuro(docData.montant_tva || 0));
    y += 1;
    drawTotalRow('Total TTC', formatEuro(docData.montant_ttc || 0), true);
  } else {
    y += 1;
    drawTotalRow('Total TTC', formatEuro(docData.montant_ht || 0), true);
  }

  y += 12;

  // ─── IBAN / Payment Info ───────────────────────────────────────────────────
  if (userProfile.rib_iban) {
    pdf.setFillColor(240, 253, 244); // green-50
    pdf.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
    pdf.setTextColor(5, 150, 105); // green-600
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Coordonnées bancaires', margin + 4, y + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`IBAN : ${userProfile.rib_iban}`, margin + 4, y + 11);
    y += 20;
  }

  // ─── Legal Mentions ────────────────────────────────────────────────────────
  pdf.setDrawColor(...lightGray);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  pdf.setTextColor(...gray);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');

  const legalLines = [];
  if (!docData.tva_applicable) {
    legalLines.push('TVA non applicable, art. 293 B du CGI');
  }
  legalLines.push(
    'En cas de retard de paiement, des pénalités de retard seront appliquées au taux de 3 fois le taux d\'intérêt légal en vigueur.',
    'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40€ (art. D. 441-5 du Code de commerce).',
    'Escompte pour règlement anticipé : aucun.'
  );

  legalLines.forEach((line) => {
    const wrapped = pdf.splitTextToSize(`• ${line}`, contentW);
    wrapped.forEach((l) => {
      pdf.text(l, margin, y);
      y += 4;
    });
  });

  // ─── Footer ────────────────────────────────────────────────────────────────
  pdf.setFillColor(...blue);
  pdf.rect(0, 287, pageW, 10, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Généré avec FacturAI — factureai.fr', pageW / 2, 293, { align: 'center' });

  // ─── Save ──────────────────────────────────────────────────────────────────
  const filename = `${docData.numero || 'facture'}-${(docData.client_snapshot?.nom_entreprise || 'client').replace(/\s+/g, '_')}.pdf`;
  pdf.save(filename);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEuro(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDateFR(dateValue) {
  if (!dateValue) return '';
  let d;
  if (dateValue?.toDate) {
    d = dateValue.toDate();
  } else if (typeof dateValue === 'string') {
    d = new Date(dateValue);
  } else {
    d = new Date(dateValue);
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
