// Family Drive sync: saves every profile and diary to the family owner's
// Google Sheet through a small Google Apps Script (apps-script/Code.gs).
// Family members connect each device once with the family passcode; no
// Google sign-in is needed. The app keeps working from browser storage and
// this file copies changes to and from the Sheet every ~30 s and after edits.
// The latest edit wins, per profile and per day.
(() => {
  const URL_ = window.DRIVE_SYNC_URL;
  if (!URL_) return; // not set up: browser-only mode

  const META_KEY = "my-health-family-drive-sync-v1";
  const PASS_KEY = "my-health-family-drive-pass";
  const POLL_MS = 30000;
  const PHOTO_MAX = 45000; // fits one Sheet cell
  let phase = "needpass"; // needpass | connecting | ready | error
  let lastError = "";
  let meta = loadMeta();
  let busy = false,
    again = false,
    timer = null,
    lastSync = 0,
    offline = !navigator.onLine;

  function loadMeta() {
    let m = {};
    try {
      m = JSON.parse(localStorage.getItem(META_KEY)) || {};
    } catch {}
    m.profiles ||= {};
    m.v ||= 0;
    m.pending ||= { profiles: [], days: [], deleted: [], header: false };
    return m;
  }
  const saveMeta = () => {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {}
  };
  const pass = () => {
    try {
      return localStorage.getItem(PASS_KEY);
    } catch {
      return null;
    }
  };
  const readJSON = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  };
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const pendingCount = () => {
    const q = meta.pending;
    return (
      q.profiles.length + q.days.length + q.deleted.length + (q.header ? 1 : 0)
    );
  };
  const localUser = (id) => {
    try {
      return getUsers().find((u) => u.id === id);
    } catch {
      return null;
    }
  };

  // ---------- status ----------
  function setPhase(p, err = "") {
    const changed = p !== phase;
    phase = p;
    lastError = err;
    updatePill();
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    );
    if (
      changed &&
      p === "ready" &&
      document.getElementById("newUser") &&
      !typing
    )
      chooseUser();
    else refreshBox();
  }
  function updatePill() {
    const pill = document.getElementById("syncPill");
    if (!pill) return;
    pill.textContent =
      phase === "ready"
        ? offline
          ? "● Offline · will sync"
          : pendingCount() || busy
            ? "● Saving to family Drive…"
            : "● Saved to family Drive"
        : phase === "error"
          ? "● Sync problem"
          : phase === "connecting"
            ? "● Connecting…"
            : "● This device only";
    pill.classList.toggle("pill-ok", phase === "ready" && !offline);
    pill.classList.toggle("pill-warn", phase !== "ready" || offline);
  }
  const refreshBox = () => {
    const el = document.getElementById("cloudBox");
    if (el) renderBox(el);
  };
  const ago = (t) => {
    if (!t) return "not yet";
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60
      ? "just now"
      : s < 3600
        ? `${Math.round(s / 60)} min ago`
        : new Date(t).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
  };

  // ---------- family card on the family page ----------
  function renderBox(el) {
    if (!el) return;
    const err = lastError ? `<p class="cloud-error">${esc(lastError)}</p>` : "";
    if (phase === "needpass" || (phase === "error" && !pass())) {
      el.innerHTML = `<section class="card cloud-box cloud-cta"><div><h2>Connect this device to the family</h2><p class="tiny">Enter the family passcode once on this phone or computer. Every profile and diary is then saved to the family’s Google Drive and appears on all connected devices. Ask the family admin for the passcode.</p>${err}<form id="drivePassForm" class="drive-pass"><input id="drivePass" type="password" autocomplete="current-password" placeholder="Family passcode" aria-label="Family passcode" required><button type="submit">Connect</button></form></div></section>`;
      el.querySelector("#drivePassForm").onsubmit = (e) => {
        e.preventDefault();
        connect(el.querySelector("#drivePass").value);
      };
      return;
    }
    if (phase === "connecting") {
      el.innerHTML = `<section class="card cloud-box cloud-cta"><div><h2>Connecting to the family Drive…</h2><p class="tiny">Checking the passcode and loading the family’s latest records.</p></div></section>`;
      return;
    }
    el.innerHTML = `<section class="card cloud-box cloud-ready"><div class="cloud-head"><div><span class="eyebrow">☁ Family Drive</span><h2>Connected</h2><p class="tiny">Profiles and diaries from every connected device are saved to the family’s Google Sheet. Last synced: <b>${ago(lastSync)}</b>${offline ? " · offline, changes will sync later" : ""}.</p></div><div class="cloud-code"><div><button type="button" class="secondary small" id="driveSyncNow">Sync now</button><button type="button" class="text small" id="driveDisconnect">Disconnect</button></div></div></div>${err}</section>`;
    el.querySelector("#driveSyncNow").onclick = () => syncNow(true);
    el.querySelector("#driveDisconnect").onclick = disconnect;
  }

  // ---------- talking to the Google script ----------
  async function post(body) {
    if (!navigator.onLine)
      throw Object.assign(Error("offline"), { code: "offline" });
    let res;
    try {
      res = await fetch(URL_, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight
        body: JSON.stringify({ ...body, pass: pass() }),
        redirect: "follow",
      });
    } catch {
      throw Object.assign(Error("network"), { code: "network" });
    }
    let out;
    try {
      out = await res.json();
    } catch {
      throw Object.assign(Error("bad-response"), { code: "bad-response" });
    }
    if (out.error)
      throw Object.assign(Error(out.error), {
        code: out.error,
        detail: out.message,
      });
    return out;
  }
  function friendly(e) {
    switch (e?.code) {
      case "wrong-passcode":
        return "That passcode is not right. Check it with the family admin and try again.";
      case "too-many-attempts":
        return "Too many wrong passcodes were tried. Please wait 10 minutes and try again.";
      case "not-set-up":
        return "The family Drive is not set up yet (no passcode on the Google script).";
      case "offline":
      case "network":
        return "No connection to the family Drive right now. Changes are kept on this device and will sync later.";
      default:
        return (
          "Sync problem: " +
          (e?.detail || e?.code || e?.message || "unknown error") +
          ". Changes are kept on this device."
        );
    }
  }

  // ---------- connect / disconnect ----------
  async function connect(code) {
    code = String(code || "").trim();
    if (!code) return;
    try {
      localStorage.setItem(PASS_KEY, code);
    } catch {}
    setPhase("connecting");
    try {
      await post({ action: "ping" });
    } catch (e) {
      try {
        localStorage.removeItem(PASS_KEY);
      } catch {}
      setPhase("needpass", friendly(e));
      return;
    }
    meta = loadMeta();
    meta.connected = true;
    meta.linked = true; // this device's profiles belong to the family Drive
    saveMeta();
    // First pull everything, then offer this device's own profiles.
    let first;
    try {
      first = await post({ action: "sync", since: 0, push: {} });
    } catch (e) {
      setPhase("error", friendly(e));
      return;
    }
    const remote = new Map(first.profiles.map((p) => [p.id, p]));
    const local = getUsers().filter((u) => !(u.id in meta.profiles));
    const merge = [];
    if (local.length) {
      const clash = local.filter(
        (u) => remote.has(u.id) && !remote.get(u.id).deleted,
      );
      const ok = confirm(
        `This device has ${local.length} profile${local.length === 1 ? "" : "s"} not yet saved to the family Drive:\n${local
          .map((u) => `${u.name} (@${u.id})`)
          .join(
            ", ",
          )}\n\nSave ${local.length === 1 ? "it" : "them"} to the family Drive now?` +
          (clash.length
            ? `\n\nNote: ${clash.map((u) => "@" + u.id).join(", ")} already exist${clash.length === 1 ? "s" : ""} in the family. If it is the same person, the diaries are combined day by day (the latest edit of each day is kept).`
            : ""),
      );
      if (ok)
        for (const u of local) {
          if (remote.has(u.id) && !remote.get(u.id).deleted) merge.push(u.id);
          else {
            meta.profiles[u.id] = Date.now();
            queue("profiles", u.id);
            queueAllDays(u.id);
          }
        }
    }
    applyRemote(first, merge);
    meta.v = first.v;
    saveMeta();
    lastSync = Date.now();
    setPhase("ready");
    if (typeof chooseUser === "function" && document.getElementById("newUser"))
      chooseUser();
    toast("Connected to the family Drive");
    await syncNow();
    startTimer();
  }
  async function disconnect() {
    const clear = confirm(
      "Disconnect this device from the family Drive.\n\nAlso remove the family’s records from this device? Choose OK on a shared or borrowed device (everything stays in the family Drive). Choose Cancel to keep a copy here.",
    );
    if (clear) {
      await syncNow();
      if (pendingCount()) {
        alert(
          "Some changes on this device have not reached the family Drive yet, so nothing was removed. Connect to the internet, press Sync now, then try again.",
        );
        return;
      }
      try {
        const synced = Object.keys(meta.profiles);
        const users = getUsers().filter((u) => !synced.includes(u.id));
        if (users.length) localStorage.setItem(usersKey, JSON.stringify(users));
        else localStorage.removeItem(usersKey);
        for (const id of synced) {
          localStorage.removeItem(dataKey(id));
          localStorage.removeItem(photoKey(id));
        }
        localStorage.removeItem(headerKey);
      } catch {}
    }
    stopTimer();
    try {
      localStorage.removeItem(PASS_KEY);
      if (clear) localStorage.removeItem(META_KEY);
    } catch {}
    meta = loadMeta();
    if (!clear) {
      meta.connected = false;
      saveMeta();
    }
    setPhase("needpass");
    if (typeof chooseUser === "function") chooseUser();
  }

  // ---------- merging the family's changes into this device ----------
  function applyProfile(p) {
    const id = p.id;
    const localAt = meta.profiles[id] || 0;
    if (p.deleted) {
      if (!localUser(id) || p.at < localAt) {
        if (!localUser(id)) delete meta.profiles[id];
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
    return true;
  }
  function applyDay(d) {
    if (!localUser(d.id)) return false;
    const data = readJSON(dataKey(d.id)) || emptyState();
    const local = data.days?.[d.date];
    if (local && (local.at || 0) >= (d.at || 0)) return false;
    const clean = normalizeBackup({
      version: 1,
      profile: {},
      days: { [d.date]: { ...d.data, at: d.at } },
    })?.days?.[d.date];
    if (!clean) return false;
    data.days = { ...(data.days || {}), [d.date]: clean };
    try {
      localStorage.setItem(dataKey(d.id), JSON.stringify(data));
    } catch {
      return false;
    }
    return true;
  }
  // merge: profiles that exist both here (unsynced) and in the family.
  function applyRemote(res, merge = []) {
    const changed = new Set();
    for (const p of res.profiles || []) {
      if (merge.includes(p.id)) meta.profiles[p.id] = 0;
      if (applyProfile(p)) changed.add(p.id);
    }
    const remoteDays = new Map();
    for (const d of res.days || []) {
      remoteDays.set(d.id + "|" + d.date, d);
      if (applyDay(d)) changed.add(d.id);
    }
    for (const id of merge) {
      // Upload this device's days that the family copy lacks or has older.
      const data = readJSON(dataKey(id));
      for (const [date, day] of Object.entries(data?.days || {})) {
        const r = remoteDays.get(id + "|" + date);
        if (!r || (day.at || 0) > (r.at || 0)) queue("days", id + "|" + date);
      }
    }
    if (res.header && res.header.at > (meta.headerAt || 0)) {
      try {
        if (validImage(res.header.image))
          localStorage.setItem(headerKey, res.header.image);
        else localStorage.removeItem(headerKey);
      } catch {}
      meta.headerAt = res.header.at;
      if (typeof applyHeader === "function") applyHeader();
    }
    if (changed.size && typeof onCloudData === "function")
      onCloudData([...changed]);
  }

  // ---------- sending this device's changes ----------
  function queue(kind, value) {
    const list = meta.pending[kind];
    if (!list.includes(value)) list.push(value);
  }
  function queueAllDays(id) {
    const data = readJSON(dataKey(id));
    for (const date of Object.keys(data?.days || {}))
      queue("days", id + "|" + date);
  }
  // Shrinks a picture until it fits one Sheet cell.
  async function fitPhoto(src) {
    if (!validImage(src) || src.length <= PHOTO_MAX)
      return validImage(src) ? src : "";
    const img = new Image();
    await new Promise((ok, bad) => {
      img.onload = ok;
      img.onerror = bad;
      img.src = src;
    }).catch(() => null);
    for (const [size, q] of [
      [256, 0.8],
      [224, 0.72],
      [192, 0.65],
      [160, 0.6],
    ]) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, 0, 0, size, size);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length <= PHOTO_MAX) return out;
    }
    return "";
  }
  async function buildPush() {
    const q = meta.pending;
    const push = { profiles: [], days: [], deleted: [], header: null };
    for (const id of q.deleted)
      push.deleted.push({ id, at: meta.deletedAt?.[id] || Date.now() });
    for (const id of q.profiles) {
      const u = localUser(id);
      if (!u) continue;
      const data = readJSON(dataKey(id)) || emptyState();
      push.profiles.push({
        id,
        name: u.name,
        photo: await fitPhoto(getPhoto(id) || ""),
        profile: data.profile || emptyState().profile,
        at: meta.profiles[id] || Date.now(),
      });
    }
    for (const key of q.days) {
      const [id, date] = key.split("|");
      const day = readJSON(dataKey(id))?.days?.[date];
      if (!day || !localUser(id)) continue;
      const { at, ...rest } = day;
      push.days.push({ id, date, data: rest, at: at || Date.now() });
    }
    if (q.header) {
      let image = "";
      try {
        image = localStorage.getItem(headerKey) || "";
      } catch {}
      push.header = {
        image: validImage(image) ? image : "",
        at: meta.headerAt || Date.now(),
      };
    }
    return push;
  }
  async function syncNow(manual = false) {
    if (phase !== "ready" || !pass()) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    updatePill();
    const taken = JSON.parse(JSON.stringify(meta.pending));
    try {
      const push = await buildPush();
      const res = await post({ action: "sync", since: meta.v || 0, push });
      // Done: forget what was sent (changes made meanwhile stay queued).
      const q = meta.pending;
      q.profiles = q.profiles.filter((x) => !taken.profiles.includes(x));
      q.days = q.days.filter((x) => !taken.days.includes(x));
      q.deleted = q.deleted.filter((x) => !taken.deleted.includes(x));
      if (taken.header) q.header = false;
      applyRemote(res);
      meta.v = res.v;
      saveMeta();
      lastSync = Date.now();
      offline = false;
      if (lastError) lastError = "";
      if (manual) toast("Family Drive is up to date");
    } catch (e) {
      if (e.code === "wrong-passcode" || e.code === "not-set-up") {
        // The passcode was changed by the admin.
        try {
          localStorage.removeItem(PASS_KEY);
        } catch {}
        busy = false;
        stopTimer();
        setPhase(
          "needpass",
          e.code === "wrong-passcode"
            ? "The family passcode has changed. Enter the new passcode to keep syncing."
            : friendly(e),
        );
        return;
      }
      offline = e.code === "offline" || e.code === "network";
      lastError = offline ? "" : friendly(e);
      saveMeta();
    } finally {
      busy = false;
      updatePill();
      refreshBox();
    }
    if (again) {
      again = false;
      syncNow();
    }
  }
  let soon = null;
  function syncSoon(ms = 1500) {
    saveMeta();
    updatePill();
    clearTimeout(soon);
    soon = setTimeout(() => syncNow(), ms);
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (document.visibilityState !== "hidden") syncNow();
    }, POLL_MS);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }
  addEventListener("online", () => {
    offline = false;
    updatePill();
    syncNow();
  });
  addEventListener("offline", () => {
    offline = true;
    updatePill();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNow();
  });

  // ---------- hooks called by app.js ----------
  const connected = () => phase === "ready" && !!pass();
  window.Cloud = {
    inFamily: connected,
    renderBox,
    profileChanged(id) {
      if (!meta.linked) return;
      meta.profiles[id] = Date.now();
      queue("profiles", id);
      syncSoon();
    },
    dayChanged(id, date) {
      if (!meta.linked || !(id in meta.profiles)) return;
      queue("days", id + "|" + date);
      syncSoon();
    },
    allDaysChanged(id) {
      if (!meta.linked || !(id in meta.profiles)) return;
      queueAllDays(id);
      syncSoon();
    },
    profileDeleted(id) {
      if (!meta.linked || !(id in meta.profiles)) return;
      delete meta.profiles[id];
      const q = meta.pending;
      q.profiles = q.profiles.filter((x) => x !== id);
      q.days = q.days.filter((x) => !x.startsWith(id + "|"));
      meta.deletedAt = { ...(meta.deletedAt || {}), [id]: Date.now() };
      queue("deleted", id);
      syncSoon(200);
    },
    headerChanged() {
      if (!meta.linked) return;
      meta.headerAt = Date.now();
      meta.pending.header = true;
      syncSoon();
    },
  };

  // ---------- start ----------
  if (pass() && meta.connected) {
    phase = "ready";
    updatePill();
    refreshBox();
    syncNow();
    startTimer();
  } else {
    phase = "needpass";
    updatePill();
    refreshBox();
  }
})();
