import { FORMATS, FORMAT_LIST, BYE } from "./formats.js";
import {
  SCORING_PRESETS,
  createTournament,
  recordResult,
  swapPlayer,
  roundParticipants,
  advanceRound,
  currentRoundComplete,
  computeStandings,
  championId,
  playerName,
} from "./tournament.js";
import {
  loadActive,
  saveActive,
  clearActive,
  exportJSON,
  importJSON,
} from "./storage.js";
import { createMatchTimer, formatDuration } from "./timer.js";

const DEFAULT_PLAYER_COUNT = 5;
const DEFAULT_SCORING = "3-1-0";
const DEFAULT_TIME_BUDGET_MIN = 180;
const DEFAULT_MATCH_CAP_MIN = 40;

const activeTimers = new Map();

function clearTimers() {
  for (const t of activeTimers.values()) t.dispose();
  activeTimers.clear();
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k in el && typeof v !== "string") {
      el[k] = v;
    } else {
      el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

function mount(root, ...children) {
  clearTimers();
  root.replaceChildren();
  for (const c of children) root.appendChild(c);
}

function navigate(hash) {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = hash;
  }
}

export function renderHome(root) {
  const t = loadActive();
  const content = [h("h2", {}, "Tournaments")];

  if (t) {
    const roundsPlayed = t.rounds.filter((r) => r.every((m) => m.result !== null)).length;
    const totalRounds = FORMATS[t.format].estimateRounds(t.players.length);
    const resumeHref = t.status === "complete" ? "#/done" : "#/play";
    content.push(
      h("article", {},
        h("header", {}, h("strong", {}, t.name)),
        h("p", {},
          `${FORMATS[t.format].label} · ${t.players.length} players · `,
          t.status === "complete"
            ? "Completed"
            : `Round ${roundsPlayed} / ${totalRounds}`
        ),
        h("div", { class: "row" },
          h("a", { href: resumeHref, role: "button" }, t.status === "complete" ? "View results" : "Resume"),
          h("button", { class: "secondary", onclick: () => exportJSON(t) }, "Export JSON"),
          h("button", {
            class: "contrast",
            onclick: () => {
              if (confirm(`Discard "${t.name}"? This cannot be undone.`)) {
                clearActive();
                navigate("#/");
              }
            },
          }, "Discard"),
        ),
      )
    );
  } else {
    content.push(
      h("p", {}, "No active tournament."),
      h("a", { href: "#/new", role: "button" }, "New tournament"),
    );
  }

  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = await importJSON(file);
        if (t && !confirm(`Replace the current "${t.name}" with "${imported.name}"?`)) return;
        saveActive(imported);
        navigate("#/");
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      } finally {
        e.target.value = "";
      }
    },
  });

  content.push(
    h("article", {},
      h("header", {}, h("strong", {}, "Import tournament")),
      h("p", {}, "Load a tournament previously exported to JSON."),
      fileInput,
    )
  );

  mount(root, ...content);
}

