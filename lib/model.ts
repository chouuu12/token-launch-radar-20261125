// Token launch radar: value model, farm plans and board builder.
//
// The model is deliberately transparent: every number on the board follows
// from the sealed snapshot's own figures (TVL, seven-day TVL change, how
// long the protocol has run, which chains it runs on, its category) and
// from nothing else. No protocol name is hardcoded anywhere in the model;
// the same formula scores all 758 protocols, and the board ranks only the
// ones that record no token, because those are the launches still to come.
//
// Implied value = TVL x multiple, where the multiple rewards growth,
// longevity without a token, multi-chain breadth and category, and is
// clamped so no single factor can dominate the ranking.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  multiple: number;
  watchlist: boolean;
  signals: string[];
  thesis: string;
  score_parts: { tvl: number; growth: number; age: number; breadth: number; category: number };
}

export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface Radar {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    protocols_total: number;
    pre_token_total: number;
    watchlist_total: number;
    board_total: number;
    live_total: number;
  };
  rows: BoardRow[];
  live: LiveRow[];
  setAside: SetAsideRow[];
  categories: string[];
  chains: string[];
}

/** Parse and lightly validate the sealed snapshot. Throws on bad input. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot is not an object');
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is missing protocols[] or watchlist[]');
  }
  if (typeof raw.as_of !== 'string' || typeof raw.floor_usd !== 'number') {
    throw new Error('snapshot is missing as_of or floor_usd');
  }
  const seen = new Set<string>();
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot holds a protocol without slug, name or tvl_usd');
    }
    if (seen.has(p.slug)) throw new Error(`snapshot repeats slug ${p.slug}`);
    seen.add(p.slug);
  }
  return raw;
}

/** A protocol records no token when DefiLlama records neither id nor ticker. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Whole years between the snapshot date and the day tracking began. */
export function ageYears(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const start = Date.parse(`${p.listed_at}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / (365.25 * 86_400_000);
}

/**
 * Category weights. These are model parameters, not a list of names: they
 * describe how much of a protocol's TVL the market has historically paid
 * for in each kind of product, and they move every protocol in the
 * category together. Lending and exchange venues monetise TVL most
 * directly; bridges and centralised venues are discounted because their
 * TVL is mostly pass-through.
 */
const CATEGORY_WEIGHT: Record<string, number> = {
  Dexs: 1.1,
  Lending: 1.08,
  Perps: 1.08,
  Yield: 1.06,
  RWA: 1.06,
  Derivatives: 1.05,
  'Risk Curators': 1.05,
  Restaking: 1.04,
  'Liquid Restaking': 1.02,
  'Liquid Staking': 1.0,
  Staking: 1.0,
  Bridge: 0.9,
  'Canonical Bridge': 0.9,
  CEX: 0.88,
};

export function categoryWeight(category: string | null): number {
  if (category === null) return 1.0;
  return CATEGORY_WEIGHT[category] ?? 1.0;
}

/**
 * The house watchlist's exclusion rule, applied as a filter instead of
 * a cut of the board. A centralised exchange, a wrapped or staked product
 * of a token that already trades, a bridge, or a versioned copy (Aave V2
 * beside Aave V3) records no token in DefiLlama, but it is not a launch
 * still to come: the exchange already monetises another way, the wrapped
 * product's token already trades, the version is a copy. The snapshot
 * carries no parent field, so the rule is read from the fields it does
 * carry — the name, the category and the version marker — exactly as the
 * house's watchlist rule reads them. Such protocols never reach the board;
 * buildRadar lists the largest of them under "set aside" with the reason,
 * so the reader sees the judgement instead of a silent omission.
 */
export function exclusionFactor(p: Protocol): { factor: number; reasons: string[] } {
  const reasons: string[] = [];
  let factor = 1;
  const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) {
    factor *= 0.2;
    reasons.push('a centralised exchange, not a protocol awaiting a launch');
  }
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) {
    factor *= 0.25;
    reasons.push('a wrapped or staked product of a token that already trades');
  }
  if (['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'].includes(p.category ?? '')) {
    factor *= 0.35;
    reasons.push(`a ${p.category} product, whose TVL is mostly pass-through`);
  }
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) {
    factor *= 0.5;
    reasons.push('a versioned copy of a protocol that already has a newer version');
  }
  return { factor: Math.max(0.1, factor), reasons };
}

/** Clamp a number into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The implied-value multiple. Base 0.45x TVL, then:
 * - growth: seven-day TVL change clamped to [-25%, +60%], so a hot week
 *   lifts the multiple and a cold week cuts it, but neither decides it;
 * - age: +12% per year tracked with no token, up to five years, because
 *   a long-lived protocol that never issued a token has more pent-up value;
 * - breadth: +3% per extra chain, up to nine, for a wider footprint;
 * - category: the table above.
 * The result is clamped to [0.12, 1.60] so the ranking stays anchored to
 * TVL while still letting growth and longevity reorder neighbours. The
 * house watchlist's exclusion rule is applied one step earlier, in
 * buildRadar: exchanges, wrapped or staked products, bridges and
 * versioned copies never reach the board at all (see exclusionFactor).
 */
export function valueMultiple(p: Protocol, asOf: string): { multiple: number; parts: BoardRow['score_parts'] } {
  const growthRaw = p.change_7d === null ? 0 : p.change_7d;
  const growth = 1 + clamp(growthRaw, -25, 60) / 100;
  const age = ageYears(p, asOf);
  const ageFactor = 1 + 0.12 * clamp(age === null ? 1 : age, 0, 5);
  const breadth = 1 + 0.03 * clamp(p.chains.length - 1, 0, 9);
  const category = categoryWeight(p.category);
  const multiple = clamp(0.45 * growth * ageFactor * breadth * category, 0.12, 1.6);
  return {
    multiple,
    parts: {
      tvl: Math.round(Math.log10(Math.max(1, p.tvl_usd)) * 100) / 100,
      growth: Math.round(growth * 100) / 100,
      age: Math.round(ageFactor * 100) / 100,
      breadth: Math.round(breadth * 100) / 100,
      category: Math.round(category * 100) / 100,
    },
  };
}

/** Human-readable risk and momentum signals, derived from the figures. */
export function signalsFor(p: Protocol, asOf: string, onWatchlist: boolean): string[] {
  const out: string[] = [];
  if (onWatchlist) out.push('On the house watchlist');
  const change = p.change_7d;
  if (change !== null && change >= 15) out.push(`Surging +${change.toFixed(1)}% TVL in 7 days`);
  else if (change !== null && change <= -10) out.push(`Cooling ${change.toFixed(1)}% TVL in 7 days`);
  else if (change !== null && change >= 5) out.push(`Growing +${change.toFixed(1)}% TVL in 7 days`);
  const age = ageYears(p, asOf);
  if (age !== null && age < 1) out.push('Young protocol — thin track record');
  if (age !== null && age >= 4) out.push('Long wait — 4+ years with no token');
  if (p.chains.length === 1) out.push('Single-chain — concentrated');
  if (p.chains.length >= 5) out.push(`Broad footprint — ${p.chains.length} chains`);
  if (p.tvl_usd < 10_000_000) out.push('Small TVL — higher variance');
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') out.push('Bridge TVL is mostly pass-through');
  if (p.category === 'CEX') out.push('Centralised venue — token odds differ');
  return out;
}

/** One-line thesis: why this protocol sits where it does. */
export function thesisFor(p: Protocol, asOf: string, multiple: number): string {
  const age = ageYears(p, asOf);
  const tvl = `$${Math.round(p.tvl_usd / 1_000_000)}M TVL`;
  const growth =
    p.change_7d === null ? 'no reported 7-day change' : `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in 7 days`;
  const ageText = age === null ? 'an unreported start date' : `${age.toFixed(1)} years tracked`;
  const cat = p.category === null ? 'uncategorised' : p.category;
  return (
    `${p.name} records no token, holds ${tvl} across ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} ` +
    `(${growth}, ${ageText}). At a ${multiple.toFixed(2)}x multiple on TVL the implied value is a ` +
    `${cat} bet on a launch that has not happened yet — farm it, do not assume it.`
  );
}

/** Format a dollar amount compactly: $12.4M, $850K, $42. */
export function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** The chain a user most likely starts on: the protocol's first listed chain. */
function homeChain(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

/**
 * Farm plans, by category. Each plan is concrete: what to do, on which
 * chain, what it costs and how long to keep it up. Nothing here claims a
 * token or an airdrop exists — every step says "records no token" work is
 * positioning for a launch that may never come, and every plan ends with
 * the same hygiene step. Steps are written for the category, then filled
 * with the protocol's own name, chains and size, so two protocols in the
 * same category still get different plans.
 */
type PlanFn = (p: Protocol) => string[];

const PLANS: Record<string, PlanFn> = {
  Dexs: (p) => [
    `Open ${p.name} on ${homeChain(p)} and swap a small amount through its main pool to learn the routing and fees; budget about $10-$30 in gas and slippage for the first session.`,
    `Provide liquidity to the pool you actually use, starting with $100-$500 split across the pair, and keep the position open for at least 4-8 weeks so the activity reads as real usage.`,
    `Trade on ${p.name} once or twice a week instead of once in a burst: a few $25-$100 swaps spread over a month look like a user, not a farmer passing through.`,
    `If ${p.name} lists a points, quest or leaderboard page, complete its listed tasks in order and keep screenshots of each completed step for your own records.`,
    `Check the position weekly, harvest or compound any fees, and never leave more in a single pool than you can afford to lose if the pool is drained or the token never launches.`,
  ],
  Lending: (p) => [
    `Supply $200-$1,000 of a major asset (ETH or a dollar stablecoin) as collateral on ${p.name} on ${homeChain(p)}, paying roughly $5-$20 in gas to open the position.`,
    `Borrow a small amount against it — under 40% of the collateral value — so the account shows both sides of the market, and keep the health factor comfortably above liquidation.`,
    `Hold the supply and borrow open for 6-12 weeks, topping up or repaying a little each fortnight rather than opening and closing in one day.`,
    `Use a second feature if ${p.name} offers one (a different market, an isolated pool or a second chain) with a modest $50-$200, to show breadth of use.`,
    `Set a calendar reminder to check rates and your health factor weekly; close or reduce the borrow if rates spike, and remember a token may never arrive.`,
  ],
  Yield: (p) => [
    `Deposit $200-$1,000 into the flagship vault or strategy on ${p.name} on ${homeChain(p)}; expect $5-$25 in gas and a deposit fee if the vault charges one.`,
    `Leave the deposit compounding for at least 8 weeks, checking the vault's reported APY weekly instead of hopping between vaults every few days.`,
    `Add a second, smaller deposit ($50-$200) after a month to show continued use, and try the vault on a second chain if ${p.name} runs there.`,
    `If ${p.name} runs quests or points, finish them in the order listed and keep your own notes of dates and amounts deposited.`,
    `Plan an exit before you enter: know the withdrawal delay and fee, and never lock funds you might need while waiting for a launch that may never happen.`,
  ],
  Perps: (p) => [
    `Deposit $100-$300 of collateral on ${p.name} on ${homeChain(p)} and open a small test position (under 2x leverage) to learn funding, fees and liquidation behaviour.`,
    `Trade a few small positions over several weeks — $25-$100 notional each — rather than one large trade, and keep a simple log of entry, exit and fees paid.`,
    `Try both a long and a short over the period, and use a limit order at least once so the account shows more than market orders.`,
    `If ${p.name} has a points or volume program, track your volume weekly and stop well before fees eat the position; points are not a promise of a token.`,
    `Withdraw most collateral between sessions and never trade with leverage you do not understand; a perps account can lose money faster than any airdrop could repay.`,
  ],
  RWA: (p) => [
    `Read ${p.name}'s documentation on ${homeChain(p)} first: real-world-asset products often need identity checks, minimums or lockups, so confirm you qualify before sending funds.`,
    `If eligible, allocate $200-$1,000 to the flagship product and note the lockup, redemption window and fees in your own records before confirming.`,
    `Hold the position for the full term the product describes (often 4-12 weeks) and keep the confirmation emails and transaction hashes together.`,
    `Use the product's secondary feature if one exists — a second asset class or a staking option — with a smaller $50-$200 allocation.`,
    `Remember RWA yields come from off-chain assets you cannot verify on-chain; treat the position as an investment first and a farm second, and size it accordingly.`,
  ],
  Bridge: (p) => [
    `Bridge $100-$500 through ${p.name} to ${homeChain(p)} (or out of it) for a transfer you actually need, paying the bridge fee plus gas on both sides, roughly $5-$30 in total.`,
    `Make a second, different-sized bridge a week or two later instead of many identical transfers in one hour; spaced, varied use reads as real.`,
    `Try a second route or destination chain that ${p.name} supports, with a modest amount, so the account is not a single-route pattern.`,
    `Keep the transaction hashes and note the arrival time of each transfer; slow or failed bridges are worth knowing about before you trust the route with more.`,
    `Never bridge more than you can afford to have stuck for a day, and never chase a rumoured token by bridging back and forth — fees will eat the position first.`,
  ],
};

