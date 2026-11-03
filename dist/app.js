'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
const number = value => new Intl.NumberFormat('es-ES').format(value);
const cityName = city => city === 'ceuta' ? 'Ceuta' : 'Cádiz';
const typeName = type => ({ comparsa: 'Comparsa', chirigota: 'Chirigota', coro: 'Coro', cuarteto: 'Cuarteto' }[type] || 'Modalidad pendiente');
const photoLabel = photo => photo.named ? `Montse con ${photo.name}` : photo.name;
const groupLabel = group => group.isEvent ? 'Encuentros en eventos' : group.name;
const alphabetic = new Intl.Collator('es', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
const PAGE_SIZE = 12;
const CATEGORIES = [['all', 'Todo el archivo'], ['comparsa', 'Comparsas'], ['chirigota', 'Chirigotas'], ['coro', 'Coros'], ['cuarteto', 'Cuartetos'], ['unknown', 'Por clasificar']];
const state = { city: 'all', year: 'all', type: 'all', query: '', member: '', page: 1 };
let catalogue, groups, currentGroup, currentPhotos = [], currentPhotoIndex = 0;
let searchTimer, toastTimer, lastFocus;
let members = [], membersByKey = new Map(), memberDraft = '', memberSuggestions = [], activeMemberIndex = -1;
const groupDialog = $('#group-dialog');
const photoDialog = $('#photo-dialog');
const aboutDialog = $('#about-dialog');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver, photoAnimation;

function clearReveals(root) {
  $$('.reveal-pending', root).forEach(element => revealObserver?.unobserve(element));
}

function revealProgrammes(root) {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  revealObserver ||= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove('reveal-pending');
      entry.target.classList.add('is-revealed');
      revealObserver.unobserve(entry.target);
    }
  }, { threshold: .06, rootMargin: '0px 0px -20px 0px' });
  $$('.group-card,.album-photo', root).forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${index % 3 * 85}ms`);
    element.classList.add('reveal-pending');
    revealObserver.observe(element);
  });
}

function animatePhotograph() {
  photoAnimation?.cancel();
  if (reducedMotion.matches || !photoDialog.open) return;
  photoAnimation = $('.photo-mount').animate([
    { opacity: .25, transform: 'translateY(10px) scale(.985)' },
    { opacity: 1, transform: 'translateY(0) scale(1)' },
  ], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
}

function readURL() {
  const params = new URLSearchParams(location.search);
  state.city = ['all', 'ceuta', 'cadiz'].includes(params.get('ciudad')) ? params.get('ciudad') : 'all';
  state.type = ['all', 'comparsa', 'chirigota', 'coro', 'cuarteto', 'unknown'].includes(params.get('modalidad')) ? params.get('modalidad') : 'all';
  const year = params.get('ano');
  state.year = year === 'unknown' || groups.some(group => String(group.year) === year) ? year : 'all';
  state.query = (params.get('q') || '').slice(0, 200);
  const memberValue = (params.get('integrante') || '').slice(0, 200);
  state.member = normalize(memberValue);
  memberDraft = membersByKey.get(state.member)?.name || memberValue;
  state.page = Math.max(1, parseInt(params.get('pagina'), 10) || 1);
  syncControls();
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.city !== 'all') params.set('ciudad', state.city);
  if (state.year !== 'all') params.set('ano', state.year);
  if (state.type !== 'all') params.set('modalidad', state.type);
  if (state.query) params.set('q', state.query);
  if (state.member) params.set('integrante', membersByKey.get(state.member)?.name || state.member);
  if (state.page > 1) params.set('pagina', String(state.page));
  const query = params.size ? `?${params}` : '';
  history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
}

function syncControls() {
  for (const [attribute, value] of [['city', state.city], ['type', state.type]]) {
    $$(`[data-${attribute}]`).forEach(button => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  $('#year-filter').value = state.year;
  if ($('#search').value !== state.query) $('#search').value = state.query;
  if ($('#member-search').value !== memberDraft) $('#member-search').value = memberDraft;
  $('#clear-member').hidden = !memberDraft && !state.member;
  $('#reset-filters').hidden = !hasFilters();
}

function hasFilters() {
  return state.city !== 'all' || state.year !== 'all' || state.type !== 'all' || Boolean(state.query) || Boolean(state.member);
}

function groupPassesFilters(group, filters = state) {
  if (filters.member && !membersByKey.get(filters.member)?.byGroup.has(group.id)) return false;
  if (filters.city !== 'all' && group.city !== filters.city) return false;
  if (filters.year === 'unknown' && group.year) return false;
  if (filters.year !== 'all' && filters.year !== 'unknown' && String(group.year) !== filters.year) return false;
  if (filters.type === 'unknown' && group.type) return false;
  if (filters.type !== 'all' && filters.type !== 'unknown' && group.type !== filters.type) return false;
  return true;
}

function groupMatchesQuery(group, query) {
  return normalize(groupLabel(group)).includes(query);
}

function compareGroups(a, b) {
  return alphabetic.compare(groupLabel(a), groupLabel(b)) || alphabetic.compare(a.id, b.id);
}

function buildMemberIndex() {
  const labels = new Map();
  for (const group of groups) for (const photo of group.photos) {
    if (!photo.named) continue;
    const key = normalize(photo.name);
    if (!key) continue;
    const name = photo.name.replace(/\s+/g, ' ').trim();
    const previous = labels.get(key);
    // Keep accent-insensitive matching, with the accented source label for display.
    if (!previous || (name.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length > (previous.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length) labels.set(key, name);
  }
  const resolved = new Map();
  const ambiguous = new Set(['jose luis antonio']);
  function labelMembers(key) {
    if (resolved.has(key)) return resolved.get(key);
    const words = key.split(' ');
    // Two-word labels can be first name + surname. Preserve uncertain labels.
    if (words.length < 3 || ambiguous.has(key)) { resolved.set(key, [key]); return [key]; }
    const memo = new Map();
    function partition(start) {
      if (start === words.length) return [];
      if (memo.has(start)) return memo.get(start);
      let best = null;
      for (let end = words.length; end > start; end--) {
        const part = words.slice(start, end).join(' ');
        if (part === key || !labels.has(part)) continue;
        const tail = partition(end);
        if (tail !== null && (best === null || tail.length + 1 < best.length)) best = [part, ...tail];
      }
      memo.set(start, best);
      return best;
    }
    const parts = partition(0);
    const result = parts?.length > 1 ? [...new Set(parts.flatMap(labelMembers))] : [key];
    resolved.set(key, result);
    return result;
  }
  membersByKey = new Map();
  for (const group of groups) for (const photo of group.photos) {
    if (!photo.named || !normalize(photo.name)) continue;
    for (const key of labelMembers(normalize(photo.name))) {
      if (!membersByKey.has(key)) membersByKey.set(key, { key, name: labels.get(key), byGroup: new Map(), photos: new Set(), cities: new Set(), groups: 0, events: 0 });
      const member = membersByKey.get(key);
      if (!member.byGroup.has(group.id)) {
        member.byGroup.set(group.id, new Set());
        if (group.isEvent) member.events++; else member.groups++;
      }
      member.byGroup.get(group.id).add(photo.id);
      member.photos.add(photo.id);
      member.cities.add(group.city);
    }
  }
  members = [...membersByKey.values()].sort((a, b) => alphabetic.compare(a.name, b.name));
}

function closeMemberSuggestions() {
  $('#member-suggestions').hidden = true;
  $('#member-search').setAttribute('aria-expanded', 'false');
  $('#member-search').removeAttribute('aria-activedescendant');
  activeMemberIndex = -1;
}

function positionMemberSuggestions() {
  const popup = $('#member-suggestions');
  if (popup.hidden) return;
  const list = $('#member-options');
  list.style.removeProperty('max-height');
  const field = $('#member-filter').getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = (viewport?.offsetTop || 0) + 12;
  const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12;
  const above = field.top - top - 6;
  const below = bottom - field.bottom - 6;
  const opensUp = below < popup.offsetHeight && above > below;
  popup.classList.toggle('opens-up', opensUp);
  const available = opensUp ? above : below;
  const chromeHeight = popup.offsetHeight - list.offsetHeight;
  list.style.maxHeight = `${Math.max(48, Math.min(list.offsetHeight, available - chromeHeight))}px`;
}

function highlightMember(index) {
  if (!memberSuggestions.length) return;
  activeMemberIndex = (index + memberSuggestions.length) % memberSuggestions.length;
  $$('#member-options [role="option"]').forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === activeMemberIndex)));
  const option = $(`#member-option-${activeMemberIndex}`);
  $('#member-search').setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
}

