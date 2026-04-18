const BYE = "BYE";

function makeMatchId(roundIdx, matchIdx) {
  return `r${roundIdx}-m${matchIdx}`;
}

function newMatch(roundIdx, matchIdx, p1, p2, bracket = "main") {
  const m = { id: makeMatchId(roundIdx, matchIdx), bracket, p1, p2, result: null };
  if (p1 === BYE || p2 === BYE) {
    m.result = "bye";
  }
  return m;
}

function winnerOf(match) {
  if (match.result === "bye") return match.p1 === BYE ? match.p2 : match.p1;
  if (match.result === "p1") return match.p1;
  if (match.result === "p2") return match.p2;
  return null;
}

function loserOf(match) {
  if (match.result === "bye") return null;
  if (match.result === "p1") return match.p2;
  if (match.result === "p2") return match.p1;
  return null;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function log2Int(n) {
  let k = 0;
  let v = 1;
  while (v < n) { v *= 2; k++; }
  return k;
}

function seededBracketOrder(n) {
  let order = [0];
  while (order.length < n) {
    const next = [];
    const m = order.length * 2;
    for (const s of order) {
      next.push(s);
      next.push(m - 1 - s);
    }
    order = next;
  }
  return order;
}

// Round Robin (circle method)
export const roundRobin = {
  id: "round-robin",
  label: "Round Robin",
  supportedCounts: (n) => n >= 2 && n <= 8,
  estimateRounds: (n) => (n % 2 === 0 ? n - 1 : n),

  generateNextRound(t) {
    const total = this.estimateRounds(t.players.length);
    const r = t.rounds.length;
    if (r >= total) return null;

    const ids = t.players.map((p) => p.id);
    const pool = ids.slice();
    if (pool.length % 2 === 1) pool.push(BYE);
    const m = pool.length;
    const fixed = pool[0];
    const rot = pool.slice(1);
    const rotated = rot.slice(-r).concat(rot.slice(0, rot.length - r));
    const arranged = [fixed, ...rotated];

    const matches = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arranged[i];
      const b = arranged[m - 1 - i];
      matches.push(newMatch(r, i, a, b));
    }
    return matches;
  },

  isComplete(t) {
    return t.rounds.length >= this.estimateRounds(t.players.length);
  },

  champion(t) {
    // Derived from standings elsewhere; return null here.
    return null;
  },
};

// Single Elimination
export const singleElim = {
  id: "single-elim",
  label: "Single Elimination",
  supportedCounts: (n) => n >= 2 && n <= 8,
  estimateRounds: (n) => log2Int(nextPow2(n)),

  generateNextRound(t) {
    const ids = t.players.map((p) => p.id);
    if (t.rounds.length === 0) {
      const N = nextPow2(ids.length);
      const padded = ids.slice();
      while (padded.length < N) padded.push(BYE);
      const order = seededBracketOrder(N);
      const matches = [];
      for (let i = 0; i < N / 2; i++) {
        const a = padded[order[2 * i]];
        const b = padded[order[2 * i + 1]];
        matches.push(newMatch(0, i, a, b));
      }
      return matches;
    }
    const prev = t.rounds[t.rounds.length - 1];
    if (prev.length === 1) return null;
    const matches = [];
    const r = t.rounds.length;
    for (let i = 0; i < prev.length; i += 2) {
      const a = winnerOf(prev[i]);
      const b = winnerOf(prev[i + 1]);
      matches.push(newMatch(r, i / 2, a, b));
    }
    return matches;
  },

  isComplete(t) {
    if (t.rounds.length === 0) return false;
    const last = t.rounds[t.rounds.length - 1];
    return last.length === 1 && last[0].result !== null;
  },

  champion(t) {
    if (!this.isComplete(t)) return null;
    return winnerOf(t.rounds[t.rounds.length - 1][0]);
  },
};

