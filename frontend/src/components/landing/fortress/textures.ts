import * as THREE from "three";

/**
 * Procedural textures generated at runtime (no image assets, no licences): sandstone masonry, a jali lattice
 * alpha mask, the engraved courtyard floor and a soft glow sprite.
 */

function rnd(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

/** Fine, non-repeating-looking earth grain for the large exterior terrain plane. */
export function earthTexture(size = 256): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rnd(41);
  const image = g.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (r() - 0.5) * 24;
    image.data[i] = 226 + grain;
    image.data[i + 1] = 217 + grain;
    image.data[i + 2] = 201 + grain;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  for (let i = 0; i < 110; i++) {
    const x = r() * size;
    const y = r() * size;
    const radius = 0.5 + r() * 2.4;
    g.fillStyle = `rgba(${r() > 0.55 ? "74,57,48" : "255,232,194"},${0.08 + r() * 0.13})`;
    g.beginPath();
    g.ellipse(x, y, radius * (1.2 + r()), radius * 0.55, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(48, 48);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Sandstone ashlar: running-bond courses, grain, weathering. */
export function sandstoneTexture(size = 512): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rnd(7);
  g.fillStyle = "#c49a6c";
  g.fillRect(0, 0, size, size);
  const rows = 8;
  const ch = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = -(row % 2) * (size / 6);
    while (x < size) {
      const w = size / 3.2 + (r() - 0.5) * size * 0.1;
      const t = 176 + Math.floor((r() - 0.5) * 30);
      g.fillStyle = `rgb(${t + 20},${t - 8},${t - 52})`;
      g.fillRect(x, row * ch, w, ch);
      const grad = g.createLinearGradient(0, row * ch, 0, (row + 1) * ch);
      grad.addColorStop(0, "rgba(255,236,205,0.08)");
      grad.addColorStop(1, "rgba(40,24,10,0.16)");
      g.fillStyle = grad;
      g.fillRect(x, row * ch, w, ch);
      g.fillStyle = "rgba(52,34,20,0.6)";
      g.fillRect(x, row * ch, 2, ch);
      x += w;
    }
    g.fillStyle = "rgba(48,32,18,0.65)";
    g.fillRect(0, row * ch, size, 2);
  }
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 24;
    img.data[i] += n;
    img.data[i + 1] += n * 0.9;
    img.data[i + 2] += n * 0.78;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(66,46,28,${0.04 + r() * 0.08})`;
    g.beginPath();
    g.arc(r() * size, r() * size, 1 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Jali (pierced screen) alpha mask: white = stone, black = opening. Eight-point star lattice. */
export function jaliAlpha(size = 256): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#000";
  const cell = size / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      const R = cell * 0.42;
      const r0 = cell * 0.2;
      g.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        const rr = k % 2 ? r0 : R;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Engraved courtyard floor with varied sandstone pavers, azimuth graduations and a meridian line. */
export function floorTexture(size = 1024, northAngle = 0): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rnd(23);
  g.fillStyle = "#9c795b";
  g.fillRect(0, 0, size, size);
  const rows = 14;
  const rowHeight = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = -(row % 2) * (size / 8);
    while (x < size) {
      const width = size / 4 + (r() - 0.5) * size * 0.08;
      const shade = Math.floor((r() - 0.5) * 18);
      const base = 150 + shade;
      g.fillStyle = `rgb(${base + 18},${base - 5},${base - 29})`;
      g.fillRect(x + 2, row * rowHeight + 2, width - 4, rowHeight - 4);
      g.fillStyle = "rgba(255,226,185,0.08)";
      g.fillRect(x + 4, row * rowHeight + 4, width - 8, 2);
      x += width;
    }
  }
  const cx = size / 2;
  const cy = size / 2;
  g.strokeStyle = "rgba(240,214,160,0.75)";
  g.lineWidth = 2;
  for (const rr of [0.12, 0.24, 0.36, 0.44]) {
    g.beginPath();
    g.arc(cx, cy, size * rr, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 360; k += 2) {
    const a = (k * Math.PI) / 180 + northAngle;
    const r1 = size * 0.44;
    const r2 = size * (k % 30 === 0 ? 0.41 : k % 10 === 0 ? 0.425 : 0.433);
    g.lineWidth = k % 30 === 0 ? 2.5 : 1.2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    g.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    g.stroke();
  }
  // meridian (north–south) line
  g.strokeStyle = "rgba(214,177,109,0.9)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - Math.sin(northAngle) * size * 0.44, cy + Math.cos(northAngle) * size * 0.44);
  g.lineTo(cx + Math.sin(northAngle) * size * 0.44, cy - Math.cos(northAngle) * size * 0.44);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function glowTexture(size = 128): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,226,176,1)");
  grad.addColorStop(0.2, "rgba(255,200,130,0.55)");
  grad.addColorStop(0.55, "rgba(214,150,90,0.12)");
  grad.addColorStop(1, "rgba(200,110,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Box geometry whose UVs are scaled to world size, so masonry courses keep a constant height. */
export function stoneBox(w: number, h: number, d: number, unit = 3): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / unit, (uv.getY(i) * dims[f][1]) / unit);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Scale an extruded/shape geometry's UVs (which are in world units) to masonry units. */
export function worldUV(geo: THREE.BufferGeometry, unit = 3) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / unit, uv.getY(i) / unit);
  uv.needsUpdate = true;
  return geo;
}
