export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { documentType, clientName, amount, description, sellerName } = req.body;

    const prompt = `Tu es un assistant comptable français expert. Génère une description professionnelle pour cette facture.

Vendeur: ${sellerName || 'N/A'}
Client: ${clientName || 'N/A'}
Montant HT: ${amount || 0}€
Description: ${description || 'Prestation de service'}

Réponds UNIQUEMENT avec ce JSON valide:
{
  "lines": ["Description détaillée de la prestation"],
  "paymentConditions": "Paiement à 30 jours à réception de facture",
  "latePaymentPenalty": "Pénalités de retard au taux légal en vigueur applicables.",
  "recoveryFee": "Indemnité forfaitaire pour frais de recouvrement: 40€"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return res.status(500).json({
        error: 'Gemini API error',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid response format' });
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
