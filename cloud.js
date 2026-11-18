// Family cloud sync (Firebase: Google sign-in + Firestore).
//
// The app keeps working from browser storage exactly as before; this module
// mirrors that storage to the family's private Firestore database and back.
//   families/{fid}                       name, owner, members {uid: {...}}, code
//   families/{fid}/meta/header           custom header photo
//   families/{fid}/profiles/{id}         name, photo, goals, at, deleted
//   families/{fid}/profiles/{id}/days/{YYYY-MM-DD}   one diary day, at, sat
//   invites/{CODE}                       familyId (lets someone join by code)
//   users/{uid}                          familyId (which family a login is in)
// Conflicts: the most recent edit ("at", device time) wins, per profile and
// per day. "sat" (server time) lets each device fetch only what changed.
// Security: firestore.rules lets only family members read or write family data.

const SYNC_KEY = "my-health-family-sync-v1";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SDK = "./vendor/firebase-13.4.0.js";

let fb, auth, db;
let user = null; // Firebase user
let fam = null; // { id, name, owner, members, code }
let meta = {}; // { uid, familyId, profiles: {id: at}, seen: {id: ms}, headerAt, pending }
let unsubs = [];
const dayUnsubs = new Map();
const mergeOnFirstLoad = new Set();
let phase = "off"; // off | loading | signedout | nofamily | ready | error
let lastError = "";
let flushTimer = null;
let flushing = false;

const readJSON = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const loadMeta = () => {
  const m = readJSON(SYNC_KEY) || {};
  m.profiles ||= {};
  m.seen ||= {};
  m.pending ||= { profiles: [], days: [], deleted: [], header: false };
  return m;
};
const saveMeta = () => {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
  } catch {}
};
const html = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmtCode = (c) => (c ? c.slice(0, 4) + "-" + c.slice(4) : "");
function newCode() {
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return [...a].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}
const profileRef = (id) => fb.doc(db, "families", fam.id, "profiles", id);
const dayRef = (id, d) =>
  fb.doc(db, "families", fam.id, "profiles", id, "days", d);

// ---------- status ----------
function setPhase(p, err = "") {
  const changed = p !== phase;
  phase = p;
  lastError = err;
  updatePill();
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
    document.activeElement?.tagName,
  );
  // On the family page, redraw it all so its wording matches the sync state.
  if (
    changed &&
    (p === "ready" || p === "signedout") &&
    document.getElementById("newUser") &&
    !typing &&
    typeof chooseUser === "function"
  )
    chooseUser();
  else refreshBox();
}
function pendingCount() {
  const q = meta.pending || {};
  return (
    (q.profiles?.length || 0) +
    (q.days?.length || 0) +
    (q.deleted?.length || 0) +
    (q.header ? 1 : 0)
  );
}
function updatePill() {
  const pill = document.getElementById("syncPill");
  if (!pill) return;
  const text =
    phase === "ready"
      ? !navigator.onLine
        ? "● Offline · will sync"
        : pendingCount() || flushing
          ? "● Saving to cloud…"
          : "● Synced to family cloud"
      : phase === "error"
        ? "● Sync problem"
        : phase === "loading"
          ? "● Connecting…"
          : "● Browser storage only";
  pill.textContent = text;
  pill.classList.toggle("pill-ok", phase === "ready");
  pill.classList.toggle(
    "pill-warn",
    phase === "error" || phase === "signedout" || phase === "nofamily",
  );
}
addEventListener("online", () => {
  updatePill();
  scheduleFlush(0);
});
addEventListener("offline", updatePill);

