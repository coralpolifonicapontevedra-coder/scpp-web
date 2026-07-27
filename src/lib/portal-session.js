import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs',
  authDomain: 'scpp-portal-privado.firebaseapp.com',
  projectId: 'scpp-portal-privado',
  storageBucket: 'scpp-portal-privado.firebasestorage.app',
  messagingSenderId: '506857659587',
  appId: '1:506857659587:web:a7ed36b22f044f5f639676'
};

const CACHE_KEY = 'scpp-portal-session-v1';
const CACHE_TTL = 15 * 60 * 1000;

export const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
auth.useDeviceLanguage();

export function waitForPortalUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

export function readPortalSession() {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.savedAt || Date.now() - cached.savedAt > CACHE_TTL) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export function savePortalSession(profile = {}) {
  const value = {
    email: String(profile.email || auth.currentUser?.email || '').trim().toLowerCase(),
    nome: String(profile.nome || profile.nomeCompleto || '').trim(),
    cargo: String(profile.cargo || '').trim(),
    nivel: String(profile.nivel || profile.nivelAcceso || 'Coralistas').trim(),
    modulos: Array.isArray(profile.modulos) ? profile.modulos : [],
    savedAt: Date.now()
  };
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(value));
  return value;
}

export function clearPortalSession() {
  try { window.sessionStorage.removeItem(CACHE_KEY); } catch {}
}

export async function portalRequest(endpoint, accion, extra = {}, options = {}) {
  const user = auth.currentUser || await waitForPortalUser();
  if (!user?.email) throw new Error('A sesión xa non está activa.');
  const idToken = await user.getIdToken(Boolean(options.forceRefresh));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accion, ...extra })
  });
  if (options.blob && response.ok) return response.blob();
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.erro || result?.detalle || 'Non foi posible completar a solicitude.');
  }
  if (result.perfil || result.usuario) savePortalSession(result.perfil || result.usuario);
  return result;
}

export async function closePortalSession(redirect = '/portal/') {
  clearPortalSession();
  await signOut(auth);
  window.location.href = redirect;
}
