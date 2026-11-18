/**
 * @OnlyCurrentDoc
 *
 * My Health Family: Google Sheet sync (Apps Script web app).
 *
 * The app on each family phone sends changes here with the family passcode;
 * this script, running as the Sheet's owner, saves them into this Sheet and
 * returns what changed on other devices. The passcode lives only in this
 * script's Script Properties (key PASSCODE), never in the public website.
 *
 * Tabs:
 *   profiles  one row per person: name, goals, picture
 *   days      one row per person per day: readable columns + full record
 *   header    the family header photo, split into parts
 * Every row has "at" (when it was edited, device time; the latest edit wins)
 * and "v" (a change counter, so devices only download what is new).
 *
 * Setup: Project Settings → Script Properties → add PASSCODE.
 *        Deploy → New deployment → Web app → Execute as: Me,
 *        Who has access: Anyone. Put the /exec URL in drive-config.js.
 */

var TABS = {
  profiles: ["id", "name", "updated", "at", "v", "deleted", "goals", "photo"],
  days: ["profile", "date", "weight", "steps", "walking", "kcal", "items", "updated", "at", "v", "data"],
  header: ["part", "data"],
};
var CELL_MAX = 49000; // a Sheets cell holds up to 50,000 characters
var MAX_FAILS = 20; // wrong passcodes allowed per 10 minutes (all devices)

function doGet() {
  return json_({ ok: true, app: "My Health Family sync" });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: "bad-request" });
  }
  var pass = checkPass_(req && req.pass);
  if (pass !== "ok") return json_({ error: pass });
  try {
    if (req.action === "ping") return json_({ ok: true, v: version_() });
    if (req.action === "sync") return json_(sync_(req));
    return json_({ error: "unknown-action" });
  } catch (err) {
    return json_({ error: "server", message: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function digest_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

function checkPass_(p) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("fails") || 0);
  if (fails >= MAX_FAILS) return "too-many-attempts";
  var want = PropertiesService.getScriptProperties().getProperty("PASSCODE");
  if (!want) return "not-set-up";
  if (typeof p === "string" && digest_(p) === digest_(want)) return "ok";
  cache.put("fails", String(fails + 1), 600);
  return "wrong-passcode";
}

function version_() {
  return Number(PropertiesService.getScriptProperties().getProperty("V") || 0);
}

function tab_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    // Keep IDs, dates and stored records as plain text (Sheets would turn
    // "2026-11-18" into a date and "007" into 7).
    var textCols = { profiles: ["A", "C", "G", "H"], days: ["A", "B", "H", "K"], header: ["B"] }[name];
    textCols.forEach(function (c) {
      sh.getRange(c + ":" + c).setNumberFormat("@");
    });
  }
  return sh;
}

function rows_(sh) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
}

// A cell as plain text; dates the Sheet converted anyway become yyyy-MM-dd.
function text_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone() || "Asia/Kuala_Lumpur", "yyyy-MM-dd");
  return String(v);
}

function stamp_(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone() || "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm");
}

function sync_(req) {
  var push = req.push || {};
  var writes =
    (push.profiles || []).length || (push.days || []).length || (push.deleted || []).length || push.header;
  if (writes) {
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      write_(push);
    } finally {
      lock.releaseLock();
    }
  }
  var v = version_();
  var since = Number(req.since) || 0;
  if (since >= v) return { v: v, profiles: [], days: [], header: null };
  var res = readSince_(since);
  res.v = v;
  return res;
}