// Swiss
export const swiss = {
  id: "swiss",
  label: "Swiss",
  supportedCounts: (n) => n >= 2 && n <= 8,
  estimateRounds: (n) => Math.max(1, log2Int(nextPow2(n))),

  generateNextRound(t) {
    const total = this.estimateRounds(t.players.length);
    const r = t.rounds.length;
    if (r >= total) return null;

    const ids = t.players.map((p) => p.id);
    const points = scoreMap(t);
    const played = playedPairs(t);
    const byesHad = byeMap(t);

    const sorted = ids.slice().sort((a, b) => {
      const d = (points[b] || 0) - (points[a] || 0);
      if (d !== 0) return d;
      return ids.indexOf(a) - ids.indexOf(b);
    });

    let pairingPool = sorted;
    let byePlayer = null;
    if (sorted.length % 2 === 1) {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (!byesHad[sorted[i]]) { byePlayer = sorted[i]; break; }
      }
      if (byePlayer === null) byePlayer = sorted[sorted.length - 1];
      pairingPool = sorted.filter((p) => p !== byePlayer);
    }

    const pairs = swissPair(pairingPool, played);
    const matches = [];
    let idx = 0;
    if (pairs) {
      for (const [a, b] of pairs) {
        matches.push(newMatch(r, idx++, a, b));
      }
    } else {
      // Fallback: pair sequentially even if rematch.
      for (let i = 0; i < pairingPool.length; i += 2) {
        matches.push(newMatch(r, idx++, pairingPool[i], pairingPool[i + 1]));
      }
    }
    if (byePlayer !== null) {
      matches.push(newMatch(r, idx++, byePlayer, BYE));
    }
    return matches;
  },

  isComplete(t) {
    return t.rounds.length >= this.estimateRounds(t.players.length);
  },

  champion(t) {
    return null; // derived from standings
  },
};

function swissPair(players, played) {
  if (players.length === 0) return [];
  const a = players[0];
  for (let i = 1; i < players.length; i++) {
    const b = players[i];
    if (played.has(pairKey(a, b))) continue;
    const rest = players.slice(1, i).concat(players.slice(i + 1));
    const sub = swissPair(rest, played);
    if (sub !== null) return [[a, b], ...sub];
  }
  return null;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function scoreMap(t) {
  const map = {};
  for (const p of t.players) map[p.id] = 0;
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.result === "p1") map[m.p1] = (map[m.p1] || 0) + t.scoring.win;
      else if (m.result === "p2") map[m.p2] = (map[m.p2] || 0) + t.scoring.win;
      else if (m.result === "draw" && t.scoring.draw !== null) {
        map[m.p1] = (map[m.p1] || 0) + t.scoring.draw;
        map[m.p2] = (map[m.p2] || 0) + t.scoring.draw;
      } else if (m.result === "bye") {
        const real = m.p1 === BYE ? m.p2 : m.p1;
        map[real] = (map[real] || 0) + t.scoring.win;
      }
    }
  }
  return map;
}

function playedPairs(t) {
  const set = new Set();
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.p1 !== BYE && m.p2 !== BYE) set.add(pairKey(m.p1, m.p2));
    }
  }
  return set;
}

function byeMap(t) {
  const map = {};
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.result === "bye") {
        const real = m.p1 === BYE ? m.p2 : m.p1;
        map[real] = true;
      }
    }
  }
  return map;
}

// Double Elimination (supports exact powers of 2: 4 or 8 players)
// Schedule per round (N=4): WB1, LB1, WB2, LB2, GF, [GF reset]
// Schedule per round (N=8): WB1, LB1, WB2, LB2, LB3, WB3, LB4, GF, [GF reset]
const DE_SCHEDULE = {
  4: ["WB1", "LB1", "WB2", "LB2", "GF", "RESET"],
  8: ["WB1", "LB1", "WB2", "LB2", "LB3", "WB3", "LB4", "GF", "RESET"],
};

export const doubleElim = {
  id: "double-elim",
  label: "Double Elimination",
  supportedCounts: (n) => n === 4 || n === 8,
  estimateRounds: (n) => (n === 4 ? 5 : n === 8 ? 8 : 0),

  generateNextRound(t) {
    const n = t.players.length;
    if (!(n === 4 || n === 8)) return null;
    const schedule = DE_SCHEDULE[n];
    const r = t.rounds.length;
    if (r >= schedule.length) return null;

    const tag = schedule[r];
    if (tag === "RESET") {
      // Only play reset if GF's LB player won GF.
      const gf = t.rounds[r - 1][0];
      const gfWinner = winnerOf(gf);
      const lbChampion = findLbChampion(t, n);
      if (gfWinner !== lbChampion) return null;
      return [newMatch(r, 0, gf.p1, gf.p2, "final")];
    }

    if (tag === "GF") {
      const wbChampion = findWbChampion(t, n);
      const lbChampion = findLbChampion(t, n);
      return [newMatch(r, 0, wbChampion, lbChampion, "final")];
    }

    if (tag.startsWith("WB")) {
      return generateWbRound(t, r, n, +tag.slice(2));
    }
    if (tag.startsWith("LB")) {
      return generateLbRound(t, r, n, +tag.slice(2));
    }
    return null;
  },

  isComplete(t) {
    const n = t.players.length;
    if (!(n === 4 || n === 8)) return false;
    const schedule = DE_SCHEDULE[n];
    const last = t.rounds[t.rounds.length - 1];
    if (!last) return false;
    const lastTag = schedule[t.rounds.length - 1];
    if (lastTag === "GF") {
      const gf = last[0];
      if (gf.result === null) return false;
      const gfWinner = winnerOf(gf);
      const lbChampion = findLbChampion(t, n);
      // Complete unless LB champion just won (reset needed)
      return gfWinner !== lbChampion;
    }
    if (lastTag === "RESET") {
      return last[0] && last[0].result !== null;
    }
    return false;
  },

  champion(t) {
    if (!this.isComplete(t)) return null;
    const last = t.rounds[t.rounds.length - 1][0];
    return winnerOf(last);
  },
};