function updateMemberSuggestions() {
  const query = normalize(memberDraft);
  if (!query) { closeMemberSuggestions(); return; }
  const terms = query.split(' ');
  const rank = member => member.key === query ? 0 : member.key.startsWith(query) ? 1 : 2;
  const matches = members.filter(member => terms.every(term => member.key.includes(term))).sort((a, b) => rank(a) - rank(b) || alphabetic.compare(a.name, b.name));
  memberSuggestions = matches.slice(0, 12);
  activeMemberIndex = -1;
  $('#member-options').innerHTML = memberSuggestions.map((member, index) => `<li role="option" tabindex="-1" aria-selected="false" id="member-option-${index}" data-member-option="${escapeHTML(member.key)}"><span class="member-name">${escapeHTML(member.name)}</span><span class="member-totals">${member.groups} ${member.groups === 1 ? 'agrupación' : 'agrupaciones'}${member.events ? ` · ${member.events} álbum de eventos` : ''} · ${member.photos.size} ${member.photos.size === 1 ? 'foto' : 'fotos'}</span><span class="member-city">${[...member.cities].map(cityName).join(' · ')}</span></li>`).join('');
  $('#member-suggestion-status').textContent = !matches.length ? 'No hay nombres que coincidan en el álbum.' : matches.length > 12 ? `12 de ${matches.length} nombres. Escribe algo más para concretar.` : 'Selecciona un nombre. Se combinará con los demás filtros.';
  $('#member-suggestions').hidden = false;
  $('#member-search').setAttribute('aria-expanded', 'true');
  $('#member-search').removeAttribute('aria-activedescendant');
  positionMemberSuggestions();
}

