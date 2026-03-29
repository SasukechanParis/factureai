// FacturAI — Main App Controller
// Pure vanilla JS, no frameworks

import {
  signInWithGoogle,
  signOut,
  onAuthStateChanged,
  getUserProfile,
  createUserProfile,
  saveUserProfile,
  getClients,
  saveClient,
  updateClient,
  deleteClient,
  getDocuments,
  getRecentDocuments,
  saveDocument,
  deleteDocument,
  getStats,
  checkAndResetMonthlyCount,
  incrementMonthlyCount,
  getNextDocumentNumber
} from './firebase-service.js';

import { generateDocument } from './claude-service.js';
import { generatePDF } from './pdf-service.js';

// ─── App State ────────────────────────────────────────────────────────────────
const state = {
  user: null,          // Firebase user
  profile: null,       // Firestore user profile
  clients: [],
  documents: [],
  stats: null,
  currentView: null,
  // New document wizard
  wizard: {
    step: 1,
    type: 'facture',
    clientId: null,
    clientSnapshot: null,
    dateEmission: '',
    dateEcheance: '',
    description: '',
    montantHT: 0,
    tvaApplicable: false,
    tauxTVA: 20,
    numero: '',
    generatedText: '',
    savedDocId: null
  }
};

// ─── Utility: Toast ───────────────────────────────────────────────────────────
window.showToast = function showToast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// ─── Utility: Loading Overlay ─────────────────────────────────────────────────
function setLoading(active) {
  document.getElementById('loading-overlay').classList.toggle('active', active);
}

// ─── Utility: Format currency ─────────────────────────────────────────────────
function formatEuro(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

// ─── Utility: Format date ─────────────────────────────────────────────────────
function formatDate(dateValue) {
  if (!dateValue) return '';
  let d;
  if (dateValue?.toDate) d = dateValue.toDate();
  else d = new Date(dateValue);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Utility: SIRET Validation ────────────────────────────────────────────────
function validateSIRET(siret) {
  return /^\d{14}$/.test(siret);
}

// ─── View Navigation ──────────────────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.remove('active');
    // Remove any inline display that could override CSS (e.g. auth force-hide)
    if (v.id !== 'login-screen') v.style.display = '';
  });

  // Always explicitly hide login screen when not showing it
  const loginEl = document.getElementById('login-screen');
  if (loginEl && viewId !== 'login-screen') {
    loginEl.style.display = 'none';
  } else if (loginEl && viewId === 'login-screen') {
    loginEl.style.display = '';
  }

  const view = document.getElementById(viewId);
  if (view) view.classList.add('active');
  state.currentView = viewId;

  // Sync bottom nav active state
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  // Scroll to top
  window.scrollTo(0, 0);
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ─── Auth Flow ────────────────────────────────────────────────────────────────
onAuthStateChanged(async (user) => {
  console.log('Auth state changed:', user ? 'user logged in' : 'no user');

  if (!user) {
    showView('login-screen');
    return;
  }

  // Force hide login screen immediately — belt-and-suspenders against CSS specificity issues
  console.log('Hiding login screen');
  const loginEl = document.getElementById('login-screen');
  if (loginEl) {
    loginEl.classList.remove('active');
    loginEl.style.display = 'none';
  }

  state.user = user;

  try {
    setLoading(true);
    const profile = await getUserProfile(user.uid);

    if (!profile || !profile.siret) {
      // New user — show onboarding
      await createUserProfile(user.uid, {
        email: user.email,
        nom_prenom: user.displayName || '',
        photo_url: user.photoURL || ''
      });
      state.profile = await getUserProfile(user.uid);
      setLoading(false);
      showOnboarding();
    } else {
      state.profile = profile;
      setLoading(false);
      await loadDashboard();
    }
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors du chargement du profil.', 'error');
  }
});

// ─── SIRET Counter Helper ─────────────────────────────────────────────────────
function bindSiretCounter(inputId, counterId) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;

  // Digits-only filtering on input
  input.addEventListener('input', () => {
    // Strip non-digits silently
    const digitsOnly = input.value.replace(/\D/g, '');
    if (input.value !== digitsOnly) input.value = digitsOnly;

    const len = digitsOnly.length;
    counter.textContent = `${len}/14`;
    counter.classList.remove('valid', 'invalid');
    if (len === 14) counter.classList.add('valid');
    else if (len > 0) counter.classList.add('invalid');
  });

  // Trigger once on load to reflect pre-filled value
  input.dispatchEvent(new Event('input'));
}

