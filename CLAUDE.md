# FacturAI — Development Context

## What is this?
A SaaS web app for French micro-entrepreneurs (freelancers) to generate legally compliant invoices (factures), quotes (devis), and contracts (contrats) using Claude AI in 30 seconds. Hosted on GitHub Pages.

## Target Users
French micro-entrepreneurs (320万人市場). All UI and output must be in **French**.

## Business Model
- €12/month subscription (max 30 documents/month)
- Target: 350–850 paying users

## Tech Stack
- Pure vanilla JS (no framework) — same pattern as Pholio project
- Firebase Authentication (Google Sign-In via `signInWithPopup`)
- Firebase Firestore (cloud database)
- GitHub Pages hosting (static)
- Vercel serverless function as Claude API proxy (keeps API key secure)
- jsPDF for client-side PDF generation
- Service Worker for PWA support

## Firebase Configuration
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBXxVaSv6mKLKfECJIel5FWJ9hDUhEGTh4",
  authDomain: "factureai-5712f.firebaseapp.com",
  projectId: "factureai-5712f",
  storageBucket: "factureai-5712f.firebasestorage.app",
  messagingSenderId: "494103923234",
  appId: "1:494103923234:web:234d48c3379439e077187b"
};
```

## File Structure
```
factureai/
├── index.html           # App shell + all HTML views
├── app.js               # All frontend logic (~main controller)
├── style.css            # All styles (CSS variables, responsive, themes)
├── firebase-service.js  # Firebase auth + Firestore CRUD
├── claude-service.js    # Calls Vercel proxy → Claude API
├── pdf-service.js       # jsPDF invoice/devis rendering
├── sw.js                # Service Worker (PWA cache)
├── manifest.json        # PWA manifest
├── CLAUDE.md            # This file
├── .gitignore
└── api/
    └── generate.js      # Vercel serverless function (Claude API proxy)
```

## Architecture Overview

### Authentication Flow
1. User lands on app → show login screen (`#login-screen`)
2. Click "Se connecter avec Google" → `signInWithPopup()` (non-async, preserves Safari gesture)
3. `onAuthStateChanged` fires → load user profile from Firestore
4. If new user → show onboarding (fill SIRET, address, etc.)
5. If returning user → show dashboard

### Data Flow
- All user data in Firestore: `users/{uid}/` (profile, clients, documents)
- No localStorage for business data (cloud-first)
- Monthly document count tracked in `users/{uid}/stats.monthly_count`

### Claude API Flow
1. Frontend collects form data → calls `claude-service.js`
2. `claude-service.js` sends POST to Vercel function `/api/generate`
3. Vercel function calls Anthropic API with API key (server-side, secure)
4. Returns generated French document text
5. Frontend displays preview → user confirms → PDF generated client-side

---

## Firestore Data Model

### Collection: `users/{uid}`
```
{
  email: string,
  nom_prenom: string,          // "Jean Dupont" or business name
  siret: string,               // 14 digits
  adresse: string,             // full address
  telephone: string,
  rib_iban: string,            // optional, for display on invoice
  subscription_status: string, // "trial" | "active" | "cancelled"
  trial_ends_at: timestamp,
  stripe_customer_id: string,
  created_at: timestamp
}
```

### Collection: `users/{uid}/clients/{clientId}`
```
{
  nom_entreprise: string,
  adresse: string,
  email: string,               // optional
  siret_client: string,        // optional (for B2B)
  created_at: timestamp
}
```

### Collection: `users/{uid}/documents/{docId}`
```
{
  type: string,                // "facture" | "devis" | "contrat"
  numero: string,              // "FA-2026-001" (auto-incremented)
  client_id: string,
  client_snapshot: object,     // copy of client data at creation time
  date_emission: timestamp,
  date_echeance: timestamp,
  description_input: string,   // raw user input
  lignes: array,               // [{description, quantite, prix_unitaire, total}]
  montant_ht: number,
  tva_applicable: boolean,
  taux_tva: number,            // e.g., 20
  montant_tva: number,
  montant_ttc: number,
  generated_text: string,      // full text from Claude
  status: string,              // "draft" | "final" | "sent"
  created_at: timestamp
}
```

### Collection: `users/{uid}/stats`
```
{
  monthly_count: number,       // resets on 1st of each month
  monthly_reset_date: timestamp,
  total_documents: number
}
```

---

## Views / Screens

### 1. Login Screen (`#login-screen`)
- FacturAI logo + tagline in French
- "Se connecter avec Google" button
- Brief value proposition: "Créez vos factures conformes en 30 secondes"

### 2. Onboarding Modal (`#onboarding-modal`)
- Shown only on first login
- Fields: Nom/Prénom ou raison sociale, SIRET (14 chiffres), Adresse complète, Téléphone, IBAN (optionnel)
- Validation: SIRET must be 14 digits
- Save to Firestore `users/{uid}`

### 3. Dashboard (`#view-dashboard`)
- Header: FacturAI logo, user avatar, hamburger menu
- Stats cards: Documents ce mois (X/30), Dernière facture, Clients enregistrés
- Quick action button: "+ Nouvelle facture"
- Recent documents list (last 5)
- Bottom nav (mobile): Dashboard | Nouveau | Documents | Clients | Profil