function selectMember(key) {
  const member = membersByKey.get(key);
  if (!member) return;
  memberDraft = member.name;
  state.member = key;
  state.page = 1;
  render();
  $('#member-search').focus({ preventScroll: true });
  closeMemberSuggestions();
}

function clearMember() {
  memberDraft = '';
  state.member = '';
  state.page = 1;
  render();
  closeMemberSuggestions();
  $('#member-search').focus({ preventScroll: true });
}

function matchingGroups(overrides = {}) {
  const filters = { ...state, ...overrides };
  const query = normalize(filters.query);
  return groups.filter(group => (!group.isEvent || (filters.year === 'all' && filters.type === 'all')) && groupPassesFilters(group, filters) && (!query || groupMatchesQuery(group, query)));
}

function getResults() {
  return matchingGroups().sort(compareGroups);
}

function collectionCounts(items) {
  return {
    groups: items.filter(group => !group.isEvent).length,
    events: items.filter(group => group.isEvent).length,
    photos: items.reduce((total, group) => total + group.photos.length, 0),
    covers: items.reduce((total, group) => total + Number(Boolean(group.cover)), 0),
  };
}

function updateFacets() {
  for (const city of ['all', 'ceuta', 'cadiz']) {
    const counts = collectionCounts(matchingGroups({ city }));
    const label = $(`[data-city-count="${city}"]`);
    label.innerHTML = `<strong>${number(counts.photos)} fotos</strong><span>${number(counts.groups)} ${counts.groups === 1 ? 'agrupación' : 'agrupaciones'}</span>`;
    label.dataset.photos = counts.photos;
    label.dataset.groups = counts.groups;
  }
  for (const [type] of CATEGORIES) {
    const counts = collectionCounts(matchingGroups({ type }));
    $(`[data-category-photos="${type}"]`).textContent = number(counts.photos);
    $(`[data-category-groups="${type}"]`).textContent = `${number(counts.groups)} ${counts.groups === 1 ? 'agrupación' : 'agrupaciones'}`;
    const button = $(`[data-type="${type}"]`);
    button.dataset.photos = counts.photos;
    button.dataset.groups = counts.groups;
  }
  const years = [...new Set(groups.map(group => group.year).filter(Boolean))].sort((a, b) => b - a);
  const options = [['all', 'Todos los años'], ...years.map(year => [String(year), String(year)]), ['unknown', 'Sin fechar']];
  $('#year-filter').innerHTML = options.map(([year, label]) => {
    const count = collectionCounts(matchingGroups({ year })).photos;
    return `<option value="${year}" data-photos="${count}">${label} · ${number(count)} fotos</option>`;
  }).join('');
}

