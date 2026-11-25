/* Token Radar dashboard: filter, sort, detail. Static data, no network. */
(function () {
  'use strict';
  var R = window.TOKEN_RADAR;
  if (!R) { document.getElementById('meta').textContent = 'No radar data found.'; return; }
  var rows = R.rows, live = R.live, meta = R.meta;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function changeHtml(c) {
    if (c === null || c === undefined) return '<span class="flat">—</span>';
    var cls = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (c > 0 ? '+' : '') + c.toFixed(1) + '%</span>';
  }
  function signalPills(signals) {
    return signals.map(function (s) {
      var cls = 'pill';
      if (/Surging|Growing/.test(s)) cls += ' hot';
      else if (/Cooling/.test(s)) cls += ' cold';
      else if (/Young|Small|concentrated|never|wait/.test(s)) cls += ' warn';
      return '<span class="' + cls + '">' + esc(s) + '</span>';
    }).join('');
  }

  /* ---- header + stats ---- */
  var surging = rows.filter(function (r) { return r.change_7d !== null && r.change_7d >= 15; }).length;
  var topValue = rows.length ? rows[0].implied_value_usd : 0;
  var medianMultiple = rows.length
    ? rows.map(function (r) { return r.multiple; }).sort(function (a, b) { return a - b; })[Math.floor(rows.length / 2)]
    : 0;
  $('meta').innerHTML =
    'Snapshot <b>' + esc(meta.as_of) + '</b> · DefiLlama<br>' +
    '<b>' + meta.protocols_total + '</b> protocols · <b>' + meta.pre_token_total + '</b> pre-token<br>' +
    'Watchlist floor <b>' + money(meta.floor_usd) + '</b> TVL';
  $('stats').innerHTML = [
    ['Protocols ranked', rows.length, 'pre-token, no token recorded'],
    ['On the watchlist', meta.watchlist_total, 'at or above ' + money(meta.floor_usd) + ' TVL'],
    ['Top implied value', money(topValue), rows.length ? esc(rows[0].name) : ''],
    ['Median multiple', medianMultiple.toFixed(2) + '×', 'implied value ÷ TVL'],
    ['Surging (7d)', surging, 'protocols up 15%+ in a week'],
    ['Already trading', meta.live_total, 'set aside, not ranked'],
  ].map(function (s) {
    return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + '</div><div class="s">' + s[2] + '</div></div>';
  }).join('');
  $('foot').textContent =
    'Source: ' + meta.source + '. Implied values are this radar\u2019s own claim from the snapshot\u2019s figures — ' +
    'not a prediction that a token will be issued. A protocol "records no token" when DefiLlama records none; it may still have one.';

  /* ---- controls ---- */
  var catSel = $('category'), chainSel = $('chain');
  R.categories.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  R.chains.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || '',
    chain: params.get('chain') || '',
    watchlist: params.get('watchlist') === '1',
    sort: params.get('sort') || 'rank',
    slug: params.get('slug') || '',
    shown: 50,
  };
  $('q').value = state.q;
  catSel.value = state.category;
  chainSel.value = state.chain;
  $('watchlist').checked = state.watchlist;
  $('sort').value = state.sort;

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var s = state.sort;
    if (s === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; });
    else if (s === 'growth') list.sort(function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999) || a.rank - b.rank; });
    else if (s === 'age') list.sort(function (a, b) { return (b.age_years || 0) - (a.age_years || 0) || a.rank - b.rank; });
    else if (s === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    return list;
  }

  function chainCell(r) {
    var shown = r.chains.slice(0, 3).map(esc);
    if (r.chains.length > 3) shown.push('+' + (r.chains.length - 3) + ' more');
    return shown.join(', ');
  }

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.slug === r.slug ? ' class="active"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td class="name"><b>' + esc(r.name) + '</b>' +
        (r.watchlist ? ' <span class="star" title="On the house watchlist">★</span>' : '') +
        '<span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + chainCell(r) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + changeHtml(r.change_7d) + '</td>' +
      '<td class="num">' + (r.age_years === null ? '—' : r.age_years.toFixed(1) + 'y') + '</td>' +
      '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '<td class="num">' + r.multiple.toFixed(2) + '×</td>' +
      '<td>' + signalPills(r.signals) + '</td></tr>';
  }

  function render() {
    var list = filtered();
    var show = list.slice(0, state.shown);
    $('rows').innerHTML = show.length
      ? show.map(rowHtml).join('')
      : '<tr><td colspan="10"><div class="empty">No protocol matches these filters. Loosen one and try again.</div></td></tr>';
    $('count').textContent = list.length + ' protocol' + (list.length === 1 ? '' : 's') +
      ' match · showing ' + show.length + ' · ranked by implied value';
    $('shown').textContent = 'Showing ' + show.length + ' of ' + list.length;
    $('more').style.display = list.length > state.shown ? '' : 'none';
    renderDetail();
  }

  /* ---- detail view ---- */
  function scoreBars(r) {
    var parts = [
      ['TVL (log scale)', Math.min(1, Math.log10(Math.max(1, r.tvl_usd)) / 11)],
      ['7-day growth', r.change_7d === null ? 0.5 : Math.min(1, Math.max(0, (r.change_7d + 25) / 85))],
      ['Age, no token', Math.min(1, (r.age_years || 1) / 5)],
      ['Chain breadth', Math.min(1, r.chains.length / 10)],
      ['Category weight', Math.min(1, r.score_parts.category / 1.1)],
    ];
    return parts.map(function (p) {
      return '<div class="bar-row"><span>' + p[0] + '</span><span class="track"><span class="fill" style="width:' +
        Math.round(p[1] * 100) + '%"></span></span><span class="num">' + Math.round(p[1] * 100) + '%</span></div>';
    }).join('');
  }

  function renderDetail() {
    var box = $('detail');
    if (!state.slug) { box.hidden = true; box.innerHTML = ''; return; }
    var r = rows.find(function (x) { return x.slug === state.slug; });
    if (!r) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML =
      '<button class="close" id="closeDetail" type="button">Close ✕</button>' +
      '<h2>' + esc(r.name) + ' <span class="star">' + (r.watchlist ? '★ watchlist' : '') + '</span></h2>' +
      '<p class="sub">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + r.chains.map(esc).join(', ') +
      ' · tracked since ' + (r.listed_at || 'unreported') + ' · records no token</p>' +
      '<p class="thesis">' + esc(r.thesis) + '</p>' +
      '<div class="grid">' +
        '<div class="cell"><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div></div>' +
        '<div class="cell"><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
        '<div class="cell"><div class="k">Multiple</div><div class="v">' + r.multiple.toFixed(2) + '×</div></div>' +
        '<div class="cell"><div class="k">7-day change</div><div class="v">' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</div></div>' +
      '</div>' +
      '<h3>Why it scores here</h3><div class="bars">' + scoreBars(r) + '</div>' +
      '<h3>Farm plan — concrete steps, with cost and time</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Signals</h3><p>' + signalPills(r.signals) + '</p>';
    $('closeDetail').addEventListener('click', function () {
      state.slug = ''; syncUrl(); render();
    });
  }

  /* ---- live (already trading) + set aside (not a launch) ---- */
  $('live').innerHTML =
    '<h2>Already trading — set aside, not ranked</h2>' +
    '<p>These protocols record a token that already trades, so they are not launches to come. ' +
    'They are listed for contrast: the board above ranks only protocols that record no token.</p>' +
    '<table><thead><tr><th>Protocol</th><th>Symbol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th></tr></thead><tbody>' +
    live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.symbol || '—') + '</td><td>' + esc(p.category || '—') +
        '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<h2 style="margin-top:18px">Records no token — still not a launch</h2>' +
    '<p>These record no token, but the house watchlist rule sets them aside: exchanges, wrapped or staked ' +
    'products of a token that already trades, bridges and versioned copies. They hold TVL, but they are not ' +
    'protocols awaiting a first launch, so they are not ranked.</p>' +
    '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why it is set aside</th></tr></thead><tbody>' +
    R.setAside.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') +
        '</td><td class="num">' + money(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>';
    }).join('') + '</tbody></table>';

  /* ---- events ---- */
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.chain) p.set('chain', state.chain);
    if (state.watchlist) p.set('watchlist', '1');
    if (state.sort !== 'rank') p.set('sort', state.sort);
    if (state.slug) p.set('slug', state.slug);
    var qs = p.toString();
    window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }
  function refilter(resetShown) {
    if (resetShown) state.shown = 50;
    syncUrl(); render();
  }
  var deb = null;
  $('q').addEventListener('input', function (e) {
    clearTimeout(deb);
    deb = setTimeout(function () { state.q = e.target.value; refilter(true); }, 200);
  });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; refilter(true); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; refilter(true); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; refilter(false); });
  $('watchlist').addEventListener('change', function (e) { state.watchlist = e.target.checked; refilter(true); });
  $('reset').addEventListener('click', function () {
    state.q = ''; state.category = ''; state.chain = ''; state.watchlist = false; state.sort = 'rank'; state.slug = '';
    $('q').value = ''; catSel.value = ''; chainSel.value = ''; $('watchlist').checked = false; $('sort').value = 'rank';
    refilter(true);
  });
  $('more').addEventListener('click', function () { state.shown += 50; syncUrl(); render(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.slug = tr.getAttribute('data-slug');
    syncUrl(); render();
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
})();
