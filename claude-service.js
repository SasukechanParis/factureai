// FacturAI — Claude Service
// Calls the Vercel serverless proxy which securely calls Anthropic Claude API

const VERCEL_API_URL = 'https://factureai-topaz.vercel.app/api/generate';

/**
 * Generate a professional French invoice text via Claude AI.
 * @param {Object} params
 * @param {Object} params.emetteur   - Issuer info (nom, siret, adresse, telephone, iban)
 * @param {Object} params.client     - Client info (nom, adresse, siret?)
 * @param {Object} params.document_info - { numero, date_emission, date_echeance }
 * @param {Object} params.prestations   - { description }
 * @param {Object} params.montants      - { ht, tva_applicable, taux_tva, montant_tva, ttc }
 * @returns {Promise<string>} Generated invoice text
 */
export async function generateDocument({ emetteur, client, document_info, prestations, montants }) {
  const response = await fetch(VERCEL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emetteur, client, document_info, prestations, montants })
  });

  if (!response.ok) {
    let message = `Erreur serveur (${response.status})`;
    try {
      const err = await response.json();
      if (err.error) message = err.error;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await response.json();

  if (!data.text) {
    throw new Error('Réponse invalide du serveur. Veuillez réessayer.');
  }

  return data.text;
}
