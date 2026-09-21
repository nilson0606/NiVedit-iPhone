const CACHE='nivedit-iphone-0.1.3';
const FILES=['./','./index.html','./src/style.css','./src/app.js','./src/model.js','./src/storage.js','./src/i18n.js','./src/export-worker.js','./vendor/mediabunny.mjs','./manual.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
// No skipWaiting: an update must not replace an active editing session.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nivedit-iphone-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin||!url.href.startsWith(self.registration.scope))return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));});

