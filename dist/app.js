'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const number = value => new Intl.NumberFormat('es-ES').format(value);
const cityName = city => city === 'ceuta' ? 'Ceuta' : 'Cádiz';
const typeName = type => ({ comparsa: 'Comparsa', chirigota: 'Chirigota', coro: 'Coro', cuarteto: 'Cuarteto' }[type] || 'Modalidad pendiente');
const photoLabel = photo => photo.named ? `Montse con ${photo.name}` : photo.name;
const PAGE_SIZE = 12;
const state = { city: 'all', year: 'all', type: 'all', query: '', sort: 'recent', page: 1 };
let catalogue, groups, currentGroup, currentPhotos = [], currentPhotoIndex = 0;
let searchTimer, toastTimer, lastFocus;
const groupDialog = $('#group-dialog');
const photoDialog = $('#photo-dialog');

function readURL() {
  const params = new URLSearchParams(location.search);
  state.city = ['all', 'ceuta', 'cadiz'].includes(params.get('ciudad')) ? params.get('ciudad') : 'all';
  state.type = ['all', 'comparsa', 'chirigota', 'coro', 'cuarteto', 'unknown'].includes(params.get('modalidad')) ? params.get('modalidad') : 'all';
  const year = params.get('ano');
  state.year = year === 'unknown' || groups.some(group => String(group.year) === year) ? year : 'all';
  state.query = (params.get('q') || '').slice(0, 200);
  state.sort = ['recent', 'oldest', 'az', 'photos'].includes(params.get('orden')) ? params.get('orden') : 'recent';
  state.page = Math.max(1, parseInt(params.get('pagina'), 10) || 1);
  syncControls();
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.city !== 'all') params.set('ciudad', state.city);
  if (state.year !== 'all') params.set('ano', state.year);
  if (state.type !== 'all') params.set('modalidad', state.type);
  if (state.query) params.set('q', state.query);
  if (state.sort !== 'recent') params.set('orden', state.sort);
  if (state.page > 1) params.set('pagina', String(state.page));
  const query = params.size ? `?${params}` : '';
  history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
}

