/* Alchemical Hydrix Calculator — runs fully offline from data.js; refreshes GE data from the RuneScape Wiki on open. */
(function () {
  'use strict';

  const D = window.HYDRIX_DATA;
  if (!D) {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px;color:#ec6a6a">data.js is missing — the calculator cannot load.</p>');
    return;
  }

  // ------------------------------------------------------------------ constants
  const WIKI = 'https://runescape.wiki/w/';
  const WIKI_IMG = 'https://runescape.wiki/images/';
  const RAW_URLS = {
    prices: WIKI + 'Module:GEPrices/data.json?action=raw',
    limits: WIKI + 'Module:GELimits/data.json?action=raw',
    volumes: WIKI + 'Module:GEVolumes/data.json?action=raw',
  };
  const LS_MARKET = 'hydrixCalc.market.v1';
  const LS_SHARED = 'alchCalc.settings.v1'; // Invention level, junk research and volume filter are shared by both calculators
  const SHARED_KEYS = ['inv', 'junkTier', 'minVol'];

  // Junk chance reduction research: [Invention level, multiplier on base junk chance] (from the wiki's Module:Disassemble)
  const JUNK_TIERS = [[0, 1], [34, 0.99], [49, 0.97], [64, 0.95], [69, 0.93], [78, 0.91], [83, 0.88], [91, 0.86], [95, 0.83], [105, 0.80]];

  // Source tuple: [itemQtyPerDisassembly, materialsPerDisassembly, baseJunk%, precious%, fortunate[qty,chance%], rumbling[qty,chance%], wikiPage|0, itemLevel]
  const S = D.sources;
  const CORE = ['Alchemical hydrix', 'Hydrix', 'Uncut hydrix', 'Incomplete hydrix', 'Onyx', 'Uncut onyx', 'Junk refiner', 'Rune bar', 'Alchemical onyx'];
  const RELEVANT = new Set(Object.keys(S).concat(CORE));

  const COMP_INFO = {
    fortunate: {
      name: 'Fortunate components',
      blurb: 'Rare component from disassembling most <a href="https://runescape.wiki/w/Treasure_Trails" target="_blank" rel="noopener">Treasure Trail</a> rewards. You always get exactly 1 per item, whatever your junk chance. Most of these items have a GE buy limit of just 2, so the calculator mixes lots of different items to fill one 4-hour buy window.',
    },
    precious: {
      name: 'Precious components',
      blurb: 'Uncommon component from gems and jewellery. Only non-junk rolls can give precious, so junk reduction research helps here. Disassembling these also gives junk, which the calculator counts towards your refined components.',
    },
    rumbling: {
      name: 'Rumbling components',
      blurb: 'Rare component from Tectonic, Primeval and Teralith armour, Drygore and Seismic weapons, the Spear of Annihilation, Dark ice and more. Usually 5 per item, whatever your junk chance, so one item covers two and a half hydrixes.',
    },
  };

  // The recipe trees, straight from the wiki's Infobox Recipe data.
  const ONYX_NODE = {
    id: 'onyx', name: 'Onyx', qty: 1, how: 'Cut an uncut onyx with a chisel', skills: [['Crafting', 72]], xp: { Crafting: 180 }, xpLabel: 'cutting onyx',
    children: [{ id: 'uonyx', name: 'Uncut onyx', qty: 1, note: "Also: TzHaar-Hur-Lek's store, Fight Kiln, metamorphic geodes, or transmuting 100 onyx dust + 250 incandescent energy (97 Divination)." }],
  };
  const COMP_NODES = {
    fortunate: { id: 'fortunate', name: 'Fortunate components', qty: 50, comp: 'fortunate' },
    refined: { id: 'refined', name: 'Refined components', qty: 50, comp: 'refined', late: true },
    precious: { id: 'precious', name: 'Precious components', qty: 10, comp: 'precious' },
    rumbling: { id: 'rumbling', name: 'Rumbling components', qty: 2, comp: 'rumbling' },
  };
  const HAVE_COMMON = [['fortunate', 'Fortunate components'], ['refined', 'Refined components'], ['precious', 'Precious components']];
  const HAVE_JUNK = [['junk', 'Junk'], ['refiner', 'Junk refiner']];

  const TARGETS = {
    hydrix: {
      name: 'Alchemical hydrix', word: 'hydrix', lsState: 'hydrixCalc.state.v1',
      inv: [117, 100], // level needed, lowest level an extreme invention potion (+17 max) can boost to it
      reqs: [['@crafting_icon', '80 Crafting', 'Not boostable'], ['@crafting_icon', '79 Crafting', 'Cutting hydrix'], ['@workbench', "Inventor's workbench", 'Misc support tab']],
      tree: {
        id: 'ahydrix', name: 'Alchemical hydrix', root: true,
        skills: [['Invention', 117, 'boostable from 100'], ['Crafting', 80, 'not boostable']],
        how: "Inventor's workbench → Misc support",
        xp: { Invention: 15000, Crafting: 7500 }, xpLabel: 'creating alchemical hydrix',
        children: [
          {
            id: 'hydrix', name: 'Hydrix', qty: 1, how: 'Cut an uncut hydrix with a chisel', skills: [['Crafting', 79]], xp: { Crafting: 197.5 }, xpLabel: 'cutting hydrix',
            children: [{
              id: 'uhydrix', name: 'Uncut hydrix', qty: 1, how: 'Use an onyx on an incomplete hydrix', skills: [['Crafting', 79]], xp: { Crafting: 197.5 }, xpLabel: 'completing uncut hydrix',
              children: [
                { id: 'ihydrix', name: 'Incomplete hydrix', qty: 1, note: "Also sold in Death's Store (Soul Reaper) for 300 reaper points." },
                ONYX_NODE,
              ],
            }],
          },
          COMP_NODES.fortunate, COMP_NODES.refined, COMP_NODES.precious, COMP_NODES.rumbling,
        ],
      },
      have: [['hydrix', 'Hydrix'], ['uhydrix', 'Uncut hydrix'], ['ihydrix', 'Incomplete hydrix'], ['onyx', 'Onyx'], ['uonyx', 'Uncut onyx']]
        .concat(HAVE_COMMON, [['rumbling', 'Rumbling components']], HAVE_JUNK),
    },
    onyx: {
      name: 'Alchemical onyx', word: 'onyx', lsState: 'onyxCalc.state.v1',
      inv: [107, 90],
      reqs: [['@crafting_icon', '80 Crafting', 'Not boostable'], ['@crafting_icon', '72 Crafting', 'Cutting onyx'], ['@workbench', "Inventor's workbench", 'Misc support tab']],
      xpNote: 'Crafting XP for the alchemical onyx itself is unclear: the wiki recipe lists 4,400 (the in-game menu says 5,000), but the wiki article says only 1 XP is actually given.',
      tree: {
        id: 'aonyx', name: 'Alchemical onyx', root: true,
        skills: [['Invention', 107, 'boostable from 90'], ['Crafting', 80, 'not boostable']],
        how: "Inventor's workbench → Misc support",
        xp: { Invention: 10000, Crafting: 4400 }, xpLabel: 'creating alchemical onyx',
        children: [ONYX_NODE, COMP_NODES.fortunate, COMP_NODES.refined, COMP_NODES.precious],
      },
      have: [['onyx', 'Onyx'], ['uonyx', 'Uncut onyx']].concat(HAVE_COMMON, HAVE_JUNK),
    },
  };
  const T = TARGETS[document.documentElement.dataset.target] || TARGETS.hydrix;
  const TREE = T.tree;
  const HAVE_ITEMS = T.have;
  const LS_STATE = T.lsState;
  const PER = {}; // components needed per item made
  TREE.children.forEach(c => { if (c.comp) PER[c.comp] = c.qty; });
  const MATS = Object.keys(COMP_INFO).filter(m => PER[m]);

  // ------------------------------------------------------------------ storage
  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  const DEFAULTS = {
    tab: 'calc', qty: 1, inv: 120, junkTier: 9, minVol: 100, have: {}, modes: {}, src: {},
    ref: { search: '', minLimit: 0, show: 100, sort: 'cpc', desc: false },
    oth: { mat: 'fortunate', search: '', minLimit: 0, show: 50, sort: 'cpc', desc: false },
  };
  const saved = lsGet(LS_STATE) || {};
  const state = Object.assign({}, DEFAULTS, saved);
  ['ref', 'oth'].forEach(k => { state[k] = Object.assign({}, DEFAULTS[k], saved[k] || {}); });
  ['have', 'modes', 'src'].forEach(k => { state[k] = Object.assign({}, saved[k] || {}); });
  const shared = lsGet(LS_SHARED) || lsGet(TARGETS.hydrix.lsState) || {};
  SHARED_KEYS.forEach(k => { if (shared[k] != null) state[k] = shared[k]; });
  if (!MATS.includes(state.oth.mat)) state.oth.mat = 'fortunate';
  function save() {
    lsSet(LS_STATE, state);
    const sh = {}; SHARED_KEYS.forEach(k => { sh[k] = state[k]; }); lsSet(LS_SHARED, sh);
  }

  // ------------------------------------------------------------------ market data
  const M = {
    prices: D.snapshot.prices, limits: D.snapshot.limits, volumes: D.snapshot.volumes,
    updated: D.snapshot.updated, updatedText: D.snapshot.updatedText, origin: 'snapshot', fetchedAt: null,
  };
  const cached = lsGet(LS_MARKET);
  if (cached && cached.prices && cached.updated >= M.updated) {
    Object.assign(M, { prices: cached.prices, limits: cached.limits || M.limits, volumes: cached.volumes || M.volumes, updated: cached.updated, updatedText: cached.updatedText, fetchedAt: cached.fetchedAt, origin: 'cache' });
  }

  const price = n => { const v = M.prices[n]; return typeof v === 'number' && v > 0 ? v : null; };
  const limit = n => { const v = M.limits[n]; return typeof v === 'number' && v > 0 ? v : null; };
  const volume = n => { const v = M.volumes[n]; return typeof v === 'number' ? v : null; };

  function pickRelevant(obj) {
    const o = {};
    RELEVANT.forEach(k => { if (obj[k] != null) o[k] = obj[k]; });
    return o;
  }

  async function fetchJSON(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 20000);
    try {
      const r = await fetch(url + '&_=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  let refreshing = false;
  async function refreshPrices() {
    if (refreshing) return;
    refreshing = true;
    setStatus('loading', 'Updating GE prices…', 'Fetching the latest data from the RuneScape Wiki');
    let ok = false;
    try {
      const [p, l, v] = await Promise.all([
        fetchJSON(RAW_URLS.prices),
        fetchJSON(RAW_URLS.limits).catch(() => null),
        fetchJSON(RAW_URLS.volumes).catch(() => null),
      ]);
      if (!p || typeof p !== 'object' || !p['%LAST_UPDATE%']) throw new Error('Unexpected price data');
      M.prices = pickRelevant(p);
      if (l) M.limits = pickRelevant(l);
      if (v) M.volumes = pickRelevant(v);
      M.updated = p['%LAST_UPDATE%'];
      M.updatedText = p['%LAST_UPDATE_F%'];
      M.origin = 'live';
      M.fetchedAt = Date.now();
      lsSet(LS_MARKET, { prices: M.prices, limits: M.limits, volumes: M.volumes, updated: M.updated, updatedText: M.updatedText, fetchedAt: M.fetchedAt });
      ok = true;
    } catch (e) {
      console.warn('Price refresh failed:', e);
    }
    refreshing = false;
    invalidate();
    renderAll();
    updateStatus(ok);
  }

  function ago(sec) {
    const d = Math.max(0, Date.now() / 1000 - sec);
    if (d < 90) return 'just now';
    if (d < 5400) return Math.round(d / 60) + ' min ago';
    if (d < 172800) return Math.round(d / 3600) + ' h ago';
    return Math.round(d / 86400) + ' days ago';
  }
  function setStatus(st, main, sub) {
    $('#priceStatus').dataset.state = st;
    $('#priceText').textContent = main;
    $('#priceSub').textContent = sub || '';
  }
  function updateStatus(ok) {
    const when = M.updatedText ? M.updatedText.replace(' (UTC)', ' UTC') : '';
    if (ok) setStatus('live', 'Live GE prices', 'Wiki prices from ' + when + ' (' + ago(M.updated) + ')');
    else setStatus('offline', 'Offline — using saved prices', (M.origin === 'snapshot' ? 'Bundled prices' : 'Last saved prices') + ' from ' + when + ' (' + ago(M.updated) + ')');
  }

  // ------------------------------------------------------------------ helpers
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));
  const nf = new Intl.NumberFormat('en-US');
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const fmt = n => (n == null || !isFinite(n)) ? '—' : nf.format(Math.round(n));
  function dec(n, d) {
    if (n == null || !isFinite(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: 0 });
  }
  function short(n) {
    if (n == null || !isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e7) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e5) return Math.round(n / 1e3) + 'k';
    if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    if (a >= 100) return nf.format(Math.round(n));
    return dec(n, a < 10 ? 2 : 1);
  }
  const gp = n => (n == null || !isFinite(n)) ? '<span class="na">—</span>' : '<span title="' + fmt(n) + ' gp">' + short(n) + '</span>';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = s => encodeURIComponent(String(s).replace(/ /g, '_'));
  const wikiUrl = page => WIKI + enc(page);
  const exUrl = name => WIKI + 'Exchange:' + enc(name);
  const imgSrc = n => D.images[n] || (WIKI_IMG + enc(n) + '.png');
  const icon = (n, cls) => '<img class="' + (cls || 'ic') + '" src="' + esc(imgSrc(n)) + '" alt=""' + (D.images[n] ? '' : ' loading="lazy"') + ' onerror="this.onerror=null;this.style.visibility=\'hidden\'">';
  const pageOf = n => (S[n] && S[n][6]) || n;
  const itemLink = n => '<span class="item">' + icon(n) + '<a href="' + wikiUrl(pageOf(n)) + '" target="_blank" rel="noopener">' + esc(n) + '</a></span>';
  const geLink = (n, inner) => '<a href="' + exUrl(n) + '" target="_blank" rel="noopener" title="Price history and buy limit on the RS Wiki">' + inner + '</a>';

  function refinerUses(lvl) {
    lvl = num(lvl);
    if (lvl >= 120) return 20;
    if (lvl < 22) return 9;
    if (lvl < 30) return 10;
    return Math.min(20, 11 + Math.floor((lvl - 30) / 10));
  }
  const junkMult = () => JUNK_TIERS[state.junkTier][1];
  const junkPct = s => s[2] * junkMult();

  // materials received per single GE item
  function perUnit(mat, s) {
    const iq = s[0] || 1;
    switch (mat) {
      case 'junk': return s[1] * junkPct(s) / 100 / iq;
      case 'precious': return s[3] ? s[1] * (1 - junkPct(s) / 100) * s[3] / 100 / iq : 0;
      case 'fortunate': return s[4] ? s[4][0] * s[4][1] / 100 / iq : 0;
      case 'rumbling': return s[5] ? s[5][0] * s[5][1] / 100 / iq : 0;
    }
    return 0;
  }

  let rankCache = {};
  function invalidate() { rankCache = {}; }
  function ranked(mat) {
    const key = mat + '|' + state.junkTier + '|' + state.minVol;
    if (rankCache[key]) return rankCache[key];
    const rows = [];
    for (const name in S) {
      const s = S[name];
      const pu = perUnit(mat, s);
      if (!(pu > 0)) continue;
      const p = price(name);
      if (!p) continue;
      const vol = volume(name), lim = limit(name);
      // illiquid: trades less per day than the threshold AND less than its own buy limit
      if (state.minVol > 0 && vol != null && vol < state.minVol && vol < (lim || Infinity)) continue;
      rows.push({ name, s, pu, price: p, cpc: p / pu, limit: lim, vol });
    }
    rows.sort((a, b) => a.cpc - b.cpc || (b.limit || 0) - (a.limit || 0));
    rankCache[key] = rows;
    return rows;
  }

  // Greedy plan: cheapest cost-per-component first, capped at each item's 4h buy limit ("mix"), or one chosen item.
  function makePlan(mat, need, choice) {
    const plan = { lines: [], cost: 0, got: 0, need, short: 0, mode: 'mix' };
    if (!(need > 1e-9)) return plan;
    const rows = ranked(mat);
    const unitsFor = (r, amt) => { const iq = r.s[0] || 1; return Math.ceil(amt / (r.pu * iq) - 1e-9) * iq; };
    const add = (r, units) => {
      const got = units * r.pu, cost = units * r.price;
      plan.lines.push(Object.assign({}, r, { units, got, cost, windows: r.limit ? Math.ceil(units / r.limit) : 1 }));
      plan.cost += cost; plan.got += got;
    };
    if (choice && choice !== 'mix') {
      let r = rows.find(x => x.name === choice);
      if (!r && S[choice] && price(choice)) {
        const pu = perUnit(mat, S[choice]);
        if (pu > 0) r = { name: choice, s: S[choice], pu, price: price(choice), cpc: price(choice) / pu, limit: limit(choice), vol: volume(choice) };
      }
      if (r) { plan.mode = 'single'; add(r, unitsFor(r, need)); return plan; }
    }
    let rem = need;
    for (const r of rows) {
      if (rem <= 1e-9) break;
      let units = unitsFor(r, rem);
      if (r.limit) { const iq = r.s[0] || 1; units = Math.min(units, Math.floor(r.limit / iq) * iq); }
      if (units <= 0) continue;
      add(r, units);
      rem -= units * r.pu;
    }
    plan.short = Math.max(0, rem);
    return plan;
  }

  // ------------------------------------------------------------------ tree evaluation
  function evalNode(node, required, ctx) {
    const have = Math.max(0, num(state.have[node.id]));
    const need = Math.max(0, required - have);
    const r = { node, required, have, need, unit: price(node.name), limit: limit(node.name), vol: volume(node.name), kids: [], cost: 0 };
    if (node.comp) return evalComp(r, ctx);

    if (node.children) {
      const kctx = { byJunk: 0 };
      const order = node.children.map((c, i) => i).sort((a, b) => (node.children[a].late ? 1 : 0) - (node.children[b].late ? 1 : 0));
      r.kids = new Array(node.children.length);
      for (const i of order) r.kids[i] = evalNode(node.children[i], need * node.children[i].qty, kctx);
      r.craftCost = r.kids.reduce((a, k) => a + k.cost, 0);
      r.byJunk = kctx.byJunk;
    }
    r.buyCost = r.unit != null ? need * r.unit : null;
    const mode = node.root ? 'craft' : (state.modes[node.id] || 'auto');
    r.mode = mode;
    if (!node.children) r.action = 'buy';
    else if (mode === 'craft') r.action = 'craft';
    else if (mode === 'buy') r.action = r.buyCost != null ? 'buy' : 'craft';
    else r.action = (r.buyCost == null || r.craftCost < r.buyCost) ? 'craft' : 'buy';
    r.cost = r.action === 'craft' ? r.craftCost : (r.buyCost || 0);
    return r;
  }

  function evalComp(r, ctx) {
    const comp = r.node.comp;
    r.action = 'comp';
    if (comp === 'refined') {
      r.uses = refinerUses(state.inv);
      r.byJunk = ctx ? ctx.byJunk : 0;
      r.junkHave = Math.max(0, num(state.have.junk));
      r.junkNeed = Math.max(0, r.need * 100 - r.junkHave - r.byJunk);
      r.refinerHave = Math.max(0, num(state.have.refiner));
      r.refiners = Math.max(0, Math.ceil(r.need / r.uses - 1e-9) - r.refinerHave);
      r.refinerUnit = price('Junk refiner');
      r.refinerCost = r.refiners * (r.refinerUnit || 0);
      r.plan = makePlan('junk', r.junkNeed, state.src.refined);
      r.cost = r.plan.cost + r.refinerCost;
    } else {
      r.plan = makePlan(comp, r.need, state.src[comp]);
      r.cost = r.plan.cost;
      if (ctx) r.plan.lines.forEach(l => { ctx.byJunk += l.units * perUnit('junk', l.s); });
    }
    return r;
  }

  function collect(r, out) {
    const add = (name, units, unit, why) => {
      if (!(units > 0)) return;
      const e = out.shop[name] || (out.shop[name] = { name, units: 0, unit, why: new Set() });
      e.units += units; e.why.add(why);
    };
    if (r.action === 'comp') {
      const why = r.node.name.replace(' components', '');
      r.plan.lines.forEach(l => add(l.name, l.units, l.price, r.node.comp === 'refined' ? 'Junk → refined' : why));
      if (r.node.comp === 'refined') {
        if (r.refiners) add('Junk refiner', r.refiners, r.refinerUnit, 'Refining junk');
        out.xp.Invention += r.need * 10;
        out.xpLines.push(['Invention', r.need * 10, 'refining ' + fmt(r.need) + ' refined components (10 xp each)']);
      }
      if (r.plan.short > 1e-9) out.short.push(r.node.name);
      return;
    }
    if (r.action === 'buy') {
      if (r.need > 0) {
        add(r.node.name, r.need, r.unit, 'Buy');
        if (r.unit == null) out.unpriced.push(r.node.name);
      }
      return;
    }
    if (r.need > 0 && r.node.xp) {
      for (const k in r.node.xp) {
        out.xp[k] += r.need * r.node.xp[k];
        out.xpLines.push([k, r.need * r.node.xp[k], r.node.xpLabel + ' × ' + fmt(r.need)]);
      }
    }
    r.kids.forEach(k => collect(k, out));
  }

  // ------------------------------------------------------------------ rendering: calculator
  let lastRoot = null;
  const expanded = new Set();

  function renderCalc() {
    const qty = Math.max(1, Math.floor(num(state.qty)) || 1);
    const root = evalNode(TREE, qty, null);
    lastRoot = root;
    const out = { shop: {}, xp: { Invention: 0, Crafting: 0 }, xpLines: [], short: [], unpriced: [] };
    collect(root, out);

    // summary
    const sell = price(T.name);
    const value = sell != null ? sell * qty : null;
    const profit = value != null ? value - root.cost : null;
    const shopRows = Object.values(out.shop);
    const maxWin = shopRows.reduce((m, e) => { const l = limit(e.name); return Math.max(m, l ? Math.ceil(e.units / l) : 1); }, 0);
    $('#summary').innerHTML =
      card('Total cost to make', gp(root.cost), fmt(root.cost / qty) + ' gp per ' + T.word, 'gold') +
      card('GE value of ' + fmt(qty) + ' × ' + T.name, value != null ? geLink(T.name, gp(value)) : '—', sell != null ? fmt(sell) + ' gp each · limit ' + fmt(limit(T.name)) + '/4h' : 'no GE price') +
      card(profit != null && profit < 0 ? 'Loss vs. buying it' : 'Profit vs. buying it', profit != null ? '<span class="' + (profit >= 0 ? 'pos' : 'neg') + '">' + (profit >= 0 ? '+' : '−') + short(Math.abs(profit)) + '</span>' : '—',
        profit != null && root.cost > 0 ? (profit >= 0 ? '+' : '') + dec(profit / root.cost * 100, 1) + '% on cost · ' + fmt(profit / qty) + ' gp per ' + T.word : '') +
      card('GE buying time', maxWin <= 1 ? 'One 4h window' : maxWin + ' windows', maxWin <= 1 ? 'Everything fits inside the buy limits' : '≈ ' + (maxWin - 1) * 4 + 'h+ of waiting on buy limits');

    // requirements
    const inv = num(state.inv);
    const invTag = inv >= T.inv[0] ? ['ok', 'You have it'] : inv >= T.inv[1] ? ['warn', 'Boost needed'] : ['bad', 'Too low'];
    $('#reqs').innerHTML =
      req('@invention_icon', T.inv[0] + ' Invention', invTag, 'boostable from ' + T.inv[1] + ' with an extreme invention potion') +
      T.reqs.map(q => req(q[0], q[1], ['', q[2]], '')).join('');

    // tree
    $('#tree').innerHTML = nodeLI(root, false);

    // shopping list
    renderShop(shopRows, root.cost, out);

    // xp
    $('#xpBox').innerHTML = ['Invention', 'Crafting'].map(sk => {
      const lines = out.xpLines.filter(l => l[0] === sk);
      return '<div class="card"><img src="' + esc(imgSrc(sk === 'Invention' ? '@invention' : '@crafting')) + '" alt=""><div><div class="lbl">' + sk + ' experience</div><div class="val">' + dec(out.xp[sk], 1) + '</div><ul>' +
        lines.map(l => '<li>' + dec(l[1], 1) + ' xp — ' + esc(l[2]) + '</li>').join('') + '</ul></div></div>';
    }).join('') + '<p class="muted small" style="flex-basis:100%;margin:0">' + (T.xpNote ? esc(T.xpNote) + ' ' : '') + 'Disassembly XP from breaking down the source items is extra and not included. XP boosts are not applied.</p>';
  }

  function card(lbl, val, det, cls) {
    return '<div class="card ' + (cls || '') + '"><span class="lbl">' + lbl + '</span><span class="val">' + val + '</span><span class="det">' + (det || '') + '</span></div>';
  }
  function req(img, label, tag, sub) {
    return '<div class="req"><img src="' + esc(imgSrc(img)) + '" alt=""><span>' + esc(label) + (sub ? ' <span class="muted small">(' + esc(sub) + ')</span>' : '') + '</span><span class="tag ' + tag[0] + '">' + esc(tag[1]) + '</span></div>';
  }

  function priceMeta(name) {
    const p = price(name), l = limit(name), v = volume(name);
    const parts = [];
    parts.push(p != null ? geLink(name, '<b>' + fmt(p) + '</b> gp') + ' each' : '<span class="warn-text">no GE price</span>');
    if (l) parts.push('limit <b>' + fmt(l) + '</b>/4h');
    if (v != null) parts.push('vol ' + short(v) + '/day');
    return parts.join(' · ');
  }

  function nodeLI(r, inactive) {
    const n = r.node;
    if (n.comp) return compLI(r, inactive);
    const isCraft = r.action === 'craft';
    const needTxt = '× ' + fmt(r.need) + (r.have ? ' <span class="muted small">(' + fmt(r.required) + ' − ' + fmt(r.have) + ' owned)</span>' : '');
    let tag = '';
    if (!n.root) tag = isCraft ? '<span class="choice craft">Make</span>' : '<span class="choice buy">Buy</span>';
    const meta = [];
    if (n.root) meta.push('Sells for ' + priceMeta(n.name));
    else meta.push(priceMeta(n.name));
    if (n.how) meta.push(esc(n.how));
    if (n.skills) meta.push(n.skills.map(s => s[1] + ' ' + s[0] + (s[2] ? ' (' + s[2] + ')' : '')).join(', '));
    let windowsWarn = '';
    if (!isCraft && r.limit && r.need > r.limit) windowsWarn = '<div class="note warn-text">Needs ' + Math.ceil(r.need / r.limit) + ' buy-limit windows (' + fmt(r.limit) + ' per 4h).</div>';

    let right = '';
    if (n.children && !n.root) {
      right += '<div class="seg" role="group" aria-label="Buy or make">' + ['auto', 'buy', 'craft'].map(m =>
        '<button type="button" data-node="' + n.id + '" data-mode="' + m + '" class="' + (r.mode === m ? 'on' : '') + '">' + ({ auto: 'Auto', buy: 'Buy', craft: 'Make' }[m]) + '</button>').join('') + '</div>';
    }
    let sub = '';
    if (n.children && !n.root) {
      sub = 'buy ' + (r.buyCost != null ? short(r.buyCost) : '—') + ' · make ' + short(r.craftCost);
      const diff = r.buyCost != null ? r.buyCost - r.craftCost : null;
      if (diff != null && r.need > 0) sub += ' · ' + (diff > 0 ? 'making saves ' + short(diff) : 'buying saves ' + short(-diff));
    } else if (n.root) {
      sub = fmt(r.cost / Math.max(1, r.need)) + ' gp each';
    } else if (r.unit != null && r.need > 0) {
      sub = fmt(r.need) + ' × ' + short(r.unit);
    }
    right += '<div class="cost"><div class="v">' + gp(r.cost) + '</div><div class="s">' + sub + '</div></div>';

    let html = '<li><div class="node' + (n.root ? ' root' : '') + (inactive ? ' inactive' : '') + '">' + icon(n.name) +
      '<div class="nm"><div class="line1"><a href="' + wikiUrl(n.name) + '" target="_blank" rel="noopener">' + esc(n.name) + '</a><span class="qtyb">' + needTxt + '</span>' + tag + '</div>' +
      '<div class="meta">' + meta.join(' · ') + '</div></div><div class="right">' + right + '</div></div>';
    if (n.note) html += '<div class="note">' + esc(n.note) + '</div>';
    html += windowsWarn;
    if (r.kids && r.kids.length) {
      html += '<ul>' + r.kids.map(k => nodeLI(k, inactive || (!isCraft && !n.root))).join('') + '</ul>';
    }
    return html + '</li>';
  }

  function sourceSelect(key, mat, current) {
    const rows = ranked(mat).slice(0, 40);
    const unitWord = mat === 'junk' ? 'refined' : 'comp';
    const rp = price('Junk refiner');
    const refShare = rp ? rp / refinerUses(state.inv) : 0;
    const opts = ['<option value="mix">Cheapest mix (within buy limits)</option>'].concat(rows.map(r => {
      const c = mat === 'junk' ? r.cpc * 100 + refShare : r.cpc;
      return '<option value="' + esc(r.name) + '"' + (current === r.name ? ' selected' : '') + '>' + esc(r.name) + ' — ' + short(c) + '/' + unitWord + '</option>';
    }));
    if (current && current !== 'mix' && !rows.some(r => r.name === current)) opts.push('<option value="' + esc(current) + '" selected>' + esc(current) + '</option>');
    return '<select data-src="' + key + '" aria-label="Source">' + opts.join('') + '</select>';
  }

  function planTable(id, plan, mat) {
    if (!plan.lines.length) return '';
    const isOpen = expanded.has(id);
    const lines = isOpen ? plan.lines : plan.lines.slice(0, 8);
    const unitName = mat === 'junk' ? 'Junk' : 'Comps';
    let h = '<div class="plan"><table><thead><tr><th>Disassemble</th><th>Buy</th><th>GE price</th><th>Buy limit</th><th>' + unitName + ' each</th><th>' + unitName + ' total</th><th>Cost</th></tr></thead><tbody>';
    h += lines.map(l => '<tr><td>' + itemLink(l.name) + '</td><td>' + fmt(l.units) + (l.windows > 1 ? ' <span class="warn-text" title="More than one 4h buy-limit window">(' + l.windows + '× limit)</span>' : '') + '</td><td>' + geLink(l.name, fmt(l.price)) + '</td><td>' + (l.limit ? fmt(l.limit) : '—') + '</td><td>' + dec(l.pu, l.pu < 1 ? 4 : 2) + '</td><td>' + dec(l.got, 1) + '</td><td>' + gp(l.cost) + '</td></tr>').join('');
    if (plan.lines.length > 8) h += '<tr class="more"><td colspan="7" data-more="' + id + '">' + (isOpen ? 'Show fewer' : 'Show all ' + plan.lines.length + ' items') + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  function compLI(r, inactive) {
    const n = r.node;
    const needTxt = '× ' + fmt(r.need) + (r.have ? ' <span class="muted small">(' + fmt(r.required) + ' − ' + fmt(r.have) + ' owned)</span>' : '');
    const head = (meta, right) => '<div class="node' + (inactive ? ' inactive' : '') + '">' + icon(n.name) +
      '<div class="nm"><div class="line1"><a href="' + wikiUrl(n.name) + '" target="_blank" rel="noopener">' + esc(n.name) + '</a><span class="qtyb">' + needTxt + '</span><span class="choice craft">Disassemble</span></div>' +
      '<div class="meta">' + meta + '</div></div><div class="right">' + right + '</div></div>';

    if (n.comp === 'refined') {
      const perRef = r.need > 0 ? r.cost / r.need : 0;
      let html = '<li>' + head('100 junk + one junk refiner charge each · refiner makes ' + r.uses + ' at Invention ' + fmt(state.inv),
        sourceSelect('refined', 'junk', state.src.refined) + '<div class="cost"><div class="v">' + gp(r.cost) + '</div><div class="s">' + short(perRef) + ' per refined</div></div>');
      const junkNote = [];
      if (r.byJunk > 0.5) junkNote.push('−' + fmt(r.byJunk) + ' junk you get anyway from disassembling the ' + MATS.join('/') + ' items');
      if (r.junkHave) junkNote.push('−' + fmt(r.junkHave) + ' junk owned');
      html += '<ul><li><div class="node' + (inactive ? ' inactive' : '') + '">' + icon('Junk') +
        '<div class="nm"><div class="line1"><a href="' + wikiUrl('Junk') + '" target="_blank" rel="noopener">Junk</a><span class="qtyb">× ' + fmt(r.junkNeed) + '</span><span class="choice craft">Disassemble</span></div>' +
        '<div class="meta">' + fmt(r.need * 100) + ' junk for ' + fmt(r.need) + ' refined' + (junkNote.length ? ' · ' + junkNote.join(' · ') : '') + ' · junk chance uses your research setting</div></div>' +
        '<div class="right"><div class="cost"><div class="v">' + gp(r.plan.cost) + '</div><div class="s">' + (r.junkNeed > 0 ? short(r.plan.cost / r.junkNeed) + ' per junk' : '') + '</div></div></div></div>' +
        planTable('refined', r.plan, 'junk') + shortNote(r.plan, 'junk') + '</li>';
      html += '<li><div class="node' + (inactive ? ' inactive' : '') + '">' + icon('Junk refiner') +
        '<div class="nm"><div class="line1"><a href="' + wikiUrl('Junk refiner') + '" target="_blank" rel="noopener">Junk refiner</a><span class="qtyb">× ' + fmt(r.refiners) + (r.refinerHave ? ' <span class="muted small">(' + fmt(r.refinerHave) + ' owned)</span>' : '') + '</span><span class="choice buy">Buy</span></div>' +
        '<div class="meta">' + priceMeta('Junk refiner') + ' · ' + r.uses + ' refined per refiner · or make one: rune bar + 50 crafted parts + 200 junk (22 Invention)</div></div>' +
        '<div class="right"><div class="cost"><div class="v">' + gp(r.refinerCost) + '</div><div class="s">' + (r.refinerUnit ? short(r.refinerUnit / r.uses) + ' per refined' : '') + '</div></div></div></div></li></ul>';
      return html + '</li>';
    }

    const info = COMP_INFO[n.comp];
    const per = r.need > 0 ? r.cost / r.need : 0;
    let html = '<li>' + head(info ? info.blurb.replace(/<[^>]+>/g, '').split('. ')[0] + '.' : '',
      sourceSelect(n.comp, n.comp, state.src[n.comp]) + '<div class="cost"><div class="v">' + gp(r.cost) + '</div><div class="s">' + short(per) + ' per component</div></div>');
    html += planTable(n.comp, r.plan, n.comp) + shortNote(r.plan, n.comp);
    if (r.plan.got - r.need > 0.5) html += '<div class="note">You will end up with about ' + dec(r.plan.got - r.need, 1) + ' spare.</div>';
    return html + '</li>';
  }

  function shortNote(plan, mat) {
    if (plan.short > 1e-9) return '<div class="note warn-text">Short by ' + dec(plan.short, 1) + ' ' + (mat === 'junk' ? 'junk' : 'components') + ' within one buy-limit window. Lower the volume filter, or choose a single item from the dropdown (it will take more than one window).</div>';
    return '';
  }

  function renderShop(rows, total, out) {
    rows.sort((a, b) => (b.units * (b.unit || 0)) - (a.units * (a.unit || 0)));
    let h = '<thead><tr><th class="l">Item</th><th>Quantity</th><th>GE price</th><th>Total</th><th>Buy limit</th><th>4h windows</th><th>Daily vol.</th><th class="l">For</th></tr></thead><tbody>';
    h += rows.map(e => {
      const l = limit(e.name), v = volume(e.name);
      const win = l ? Math.ceil(e.units / l) : 1;
      return '<tr><td class="l">' + itemLink(e.name) + '</td><td>' + fmt(e.units) + '</td><td>' + (e.unit != null ? geLink(e.name, fmt(e.unit)) : '<span class="na">—</span>') + '</td><td>' + gp(e.units * (e.unit || 0)) +
        '</td><td>' + (l ? fmt(l) : '—') + '</td><td' + (win > 1 ? ' class="warn-text"' : '') + '>' + win + '</td><td>' + (v != null ? short(v) : '—') + '</td><td class="l muted">' + esc(Array.from(e.why).join(', ')) + '</td></tr>';
    }).join('');
    h += '</tbody><tfoot><tr><td class="l">' + rows.length + ' different items</td><td></td><td></td><td>' + gp(total) + '</td><td colspan="4"></td></tr></tfoot>';
    if (!rows.length) h = '<tbody><tr><td class="l muted">Nothing to buy — you already have everything.</td></tr></tbody>';
    $('#shopTable').innerHTML = h;
    lastShop = rows;
  }
  let lastShop = [];

  // ------------------------------------------------------------------ rendering: refined top list
  function sortRows(rows, key, desc) {
    rows.sort((a, b) => {
      let x = a[key], y = b[key];
      if (typeof x === 'string' || typeof y === 'string') { x = String(x || ''); y = String(y || ''); return desc ? y.localeCompare(x) : x.localeCompare(y); }
      x = x == null || !isFinite(x) ? (desc ? -Infinity : Infinity) : x;
      y = y == null || !isFinite(y) ? (desc ? -Infinity : Infinity) : y;
      return desc ? y - x : x - y;
    });
    return rows;
  }
  function headRow(cols, st) {
    return '<thead><tr>' + cols.map(c => '<th class="' + (c.l ? 'l ' : '') + (c.k && st.sort === c.k ? 'sorted' + (st.desc ? ' desc' : '') : '') + '"' + (c.k ? ' data-key="' + c.k + '"' : '') + (c.t ? ' title="' + esc(c.t) + '"' : '') + '>' + c.h + '</th>').join('') + '</tr></thead>';
  }

  function renderRefined() {
    const st = state.ref;
    const uses = refinerUses(state.inv);
    const refP = price('Junk refiner');
    const refShare = refP ? refP / uses : 0;
    const q = st.search.trim().toLowerCase();
    const per = PER.refined;
    let rows = ranked('junk').filter(r => (!q || r.name.toLowerCase().includes(q)) && (!st.minLimit || (r.limit || 0) >= st.minLimit)).map(r => {
      const rpi = r.pu / 100;
      const iq = r.s[0] || 1;
      const for50 = Math.ceil(per / (rpi * iq) - 1e-9) * iq;
      return {
        name: r.name, s: r.s, price: r.price, limit: r.limit, vol: r.vol, junk: junkPct(r.s), mats: r.s[1], iq,
        jpi: r.pu, rpi, ipr: 1 / rpi, cpc: r.price / rpi + refShare, for50,
        perWin: r.limit ? r.limit * rpi : null, cost50: for50 * r.price + Math.ceil(per / uses) * (refP || 0), level: r.s[7],
      };
    });
    const best = rows.length ? Math.min.apply(null, rows.map(r => r.cpc)) : null;
    sortRows(rows, st.sort, st.desc);
    const total = rows.length;
    rows = rows.slice(0, st.show);
    const cols = [
      { h: '#' }, { h: 'Item', k: 'name', l: 1 }, { h: 'GE price', k: 'price' }, { h: 'Buy limit', k: 'limit' }, { h: 'Daily vol.', k: 'vol' },
      { h: 'Item lvl', k: 'level' }, { h: 'Junk %', k: 'junk', t: 'Junk chance with your research setting' }, { h: 'Mats each', k: 'mats', t: 'Materials per disassembly' },
      { h: 'Junk / item', k: 'jpi' }, { h: 'Items / refined', k: 'ipr' }, { h: 'Cost / refined', k: 'cpc', t: 'Includes your share of the junk refiner' },
      { h: 'Items for ' + per, k: 'for50', t: 'Items to disassemble for ' + per + ' refined (one ' + T.name.toLowerCase() + ')' }, { h: 'Refined / 4h limit', k: 'perWin', t: 'Refined components from one full buy-limit window' },
      { h: 'Cost for ' + per, k: 'cost50', t: 'Items + junk refiners for one ' + T.word + ' worth' },
    ];
    let h = headRow(cols, st) + '<tbody>';
    h += rows.map((r, i) => '<tr><td class="rank">' + (i + 1) + '</td><td class="l">' + itemLink(r.name) + (r.iq > 1 ? ' <span class="muted small">(per ' + r.iq + ')</span>' : '') + '</td><td>' + geLink(r.name, fmt(r.price)) + '</td><td>' + (r.limit ? fmt(r.limit) : '—') +
      '</td><td>' + (r.vol != null ? short(r.vol) : '—') + '</td><td>' + r.level + '</td><td>' + dec(r.junk, 1) + '%</td><td>' + (r.iq > 1 ? r.mats + ' / ' + r.iq : r.mats) + '</td><td>' + dec(r.jpi, 3) + '</td><td>' + dec(r.ipr, 1) +
      '</td><td' + (r.cpc === best ? ' class="best"' : '') + '>' + fmt(r.cpc) + '</td><td>' + fmt(r.for50) + '</td><td>' + (r.perWin != null ? dec(r.perWin, 1) : '—') + '</td><td>' + gp(r.cost50) + '</td></tr>').join('');
    h += '</tbody>';
    $('#refTable').innerHTML = h;
    $('#refFoot').innerHTML = 'Showing ' + fmt(rows.length) + ' of ' + fmt(total) + ' tradeable items that give junk. Junk refiner: ' + (refP ? fmt(refP) + ' gp ÷ ' + uses + ' = ' + fmt(refShare) + ' gp' : 'no price') +
      ' added to every refined component. Junk reduction research: ' + junkTierLabel(state.junkTier) + '.' + (state.minVol > 0 ? ' Hiding items that trade under ' + fmt(state.minVol) + '/day and under their own buy limit (change it in the settings bar).' : '');
  }

  // ------------------------------------------------------------------ rendering: other components
  function renderOther() {
    const st = state.oth;
    const mat = st.mat;
    const info = COMP_INFO[mat];
    $$('#otherPills button').forEach(b => b.classList.toggle('on', b.dataset.mat === mat));
    $('#otherExplain').innerHTML = icon(info.name, 'ic-lg') + '<div><h2>Cheapest sources of ' + info.name.toLowerCase() + '</h2><p>' + info.blurb + ' You need <b>' + PER[mat] + '</b> per ' + T.name.toLowerCase() + '.</p></div>';
    const q = st.search.trim().toLowerCase();
    let rows = ranked(mat).filter(r => (!q || r.name.toLowerCase().includes(q)) && (!st.minLimit || (r.limit || 0) >= st.minLimit)).map(r => {
      const iq = r.s[0] || 1;
      const forOne = Math.ceil(PER[mat] / (r.pu * iq) - 1e-9) * iq;
      let how;
      if (mat === 'precious') how = r.s[1] + ' mats × ' + dec(100 - junkPct(r.s), 1) + '% non-junk × ' + dec(r.s[3], 2) + '%';
      else { const sp = mat === 'fortunate' ? r.s[4] : r.s[5]; how = sp[0] + ' × ' + dec(sp[1], 2) + '% chance'; }
      return { name: r.name, s: r.s, price: r.price, limit: r.limit, vol: r.vol, pu: r.pu, cpc: r.cpc, forOne, costOne: forOne * r.price, perWin: r.limit ? r.limit * r.pu : null, how, iq, level: r.s[7], junk: perUnit('junk', r.s) };
    });
    const best = rows.length ? Math.min.apply(null, rows.map(r => r.cpc)) : null;
    sortRows(rows, st.sort, st.desc);
    const total = rows.length;
    rows = rows.slice(0, st.show);
    const cols = [
      { h: '#' }, { h: 'Item', k: 'name', l: 1 }, { h: 'GE price', k: 'price' }, { h: 'Buy limit', k: 'limit' }, { h: 'Daily vol.', k: 'vol' },
      { h: 'How it yields', l: 1 }, { h: 'Per item', k: 'pu', t: 'Components per item disassembled' }, { h: 'Cost / comp', k: 'cpc' },
      { h: 'Items per ' + T.word, k: 'forOne', t: 'Items to disassemble for ' + PER[mat] + ' components' }, { h: 'Cost per ' + T.word, k: 'costOne' },
      { h: 'Comps / 4h limit', k: 'perWin' }, { h: 'Bonus junk / item', k: 'junk', t: 'Junk you also get, which counts towards refined components' },
    ];
    let h = headRow(cols, st) + '<tbody>';
    h += rows.map((r, i) => '<tr><td class="rank">' + (i + 1) + '</td><td class="l">' + itemLink(r.name) + '</td><td>' + geLink(r.name, fmt(r.price)) + '</td><td>' + (r.limit ? fmt(r.limit) : '—') + '</td><td>' + (r.vol != null ? short(r.vol) : '—') +
      '</td><td class="l muted">' + r.how + '</td><td>' + dec(r.pu, r.pu < 1 ? 4 : 2) + '</td><td' + (r.cpc === best ? ' class="best"' : '') + '>' + fmt(r.cpc) + '</td><td>' + fmt(r.forOne) + '</td><td>' + gp(r.costOne) +
      '</td><td>' + (r.perWin != null ? dec(r.perWin, 1) : '—') + '</td><td>' + dec(r.junk, 2) + '</td></tr>').join('');
    $('#othTable').innerHTML = h + '</tbody>';
    $('#othFoot').innerHTML = 'Showing ' + fmt(rows.length) + ' of ' + fmt(total) + ' tradeable items with a GE price that give ' + info.name.toLowerCase() + '.' + (state.minVol > 0 ? ' Hiding items that trade under ' + fmt(state.minVol) + '/day and under their own buy limit.' : '');
  }

  // ------------------------------------------------------------------ settings / tabs / events
  function junkTierLabel(i) {
    const t = JUNK_TIERS[i];
    return i === 0 ? 'None (base junk chance)' : 'Tier ' + i + ' — Invention ' + t[0] + ' (junk × ' + t[1].toFixed(2) + ')';
  }

  function renderSettings() {
    $('#setInv').value = state.inv;
    $('#setMinVol').value = state.minVol;
    $('#setJunk').innerHTML = JUNK_TIERS.map((t, i) => '<option value="' + i + '"' + (i === state.junkTier ? ' selected' : '') + '>' + junkTierLabel(i) + '</option>').join('');
    const uses = refinerUses(state.inv), rp = price('Junk refiner');
    $('#refinerInfo').textContent = uses + ' refined each' + (rp ? ' · ' + fmt(rp / uses) + ' gp per refined' : '');
    $('#qty').value = state.qty;
    $('#refSearch').value = state.ref.search; $('#refMinLimit').value = String(state.ref.minLimit); $('#refShow').value = String(state.ref.show);
    $('#othSearch').value = state.oth.search; $('#othMinLimit').value = String(state.oth.minLimit); $('#othShow').value = String(state.oth.show);
  }

  function renderHave() {
    $('#haveGrid').innerHTML = HAVE_ITEMS.map(([id, name]) =>
      '<label class="have-item">' + icon(name) + '<span>' + esc(name) + '</span><input type="number" min="0" step="1" data-have="' + id + '" value="' + (state.have[id] ? esc(state.have[id]) : '') + '" placeholder="0"></label>').join('');
    if (Object.values(state.have).some(v => num(v) > 0)) $('#havePanel').open = true;
  }

  function setTab(tab) {
    if (!['calc', 'refined', 'other'].includes(tab)) tab = 'calc';
    state.tab = tab;
    try { history.replaceState(null, '', tab === 'calc' ? location.pathname + location.search : '#' + tab); } catch (e) { /* file:// may refuse */ }
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('.switch a').forEach(a => { a.setAttribute('href', a.getAttribute('href').split('#')[0] + (tab === 'calc' ? '' : '#' + tab)); }); // keep the tab when switching calculators
    $$('.tab-panel').forEach(p => { p.hidden = p.id !== 'tab-' + tab; });
    save();
  }

  function renderAll() {
    renderSettings();
    renderCalc();
    renderRefined();
    renderOther();
  }

  function bind() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#refreshBtn').addEventListener('click', refreshPrices);

    $('#qty').addEventListener('input', e => { const v = Math.floor(num(e.target.value)); if (v >= 1) { state.qty = Math.min(v, 100000); save(); renderCalc(); } });
    $('#setInv').addEventListener('change', e => {
      const v = Math.min(120, Math.max(1, Math.floor(num(e.target.value)) || 1));
      state.inv = v;
      let tier = 0; JUNK_TIERS.forEach((t, i) => { if (v >= t[0]) tier = i; });
      state.junkTier = tier;
      save(); invalidate(); renderAll();
    });
    $('#setJunk').addEventListener('change', e => { state.junkTier = Number(e.target.value) || 0; save(); invalidate(); renderAll(); });
    $('#setMinVol').addEventListener('change', e => { state.minVol = Math.max(0, Math.floor(num(e.target.value))); save(); invalidate(); renderAll(); });

    $('#haveGrid').addEventListener('input', e => {
      const id = e.target.dataset.have; if (!id) return;
      const v = Math.max(0, Math.floor(num(e.target.value)));
      if (v) state.have[id] = v; else delete state.have[id];
      save(); renderCalc();
    });
    $('#clearHave').addEventListener('click', () => { state.have = {}; save(); renderHave(); renderCalc(); });

    $('#tree').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (b) { const id = b.dataset.node; if (b.dataset.mode === 'auto') delete state.modes[id]; else state.modes[id] = b.dataset.mode; save(); renderCalc(); return; }
      const m = e.target.closest('[data-more]');
      if (m) { const id = m.dataset.more; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); renderCalc(); }
    });
    $('#tree').addEventListener('change', e => {
      const key = e.target.dataset.src; if (!key) return;
      if (e.target.value === 'mix') delete state.src[key]; else state.src[key] = e.target.value;
      save(); renderCalc();
    });

    $('#copyList').addEventListener('click', () => {
      const txt = lastShop.map(e => fmt(e.units) + ' x ' + e.name + (e.unit != null ? ' @ ' + fmt(e.unit) + ' = ' + fmt(e.units * e.unit) + ' gp' : '')).join('\n');
      const done = () => { const b = $('#copyList'); b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy list'; }, 1500); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
      else fallbackCopy(txt, done);
    });

    // refined filters
    $('#refSearch').addEventListener('input', e => { state.ref.search = e.target.value; save(); renderRefined(); });
    $('#refMinLimit').addEventListener('change', e => { state.ref.minLimit = Number(e.target.value) || 0; save(); renderRefined(); });
    $('#refShow').addEventListener('change', e => { state.ref.show = Number(e.target.value) || 100; save(); renderRefined(); });
    $('#othSearch').addEventListener('input', e => { state.oth.search = e.target.value; save(); renderOther(); });
    $('#othMinLimit').addEventListener('change', e => { state.oth.minLimit = Number(e.target.value) || 0; save(); renderOther(); });
    $('#othShow').addEventListener('change', e => { state.oth.show = Number(e.target.value) || 50; save(); renderOther(); });
    $('#otherPills').addEventListener('click', e => { const b = e.target.closest('[data-mat]'); if (!b) return; state.oth.mat = b.dataset.mat; save(); renderOther(); });

    const sorter = (tableSel, st, render) => $(tableSel).addEventListener('click', e => {
      const th = e.target.closest('th[data-key]'); if (!th) return;
      const k = th.dataset.key;
      if (st().sort === k) st().desc = !st().desc;
      else { st().sort = k; st().desc = !['cpc', 'ipr', 'price', 'for50', 'cost50', 'forOne', 'costOne', 'name', 'level', 'junk'].includes(k) ? true : false; }
      save(); render();
    });
    sorter('#refTable', () => state.ref, renderRefined);
    sorter('#othTable', () => state.oth, renderOther);
  }

  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    ta.remove();
  }

  // ------------------------------------------------------------------ boot
  $('#buildInfo').textContent = 'Recipe + disassembly dataset built ' + new Date(D.built * 1000).toLocaleDateString() + ' (' + fmt(Object.keys(S).length) + ' disassembly sources).';
  $$('#otherPills button').forEach(b => { if (!MATS.includes(b.dataset.mat)) b.remove(); });
  bind();
  renderHave();
  const hashTab = (location.hash || '').slice(1);
  setTab(['calc', 'refined', 'other'].includes(hashTab) ? hashTab : state.tab);
  window.addEventListener('hashchange', () => setTab((location.hash || '').slice(1) || 'calc'));
  renderAll();
  refreshPrices();
})();
