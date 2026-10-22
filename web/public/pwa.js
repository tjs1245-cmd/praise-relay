// 방명록을 앱처럼 쓰게 해 주는 스크립트예요. 방명록 화면의 <head>에서 불러요.
// 1) 서비스 워커(/sw.js)를 등록하고 2) "새 글 알림 켜기" 버튼을 붙이고
// 3) 알림을 허용하면 화면이 열려 있는 동안 15초마다 /api/entries를 확인해서 새 글이 있으면 알려요.
// /api/entries의 응답 모양({"entries": [{id, name, message, created_at}, ...]})만 맞으면
// Python, Next.js, React + Spring 어느 방명록에서도 그대로 써요.
(() => {
  const API = '/api/entries';
  const INTERVAL_MS = 15000;
  const STORAGE_KEY = 'guestbook-last-seen-id';

  const panel = document.createElement('div');
  panel.id = 'pwa-panel';
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10;display:flex;gap:10px;align-items:center;'
    + 'max-width:calc(100% - 32px);padding:10px 12px;border-radius:16px;background:#FFF1E6;color:#2B2926;'
    + 'font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(43,41,38,.12)';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '새 글 알림 켜기';
  button.style.cssText = 'border:0;border-radius:12px;padding:8px 12px;background:#FF6F0F;color:#2B2926;font:inherit;font-weight:700;cursor:pointer';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  panel.append(button, status);

  const say = (text) => { status.textContent = text; };
  const readLastSeen = () => {
    try { const value = localStorage.getItem(STORAGE_KEY); return value === null ? null : Number(value); } catch { return null; }
  };
  const writeLastSeen = (id) => {
    try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* 저장이 막힌 창에서는 이번 창에서만 기억해요 */ }
  };

  let registration = null;
  let timer = null;
  let lastSeen = readLastSeen();

  async function check() {
    let entries;
    try {
      const response = await fetch(API, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      entries = (await response.json()).entries;
    } catch {
      say('서버에 연결하지 못했어요. 다음 확인 때 다시 시도해요.');
      return;
    }
    const latest = entries.length ? entries[0].id : 0;
    // 처음 확인할 때와 DB를 새로 만들어 번호가 줄었을 때는 기준만 잡고 알리지 않아요.
    if (lastSeen === null || latest < lastSeen) {
      lastSeen = latest;
      writeLastSeen(latest);
      say('알림 켜짐 · 15초마다 새 글을 확인해요');
      return;
    }
    const fresh = entries.filter((entry) => entry.id > lastSeen);
    if (!fresh.length) {
      say('알림 켜짐 · 15초마다 새 글을 확인해요');
      return;
    }
    lastSeen = latest;
    writeLastSeen(latest);
    const newest = fresh[0];
    const title = fresh.length === 1 ? `새 방명록: ${newest.name}` : `새 방명록 ${fresh.length}개`;
    await registration.showNotification(title, {
      body: newest.message.slice(0, 120),
      icon: '/icons/icon-192.png',
      tag: 'guestbook-new',
    });
    // 방명록 화면의 목록 함수(loadEntries)가 있으면 목록도 새로 그려요.
    if (typeof window.loadEntries === 'function') window.loadEntries();
    say(`새 글 ${fresh.length}개를 알렸어요`);
  }

  function start() {
    button.hidden = true;
    if (timer) return;
    check();
    timer = setInterval(check, INTERVAL_MS);
  }

  button.addEventListener('click', async () => {
    // 알림 권한은 버튼을 누른 순간에 물어요. 페이지를 열자마자 물으면 막는 브라우저가 있어요.
    const permission = await Notification.requestPermission();
    if (permission === 'granted') start();
    else say('알림이 꺼져 있어요. 브라우저의 사이트 설정에서 알림을 허용해 주세요.');
  });

  function boot() {
    document.body.append(panel);
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      button.disabled = true;
      say('이 주소에서는 앱 기능을 쓸 수 없어요. 127.0.0.1, localhost, https 주소로 열었는지 확인해 주세요.');
      return;
    }
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((ready) => {
        registration = ready;
        document.documentElement.dataset.pwa = 'ready';
        if (Notification.permission === 'granted') start();
        else if (Notification.permission === 'denied') {
          button.hidden = true;
          say('알림이 막혀 있어요. 브라우저의 사이트 설정에서 알림을 허용해 주세요.');
        } else say('앱 준비됨');
      })
      .catch((error) => say(`서비스 워커를 등록하지 못했어요: ${error.message}`));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
