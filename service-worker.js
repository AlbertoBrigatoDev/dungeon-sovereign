/* Manifest version: 3jydZFlT */
// Service worker per la build pubblicata (dotnet publish).
// Precarica tutti gli asset elencati in service-worker-assets.js, generato
// automaticamente da Blazor in base alla proprieta' ServiceWorkerAssetsManifest
// del csproj. Serve gli asset dalla cache quando l'app e' offline e ricade
// sulla rete altrimenti. Per le richieste di navigazione, risponde sempre con
// index.html in modo che il routing Blazor funzioni anche offline.

self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall(event)));
self.addEventListener('activate', event => event.waitUntil(onActivate(event)));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

const cacheNamePrefix = 'dungeon-sovereign-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;

const offlineAssetsInclude = [
    /\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.json$/, /\.css$/,
    /\.woff2?$/, /\.ttf$/, /\.otf$/,
    /\.png$/, /\.jpe?g$/, /\.gif$/, /\.svg$/, /\.webp$/, /\.ico$/,
    /\.mp3$/, /\.ogg$/, /\.wav$/, /\.m4a$/,
    /\.webmanifest$/, /\.blat$/, /\.dat$/
];

const offlineAssetsExclude = [
    /^service-worker\.js$/,
    /^service-worker-assets\.js$/
];

const base = '/';
const baseUrl = new URL(base, self.origin);
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

async function onInstall(event) {
    const assetsRequests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
        .map(asset => new Request(asset.url, { integrity: asset.hash, cache: 'no-cache' }));
    const cache = await caches.open(cacheName);
    await cache.addAll(assetsRequests);
}

async function onActivate(event) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys
        .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
        .map(key => caches.delete(key)));
    await self.clients.claim();
}

async function onFetch(event) {
    if (event.request.method !== 'GET') {
        return fetch(event.request);
    }

    const shouldServeIndexHtml = event.request.mode === 'navigate'
        && !manifestUrlList.some(url => url === event.request.url);

    const request = shouldServeIndexHtml ? 'index.html' : event.request;
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    return cachedResponse || fetch(event.request);
}