export function renderNew(root) {
  const state = {
    name: "",
    playerCount: DEFAULT_PLAYER_COUNT,
    playerNames: Array(DEFAULT_PLAYER_COUNT).fill(""),
    scoringKey: DEFAULT_SCORING,
    timeBudgetMin: DEFAULT_TIME_BUDGET_MIN,
    matchCapMin: DEFAULT_MATCH_CAP_MIN,
    format: "round-robin",
  };

  const container = h("article", {});
  mount(root, h("h2", {}, "New tournament"), container);
  render();

  function render() {
    container.replaceChildren();

    const nameInput = h("input", {
      type: "text",
      placeholder: "e.g. Friday Night TCG",
      value: state.name,
      oninput: (e) => { state.name = e.target.value; },
    });

    const countInput = h("input", {
      type: "number",
      min: "2",
      max: "8",
      step: "1",
      value: String(state.playerCount),
      oninput: (e) => {
        const n = Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 2));
        state.playerCount = n;
        if (state.playerNames.length < n) {
          state.playerNames = state.playerNames.concat(Array(n - state.playerNames.length).fill(""));
        } else {
          state.playerNames = state.playerNames.slice(0, n);
        }
        if (!FORMATS[state.format].supportedCounts(n)) {
          const fallback = FORMAT_LIST.find((f) => f.supportedCounts(n));
          if (fallback) state.format = fallback.id;
        }
        render();
      },
    });

    const playerFields = h("fieldset", {},
      h("legend", {}, "Player names"),
      ...state.playerNames.map((v, i) =>
        h("label", {},
          `Player ${i + 1}`,
          h("input", {
            type: "text",
            value: v,
            placeholder: `Player ${i + 1}`,
            oninput: (e) => { state.playerNames[i] = e.target.value; },
          })
        )
      )
    );

    const scoringSelect = h("select", {
      onchange: (e) => { state.scoringKey = e.target.value; },
    },
      ...Object.entries(SCORING_PRESETS).map(([key, cfg]) =>
        h("option", { value: key, selected: key === state.scoringKey }, cfg.label)
      )
    );

    const budgetInput = h("input", {
      type: "number",
      min: "30",
      step: "10",
      value: String(state.timeBudgetMin),
      oninput: (e) => { state.timeBudgetMin = parseInt(e.target.value, 10) || 0; render(); },
    });

    const capInput = h("input", {
      type: "number",
      min: "5",
      step: "5",
      value: String(state.matchCapMin),
      oninput: (e) => { state.matchCapMin = parseInt(e.target.value, 10) || 0; render(); },
    });

    const formatTable = h("table", {},
      h("thead", {},
        h("tr", {},
          h("th", {}, "Pick"),
          h("th", {}, "Format"),
          h("th", {}, "Rounds"),
          h("th", {}, "Est. duration"),
          h("th", {}, "Fits?"),
        )
      ),
      h("tbody", {},
        ...FORMAT_LIST.map((f) => {
          const supported = f.supportedCounts(state.playerCount);
          const rounds = supported ? f.estimateRounds(state.playerCount) : 0;
          const durationMin = rounds * state.matchCapMin;
          const fits = durationMin <= state.timeBudgetMin;
          return h("tr", {},
            h("td", {},
              h("input", {
                type: "radio",
                name: "format",
                value: f.id,
                checked: state.format === f.id,
                disabled: !supported,
                onchange: () => { state.format = f.id; render(); },
              })
            ),
            h("td", {}, f.label, supported ? "" : " (unsupported)"),
            h("td", {}, supported ? String(rounds) : "—"),
            h("td", {}, supported ? `~${durationMin} min` : "—"),
            h("td", { class: supported ? (fits ? "fit-yes" : "fit-no") : "" },
              supported ? (fits ? "yes" : "over budget") : "—"),
          );
        })
      )
    );

    const startBtn = h("button", {
      type: "submit",
      disabled: !FORMATS[state.format].supportedCounts(state.playerCount),
    }, "Start tournament");

    const form = h("form", {
      onsubmit: (e) => {
        e.preventDefault();
        if (!FORMATS[state.format].supportedCounts(state.playerCount)) return;
        const prev = loadActive();
        if (prev && !confirm(`Replace the current "${prev.name}"?`)) return;
        const t = createTournament({
          name: state.name,
          playerNames: state.playerNames,
          format: state.format,
          scoring: SCORING_PRESETS[state.scoringKey],
          timeBudgetMin: state.timeBudgetMin,
          matchCapMin: state.matchCapMin,
        });
        saveActive(t);
        navigate("#/play");
      },
    },
      h("label", {}, "Tournament name", nameInput),
      h("label", {}, "Number of players (2–8)", countInput),
      playerFields,
      h("label", {}, "Scoring", scoringSelect),
      h("div", { class: "grid" },
        h("label", {}, "Time budget (min)", budgetInput),
        h("label", {}, "Match cap (min)", capInput),
      ),
      h("fieldset", {},
        h("legend", {}, "Format"),
        formatTable,
      ),
      h("div", { class: "row" },
        startBtn,
        h("a", { href: "#/", role: "button", class: "secondary" }, "Cancel"),
      ),
    );

    container.appendChild(form);
  }
}

export function renderPlay(root) {
  const t = loadActive();
  if (!t) { navigate("#/"); return; }
  if (t.status === "complete") { navigate("#/done"); return; }

  const round = t.rounds[t.rounds.length - 1];
  const roundIdx = t.rounds.length - 1;
  const totalRounds = FORMATS[t.format].estimateRounds(t.players.length);
  const header = h("header", {},
    h("strong", {}, t.name),
    h("p", {}, `${FORMATS[t.format].label} · Round ${roundIdx + 1} / ${totalRounds}`),
  );

  let standingsSection = renderStandings(t);
  const submitBtn = h("button", {
    disabled: !currentRoundComplete(t),
    onclick: () => {
      const next = advanceRound(loadActive());
      saveActive(next);
      if (next.status === "complete") navigate("#/done");
      else navigate("#/play");
    },
  }, "Submit round → next pairings");

  const onResultChanged = () => {
    const latest = loadActive();
    submitBtn.disabled = !currentRoundComplete(latest);
    const newStandings = renderStandings(latest);
    standingsSection.replaceWith(newStandings);
    standingsSection = newStandings;
  };

  const pairingsGrid = h("section", { class: "pairings" });
  for (const m of round) {
    pairingsGrid.appendChild(renderPairing(t, roundIdx, m, onResultChanged));
  }

  const controls = h("div", { class: "row" },
    submitBtn,
    h("a", { href: "#/", role: "button", class: "secondary" }, "Home"),
  );

  mount(root,
    h("article", {}, header),
    pairingsGrid,
    h("hr"),
    standingsSection,
    controls,
  );
}

