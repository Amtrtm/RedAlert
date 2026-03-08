let csrfToken = '';

// All city/area names from ISRAEL_AREAS (flat set for fast lookup)
const KNOWN_AREAS_SET = new Set(ISRAEL_AREAS.flatMap(g => g.items));

// Currently selected cities (from the picker)
let selectedCities = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const tokenRes = await fetch('/api/csrf-token');
  const tokenData = await tokenRes.json();
  csrfToken = tokenData.token;

  buildCityList();
  await loadConfig();
  loadHistory();

  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  document.getElementById('testBtn').addEventListener('click', testAlert);
  document.getElementById('refreshHistory').addEventListener('click', loadHistory);

  // Tab switching
  document.querySelectorAll('.nd-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // City search filter
  document.getElementById('city-search').addEventListener('input', e => {
    filterCityList(e.target.value.trim());
  });
});

// ── City Picker ────────────────────────────────────────────────────────────

function buildCityList() {
  const container = document.getElementById('city-list');
  container.innerHTML = '';

  ISRAEL_AREAS.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'nd-city-group';
    groupEl.dataset.region = group.region;

    const label = document.createElement('div');
    label.className = 'nd-city-group__label';
    label.textContent = group.region;
    groupEl.appendChild(label);

    group.items.forEach(city => {
      const item = document.createElement('label');
      item.className = 'nd-city-item';
      item.dataset.city = city;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = city;
      cb.checked = selectedCities.has(city);
      cb.addEventListener('change', () => toggleCity(city, cb.checked));

      const span = document.createElement('span');
      span.className = 'nd-city-item__name';
      span.textContent = city;

      item.appendChild(cb);
      item.appendChild(span);
      groupEl.appendChild(item);
    });

    container.appendChild(groupEl);
  });
}

function filterCityList(query) {
  const lower = query.toLowerCase();
  document.querySelectorAll('.nd-city-group').forEach(group => {
    let groupVisible = false;
    group.querySelectorAll('.nd-city-item').forEach(item => {
      const city = item.dataset.city;
      const match = !query || city.includes(query) || city.toLowerCase().includes(lower);
      item.style.display = match ? '' : 'none';
      if (match) groupVisible = true;
    });
    group.style.display = groupVisible ? '' : 'none';
  });
}

function toggleCity(city, checked) {
  if (checked) {
    selectedCities.add(city);
  } else {
    selectedCities.delete(city);
  }
  renderTags();
}

function renderTags() {
  const container = document.getElementById('selected-tags');
  container.innerHTML = '';

  if (selectedCities.size === 0) {
    const empty = document.createElement('span');
    empty.className = 'nd-tags__empty';
    empty.textContent = 'לא נבחרו אזורים';
    container.appendChild(empty);
    return;
  }

  selectedCities.forEach(city => {
    const tag = document.createElement('span');
    tag.className = 'nd-tag';

    const text = document.createElement('span');
    text.textContent = city;

    const remove = document.createElement('button');
    remove.className = 'nd-tag__remove';
    remove.innerHTML = '&times;';
    remove.title = 'הסר';
    remove.addEventListener('click', () => {
      selectedCities.delete(city);
      // uncheck the corresponding checkbox
      const cb = document.querySelector(`#city-list .nd-city-item[data-city="${CSS.escape(city)}"] input`);
      if (cb) cb.checked = false;
      renderTags();
    });

    tag.appendChild(text);
    tag.appendChild(remove);
    container.appendChild(tag);
  });
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.nd-tab').forEach(btn => {
    btn.classList.toggle('nd-tab--active', btn.dataset.tab === tab);
  });
  document.getElementById('tab-panel-picker').classList.toggle('nd-tab-panel--hidden', tab !== 'picker');
  document.getElementById('tab-panel-freetext').classList.toggle('nd-tab-panel--hidden', tab !== 'freetext');
}

// ── Config load / save ─────────────────────────────────────────────────────

async function loadConfig() {
  const res = await fetch('/api/config');
  const config = await res.json();

  const areas = config.areas || [];

  // Split areas: known ones go to picker, unknown ones go to free text
  const unknown = [];
  selectedCities.clear();

  areas.forEach(area => {
    if (KNOWN_AREAS_SET.has(area)) {
      selectedCities.add(area);
    } else {
      unknown.push(area);
    }
  });

  // Re-render picker checkboxes and tags
  buildCityList();
  renderTags();

  // Put unrecognised areas into the free text tab
  document.getElementById('areas-freetext').value = unknown.join('\n');

  const radios = document.querySelectorAll('input[name="pollInterval"]');
  radios.forEach(r => { r.checked = parseInt(r.value) === config.pollInterval; });

  document.getElementById('openBrowser').checked = config.alertActions?.openBrowser ?? true;
  document.getElementById('notification').checked = config.alertActions?.notification ?? true;
  document.getElementById('sound').checked = config.alertActions?.sound ?? true;

  document.getElementById('browserUrl').value = config.browserUrl || 'https://www.n12.co.il/';
  document.getElementById('alertCooldown').value = String(config.alertCooldown || 60000);
}

async function saveConfig() {
  // Merge picker selections + free text, deduplicate
  const freetextRaw = document.getElementById('areas-freetext').value.trim();
  const freetextAreas = freetextRaw ? freetextRaw.split('\n').map(a => a.trim()).filter(Boolean) : [];
  const areas = [...new Set([...selectedCities, ...freetextAreas])];

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

  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(config)
  });

  if (res.ok) {
    showToast('ההגדרות נשמרו!');
  } else {
    const err = await res.json();
    showToast('שגיאה: ' + (err.error || 'Unknown error'));
  }
}

// ── Test alert ─────────────────────────────────────────────────────────────

async function testAlert() {
  await fetch('/api/test-alert', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
  showToast('התרעת בדיקה נשלחה!');
}

// ── History ────────────────────────────────────────────────────────────────

async function loadHistory() {
  const res = await fetch('/api/history');
  const history = await res.json();
  const container = document.getElementById('history');

  while (container.firstChild) container.removeChild(container.firstChild);

  if (history.length === 0) {
    const p = document.createElement('div');
    p.className = 'nd-empty';
    p.textContent = 'אין התרעות עדיין.';
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

// ── Toast ──────────────────────────────────────────────────────────────────

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
