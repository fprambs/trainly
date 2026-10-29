// Supabase simulado en memoria SOLO para probar la interfaz localmente (VITE_MOCK=1).
// Imita lo que usa la app: auth, from().select/insert/update/upsert/delete con filtros, rpc, storage y realtime.
const DB = JSON.parse(localStorage.getItem("mockdb") || "null") || { users: [], profiles: [], athletes: [], coach_athletes: [], entries: [], routines: [], exercises: [], ai_cache: [] };
if (!DB.bank_exercises) DB.bank_exercises = [
  ["peso_muerto","Peso muerto","piernas"],["vuelo_lateral","Vuelo lateral","hombros"],["press_inclinado_con_mancuernas","Press inclinado con mancuernas","pecho"],
  ["extension_de_cuadriceps","Extensión de cuádriceps","piernas"],["curl_de_biceps_en_maquina","Curl de bíceps en máquina","brazos"],["crunch_con_pesa_rusa","Crunch con pesa rusa","core"],
  ["air_runner","Air runner","cardio"],["remo_ergometro","Remo Ergometro","cardio"],["remo_en_t","Remo en T","espalda"],["pull_ups","Pull ups","espalda"],["hip_thrust_en_maquina","Hip Thrust en Maquina","gluteos"]
].map(([key,name,category]) => ({ key, name, category, image_url: "/media/" + key + ".mp4", image_type: "video/mp4" }));
const save = () => localStorage.setItem("mockdb", JSON.stringify(DB));
const uid4 = () => crypto.randomUUID();
const code = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
let session = JSON.parse(localStorage.getItem("mocksession") || "null");
const listeners = [];
const rtSubs = [];
const me = () => session && session.user.id;