function write_(push) {
  var props = PropertiesService.getScriptProperties();
  var v = version_();
  var next = function () {
    v += 1;
    return v;
  };

  // Profiles (and deletions)
  var ps = tab_("profiles");
  var prow = rows_(ps);
  var pIndex = {};
  prow.forEach(function (r, i) {
    pIndex[text_(r[0])] = i;
  });
  var setProfile = function (id, values) {
    if (id in pIndex) ps.getRange(pIndex[id] + 2, 1, 1, values.length).setValues([values]);
    else {
      ps.appendRow(values);
      pIndex[id] = Object.keys(pIndex).length;
      prow.push(values);
    }
  };
  var deletedNow = {};
  (push.deleted || []).forEach(function (d) {
    var id = String(d.id || "");
    if (!/^[a-z0-9_-]{3,30}$/.test(id)) return;
    var cur = id in pIndex ? prow[pIndex[id]] : null;
    if (cur && Number(cur[3]) > Number(d.at)) return;
    setProfile(id, [id, "", stamp_(d.at), Number(d.at), next(), true, "", ""]);
    deletedNow[id] = true;
  });
  (push.profiles || []).forEach(function (p) {
    var id = String(p.id || "");
    if (!/^[a-z0-9_-]{3,30}$/.test(id)) return;
    var cur = id in pIndex ? prow[pIndex[id]] : null;
    if (cur && Number(cur[3]) > Number(p.at)) return; // stored copy is newer
    var photo = typeof p.photo === "string" && p.photo.length <= CELL_MAX ? p.photo : "";
    setProfile(id, [
      id,
      String(p.name || id).slice(0, 60),
      stamp_(p.at),
      Number(p.at) || Date.now(),
      next(),
      false,
      JSON.stringify(p.profile || {}),
      photo,
    ]);
  });

  // Diary days
  var ds = tab_("days");
  var drow = rows_(ds);
  var dIndex = {};
  drow.forEach(function (r, i) {
    dIndex[text_(r[0]) + "|" + text_(r[1])] = i;
  });
  var appended = [];
  (push.days || []).forEach(function (d) {
    var id = String(d.id || "");
    var date = String(d.date || "");
    if (!/^[a-z0-9_-]{3,30}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || deletedNow[id]) return;
    var key = id + "|" + date;
    var cur = key in dIndex ? drow[dIndex[key]] : null;
    if (cur && Number(cur[8]) > Number(d.at)) return;
    var day = d.data || {};
    var entries = Array.isArray(day.entries) ? day.entries : [];
    var kcal = entries.reduce(function (s, x) {
      return s + (Number(x.kcal) || 0) * (Number(x.qty) || 0);
    }, 0);
    var items = entries
      .map(function (x) {
        return x.meal + ": " + x.name + (Number(x.qty) !== 1 ? " ×" + x.qty : "");
      })
      .join("; ");
    var values = [
      id,
      date,
      day.weight == null ? "" : day.weight,
      day.steps == null ? "" : day.steps,
      day.walking == null ? "" : day.walking,
      Math.round(kcal),
      items.slice(0, 2000),
      stamp_(d.at),
      Number(d.at) || Date.now(),
      next(),
      JSON.stringify(day),
    ];
    if (values[10].length > CELL_MAX) return; // far beyond any real day
    if (cur) {
      ds.getRange(dIndex[key] + 2, 1, 1, values.length).setValues([values]);
      drow[dIndex[key]] = values;
    } else {
      dIndex[key] = drow.length + appended.length;
      appended.push(values);
    }
  });
  if (appended.length) ds.getRange(ds.getLastRow() + 1, 1, appended.length, appended[0].length).setValues(appended);

  // A deleted person's diary rows are removed from the Sheet.
  if (Object.keys(deletedNow).length) {
    var keep = rows_(ds).filter(function (r) {
      return !deletedNow[text_(r[0])];
    });
    var last = ds.getLastRow();
    if (last > 1) ds.getRange(2, 1, last - 1, ds.getLastColumn()).clearContent();
    if (keep.length) ds.getRange(2, 1, keep.length, keep[0].length).setValues(keep);
  }

  // Header photo
  if (push.header && Number(push.header.at) > Number(props.getProperty("HEADER_AT") || 0)) {
    var hs = tab_("header");
    var hl = hs.getLastRow();
    if (hl > 1) hs.getRange(2, 1, hl - 1, 2).clearContent();
    var img = typeof push.header.image === "string" ? push.header.image : "";
    var parts = [];
    for (var i = 0; i < img.length; i += CELL_MAX) parts.push([parts.length + 1, img.slice(i, i + CELL_MAX)]);
    if (parts.length) hs.getRange(2, 1, parts.length, 2).setValues(parts);
    props.setProperty("HEADER_AT", String(Number(push.header.at)));
    props.setProperty("HEADER_V", String(next()));
  }

  props.setProperty("V", String(v));
}

function readSince_(since) {
  var props = PropertiesService.getScriptProperties();
  var profiles = rows_(tab_("profiles"))
    .filter(function (r) {
      return Number(r[4]) > since;
    })
    .map(function (r) {
      var goals = {};
      try {
        goals = JSON.parse(r[6] || "{}");
      } catch (e) {}
      return {
        id: text_(r[0]),
        name: String(r[1]),
        at: Number(r[3]),
        deleted: r[5] === true || r[5] === "TRUE",
        profile: goals,
        photo: String(r[7] || ""),
      };
    });
  var days = rows_(tab_("days"))
    .filter(function (r) {
      return Number(r[9]) > since;
    })
    .map(function (r) {
      var data = {};
      try {
        data = JSON.parse(r[10] || "{}");
      } catch (e) {}
      return { id: text_(r[0]), date: text_(r[1]), at: Number(r[8]), data: data };
    });
  var header = null;
  if (Number(props.getProperty("HEADER_V") || 0) > since) {
    var parts = rows_(tab_("header"));
    header = {
      at: Number(props.getProperty("HEADER_AT") || 0),
      image: parts
        .sort(function (a, b) {
          return a[0] - b[0];
        })
        .map(function (r) {
          return String(r[1]);
        })
        .join(""),
    };
  }
  return { profiles: profiles, days: days, header: header };
}