function groupCard(group) {
  const name = groupLabel(group);
  const image = group.cover || group.photos[0];
  const imageClass = group.cover ? (image.height > image.width * 0.9 ? 'poster' : '') : 'personal';
  const names = [...new Set(group.photos.filter(photo => photo.named).map(photo => photo.name))];
  const selectedMember = membersByKey.get(state.member);
  const memberPhotoCount = selectedMember?.byGroup.get(group.id)?.size || 0;
  const preview = selectedMember ? `Con ${selectedMember.name} · ${memberPhotoCount} ${memberPhotoCount === 1 ? 'fotografía' : 'fotografías'}` : names.length ? `Con ${names.slice(0, 2).join(' · ')}${names.length > 2 ? '…' : ''}` : 'Encuentros conservados en mi álbum.';
  return `<article class="group-card"><button type="button" class="card-open" data-open-group="${escapeHTML(group.id)}" data-photos="${group.photos.length}" data-member-photos="${memberPhotoCount}" data-covers="${Number(Boolean(group.cover))}" aria-label="Abrir ${escapeHTML(name)}, ${cityName(group.city)}${group.year ? ', ' + group.year : ''}, ${group.photos.length} fotografías y ${Number(Boolean(group.cover))} portada">
    <div class="card-topline"><span>${cityName(group.city)}</span><span class="card-year">${group.isEvent ? 'Encuentros' : group.year || 'Año por confirmar'}</span></div>
    <div class="card-image-wrap framed-media"><span class="photo-window"><img class="card-image ${imageClass}" src="${image.thumb}" width="${image.width}" height="${image.height}" alt="${escapeHTML(group.cover ? `Portada de ${group.name}` : photoLabel(image))}" loading="lazy" decoding="async"><span class="card-image-label">${group.cover ? 'El tipo de aquel carnaval' : 'Una fotografía de mi álbum'}</span></span></div>
    <div class="card-info"><div class="card-type">${escapeHTML(group.isEvent ? 'Álbum de encuentros' : group.type ? typeName(group.type) : 'Modalidad por confirmar')}</div><h3>${escapeHTML(name)}</h3><p class="card-people">${escapeHTML(preview)}</p><div class="card-counts"><div class="card-photo-count"><strong>${number(group.photos.length)}</strong><span>fotografías del álbum</span></div><div class="card-cover-count"><strong>${group.cover ? '1' : '—'}</strong><span>${group.cover ? 'portada' : 'sin portada aparte'}</span></div></div><span class="card-cta">Abrir el álbum ${icon('arrow')}</span></div>
  </button></article>`;
}

function render() {
  const results = getResults();
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const count = results.length;
  const counts = collectionCounts(results);
  $('#results-count').innerHTML = `<strong>${number(counts.groups)} ${counts.groups === 1 ? 'agrupación' : 'agrupaciones'}</strong><span class="result-photo-total" data-photo-total="${counts.photos}">${number(counts.photos)} fotografías</span><span>${number(counts.covers)} portadas${counts.events ? ` · ${counts.events} álbum de eventos` : ''}</span>`;
  $('#results-pages').textContent = count ? `${start + 1}–${Math.min(start + PAGE_SIZE, count)} de ${count} fichas` : 'Sin resultados';
  const grid = $('#catalog-grid');
  clearReveals(grid);
  window.CarnivalFrames?.release(grid);
  grid.innerHTML = count ? results.slice(start, start + PAGE_SIZE).map(groupCard).join('') : `<div class="empty-state">${icon('search')}<h3>Este recuerdo aún no aparece.</h3><p>Prueba con otro nombre, año o modalidad.</p><button type="button" data-reset>Volver al archivo completo ${icon('arrow')}</button></div>`;
  renderPagination(pages);
  updateFacets();
  syncControls();
  updateURL();
  revealProgrammes(grid);
  window.CarnivalFrames?.observe(grid);
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
  if (document.activeElement !== $('#member-search')) closeMemberSuggestions();
  state[key] = value;
  state.page = 1;
  render();
}

