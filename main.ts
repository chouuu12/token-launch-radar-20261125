// Token launch radar entry (Node 22, standard library only).
//
// Reads the sealed snapshot (default /input/snapshot.json), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked
// board to board.json and the dashboard's data to data.js, copies this
// repository's dashboard/ and screenshots/ into the output directory, and
// writes dossier.json with the vendored make.fun library, exactly as the
// gate rebuilds it. The run is deterministic: the same snapshot always
// writes the same bytes, so the grader's two runs agree.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
//   node main.ts --input /input/snapshot.json --output /output   (the grader)

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's own caps, from the kit's RULES.txt: the text cap shapes the
 * dossier's bytes, the rest refuse outright. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
} catch (err) {
  fail(`cannot read the snapshot: ${err instanceof Error ? err.message : String(err)}`, 2);
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-names. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (dashboardFiles.length === 0) fail('dashboard/ is empty: the page is part of the entry');
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the gate rebuilds it from this output
// directory and compares the bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows ranked (${radar.meta.pre_token_total} pre-token, ${radar.meta.live_total} already trading set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ` +
    `${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
