import { FORMATS, BYE } from "./formats.js";

const VERSION = 1;

export const SCORING_PRESETS = {
  "3-1-0": { label: "3 / 1 / 0 — draws allowed", win: 3, draw: 1, loss: 0 },
  "1-0-0": { label: "1 / 0 / 0 — no draws", win: 1, draw: null, loss: 0 },
  "1-0.5-0": { label: "1 / 0.5 / 0 — draws allowed (chess-style)", win: 1, draw: 0.5, loss: 0 },
};

export function createTournament(cfg) {
  const id = `t_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const players = cfg.playerNames.map((name, i) => ({
    id: `p${i}`,
    name: name.trim() || `Player ${i + 1}`,
    dropped: false,
  }));
  const t = {
    version: VERSION,
    id,
    name: cfg.name.trim() || "Untitled tournament",
    createdAt: new Date().toISOString(),
    format: cfg.format,
    scoring: cfg.scoring,
    timeBudgetMin: cfg.timeBudgetMin,
    matchCapMin: cfg.matchCapMin,
    players,
    rounds: [],
    currentRound: 0,
    status: "setup",
  };
  const first = FORMATS[cfg.format].generateNextRound(t);
  if (first) {
    t.rounds.push(first);
    t.status = "active";
  }
  return t;
}

export function recordResult(t, roundIdx, matchId, result) {
  const next = structuredClone(t);
  const match = next.rounds[roundIdx].find((m) => m.id === matchId);
  if (!match) return t;
  match.result = result;
  return next;
}

export function currentRoundComplete(t) {
  if (t.rounds.length === 0) return false;
  const cur = t.rounds[t.rounds.length - 1];
  return cur.every((m) => m.result !== null);
}

export function advanceRound(t) {
  if (!currentRoundComplete(t)) return t;
  const next = structuredClone(t);
  const format = FORMATS[t.format];
  const more = format.generateNextRound(next);
  if (more === null || more.length === 0) {
    next.status = "complete";
  } else {
    next.rounds.push(more);
    next.currentRound = next.rounds.length - 1;
  }
  return next;
}

export function computeStandings(t) {
  const rows = {};
  for (const p of t.players) {
    rows[p.id] = {
      playerId: p.id,
      name: p.name,
      points: 0,
      w: 0,
      d: 0,
      l: 0,
      opponents: [],
    };
  }
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.result === null) continue;
      if (m.result === "bye") {
        const real = m.p1 === BYE ? m.p2 : m.p1;
        if (rows[real]) {
          rows[real].w += 1;
          rows[real].points += t.scoring.win;
        }
        continue;
      }
      const { p1, p2 } = m;
      if (m.result === "p1") {
        rows[p1].w += 1;
        rows[p1].points += t.scoring.win;
        rows[p2].l += 1;
        rows[p2].points += t.scoring.loss;
      } else if (m.result === "p2") {
        rows[p2].w += 1;
        rows[p2].points += t.scoring.win;
        rows[p1].l += 1;
        rows[p1].points += t.scoring.loss;
      } else if (m.result === "draw" && t.scoring.draw !== null) {
        rows[p1].d += 1;
        rows[p2].d += 1;
        rows[p1].points += t.scoring.draw;
        rows[p2].points += t.scoring.draw;
      }
      rows[p1].opponents.push(p2);
      rows[p2].opponents.push(p1);
    }
  }
  // Opponents' Match Win % for tiebreaker.
  const winRates = {};
  for (const id of Object.keys(rows)) {
    const r = rows[id];
    const played = r.w + r.d + r.l;
    winRates[id] = played > 0 ? r.w / played : 0;
  }
  for (const id of Object.keys(rows)) {
    const r = rows[id];
    if (r.opponents.length === 0) { r.omwPct = 0; continue; }
    const sum = r.opponents.reduce((acc, oid) => acc + Math.max(winRates[oid] || 0, 0.33), 0);
    r.omwPct = sum / r.opponents.length;
  }
  const list = Object.values(rows);
  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omwPct !== a.omwPct) return b.omwPct - a.omwPct;
    if (b.w !== a.w) return b.w - a.w;
    return a.name.localeCompare(b.name);
  });
  return list;
}

export function championId(t) {
  const format = FORMATS[t.format];
  const fromFormat = format.champion(t);
  if (fromFormat) return fromFormat;
  if (t.status !== "complete") return null;
  const standings = computeStandings(t);
  return standings.length > 0 ? standings[0].playerId : null;
}

export function playerName(t, id) {
  if (id === BYE) return "BYE";
  const p = t.players.find((p) => p.id === id);
  return p ? p.name : "?";
}