function resetFilters() {
  Object.assign(state, { city: 'all', year: 'all', type: 'all', query: '', member: '', page: 1 });
  memberDraft = '';
  closeMemberSuggestions();
  render();
}

function renderCollection() {
  const stats = catalogue.stats;
  $('#stat-groups').textContent = number(stats.groups);
  $('#stat-photos').textContent = number(stats.photos);
  $('#stat-first-year').textContent = stats.firstYear;
  $('#stat-last-year').textContent = stats.lastYear;
  $('#category-tickets').innerHTML = CATEGORIES.map(([type, label]) => `<button type="button" class="category-ticket" data-type="${type}" aria-pressed="false"><span class="category-name">${label}</span><span class="category-groups" data-category-groups="${type}"></span><span class="category-photos"><strong data-category-photos="${type}"></strong> fotografías</span></button>`).join('');
  const years = [...new Set(groups.map(group => group.year).filter(Boolean))].sort((a, b) => b - a);
  $('#year-filter').innerHTML = '<option value="all">Todos los años</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('') + '<option value="unknown">Sin fechar</option>';
}

function openGroup(id, writeHash = true) {
  const group = groups.find(item => item.id === id);
  if (!group) { toast('Esta agrupación todavía no sale en la colección.'); return; }
  if (groupDialog.open && currentGroup?.id === id) return;
  currentGroup = group;
  const image = group.cover || group.photos[0];
  const poster = Boolean(group.cover && image.height > image.width * 0.9);
  clearReveals($('#group-content'));
  window.CarnivalFrames?.release($('#group-content'));
  $('#group-content').innerHTML = `<div class="dialog-cover"><img src="${image.src}" alt="${escapeHTML(group.cover ? `Portada de ${group.name}` : photoLabel(image))}" class="${poster ? 'poster' : ''}">${group.cover ? `<button type="button" class="cover-open" data-cover>${icon('search')}Ver portada completa</button>` : ''}<div class="dialog-heading"><div class="eyebrow">${cityName(group.city)} · ${escapeHTML(group.isEvent ? 'Encuentros en eventos' : typeName(group.type))}</div><h2 id="group-title">${escapeHTML(group.isEvent ? 'Encuentros en eventos' : group.name)}</h2></div></div>
    <div class="dialog-body"><div class="group-details"><div class="details-meta"><span class="meta-chip">${icon('pin')}${cityName(group.city)}</span><span class="meta-chip">${group.year || 'Año pendiente'}</span>${!group.isEvent ? `<span class="meta-chip">${escapeHTML(typeName(group.type))}</span>` : ''}</div><button type="button" class="share-button" id="share-group" aria-label="Copiar enlace a esta agrupación">${icon('link')}Copiar enlace</button></div>
    <div class="album-title"><div><span class="eyebrow">LOS INSTANTES COMPARTIDOS</span><h3>Mi álbum de encuentros</h3></div><span>${group.photos.length} ${group.photos.length === 1 ? 'fotografía' : 'fotografías'} · ${group.cover ? '1 portada' : 'sin portada aparte'}</span></div>
    <div class="album-grid">${group.photos.map((photo, index) => `<button type="button" class="album-photo" data-album-photo="${photo.id}" aria-label="Ver ${escapeHTML(photoLabel(photo))}"><span class="album-image framed-media"><span class="photo-window"><img src="${photo.thumb}" width="${photo.width}" height="${photo.height}" alt="${escapeHTML(photoLabel(photo))}" loading="lazy" decoding="async"></span></span><span class="album-caption"><span class="album-order">${String(index + 1).padStart(2, '0')}</span><span>${escapeHTML(photo.name)}</span></span></button>`).join('')}</div>
    ${!group.photos.length ? '<p class="no-photos">Aquí, de momento, está la portada.</p>' : ''}
    <details class="record-notes"><summary>Acerca de este recuerdo</summary><p>Las fotografías pertenecen al álbum personal de Montse. El año corresponde a la agrupación; cada encuentro puede haberse producido después. Las fotografías del álbum se cuentan por separado de la portada.</p>${(!group.year || !group.type) && !group.isEvent ? '<p>Algunos datos esperan todavía su confirmación. Se conservan abiertos para cuidar la memoria con rigor.</p>' : ''}${!group.cover ? '<p>Esta ficha se presenta con una fotografía del álbum, ya que no tiene una portada independiente.</p>' : ''}${group.references.length ? `<p>Referencias para los datos: ${group.references.map(reference => `<a href="${escapeHTML(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(reference.title)}</a>`).join(', ')}.</p>` : ''}</details></div>`;
  lastFocus = document.activeElement;
  if (!groupDialog.open) groupDialog.showModal();
  groupDialog.scrollTop = 0;
  revealProgrammes($('#group-content'));
  window.CarnivalFrames?.observe($('#group-content'));
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
  fitPhotograph();
  $('#close-photo').focus({ preventScroll: true });
}