function renderPairing(t, roundIdx, m, onResultChanged) {
  const card = h("article", { class: "pairing" });
  const isBye = m.p1 === BYE || m.p2 === BYE;
  const realPlayer = m.p1 === BYE ? m.p2 : m.p1;
  const participants = roundParticipants(t.rounds[roundIdx]);

  const bracketLabel = m.bracket === "winners" ? "Winners" :
    m.bracket === "losers" ? "Losers" :
    m.bracket === "final" ? "Final" : "";

  card.appendChild(h("header", {},
    h("span", {}, isBye ? "Bye" : "Match"),
    bracketLabel ? h("small", {}, bracketLabel) : null,
  ));

  function makeSlotSelect(slot, currentId) {
    return h("select", {
      class: "player-select",
      onchange: (e) => {
        const updated = swapPlayer(loadActive(), roundIdx, m.id, slot, e.target.value);
        saveActive(updated);
        navigate("#/play");
      },
    },
      ...participants.map((pid) =>
        h("option", { value: pid, selected: currentId === pid }, playerName(t, pid))
      ),
    );
  }

  if (isBye) {
    const realSlot = m.p1 === BYE ? "p2" : "p1";
    card.appendChild(h("div", {}, makeSlotSelect(realSlot, realPlayer)));
    card.appendChild(h("p", {}, "Advances (bye)."));
    return card;
  }

  card.appendChild(h("div", {}, makeSlotSelect("p1", m.p1)));
  card.appendChild(h("div", { class: "vs" }, "vs"));
  card.appendChild(h("div", {}, makeSlotSelect("p2", m.p2)));

  const timerEl = h("div", { class: "timer" }, formatDuration(t.matchCapMin * 60 * 1000));
  const timer = createMatchTimer(
    t.matchCapMin * 60 * 1000,
    (ms) => { timerEl.textContent = formatDuration(ms); },
    () => { timerEl.classList.add("expired"); },
  );
  activeTimers.set(m.id, timer);

  card.appendChild(timerEl);
  card.appendChild(h("div", { class: "timer-controls" },
    h("button", { class: "secondary", onclick: () => timer.start() }, "Start"),
    h("button", { class: "secondary", onclick: () => timer.pause() }, "Pause"),
    h("button", { class: "secondary outline", onclick: () => { timer.reset(); timerEl.classList.remove("expired"); } }, "Reset"),
  ));

  const drawsAllowed = t.scoring.draw !== null;
  const resultSelect = h("select", {
    onchange: (e) => {
      const updated = recordResult(loadActive(), roundIdx, m.id, e.target.value || null);
      saveActive(updated);
      m.result = e.target.value || null;
      onResultChanged();
    },
  },
    h("option", { value: "", selected: m.result === null }, "— pick result —"),
    h("option", { value: "p1", selected: m.result === "p1" }, `${playerName(t, m.p1)} wins`),
    h("option", { value: "p2", selected: m.result === "p2" }, `${playerName(t, m.p2)} wins`),
    drawsAllowed
      ? h("option", { value: "draw", selected: m.result === "draw" }, "Draw")
      : null,
  );
  card.appendChild(h("label", {}, "Result", resultSelect));
  return card;
}

function renderStandings(t) {
  const rows = computeStandings(t);
  return h("section", {},
    h("h3", {}, "Standings"),
    h("table", {},
      h("thead", {},
        h("tr", {},
          h("th", {}, "#"),
          h("th", {}, "Player"),
          h("th", {}, "Points"),
          h("th", {}, "W"),
          h("th", {}, "D"),
          h("th", {}, "L"),
          h("th", {}, "OMW%"),
        )
      ),
      h("tbody", {},
        ...rows.map((r, i) =>
          h("tr", {},
            h("td", {}, String(i + 1)),
            h("td", {}, r.name),
            h("td", {}, String(r.points)),
            h("td", {}, String(r.w)),
            h("td", {}, String(r.d)),
            h("td", {}, String(r.l)),
            h("td", {}, `${(r.omwPct * 100).toFixed(0)}%`),
          )
        )
      ),
    )
  );
}

export function renderDone(root) {
  const t = loadActive();
  if (!t) { navigate("#/"); return; }
  if (t.status !== "complete") { navigate("#/play"); return; }

  const champId = championId(t);
  const champ = champId ? playerName(t, champId) : "Unknown";

  mount(root,
    h("section", { class: "winner-banner" },
      h("p", {}, "Champion"),
      h("h2", {}, champ),
      h("p", {}, t.name),
    ),
    renderStandings(t),
    h("div", { class: "row" },
      h("button", { onclick: () => exportJSON(t) }, "Export JSON"),
      h("a", { href: "#/", role: "button", class: "secondary" }, "Home"),
      h("button", {
        class: "contrast outline",
        onclick: () => {
          if (confirm("Discard this tournament and start a new one?")) {
            clearActive();
            navigate("#/new");
          }
        },
      }, "Start new tournament"),
    ),
  );
}
