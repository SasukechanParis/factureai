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
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Tu es un assistant comptable français expert. Génère une description professionnelle pour cette facture.

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
}`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(500).json({ error: 'Claude API error', status: response.status, details: errorText });
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
