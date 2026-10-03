// 离线可用：静态资源缓存优先，页面和脚本网络优先（方便更新）
const V = "gly21h-v1";
const ASSETS = ["./", "index.html", "style.css", "app.js", "data.js", "fonts/wenkai.woff2", "icon.svg",
  ...["cover", "sunset", "night", "rock", "garden", "food", "alley", "beach", "piano", "ferry"].map((n) => `img/${n}.jpg`)];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const fresh = /\.(html|js|css)$|\/$/.test(u.pathname);
  e.respondWith(fresh
    ? fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then((m) => m || fetch(e.request)));
});