function canSee(aid) {
  const a = DB.athletes.find(x => x.id === aid); if (!a) return false;
  return a.user_id === me() || DB.coach_athletes.some(c => c.athlete_id === aid && c.coach_id === me());
}
function visible(table, r) {
  if (table === "athletes") return canSee(r.id);
  if (table === "entries") return canSee(r.athlete_id);
  if (table === "coach_athletes") return r.coach_id === me() || canSee(r.athlete_id);
  return true;
}
function emit(table, eventType, row, old) { rtSubs.forEach(s => { if (s.table === table && visible(table, row || old)) s.cb({ eventType, new: row || {}, old: old || {} }); }); }

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; this.single = 0; }
  select(cols) { if (this.op === "select") this.cols = cols; return this; }
  eq(k, v) { this.f.push(r => r[k] === v); return this; }
  in(k, vs) { this.f.push(r => vs.includes(r[k])); return this; }
  gte(k, v) { this.f.push(r => r[k] >= v); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = 1; return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  upsert(row, o) { this.op = "upsert"; this.row = row; this.oc = (o && o.onConflict || "id").split(","); return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const T = DB[this.t]; const rows = () => T.filter(r => visible(this.t, r) && this.f.every(f => f(r)));
    if (this.op === "select") {
      let out = rows().map(r => Object.assign({}, r));
      if (this.t === "coach_athletes" && this.cols && this.cols.includes("athletes(")) out = out.map(r => Object.assign(r, { athletes: Object.assign({}, DB.athletes.find(a => a.id === r.athlete_id)) }));
      return { data: this.single ? (out[0] || null) : out, error: null };
    }
    if (this.op === "insert") { const rs = [].concat(this.row); rs.forEach(r => { const n = Object.assign({ id: uid4(), created_at: new Date().toISOString() }, r); T.push(n); emit(this.t, "INSERT", n); }); save(); return { error: null }; }
    if (this.op === "upsert") { const r = this.row; const ex = T.find(x => this.oc.every(k => x[k] === r[k])); if (ex) { Object.assign(ex, r); emit(this.t, "UPDATE", ex); } else { const n = Object.assign({ id: uid4(), created_at: new Date().toISOString() }, r); T.push(n); emit(this.t, "INSERT", n); } save(); return { error: null }; }
    if (this.op === "update") { rows().forEach(r => { Object.assign(r, this.patch); emit(this.t, "UPDATE", r); }); save(); return { error: null }; }
    if (this.op === "delete") { rows().forEach(r => { T.splice(T.indexOf(r), 1); emit(this.t, "DELETE", null, r); }); save(); return { error: null }; }
  }
}
const RPC = {
  ensure_my_athlete() { let a = DB.athletes.find(x => x.user_id === me()); if (!a) { a = { id: uid4(), user_id: me(), name: (DB.profiles.find(p => p.id === me()) || {}).name || "Yo", invite_code: code(), rest_cfg: { def: 90, by: {} } }; DB.athletes.push(a); save(); } return a.id; },
  create_athlete({ p_name }) { const a = { id: uid4(), user_id: null, name: p_name, created_by: me(), invite_code: code(), rest_cfg: { def: 90, by: {} } }; DB.athletes.push(a); DB.coach_athletes.push({ coach_id: me(), athlete_id: a.id }); save(); emit("coach_athletes", "INSERT", { coach_id: me(), athlete_id: a.id }); return a.id; },
  link_with_code({ code: c }) {
    c = c.toUpperCase().trim(); const mine = DB.athletes.find(x => x.user_id === me());
    const coach = DB.profiles.find(p => p.coach_code === c);
    if (coach) { if (!DB.coach_athletes.some(x => x.coach_id === coach.id && x.athlete_id === mine.id)) DB.coach_athletes.push({ coach_id: coach.id, athlete_id: mine.id }); save(); return "Vinculado con " + coach.name; }
    const inv = DB.athletes.find(a => a.invite_code === c); if (!inv) throw new Error("Código no válido");
    DB.entries.filter(e => e.athlete_id === inv.id).forEach(e => e.athlete_id = mine.id);
    DB.coach_athletes.filter(x => x.athlete_id === inv.id).forEach(x => x.athlete_id = mine.id);
    DB.athletes.splice(DB.athletes.indexOf(inv), 1); save(); return "Listo: tu historial quedó unido";
  },
  unlink({ p_coach, p_athlete }) { DB.coach_athletes = DB.coach_athletes.filter(x => !(x.coach_id === p_coach && x.athlete_id === p_athlete)); const a = DB.athletes.find(x => x.id === p_athlete); if (a && !a.user_id && !DB.coach_athletes.some(x => x.athlete_id === a.id)) DB.athletes.splice(DB.athletes.indexOf(a), 1); save(); },
  new_invite_code({ p_athlete }) { const a = DB.athletes.find(x => x.id === p_athlete); a.invite_code = code(); save(); return a.invite_code; },
  become_coach() { const p = DB.profiles.find(x => x.id === me()); p.role = "coach"; p.coach_code = p.coach_code || code(); save(); return p.coach_code; }
};
function signupUser(email, password, meta) {
  const u = { id: uid4(), email, password }; DB.users.push(u);
  DB.profiles.push({ id: u.id, name: meta.name || email.split("@")[0], role: meta.role || "athlete", coach_code: meta.role === "coach" ? code() : null });
  DB.athletes.push({ id: uid4(), user_id: u.id, name: meta.name || email, created_by: u.id, invite_code: code(), rest_cfg: { def: 90, by: {} } });
  save(); return u;
}
function setSession(u) { session = u ? { access_token: "mock", user: { id: u.id, email: u.email } } : null; localStorage.setItem("mocksession", JSON.stringify(session)); listeners.forEach(cb => cb(u ? "SIGNED_IN" : "SIGNED_OUT", session)); }

export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: cb => { listeners.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email, password }) => { const u = DB.users.find(x => x.email === email && x.password === password); if (!u) return { error: { message: "Invalid login credentials" } }; setSession(u); return { data: { session }, error: null }; },
      signUp: async ({ email, password, options }) => { if (DB.users.some(x => x.email === email)) return { error: { message: "User already registered" } }; const u = signupUser(email, password, (options && options.data) || {}); setSession(u); return { data: { session }, error: null }; },
      signOut: async () => { setSession(null); return {}; },
      resetPasswordForEmail: async () => ({}), updateUser: async () => ({})
    },
    from: t => new Q(t),
    rpc: async (fn, args) => { try { return { data: RPC[fn](args || {}), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: p => ({ data: { publicUrl: "/icons/icon-512.png?" + p } }), remove: async () => ({}) }) },
    channel: () => { const ch = { on: (_, o, cb) => { rtSubs.push({ table: o.table, cb }); return ch; }, subscribe: () => ch }; return ch; }
  };
}
