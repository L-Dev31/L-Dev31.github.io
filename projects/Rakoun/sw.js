/*
 * Rakoun — Service Worker (vanilla, sans dépendance ni build).
 *
 * Portée (scope) : ce fichier vit dans /projects/Rakoun/, il ne contrôle donc
 * que les pages de ce dossier. Tous les chemins ci-dessous sont RELATIFS à
 * l'emplacement du SW (obligatoire : le site est hébergé dans un sous-dossier
 * GitHub Pages, pas à la racine du domaine).
 *
 * ─── VERSIONING / CACHE-BUSTING ────────────────────────────────────────────
 * Incrémente APP_VERSION à CHAQUE déploiement qui touche un asset (JS, CSS,
 * images, police…). Incrémente DICT_VERSION dès que le contenu d'un fichier
 * de dict/*.json change. Un changement de l'une ou l'autre valeur modifie le
 * nom du cache → l'ancien cache est purgé à l'activation et l'utilisateur
 * reçoit la version fraîche. C'est le mécanisme de cache-busting « simple »
 * demandé : pas besoin de renommer les fichiers avec un hash.
 */
const APP_VERSION = "15";
const DICT_VERSION = "1";

const STATIC_CACHE = `rakoun-static-v${APP_VERSION}`;
const DICT_CACHE = `rakoun-dict-v${DICT_VERSION}`;
const RUNTIME_CACHE = `rakoun-runtime-v${APP_VERSION}`;

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "style.css",
  "js/engine.js",
  "js/listen.js",
  "js/app.js",
  "js/eyes.js",
  "font/FredokaOne-Regular.ttf",
  "images/rakoun.png",
  "images/eye.png",
  "images/favicon.png",
  "images/flags/fr.png",
  "images/flags/gp.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

// Dictionnaire + règles grammaticales — cache séparé, versionné indépendamment.
const DICT_FILES = [
  "dict/Grammar.json",
  "dict/Verbs.json",
  "dict/Nouns.json",
  "dict/Adjectives.json",
  "dict/Adverbs.json",
  "dict/Misc.json",
];

// Hôtes tiers dont on veut pouvoir réafficher le contenu hors-ligne
// (les icônes de l'interface viennent d'Iconify). GTM n'est volontairement
// PAS mis en cache : l'analytics n'a aucun intérêt offline.
const RUNTIME_ALLOWED_HOSTS = ["code.iconify.design", "api.iconify.design"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(APP_SHELL);
      const dictCache = await caches.open(DICT_CACHE);
      await dictCache.addAll(DICT_FILES);
      // Applique la mise à jour sans attendre la fermeture des onglets.
      await self.skipWaiting();
    })()
  );
});

// ─── Activate : purge les anciens caches (toute version obsolète) ───────────
self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, DICT_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("rakoun-") && !keep.has(name))
          .map((name) => caches.delete(name))
      );
      // Prend le contrôle de toutes les pages ouvertes immédiatement.
      await self.clients.claim();
    })()
  );
});

// ─── Fetch : stratégies par type de ressource ───────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations (ouverture de page) : réseau d'abord, repli sur la page en cache.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Même origine : cache-first pour les assets statiques et le dictionnaire.
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Tiers autorisés (Iconify) : stale-while-revalidate pour survivre offline.
  if (RUNTIME_ALLOWED_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Tout le reste (GTM, etc.) : comportement réseau par défaut, pas de cache.
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    // Rafraîchit la copie cache de la page pour les prochains accès offline.
    const cache = await caches.open(STATIC_CACHE);
    cache.put("index.html", response.clone());
    return response;
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match("index.html")) ||
      (await caches.match("./"))
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // opaque (no-cors) ou 200 : on met en cache pour l'offline.
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
