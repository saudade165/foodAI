const CACHE="nutritrack-personal-v5";
const CORE=["./","./index.html","./css/style.css","./js/app.js","./manifest.json","./icons/icon-192.png"];
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await self.skipWaiting()})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith("nutritrack-personal-")&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 // Network-first for app shell and scripts so deployed fixes appear instead of stale cached code.
 const isAppShell=request.mode==="navigate"||/\/(index\.html|app\.js|style\.css|manifest\.json)$/.test(url.pathname);
 event.respondWith((async()=>{const cache=await caches.open(CACHE);if(isAppShell){try{const fresh=await fetch(request,{cache:"no-store"});if(fresh.ok)await cache.put(request,fresh.clone());return fresh}catch(error){const cached=await cache.match(request)||await cache.match("./index.html");if(cached)return cached;throw error}}
 const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response})());
});
