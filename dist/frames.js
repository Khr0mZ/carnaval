/* The photo aperture comes from the real alpha channel of the gilt-wood frame. */
(() => {
  'use strict';
  const cache = new Map();
  const observed = new WeakSet();
  const surfaceSelector = '.city-tab,.category-ticket,.theatre-button,.hero-stats,.archive';
  const shellSelector = '.group-dialog,.about-dialog,.lightbox-figure figcaption';
  const source = new Image();
  source.src = 'assets/theatre/marco-fotografico.webp';

  function canvas(width, height) {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  }

  function apertureFromAlpha(image) {
    const width = image.naturalWidth, height = image.naturalHeight;
    const sample = canvas(width, height);
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data;
    const inside = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 1;
    const centre = Math.floor(height / 2) * width + Math.floor(width / 2);
    queue[0] = centre;
    inside[centre] = 1;
    // Flood only the central transparent opening, never the outside background.
    const visit = index => {
      if (!inside[index] && rgba[index * 4 + 3] < 12) {
        inside[index] = 1;
        queue[tail++] = index;
      }
    };
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < width * (height - 1)) visit(index + width);
    }
    if (inside[0] || inside[width - 1] || inside[width * (height - 1)] || inside[width * height - 1] || tail < width * height * .1) {
      throw new Error('The frame must have a closed, transparent central aperture.');
    }
    const mask = context.createImageData(width, height);
    for (let index = 0; index < inside.length; index++) {
      const offset = index * 4, x = index % width;
      const edge = !inside[index] && ((x && inside[index - 1]) || (x < width - 1 && inside[index + 1]) || (index >= width && inside[index - width]) || (index < width * (height - 1) && inside[index + width]));
      mask.data[offset] = mask.data[offset + 1] = mask.data[offset + 2] = 255;
      mask.data[offset + 3] = inside[index] ? 255 : edge ? 255 - rgba[offset + 3] : 0;
    }
    context.putImageData(mask, 0, 0);
    return sample;
  }

  const ready = source.decode().then(() => {
    const aperture = apertureFromAlpha(source);
    const silhouette = canvas(aperture.width, aperture.height);
    const context = silhouette.getContext('2d');
    context.drawImage(source, 0, 0);
    const outer = context.getImageData(0, 0, silhouette.width, silhouette.height);
    const inner = aperture.getContext('2d').getImageData(0, 0, aperture.width, aperture.height);
    for (let offset = 0; offset < outer.data.length; offset += 4) {
      outer.data[offset] = outer.data[offset + 1] = outer.data[offset + 2] = 255;
      outer.data[offset + 3] = Math.min(255, outer.data[offset + 3] + inner.data[offset + 3]);
    }
    context.putImageData(outer, 0, 0);
    return { image: source, aperture, silhouette };
  }).catch(error => {
    console.warn('The photograph frame could not load:', error);
    return null;
  });

  function nineSlice(image, width, height, corner) {
    const result = canvas(width, height);
    const context = result.getContext('2d');
    context.imageSmoothingQuality = 'high';
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const cutX = Math.round(sourceWidth * .28), cutY = Math.round(sourceHeight * .28);
    const edge = Math.max(1, Math.min(corner, Math.floor(Math.min(width, height) / 2) - 1));
    const sx = [0, cutX, sourceWidth - cutX, sourceWidth];
    const sy = [0, cutY, sourceHeight - cutY, sourceHeight];
    const dx = [0, edge, width - edge, width], dy = [0, edge, height - edge, height];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      context.drawImage(image, sx[column], sy[row], sx[column + 1] - sx[column], sy[row + 1] - sy[row], dx[column], dy[row], dx[column + 1] - dx[column], dy[row + 1] - dy[row]);
    }
    return result.toDataURL('image/png');
  }

  function paint(element, assets) {
    if (!assets || !element.isConnected || !element.clientWidth || !element.clientHeight) return;
    if (element.matches('.framed-surface,.framed-shell')) { paintSurface(element, assets); return; }
    const density = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(element.clientWidth * density), height = Math.round(element.clientHeight * density);
    const corner = Math.round(parseFloat(getComputedStyle(element).paddingLeft) * 2 * density);
    const key = `${width}:${height}:${corner}`;
    if (!cache.has(key)) {
      cache.set(key, {
        artwork: nineSlice(assets.image, width, height, corner),
        aperture: nineSlice(assets.aperture, width, height, corner),
      });
      if (cache.size > 24) cache.delete(cache.keys().next().value);
    }
    const rendered = cache.get(key);
    element.style.setProperty('--frame-artwork', `url("${rendered.artwork}")`);
    element.style.setProperty('--frame-aperture', `url("${rendered.aperture}")`);
    element.classList.add('frame-ready');
  }

  function four(value) {
    const values = value.split(/\s+/);
    return [values[0], values[1] || values[0], values[2] || values[0], values[3] || values[1] || values[0]];
  }

  function length(value, border, area) {
    if (value.endsWith('%')) return parseFloat(value) * area / 100;
    if (value.endsWith('px')) return parseFloat(value);
    return parseFloat(value) * border || 0;
  }

  function surfaceMask(assets, width, height, edges, type = 'aperture') {
    const key = `surface:${type}:${width}:${height}:${edges.join(':')}`;
    if (cache.has(key)) return cache.get(key);
    // SVG only composes the bitmap alpha; it introduces no drawn decoration.
    // Nine cropped copies avoid huge canvases for the tall archive panel.
    const bitmap = assets[type];
    const w = bitmap.width, h = bitmap.height;
    const cx = Math.round(w * .28), cy = Math.round(h * .28);
    const sx = [0, cx, w - cx, w], sy = [0, cy, h - cy, h];
    const dx = [0, edges[3], width - edges[1], width], dy = [0, edges[0], height - edges[2], height];
    assets[`${type}URL`] ||= bitmap.toDataURL('image/png');
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><image id="a" width="${w}" height="${h}" href="${assets[`${type}URL`]}"/></defs>`;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      const dw = dx[column + 1] - dx[column], dh = dy[row + 1] - dy[row];
      if (dw <= 0 || dh <= 0) continue;
      svg += `<svg x="${dx[column]}" y="${dy[row]}" width="${dw}" height="${dh}" viewBox="${sx[column]} ${sy[row]} ${sx[column + 1] - sx[column]} ${sy[row + 1] - sy[row]}" preserveAspectRatio="none" overflow="hidden"><use href="#a"/></svg>`;
    }
    svg += '</svg>';
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    cache.set(key, url);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return url;
  }

  function paintSurface(element, assets) {
    const own = getComputedStyle(element), after = getComputedStyle(element, '::after');
    const pseudo = after.borderImageSource !== 'none';
    const style = pseudo ? after : own;
    const borders = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat);
    let x = pseudo ? parseFloat(after.left) || 0 : -borders[3];
    let y = pseudo ? parseFloat(after.top) || 0 : -borders[0];
    let width = pseudo ? element.clientWidth - x - (parseFloat(after.right) || 0) : element.offsetWidth;
    let height = pseudo ? element.clientHeight - y - (parseFloat(after.bottom) || 0) : element.offsetHeight;
    const outset = four(style.borderImageOutset).map((value, index) => length(value, borders[index], index % 2 ? width : height));
    width += outset[1] + outset[3];
    height += outset[0] + outset[2];
    x -= outset[3]; y -= outset[0];
    const edges = four(style.borderImageWidth).map((value, index) => length(value, borders[index], index % 2 ? width : height));
    if (element.classList.contains('framed-shell')) {
      element.style.setProperty('--shell-mask', surfaceMask(assets, width, height, edges, 'silhouette'));
      element.style.setProperty('--shell-mask-x', `${x + parseFloat(own.borderLeftWidth)}px`);
      element.style.setProperty('--shell-mask-y', `${y + parseFloat(own.borderTopWidth)}px`);
    }
    element.style.setProperty('--surface-aperture', surfaceMask(assets, width, height, edges));
    for (const [key, value] of Object.entries({ left:x, top:y, width, height })) element.style.setProperty(`--surface-${key}`, `${value}px`);
    const content = element.querySelector(':scope > .surface-content');
    if (content) {
      element.style.setProperty('--content-mask-x', `${x - content.offsetLeft}px`);
      element.style.setProperty('--content-mask-y', `${y - content.offsetTop}px`);
    }
    element.classList.add('surface-ready');
  }

  const resize = new ResizeObserver(entries => {
    ready.then(assets => entries.forEach(entry => paint(entry.target, assets)));
  });
  function elements(root) {
    const selector = `.framed-media,${surfaceSelector},${shellSelector}`;
    return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  }
  function observe(root) {
    for (const element of elements(root)) {
      if (element.matches(shellSelector)) element.classList.add('framed-shell');
      if (element.matches(surfaceSelector)) {
        element.classList.add('framed-surface');
        if (element.tagName === 'BUTTON' && !element.querySelector(':scope > .surface-content')) {
          const content = document.createElement('span');
          content.className = 'surface-content';
          while (element.firstChild) content.append(element.firstChild);
          element.append(content);
        }
      }
      if (!observed.has(element)) { observed.add(element); resize.observe(element); }
      ready.then(assets => paint(element, assets));
    }
  }
  function release(root) {
    for (const element of elements(root)) { resize.unobserve(element); observed.delete(element); }
  }
  window.CarnivalFrames = { ready, observe, release, refresh: element => ready.then(assets => paint(element, assets)) };
})();
