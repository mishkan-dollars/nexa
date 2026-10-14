// NEXA: подписи BIP-340 (Schnorr на secp256k1) + SHA-256 на чистом BigInt, без библиотек. Нужны для событий Nostr (NIP-01), через которые js/rendezvous.js
// передаёт служебные offer/answer WebRTC. Ключ — одноразовый случайный на сессию; ничего не хранится. Работает и в браузере (window.NexaSchnorr), и в node (module.exports) —
// мок-релей для тестов (tools/mock-relay.js) проверяет подписи этим же кодом. Тест-векторы BIP-340 проверены в tools (см. ONLINE.md).
(function (root) {
  'use strict';
  const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  const GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  const mod = (a, m) => { const r = a % (m || P); return r >= 0n ? r : r + (m || P); };
  function pow(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
  const inv = (a, m) => pow(a, (m || P) - 2n, m || P);                       // оба модуля простые

  // ---------------------------------------------------------------- SHA-256 (синхронный)
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(u8) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const l = u8.length, nb = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(nb);
    b.set(u8); b[l] = 0x80;
    const dv = new DataView(b.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i += 1) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
      let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i += 1) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x >>> 0));
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const hex = (u8) => Array.from(u8, (x) => (x + 256).toString(16).slice(1)).join('');
  const unhex = (h) => { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i += 1) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
  const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };
  const int = (u8) => BigInt('0x' + (hex(u8) || '0'));
  const bytes32 = (n) => unhex(n.toString(16).padStart(64, '0'));
  const tagged = (tag, ...m) => { const t = sha256(utf8(tag)); return sha256(cat(t, t, ...m)); };

  // ---------------------------------------------------------------- secp256k1 (якобиевы координаты, a = 0)
  const INF = null;
  function dbl(p) {
    if (!p) return INF;
    const [X, Y, Z] = p; if (Y === 0n) return INF;
    const A = (X * X) % P, B = (Y * Y) % P, C = (B * B) % P, D = mod(2n * (mod((X + B) * (X + B)) - A - C)), E = 3n * A, F = (E * E) % P;
    const X3 = mod(F - 2n * D);
    return [X3, mod(E * (D - X3) - 8n * C), (2n * Y * Z) % P];
  }
  function add(p, q) {
    if (!p) return q; if (!q) return p;
    const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q;
    const Z1Z1 = (Z1 * Z1) % P, Z2Z2 = (Z2 * Z2) % P, U1 = (X1 * Z2Z2) % P, U2 = (X2 * Z1Z1) % P, S1 = (Y1 * Z2 * Z2Z2) % P, S2 = (Y2 * Z1 * Z1Z1) % P;
    if (U1 === U2) return S1 === S2 ? dbl(p) : INF;
    const H = mod(U2 - U1), I = (4n * H * H) % P, J = (H * I) % P, r = mod(2n * (S2 - S1)), V = (U1 * I) % P;
    const X3 = mod(r * r - J - 2n * V);
    return [X3, mod(r * (V - X3) - 2n * S1 * J), mod(((Z1 + Z2) * (Z1 + Z2) - Z1Z1 - Z2Z2) * H)];
  }
  function mul(p, k) {
    let r = INF, a = p;
    k = mod(k, N);
    while (k > 0n) { if (k & 1n) r = add(r, a); a = dbl(a); k >>= 1n; }
    return r;
  }
  function affine(p) { if (!p) return null; const zi = inv(p[2]); const z2 = (zi * zi) % P; return [(p[0] * z2) % P, (p[1] * z2 * zi) % P]; }
  const G = [GX, GY, 1n];
  function liftX(x) {
    if (x >= P) return null;
    const y2 = mod(x * x * x + 7n), y = pow(y2, (P + 1n) / 4n, P);
    if ((y * y) % P !== y2) return null;
    return [x, (y & 1n) ? P - y : y, 1n];
  }
  const evenY = (a) => (a[1] & 1n) === 0n;

  // ---------------------------------------------------------------- BIP-340
  function pubkey(sk) { const a = affine(mul(G, int(sk))); return bytes32(a[0]); }
  function sign(msg, sk, aux) {
    const d0 = int(sk); if (d0 <= 0n || d0 >= N) throw new Error('bad key');
    const Pa = affine(mul(G, d0)), d = evenY(Pa) ? d0 : N - d0;
    const t = bytes32(d), ah = tagged('BIP0340/aux', aux || new Uint8Array(32));
    for (let i = 0; i < 32; i += 1) t[i] ^= ah[i];
    const k0 = mod(int(tagged('BIP0340/nonce', t, bytes32(Pa[0]), msg)), N); if (k0 === 0n) throw new Error('bad nonce');
    const Ra = affine(mul(G, k0)), k = evenY(Ra) ? k0 : N - k0;
    const e = mod(int(tagged('BIP0340/challenge', bytes32(Ra[0]), bytes32(Pa[0]), msg)), N);
    return cat(bytes32(Ra[0]), bytes32(mod(k + e * d, N)));
  }
  function verify(msg, pk, sig) {
    try {
      const Pt = liftX(int(pk)); if (!Pt) return false;
      const r = int(sig.subarray(0, 32)), s = int(sig.subarray(32, 64));
      if (r >= P || s >= N) return false;
      const e = mod(int(tagged('BIP0340/challenge', sig.subarray(0, 32), pk, msg)), N);
      const R = affine(add(mul(G, s), mul(Pt, N - e)));
      return !!R && evenY(R) && R[0] === r;
    } catch (er) { return false; }
  }
  function randBytes(n) { const a = new Uint8Array(n); (root.crypto || require('crypto').webcrypto).getRandomValues(a); return a; }
  // одноразовый ключ сессии
  function newKey() { for (;;) { const sk = randBytes(32), d = int(sk); if (d > 0n && d < N) return { sk, pk: hex(pubkey(sk)) }; } }
  // событие Nostr (NIP-01): id = sha256([0, pubkey, created_at, kind, tags, content]), sig = BIP-340(id)
  function makeEvent(key, kind, tags, content, createdAt) {
    const ev = { pubkey: key.pk, created_at: createdAt || Math.floor(Date.now() / 1000), kind, tags, content };
    const id = sha256(utf8(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content])));
    ev.id = hex(id); ev.sig = hex(sign(id, key.sk, randBytes(32)));
    return ev;
  }
  function checkEvent(ev) {
    if (!ev || typeof ev !== 'object' || !/^[0-9a-f]{64}$/.test(ev.id) || !/^[0-9a-f]{64}$/.test(ev.pubkey) || !/^[0-9a-f]{128}$/.test(ev.sig)) return false;
    const id = sha256(utf8(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content])));
    return hex(id) === ev.id && verify(id, unhex(ev.pubkey), unhex(ev.sig));
  }
  const api = { sha256, hex, unhex, pubkey, sign, verify, newKey, makeEvent, checkEvent, tagged };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NexaSchnorr = api;
}(typeof window !== 'undefined' ? window : globalThis));