// ---------- family box on the family page ----------
let boxEl = null;
function refreshBox() {
  const el = document.getElementById("cloudBox");
  if (el) renderBox(el);
}
function renderBox(el) {
  boxEl = el;
  if (!el) return;
  if (phase === "off") {
    el.innerHTML = "";
    return;
  }
  const err = lastError ? `<p class="cloud-error">${html(lastError)}</p>` : "";
  if (phase === "loading") {
    // Same shape as the card that follows, so the page doesn't jump.
    el.innerHTML = meta.familyId
      ? `<section class="card cloud-box cloud-ready"><div class="cloud-head"><div><span class="eyebrow">☁ Family cloud</span><h2>Connecting…</h2><p class="tiny">Loading your family’s latest records.</p></div><div class="cloud-code"><span class="tiny">Family code to invite others</span><b>····-····</b><div><button type="button" class="secondary small" disabled>Copy code</button></div></div></div><p class="tiny">Profiles, pictures, diaries and the header photo are saved to your family’s private cloud.</p></section>`
      : `<section class="card cloud-box cloud-cta"><div><h2>Keep your family’s data safe</h2><p class="tiny">Sign in with Google to save profiles, pictures and diaries in your family’s private cloud and see them on every phone and computer. Without signing in, records stay only in this browser.</p></div><button type="button" disabled>Connecting…</button></section>`;
    return;
  }
  if (phase === "signedout" || (phase === "error" && !user)) {
    el.innerHTML = `<section class="card cloud-box cloud-cta"><div><h2>Keep your family’s data safe</h2><p class="tiny">Sign in with Google to save profiles, pictures and diaries in your family’s private cloud and see them on every phone and computer. Without signing in, records stay only in this browser.</p>${err}</div><button type="button" id="cloudSignIn">Sign in with Google</button></section>`;
    el.querySelector("#cloudSignIn").onclick = signIn;
    return;
  }
  if (phase === "nofamily" || (phase === "error" && !fam)) {
    el.innerHTML = `<section class="card cloud-box"><h2>Set up your family group</h2><p class="tiny">Signed in as ${html(user?.email)}. Create a family group, or join one with the code a family member shared with you.</p>${err}<div class="cloud-actions"><form id="cloudCreate"><label>Family name<input id="cloudFamName" maxlength="40" required value="${html((user?.displayName || "").split(" ")[0] + " family")}"></label><button type="submit">Create family group</button></form><form id="cloudJoin"><label>Family code<input id="cloudCode" maxlength="9" required placeholder="ABCD-2345" autocomplete="off" autocapitalize="characters"></label><button type="submit" class="secondary">Join family</button></form></div><button type="button" class="text" id="cloudSignOut">Sign out</button></section>`;
    el.querySelector("#cloudCreate").onsubmit = (e) => {
      e.preventDefault();
      createFamily(el.querySelector("#cloudFamName").value);
    };
    el.querySelector("#cloudJoin").onsubmit = (e) => {
      e.preventDefault();
      joinFamily(el.querySelector("#cloudCode").value);
    };
    el.querySelector("#cloudSignOut").onclick = signOutFlow;
    return;
  }
  // ready (or an error while in a family)
  const members = Object.entries(fam?.members || {});
  const isOwner = fam?.owner === user?.uid;
  el.innerHTML = `<section class="card cloud-box cloud-ready"><div class="cloud-head"><div><span class="eyebrow">☁ Family cloud</span><h2>${html(fam?.name || "Your family")}</h2><p class="tiny">Signed in as ${html(user?.email)} · ${members.length} ${members.length === 1 ? "member" : "members"}: ${members.map(([, m]) => html(m.name || m.email)).join(", ")}</p></div><div class="cloud-code"><span class="tiny">Family code to invite others</span><b id="cloudCodeText">${html(fmtCode(fam?.code))}</b><div><button type="button" class="secondary small" id="cloudCopy">Copy code</button>${isOwner ? '<button type="button" class="text small" id="cloudNewCode">New code</button>' : ""}</div></div></div>${err}<p class="tiny">Profiles, pictures, diaries and the header photo are saved to your family’s private cloud. Only signed-in family members can see them. <button type="button" class="text" id="cloudSignOut">Sign out</button></p></section>`;
  el.querySelector("#cloudCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(fmtCode(fam.code));
      toast("Family code copied");
    } catch {
      prompt("Copy this family code:", fmtCode(fam.code));
    }
  };
  if (isOwner) el.querySelector("#cloudNewCode").onclick = regenerateCode;
  el.querySelector("#cloudSignOut").onclick = signOutFlow;
}

// ---------- start ----------
async function start() {
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey) return; // cloud sync not set up: browser-only mode
  meta = loadMeta();
  setPhase("loading");
  try {
    fb = window.FirebaseMock || (await import(SDK));
    const app = fb.initializeApp(config);
    auth = fb.getAuth(app);
    try {
      db = fb.initializeFirestore(app, {
        localCache: fb.persistentLocalCache({
          tabManager: fb.persistentMultipleTabManager(),
        }),
      });
    } catch {
      db = fb.initializeFirestore(app, {}); // e.g. private browsing: memory cache only
    }
  } catch (e) {
    console.error(e);
    setPhase(
      "error",
      "Could not load cloud sync. Records are still saved in this browser.",
    );
    return;
  }
  meta = loadMeta();
  window.Cloud = api;
  fb.onAuthStateChanged(auth, async (u) => {
    user = u;
    if (!u) {
      stopSync();
      fam = null;
      setPhase("signedout");
      return;
    }
    try {
      const ptr = await fb.getDoc(fb.doc(db, "users", u.uid));
      const fid = ptr.exists() ? ptr.data().familyId : null;
      if (!fid) {
        fam = null;
        setPhase("nofamily");
        return;
      }
      await attachFamily(fid);
    } catch (e) {
      console.error(e);
      setPhase("error", friendly(e));
    }
  });
}