### 4. New Document View (`#view-new-document`)
Step-by-step form:

**Step 1: Type selection**
- 3 cards: Facture | Devis | Contrat (MVP: only Facture active)

**Step 2: Client selection**
- Dropdown of existing clients
- "+ Nouveau client" button → inline mini-form

**Step 3: Document details**
- Date d'émission (default: today)
- Date d'échéance (default: 30 days from today)
- TVA applicable? (toggle, default OFF — micro-entrepreneur exemption)
- Description libre (textarea): "Décrivez votre prestation en quelques mots..."
- OR structured lines table (toggle between modes)
- Montant HT (€)

**Step 4: Generate**
- "Générer en 30 secondes ✨" button
- Loading animation with French message "Claude rédige votre facture..."
- On success → show preview

### 5. Document Preview (`#view-preview`)
- Full rendered invoice preview (HTML/CSS, print-ready)
- "Modifier" (light edit mode for minor tweaks)
- "Télécharger en PDF" button → triggers jsPDF
- "Sauvegarder" button → saves to Firestore
- "Retour" button

### 6. Documents List (`#view-documents`)
- Search + filter by type/date
- Table: N°, Type, Client, Date, Montant TTC, Statut, Actions
- Actions: Download PDF, View, Delete

### 7. Clients (`#view-clients`)
- List of all clients with edit/delete
- "+ Ajouter un client" button

### 8. Profile / Settings (`#view-profile`)
- Edit profile info (SIRET, address, IBAN)
- Subscription status + usage meter (X/30 documents)
- "Gérer mon abonnement" (Stripe portal link)
- Logout button

---

## Claude API Prompt (CRITICAL — Read Carefully)

### Design Principle
Claude's job is ONLY to format text beautifully in French. All legal mandatory fields are hardcoded in the prompt. Claude must NOT invent or modify any legal mentions.

### Vercel Function (`api/generate.js`)
```javascript
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
```

---

## PDF Generation (pdf-service.js)

Use jsPDF (loaded from CDN). The invoice must look professional:
- Header: emitter info (left) + "FACTURE" title + number (right)
- Client info block
- Invoice number, date, due date
- Prestations table with columns: Description | Quantité | Prix unitaire HT | Total HT
- Totals section: HT, TVA (if applicable), TTC
- Legal mentions (small font, gray)
- Footer: payment info + IBAN

---

## Document Numbering
Format: `FA-YYYY-NNN` for factures, `DE-YYYY-NNN` for devis
- Increment per user, per year
- Reset to 001 at start of each calendar year
- Store last number in `users/{uid}/stats.last_facture_number`

---

## Monthly Limit Logic
- Max 30 documents per month per user (MVP)
- Check before generating: if `monthly_count >= 30` → show upgrade modal
- Reset `monthly_count` to 0 when current date > `monthly_reset_date`
- `monthly_reset_date` = 1st day of current month

---

## French Legal Requirements (Hardcoded — NEVER let Claude decide these)
All invoices MUST include:
1. Nom/raison sociale de l'émetteur
2. Adresse de l'émetteur
3. Numéro SIRET (14 chiffres)
4. Nom et adresse du client
5. Numéro de facture (chronologique)
6. Date d'émission
7. Date d'échéance de paiement
8. Désignation détaillée des prestations
9. Prix unitaire HT + quantité + sous-total
10. Montant total HT
11. TVA (taux + montant) si applicable, sinon "TVA non applicable, art. 293 B du CGI"
12. Montant total TTC
13. "En cas de retard de paiement, des pénalités de retard seront appliquées au taux de 3 fois le taux d'intérêt légal en vigueur."
14. "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40€ (art. D. 441-5 du Code de commerce)."
15. "Escompte pour règlement anticipé : aucun."

---

## UI/UX Guidelines
- Language: 100% French (all labels, buttons, messages, generated text)
- Color palette: primary #2563EB (blue), accent #059669 (green for success), neutral grays
- Font: Inter or system-ui
- Mobile-first responsive design
- Clean, professional look (reference: Indy.fr, Shine.fr)
- Loading states for all async operations
- Toast notifications for success/error

---

## Critical Implementation Rules

### Auth & Mobile Safari
- NEVER use `async/await` before `signInWithPopup` — breaks Safari gesture chain
- Login button handler MUST be non-async
- Call `signInWithPopup()` synchronously

### Security
- Claude API key MUST only exist in Vercel environment variables, never in frontend code
- Firestore rules: users can only read/write their own data
- CORS on Vercel function: only allow requests from the GitHub Pages domain

### Firestore Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## Deployment
- Frontend: GitHub Pages (`https://sasukechanparis.github.io/factureai/`)
- API proxy: Vercel (free tier)
- Firebase: Spark plan (free)

---

## MVP Scope (Build This First)
1. ✅ Login with Google
2. ✅ Onboarding (fill SIRET + address)
3. ✅ Add clients
4. ✅ Create Facture (invoice) with AI generation
5. ✅ PDF download
6. ✅ Document history list
7. ✅ Monthly limit counter (30/month)
8. ❌ Stripe payment (Phase 2)
9. ❌ Devis/Contrat (Phase 2)
10. ❌ Email sending (Phase 2)
