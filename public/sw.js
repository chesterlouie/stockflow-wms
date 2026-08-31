const CACHE='warevanta-wms-shell-v2';
const SHELL=['/offline.html','/favicon.svg','/manifest.webmanifest'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()),
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()),
));

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
    return;
  }
  if(SHELL.includes(url.pathname))event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)));
});
