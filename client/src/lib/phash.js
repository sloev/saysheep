/*
 * SCOPE STATEMENT:
 * This file and its perceptual hashing functions are used for OPERATOR-POLICY
 * moderation only (spam, abusive imagery, operator-defined NSFW limits).
 * CSAM (Child Sexual Abuse Material) detection is explicitly out of scope for
 * this self-curated denylist stack. CSAM reports are handled strictly via
 * authorities (tiplines / politi.dk) and local muting, without storing
 * or auto-matching CSAM hashes on-device or on the relay.
 *
 * ALGORITHM CHOICE: Hand-rolled 2D DCT-II perceptual hash (64-bit) with Hamming distance.
 */

function dctHash(matrix) {
  const N = 32;
  const dct = Array.from({ length: 8 }, () => new Float32Array(8));
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        const cosX = Math.cos(((2 * x + 1) * u * Math.PI) / 64);
        for (let y = 0; y < N; y++) {
          const cosY = Math.cos(((2 * y + 1) * v * Math.PI) / 64);
          sum += matrix[x * N + y] * cosX * cosY;
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = (sum * cu * cv) / 16;
    }
  }

  const coeffs = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      coeffs.push(dct[u][v]);
    }
  }
  
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  let hex = "";
  for (let i = 0; i < 8; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      const val = dct[i][j];
      const bit = val > median ? 1 : 0;
      byte = (byte << 1) | bit;
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function phashFromCanvas(canvas) {
  // Create a 32x32 temporary canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 32;
  tempCanvas.height = 32;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(canvas, 0, 0, 32, 32);
  const imgData = tempCtx.getImageData(0, 0, 32, 32);
  const data = imgData.data;
  
  // Grayscale matrix
  const matrix = new Float32Array(32 * 32);
  for (let i = 0; i < 1024; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    matrix[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  
  return dctHash(matrix);
}

export function phashFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        resolve(phashFromCanvas(canvas));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function hamming(a, b) {
  let dist = 0;
  for (let i = 0; i < 16; i += 2) {
    const val1 = parseInt(a.substring(i, i + 2), 16);
    const val2 = parseInt(b.substring(i, i + 2), 16);
    let diff = val1 ^ val2;
    while (diff > 0) {
      if (diff & 1) dist++;
      diff >>>= 1;
    }
  }
  return dist;
}
