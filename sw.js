const VERSION='0.2.3';
const CACHE='nivedit-iphone-'+VERSION;
const base=self.registration.scope;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // Cache-busted requests bypass both the browser HTTP cache and prior SW assets.
 // Verify the release before publishing any cached shell to this installation.
 const manifestResponse=await fetch(new URL('release.json?v='+VERSION,base),{cache:'no-store'});
 if(!manifestResponse.ok)throw new Error('Release manifest unavailable');
 const manifest=await manifestResponse.json();
 if(manifest.version!==VERSION)throw new Error('Release version mismatch');
 const assets=await Promise.all(Object.entries(manifest.assets).map(async([name,expected])=>{
  const canonical=new URL(name,base);
  if(canonical.origin!==location.origin||!canonical.href.startsWith(base))throw new Error('Invalid release path');
  const requestUrl=new URL(canonical);requestUrl.searchParams.set('__nivedit_release',VERSION);
  const response=await fetch(requestUrl,{cache:'no-store'});
  if(!response.ok)throw new Error('Missing asset '+name);
  const bytes=await response.clone().arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw new Error('Asset version mismatch: '+name);
  return [canonical,response];
 }));
 const cache=await caches.open(CACHE);
 for(const [url,response] of assets){
  await cache.put(url.href,response.clone());
  if(url.pathname===new URL('index.html',base).pathname)await cache.put(base,response.clone());
 }
})()));
// Activate only after the user chooses Update, or once all older clients close.
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_VERSION')event.ports[0]?.postMessage({version:VERSION});
 if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('nivedit-iphone-')&&k!==CACHE).map(k=>caches.delete(k)));
 // Project IndexedDB and OPFS media are deliberately not touched.
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin||!url.href.startsWith(base))return;
 const recovery=url.pathname===new URL('update.html',base).pathname||url.pathname===new URL('release.json',base).pathname;
 if(recovery){event.respondWith(fetch(event.request,{cache:'no-store'}));return;}
 const canonical=new URL(url);canonical.search='';canonical.hash='';
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(canonical.href)).then(hit=>hit||fetch(event.request)));
});
