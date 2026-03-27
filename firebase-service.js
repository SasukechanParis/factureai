// FacturAI — Firebase Service
// Handles Firebase Auth (Google Sign-In) + all Firestore CRUD operations

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBXxVaSv6mKLKfECJIel5FWJ9hDUhEGTh4",
  authDomain: "factureai-5712f.firebaseapp.com",
  projectId: "factureai-5712f",
  storageBucket: "factureai-5712f.firebasestorage.app",
  messagingSenderId: "494103923234",
  appId: "1:494103923234:web:234d48c3379439e077187b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ─── Auth ────────────────────────────────────────────────────────────────────

// IMPORTANT: Must be non-async to preserve Safari gesture chain for popup
export function signInWithGoogle() {
  signInWithPopup(auth, provider).catch((error) => {
    console.error('Erreur connexion Google:', error);
    window.showToast('Erreur lors de la connexion. Veuillez réessayer.', 'error');
  });
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function onAuthStateChanged(callback) {
  return firebaseOnAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveUserProfile(uid, data) {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true });
}

export async function createUserProfile(uid, data) {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, {
    ...data,
    subscription_status: 'trial',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(uid) {
  const ref = collection(db, 'users', uid, 'clients');
  const q = query(ref, orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveClient(uid, clientData) {
  const ref = collection(db, 'users', uid, 'clients');
  const docRef = await addDoc(ref, {
    ...clientData,
    created_at: serverTimestamp()
  });
  return docRef.id;
}

export async function updateClient(uid, clientId, data) {
  const ref = doc(db, 'users', uid, 'clients', clientId);
  await updateDoc(ref, { ...data, updated_at: serverTimestamp() });
}

export async function deleteClient(uid, clientId) {
  const ref = doc(db, 'users', uid, 'clients', clientId);
  await deleteDoc(ref);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getDocuments(uid) {
  const ref = collection(db, 'users', uid, 'documents');
  const q = query(ref, orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRecentDocuments(uid, count = 5) {
  const ref = collection(db, 'users', uid, 'documents');
  const q = query(ref, orderBy('created_at', 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDocument(uid, docId) {
  const ref = doc(db, 'users', uid, 'documents', docId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveDocument(uid, docData) {
  const ref = collection(db, 'users', uid, 'documents');
  const docRef = await addDoc(ref, {
    ...docData,
    created_at: serverTimestamp()
  });
  return docRef.id;
}

export async function updateDocument(uid, docId, data) {
  const ref = doc(db, 'users', uid, 'documents', docId);
  await updateDoc(ref, { ...data, updated_at: serverTimestamp() });
}

export async function deleteDocument(uid, docId) {
  const ref = doc(db, 'users', uid, 'documents', docId);
  await deleteDoc(ref);
}

// ─── Stats & Document Numbering ───────────────────────────────────────────────

export async function getStats(uid) {
  const ref = doc(db, 'users', uid, 'stats', 'main');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function initStats(uid) {
  const ref = doc(db, 'users', uid, 'stats', 'main');
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  await setDoc(ref, {
    monthly_count: 0,
    monthly_reset_date: Timestamp.fromDate(firstOfMonth),
    total_documents: 0,
    last_facture_number: 0,
    last_devis_number: 0
  });
}

export async function checkAndResetMonthlyCount(uid) {
  const stats = await getStats(uid);
  if (!stats) {
    await initStats(uid);
    return 0;
  }
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const resetDate = stats.monthly_reset_date?.toDate() || new Date(0);

  if (resetDate < firstOfMonth) {
    // Reset monthly count
    const ref = doc(db, 'users', uid, 'stats', 'main');
    await updateDoc(ref, {
      monthly_count: 0,
      monthly_reset_date: Timestamp.fromDate(firstOfMonth)
    });
    return 0;
  }
  return stats.monthly_count || 0;
}

export async function incrementMonthlyCount(uid) {
  const ref = doc(db, 'users', uid, 'stats', 'main');
  const stats = await getStats(uid);
  if (!stats) {
    await initStats(uid);
  }
  const current = stats ? (stats.monthly_count || 0) : 0;
  const total = stats ? (stats.total_documents || 0) : 0;
  await updateDoc(ref, {
    monthly_count: current + 1,
    total_documents: total + 1
  });
}

export async function getNextDocumentNumber(uid, type) {
  const year = new Date().getFullYear();
  const ref = doc(db, 'users', uid, 'stats', 'main');
  const stats = await getStats(uid);

  if (!stats) {
    await initStats(uid);
  }

  const field = type === 'facture' ? 'last_facture_number' : 'last_devis_number';
  const prefix = type === 'facture' ? 'FA' : 'DE';

  // Check if year has changed — reset counter if so
  const yearField = type === 'facture' ? 'last_facture_year' : 'last_devis_year';
  const lastYear = stats ? (stats[yearField] || 0) : 0;
  let lastNum = stats ? (stats[field] || 0) : 0;

  if (lastYear !== year) {
    lastNum = 0;
  }

  const nextNum = lastNum + 1;
  const padded = String(nextNum).padStart(3, '0');
  const numero = `${prefix}-${year}-${padded}`;

  await updateDoc(ref, {
    [field]: nextNum,
    [yearField]: year
  });

  return numero;
}