function friendly(e) {
  const c = e?.code || "";
  if (c.includes("popup-closed") || c.includes("cancelled-popup"))
    return "Sign-in was cancelled.";
  if (c.includes("popup-blocked"))
    return "The sign-in window was blocked. Allow pop-ups for this site and try again.";
  if (c.includes("unauthorized-domain"))
    return "This website address is not yet allowed for sign-in in Firebase (Authentication → Settings → Authorized domains).";
  if (c.includes("permission-denied"))
    return "The family cloud refused this request. You may not be a member of this family.";
  if (c.includes("unavailable") || c.includes("network"))
    return "No connection to the family cloud right now. Changes are kept and will sync later.";
  return (
    "Something went wrong with cloud sync: " +
    (e?.message || c || "unknown error")
  );
}

// ---------- sign in / out ----------
async function signIn() {
  try {
    lastError = "";
    await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
  } catch (e) {
    setPhase(user ? phase : "signedout", friendly(e));
  }
}
async function signOutFlow() {
  const clear = confirm(
    "Sign out of the family cloud.\n\nAlso remove the family’s records from this browser? Choose OK on a shared or borrowed device (everything stays safe in the cloud). Choose Cancel to keep a copy here.",
  );
  if (clear) removeFamilyFromDevice();
  stopSync();
  meta = loadMeta();
  await fb.signOut(auth);
  if (typeof chooseUser === "function") chooseUser();
}
function removeFamilyFromDevice() {
  const synced = Object.keys(meta.profiles || {});
  try {
    const users = getUsers().filter((u) => !synced.includes(u.id));
    if (users.length) localStorage.setItem(usersKey, JSON.stringify(users));
    else localStorage.removeItem(usersKey);
    for (const id of synced) {
      localStorage.removeItem(dataKey(id));
      localStorage.removeItem(photoKey(id));
    }
    localStorage.removeItem(headerKey);
    localStorage.removeItem(SYNC_KEY);
  } catch {}
}

// ---------- create / join ----------
async function createFamily(name) {
  name =
    String(name || "")
      .trim()
      .slice(0, 40) || "Our family";
  try {
    const famRef = fb.doc(fb.collection(db, "families"));
    const code = newCode();
    const b = fb.writeBatch(db);
    b.set(famRef, {
      name,
      owner: user.uid,
      code,
      members: { [user.uid]: memberInfo() },
      createdAt: fb.serverTimestamp(),
    });
    b.set(fb.doc(db, "invites", code), {
      familyId: famRef.id,
      createdBy: user.uid,
      createdAt: fb.serverTimestamp(),
    });
    b.set(fb.doc(db, "users", user.uid), { familyId: famRef.id });
    await b.commit();
    await attachFamily(famRef.id);
    toast("Family group created");
  } catch (e) {
    console.error(e);
    setPhase("nofamily", friendly(e));
  }
}
async function joinFamily(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) {
    setPhase(
      "nofamily",
      "A family code has 8 letters and numbers, like ABCD-2345.",
    );
    return;
  }
  try {
    const inv = await fb.getDoc(fb.doc(db, "invites", code));
    if (!inv.exists()) {
      setPhase(
        "nofamily",
        "That family code was not found. Check it with the family member who shared it.",
      );
      return;
    }
    const fid = inv.data().familyId;
    await fb.updateDoc(fb.doc(db, "families", fid), {
      [`members.${user.uid}`]: memberInfo(),
      lastJoin: code,
    });
    await fb.setDoc(fb.doc(db, "users", user.uid), { familyId: fid });
    await attachFamily(fid);
    toast("You joined the family");
  } catch (e) {
    console.error(e);
    setPhase("nofamily", friendly(e));
  }
}
function memberInfo() {
  return {
    name: user.displayName || "",
    email: user.email || "",
    joinedAt: Date.now(),
  };
}
async function regenerateCode() {
  if (
    !confirm(
      "Make a new family code? The old code will stop working for new members.",
    )
  )
    return;
  try {
    const code = newCode();
    const b = fb.writeBatch(db);
    b.set(fb.doc(db, "invites", code), {
      familyId: fam.id,
      createdBy: user.uid,
      createdAt: fb.serverTimestamp(),
    });
    if (fam.code) b.delete(fb.doc(db, "invites", fam.code));
    b.update(fb.doc(db, "families", fam.id), { code });
    await b.commit();
    toast("New family code ready");
  } catch (e) {
    setPhase("ready", friendly(e));
  }
}

