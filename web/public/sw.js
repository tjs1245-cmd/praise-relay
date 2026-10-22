// 방명록 서비스 워커예요. 페이지와 같은 출처의 /sw.js 주소로 내보내야 이 사이트 전체(/)를 맡을 수 있어요.
const OFFLINE_PAGE = `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>방명록 · 연결 끊김</title>
<body style="margin:0;padding:48px 28px;font-family:system-ui,sans-serif;color:#2B2926;background:#FFFCF8">
<h1 style="font-size:28px">서버에 연결할 수 없어요</h1>
<p>방명록 서버가 켜져 있는지 확인하고 다시 열어 주세요.</p></body></html>`;

// 새 버전이 오면 기다리지 않고 바로 맡아요.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// 화면을 여는 요청(페이지 이동)만 다뤄요. 서버가 꺼져 있으면 빈 화면 대신 안내 문장을 보여 줘요.
// API 요청과 CSS·JS 요청은 건드리지 않고 그대로 서버로 보내요.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })),
  );
});

// 알림을 누르면 열려 있는 방명록 창으로 가고, 없으면 새로 열어요.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow('/');
  })());
});
