document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  loadHistory();

  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  document.getElementById('testBtn').addEventListener('click', testAlert);
  document.getElementById('refreshHistory').addEventListener('click', loadHistory);
});

async function loadConfig() {
  const res = await fetch('/api/config');
  const config = await res.json();

  document.getElementById('areas').value = (config.areas || []).join('\n');

  const radios = document.querySelectorAll('input[name="pollInterval"]');
  radios.forEach(r => { r.checked = parseInt(r.value) === config.pollInterval; });

  document.getElementById('openBrowser').checked = config.alertActions?.openBrowser ?? true;
  document.getElementById('notification').checked = config.alertActions?.notification ?? true;
  document.getElementById('sound').checked = config.alertActions?.sound ?? true;

  document.getElementById('browserUrl').value = config.browserUrl || 'https://www.n12.co.il/';
  document.getElementById('alertCooldown').value = String(config.alertCooldown || 60000);
}

async function saveConfig() {
  const areasText = document.getElementById('areas').value.trim();
  const areas = areasText ? areasText.split('\n').map(a => a.trim()).filter(Boolean) : [];

  const pollRadio = document.querySelector('input[name="pollInterval"]:checked');
  const pollInterval = pollRadio ? parseInt(pollRadio.value) : 5000;

  const config = {
    areas,
    pollInterval,
    alertActions: {
      openBrowser: document.getElementById('openBrowser').checked,
      notification: document.getElementById('notification').checked,
      sound: document.getElementById('sound').checked
    },
    browserUrl: document.getElementById('browserUrl').value || 'https://www.n12.co.il/',
    alertCooldown: parseInt(document.getElementById('alertCooldown').value)
  };

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  showToast('Settings saved!');
}

async function testAlert() {
  await fetch('/api/test-alert', { method: 'POST' });
  showToast('Test alert triggered!');
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const history = await res.json();
  const container = document.getElementById('history');

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (history.length === 0) {
    const p = document.createElement('div');
    p.className = 'nd-empty';
    p.textContent = 'No alerts yet.';
    container.appendChild(p);
    return;
  }

  history.forEach(h => {
    const item = document.createElement('div');
    item.className = 'nd-history-item';

    const time = document.createElement('div');
    time.className = 'nd-history-item__time';
    time.textContent = new Date(h.timestamp).toLocaleString('he-IL');
    item.appendChild(time);

    const areas = document.createElement('div');
    areas.className = 'nd-history-item__areas';
    areas.textContent = h.areas.join(', ');
    item.appendChild(areas);

    const desc = document.createElement('div');
    desc.className = 'nd-history-item__desc';
    desc.textContent = [h.title, h.description].filter(Boolean).join(' - ');
    item.appendChild(desc);

    container.appendChild(item);
  });
}

function showToast(message) {
  let toast = document.querySelector('.nd-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'nd-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
