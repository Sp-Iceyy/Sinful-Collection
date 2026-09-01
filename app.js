const seedMedia = [];
const storageKey = 'framehouse-media-v2';
const userStoreKey = 'framehouse-users-v2';
const activeUserKey = 'framehouse-active-user';
const lastArtistKey = 'framehouse-last-artist';
const oldDemoTitles = ['Quiet Geometry', 'Pacific / 04', 'Citrus Study', 'Sunday Table', 'Soft Focus', 'Red Thread'];
let users = {}, currentUserId = localStorage.getItem(activeUserKey) || '', media = [], activeFilter = 'all', activeTags = [], removingFavoriteTags = false, removingMedia = false, selectedMediaIds = [], batchFiles = [], activeArtist = '', activeArtistEdit = null, activeView = 'library', activeFolder = '', editingId = null, safeMode = localStorage.getItem('framehouse-safe-mode') === 'true';
const $ = (selector) => document.querySelector(selector);
const formatDate = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const formatFolderDate = (value) => {
  if (!value) return 'Unsorted';
  const date = new Date(`${value}T12:00:00`);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`;
};
function getFolderName(item) { return (item?.folder && String(item.folder).trim()) || 'Unsorted'; }
function normalize(item) { const filename = item.src?.split('/').pop(); const src = item.type === 'video' && item.src?.startsWith('Media/') && !item.src.startsWith('Media/Videos/') ? `Media/Videos/${filename}` : item.src; return { ...item, src, artist: item.artist || '', description: item.description || '', tags: Array.isArray(item.tags) ? item.tags : [], folder: getFolderName(item), favorite: Boolean(item.favorite), favoriteDate: item.favoriteDate || (item.favorite ? item.date : '') }; }
function sanitizeUsername(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function getCurrentUser() { return currentUserId ? users[currentUserId] : null; }
function getCurrentMedia() { const user = getCurrentUser(); if (!user) return []; return Array.isArray(user.media) ? user.media.map(normalize) : []; }
function saveMedia() { const currentUser = getCurrentUser(); if (!currentUser) return Promise.resolve(); currentUser.media = media.map(normalize); return saveCatalog(); }
function saveCatalog() { const currentUser = getCurrentUser(); if (!currentUser) return Promise.resolve(); return fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: currentUserId, media: currentUser.media, favoriteTags: currentUser.favoriteTags || [], artists: currentUser.artists || [], folders: currentUser.folders || [] }) }).catch(() => {}); }
async function loadUsers() {
  try {
    const response = await fetch('/api/catalog?profile=');
    const catalog = response.ok ? await response.json() : { profiles: {} };
    users = Object.fromEntries(Object.entries(catalog.profiles || {}).map(([id, value]) => [id, { id, username: value.username || id, media: (value.media || []).map(normalize), favoriteTags: Array.isArray(value.favoriteTags) ? value.favoriteTags : [], artists: Array.isArray(value.artists) ? value.artists : [], folders: Array.isArray(value.folders) ? value.folders : [] }]));
  } catch { users = {}; }
  renderGateAccounts(); renderAccountMenu();
}
function setActiveUser(userId) {
  const normalizedId = userId || '';
  currentUserId = normalizedId;
  localStorage.setItem(activeUserKey, normalizedId);
  media = getCurrentMedia();
  activeFilter = 'all'; activeTags = []; removingFavoriteTags = false; activeArtist = ''; activeFolder = ''; activeView = 'library';
  if (typeof render === 'function') render();
}
async function loadAppData() { await loadUsers(); media = getCurrentMedia(); render(); }
function getUserOptions() { return Object.values(users).sort((a, b) => a.username.localeCompare(b.username)); }
function renderGateAccounts() {
  const list = $('#user-list');
  if (!list) return;
  const owners = getUserOptions();
  list.innerHTML = owners.length ? owners.map((user) => `<button type="button" class="profile-pill ${currentUserId === user.id ? 'active' : ''}" data-user-id="${user.id}"><span>${user.username}</span><small>${(user.media || []).length} items</small></button>`).join('') : '<p class="gate-muted">No saved profiles yet.</p>';
}
function renderAccountMenu() {
  const button = $('#account-menu-toggle');
  if (!button) return;
  const user = getCurrentUser();
  button.textContent = user ? user.username.slice(0, 2).toUpperCase() : '↺';
  button.title = user ? `Signed in as ${user.username}` : 'Switch profile';
}
async function createUserProfile(username) {
  const safeName = sanitizeUsername(username);
  if (!safeName) return { ok: false, error: 'Choose a username.' };
  if (users[safeName]) return { ok: false, error: 'That profile already exists. Please sign in instead.' };
  users[safeName] = { id: safeName, username: safeName, media: [] };
  await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: safeName, media: [] }) });
  setActiveUser(safeName);
  return { ok: true, userId: safeName };
}
async function deleteProfileFiles(profileUser) {
  if (!profileUser || !Array.isArray(profileUser.media)) return;
  const deletions = profileUser.media.map(async (item) => {
    const safeFolder = String(item.folder || '').trim() || 'Images';
    const safeName = item.filename || item.src?.split('/').pop() || '';
    if (!safeName) return;
    try {
      await fetch('/api/media/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: safeName, folder: item.type === 'video' ? 'Videos' : 'Images' })
      });
    } catch { }
  });
  await Promise.all(deletions);
}
async function deleteStoredMedia(item) { const filename = item?.filename || item?.src?.split('/').pop() || ''; if (!filename) return; const response = await fetch('/api/media/file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, folder: item.type === 'video' ? 'Videos' : 'Images' }) }); if (!response.ok && response.status !== 404) throw new Error('The media file could not be removed from storage.'); }
function toggleAccountMenu(forceState) {
  const menu = $('#account-menu');
  if (!menu) return;
  const next = typeof forceState === 'boolean' ? forceState : menu.hidden;
  menu.hidden = !next;
}
function toggleHelpMenu(forceState) { const menu = $('#help-menu'); if (!menu) return; const next = typeof forceState === 'boolean' ? forceState : menu.hidden; menu.hidden = !next; $('#help-menu-toggle').setAttribute('aria-expanded', String(next)); }
function syncNsfwToggle(buttonId) { const button = $(`#${buttonId}`); const checkbox = button ? $(`#${button.dataset.target}`) : null; if (!button || !checkbox) return; button.classList.toggle('active', checkbox.checked); button.setAttribute('aria-pressed', String(checkbox.checked)); }
function logoutUser() {
  localStorage.removeItem(activeUserKey);
  currentUserId = '';
  media = [];
  activeView = 'library';
  activeFolder = '';
  renderGateAccounts();
  renderAccountMenu();
  if ($('#account-menu')) $('#account-menu').hidden = true;
  document.body.classList.remove('unlocked');
  $('#password-gate').hidden = false;
  $('#username-input').value = '';
  $('#gate-error').textContent = '';
}
function removeCurrentProfile() {
  const user = getCurrentUser();
  if (!user || !window.confirm(`Remove the profile "${user.username}" and all of its media?`)) return;
  deleteProfileFiles(user).finally(() => {
    delete users[user.id];
    fetch('/api/catalog', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: user.id }) }).catch(() => {});
    logoutUser();
  });
}
function icon(name) { return name === 'volume' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4.5 4.5a4 4 0 0 1 0 5M18 7a8 8 0 0 1 0 10"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M9.5 9.5 6 12H3v6h3l5 4v-7.5M15 9a4 4 0 0 1 1 2.7M18 7a8 8 0 0 1 2 5"/></svg>'; }
function getFolderOptions() { return [...new Set([...(getCurrentUser()?.folders || []), ...media.map((item) => getFolderName(item))])].sort((a, b) => a.localeCompare(b)); }
function renderFolderOptions(currentValue = 'Unsorted') { const select = $('#media-folder'); if (!select) return; const options = ['Unsorted', ...getFolderOptions().filter((folder) => folder !== 'Unsorted')]; select.innerHTML = ''; options.forEach((folder) => { const option = document.createElement('option'); option.value = folder; option.textContent = folder; select.appendChild(option); }); select.value = options.includes(currentValue) ? currentValue : 'Unsorted'; }
function getFavoriteTimelineEntries() { const bucket = new Map(); media.filter((item) => item.favorite && item.favoriteDate).forEach((item) => { const key = item.favoriteDate; if (!bucket.has(key)) bucket.set(key, []); bucket.get(key).push(item); }); return [...bucket.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0])); }
function getFolderEntries() { const bucket = new Map((getCurrentUser()?.folders || []).map((folder) => [folder, []])); media.forEach((item) => { const key = getFolderName(item); if (!bucket.has(key)) bucket.set(key, []); bucket.get(key).push(item); }); return [...bucket.entries()].sort((a, b) => a[0].localeCompare(b[0])); }
function renderFavoriteTags() { const tags = getCurrentUser()?.favoriteTags || []; $('#tag-row').innerHTML = `${tags.length ? `<button class="favorite-tag-remove-all" data-action="remove-favorite-tags" type="button">${removingFavoriteTags ? 'Done Removing' : 'Remove Favorite Tags'}</button>` : ''}<button class="favorite-tag-button" data-action="add-favorite-tag" type="button">Favorite Tag+</button>${tags.map((tag) => `<button class="favorite-tag ${activeTags.includes(tag) ? 'active' : ''} ${removingFavoriteTags ? 'removal-mode' : ''}" data-tag="${tag}" type="button">${tag}</button>`).join('')}`; }
function renderCollectionCards(entries, type) {
  const cards = entries.map(([label, items]) => {
    const cardLabel = type === 'favorites' ? formatFolderDate(label) : label;
    const folderKey = type === 'favorites' ? `favorites-date:${label}` : label;
      const previews = items.slice(0, 3).map((item) => item.type === 'video' ? `<div class="folder-thumb video-thumb"><video src="${item.src}" muted playsinline preload="metadata"></video></div>` : `<div class="folder-thumb"><img src="${item.src}" alt="${item.title}" loading="lazy"></div>`).join('');
      return `<article class="folder-card ${removingMedia && type === 'favorites' ? 'media-selected' : ''}" data-folder="${folderKey}" data-type="${type}" data-media-ids="${type === 'favorites' ? items.map((item) => item.id).join(',') : ''}" data-location-id="${items[0]?.id || ''}" style="animation-delay:${Math.random() * 100}ms">${removingMedia && type === 'favorites' ? `<button class="media-select-toggle ${items.every((item) => selectedMediaIds.includes(item.id)) ? 'selected' : ''}" data-action="select-media" type="button" aria-label="Select ${cardLabel}">${items.every((item) => selectedMediaIds.includes(item.id)) ? '✓' : ''}</button>` : ''}<div class="folder-thumb-grid">${previews || '<div class="folder-thumb empty-thumb">+</div>'}</div><div class="folder-card-meta"><h3>${cardLabel}</h3><p>${items.length} item${items.length === 1 ? '' : 's'}</p><button class="folder-rename" data-action="rename-folder" type="button">Rename</button><button class="folder-remove" data-action="remove-folder" type="button">Remove</button></div></article>`;
  }).join('');
  $('#media-grid').innerHTML = cards;
  document.querySelectorAll('.folder-thumb > img').forEach((image) => { const applyRatio = () => { if (image.naturalWidth && image.naturalHeight) image.closest('.folder-thumb').style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; }; image.addEventListener('load', applyRatio, { once: true }); if (image.complete) applyRatio(); });
  document.querySelectorAll('.folder-thumb video').forEach((video) => initializeVideo(video, null, true));
  document.querySelectorAll('.folder-thumb video').forEach((video) => video.addEventListener('loadedmetadata', () => { if (video.videoWidth && video.videoHeight) video.closest('.folder-thumb').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`; }, { once: true }));
  $('#media-grid').hidden = cards.length === 0;
  $('#empty-state').hidden = cards.length !== 0;
  $('#empty-state h2').textContent = type === 'favorites' ? 'No favorites on record yet' : 'No folders yet';
  $('#empty-state p').textContent = type === 'favorites' ? 'Favorite a few pieces and your timeline will start here.' : 'Add your first memory to create a folder.';
}
function renderArtists() { const user = getCurrentUser(); const artists = user?.artists || []; const cards = artists.map((artist, index) => { const items = media.filter((item) => item.artist.toLowerCase() === artist.name.toLowerCase() && (!artist.folder || getFolderName(item) === artist.folder)); const cover = artist.image || (items.find((item) => item.type === 'image')?.src || ''); return `<article class="media-card artist-card" data-artist-link="${artist.link}" style="animation-delay:${index * 55}ms"><div class="media-preview">${cover ? `<img src="${cover}" alt="${artist.name}" loading="lazy">` : '<div class="empty-thumb">+</div>'}</div><div class="card-info"><div><h3>${artist.name}</h3><p class="card-artist">${items.length} item${items.length === 1 ? '' : 's'}${artist.folder ? ` · ${artist.folder}` : ''}</p></div><div class="artist-actions"><button class="edit-button" data-action="edit-artist" type="button">Edit</button><button class="edit-button" data-action="remove-artist" type="button">Remove</button></div></div><div class="card-tags">${(artist.tags || []).map((tag) => `<span>${tag}</span>`).join('')}</div></article>`; }).join(''); $('#media-grid').innerHTML = cards; document.querySelectorAll('.artist-card .media-preview > img').forEach((image) => { const applyRatio = () => { if (image.naturalWidth && image.naturalHeight) image.closest('.media-preview').style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; }; image.addEventListener('load', applyRatio, { once: true }); if (image.complete) applyRatio(); }); $('#media-grid').hidden = !cards.length; $('#empty-state').hidden = Boolean(cards.length); $('#empty-state h2').textContent = 'No artists yet'; $('#empty-state p').textContent = 'Add an artist to create a gallery.'; $('#page-title').innerHTML = 'Artists<span class="accent">.</span>'; $('#view-eyebrow').textContent = 'YOUR ARTISTS'; $('#page-subhead').textContent = 'Open an artist page from its gallery card.'; $('#open-artist').hidden = false; renderFavoriteTags(); }
function updateRemovalSelection() { document.querySelectorAll('[data-id], [data-media-ids]').forEach((card) => { const ids = card.dataset.mediaIds ? card.dataset.mediaIds.split(',').filter(Boolean) : [card.dataset.id]; const selected = ids.length > 0 && ids.every((id) => selectedMediaIds.includes(id)); card.classList.toggle('media-selected', selected); const button = card.querySelector('[data-action="select-media"]'); if (button) { button.classList.toggle('selected', selected); button.textContent = selected ? '✓' : ''; } }); $('#remove-selected').hidden = !removingMedia || !selectedMediaIds.length; }
function render() {
  const query = $('#search-input').value.trim().toLowerCase(), sort = $('#sort-select').value;
  const removableView = activeView === 'library' || activeView === 'favorites'; $('#toggle-remove-media').hidden = !removableView; $('#toggle-remove-media').textContent = removingMedia ? 'Done Removing' : 'Remove media'; $('#remove-selected').hidden = !removingMedia || !selectedMediaIds.length;
  $('#add-empty-folder').hidden = activeView !== 'folders';
    $('#open-artist').hidden = activeView !== 'artists' || activeArtistEdit !== null;
  if (activeView === 'artists') { renderArtists(); return; }
  if (activeView === 'favorites') {
    const favoriteTimeline = getFavoriteTimelineEntries();
    renderCollectionCards(favoriteTimeline, 'favorites');
    $('#all-count').textContent = media.length; $('#image-count').textContent = media.filter((item) => item.type === 'image').length; $('#video-count').textContent = media.filter((item) => item.type === 'video').length; $('#favorite-count').textContent = media.filter((item) => item.favorite).length;
    renderFavoriteTags();
    $('#page-title').innerHTML = 'Favorites<span class="accent">.</span>'; $('#view-eyebrow').textContent = 'THE PIECES YOU KEPT CLOSE'; $('#page-subhead').textContent = 'A timeline of everything you saved along the way.';
    $('#safe-mode').classList.toggle('active', safeMode); $('#safe-mode').setAttribute('aria-pressed', String(safeMode)); $('#safe-mode').innerHTML = `<span aria-hidden="true">${safeMode ? '✓' : '◉'}</span> Safe Mode${safeMode ? ': ON' : ''}`; document.body.classList.toggle('safe-mode-active', safeMode);
    return;
  }
  if (activeView === 'folders') {
    const folders = getFolderEntries();
    renderCollectionCards(folders, 'folders');
    $('#all-count').textContent = media.length; $('#image-count').textContent = media.filter((item) => item.type === 'image').length; $('#video-count').textContent = media.filter((item) => item.type === 'video').length; $('#favorite-count').textContent = media.filter((item) => item.favorite).length;
    renderFavoriteTags();
    $('#page-title').innerHTML = 'Folders<span class="accent">.</span>'; $('#view-eyebrow').textContent = 'ORGANIZED BY COMPOSITION'; $('#page-subhead').textContent = 'Browse by folder, then dive into a memory.';
    $('#safe-mode').classList.toggle('active', safeMode); $('#safe-mode').setAttribute('aria-pressed', String(safeMode)); $('#safe-mode').innerHTML = `<span aria-hidden="true">${safeMode ? '✓' : '◉'}</span> Safe Mode${safeMode ? ': ON' : ''}`; document.body.classList.toggle('safe-mode-active', safeMode);
    return;
  }
  const filtered = media.filter((item) => {
    const matchesFilter = (!safeMode || !item.tags.some((tag) => tag.toLowerCase() === 'nsfw')) && (activeFilter === 'all' || item.type === activeFilter) && (!activeTags.length || activeTags.some((tag) => item.tags.includes(tag)));
    const matchesFolder = !activeFolder ? true : activeFolder.startsWith('favorites-date:') ? item.favorite && item.favoriteDate === activeFolder.replace('favorites-date:', '') : item.folder === activeFolder;
    const matchesArtist = !activeArtist || item.artist.toLowerCase() === activeArtist.toLowerCase();
    const matchesSearch = !query || [item.title, item.artist, item.description, ...item.tags].join(' ').toLowerCase().includes(query);
    return matchesFilter && matchesFolder && matchesArtist && matchesSearch;
  }).sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  $('#media-grid').innerHTML = filtered.map((item, index) => `<article class="media-card ${selectedMediaIds.includes(item.id) ? 'media-selected' : ''}" data-id="${item.id}" style="animation-delay:${index * 55}ms"><div class="media-preview" title="${item.type === 'image' ? 'Enlarge' : 'Click to play'}">${removingMedia ? `<button class="media-select-toggle ${selectedMediaIds.includes(item.id) ? 'selected' : ''}" data-action="select-media" type="button" aria-label="Select ${item.title}">${selectedMediaIds.includes(item.id) ? '✓' : ''}</button>` : ''}${item.type === 'video' ? `<span class="video-badge">▶ VIDEO</span><video src="${item.src}" muted loop playsinline preload="metadata"></video><button class="sound-button" data-action="sound" type="button" title="Toggle sound" aria-label="Toggle sound">${icon('muted')}</button>` : `<img src="${item.src}" alt="${item.title}" loading="lazy">`}<button class="favorite-button ${item.favorite ? 'is-favorite' : ''}" data-action="favorite" type="button" title="${item.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${item.favorite ? 'Remove from favorites' : 'Add to favorites'}">${item.favorite ? '♥' : '♡'}</button></div><div class="card-info"><div><h3>${item.title}</h3>${item.artist ? `<p class="card-artist">${item.artist}</p>` : ''}</div><time class="card-date">${formatDate(item.date)}</time></div><div class="card-tags">${item.tags.map((tag) => `<span>${tag}</span>`).join('')}</div><button class="edit-button" data-action="edit" type="button">Edit</button></article>`).join('');
  document.querySelectorAll('.media-card .media-preview > img').forEach((image) => { const applyOrientation = () => { if (!image.naturalWidth || !image.naturalHeight) return; const card = image.closest('.media-card'); const preview = image.closest('.media-preview'); const ratio = image.naturalWidth / image.naturalHeight; preview.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; card.classList.toggle('is-portrait', ratio < .9); card.classList.toggle('is-landscape', ratio >= .9); }; image.addEventListener('load', applyOrientation, { once: true }); if (image.complete) applyOrientation(); });
  $('#empty-state').hidden = filtered.length !== 0; $('#media-grid').hidden = filtered.length === 0; $('#empty-state h2').textContent = activeView === 'favorites' ? 'No favorites yet' : 'Nothing tempting yet'; $('#empty-state p').textContent = activeView === 'favorites' ? 'Tap the heart on any piece to keep it close.' : 'Search again, or add something wicked to your collection.';
  $('#all-count').textContent = media.length; $('#image-count').textContent = media.filter((item) => item.type === 'image').length; $('#video-count').textContent = media.filter((item) => item.type === 'video').length; $('#favorite-count').textContent = media.filter((item) => item.favorite).length;
  renderFavoriteTags();
  $('#page-title').innerHTML = activeFolder ? `${activeFolder.startsWith('favorites-date:') ? 'Favorites timeline' : activeFolder}<span class="accent">.</span>` : 'Sinful Collection<span class="accent">.</span>'; $('#view-eyebrow').textContent = activeFolder ? 'CURRENTLY VIEWING FOLDER' : 'YOUR PRIVATE OBSESSION'; $('#page-subhead').textContent = activeFolder ? 'Everything in this folder.' : 'Your own world for the depraved.';
  $('#safe-mode').classList.toggle('active', safeMode); $('#safe-mode').setAttribute('aria-pressed', String(safeMode)); $('#safe-mode').innerHTML = `<span aria-hidden="true">${safeMode ? '✓' : '◉'}</span> Safe Mode${safeMode ? ': ON' : ''}`; document.body.classList.toggle('safe-mode-active', safeMode);
}
function initializeVideo(video, progress = null, thumbnailOnly = false) {
  video.addEventListener('loadedmetadata', () => { if (progress) progress.max = Number.isFinite(video.duration) ? video.duration : 0; if (video.currentTime === 0) video.currentTime = Math.min(.15, video.duration || .15); });
  video.addEventListener('timeupdate', () => { if (progress) progress.value = video.currentTime; });
  video.addEventListener('seeked', () => generateThumbnail(video, thumbnailOnly), { once: true });
  if (progress) ['input', 'change'].forEach((eventName) => progress.addEventListener(eventName, (event) => { const value = Number(event.target.value); if (Number.isFinite(value)) video.currentTime = Math.max(0, Math.min(value, video.duration || value)); }));
}
function formatTime(seconds) { if (!Number.isFinite(seconds) || seconds < 0) return '0:00'; const whole = Math.floor(seconds); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; }
function setupModalVideo(video) {
  const wrap = video.closest('.modal-video-wrap'), progress = wrap.querySelector('.modal-progress'), tooltip = wrap.querySelector('.modal-progress-tooltip'), play = wrap.querySelector('.modal-control-play'), mute = wrap.querySelector('.modal-mute'), skip = wrap.querySelector('.modal-skip'), fullscreen = wrap.querySelector('.modal-fullscreen');
  let seeking = false;
  const seekTo = (value) => { const duration = video.duration; if (!Number.isFinite(duration) || duration <= 0) return; const target = Math.max(0, Math.min(Number(value), duration)); if (Number.isFinite(target)) { video.currentTime = target; progress.value = target; tooltip.textContent = formatTime(target); } };
  const seekFromPointer = (event) => { const bounds = progress.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); if (Number.isFinite(video.duration)) seekTo(ratio * video.duration); tooltip.style.left = `${ratio * 100}%`; };
  video.addEventListener('loadedmetadata', () => { progress.max = Number.isFinite(video.duration) ? video.duration : 0; progress.value = 0; });
  video.addEventListener('timeupdate', () => { progress.value = video.currentTime; });
  video.addEventListener('play', () => { play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause video'); });
  video.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label', 'Play video'); });
  progress.addEventListener('input', () => { seekTo(progress.value); });
  progress.addEventListener('pointerdown', (event) => { seeking = true; progress.setPointerCapture?.(event.pointerId); });
  progress.addEventListener('pointermove', (event) => { if (seeking) seekFromPointer(event); else { const bounds = progress.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); tooltip.textContent = formatTime(ratio * (video.duration || 0)); tooltip.style.left = `${ratio * 100}%`; } });
  progress.addEventListener('pointerup', () => { seeking = false; });
  progress.addEventListener('pointercancel', () => { seeking = false; });
  video.addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
  play.addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
  mute.addEventListener('click', () => { video.muted = !video.muted; mute.textContent = video.muted ? '🔇' : '🔊'; mute.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video'); });
  skip.addEventListener('click', () => { const jump = () => seekTo(video.currentTime + 10); if (Number.isFinite(video.duration) && video.duration > 0) jump(); else video.addEventListener('loadedmetadata', jump, { once: true }); });
  fullscreen.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen?.(); });
  document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement === wrap ? '×' : '⛶'; fullscreen.setAttribute('aria-label', document.fullscreenElement === wrap ? 'Exit fullscreen' : 'Enter fullscreen'); });
}
function openView(id) { const item = media.find((entry) => entry.id === id); if (!item) return; $('#view-type').textContent = item.type.toUpperCase(); $('#view-title').textContent = item.title; $('#view-artist').textContent = item.artist ? `By ${item.artist}` : ''; $('#view-description').textContent = item.description || 'No description added.'; $('#view-date').textContent = formatDate(item.date); $('#view-tags').innerHTML = item.tags.map((tag) => `<span>${tag}</span>`).join(''); $('#remove-media').dataset.id = item.id; $('#view-media').innerHTML = item.type === 'video' ? `<div class="modal-video-wrap"><video id="modal-video" src="${item.src}" muted playsinline preload="metadata"></video><div class="modal-video-controls"><button class="modal-control-play" type="button" aria-label="Play video">▶</button><button class="modal-mute" type="button" aria-label="Unmute video">🔇</button><button class="modal-skip" type="button" aria-label="Jump forward 10 seconds">+10</button><div class="modal-progress-wrap"><input class="modal-progress" type="range" min="0" max="0" value="0" step="0.01" aria-label="Video position"><span class="modal-progress-tooltip">0:00</span></div><button class="modal-fullscreen" type="button" aria-label="Enter fullscreen">⛶</button></div></div>` : `<img src="${item.src}" alt="${item.title}">`; $('#view-modal').hidden = false; const video = $('#modal-video'); if (video) { initializeVideo(video); setupModalVideo(video); } }
function generateThumbnail(video) { if (!video.videoWidth || !video.videoHeight) return; const currentTime = video.currentTime; const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; const context = canvas.getContext('2d'); context.drawImage(video, 0, 0, canvas.width, canvas.height); video.poster = canvas.toDataURL('image/jpeg', .82); video.currentTime = currentTime; }
function openEditor(id = null) { editingId = id; const item = media.find((entry) => entry.id === id); $('#add-form').reset(); renderFolderOptions(item ? getFolderName(item) : 'Unsorted'); $('#media-file').required = !item; $('#form-eyebrow').textContent = item ? 'EDIT TEMPTATION' : 'NEW TEMPTATION'; $('#add-title').innerHTML = item ? 'Edit media<span class="accent">.</span>' : 'Add to collection<span class="accent">.</span>'; $('#form-submit').innerHTML = item ? 'Save changes <span>↗</span>' : 'Add to collection <span>↗</span>'; $('#file-label').textContent = item ? 'Keep current file or choose a replacement' : 'Choose images or videos'; if (item) { $('#media-title').value = item.title; $('#media-artist').value = item.artist; $('#media-tags').value = item.tags.join(', '); $('#media-description').value = item.description; $('#media-folder').value = getFolderName(item); $('#media-folder-custom').value = ''; $('#media-nsfw').checked = item.tags.includes('nsfw'); } else { $('#media-artist').value = localStorage.getItem(lastArtistKey) || ''; } $('#add-modal').hidden = false; }
function closeModal(id) { $(`#${id}`).hidden = true; $('#view-media').innerHTML = ''; }
function toggleFavorite(id) { const item = media.find((entry) => entry.id === id); if (item) { item.favorite = !item.favorite; item.favoriteDate = item.favorite ? item.favoriteDate || new Date().toISOString().slice(0, 10) : ''; saveMedia(); render(); } }
$('#media-grid').addEventListener('click', async (event) => {
  const card = event.target.closest('.media-card'); const folderCard = event.target.closest('.folder-card'); if (removingMedia && (card || folderCard)) { event.preventDefault(); event.stopPropagation(); const ids = folderCard?.dataset.mediaIds ? folderCard.dataset.mediaIds.split(',').filter(Boolean) : card?.dataset.id ? [card.dataset.id] : []; const shouldSelect = ids.some((id) => !selectedMediaIds.includes(id)); selectedMediaIds = shouldSelect ? [...new Set([...selectedMediaIds, ...ids])] : selectedMediaIds.filter((id) => !ids.includes(id)); updateRemovalSelection(); return; } if (folderCard) { event.stopPropagation(); activeView = folderCard.dataset.artist ? 'library' : 'library'; activeArtist = folderCard.dataset.artist || ''; activeFolder = folderCard.dataset.folder || ''; activeFilter = 'all'; activeTags = []; document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === 'library')); document.querySelectorAll('.filter').forEach((link) => link.classList.toggle('active', link.dataset.filter === 'all')); render(); return; }
  if (folderCard && event.target.closest('[data-action="rename-folder"]')) { event.stopPropagation(); const folder = folderCard.dataset.folder; const user = getCurrentUser(); const nextName = String(window.prompt('Rename folder', folder) || '').trim(); if (user && folder && nextName && nextName !== folder) { if (nextName.toLowerCase() === 'unsorted' || getFolderOptions().some((entry) => entry.toLowerCase() === nextName.toLowerCase() && entry !== folder.toLowerCase())) { window.alert('That folder already exists.'); return; } user.folders = (user.folders || []).map((entry) => entry === folder ? nextName : entry); media.forEach((item) => { if (getFolderName(item) === folder) item.folder = nextName; }); if (activeFolder === folder) activeFolder = nextName; await saveMedia(); render(); } return; }
  if (folderCard && event.target.closest('[data-action="remove-folder"]')) { event.stopPropagation(); const folder = folderCard.dataset.folder; const user = getCurrentUser(); if (user && folder && window.confirm(`Remove folder "${folder}"? Media will move to Unsorted.`)) { user.folders = (user.folders || []).filter((entry) => entry !== folder); media.forEach((item) => { if (getFolderName(item) === folder) item.folder = 'Unsorted'; }); await saveMedia(); render(); } return; }
  if (activeView === 'artists' && card) { const action = event.target.closest('[data-action]')?.dataset.action; const artist = getCurrentUser()?.artists?.find((entry) => entry.link === card.dataset.artistLink); if (action === 'remove-artist') { event.stopPropagation(); if (artist && window.confirm(`Remove ${artist.name} from your artists?`)) { const user = getCurrentUser(); user.artists = user.artists.filter((entry) => entry !== artist); saveCatalog(); render(); } return; } if (action !== 'edit-artist' && artist?.link) { event.stopPropagation(); if (window.electronAPI?.openExternal) window.electronAPI.openExternal(artist.link); else window.open(artist.link, '_blank', 'noopener,noreferrer'); } return; }
  if (!card) return; const action = event.target.closest('[data-action]')?.dataset.action, video = card.querySelector('video'); if (action === 'favorite') { event.stopPropagation(); toggleFavorite(card.dataset.id); return; } if (action === 'edit') { event.stopPropagation(); openEditor(card.dataset.id); return; } if (action === 'sound') { event.stopPropagation(); video.muted = !video.muted; event.target.closest('.sound-button').innerHTML = icon(video.muted ? 'muted' : 'volume'); return; } if (video && event.target.closest('.media-preview') && !event.target.closest('.sound-button')) { event.stopPropagation(); if (video.paused) video.play(); else video.pause(); return; } openView(card.dataset.id); });
$('#tag-row').addEventListener('click', (event) => { const action = event.target.closest('[data-action]')?.dataset.action; const tag = event.target.closest('[data-tag]')?.dataset.tag; if (action === 'remove-favorite-tags') { removingFavoriteTags = !removingFavoriteTags; renderFavoriteTags(); return; } if (action === 'add-favorite-tag') { const row = $('#tag-row'); if (!row.querySelector('.favorite-tag-editor')) { row.insertAdjacentHTML('afterbegin', '<form class="favorite-tag-editor" data-action="favorite-tag-form"><input name="tag" type="text" placeholder="Tag name" aria-label="Favorite tag name" required><button type="submit">Add</button><button type="button" data-action="cancel-favorite-tag" aria-label="Cancel">×</button></form>'); row.querySelector('input[name="tag"]').focus(); } return; } if (action === 'cancel-favorite-tag') { renderFavoriteTags(); return; } if (tag !== undefined) { const user = getCurrentUser(); if (removingFavoriteTags && user) { user.favoriteTags = (user.favoriteTags || []).filter((entry) => entry !== tag); activeTags = activeTags.filter((entry) => entry !== tag); if (!user.favoriteTags.length) removingFavoriteTags = false; saveCatalog(); render(); return; } activeTags = activeTags.includes(tag) ? activeTags.filter((entry) => entry !== tag) : [...activeTags, tag]; render(); } });
$('#tag-row').addEventListener('submit', (event) => { if (!event.target.matches('[data-action="favorite-tag-form"]')) return; event.preventDefault(); const normalized = String(new FormData(event.target).get('tag') || '').trim().toLowerCase(); const user = getCurrentUser(); if (normalized && user && !(user.favoriteTags || []).includes(normalized)) { user.favoriteTags = [...(user.favoriteTags || []), normalized].sort(); saveCatalog(); } renderFavoriteTags(); }); $('.filters').addEventListener('click', (event) => { if (event.target.matches('[data-filter]')) { activeFilter = event.target.dataset.filter; document.querySelectorAll('.filter').forEach((button) => button.classList.toggle('active', button === event.target)); render(); } });
document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => { activeView = button.dataset.view; activeArtist = ''; activeFolder = ''; activeFilter = 'all'; activeTags = []; removingFavoriteTags = false; document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link === button)); document.querySelectorAll('.filter').forEach((link) => link.classList.toggle('active', link.dataset.filter === 'all')); render(); }));
$('#search-input').addEventListener('input', render); $('#sort-select').addEventListener('change', render); $('#open-add').addEventListener('click', () => openEditor()); $('#empty-add').addEventListener('click', () => openEditor()); document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close))); document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(backdrop.id); })); document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((modal) => closeModal(modal.id)); }); $('#media-file').addEventListener('change', (event) => { const files = [...event.target.files]; $('#file-label').textContent = files.length > 1 ? `${files.length} files selected` : files[0]?.name || 'Choose images or videos'; $('#media-title').required = true; if (files.length > 1) $('#media-title').value = files[0].name.replace(/\.[^/.]+$/, ''); });
$('#open-batch').addEventListener('click', () => { $('#batch-source-modal').hidden = false; });
$('#open-artist').addEventListener('click', () => { $('#artist-form').reset(); $('#artist-modal').hidden = false; });
document.querySelectorAll('.nsfw-toggle').forEach((button) => button.addEventListener('click', () => { const checkbox = $(`#${button.dataset.target}`); checkbox.checked = !checkbox.checked; syncNsfwToggle(button.id); }));
$('#open-add').addEventListener('click', () => syncNsfwToggle('media-nsfw-toggle')); $('#open-artist').addEventListener('click', () => syncNsfwToggle('artist-nsfw-toggle'));
$('#artist-form').addEventListener('submit', async (event) => { event.preventDefault(); const user = getCurrentUser(); const name = $('#artist-name').value.trim(); const link = $('#artist-link').value.trim(); if (!user || !name || !link) return; const tags = $('#artist-tags').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean); if ($('#artist-nsfw').checked && !tags.includes('nsfw')) tags.push('nsfw'); const imageFile = $('#artist-image').files[0]; const image = imageFile ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(imageFile); }) : ''; user.artists = [...(user.artists || []).filter((artist) => artist.name.toLowerCase() !== name.toLowerCase()), { name, link, image, tags, folder: $('#artist-folder').value.trim() }].sort((a, b) => a.name.localeCompare(b.name)); await saveCatalog(); $('#artist-modal').hidden = true; render(); });
$('#select-batch-files').addEventListener('click', () => { $('#batch-source-modal').hidden = true; $('#batch-file-picker').click(); });
$('#select-batch-folder').addEventListener('click', () => { $('#batch-source-modal').hidden = true; $('#folder-file-picker').click(); });
$('#folder-file-picker').addEventListener('change', (event) => { const files = [...event.target.files].filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/')); if (files.length) { renderBatchEditor(files); const folderName = files[0].webkitRelativePath?.split('/')[0] || ''; if (folderName) $('#batch-file-list').querySelectorAll('[name="custom-folder"]').forEach((input) => { input.value = folderName; }); } event.target.value = ''; });
$('#media-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !editingId) $('#media-title').value = file.name.replace(/\.[^/.]+$/, ''); });
function renderBatchEditor(files) { batchFiles = files; const folders = ['Unsorted', ...getFolderOptions().filter((folder) => folder !== 'Unsorted')]; const tools = $('#batch-modal .batch-artist-tools') || $('#batch-modal form').insertAdjacentHTML('afterbegin', '<div class="batch-artist-tools"><input id="batch-artist-input" type="text" aria-label="Artist for current batch" placeholder="Artist"><button id="apply-batch-artist" class="secondary-button" type="button">Apply to current batch</button></div>'); $('#batch-file-list').innerHTML = files.map((file, index) => `<div class="batch-file-row" data-index="${index}"><span class="batch-file-name"></span><input name="title" aria-label="Title" placeholder="Title" value="${file.name.replace(/\.[^/.]+$/, '').replace(/"/g, '&quot;')}" required><input name="artist" aria-label="Artist" placeholder="Artist" value="${(localStorage.getItem(lastArtistKey) || '').replace(/"/g, '&quot;')}"><input name="tags" aria-label="Tags" placeholder="Tags"><select name="folder" aria-label="Folder">${folders.map((folder) => `<option value="${folder}">${folder}</option>`).join('')}</select><input name="custom-folder" aria-label="New folder" placeholder="Or create folder"><label class="batch-nsfw"><input name="nsfw" type="checkbox"> NSFW</label><textarea name="description" rows="1" aria-label="Description" placeholder="Description"></textarea></div>`).join(''); files.forEach((file, index) => { $('#batch-file-list').querySelector(`[data-index="${index}"] .batch-file-name`).textContent = file.name; }); $('#apply-batch-artist').onclick = () => { const artist = $('#batch-artist-input').value.trim(); if (artist) { $('#batch-file-list').querySelectorAll('[name="artist"]').forEach((input) => { input.value = artist; }); localStorage.setItem(lastArtistKey, artist); } }; $('#batch-modal').hidden = false; }
$('#batch-file-picker').addEventListener('change', (event) => { const files = [...event.target.files]; if (files.length) renderBatchEditor(files); event.target.value = ''; });
$('#batch-form').addEventListener('submit', async (event) => { event.preventDefault(); const rows = [...$('#batch-file-list').querySelectorAll('.batch-file-row')]; try { for (const [index, row] of rows.entries()) { const file = batchFiles[index]; const uploaded = await uploadToMedia(file); const tags = row.querySelector('[name="tags"]').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean); if (row.querySelector('[name="nsfw"]').checked && !tags.includes('nsfw')) tags.push('nsfw'); const artist = row.querySelector('[name="artist"]').value.trim(); if (artist) localStorage.setItem(lastArtistKey, artist); const customFolder = row.querySelector('[name="custom-folder"]').value.trim(); media.unshift({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: row.querySelector('[name="title"]').value.trim(), artist, tags, description: row.querySelector('[name="description"]').value.trim(), folder: customFolder || row.querySelector('[name="folder"]').value, type: uploaded.type.startsWith('video') ? 'video' : 'image', date: new Date().toISOString().slice(0, 10), favorite: false, favoriteDate: '', src: uploaded.src, filename: uploaded.filename, storageFolder: uploaded.folder }); } await saveMedia(); closeModal('batch-modal'); render(); } catch (error) { window.alert(error.message); } });
$('#safe-mode').addEventListener('click', () => { safeMode = !safeMode; localStorage.setItem('framehouse-safe-mode', String(safeMode)); render(); });
$('#remove-media').addEventListener('click', async (event) => { const item = media.find((entry) => entry.id === event.currentTarget.dataset.id); if (!item || !window.confirm(`Remove "${item.title}" from your collection?`)) return; try { await deleteStoredMedia(item); media = media.filter((entry) => entry.id !== item.id); await saveMedia(); closeModal('view-modal'); render(); } catch (error) { window.alert(error.message); } });
$('#help-menu-toggle').addEventListener('click', () => toggleHelpMenu()); $('#open-media-location').addEventListener('click', async () => { toggleHelpMenu(false); await window.electronAPI?.openMediaLocation(); }); $('#change-media-location').addEventListener('click', async () => { toggleHelpMenu(false); try { const result = await window.electronAPI?.changeMediaLocation(); if (result?.path) window.alert(`Media location changed to:\n${result.path}`); } catch (error) { window.alert(error.message || 'Unable to change media location.'); } });
async function uploadToMedia(file) { const formData = new FormData(); const nativePath = window.electronAPI?.getPathForFile(file); if (nativePath) formData.append('sourcePath', nativePath); formData.append('file', file); const response = await fetch('/api/upload', { method: 'POST', body: formData }); if (!response.ok) { let message = 'The file could not be added to the Media folder.'; try { message = (await response.json()).error || message; } catch { } throw new Error(message); } return response.json(); }
$('#add-form').addEventListener('submit', async (event) => { event.preventDefault(); const files = [...$('#media-file').files]; const artist = $('#media-artist').value.trim(); const tags = $('#media-tags').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean); if ($('#media-nsfw').checked && !tags.includes('nsfw')) tags.push('nsfw'); if (artist) localStorage.setItem(lastArtistKey, artist); const selectedFolder = $('#media-folder').value || 'Unsorted'; const customFolder = $('#media-folder-custom').value.trim(); const finalFolder = customFolder || selectedFolder; const values = { artist, tags, description: $('#media-description').value.trim(), folder: finalFolder }; try { if (editingId) { const file = files[0]; const item = media.find((entry) => entry.id === editingId); if (file) { const uploaded = await uploadToMedia(file); Object.assign(item, { ...values, title: $('#media-title').value.trim(), src: uploaded.src, type: uploaded.type.startsWith('video') ? 'video' : 'image', filename: uploaded.filename, storageFolder: uploaded.folder }); } else Object.assign(item, values, { title: $('#media-title').value.trim() }); } else { for (const file of files) { const uploaded = await uploadToMedia(file); const title = files.length === 1 ? $('#media-title').value.trim() : file.name.replace(/\.[^/.]+$/, ''); media.unshift({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...values, title, type: uploaded.type.startsWith('video') ? 'video' : 'image', date: new Date().toISOString().slice(0, 10), favorite: false, favoriteDate: '', src: uploaded.src, filename: uploaded.filename, storageFolder: uploaded.folder }); } } await saveMedia(); closeModal('add-modal'); render(); } catch (error) { window.alert(error.message); } });
function unlockApp() { document.body.classList.add('unlocked'); $('#password-gate').hidden = true; loadAppData(); }
function initPasswordGate() {
  renderGateAccounts(); renderAccountMenu(); $('#username-input').focus();
  $('#user-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-user-id]');
    if (!button) return;
    const user = users[button.dataset.userId];
    if (!user) return;
    $('#username-input').value = user.username;
    $('#gate-error').textContent = '';
    document.querySelectorAll('.profile-pill').forEach((pill) => pill.classList.toggle('active', pill === button));
  });
  $('#profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = $('#username-input').value;
    if (!users[sanitizeUsername(username)]) { $('#gate-error').textContent = 'Choose a saved profile or create a new one.'; return; }
    setActiveUser(sanitizeUsername(username));
    $('#gate-error').textContent = '';
    $('#username-input').value = '';
    unlockApp();
    render();
  });
  $('#create-profile').addEventListener('click', async () => {
    const username = $('#username-input').value;
    const result = await createUserProfile(username);
    if (!result.ok) {
      $('#gate-error').textContent = result.error;
      return;
    }
    $('#gate-error').textContent = '';
    $('#username-input').value = '';
    unlockApp();
    render();
  });
  $('#account-menu-toggle').addEventListener('click', () => toggleAccountMenu());
  $('#switch-account').addEventListener('click', () => {
    toggleAccountMenu(false);
    logoutUser();
  });
  $('#remove-profile').addEventListener('click', () => {
    toggleAccountMenu(false);
    removeCurrentProfile();
  });
}
$('#toggle-remove-media').addEventListener('click', () => { removingMedia = !removingMedia; if (!removingMedia) selectedMediaIds = []; render(); }); $('#remove-selected').addEventListener('click', async () => { const selected = media.filter((item) => selectedMediaIds.includes(item.id)); try { await Promise.all(selected.map(deleteStoredMedia)); media = media.filter((item) => !selectedMediaIds.includes(item.id)); selectedMediaIds = []; await saveMedia(); render(); } catch (error) { window.alert(error.message); } });
$('#add-empty-folder').addEventListener('click', async () => { const name = String(window.prompt('Name this folder') || '').trim(); const user = getCurrentUser(); if (!user || !name) return; if (name.toLowerCase() === 'unsorted' || getFolderOptions().some((folder) => folder.toLowerCase() === name.toLowerCase())) { window.alert('That folder already exists.'); return; } user.folders = [...(user.folders || []), name].sort((a, b) => a.localeCompare(b)); await saveCatalog(); render(); });
$('#media-grid').addEventListener('click', (event) => { const card = event.target.closest('.artist-card'); const action = event.target.closest('[data-action]')?.dataset.action; if (!card || activeView !== 'artists' || action !== 'edit-artist') return; event.stopPropagation(); const artist = getCurrentUser()?.artists?.find((entry) => entry.link === card.dataset.artistLink); if (!artist) return; activeArtistEdit = artist; $('#artist-name').value = artist.name; $('#artist-link').value = artist.link; $('#artist-tags').value = (artist.tags || []).join(', '); $('#artist-folder').value = artist.folder || ''; $('#artist-nsfw').checked = (artist.tags || []).includes('nsfw'); syncNsfwToggle('artist-nsfw-toggle'); $('#artist-modal').hidden = false; });
$('#artist-form').addEventListener('submit', (event) => { if (!activeArtistEdit) return; const user = getCurrentUser(); const oldArtist = activeArtistEdit; const name = $('#artist-name').value.trim(); if (!user || !name) return; event.preventDefault(); event.stopImmediatePropagation(); media.forEach((item) => { if (item.artist.toLowerCase() === oldArtist.name.toLowerCase()) item.artist = name; }); user.artists = (user.artists || []).filter((artist) => artist !== oldArtist && artist.name.toLowerCase() !== name.toLowerCase()); const tags = $('#artist-tags').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean); if ($('#artist-nsfw').checked && !tags.includes('nsfw')) tags.push('nsfw'); const imageFile = $('#artist-image').files[0]; const saveArtist = (image) => { user.artists.push({ name, link: $('#artist-link').value.trim(), image: image || oldArtist.image || '', tags, folder: $('#artist-folder').value.trim() }); user.artists.sort((a, b) => a.name.localeCompare(b.name)); activeArtistEdit = null; saveCatalog(); $('#artist-modal').hidden = true; render(); }; if (imageFile) { const reader = new FileReader(); reader.onload = () => saveArtist(reader.result); reader.readAsDataURL(imageFile); } else saveArtist(''); }, true);
let contextMediaItem = null;
const cardContextMenu = $('#card-context-menu');
document.addEventListener('contextmenu', (event) => { const card = event.target.closest('.media-card, .folder-card'); if (!card || !$('#media-grid').contains(card)) return; event.preventDefault(); contextMediaItem = card.dataset.id ? media.find((item) => item.id === card.dataset.id) : card.dataset.locationId ? media.find((item) => item.id === card.dataset.locationId) : card.dataset.artistLink ? media.find((item) => item.artist.toLowerCase() === getCurrentUser()?.artists?.find((artist) => artist.link === card.dataset.artistLink)?.name.toLowerCase()) : null; cardContextMenu.hidden = false; cardContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - cardContextMenu.offsetWidth - 8)}px`; cardContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - cardContextMenu.offsetHeight - 8)}px`; });
$('#show-card-location').addEventListener('click', async () => { cardContextMenu.hidden = true; if (contextMediaItem) await window.electronAPI?.showMediaInFolder({ filename: contextMediaItem.filename, type: contextMediaItem.type }); else await window.electronAPI?.openMediaLocation(); contextMediaItem = null; }); document.addEventListener('click', (event) => { if (!event.target.closest('#card-context-menu')) cardContextMenu.hidden = true; });
initPasswordGate();
loadUsers();
window.addEventListener('beforeunload', () => {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  currentUser.media = media.map(normalize);
  const body = JSON.stringify({ profile: currentUserId, media: currentUser.media });
  navigator.sendBeacon('/api/catalog', new Blob([body], { type: 'application/json' }));
});