bindSiretCounter('ob-siret', 'ob-siret-counter');
bindSiretCounter('prof-siret', 'prof-siret-counter');

// ─── Login Screen ─────────────────────────────────────────────────────────────
document.getElementById('btn-google-signin').addEventListener('click', function () {
  // Non-async — MUST NOT use async/await here (Safari gesture chain)
  signInWithGoogle();
});

// ─── Onboarding ───────────────────────────────────────────────────────────────
function showOnboarding() {
  showView('view-dashboard'); // hide login screen; modal overlays the app
  openModal('onboarding-modal');
  // Pre-fill name
  if (state.profile?.nom_prenom) {
    document.getElementById('ob-nom').value = state.profile.nom_prenom;
  }
}

document.getElementById('form-onboarding').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nom = document.getElementById('ob-nom').value.trim();
  const siret = document.getElementById('ob-siret').value.trim();
  const adresse = document.getElementById('ob-adresse').value.trim();
  const telephone = document.getElementById('ob-telephone').value.trim();
  const iban = document.getElementById('ob-iban').value.trim();

  if (!nom || !siret || !adresse || !telephone) {
    showToast('Veuillez remplir tous les champs obligatoires.', 'warning');
    return;
  }

  if (!validateSIRET(siret)) {
    showToast('Le numéro SIRET doit contenir exactement 14 chiffres.', 'error');
    document.getElementById('ob-siret').focus();
    return;
  }

  try {
    setLoading(true);
    await saveUserProfile(state.user.uid, {
      nom_prenom: nom,
      siret,
      adresse,
      telephone,
      rib_iban: iban
    });
    state.profile = await getUserProfile(state.user.uid);
    closeModal('onboarding-modal');
    setLoading(false);
    showToast('Bienvenue sur FacturAI ! 🎉', 'success');
    await loadDashboard();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de la sauvegarde du profil.', 'error');
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  showView('view-dashboard');

  try {
    const [monthlyCount, recentDocs, clients] = await Promise.all([
      checkAndResetMonthlyCount(state.user.uid),
      getRecentDocuments(state.user.uid, 5),
      getClients(state.user.uid)
    ]);

    state.documents = recentDocs;
    state.clients = clients;

    // Stats
    document.getElementById('dash-doc-count').textContent = `${monthlyCount}/30`;
    document.getElementById('dash-client-count').textContent = clients.length;

    const usageBar = document.getElementById('dash-usage-bar');
    usageBar.style.width = `${Math.min((monthlyCount / 30) * 100, 100)}%`;

    if (recentDocs.length > 0) {
      const last = recentDocs[0];
      document.getElementById('dash-last-doc').textContent = last.numero || '—';
    }

    // Recent docs list
    renderRecentDocuments(recentDocs);

    // Update user avatar
    if (state.user.photoURL) {
      const avatarEl = document.getElementById('user-avatar');
      if (avatarEl) avatarEl.src = state.user.photoURL;
    }

    const nameEl = document.getElementById('dash-user-name');
    if (nameEl) nameEl.textContent = state.profile?.nom_prenom || state.user.displayName || '';

  } catch (err) {
    console.error(err);
    showToast('Erreur lors du chargement du tableau de bord.', 'error');
  }
}

