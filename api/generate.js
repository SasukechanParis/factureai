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
    const { documentType, clientName, clientAddress, clientSiret, amount, description, documentNumber, issueDate, dueDate, sellerName, sellerAddress, sellerSiret, sellerEmail } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Tu es un assistant comptable français expert. Rédige les lignes de description détaillées pour une ${documentType} professionnelle en français.

Informations:
- Vendeur: ${sellerName}, ${sellerAddress}, SIRET: ${sellerSiret}, Email: ${sellerEmail}
- Client: ${clientName}, ${clientAddress}${clientSiret ? ', SIRET: ' + clientSiret : ''}
- Montant HT: ${amount}€
- Description du service: ${description}
- Numéro de document: ${documentNumber}
- Date d'émission: ${issueDate}
- Date d'échéance: ${dueDate}

Génère une description professionnelle et détaillée pour les lignes de la facture (2-3 lignes maximum). Sois concis et professionnel.

Mentions légales obligatoires à inclure dans la réponse JSON:
- Conditions de paiement
- Pénalités de retard (taux légal en vigueur)
- Indemnité forfaitaire recouvrement (40€)

Réponds UNIQUEMENT avec un JSON valide dans ce format exact:
{
  "lines": ["ligne 1", "ligne 2"],
  "paymentConditions": "Paiement à 30 jours",
  "latePaymentPenalty": "En cas de retard de paiement, des pénalités de retard au taux légal en vigueur seront appliquées.",
  "recoveryFee": "Indemnité forfaitaire pour frais de recouvrement: 40€"
}`
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(500).json({ error: 'Claude API error', details: error });
    }

    const data = await response.json();
    const content = data.content[0].text;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid response format from Claude' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
