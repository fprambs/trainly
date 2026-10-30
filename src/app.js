// Trainly: arma la app instalando cada parte (pantallas y servicios) sobre un objeto compartido `app`.
// Cada módulo de src/app/ lee y escribe el estado común como app.entries, app.rest, etc.
// El orden importa: es el mismo orden en que se ejecutaba antes el código.
import { install as installCore } from "./app/core.js";
import { install as installStore } from "./app/store.js";
import { install as installAddExercise } from "./app/add-exercise.js";
import { install as installTodayList } from "./app/today-list.js";
import { install as installSets } from "./app/sets.js";
import { install as installFeedback } from "./app/feedback.js";
import { install as installRest } from "./app/rest.js";
import { install as installTodayCards } from "./app/today-cards.js";
import { install as installDetail } from "./app/detail.js";
import { install as installFocus } from "./app/focus.js";
import { install as installDays } from "./app/days.js";
import { install as installSummary } from "./app/summary.js";
import { install as installRoutines } from "./app/routines.js";
import { install as installHistory } from "./app/history.js";
import { install as installProgress } from "./app/progress.js";
import { install as installCatalog } from "./app/catalog.js";
import { install as installExtras } from "./app/extras.js";

export function startApp(env) {
  const app = { env, $: id => document.getElementById(id) };
  installCore(app);
  installStore(app);
  installAddExercise(app);
  installTodayList(app);
  installSets(app);
  installFeedback(app);
  installRest(app);
  installTodayCards(app);
  installDetail(app);
  installFocus(app);
  installDays(app);
  installSummary(app);
  installRoutines(app);
  installHistory(app);
  installProgress(app);
  installCatalog(app);
  installExtras(app);
  app.init().then(() => {
    if (app.shortcutAct) setTimeout(() => app.runShortcut(app.shortcutAct), 80);
  });
}
