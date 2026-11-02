// Seeded RNG (mulberry32). The generator is just { s } so it lives inside the
// serializable game state: save the state, reload it, and the sequence continues.

// Turns whatever the user typed (4271, "4271", "hello") into a 32-bit integer.
export function hashSeed(seed) {
  if (typeof seed === 'string' && /^\d+$/.test(seed.trim())) seed = Number(seed);
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(Math.abs(seed)) >>> 0;
  // FNV-1a for text seeds
  let hash = 0x811c9dc5;
  for (const ch of String(seed)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createRng(seed) {
  return { s: hashSeed(seed) };
}

// Mutates rng; returns a float in [0, 1).
export function nextFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Standard normal (mean 0, sd 1) by Box-Muller. Always consumes exactly two draws.
export function nextNormal(rng) {
  const u1 = 1 - nextFloat(rng); // (0, 1], avoids log(0)
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