function syncControls() {
  for (const [attribute, value] of [['city', state.city]]) {
    $$(`[data-${attribute}]`).forEach(button => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  $('#year-filter').value = state.year;
  $('#type-filter').value = state.type;
  if ($('#search').value !== state.query) $('#search').value = state.query;
  $('#sort').value = state.sort;
  $('#reset-filters').hidden = !hasFilters();
}

function hasFilters() {
  return state.city !== 'all' || state.year !== 'all' || state.type !== 'all' || Boolean(state.query);
}

function groupPassesFilters(group) {
  if (state.city !== 'all' && group.city !== state.city) return false;
  if (state.year === 'unknown' && group.year) return false;
  if (state.year !== 'all' && state.year !== 'unknown' && String(group.year) !== state.year) return false;
  if (state.type === 'unknown' && group.type) return false;
  if (state.type !== 'all' && state.type !== 'unknown' && group.type !== state.type) return false;
  return true;
}

function groupMatchesQuery(group, query) {
  return normalize(group.isEvent ? 'Encuentros en eventos' : group.name).includes(query);
}

function compareGroups(a, b) {
  if (a.isEvent !== b.isEvent) return a.isEvent ? 1 : -1;
  if (state.sort === 'az') return a.name.localeCompare(b.name, 'es');
  if (state.sort === 'photos') return b.photos.length - a.photos.length || a.name.localeCompare(b.name, 'es');
  if (!a.year && b.year) return 1;
  if (a.year && !b.year) return -1;
  const delta = (a.year || 0) - (b.year || 0);
  return (state.sort === 'oldest' ? delta : -delta) || a.name.localeCompare(b.name, 'es');
}

function getResults() {
  const query = normalize(state.query);
  return groups.filter(group => (!group.isEvent || (state.year === 'all' && state.type === 'all')) && groupPassesFilters(group) && (!query || groupMatchesQuery(group, query))).sort(compareGroups);
}

function groupCard(group) {
  const name = group.isEvent ? 'Encuentros en eventos' : group.name;
  const image = group.cover || group.photos[0];
  const imageClass = group.cover ? (image.height > image.width * 0.9 ? 'poster' : '') : 'personal';
  return `<article class="group-card"><button type="button" class="card-open" data-open-group="${escapeHTML(group.id)}" aria-label="Abrir ${escapeHTML(name)}, ${cityName(group.city)}${group.year ? ', ' + group.year : ''}">
    <div class="card-image-wrap"><img class="card-image ${imageClass}" src="${image.thumb}" width="${image.width}" height="${image.height}" alt="${escapeHTML(group.cover ? `Portada de ${group.name}` : photoLabel(image))}" loading="lazy" decoding="async">
    <span class="card-year ${group.year ? '' : 'undated'}">${group.isEvent ? 'Álbum' : group.year || 'Sin fechar'}</span>${!group.cover && !group.isEvent ? '<span class="card-remember">Mi recuerdo</span>' : ''}<span class="card-city">${icon('pin')}${cityName(group.city)}</span></div>
    <div class="card-info"><div class="card-type" data-modality="${group.type || 'unknown'}"><span class="type-dot"></span>${escapeHTML(group.isEvent ? 'Álbum de encuentros' : group.type ? typeName(group.type) : 'Por clasificar')}</div><h3>${escapeHTML(name)}</h3><div class="card-meta"><span>${icon('camera')}${group.photos.length} ${group.photos.length === 1 ? 'foto' : 'fotos'}</span>${icon('arrow')}</div></div>
  </button></article>`;
}

function render() {
  const results = getResults();
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const count = results.length;
  const groupCount = results.filter(group => !group.isEvent).length;
  const eventCount = count - groupCount;
  const summary = [groupCount || !eventCount ? `${number(groupCount)} ${groupCount === 1 ? 'agrupación' : 'agrupaciones'}` : '', eventCount ? `${eventCount} álbum de eventos` : ''].filter(Boolean).join(' · ');
  $('#results-count').innerHTML = `<strong>${summary}</strong>${count ? ` <span>· ${start + 1}–${Math.min(start + PAGE_SIZE, count)}</span>` : ''}${state.city !== 'all' ? ` en ${cityName(state.city)}` : ''}`;
  const grid = $('#catalog-grid');
  grid.innerHTML = count ? results.slice(start, start + PAGE_SIZE).map(groupCard).join('') : `<div class="empty-state">${icon('search')}<h3>¡Esa no la encuentro!</h3><p>Prueba con otro nombre o quita algún filtro.</p><button type="button" data-reset>Ver toda la colección ${icon('arrow')}</button></div>`;
  renderPagination(pages);
  syncControls();
  updateURL();
}

function renderPagination(pages) {
  const nav = $('#pagination');
  if (pages <= 1) { nav.innerHTML = ''; return; }
  const visible = new Set([1, pages, state.page - 1, state.page, state.page + 1]);
  if (state.page < 4) [2, 3, 4].forEach(page => visible.add(page));
  if (state.page > pages - 3) [pages - 1, pages - 2, pages - 3].forEach(page => visible.add(page));
  const range = [...visible].filter(page => page > 0 && page <= pages).sort((a, b) => a - b);
  let html = `<button type="button" class="prev" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevron')}</button>`;
  let previous = 0;
  for (const page of range) {
    if (previous && page > previous + 1) html += '<span class="ellipsis" aria-hidden="true">…</span>';
    html += `<button type="button" data-page="${page}" class="${page === state.page ? 'active' : ''}" ${page === state.page ? 'aria-current="page"' : ''} aria-label="Página ${page}">${page}</button>`;
    previous = page;
  }
  html += `<button type="button" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevron')}</button>`;
  nav.innerHTML = html;
}

function setFilter(key, value) {
  clearTimeout(searchTimer);
  state[key] = value;
  state.page = 1;
  render();
}

function resetFilters() {
  Object.assign(state, { city: 'all', year: 'all', type: 'all', query: '', page: 1 });
  render();
}

function renderCollection() {
  const stats = catalogue.stats;
  $('#stat-groups').textContent = number(stats.groups);
  $('#stat-photos').textContent = number(stats.photos);
  const years = [...new Set(groups.map(group => group.year).filter(Boolean))].sort((a, b) => b - a);
  $('#year-filter').innerHTML = '<option value="all">Todos</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('') + '<option value="unknown">Sin fechar</option>';
}

function openGroup(id, writeHash = true) {
  const group = groups.find(item => item.id === id);
  if (!group) { toast('Esta agrupación todavía no sale en la colección.'); return; }
  if (groupDialog.open && currentGroup?.id === id) return;
  currentGroup = group;
  const image = group.cover || group.photos[0];
  const poster = Boolean(group.cover && image.height > image.width * 0.9);
  $('#group-content').innerHTML = `<div class="dialog-cover"><img src="${image.src}" alt="${escapeHTML(group.cover ? `Portada de ${group.name}` : photoLabel(image))}" class="${poster ? 'poster' : ''}">${group.cover ? `<button type="button" class="cover-open" data-cover>${icon('search')}Ver portada completa</button>` : ''}<div class="dialog-heading"><div class="eyebrow">${cityName(group.city)} · ${escapeHTML(group.isEvent ? 'Encuentros en eventos' : typeName(group.type))}</div><h2 id="group-title">${escapeHTML(group.isEvent ? 'Encuentros en eventos' : group.name)}</h2></div></div>
    <div class="dialog-body"><div class="group-details"><div class="details-meta"><span class="meta-chip">${icon('pin')}${cityName(group.city)}</span><span class="meta-chip">${group.year || 'Año pendiente'}</span>${!group.isEvent ? `<span class="meta-chip">${escapeHTML(typeName(group.type))}</span>` : ''}</div><button type="button" class="share-button" id="share-group" aria-label="Copiar enlace a esta agrupación">${icon('link')}Copiar enlace</button></div>
    <div class="album-title"><h3>Fotos con Montse</h3><span>${group.photos.length} ${group.photos.length === 1 ? 'foto para el álbum' : 'fotos para el álbum'}</span></div>
    <div class="album-grid">${group.photos.map(photo => `<button type="button" class="album-photo" data-album-photo="${photo.id}" aria-label="Ver ${escapeHTML(photoLabel(photo))}"><span><img src="${photo.thumb}" width="${photo.width}" height="${photo.height}" alt="${escapeHTML(photoLabel(photo))}" loading="lazy" decoding="async"></span><span class="album-caption">${escapeHTML(photo.name)}</span></button>`).join('')}</div>
    ${!group.photos.length ? '<p class="no-photos">Aquí, de momento, está la portada.</p>' : ''}
    <details class="record-notes"><summary>Un par de detalles</summary><p>Del álbum de Montse. Los nombres son los que guardó con cada foto. El año es el de la agrupación; la foto puede ser de otro encuentro.</p>${(!group.year || !group.type) && !group.isEvent ? '<p>Aún nos queda algún dato por confirmar. En cuanto lo tengamos claro, completamos la ficha.</p>' : ''}${!group.cover ? '<p>Esta agrupación sale con una foto del álbum porque todavía no tiene una portada aparte.</p>' : ''}${group.references.length ? `<p>Para completar los datos: ${group.references.map(reference => `<a href="${escapeHTML(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(reference.title)}</a>`).join(', ')}.</p>` : ''}</details></div>`;
  lastFocus = document.activeElement;
  if (!groupDialog.open) groupDialog.showModal();
  groupDialog.scrollTop = 0;
  $('#close-group').focus({ preventScroll: true });
  if (writeHash) history.pushState({ carnavalModal: true }, '', `${location.pathname}${location.search}#agrupacion/${group.id}`);
}

function restoreGroupFocus() {
  const target = lastFocus?.isConnected && lastFocus !== document.body ? lastFocus
    : $$('[data-open-group]').find(button => button.dataset.openGroup === currentGroup?.id);
  (target || $('#search'))?.focus({ preventScroll: true });
}

function closeGroup() {
  if (!groupDialog.open) return;
  groupDialog.close();
  if (location.hash.startsWith('#agrupacion/')) {
    if (history.state?.carnavalModal) history.back();
    else {
      history.replaceState(null, '', `${location.pathname}${location.search}#archivo`);
      $('#archivo').scrollIntoView({ block: 'start' });
    }
  }
  restoreGroupFocus();
}

function openPhotoList(records, index) {
  if (!records.length) return;
  currentPhotos = records;
  currentPhotoIndex = Math.max(0, index);
  updatePhoto();
  if (!photoDialog.open) photoDialog.showModal();
  $('#close-photo').focus({ preventScroll: true });
}

function openPhotoById(id) {
  if (!currentGroup || !groupDialog.open) return;
  const records = currentGroup.photos.map(photo => ({ group: currentGroup, photo }));
  const index = records.findIndex(record => record.photo.id === id);
  if (index >= 0) openPhotoList(records, index);
}

function updatePhoto() {
  const record = currentPhotos[currentPhotoIndex];
  if (!record) return;
  const { group, photo, cover } = record;
  const image = $('#lightbox-image');
  image.src = photo.src;
  image.alt = cover ? `Portada de ${group.name}` : photoLabel(photo);
  $('#photo-position').textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`;
  $('#photo-caption').textContent = cover ? group.name : photoLabel(photo);
  $('#photo-context').textContent = `${group.isEvent ? 'Encuentros en eventos' : group.name} · ${cityName(group.city)}${group.year ? ` · Agrupación de ${group.year}` : ' · Año por confirmar'}${cover ? ' · Portada' : ''}`;
  $('#photo-prev').disabled = currentPhotoIndex === 0;
  $('#photo-next').disabled = currentPhotoIndex === currentPhotos.length - 1;
  for (const offset of [-1, 1]) {
    const neighbor = currentPhotos[currentPhotoIndex + offset];
    if (neighbor) { const preload = new Image(); preload.src = neighbor.photo.src; }
  }
}

function movePhoto(delta) {
  const nextIndex = currentPhotoIndex + delta;
  if (nextIndex >= 0 && nextIndex < currentPhotos.length) {
    currentPhotoIndex = nextIndex;
    updatePhoto();
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  const host = photoDialog.open ? photoDialog : groupDialog.open ? groupDialog : document.body;
  host.append(element);
  element.textContent = message;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
}

async function shareGroup() {
  const url = new URL(location.href);
  url.hash = `agrupacion/${currentGroup.id}`;
  try {
    await navigator.clipboard.writeText(url.href);
    toast('¡Enlace copiado!');
  } catch {
    const field = document.createElement('textarea');
    field.value = url.href;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    groupDialog.append(field);
    field.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch { /* Manual selection remains available in the address bar. */ }
    field.remove();
    toast(success ? '¡Enlace copiado!' : 'Puedes copiar el enlace desde la barra de direcciones.');
  }
}

function openFromHash() {
  if (location.hash === '#anos') {
    history.replaceState(null, '', `${location.pathname}${location.search}#archivo`);
    $('#year-filter').focus();
    return;
  }
  const prefix = '#agrupacion/';
  if (location.hash.startsWith(prefix)) {
    let id;
    try { id = decodeURIComponent(location.hash.slice(prefix.length)); }
    catch { toast('El enlace a esta agrupación no es válido.'); return; }
    openGroup(id, false);
  } else if (groupDialog.open) {
    if (photoDialog.open) photoDialog.close();
    groupDialog.close();
    restoreGroupFocus();
  }
}

function setupEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-city')) setFilter('city', button.dataset.city);
    else if (button.hasAttribute('data-page')) {
      state.page = Number(button.dataset.page);
      render();
      $('.results-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (button.hasAttribute('data-reset')) resetFilters();
    else if (button.hasAttribute('data-open-group')) openGroup(button.dataset.openGroup);
    else if (button.hasAttribute('data-album-photo')) openPhotoById(button.dataset.albumPhoto);
    else if (button.hasAttribute('data-cover') && currentGroup?.cover) openPhotoList([{ group: currentGroup, photo: currentGroup.cover, cover: true }], 0);
    else if (button.id === 'share-group') shareGroup();
  });
  $('#search').addEventListener('input', event => {
    clearTimeout(searchTimer);
    state.query = event.target.value;
    searchTimer = setTimeout(() => setFilter('query', state.query), 150);
  });
  $('#year-filter').addEventListener('change', event => setFilter('year', event.target.value));
  $('#type-filter').addEventListener('change', event => setFilter('type', event.target.value));
  $('#sort').addEventListener('change', event => setFilter('sort', event.target.value));
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#close-group').addEventListener('click', closeGroup);
  groupDialog.addEventListener('cancel', event => { event.preventDefault(); closeGroup(); });
  $('#close-photo').addEventListener('click', () => photoDialog.close());
  $('#photo-prev').addEventListener('click', () => movePhoto(-1));
  $('#photo-next').addEventListener('click', () => movePhoto(1));
  groupDialog.addEventListener('click', event => {
    const rect = groupDialog.getBoundingClientRect();
    if (event.target === groupDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeGroup();
  });
  document.addEventListener('keydown', event => {
    if (photoDialog.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      movePhoto(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === '/' && !groupDialog.open && !photoDialog.open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      $('#search').focus();
      $('#search').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  let touchStart = null;
  photoDialog.addEventListener('touchstart', event => { touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
  photoDialog.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) movePhoto(dx < 0 ? 1 : -1);
    touchStart = null;
  }, { passive: true });
  window.addEventListener('popstate', () => { readURL(); render(); openFromHash(); if (!groupDialog.open) restoreGroupFocus(); });
  window.addEventListener('hashchange', openFromHash);
}

async function initialize() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('Catalogue not available');
    catalogue = await response.json();
    groups = catalogue.groups;
    renderCollection();
    readURL();
    setupEvents();
    render();
    openFromHash();
  } catch (error) {
    $('#results-count').textContent = 'El archivo no se ha podido cargar.';
    $('#catalog-grid').innerHTML = '<div class="empty-state error-state"><h3>¡Un momento, que arrancamos!</h3><p>El álbum no ha cargado. Comprueba la conexión y prueba otra vez.</p><button type="button" id="retry-load">Volver a intentarlo</button></div>';
    $('#retry-load').addEventListener('click', () => location.reload());
    console.error('Unable to load the catalogue:', error);
  }
}

initialize();
