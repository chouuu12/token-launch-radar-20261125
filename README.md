# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chouuu12/token-launch-radar-20261125/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chouuu12/token-launch-radar-20261125/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol that records no token yet, ranked by what its token would be worth — a launch radar built for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols as of 2026-11-14), scores every protocol that records no token with a transparent value model, and writes a ranked board of 198 genuine launch candidates — all 40 on the house watchlist plus 158 more below the $50M floor. The other 144 pre-token protocols (exchanges, wrapped or staked products, bridges, versioned copies) are not launches to come: they are listed on the dashboard as set aside, with the reason. Each row carries an implied value, a one-line thesis, risk signals, and a concrete farm plan with costs and time.

**The value model** — implied value = TVL × multiple. The multiple starts at 0.45× and moves with the snapshot's own figures: seven-day TVL change (clamped −25%…+60%), years tracked with no token (+12% a year, up to five), chain breadth (+3% a chain, up to nine), and a small category weight. Clamped to 0.12×–1.60×. No protocol name is hardcoded anywhere; the same formula scores every protocol. Protocols whose token already trades are set aside in their own section, never ranked as launches.

**The dashboard** (`dashboard/`) is a static page with no network: search, category and chain filters, a watchlist toggle, five sort orders, a detail view per protocol (score breakdown, thesis, farm steps, signals), and a methodology section. Open `out/dashboard/index.html` after a run.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Requires Node.js 22.18 or later; standard library only. The run is deterministic — the same snapshot always writes the same bytes.

## Layout

- `main.ts` — entrypoint: reads the snapshot, validates the board, writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`.
- `lib/model.ts` — snapshot parsing, the value model, farm plans, board builder, gate-shape validation.
- `vendor/makefun-board.ts` — the kit's dossier library (`buildDossier`).
- `dashboard/` — the radar page (`index.html`, `app.css`, `app.js`).
- `screenshots/` — board, detail and filtered views of the dashboard.

---

<sub>Entered on [make.fun](https://make.fun/?ref=chouuu12&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
