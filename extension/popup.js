// 확장 아이콘을 누르면 열리는 작은 창이에요. 최신 글 5개를 보여 주고, 읽지 않은 수를 지워요.
const GUESTBOOK = 'http://localhost:5173';
const list = document.querySelector('#entry-list');
const status = document.querySelector('#status');

async function render() {
  status.textContent = '불러오는 중…';
  try {
    const response = await fetch(`${GUESTBOOK}/api/entries`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const { entries } = await response.json();
    list.replaceChildren();
    for (const entry of entries.slice(0, 5)) {
      const item = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = entry.name;
      const message = document.createElement('p');
      message.textContent = entry.message;
      item.append(name, message);
      list.append(item);
    }
    status.textContent = entries.length ? '' : '아직 기록이 없어요.';
  } catch {
    status.textContent = `방명록 서버(${GUESTBOOK})가 켜져 있는지 확인해 주세요.`;
  }
}

document.querySelector('#check-now').addEventListener('click', async () => {
  status.textContent = '확인하는 중…';
  await chrome.runtime.sendMessage({ type: 'check-now' });
  await render();
});

document.querySelector('#open-guestbook').href = `${GUESTBOOK}/`;
chrome.storage.local.set({ unread: 0 });
chrome.action.setBadgeText({ text: '' });
render();