// ---------- live sync: cloud → this device ----------
function stopSync() {
  for (const u of unsubs) u();
  unsubs = [];
  for (const u of dayUnsubs.values()) u();
  dayUnsubs.clear();
  mergeOnFirstLoad.clear();
}
async function attachFamily(fid) {
  stopSync();
  if (meta.familyId && meta.familyId !== fid) {
    // This device last synced a different family: drop that family's cached copy.
    removeFamilyFromDevice();
    meta = loadMeta();
  }
  meta.familyId = fid;
  meta.uid = user.uid;
  saveMeta();
  fam = { id: fid };
  let firstProfiles = true;
  unsubs.push(
    fb.onSnapshot(
      fb.doc(db, "families", fid),
      (s) => {
        if (!s.exists()) return;
        fam = { id: fid, ...s.data() };
        if (phase !== "ready" || lastError) setPhase("ready");
        else refreshBox();
      },
      (e) => setPhase("error", friendly(e)),
    ),
    fb.onSnapshot(
      fb.doc(db, "families", fid, "meta", "header"),
      (s) => {
        const h = s.exists() ? s.data() : null;
        if (!h || !(h.at > (meta.headerAt || 0))) return;
        try {
          if (h.image) localStorage.setItem(headerKey, h.image);
          else localStorage.removeItem(headerKey);
        } catch {}
        meta.headerAt = h.at;
        saveMeta();
        if (typeof applyHeader === "function") applyHeader();
      },
      () => {},
    ),
    fb.onSnapshot(
      fb.collection(db, "families", fid, "profiles"),
      (snap) => {
        const changed = [];
        const remote = new Map();
        for (const d of snap.docs) remote.set(d.id, d.data());
        for (const ch of snap.docChanges()) {
          if (ch.type === "removed") continue;
          const p = ch.doc.data();
          if (applyProfile(ch.doc.id, p)) changed.push(ch.doc.id);
          if (p.deleted) unwatchDays(ch.doc.id);
          else watchDays(ch.doc.id);
        }
        if (firstProfiles && !snap.metadata.fromCache) {
          firstProfiles = false;
          adoptLocalProfiles(remote);
          scheduleFlush(0);
        }
        if (changed.length) notifyApp(changed);
      },
      (e) => setPhase("error", friendly(e)),
    ),
  );
}
function notifyApp(ids) {
  if (typeof onCloudData === "function") onCloudData(ids);
  updatePill();
}
function localUser(id) {
  try {
    return getUsers().find((u) => u.id === id);
  } catch {
    return null;
  }
}
function applyProfile(id, p) {
  const localAt = meta.profiles[id] || 0;
  if (p.deleted) {
    if (p.at < localAt || !localUser(id)) {
      if (!localUser(id) && meta.profiles[id]) {
        delete meta.profiles[id];
        saveMeta();
      }
      return false;
    }
    try {
      localStorage.setItem(
        usersKey,
        JSON.stringify(getUsers().filter((u) => u.id !== id)),
      );
      localStorage.removeItem(dataKey(id));
      localStorage.removeItem(photoKey(id));
    } catch {}
    delete meta.profiles[id];
    delete meta.seen[id];
    saveMeta();
    return true;
  }
  if (!(p.at > localAt)) return false;
  try {
    const users = getUsers();
    const i = users.findIndex((u) => u.id === id);
    const entry = { id, name: String(p.name || id) };
    if (i >= 0) users[i] = { ...users[i], ...entry };
    else users.push(entry);
    localStorage.setItem(usersKey, JSON.stringify(users));
    if (validImage(p.photo)) localStorage.setItem(photoKey(id), p.photo);
    else localStorage.removeItem(photoKey(id));
    const data = readJSON(dataKey(id)) || emptyState();
    data.profile = { ...emptyState().profile, ...(p.profile || {}) };
    localStorage.setItem(dataKey(id), JSON.stringify(data));
  } catch {
    return false;
  }
  meta.profiles[id] = p.at;
  saveMeta();
  return true;
}
function watchDays(id) {
  if (dayUnsubs.has(id)) return;
  const since = meta.seen[id] || 0;
  const q = fb.query(
    fb.collection(db, "families", fam.id, "profiles", id, "days"),
    fb.where("sat", ">", fb.Timestamp.fromMillis(since)),
  );
  dayUnsubs.set(
    id,
    fb.onSnapshot(
      q,
      (snap) => {
        let changed = false;
        let maxSat = meta.seen[id] || 0;
        const remote = new Map();
        for (const d of snap.docs)
          remote.set(d.id, d.data({ serverTimestamps: "estimate" }));
        for (const ch of snap.docChanges()) {
          if (ch.type === "removed") continue;
          const d = ch.doc.data({ serverTimestamps: "estimate" });
          if (!ch.doc.metadata.hasPendingWrites && d.sat?.toMillis)
            maxSat = Math.max(maxSat, d.sat.toMillis());
          if (applyDay(id, ch.doc.id, d)) changed = true;
        }
        if (maxSat !== (meta.seen[id] || 0)) {
          meta.seen[id] = maxSat;
          saveMeta();
        }
        if (mergeOnFirstLoad.has(id) && !snap.metadata.fromCache) {
          mergeOnFirstLoad.delete(id);
          queueNewerLocalDays(id, remote);
        }
        if (changed) notifyApp([id]);
      },
      () => {},
    ),
  );
}
function unwatchDays(id) {
  dayUnsubs.get(id)?.();
  dayUnsubs.delete(id);
}
function applyDay(id, date, d) {
  if (!localUser(id)) return false;
  const data = readJSON(dataKey(id)) || emptyState();
  const local = data.days?.[date];
  if (local && (local.at || 0) >= (d.at || 0)) return false;
  const { sat, ...day } = d;
  const clean = normalizeBackup({
    version: 1,
    profile: {},
    days: { [date]: day },
  })?.days?.[date];
  if (!clean) return false;
  data.days = { ...(data.days || {}), [date]: clean };
  try {
    localStorage.setItem(dataKey(id), JSON.stringify(data));
  } catch {
    return false;
  }
  return true;
}