function renderRecentDocuments(docs) {
  const container = document.getElementById('recent-docs-list');
  if (!docs || docs.length === 0) {
    // Keep the static first-time empty state from HTML (already in DOM)
    const existing = container.querySelector('.card-empty-first');
    if (!existing) {
      container.innerHTML = `
        <div class="card-empty-first">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">🧾</div>
          <div class="empty-headline">Créez votre première facture en 2 minutes</div>
          <div class="empty-sub">Décrivez votre prestation en quelques mots.<br>Claude s'occupe du reste — mentions légales incluses.</div>
          <button class="btn btn-primary" onclick="document.getElementById('btn-quick-new').click()">
            Commencer maintenant →
          </button>
          <div class="empty-proof">✓ Facture légalement conforme dès la première utilisation</div>
        </div>`;
    }
    return;
  }

  container.innerHTML = docs.map((doc) => `
    <div class="list-item" onclick="viewDocument('${doc.id}')">
      <div class="list-item-icon facture">${doc.type === 'facture' ? '🧾' : '📋'}</div>
      <div class="list-item-body">
        <div class="list-item-title">${doc.numero || '—'} — ${doc.client_snapshot?.nom_entreprise || '—'}</div>
        <div class="list-item-sub">${formatDate(doc.date_emission)} · <span class="badge badge-${doc.status || 'draft'}">${statusLabel(doc.status)}</span></div>
      </div>
      <div class="list-item-right">
        <div class="list-item-amount">${formatEuro(doc.montant_ttc || doc.montant_ht)}</div>
        <div class="list-item-date">${doc.type?.toUpperCase() || 'FA'}</div>
      </div>
    </div>`).join('');
}

function statusLabel(status) {
  const map = { draft: 'Brouillon', final: 'Finalisé', sent: 'Envoyé' };
  return map[status] || 'Brouillon';
}

window.viewDocument = async function (docId) {
  try {
    setLoading(true);
    const { getDocument } = await import('./firebase-service.js');
    const doc = await getDocument(state.user.uid, docId);
    setLoading(false);
    if (!doc) { showToast('Document introuvable.', 'error'); return; }
    state.wizard.savedDocId = docId;
    renderPreview(doc);
    showView('view-preview');
  } catch (err) {
    setLoading(false);
    console.error(err);
  }
};

// ─── New Document Wizard ──────────────────────────────────────────────────────
function resetWizard() {
  state.wizard = {
    step: 1,
    type: 'facture',
    clientId: null,
    clientSnapshot: null,
    dateEmission: todayISO(),
    dateEcheance: addDaysISO(30),
    description: '',
    montantHT: 0,
    tvaApplicable: false,
    tauxTVA: 20,
    numero: '',
    generatedText: '',
    savedDocId: null
  };
}

async function showNewDocument() {
  resetWizard();
  await loadClientsForWizard();
  showView('view-new-document');
  renderWizardStep(1);
}

async function loadClientsForWizard() {
  try {
    state.clients = await getClients(state.user.uid);
    populateClientSelect();
  } catch (err) {
    console.error(err);
  }
}

function populateClientSelect() {
  const sel = document.getElementById('wiz-client-select');
  sel.innerHTML = '<option value="">-- Sélectionner un client --</option>';
  state.clients.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nom_entreprise;
    sel.appendChild(opt);
  });
}

function renderWizardStep(step) {
  state.wizard.step = step;

  // Update step dots
  const totalSteps = 3;
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 === step) dot.classList.add('active');
    else if (i + 1 < step) dot.classList.add('done');
  });

  // Show/hide panels
  document.querySelectorAll('.step-panel').forEach((panel) => {
    panel.classList.remove('active');
  });
  const panel = document.getElementById(`step-${step}`);
  if (panel) panel.classList.add('active');

  // Step-specific setup
  if (step === 1) {
    document.getElementById('wiz-step-title').textContent = 'Type de document';
    document.getElementById('wiz-step-sub').textContent = 'Choisissez ce que vous souhaitez créer';
  } else if (step === 2) {
    document.getElementById('wiz-step-title').textContent = 'Sélectionnez le client';
    document.getElementById('wiz-step-sub').textContent = 'À qui est destiné ce document ?';
  } else if (step === 3) {
    document.getElementById('wiz-step-title').textContent = 'Détails de la facture';
    document.getElementById('wiz-step-sub').textContent = 'Décrivez votre prestation';
    document.getElementById('wiz-date-emission').value = state.wizard.dateEmission;
    document.getElementById('wiz-date-echeance').value = state.wizard.dateEcheance;
  }
}

// ── Step 1: Type selection ──
document.querySelectorAll('.type-card:not(.disabled)').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.type-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    state.wizard.type = card.dataset.type;
  });
});

document.getElementById('wiz-next-1').addEventListener('click', () => {
  renderWizardStep(2);
});

// ── Step 2: Client ──
document.getElementById('wiz-client-select').addEventListener('change', (e) => {
  state.wizard.clientId = e.target.value;
  const client = state.clients.find((c) => c.id === e.target.value);
  state.wizard.clientSnapshot = client || null;
});

