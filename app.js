// Food data (foods, FOOD_CATEGORIES, FOOD_SOURCES) is loaded from foods.js.
const meals = ["Breakfast", "Lunch", "Dinner", "Supper / snacks"];
const foodCats = Object.fromEntries(
  FOOD_CATEGORIES.map(([id, ms, en]) => [id, { ms, en }]),
);
const portionText = (f) => (f.g ? `${f.s} · ${f.g} g` : f.s);
const per100g = (f) => (f.g ? Math.round((f.k / f.g) * 100) : null);
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
// English / spelling variants → the Malay words used in the table.
const foodSynonyms = {
  mee: "mi",
  noodle: "mi",
  noodles: "mi",
  kuey: "kuetiau",
  kway: "kuetiau",
  teow: "kuetiau",
  koay: "kuetiau",
  chicken: "ayam",
  beef: "daging",
  meat: "daging",
  mutton: "kambing",
  fish: "ikan",
  prawn: "udang",
  prawns: "udang",
  shrimp: "udang",
  squid: "sotong",
  crab: "ketam",
  egg: "telur",
  eggs: "telur",
  rice: "nasi",
  fried: "goreng",
  bread: "roti",
  tea: "teh",
  coffee: "kopi",
  milk: "susu",
  sugar: "gula",
  soup: "sup",
  vegetable: "sayur",
  vegetables: "sayur",
  veg: "sayur",
  porridge: "bubur",
  banana: "pisang",
  apple: "epal",
  potato: "kentang",
  cake: "kek",
  biscuit: "biskut",
  biscuits: "biskut",
  water: "air",
  juice: "jus",
  tofu: "tauhu",
  beans: "kacang",
  nuts: "kacang",
  curry: "kari",
  satay: "sate",
  chapati: "capati",
  spaghetti: "spageti",
  fruit: "buah",
  drink: "minuman",
  drinks: "minuman",
  snack: "snek",
  dessert: "pencuci",
};
// Common English dish names, whose word order differs from Malay.
const foodPhrases = {
  "chicken rice": "nasi ayam",
  "fried rice": "nasi goreng",
  "coconut rice": "nasi lemak",
  "white rice": "nasi putih",
  "fried noodles": "mi goreng",
  "fried noodle": "mi goreng",
  "fried chicken": "ayam goreng",
  "fried fish": "ikan goreng",
  "grilled fish": "ikan bakar",
  "fried egg": "telur goreng",
  "boiled egg": "telur rebus",
  "chicken curry": "kari ayam",
  "curry chicken": "kari ayam",
  "chicken soup": "sup ayam",
  "chicken porridge": "bubur ayam",
  "pulled tea": "teh tarik",
  "milk tea": "teh tarik",
};
const foodIndex = foods.map((f) => norm([f.n, f.s, f.note].join(" ")));
// A typed word matches when it appears in the text, or when its Malay
// synonym appears there as a whole word (so "mee" finds "Mi goreng").
const wordIn = (text, w) =>
  text.includes(w) ||
  (!!foodSynonyms[w] && new RegExp(`\\b${foodSynonyms[w]}\\b`).test(text));
// Every word typed must match the food. Ranking: name starts with the whole
// phrase, then with the first word, then has every word; ties keep table order.
function searchFoods(q, cat = "all") {
  let text = norm(q).trim();
  for (const [en, ms] of Object.entries(foodPhrases))
    text = text.replace(new RegExp(`\\b${en}\\b`, "g"), ms);
  const words = text.split(/\s+/).filter(Boolean);
  const hits = [];
  foods.forEach((f, i) => {
    if (cat !== "all" && !f.c.includes(cat)) return;
    if (words.every((w) => wordIn(foodIndex[i], w))) hits.push(i);
  });
  if (!words.length) return hits;
  const phrase = words.join(" "),
    first = words[0],
    syn = foodSynonyms[first];
  const rank = (i) => {
    const name = norm(foods[i].n);
    if (name.startsWith(phrase)) return 0;
    const all = words.every((w) => wordIn(name, w));
    if (name.startsWith(first) || (syn && name.startsWith(syn + " ")))
      return all ? 1 : 2;
    return all ? 3 : 4;
  };
  return hits.sort((a, b) => rank(a) - rank(b));
}
let libCat = "all",
  libSort = "relevance",
  libQuery = "";
// Uses the device's own time zone, so family members abroad get their local "today".
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
let date = today(),
  page = "today";
let state, identity, key;
const emptyState = () => ({
  version: 1,
  profile: {
    height: null,
    baseline: null,
    goal: null,
    calories: null,
    steps: null,
    walking: null,
  },
  days: {},
});
// [key, label, min, max, step] — the only profile fields the app reads or saves.
const profileFields = [
  ["height", "Height (cm)", 100, 230, 0.1],
  ["baseline", "Starting baseline (kg)", 20, 350, 0.1],
  ["goal", "Goal weight (kg)", 20, 350, 0.1],
  ["calories", "Daily calorie target", 800, 6000, 1],
  ["steps", "Daily step goal", 100, 50000, 1],
  ["walking", "Walking session goal (min)", 1, 240, 1],
];
const profileComplete = (p) =>
  profileFields.every(([k]) => Number.isFinite(p?.[k]));