function fitPhotograph() {
  if (!photoDialog.open) return;
  const record = currentPhotos[currentPhotoIndex];
  if (!record) return;
  const figure = $('.lightbox-figure');
  const mount = $('.photo-mount');
  const figureStyle = getComputedStyle(figure);
  const mountStyle = getComputedStyle(mount);
  const horizontalFrame = parseFloat(mountStyle.paddingLeft) + parseFloat(mountStyle.paddingRight) + parseFloat(mountStyle.borderLeftWidth) + parseFloat(mountStyle.borderRightWidth);
  const verticalFrame = parseFloat(mountStyle.paddingTop) + parseFloat(mountStyle.paddingBottom) + parseFloat(mountStyle.borderTopWidth) + parseFloat(mountStyle.borderBottomWidth);
  const width = Math.max(80, figure.clientWidth - parseFloat(figureStyle.paddingLeft) - parseFloat(figureStyle.paddingRight) - horizontalFrame - 10);
  const height = Math.max(80, figure.clientHeight - parseFloat(figureStyle.paddingTop) - parseFloat(figureStyle.paddingBottom) - $('figcaption', figure).offsetHeight - parseFloat(figureStyle.gap) - verticalFrame - 10);
  const scale = Math.min(width / record.photo.width, height / record.photo.height, 1);
  mount.style.width = `${Math.floor(record.photo.width * scale) + horizontalFrame}px`;
  mount.style.height = `${Math.floor(record.photo.height * scale) + verticalFrame}px`;
  window.CarnivalFrames?.refresh(mount);
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
  $('#photo-position').textContent = `${cover ? 'Portada' : 'Fotografía'} ${String(currentPhotoIndex + 1).padStart(2, '0')} de ${String(currentPhotos.length).padStart(2, '0')}`;
  $('#photo-kind').textContent = cover ? 'EL TIPO DE AQUEL CARNAVAL' : 'UN RECUERDO COMPARTIDO';
  $('#photo-caption').textContent = cover ? group.name : photoLabel(photo);
  $('#photo-context').textContent = `${group.isEvent ? 'Encuentros en eventos' : group.name} · ${cityName(group.city)}${group.year ? ` · Agrupación de ${group.year}` : ' · Año por confirmar'}${cover ? ' · Portada' : ''}`;
  $('#photo-prev').disabled = currentPhotoIndex === 0;
  $('#photo-next').disabled = currentPhotoIndex === currentPhotos.length - 1;
  for (const offset of [-1, 1]) {
    const neighbor = currentPhotos[currentPhotoIndex + offset];
    if (neighbor) { const preload = new Image(); preload.src = neighbor.photo.src; }
  }
  fitPhotograph();
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
  const host = photoDialog.open ? photoDialog : groupDialog.open ? groupDialog : aboutDialog.open ? aboutDialog : document.body;
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
    toast('Enlace al recuerdo copiado.');
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
    toast(success ? 'Enlace al recuerdo copiado.' : 'Puedes copiar el enlace desde la barra de direcciones.');
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
    else if (button.hasAttribute('data-type')) setFilter('type', button.dataset.type);
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
  const memberInput = $('#member-search');
  memberInput.addEventListener('input', event => {
    memberDraft = event.target.value;
    if (state.member) { state.member = ''; state.page = 1; render(); }
    $('#clear-member').hidden = !memberDraft;
    updateMemberSuggestions();
  });
  memberInput.addEventListener('focus', () => { if (memberDraft) updateMemberSuggestions(); });
  memberInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if ($('#member-suggestions').hidden) updateMemberSuggestions();
      highlightMember(activeMemberIndex < 0 ? (event.key === 'ArrowDown' ? 0 : memberSuggestions.length - 1) : activeMemberIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      if (!$('#member-suggestions').hidden && memberSuggestions.length) {
        event.preventDefault();
        selectMember(memberSuggestions[activeMemberIndex < 0 ? 0 : activeMemberIndex].key);
      }
    } else if (event.key === 'Escape' && !$('#member-suggestions').hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeMemberSuggestions();
    } else if (event.key === 'Tab') closeMemberSuggestions();
  });
  $('#member-options').addEventListener('mousedown', event => event.preventDefault());
  $('#member-options').addEventListener('click', event => {
    const option = event.target.closest('[data-member-option]');
    if (option) selectMember(option.dataset.memberOption);
  });
  $('#member-filter').addEventListener('focusout', event => { if (!event.currentTarget.contains(event.relatedTarget)) closeMemberSuggestions(); });
  document.addEventListener('pointerdown', event => { if (!$('#member-filter').contains(event.target)) closeMemberSuggestions(); });
  $('#clear-member').addEventListener('click', clearMember);
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#close-group').addEventListener('click', closeGroup);
  groupDialog.addEventListener('cancel', event => { event.preventDefault(); closeGroup(); });
  $('#close-photo').addEventListener('click', () => photoDialog.close());
  $('#lightbox-image').addEventListener('load', () => { fitPhotograph(); animatePhotograph(); });
  photoDialog.addEventListener('close', () => photoAnimation?.cancel());
  $('#photo-prev').addEventListener('click', () => movePhoto(-1));
  $('#photo-next').addEventListener('click', () => movePhoto(1));
  $('#about-open').addEventListener('click', () => { aboutDialog.showModal(); aboutDialog.scrollTop = 0; });
  $('#close-about').addEventListener('click', () => aboutDialog.close());
  aboutDialog.addEventListener('click', event => {
    const rect = aboutDialog.getBoundingClientRect();
    if (event.target === aboutDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) aboutDialog.close();
  });
  groupDialog.addEventListener('click', event => {
    const rect = groupDialog.getBoundingClientRect();
    if (event.target === groupDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeGroup();
  });
  document.addEventListener('keydown', event => {
    if (photoDialog.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      movePhoto(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === '/' && !groupDialog.open && !photoDialog.open && !aboutDialog.open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
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
  window.addEventListener('resize', fitPhotograph);
  window.addEventListener('resize', positionMemberSuggestions);
  window.addEventListener('scroll', positionMemberSuggestions, { passive: true });
  window.visualViewport?.addEventListener('resize', positionMemberSuggestions);
  window.visualViewport?.addEventListener('scroll', positionMemberSuggestions);
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    photoAnimation?.cancel();
    revealObserver?.disconnect();
    $$('.reveal-pending').forEach(element => element.classList.remove('reveal-pending'));
  });
  document.fonts.ready.then(fitPhotograph);
}

async function initialize() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('Catalogue not available');
    catalogue = await response.json();
    groups = catalogue.groups;
    buildMemberIndex();
    renderCollection();
    readURL();
    setupEvents();
    render();
    window.CarnivalFrames?.observe(document);
    openFromHash();
  } catch (error) {
    $('#results-count').textContent = 'El archivo no se ha podido cargar.';
    $('#catalog-grid').innerHTML = '<div class="empty-state error-state"><h3>El álbum espera un instante.</h3><p>No se ha podido cargar la colección. Comprueba la conexión y vuelve a intentarlo.</p><button type="button" id="retry-load">Volver a intentarlo</button></div>';
    $('#retry-load').addEventListener('click', () => location.reload());
    console.error('Unable to load the catalogue:', error);
  }
}

initialize();