document.getElementById('btn-add-client-inline').addEventListener('click', () => {
  const form = document.getElementById('inline-client-form');
  form.classList.toggle('open');
});

document.getElementById('btn-save-inline-client').addEventListener('click', async () => {
  const nom = document.getElementById('ic-nom').value.trim();
  const adresse = document.getElementById('ic-adresse').value.trim();
  const email = document.getElementById('ic-email').value.trim();
  const siret = document.getElementById('ic-siret').value.trim();

  if (!nom || !adresse) {
    showToast('Nom et adresse du client sont obligatoires.', 'warning');
    return;
  }

  try {
    setLoading(true);
    const id = await saveClient(state.user.uid, { nom_entreprise: nom, adresse, email, siret_client: siret });
    const newClient = { id, nom_entreprise: nom, adresse, email, siret_client: siret };
    state.clients.push(newClient);
    populateClientSelect();
    document.getElementById('wiz-client-select').value = id;
    state.wizard.clientId = id;
    state.wizard.clientSnapshot = newClient;
    document.getElementById('inline-client-form').classList.remove('open');
    // Clear fields
    ['ic-nom','ic-adresse','ic-email','ic-siret'].forEach((id) => { document.getElementById(id).value = ''; });
    setLoading(false);
    showToast('Client ajouté avec succès.', 'success');
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de l\'ajout du client.', 'error');
  }
});

document.getElementById('wiz-back-2').addEventListener('click', () => renderWizardStep(1));
document.getElementById('wiz-next-2').addEventListener('click', () => {
  if (!state.wizard.clientId) {
    showToast('Veuillez sélectionner ou créer un client.', 'warning');
    return;
  }
  renderWizardStep(3);
});

// ── Step 3: Details ──

// Exemple descriptions toggle
document.getElementById('btn-examples-toggle').addEventListener('click', () => {
  document.getElementById('examples-panel').classList.toggle('open');
});

// Click an example chip → inject into textarea
document.getElementById('examples-list').addEventListener('click', (e) => {
  const chip = e.target.closest('.example-chip');
  if (!chip) return;
  const textarea = document.getElementById('wiz-description');
  // Extract text content without the <strong> label
  const strong = chip.querySelector('strong');
  const text = chip.textContent.replace(strong.textContent, '').trim();
  textarea.value = text;
  state.wizard.description = text;
  textarea.focus();
  document.getElementById('examples-panel').classList.remove('open');
  showToast('Exemple inséré — personnalisez-le selon votre prestation.', 'default');
});

document.getElementById('wiz-date-emission').addEventListener('change', (e) => {
  state.wizard.dateEmission = e.target.value;
});
document.getElementById('wiz-date-echeance').addEventListener('change', (e) => {
  state.wizard.dateEcheance = e.target.value;
});
document.getElementById('wiz-description').addEventListener('input', (e) => {
  state.wizard.description = e.target.value;
});
document.getElementById('wiz-montant-ht').addEventListener('input', (e) => {
  state.wizard.montantHT = parseFloat(e.target.value) || 0;
  updateAmountPreview();
});
document.getElementById('wiz-tva-toggle').addEventListener('change', (e) => {
  state.wizard.tvaApplicable = e.target.checked;
  document.getElementById('tva-rate-row').style.display = e.target.checked ? 'block' : 'none';
  updateAmountPreview();
});
document.getElementById('wiz-taux-tva').addEventListener('change', (e) => {
  state.wizard.tauxTVA = parseFloat(e.target.value) || 20;
  updateAmountPreview();
});

// ─── Live Amount Preview ───────────────────────────────────────────────────────
function updateAmountPreview() {
  const ht = parseFloat(document.getElementById('wiz-montant-ht').value) || 0;
  const preview = document.getElementById('amount-preview');

  if (ht <= 0) {
    preview.classList.add('hidden');
    return;
  }

  preview.classList.remove('hidden');

  const tvaOn = state.wizard.tvaApplicable;
  const taux = state.wizard.tauxTVA || 20;
  const tva = tvaOn ? +(ht * (taux / 100)).toFixed(2) : 0;
  const ttc = tvaOn ? +(ht + tva).toFixed(2) : ht;

  document.getElementById('prev-ht-live').textContent = formatEuro(ht);
  document.getElementById('prev-ttc-live').textContent = formatEuro(ttc);

  const tvaRow = document.getElementById('prev-tva-live-row');
  const tvaNote = document.getElementById('prev-tva-note');

  if (tvaOn) {
    tvaRow.style.display = 'flex';
    document.getElementById('prev-tva-live-label').textContent = `TVA (${taux}%)`;
    document.getElementById('prev-tva-live').textContent = formatEuro(tva);
    tvaNote.style.display = 'none';
  } else {
    tvaRow.style.display = 'none';
    tvaNote.style.display = 'block';
  }
}

