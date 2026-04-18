const KEY = "tcg.activeTournament";
const VERSION = 1;

export function loadActive() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    return validate(t) ? t : null;
  } catch {
    return null;
  }
}

export function saveActive(t) {
  localStorage.setItem(KEY, JSON.stringify(t));
}

export function clearActive() {
  localStorage.removeItem(KEY);
}

export function exportJSON(t) {
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (t.name || "tournament").replace(/[^a-z0-9-_]+/gi, "-");
  a.download = `${safe}-${t.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      try {
        const t = JSON.parse(reader.result);
        if (!validate(t)) throw new Error("Invalid tournament file");
        resolve(t);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}

function validate(t) {
  return (
    t &&
    t.version === VERSION &&
    typeof t.id === "string" &&
    typeof t.format === "string" &&
    Array.isArray(t.players) &&
    Array.isArray(t.rounds) &&
    typeof t.status === "string"
  );
}
