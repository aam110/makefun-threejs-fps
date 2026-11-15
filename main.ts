// DUSTLINE's entrypoint (Node 22, standard library only): hands the game in.
// It copies game/ and screenshots/ from beside this file to the output
// directory and writes /output/dossier.json with the kit's vendored library,
// which the scorer rebuilds byte for byte. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from the competition's gate): only text_max_bytes
// shapes the dossier's bytes; the others refuse an entry the scorer would
// refuse (more than 4 screenshots or one over 256 KiB; more than 993 entries
// or 48 MiB under game/, which shares /output's 1000-entry cap with
// screenshots/ and dossier.json).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