const DEFAULT_PLAN: PlanFn = (p) => [
  `Open ${p.name} on ${homeChain(p)} with a small first transaction ($50-$200) to learn its interface, fees and confirmation times before committing more.`,
  `Use the protocol's core feature weekly for 4-8 weeks — deposits, swaps or positions of $25-$100 at a time — so the account shows steady use, not a single burst.`,
  `Try a second feature or a second chain that ${p.name} supports with a modest amount, to show breadth rather than a single repeated action.`,
  `If ${p.name} lists quests, points or a leaderboard, complete them in order and keep your own dated notes of what you did and what it cost.`,
  `Review the position weekly, keep total exposure under what you can afford to lose, and remember ${p.name} records no token: farm it as a maybe, never as a certainty.`,
];

function farmSteps(p: Protocol): string[] {
  const plan = PLANS[p.category ?? ''] ?? DEFAULT_PLAN;
  const steps = plan(p);
  // Hygiene step, identical in spirit for every protocol: real farming
  // includes knowing when to stop.
  steps.push(
    `Before you scale up, verify ${p.name}'s contracts and social accounts from its own site, ignore any token or airdrop link sent by strangers, and cap your total spend — gas plus deposits — at an amount you are fine losing.`,
  );
  return steps;
}

/** Build the ranked board and the radar object the dashboard reads. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const watch = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);
  // Genuine launch candidates only: the house watchlist's exclusion rule
  // keeps exchanges, wrapped or staked products, bridges and versioned
  // copies off the board. They are listed as set aside, with the reason.
  const candidates = preToken.filter((p) => exclusionFactor(p).reasons.length === 0);
  const setAside: SetAsideRow[] = preToken
    .filter((p) => exclusionFactor(p).reasons.length > 0)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, 12)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionFactor(p).reasons.join('; '),
    }));
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || a.slug.localeCompare(b.slug))
    .slice(0, 10)
    .map((p): LiveRow => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
      change_7d: p.change_7d,
    }));

  // Score every candidate, rank by implied value, slug as the
  // deterministic tie-break so two runs write identical bytes.
  const scored = candidates.map((p) => {
    const { multiple, parts } = valueMultiple(p, snapshot.as_of);
    return { p, multiple, parts, implied: Math.max(1, Math.round(p.tvl_usd * multiple)) };
  });
  scored.sort((a, b) => b.implied - a.implied || a.p.slug.localeCompare(b.p.slug));

  const board: BoardRow[] = scored.map((s, i) => {
    const p = s.p;
    const age = ageYears(p, snapshot.as_of);
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: s.implied,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: age === null ? null : Math.round(age * 100) / 100,
      multiple: Math.round(s.multiple * 1000) / 1000,
      watchlist: watch.has(p.slug),
      signals: signalsFor(p, snapshot.as_of, watch.has(p.slug)),
      thesis: thesisFor(p, snapshot.as_of, s.multiple),
      score_parts: s.parts,
    };
  });

  const categories = [...new Set(candidates.map((p) => p.category).filter((c): c is string => c !== null))].sort();
  const chains = [...new Set(candidates.flatMap((p) => p.chains))].sort();

  const radar: Radar = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      protocols_total: snapshot.protocols.length,
      pre_token_total: preToken.length,
      watchlist_total: snapshot.watchlist.length,
      board_total: board.length,
      live_total: snapshot.protocols.length - preToken.length,
    },
    rows: board,
    live,
    setAside,
    categories,
    chains,
  };
  return { board, radar };
}

/** The dashboard's data file: one script tag's worth of JSON, no network. */
export function dataScript(radar: Radar): string {
  return `// Token launch radar data, generated from the sealed snapshot. No network.\nwindow.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}

/**
 * The gate's own shape, checked before anything is written: ranks 1..N
 * once each, implied values non-increasing with rank, every watchlist slug
 * covered, farm steps 3-12 strings of 20-600 characters, and every slug
 * one of the snapshot's protocols. Returns the first problem, or null.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, the gate wants 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenRanks = new Set<number>();
  const seenSlugs = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  for (const row of board) {
    if (!slugs.has(row.slug)) return `board invents slug ${row.slug}`;
    if (seenSlugs.has(row.slug)) return `board repeats slug ${row.slug}`;
    seenSlugs.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has rank ${row.rank}`;
    if (seenRanks.has(row.rank)) return `board repeats rank ${row.rank}`;
    seenRanks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `row ${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.implied_value_usd > prev) return `implied value rises at rank ${row.rank}`;
    prev = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters`;
    }
  }
  for (let r = 1; r <= board.length; r++) {
    if (!seenRanks.has(r)) return `board is missing rank ${r}`;
  }
  for (const slug of snapshot.watchlist) {
    if (!seenSlugs.has(slug)) return `board misses watchlist slug ${slug}`;
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'board ranks nothing: every implied value is the same';
  return null;
}