// Profiles that exist on this device but have never been synced (made before
// signing in) are offered to the family. A profile with the same user ID in
// the family is merged day by day, keeping whichever day was edited last.
function adoptLocalProfiles(remote) {
  let local;
  try {
    local = getUsers().filter((u) => !(u.id in meta.profiles));
  } catch {
    return;
  }
  const remoteLive = (id) => remote.has(id) && !remote.get(id).deleted;
  if (!local.length) return;
  const names = local.map((u) => `${u.name} (@${u.id})`).join(", ");
  const ok = confirm(
    `This browser has ${local.length} profile${local.length === 1 ? "" : "s"} that ${local.length === 1 ? "is" : "are"} not in your family cloud yet:\n${names}\n\nAdd ${local.length === 1 ? "it" : "them"} to the family so ${local.length === 1 ? "it is" : "they are"} saved and synced?`,
  );
  if (!ok) return;
  for (const u of local) {
    if (remoteLive(u.id)) {
      // Same user ID already in the family: keep the family's name, picture
      // and goals, and merge diary days once they have loaded.
      meta.profiles[u.id] = 0;
      applyProfile(u.id, remote.get(u.id));
      mergeOnFirstLoad.add(u.id);
      watchDays(u.id);
    } else {
      meta.profiles[u.id] = Date.now();
      queue("profiles", u.id);
      queueAllDays(u.id);
      watchDays(u.id);
    }
  }
  saveMeta();
  notifyApp(local.map((u) => u.id));
}
function queueNewerLocalDays(id, remote) {
  const data = readJSON(dataKey(id));
  for (const [date, day] of Object.entries(data?.days || {})) {
    const r = remote.get(date);
    if (!r || (day.at || 0) > (r.at || 0)) queue("days", id + "|" + date);
  }
  scheduleFlush();
}
function queueAllDays(id) {
  const data = readJSON(dataKey(id));
  for (const date of Object.keys(data?.days || {}))
    queue("days", id + "|" + date);
}

