// Seeded RNG (mulberry32): every random choice in the game draws from one
// stream, so a ?shot= staging run with a seed is deterministic.
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Range helpers that take the stream explicitly, so no call site hides a
// Math.random: the sim never reads the wall clock or an unseeded source.
export const range = (rng, lo, hi) => lo + rng() * (hi - lo);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
