// 확장 프로그램의 서비스 워커예요. 화면이 없고, 할 일이 없으면 Chrome이 잠시 꺼 둬요.
// 그래서 변수에 기억하지 않고 chrome.storage에 적어 두고, 30초마다 chrome.alarms로 깨어나서 확인해요.
// 다른 방명록(내 React 화면 5173, Spring 8080)을 보려면 아래 주소, popup.js의 GUESTBOOK, manifest.json의 host_permissions를 같이 바꿔요.
const GUESTBOOK = 'http://localhost:5173';
const ALARM = 'check-guestbook';

async function ensureAlarm() {
  // 알람은 브라우저를 다시 켜면 사라질 수 있어서, 깨어날 때마다 있는지 보고 없으면 만들어요.
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  }
}

async function showBadge(text, title) {
  await chrome.action.setBadgeBackgroundColor({ color: '#FF6F0F' });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

async function check() {
  let entries;
  try {
    const response = await fetch(`${GUESTBOOK}/api/entries`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    entries = (await response.json()).entries;
  } catch {
    await showBadge('!', `방명록 서버(${GUESTBOOK})에 연결하지 못했어요`);
    return;
  }
  const latest = entries.length ? entries[0].id : 0;
  const { lastSeenId, unread = 0 } = await chrome.storage.local.get(['lastSeenId', 'unread']);
  // 처음 확인할 때와 DB를 새로 만들어 번호가 줄었을 때는 기준만 잡고 알리지 않아요.
  if (lastSeenId === undefined || latest < lastSeenId) {
    await chrome.storage.local.set({ lastSeenId: latest, unread: 0 });
    await showBadge('', '방명록 알림');
    return;
  }
  const fresh = entries.filter((entry) => entry.id > lastSeenId);
  if (!fresh.length) {
    await showBadge(unread ? String(unread) : '', '방명록 알림');
    return;
  }
  const newest = fresh[0];
  await chrome.notifications.create(`guestbook-${newest.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: fresh.length === 1 ? `새 방명록: ${newest.name}` : `새 방명록 ${fresh.length}개`,
    message: newest.message.slice(0, 120),
  });
  await chrome.storage.local.set({ lastSeenId: latest, unread: unread + fresh.length });
  await showBadge(String(unread + fresh.length), `읽지 않은 새 글 ${unread + fresh.length}개`);
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  await check();
});
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) check();
});

// 알림을 누르면 방명록을 새 탭으로 열어요.
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.create({ url: `${GUESTBOOK}/` });
});

// 팝업의 "지금 확인" 버튼이 보내는 메시지예요.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'check-now') return false;
  check().then(() => sendResponse({ ok: true }));
  return true; // 답을 나중에 보낸다고 알려요.
});