function wbRoundsByTag(t) {
  const map = { WB1: null, WB2: null, WB3: null, LB1: null, LB2: null, LB3: null, LB4: null };
  const schedule = DE_SCHEDULE[t.players.length];
  for (let i = 0; i < t.rounds.length; i++) {
    const tag = schedule[i];
    if (tag in map) map[tag] = t.rounds[i];
  }
  return map;
}

function generateWbRound(t, r, n, wbNum) {
  if (wbNum === 1) {
    // Seeded bracket of N players.
    const ids = t.players.map((p) => p.id);
    const order = seededBracketOrder(n);
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[order[2 * i]];
      const b = ids[order[2 * i + 1]];
      matches.push(newMatch(r, i, a, b, "winners"));
    }
    return matches;
  }
  const rounds = wbRoundsByTag(t);
  const prev = rounds[`WB${wbNum - 1}`];
  const matches = [];
  for (let i = 0; i < prev.length; i += 2) {
    const a = winnerOf(prev[i]);
    const b = winnerOf(prev[i + 1]);
    matches.push(newMatch(r, i / 2, a, b, "winners"));
  }
  return matches;
}

function generateLbRound(t, r, n, lbNum) {
  const rounds = wbRoundsByTag(t);
  const matches = [];
  if (n === 4) {
    if (lbNum === 1) {
      const wb1 = rounds.WB1;
      matches.push(newMatch(r, 0, loserOf(wb1[0]), loserOf(wb1[1]), "losers"));
    } else if (lbNum === 2) {
      const lb1 = rounds.LB1;
      const wb2 = rounds.WB2;
      matches.push(newMatch(r, 0, winnerOf(lb1[0]), loserOf(wb2[0]), "losers"));
    }
    return matches;
  }
  // n === 8
  if (lbNum === 1) {
    const wb1 = rounds.WB1;
    matches.push(newMatch(r, 0, loserOf(wb1[0]), loserOf(wb1[1]), "losers"));
    matches.push(newMatch(r, 1, loserOf(wb1[2]), loserOf(wb1[3]), "losers"));
  } else if (lbNum === 2) {
    const lb1 = rounds.LB1;
    const wb2 = rounds.WB2;
    // Cross losers of WB2 against winners of LB1 to avoid immediate rematches.
    matches.push(newMatch(r, 0, winnerOf(lb1[0]), loserOf(wb2[1]), "losers"));
    matches.push(newMatch(r, 1, winnerOf(lb1[1]), loserOf(wb2[0]), "losers"));
  } else if (lbNum === 3) {
    const lb2 = rounds.LB2;
    matches.push(newMatch(r, 0, winnerOf(lb2[0]), winnerOf(lb2[1]), "losers"));
  } else if (lbNum === 4) {
    const lb3 = rounds.LB3;
    const wb3 = rounds.WB3;
    matches.push(newMatch(r, 0, winnerOf(lb3[0]), loserOf(wb3[0]), "losers"));
  }
  return matches;
}

function findWbChampion(t, n) {
  const rounds = wbRoundsByTag(t);
  const wbFinal = n === 4 ? rounds.WB2 : rounds.WB3;
  return winnerOf(wbFinal[0]);
}

function findLbChampion(t, n) {
  const rounds = wbRoundsByTag(t);
  const lbFinal = n === 4 ? rounds.LB2 : rounds.LB4;
  return winnerOf(lbFinal[0]);
}

export const FORMATS = {
  [roundRobin.id]: roundRobin,
  [singleElim.id]: singleElim,
  [swiss.id]: swiss,
  [doubleElim.id]: doubleElim,
};

export const FORMAT_LIST = [roundRobin, singleElim, swiss, doubleElim];

export { BYE };