// Weight goals can be to lose, gain or maintain. Maintain counts as reached within ±1 kg.
function goalDirection(p) {
  const b = Number(p.baseline),
    g = Number(p.goal);
  if (!(b > 0 && g > 0) || g < b) return "lose";
  return g > b ? "gain" : "maintain";
}
function reachedGoal(weight, p) {
  const g = Number(p.goal);
  if (!(g > 0) || weight == null) return false;
  const dir = goalDirection(p);
  if (dir === "gain") return weight >= g;
  if (dir === "maintain") return Math.abs(weight - g) <= 1;
  return weight <= g;
}
function goalText(weight, p) {
  if (reachedGoal(weight, p)) return "Goal reached";
  const dir = goalDirection(p);
  const gap = Math.abs(weight - p.goal).toFixed(1);
  return dir === "gain"
    ? `${gap} kg to gain`
    : dir === "maintain"
      ? `${gap} kg from goal`
      : `${gap} kg to lose`;
}
const usersKey = "my-health-family-users-v1";
const dataKey = (id) => "my-health-family-data-" + id;
const headerKey = "my-health-family-header-v1";
const photoKey = (id) => "my-health-family-photo-" + id;
const validImage = (s) =>
  typeof s === "string" &&
  s.length < 500000 &&
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
function getPhoto(id) {
  try {
    const p = localStorage.getItem(photoKey(id));
    return validImage(p) ? p : null;
  } catch {
    return null;
  }
}
// Round profile picture, or the first letter of the name when there is none.
function avatarHTML(user, cls = "") {
  const photo = getPhoto(user.id);
  return photo
    ? `<span class="avatar ${cls}"><img src="${photo}" alt=""></span>`
    : `<span class="avatar ${cls}">${esc(Array.from(user.name || "?")[0].toUpperCase())}</span>`;
}
function showAccount(user) {
  $("#accountName").textContent = user.name + " · @" + user.id;
  const photo = getPhoto(user.id);
  $(".avatar").innerHTML = photo
    ? `<img src="${photo}" alt="">`
    : esc(Array.from(user.name || "?")[0].toUpperCase());
}
function getUsers() {
  const users = JSON.parse(localStorage.getItem(usersKey) || "[]");
  if (!Array.isArray(users)) throw Error("Invalid profile list");
  return users;
}
function boot() {
  state = null;
  identity = null;
  key = null;
  chooseUser();
}
function familyOverview(users, period = 7) {
  const end = new Date(today() + "T12:00:00Z"),
    week = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    week.push(d.toISOString().slice(0, 10));
  }
  let active = 0,
    walkGoalDays = 0,
    weightTargets = 0;
  const cards = users.map((user) => {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(dataKey(user.id)) || "null");
    } catch {}
    const days = data?.days || {},
      p = data?.profile || {},
      recent = Object.entries(days)
        .filter(([d, v]) => d <= today() && v?.weight != null)
        .sort((a, b) => b[0].localeCompare(a[0]));
    const recentWeight = recent[0],
      weekWalk = week.reduce(
        (sum, d) => sum + (Number(days[d]?.walking) || 0),
        0,
      );
    const activeDays = week.filter((d) => {
      const v = days[d];
      return !!(
        v &&
        ((v.entries || []).length ||
          Object.keys(v.reports || {}).length ||
          v.weight != null ||
          v.steps != null ||
          v.walking != null ||
          v.coffee != null)
      );
    });
    const walkDays = week.filter(
      (d) => Number(days[d]?.walking) >= Number(p.walking || Infinity),
    );
    const badges = [];
    if (activeDays.length >= 3) {
      badges.push("Logged 3 days in period");
      active++;
    }
    if (walkDays.length >= 3) {
      badges.push("3 walks reached session goal in period");
      walkGoalDays++;
    }
    if (recentWeight && reachedGoal(recentWeight[1].weight, p)) {
      badges.push("Reached weight goal");
      weightTargets++;
    }
    const stepEntries = Object.entries(days)
      .filter(([d, v]) => d <= today() && v?.steps != null)
      .sort((a, b) => b[0].localeCompare(a[0]));
    const steps = stepEntries[0];
    const bmiValue =
      recentWeight && p.height
        ? bmi(recentWeight[1].weight, p.height).toFixed(1)
        : null;
    const badgesHTML = badges.length
      ? badges
          .map((b) => `<span class="achievement">★ ${esc(b)}</span>`)
          .join("")
      : '<span class="tiny">No milestone earned yet. Log actual progress to get started.</span>';
    return `<article class="card family-member"><div class="section-head"><div class="member-head">${avatarHTML(user, "avatar-md")}<div><h2>${esc(user.name)}</h2><span class="tiny">@${esc(user.id)}</span></div></div><button class="secondary" data-open-user="${esc(user.id)}">Open diary</button></div><div class="family-metrics"><div><span class="tiny">Latest actual weight</span><b>${recentWeight ? esc(recentWeight[1].weight) + " kg" : "Not logged"}</b>${bmiValue ? `<span class="tiny">BMI ${bmiValue}</span>` : ""}${recentWeight && Number(p.baseline) > 0 && Number(p.goal) > 0 && Number(p.baseline) !== Number(p.goal) ? `<div class="goal-track"><span style="width:${Math.max(0, Math.min(100, ((Number(p.baseline) - recentWeight[1].weight) / (Number(p.baseline) - Number(p.goal))) * 100))}%"></span></div><span class="tiny">Weight goal ${esc(p.goal)} kg</span>` : ""}</div><div><span class="tiny">Walking in period</span><b>${weekWalk} min</b><span class="tiny">${walkDays.length} goal sessions</span></div><div><span class="tiny">Most recent steps</span><b>${steps ? number(steps[1].steps) : "Not logged"}</b><span class="tiny">${steps ? esc(steps[0]) : ""}</span></div><div><span class="tiny">Check-ins in period</span><b>${activeDays.length} / ${period} days</b></div></div><div class="achievements"><strong>Achievements</strong><div>${badgesHTML}</div></div></article>`;
  });
  $("#familyOverview").innerHTML =
    `<div class="section-head"><div><h2>Family progress</h2><p class="tiny">Actual records and milestones for the last ${period} days · This browser only</p></div><span class="pill">${users.length} ${users.length === 1 ? "profile" : "profiles"}</span></div><div class="chart-controls"><span>View period</span><button class="${period === 7 ? "selected" : ""}" onclick="familyOverview(getUsers(),7)">7 days</button><button class="${period === 30 ? "selected" : ""}" onclick="familyOverview(getUsers(),30)">30 days</button></div>${familyCharts(users, week)}<div class="family-grid">${cards.join("")}</div>`;
  $("#familyOverview").onclick = (e) => {
    const b = e.target.closest?.("[data-open-user]");
    if (b) openUser(b.dataset.openUser);
  };
  $("#familyTotals").innerHTML =
    `<div class="family-summary"><div><b>${users.length}</b><span>family profiles</span></div><div><b>${active}</b><span>members with 3+ check-in days in period</span></div><div><b>${walkGoalDays}</b><span>members with 3 goal walks in period</span></div><div><b>${weightTargets}</b><span>members at weight goal</span></div></div>`;
}
function familyCharts(users, days) {
  const width = 840,
    height = 190,
    pad = 28,
    slot = (width - pad * 2) / days.length;
  const series = days.map((d) => {
    let walking = 0,
      steps = 0,
      stepCount = 0;
    for (const user of users) {
      let data;
      try {
        data = JSON.parse(localStorage.getItem(dataKey(user.id)) || "null");
      } catch {}
      const v = data?.days?.[d];
      if (v?.walking != null) walking += Number(v.walking) || 0;
      if (v?.steps != null) {
        steps += Number(v.steps) || 0;
        stepCount++;
      }
    }
    return {
      date: d,
      walking,
      steps: stepCount ? Math.round(steps / stepCount) : null,
    };
  });
  const barChart = (key, title, color, format) => {
    const vals = series.map((v) => v[key]).filter((v) => v != null),
      max = Math.max(1, ...vals);
    const bars = series
      .map((v, i) => {
        if (v[key] == null) return "";
        const bh = Math.max(2, (height - pad * 2) * (v[key] / max)),
          x = pad + i * slot + slot * 0.18,
          y = height - pad - bh;
        const label =
          i % Math.ceil(days.length / 7) === 0 || i === days.length - 1
            ? new Date(v.date + "T12:00:00Z").toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })
            : "";
        return `<g><title>${esc(v.date)}: ${format(v[key])}</title><rect x="${x}" y="${y}" width="${Math.max(2, slot * 0.64)}" height="${bh}" rx="4" fill="${color}"/><text x="${x + slot * 0.32}" y="${height - 7}" text-anchor="middle">${esc(label)}</text></g>`;
      })
      .join("");
    return `<section class="chart-card"><div class="section-head"><h3>${title}</h3><span class="tiny">${vals.length ? `Peak ${format(max)}` : "No actual data yet"}</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} for the last ${days.length} days"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dfe8df"/>${bars}</svg><p class="tiny">${key === "walking" ? "Total walking minutes reported by family members." : "Average steps among members who reported steps that day."} Missing values are omitted.</p></section>`;
  };
  return `<div class="family-charts">${barChart("walking", "Family walking minutes", "#4c9d7b", (v) => `${v} min`)}${barChart("steps", "Average reported steps", "#d99c67", (v) => number(v))}</div>`;
}
function chooseUser() {
  if ($("#modal").open) $("#modal").close();
  state = null;
  identity = null;
  key = null;
  $("#accountName").textContent = "Choose a user";
  $(".avatar").textContent = "♡";
  $("#pageTitle").textContent = "A healthier family, one day at a time.";
  $("#subtitle").textContent =
    "Create your own user ID. No ChatGPT account required.";
  try {
    const users = getUsers();
    $("#view").innerHTML =
      `<div class="family-dashboard"><section class="family-banner"><div><span class="eyebrow">MY HEALTH · FAMILY EDITION</span><h2>Every step counts.<br>Celebrate them together.</h2><p>See your family’s real progress, one check-in at a time.</p></div><div class="banner-actions"><button type="button" id="changeHeader" aria-label="Change header photo">🖼 Change photo</button><button type="button" id="resetHeader" hidden>Reset</button><input type="file" id="headerFile" accept="image/*" hidden></div></section><section id="familyTotals"></section><section class="card family-overview" id="familyOverview"></section><div class="settings"><section class="card"><h2>Choose your profile</h2><p class="tiny">Profiles are saved on this browser. They are not password-protected: anyone using this browser can open them. The same ID on another device does not sync records.</p><div id="userList"></div>${users.length ? "" : "<p>No profiles yet. Create yours below.</p>"}</section><section class="card" style="margin-top:20px"><h2>Create a new user</h2><form id="newUser"><label>Your name<input id="newName" required maxlength="60" autocomplete="name"></label><label>User ID<input id="newId" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_\\-]{3,30}" placeholder="e.g. saba or sarah_01" autocomplete="off"></label><p class="tiny">3–30 letters, numbers, underscores or hyphens. IDs are unique on this browser and ignore capital letters.</p><button>Create user</button></form></section></div></div>`;
    familyOverview(users);
    applyHeader();
    $("#changeHeader").onclick = () => $("#headerFile").click();
    $("#headerFile").onchange = changeHeader;
    $("#resetHeader").onclick = () => {
      try {
        localStorage.removeItem(headerKey);
      } catch {}
      applyHeader();
      toast("Header photo reset");
    };
    for (const user of users) {
      const button = document.createElement("button");
      button.className = "secondary profile-choice";
      button.innerHTML = `${avatarHTML(user, "avatar-sm")}<span>${esc(user.name)} · @${esc(user.id)}</span>`;
      button.onclick = () => openUser(user.id);
      $("#userList").appendChild(button);
    }
    $("#newUser").onsubmit = (e) => {
      e.preventDefault();
      const id = $("#newId").value.trim().toLowerCase(),
        name = $("#newName").value.trim();
      if (!name || !/^[a-z0-9_-]{3,30}$/.test(id)) return;
      try {
        const latest = getUsers();
        if (latest.some((u) => u.id === id)) {
          alert(
            "This user ID already exists on this browser. Choose it above or use a different ID.",
          );
          return;
        }
        localStorage.setItem(
          usersKey,
          JSON.stringify([...latest, { id, name }]),
        );
        openUser(id);
      } catch {
        alert(
          "Unable to create a profile. Enable browser storage and try again.",
        );
      }
    };
  } catch {
    $("#view").innerHTML =
      '<section class="card"><h2>Browser storage unavailable</h2><p>Enable local storage and reload. No records have been changed.</p></section>';
  }
}
// Header photo: a custom photo is resized to max 1600 px wide and kept in
// this browser only. Without one, family-header.jpg from the site is used.
function applyHeader() {
  const banner = $(".family-banner");
  if (!banner) return;
  let img = null;
  try {
    img = localStorage.getItem(headerKey);
  } catch {}
  try {
    if (img && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(img))
      banner.style.setProperty("--banner-image", `url("${img}")`);
    else banner.style.removeProperty("--banner-image");
  } catch {
    // A header problem must never block access to the profiles.
  }
  const reset = $("#resetHeader");
  if (reset) reset.hidden = !img;
}
function changeHeader(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!/^image\//.test(f.type)) {
    alert("Please choose a photo (JPEG, PNG or similar).");
    return;
  }
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 1600 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    try {
      localStorage.setItem(headerKey, c.toDataURL("image/jpeg", 0.82));
    } catch {
      alert(
        "This photo is too large to store in the browser. Try a smaller photo.",
      );
      return;
    }
    applyHeader();
    toast("Header photo updated");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("Unable to read this image. Try a JPEG or PNG photo.");
  };
  img.src = url;
}
function openUser(id) {
  try {
    const user = getUsers().find((u) => u.id === id);
    if (!user) throw Error();
    const storageKey = dataKey(user.id);
    const saved = localStorage.getItem(storageKey);
    let data = saved ? JSON.parse(saved) : emptyState();
    if (!data || !data.profile || !data.days) throw Error();
    data = normalizeBackup(data) || data;
    identity = user;
    key = storageKey;
    state = data;
    date = today();
    page = "today";
    showAccount(user);
    render();
  } catch {
    alert(
      "Unable to open this profile. Its saved records have not been changed.",
    );
    chooseUser();
  }
}

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const day = () => state.days[date] || { entries: [], reports: {} };
const total = (d) => (d.entries || []).reduce((a, e) => a + e.kcal * e.qty, 0);
const bmi = (w, h) => w / (h / 100) ** 2;
const number = (n) => Math.round(n).toLocaleString();
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    alert("Unable to save in this browser. Export a backup before leaving.");
    return false;
  }
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 2600);
}
function updateDay(values) {
  state.days[date] = { ...day(), ...values };
  save();
  render();
}
function navigate(p) {
  if (!state) return;
  page = p;
  render();
  window.scrollTo(0, 0);
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
function latestWeight() {
  return Object.entries(state.days)
    .filter(([d, v]) => d <= date && v.weight != null)
    .sort((a, b) => b[0].localeCompare(a[0]))[0];
}
function render() {
  if (!state) return;
  if (!profileComplete(state.profile)) page = "settings";
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("#pageTitle").textContent = {
    today: "A little better, every day.",
    foods: "Your Malaysian food library.",
    progress: "See how far you’ve come.",
    settings: "Your health, your pace.",
  }[page];
  $("#subtitle").textContent = {
    today: "Your food, movement and progress. All in one place.",
    foods: `${foods.length} Malaysian foods and drinks with standard servings.`,
    progress: "Real observations, without filling in the blanks.",
    settings: "Personalise your targets and keep a copy of your records.",
  }[page];
  if (page === "today") renderToday();
  if (page === "foods") renderFoods();
  if (page === "progress") renderProgress();
  if (page === "settings") renderSettings();
}
function renderToday() {
  const d = day(),
    p = state.profile,
    t = total(d),
    w = latestWeight(),
    weight = w ? w[1].weight : p.baseline,
    b = bmi(weight, p.height);
  $("#view").innerHTML =
    `<div class="toolbar"><input aria-label="Log date" type="date" id="date" value="${date}" max="${today()}"><div><button class="secondary" onclick="activity()">＋ Activity & weight</button> <button onclick="foodDialog()">＋ Log food</button></div></div><div class="stats"><section class="card calcard"><div class="ring" style="--pct:${Math.min(100, (t / p.calories) * 100)}%"><div class="ring-inner"><span class="big">${number(t)}</span><span class="unit">kcal logged</span></div></div><div><h3>Daily nourishment</h3><div class="metric"><b>${number(Math.max(0, p.calories - t))}</b> <span class="unit">kcal to target</span></div><span class="tiny">${number(p.calories)} kcal daily target<br>${t > p.calories ? number(t - p.calories) + " kcal above target" : "Estimates from logged portions"}<br>Missing meals are not zero intake.</span></div></section><section class="card"><h3>♡ &nbsp; Body mass index</h3><div class="big">${b.toFixed(1)}</div><div class="tiny">${w ? "Latest recorded weight" : "Using starting baseline"} · ${weight} kg<br>${p.height} cm height</div><div class="mini-line"><span style="width:${Math.min(100, (b / 40) * 100)}%"></span></div><div class="tiny">BMI is a screening measure.</div></section><section class="card"><h3>⚑ &nbsp; Weight journey</h3><div class="big">${weight}<span class="unit"> kg</span></div><p class="tiny">Goal ${p.goal} kg · ${goalText(weight, p)}</p><button class="text" onclick="activity()">Record a weigh-in →</button></section></div><div class="columns"><section class="card"><div class="section-head"><h2>Your food diary</h2><span class="pill">${d.entries.length} items logged</span></div>${meals
      .map((m, i) => {
        let es = d.entries.filter((e) => e.meal === m);
        return `<div class="meal"><div class="meal-top"><div class="meal-title"><span class="meal-icon">${["☀", "◒", "☾", "☕"][i]}</span>${m}</div><button class="text" onclick="foodDialog('${m}')">＋ Add</button></div>${es.map((e) => `<div class="entry"><span>${esc(e.name)}<br><span class="tiny">${e.qty} × ${esc(e.portion)}</span></span><span>${number(e.kcal * e.qty)} kcal <button class="text" aria-label="Edit food" onclick="editEntry('${e.id}')">✎</button><button class="text" aria-label="Delete food" onclick="deleteEntry('${e.id}')">×</button></span></div>`).join("")}${d.reports?.[m] ? `<p><b>Reported:</b> ${esc(d.reports[m])}<br>Calories not assigned to this report. Add measured portions above to estimate.</p>` : !es.length ? "<p>Not reported yet</p>" : ""}</div>`;
      })
      .join(
        "",
      )}</section><div class="stack"><section class="card"><div class="section-head"><h2>A little movement</h2><button class="text" onclick="activity()">Edit</button></div><div class="activity-grid"><div><div class="metric big">${d.steps == null ? "—" : number(d.steps)}</div><span class="unit">steps · goal ${number(p.steps)}</span></div><div><div class="metric big">${d.walking == null ? "—" : d.walking}</div><span class="unit">walking minutes</span></div></div><p class="tiny">Enter actual readings from your iPhone. Unreported activity stays blank.</p></section><section class="card"><div class="section-head"><h2>Coffee & habits</h2><button class="text" onclick="activity()">Edit</button></div><p class="tiny">Office coffee: <b>${d.coffee ?? "Not reported"}</b>${d.coffee != null ? " cups" : ""}<br>Milk amount: <b>${esc(d.milk || "Not reported")}</b><br>Dinner vegetables: <b>${esc(d.vegetables || "Not reported")}</b></p></section><div class="note"><b>Make room for your favourites.</b>Log roti canai, nasi lemak and kopi by portion. Add milk, sugar and sauces separately when they are not included.<br><br>Habit notes do not add calories automatically.</div></div></div>`;
  $("#date").onchange = (e) => {
    date = e.target.value || today();
    render();
  };
}
function renderFoods() {
  const counts = { all: foods.length };
  for (const f of foods) for (const c of f.c) counts[c] = (counts[c] || 0) + 1;
  const chip = (id, label) =>
    `<button type="button" class="chip ${libCat === id ? "selected" : ""}" data-cat="${id}">${esc(label)} <span>${counts[id] || 0}</span></button>`;
  $("#view").innerHTML =
    `<div class="toolbar food-toolbar"><input class="search" id="search" type="search" placeholder="Search nasi lemak, teh tarik, chicken, kuih…" aria-label="Search foods" value="${esc(libQuery)}"><select id="foodSort" aria-label="Sort foods"><option value="relevance">Sort: best match</option><option value="name">Name A–Z</option><option value="low">Lowest kcal</option><option value="high">Highest kcal</option><option value="density">Lowest kcal per 100 g</option></select><button onclick="customFood()">＋ Custom food</button></div>` +
    `<div class="chips" role="group" aria-label="Food categories">${chip("all", "All foods")}${FOOD_CATEGORIES.map(([id, ms, en]) => chip(id, ms === en ? ms : `${ms} · ${en}`)).join("")}</div>` +
    `<div class="note food-note">Calories per serving from the <b>Bank Kalori Makanan</b> table. Values are averages: recipes, oil and portion sizes vary, so match the serving and adjust the number of servings. Foods marked <b>Estimate</b> are not in the table. <details><summary>Sources and serving guide</summary><p><b>Sources:</b> ${Object.entries(
      FOOD_SOURCES,
    )
      .map(([k, v]) => `${k === "Est" ? "Estimate" : k} = ${esc(v)}`)
      .join(
        " · ",
      )}</p><p><b>Servings:</b> senduk = serving spoon · mangkuk = bowl · pinggan = plate · cawan = cup · gelas = glass · sudu teh = teaspoon · sudu makan = tablespoon · keping = slice or piece · ketul = piece · biji = one whole item · potong = cut piece · ekor = whole fish or prawn · saiz kotak mancis = matchbox-sized piece.</p></details></div>` +
    `<p class="tiny" id="foodCount" aria-live="polite"></p><div class="card table-card"><table class="food-table"><thead><tr><th>Food</th><th class="d-only">Serving</th><th class="num d-only">Weight</th><th class="num">kcal</th><th class="num d-only" title="Calories per 100 g, for comparing foods">kcal / 100 g</th><th class="d-only">Source</th><th><span class="sr-only">Add</span></th></tr></thead><tbody id="foodResults"></tbody></table></div>`;
  $("#foodSort").value = libSort;
  $("#search").oninput = () => {
    libQuery = $("#search").value;
    foodResults();
  };
  $("#foodSort").onchange = () => {
    libSort = $("#foodSort").value;
    foodResults();
  };
  $(".chips").onclick = (e) => {
    const b = e.target.closest?.("[data-cat]");
    if (!b) return;
    libCat = b.dataset.cat;
    for (const c of document.querySelectorAll(".chip"))
      c.classList.toggle("selected", c.dataset.cat === libCat);
    foodResults();
  };
  $("#foodResults").onclick = (e) => {
    const b = e.target.closest?.("[data-food]");
    if (b) entryForm(Number(b.dataset.food));
  };
  foodResults();
}
function sortedFoods(q, cat, sort) {
  const list = searchFoods(q, cat);
  const by = {
    name: (a, b) => foods[a].n.localeCompare(foods[b].n),
    low: (a, b) => foods[a].k - foods[b].k,
    high: (a, b) => foods[b].k - foods[a].k,
    density: (a, b) => (per100g(foods[a]) ?? 1e9) - (per100g(foods[b]) ?? 1e9),
  }[sort];
  return by ? list.sort(by) : list;
}
function foodResults() {
  const list = sortedFoods(libQuery, libCat, libSort);
  const src = (k) =>
    `<abbr title="${esc(FOOD_SOURCES[k] || k)}" class="src src-${esc(k)}">${k === "Est" ? "Estimate" : esc(k)}</abbr>`;
  $("#foodCount").textContent =
    `${list.length} ${list.length === 1 ? "food" : "foods"}` +
    (libCat !== "all" ? ` in ${foodCats[libCat].ms}` : "") +
    (libQuery.trim() ? ` matching “${libQuery.trim()}”` : "");
  $("#foodResults").innerHTML = list.length
    ? list
        .map((i) => {
          const f = foods[i],
            d = per100g(f);
          const cats =
            libCat === "all" ? f.c.map((c) => foodCats[c].ms).join(", ") : "";
          return `<tr><td><b>${esc(f.n)}</b><div class="tiny m-only">${esc(portionText(f))} · ${src(f.src)}</div>${cats || f.note ? `<div class="tiny">${esc([cats, f.note].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="d-only">${esc(f.s)}</td><td class="num d-only">${f.g ? f.g + " g" : "—"}</td><td class="num"><b>${f.k}</b></td><td class="num d-only">${d ?? "—"}</td><td class="d-only">${src(f.src)}</td><td><button type="button" class="secondary small" data-food="${i}" aria-label="Add ${esc(f.n)} to diary">＋ Add</button></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="7"><p>No matching food. Try another word (English works too, e.g. “chicken rice”), or add a custom food from its label.</p></td></tr>`;
}
function show(html) {
  $("#modalBody").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}
function foodDialog(meal = "Breakfast") {
  show(
    `<h2>Log your food</h2><p class="tiny">For ${esc(date)} · Choose a food, then adjust your portion.</p><label>Search Malaysian foods<input id="foodSearch" placeholder="Try nasi lemak, teh tarik or chicken"></label><div id="pickList" style="max-height:320px;overflow:auto"></div><button class="secondary" onclick="customFood('${meal}')">Custom food / label</button>`,
  );
  const list = (q) => {
    const hits = searchFoods(q);
    $("#pickList").innerHTML =
      hits
        .slice(0, 80)
        .map((i) => {
          const f = foods[i];
          return `<div class="meal-top meal"><div>${esc(f.n)}<div class="tiny">${f.k} kcal · ${esc(portionText(f))}</div></div><button class="text" aria-label="Add ${esc(f.n)}" onclick="entryForm(${i},'${meal}')">＋</button></div>`;
        })
        .join("") +
      (hits.length > 80
        ? `<p class="tiny">Showing 80 of ${hits.length}. Type more to narrow the list.</p>`
        : hits.length
          ? ""
          : '<p class="tiny">No match. Try another word or use Custom food.</p>');
  };
  $("#foodSearch").oninput = (e) => list(e.target.value);
  list("");
}
function customFood(meal = "Breakfast") {
  entryForm(-1, meal);
}
function editEntry(id) {
  const e = day().entries.find((x) => x.id === id);
  entryForm(-1, e.meal, e);
}
function entryForm(index, meal = "Breakfast", entry = null) {
  const food = index >= 0 ? foods[index] : null;
  const f = food ? [food.n, portionText(food), food.k] : ["", "1 serving", 0];
  show(
    `<h2>${entry ? "Edit" : "Add"} food</h2><p class="tiny">${date} · Calories = kcal per serving × servings</p><form id="entryForm"><label>Food name<input id="ename" required maxlength="150" value="${esc(entry?.name ?? f[0])}"></label><label>Meal<select id="emeal">${meals.map((m) => `<option ${m === meal ? "selected" : ""}>${m}</option>`).join("")}</select></label><label>Serving description<input id="portion" required value="${esc(entry?.portion ?? f[1])}"></label><div class="row"><label>kcal per serving<input id="kcal" type="number" min="0" max="10000" step="0.1" required value="${entry?.kcal ?? f[2]}"></label><label>Servings (¼ = 0.25)<input id="qty" type="number" min="0.01" max="100" step="0.01" required value="${entry?.qty ?? 1}"></label></div><p id="calc" class="note"></p><button type="submit">Save to diary</button></form>`,
  );
  function calc() {
    $("#calc").textContent =
      `Estimated total: ${number(Number($("#kcal").value) * Number($("#qty").value))} kcal`;
  }
  $("#kcal").oninput = calc;
  $("#qty").oninput = calc;
  calc();
  $("#entryForm").onsubmit = (e) => {
    e.preventDefault();
    const item = {
      id: entry?.id || crypto.randomUUID(),
      name: $("#ename").value.trim(),
      portion: $("#portion").value.trim(),
      meal: $("#emeal").value,
      kcal: Number($("#kcal").value),
      qty: Number($("#qty").value),
    };
    if (!item.name || !item.portion) return;
    const entries = day().entries.filter((x) => x.id !== item.id);
    entries.push(item);
    updateDay({ entries });
    $("#modal").close();
    toast("Food saved to your diary");
  };
}
function deleteEntry(id) {
  if (confirm("Remove this food entry?")) {
    updateDay({ entries: day().entries.filter((e) => e.id !== id) });
    toast("Entry removed");
  }
}
function activity() {
  const d = day();
  show(
    `<h2>Actual activity & habits</h2><p class="tiny">${date} · Leave unreported values blank. Blank is different from zero.</p><form id="activityForm"><div class="row">${[
      ["weight", "Weight (kg)", 0.1, 20, 350],
      ["steps", "Steps", 1, 0, 150000],
      ["walking", "Walking minutes", 1, 0, 1440],
      ["coffee", "Office coffee cups", 1, 0, 30],
    ]
      .map(
        ([id, l, step, min, max]) =>
          `<label>${l}<input id="a_${id}" type="number" step="${step}" min="${min}" max="${max}" value="${d[id] ?? ""}"></label>`,
      )
      .join(
        "",
      )}</div><label>Milk amount (specify per cup or total)<input id="a_milk" maxlength="100" value="${esc(d.milk || "")}" placeholder="e.g. 1 tsp condensed milk per cup"></label><label>Dinner vegetables<select id="a_vegetables"><option value="">Not reported</option><option value="yes" ${d.vegetables === "yes" ? "selected" : ""}>Yes</option><option value="no" ${d.vegetables === "no" ? "selected" : ""}>No</option></select></label><label>Notes<input id="a_notes" maxlength="500" value="${esc(d.notes || "")}"></label><button type="submit">Save actual observations</button></form>`,
  );
  $("#activityForm").onsubmit = (e) => {
    e.preventDefault();
    const v = {};
    for (const k of ["weight", "steps", "walking", "coffee"]) {
      const s = $("#a_" + k).value;
      v[k] = s === "" ? null : Number(s);
    }
    for (const k of ["milk", "vegetables", "notes"]) v[k] = $("#a_" + k).value;
    updateDay(v);
    $("#modal").close();
    toast("Actual observations saved");
  };
}
function renderProgress() {
  const ds = Object.entries(state.days).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const ws = ds.filter(([d, v]) => v.weight != null);
  const recent = Array.from({ length: 7 }, (_, i) => {
    let d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6 + i);
    let s = d.toISOString().slice(0, 10);
    return [s, state.days[s]];
  });
  const max = Math.max(
    state.profile.calories,
    ...recent.map(([d, v]) => (v ? total(v) : 0)),
  );
  $("#view").innerHTML =
    `<div class="toolbar"><h2>Your recorded week</h2><span class="pill">Ending ${date}</span></div><div class="card"><h3>Logged calories</h3><p class="tiny">Partial logs are partial totals. No bar means no calorie entries, not no food.</p><div class="bars">${recent.map(([d, v]) => `<div class="bar-col"><span>${v?.entries.length ? number(total(v)) : "—"}</span><div class="bar" style="height:${v?.entries.length ? (total(v) / max) * 105 : 0}px"></div><span>${new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div>`).join("")}</div></div><div class="columns"><div class="card"><h2>Weight history</h2>${ws.length ? `<table><thead><tr><th>Date</th><th>Weight</th><th>BMI</th></tr></thead><tbody>${ws.map(([d, v]) => `<tr><td>${d}</td><td>${v.weight} kg</td><td>${bmi(v.weight, state.profile.height).toFixed(1)}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">No weigh-ins yet. Your starting baseline is a plan reference, not a dated measurement.</p>'}<button class="secondary" onclick="activity()">＋ Record weight</button></div><div class="card"><h2>Activity history</h2><table><thead><tr><th>Date</th><th>Steps</th><th>Walk</th></tr></thead><tbody>${
      ds
        .filter(([d, v]) => v.steps != null || v.walking != null)
        .map(
          ([d, v]) =>
            `<tr><td>${d}</td><td>${v.steps ?? "—"}</td><td>${v.walking == null ? "—" : v.walking + " min"}</td></tr>`,
        )
        .join("") || '<tr><td colspan="3">No activity recorded.</td></tr>'
    }</tbody></table></div></div><div class="card" style="margin-top:20px"><h2>Daily records</h2><table><thead><tr><th>Date</th><th>Calorie entries</th><th>Action</th></tr></thead><tbody>${ds
      .reverse()
      .map(
        ([d, v]) =>
          `<tr><td>${d}</td><td>${v.entries.length ? number(total(v)) + " kcal logged" : "Not estimated"}</td><td><button class="text" onclick="date='${d}';navigate('today')">View / edit →</button></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}
function renderSettings() {
  const p = state.profile;
  $("#view").innerHTML =
    `<div class="settings"><section class="card" style="margin-bottom:20px"><h2>Edit profile</h2><div class="profile-photo">${avatarHTML(identity, "avatar-lg")}<div><button type="button" class="secondary" id="changePhoto">📷 Change picture</button> ${getPhoto(identity.id) ? '<button type="button" class="text" id="removePhoto">Remove picture</button>' : ""}<input type="file" id="photoFile" accept="image/*" hidden><p class="tiny">Square pictures look best. Photos are cropped to the centre and saved on this browser only.</p></div></div><form id="nameForm"><label>Display name<input id="displayName" required maxlength="60" autocomplete="name" value="${esc(identity.name)}"></label><button type="submit">Save name</button></form><label>User ID (cannot be changed)<input readonly value="@${esc(identity.id)}"></label><p class="tiny">This is a local user ID, not a secure login. Profiles have separate meals, activity, weight and goals. Anyone with access to this browser can switch profiles. Records do not sync between devices.</p><button type="button" class="secondary" onclick="chooseUser()">Switch user →</button></section><section class="card"><h2>Your personal targets</h2><p class="tiny">Enter your own height, starting weight and targets. New accounts start with an empty diary. Targets are editable and are not a personalised prescription.</p><form id="profileForm"><div class="row">${profileFields
      .map(
        ([id, l, min, max, step]) =>
          `<label>${l}<input required id="p_${id}" type="number" min="${min}" max="${max}" step="${step}" value="${p[id] ?? ""}"></label>`,
      )
      .join(
        "",
      )}</div><button type="submit">Save goals</button></form></section><section class="card" style="margin-top:20px"><h2>Your data stays with you</h2><p class="tiny">This version saves in this browser only. Clearing browser data removes these records. Export a backup and restore it on another device. Import replaces only the selected user’s records. Other profiles are unaffected.</p><div class="actions"><button class="secondary" onclick="exportData()">↓ Export backup</button><button class="secondary" onclick="document.getElementById('import').click()">↑ Restore backup</button></div><input id="import" type="file" accept="application/json" hidden><p class="tiny">On iPhone, open in Safari and use Share → Add to Home Screen for an app-like shortcut. Apple Health readings must be entered manually.</p></section><section class="card danger-zone" style="margin-top:20px"><h2>Delete this profile</h2><p class="tiny">Permanently removes @${esc(identity.id)} and all of its records from this browser. Export a backup first if you may need them again. Other profiles are not affected.</p><button type="button" class="danger" id="deleteProfile">Delete profile…</button></section></div>`;
  $("#profileForm").onsubmit = (e) => {
    e.preventDefault();
    for (const [k] of profileFields) p[k] = Number($("#p_" + k).value);
    save();
    render();
    toast("Goals saved");
  };
  $("#import").onchange = importData;
  $("#deleteProfile").onclick = deleteProfile;
  $("#nameForm").onsubmit = (e) => {
    e.preventDefault();
    if (renameUser($("#displayName").value)) toast("Name updated");
  };
  $("#changePhoto").onclick = () => $("#photoFile").click();
  $("#photoFile").onchange = changePhoto;
  if ($("#removePhoto"))
    $("#removePhoto").onclick = () => {
      if (!confirm("Remove your profile picture?")) return;
      setPhoto(identity.id, null);
      toast("Picture removed");
    };
}
function renameUser(value) {
  const name = String(value ?? "")
    .trim()
    .slice(0, 60);
  if (!name) {
    alert("Please enter a name.");
    return false;
  }
  try {
    const users = getUsers().map((u) =>
      u.id === identity.id ? { ...u, name } : u,
    );
    localStorage.setItem(usersKey, JSON.stringify(users));
  } catch {
    alert("Unable to save the new name. Nothing was changed.");
    return false;
  }
  identity = { ...identity, name };
  showAccount(identity);
  render();
  return true;
}
function setPhoto(id, dataUrl) {
  try {
    if (dataUrl == null) localStorage.removeItem(photoKey(id));
    else if (validImage(dataUrl)) localStorage.setItem(photoKey(id), dataUrl);
    else return false;
  } catch {
    alert(
      "This picture is too large to save in the browser. Try a smaller one.",
    );
    return false;
  }
  if (identity?.id === id) {
    showAccount(identity);
    render();
  }
  return true;
}
// Crops the chosen image to a centred square and shrinks it to 320 px.
function changePhoto(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!/^image\//.test(f.type)) {
    alert("Please choose a photo (JPEG, PNG or similar).");
    return;
  }
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(320, side);
    const c = document.createElement("canvas");
    c.width = c.height = out;
    c.getContext("2d").drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    );
    if (setPhoto(identity.id, c.toDataURL("image/jpeg", 0.85)))
      toast("Picture updated");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("Unable to read this image. Try a JPEG or PNG photo.");
  };
  img.src = url;
}
function deleteProfile() {
  const typed = prompt(
    `This permanently deletes @${identity.id} and all of its records on this browser.\n\nType the user ID to confirm:`,
  );
  if (typed == null) return;
  if (typed.trim().toLowerCase() !== identity.id) {
    alert("The user ID did not match. Nothing was deleted.");
    return;
  }
  try {
    localStorage.setItem(
      usersKey,
      JSON.stringify(getUsers().filter((u) => u.id !== identity.id)),
    );
    localStorage.removeItem(dataKey(identity.id));
    localStorage.removeItem(photoKey(identity.id));
  } catch {
    alert("Unable to delete this profile. No records were changed.");
    return;
  }
  chooseUser();
  toast("Profile deleted");
}
function exportData() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            ...state,
            localUserId: identity.id,
            displayName: identity.name,
            ...(getPhoto(identity.id) ? { photo: getPhoto(identity.id) } : {}),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  a.download = "my-health-2027-" + identity.id + "-" + today() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Accepts backups from this app, including older exports that have no
// "version", missing goals, numbers saved as text or days without an
// entries list. Returns a clean state object, or null if the file is unusable.
function normalizeBackup(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  if (x.version != null && Number(x.version) !== 1) return null;
  if (!x.days || typeof x.days !== "object" || Array.isArray(x.days))
    return null;
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const src = x.profile && typeof x.profile === "object" ? x.profile : {};
  const profile = {};
  for (const [k, , min, max] of profileFields) {
    const v = num(src[k]);
    if (v === null) profile[k] = null;
    else if (Number.isFinite(v) && v >= min && v <= max) profile[k] = v;
    else return null;
  }
  const days = {};
  for (const [d, v] of Object.entries(x.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !v || typeof v !== "object")
      return null;
    const raw = v.entries ?? [];
    if (!Array.isArray(raw)) return null;
    const entries = [];
    for (const e of raw) {
      const item = {
        id: String(e?.id ?? ""),
        name: e?.name,
        portion: e?.portion,
        meal: e?.meal,
        kcal: num(e?.kcal),
        qty: num(e?.qty),
      };
      if (
        !/^[a-zA-Z0-9-]+$/.test(item.id) ||
        typeof item.name !== "string" ||
        typeof item.portion !== "string" ||
        !meals.includes(item.meal) ||
        !Number.isFinite(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.kcal) ||
        item.kcal < 0
      )
        return null;
      entries.push(item);
    }
    const day = { entries, reports: {} };
    if (v.reports && typeof v.reports === "object" && !Array.isArray(v.reports))
      for (const m of meals)
        if (v.reports[m] != null) day.reports[m] = String(v.reports[m]);
    for (const k of ["weight", "steps", "walking", "coffee"]) {
      const n = num(v[k]);
      if (n !== null && !(Number.isFinite(n) && n >= 0)) return null;
      day[k] = n;
    }
    for (const k of ["milk", "vegetables", "notes"])
      if (v[k] != null) day[k] = String(v[k]);
    days[d] = day;
  }
  return { version: 1, profile, days };
}
const validBackup = (x) => !!normalizeBackup(x);
async function importData(e) {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5000000) throw Error();
    const x = JSON.parse(await f.text());
    const clean = normalizeBackup(x);
    if (!clean) throw Error();
    if (
      x.localUserId &&
      x.localUserId !== identity.id &&
      !confirm(
        "This backup is from @" +
          x.localUserId +
          ". Import it into @" +
          identity.id +
          "?",
      )
    )
      return;
    if (
      !confirm(
        "Replace your account’s records with this backup? Only restore a backup belonging to you.",
      )
    )
      return;
    state = clean;
    save();
    if (validImage(x.photo)) setPhoto(identity.id, x.photo);
    render();
    toast("Backup restored");
  } catch {
    alert(
      "This is not a valid My Health 2027 backup. No records were changed.",
    );
  } finally {
    e.target.value = "";
  }
}
boot();