// ---------- this device → cloud ----------
function queue(kind, value) {
  const list = meta.pending[kind];
  if (!list.includes(value)) list.push(value);
}
function scheduleFlush(ms = 700) {
  saveMeta();
  updatePill();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, ms);
}
async function flush() {
  flushTimer = null;
  if (!fam?.id || !user || phase !== "ready" || flushing) return;
  const q = meta.pending;
  if (!pendingCount()) return updatePill();
  flushing = true;
  let failed = false;
  updatePill();
  const take = {
    profiles: [...q.profiles],
    days: [...q.days],
    deleted: [...q.deleted],
    header: q.header,
  };
  try {
    for (const id of take.deleted) await deleteRemoteProfile(id);
    let b = fb.writeBatch(db),
      n = 0;
    const add = async (fn) => {
      fn(b);
      if (++n >= 400) {
        await b.commit();
        b = fb.writeBatch(db);
        n = 0;
      }
    };
    for (const id of take.profiles) {
      const u = localUser(id);
      if (!u) continue;
      const data = readJSON(dataKey(id)) || emptyState();
      await add((bb) =>
        bb.set(profileRef(id), {
          name: u.name,
          photo: getPhoto(id) || null,
          profile: data.profile || emptyState().profile,
          at: meta.profiles[id] || Date.now(),
          by: user.uid,
          deleted: false,
        }),
      );
    }
    for (const key of take.days) {
      const [id, date] = key.split("|");
      const day = readJSON(dataKey(id))?.days?.[date];
      if (!day || !localUser(id)) continue;
      await add((bb) =>
        bb.set(dayRef(id, date), {
          ...day,
          at: day.at || Date.now(),
          sat: fb.serverTimestamp(),
        }),
      );
    }
    if (take.header) {
      let image = null;
      try {
        image = localStorage.getItem(headerKey);
      } catch {}
      await add((bb) =>
        bb.set(fb.doc(db, "families", fam.id, "meta", "header"), {
          image: validImage(image) ? image : null,
          at: meta.headerAt || Date.now(),
        }),
      );
    }
    if (n) await b.commit();
    // Done: remove what was sent (new changes made meanwhile stay queued).
    q.profiles = q.profiles.filter((x) => !take.profiles.includes(x));
    q.days = q.days.filter((x) => !take.days.includes(x));
    q.deleted = q.deleted.filter((x) => !take.deleted.includes(x));
    if (take.header) q.header = false;
    if (lastError) lastError = "";
  } catch (e) {
    console.error(e);
    failed = true;
    lastError = friendly(e);
    refreshBox();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 15000); // retry later
  } finally {
    flushing = false;
    saveMeta();
    updatePill();
    if (!failed && pendingCount()) scheduleFlush(); // changes made while sending
  }
}
async function deleteRemoteProfile(id) {
  const days = await fb.getDocs(
    fb.collection(db, "families", fam.id, "profiles", id, "days"),
  );
  let b = fb.writeBatch(db),
    n = 0;
  for (const d of days.docs) {
    b.delete(d.ref);
    if (++n >= 400) {
      await b.commit();
      b = fb.writeBatch(db);
      n = 0;
    }
  }
  b.set(profileRef(id), {
    deleted: true,
    at: Date.now(),
    by: user.uid,
    name: null,
    photo: null,
    profile: null,
  });
  await b.commit();
}

// ---------- hooks called by app.js ----------
const synced = () => phase === "ready" && !!fam?.id;
const api = {
  inFamily: synced,
  renderBox,
  profileChanged(id) {
    if (!meta.familyId) return;
    meta.profiles[id] = Date.now();
    queue("profiles", id);
    scheduleFlush();
  },
  dayChanged(id, date) {
    if (!meta.familyId || !(id in meta.profiles)) return;
    queue("days", id + "|" + date);
    scheduleFlush();
  },
  allDaysChanged(id) {
    if (!meta.familyId || !(id in meta.profiles)) return;
    queueAllDays(id);
    scheduleFlush();
  },
  profileDeleted(id) {
    if (!meta.familyId || !(id in meta.profiles)) return;
    delete meta.profiles[id];
    delete meta.seen[id];
    unwatchDays(id);
    const q = meta.pending;
    q.profiles = q.profiles.filter((x) => x !== id);
    q.days = q.days.filter((x) => !x.startsWith(id + "|"));
    queue("deleted", id);
    scheduleFlush(0);
  },
  headerChanged() {
    if (!meta.familyId) return;
    meta.headerAt = Date.now();
    meta.pending.header = true;
    scheduleFlush();
  },
};

start();
