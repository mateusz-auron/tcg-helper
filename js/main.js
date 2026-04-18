import { renderHome, renderNew, renderPlay, renderDone } from "./ui.js";

const app = document.getElementById("app");

function route() {
  const hash = location.hash || "#/";
  if (hash === "#/" || hash === "") renderHome(app);
  else if (hash === "#/new") renderNew(app);
  else if (hash === "#/play") renderPlay(app);
  else if (hash === "#/done") renderDone(app);
  else { location.hash = "#/"; }
}

window.addEventListener("hashchange", route);
route();