document.getElementById('wiz-back-3').addEventListener('click', () => renderWizardStep(2));

document.getElementById('btn-generate').addEventListener('click', async () => {
  const description = document.getElementById('wiz-description').value.trim();
  const montantHTRaw = parseFloat(document.getElementById('wiz-montant-ht').value) || 0;

  if (!description) {
    showToast('Veuillez décrire votre prestation.', 'warning');
    document.getElementById('wiz-description').focus();
    return;
  }
  if (montantHTRaw <= 0) {
    showToast('Le montant HT doit être supérieur à 0.', 'warning');
    document.getElementById('wiz-montant-ht').focus();
    return;
  }

  state.wizard.description = description;
  state.wizard.montantHT = montantHTRaw;

  // Check monthly limit BEFORE calling Claude
  try {
    const count = await checkAndResetMonthlyCount(state.user.uid);
    if (count >= 30) {
      openModal('limit-modal');
      return;
    }
  } catch (err) {
    console.error(err);
  }

  await runGeneration();
});

// Animate the checklist steps during generation (purely visual, non-blocking)
function animateGeneratingChecklist() {
  const steps = ['gen-step-1', 'gen-step-2', 'gen-step-3', 'gen-step-4'];
  const delays = [800, 5000, 12000, 20000]; // ms — approximate Claude response timeline
  steps.forEach((id, i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('done');
        el.querySelector('.check-icon').textContent = '✓';
      }
    }, delays[i]);
  });
}

async function runGeneration() {
  // Show generating screen
  showView('view-generating');
  animateGeneratingChecklist();

  const { montantHT, tvaApplicable, tauxTVA } = state.wizard;
  const montantTVA = tvaApplicable ? +(montantHT * (tauxTVA / 100)).toFixed(2) : 0;
  const montantTTC = tvaApplicable ? +(montantHT + montantTVA).toFixed(2) : montantHT;

  try {
    // Get next document number
    const numero = await getNextDocumentNumber(state.user.uid, state.wizard.type);
    state.wizard.numero = numero;

    const payload = {
      emetteur: {
        nom: state.profile.nom_prenom,
        siret: state.profile.siret,
        adresse: state.profile.adresse,
        telephone: state.profile.telephone,
        iban: state.profile.rib_iban || ''
      },
      client: {
        nom: state.wizard.clientSnapshot.nom_entreprise,
        adresse: state.wizard.clientSnapshot.adresse,
        siret: state.wizard.clientSnapshot.siret_client || ''
      },
      document_info: {
        numero,
        date_emission: state.wizard.dateEmission,
        date_echeance: state.wizard.dateEcheance
      },
      prestations: { description: state.wizard.description },
      montants: {
        ht: montantHT,
        tva_applicable: tvaApplicable,
        taux_tva: tauxTVA,
        montant_tva: montantTVA,
        ttc: montantTTC
      }
    };

    const generatedText = await generateDocument(payload);
    state.wizard.generatedText = generatedText;

    // Save to Firestore & increment counter
    const docData = {
      type: state.wizard.type,
      numero,
      client_id: state.wizard.clientId,
      client_snapshot: state.wizard.clientSnapshot,
      date_emission: state.wizard.dateEmission,
      date_echeance: state.wizard.dateEcheance,
      description_input: state.wizard.description,
      lignes: [{
        description: state.wizard.description,
        quantite: 1,
        prix_unitaire: montantHT,
        total: montantHT
      }],
      montant_ht: montantHT,
      tva_applicable: tvaApplicable,
      taux_tva: tauxTVA,
      montant_tva: montantTVA,
      montant_ttc: montantTTC,
      generated_text: generatedText,
      status: 'final'
    };

    const savedId = await saveDocument(state.user.uid, docData);
    state.wizard.savedDocId = savedId;
    await incrementMonthlyCount(state.user.uid);

    // Show preview
    renderPreview({ ...docData, id: savedId });
    showView('view-preview');
    showToast('Facture générée avec succès ! 🎉', 'success');

  } catch (err) {
    console.error(err);
    showToast(`Erreur : ${err.message || 'Impossible de générer la facture.'}`, 'error');
    showView('view-new-document');
    renderWizardStep(3);
  }
}

