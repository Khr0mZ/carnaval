/* The photo aperture comes from the real alpha channel of the gilt-wood frame. */
(() => {
  'use strict';
  const cache = new Map();
  const observed = new WeakSet();
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

  const ready = source.decode().then(() => ({ image: source, aperture: apertureFromAlpha(source) })).catch(error => {
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

  const resize = new ResizeObserver(entries => {
    ready.then(assets => entries.forEach(entry => paint(entry.target, assets)));
  });
  function elements(root) {
    return [...(root.matches?.('.framed-media') ? [root] : []), ...root.querySelectorAll('.framed-media')];
  }
  function observe(root) {
    for (const element of elements(root)) {
      if (!observed.has(element)) { observed.add(element); resize.observe(element); }
      ready.then(assets => paint(element, assets));
    }
  }
  function release(root) {
    for (const element of elements(root)) { resize.unobserve(element); observed.delete(element); }
  }
  window.CarnivalFrames = { ready, observe, release, refresh: element => ready.then(assets => paint(element, assets)) };
})();
