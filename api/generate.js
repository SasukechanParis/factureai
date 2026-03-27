export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // CORS for GitHub Pages domain
  res.setHeader('Access-Control-Allow-Origin', 'https://sasukechanparis.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { emetteur, client, document_info, prestations, montants } = req.body;

  const systemPrompt = `Tu es un assistant spécialisé dans la rédaction de documents professionnels pour les micro-entrepreneurs français. Tu rédiges uniquement le corps de la facture en français professionnel et soigné. Tu n'inventes aucune information. Tu inclus exactement les mentions légales obligatoires fournies, mot pour mot.`;

  const userPrompt = `Génère le corps d'une facture professionnelle avec les informations suivantes.

ÉMETTEUR:
Nom: ${emetteur.nom}
SIRET: ${emetteur.siret}
Adresse: ${emetteur.adresse}
Téléphone: ${emetteur.telephone}
${emetteur.iban ? `IBAN: ${emetteur.iban}` : ''}

CLIENT:
Nom: ${client.nom}
Adresse: ${client.adresse}
${client.siret ? `SIRET: ${client.siret}` : ''}

INFORMATIONS FACTURE:
Numéro: ${document_info.numero}
Date d'émission: ${document_info.date_emission}
Date d'échéance: ${document_info.date_echeance}

PRESTATIONS (description de l'utilisateur — à reformuler de façon professionnelle):
${prestations.description}

MONTANTS:
Montant HT: ${montants.ht}€
${montants.tva_applicable ? `TVA (${montants.taux_tva}%): ${montants.montant_tva}€\nTotal TTC: ${montants.ttc}€` : 'TVA non applicable'}

MENTIONS LÉGALES OBLIGATOIRES (à inclure telles quelles, sans modification):
${!montants.tva_applicable ? '- TVA non applicable, art. 293 B du CGI\n' : ''}- En cas de retard de paiement, des pénalités de retard seront appliquées au taux de 3 fois le taux d'intérêt légal en vigueur.
- Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40€ (art. D. 441-5 du Code de commerce).
- Escompte pour règlement anticipé : aucun.

Retourne uniquement le texte de la facture, formaté et prêt à l'emploi, sans aucun commentaire.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt
    })
  });

  const data = await response.json();
  res.json({ text: data.content[0].text });
}