// ─── Document Preview ─────────────────────────────────────────────────────────
function renderPreview(docData) {
  const profile = state.profile || {};

  // Header
  document.getElementById('prev-numero').textContent = docData.numero || '';
  document.getElementById('prev-title').textContent = (docData.type || 'facture').toUpperCase();

  // Emitter
  document.getElementById('prev-emetteur-nom').textContent = profile.nom_prenom || '';
  document.getElementById('prev-emetteur-detail').innerHTML = [
    profile.adresse,
    `SIRET : ${profile.siret}`,
    profile.telephone
  ].filter(Boolean).join('<br>');

  // Client
  const client = docData.client_snapshot || {};
  document.getElementById('prev-client-nom').textContent = client.nom_entreprise || '';
  document.getElementById('prev-client-detail').innerHTML = [
    client.adresse,
    client.siret_client ? `SIRET : ${client.siret_client}` : ''
  ].filter(Boolean).join('<br>');

  // Dates
  document.getElementById('prev-date-emission').textContent = `Émission : ${formatDate(docData.date_emission) || docData.date_emission}`;
  document.getElementById('prev-date-echeance').textContent = `Échéance : ${formatDate(docData.date_echeance) || docData.date_echeance}`;

  // Generated text
  document.getElementById('prev-generated-text').textContent = docData.generated_text || '';

  // Totals
  document.getElementById('prev-ht').textContent = formatEuro(docData.montant_ht);
  const tvaRow = document.getElementById('prev-tva-row');
  if (docData.tva_applicable) {
    tvaRow.style.display = 'flex';
    document.getElementById('prev-tva-label').textContent = `TVA (${docData.taux_tva}%)`;
    document.getElementById('prev-tva').textContent = formatEuro(docData.montant_tva);
    document.getElementById('prev-ttc').textContent = formatEuro(docData.montant_ttc);
  } else {
    tvaRow.style.display = 'none';
    document.getElementById('prev-ttc').textContent = formatEuro(docData.montant_ht);
  }

  // Legal
  const legalEl = document.getElementById('prev-legal');
  const legalItems = [];
  if (!docData.tva_applicable) legalItems.push('TVA non applicable, art. 293 B du CGI');
  legalItems.push(
    'En cas de retard de paiement, des pénalités de retard seront appliquées au taux de 3 fois le taux d\'intérêt légal en vigueur.',
    'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40€ (art. D. 441-5 du Code de commerce).',
    'Escompte pour règlement anticipé : aucun.'
  );
  legalEl.innerHTML = legalItems.map((l) => `<div>• ${l}</div>`).join('');

  // Store docData for PDF
  document._currentPreviewData = docData;
}

document.getElementById('btn-download-pdf').addEventListener('click', () => {
  const docData = document._currentPreviewData;
  if (!docData) { showToast('Aucun document à télécharger.', 'error'); return; }
  try {
    generatePDF(docData, state.profile || {});
    showToast('PDF téléchargé avec succès.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la génération du PDF.', 'error');
  }
});

document.getElementById('btn-prev-back').addEventListener('click', () => {
  showView('view-dashboard');
  loadDashboard();
});

// ─── Documents List ───────────────────────────────────────────────────────────
async function loadDocumentsList() {
  showView('view-documents');
  try {
    setLoading(true);
    state.documents = await getDocuments(state.user.uid);
    setLoading(false);
    renderDocumentsList(state.documents);
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors du chargement des documents.', 'error');
  }
}

function renderDocumentsList(docs) {
  const container = document.getElementById('docs-list');
  if (!docs || docs.length === 0) {
    container.innerHTML = `
      <div class="card-empty">
        <span class="empty-icon">📂</span>
        Aucun document trouvé.
      </div>`;
    return;
  }

  container.innerHTML = docs.map((doc) => `
    <div class="list-item">
      <div class="list-item-icon facture">${doc.type === 'facture' ? '🧾' : '📋'}</div>
      <div class="list-item-body">
        <div class="list-item-title">${doc.numero || '—'}</div>
        <div class="list-item-sub">${doc.client_snapshot?.nom_entreprise || '—'} · ${formatDate(doc.date_emission)}</div>
      </div>
      <div class="list-item-right">
        <div class="list-item-amount">${formatEuro(doc.montant_ttc || doc.montant_ht)}</div>
        <div style="display:flex;gap:4px;margin-top:4px;">
          <button class="btn btn-sm btn-secondary" onclick="downloadDocPDF('${doc.id}')">PDF</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteDoc('${doc.id}')">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

// Search
document.getElementById('docs-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = state.documents.filter((d) =>
    (d.numero || '').toLowerCase().includes(q) ||
    (d.client_snapshot?.nom_entreprise || '').toLowerCase().includes(q)
  );
  renderDocumentsList(filtered);
});

window.downloadDocPDF = async function (docId) {
  try {
    setLoading(true);
    const { getDocument } = await import('./firebase-service.js');
    const doc = await getDocument(state.user.uid, docId);
    setLoading(false);
    if (!doc) { showToast('Document introuvable.', 'error'); return; }
    generatePDF(doc, state.profile || {});
    showToast('PDF téléchargé.', 'success');
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur PDF.', 'error');
  }
};

window.confirmDeleteDoc = function (docId) {
  if (!confirm('Supprimer ce document définitivement ?')) return;
  deleteDocumentById(docId);
};

async function deleteDocumentById(docId) {
  try {
    setLoading(true);
    await deleteDocument(state.user.uid, docId);
    setLoading(false);
    showToast('Document supprimé.', 'success');
    await loadDocumentsList();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de la suppression.', 'error');
  }
}

// ─── Clients View ─────────────────────────────────────────────────────────────
async function loadClientsView() {
  showView('view-clients');
  try {
    setLoading(true);
    state.clients = await getClients(state.user.uid);
    setLoading(false);
    renderClientsList();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors du chargement des clients.', 'error');
  }
}

function renderClientsList() {
  const container = document.getElementById('clients-list');
  if (!state.clients || state.clients.length === 0) {
    container.innerHTML = `
      <div class="card-empty">
        <span class="empty-icon">👥</span>
        Aucun client enregistré.
      </div>`;
    return;
  }

  container.innerHTML = state.clients.map((c) => `
    <div class="client-card">
      <div class="client-avatar">${(c.nom_entreprise || '?')[0].toUpperCase()}</div>
      <div class="client-card-body">
        <div class="client-card-name">${c.nom_entreprise}</div>
        <div class="client-card-sub">${c.adresse || ''}${c.email ? ' · ' + c.email : ''}</div>
      </div>
      <div class="client-card-actions">
        <button class="btn-icon" onclick="editClient('${c.id}')" title="Modifier">✏️</button>
        <button class="btn-icon" onclick="confirmDeleteClient('${c.id}')" title="Supprimer">🗑</button>
      </div>
    </div>`).join('');
}

document.getElementById('btn-add-client').addEventListener('click', () => {
  openModal('add-client-modal');
  // Clear form
  ['add-client-nom','add-client-adresse','add-client-email','add-client-siret'].forEach(
    (id) => { document.getElementById(id).value = ''; }
  );
  document.getElementById('add-client-modal').dataset.editId = '';
});

document.getElementById('form-add-client').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nom = document.getElementById('add-client-nom').value.trim();
  const adresse = document.getElementById('add-client-adresse').value.trim();
  const email = document.getElementById('add-client-email').value.trim();
  const siret = document.getElementById('add-client-siret').value.trim();

  if (!nom || !adresse) {
    showToast('Nom et adresse sont obligatoires.', 'warning');
    return;
  }

  const editId = document.getElementById('add-client-modal').dataset.editId;

  try {
    setLoading(true);
    if (editId) {
      await updateClient(state.user.uid, editId, { nom_entreprise: nom, adresse, email, siret_client: siret });
      showToast('Client mis à jour.', 'success');
    } else {
      await saveClient(state.user.uid, { nom_entreprise: nom, adresse, email, siret_client: siret });
      showToast('Client ajouté.', 'success');
    }
    closeModal('add-client-modal');
    setLoading(false);
    await loadClientsView();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de la sauvegarde du client.', 'error');
  }
});

window.editClient = function (clientId) {
  const client = state.clients.find((c) => c.id === clientId);
  if (!client) return;
  document.getElementById('add-client-nom').value = client.nom_entreprise || '';
  document.getElementById('add-client-adresse').value = client.adresse || '';
  document.getElementById('add-client-email').value = client.email || '';
  document.getElementById('add-client-siret').value = client.siret_client || '';
  document.getElementById('add-client-modal').dataset.editId = clientId;
  openModal('add-client-modal');
};

window.confirmDeleteClient = function (clientId) {
  if (!confirm('Supprimer ce client ?')) return;
  deleteClientById(clientId);
};

async function deleteClientById(clientId) {
  try {
    setLoading(true);
    await deleteClient(state.user.uid, clientId);
    setLoading(false);
    showToast('Client supprimé.', 'success');
    await loadClientsView();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de la suppression.', 'error');
  }
}

// ─── Profile View ─────────────────────────────────────────────────────────────
async function loadProfileView() {
  showView('view-profile');

  const profile = state.profile || {};
  document.getElementById('prof-nom').value = profile.nom_prenom || '';
  document.getElementById('prof-siret').value = profile.siret || '';
  document.getElementById('prof-adresse').value = profile.adresse || '';
  document.getElementById('prof-telephone').value = profile.telephone || '';
  document.getElementById('prof-iban').value = profile.rib_iban || '';
  document.getElementById('prof-email-display').textContent = state.user?.email || '';
  // Sync SIRET counter with loaded value
  document.getElementById('prof-siret').dispatchEvent(new Event('input'));

  try {
    const count = await checkAndResetMonthlyCount(state.user.uid);
    document.getElementById('prof-usage-label').textContent = `${count} / 30 documents ce mois`;
    const fill = document.getElementById('prof-usage-fill');
    const pct = Math.min((count / 30) * 100, 100);
    fill.style.width = `${pct}%`;
    fill.classList.toggle('warning', pct >= 67 && pct < 90);
    fill.classList.toggle('danger', pct >= 90);
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('form-profile').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nom = document.getElementById('prof-nom').value.trim();
  const siret = document.getElementById('prof-siret').value.trim();
  const adresse = document.getElementById('prof-adresse').value.trim();
  const telephone = document.getElementById('prof-telephone').value.trim();
  const iban = document.getElementById('prof-iban').value.trim();

  if (!validateSIRET(siret)) {
    showToast('Le numéro SIRET doit contenir exactement 14 chiffres.', 'error');
    return;
  }

  try {
    setLoading(true);
    await saveUserProfile(state.user.uid, { nom_prenom: nom, siret, adresse, telephone, rib_iban: iban });
    state.profile = await getUserProfile(state.user.uid);
    setLoading(false);
    showToast('Profil mis à jour.', 'success');
  } catch (err) {
    setLoading(false);
    console.error(err);
    showToast('Erreur lors de la mise à jour.', 'error');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (!confirm('Se déconnecter ?')) return;
  await signOut();
  state.user = null;
  state.profile = null;
  showView('login-screen');
});

// ─── Navigation ───────────────────────────────────────────────────────────────
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'view-dashboard') loadDashboard();
    else if (view === 'view-new-document') showNewDocument();
    else if (view === 'view-documents') loadDocumentsList();
    else if (view === 'view-clients') loadClientsView();
    else if (view === 'view-profile') loadProfileView();
  });
});

// Quick action button on dashboard
document.getElementById('btn-quick-new').addEventListener('click', () => showNewDocument());

// ─── Modal Close Buttons ──────────────────────────────────────────────────────
document.querySelectorAll('.modal-close, [data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.modal-backdrop');
    if (modal) modal.classList.remove('open');
  });
});

// ─── Limit Modal ──────────────────────────────────────────────────────────────
document.getElementById('btn-limit-close').addEventListener('click', () => {
  closeModal('limit-modal');
});

// ─── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/factureai/sw.js').catch(console.error);
}
