const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const elements = {},
  stored = {};
const c = {
  Intl,
  Date,
  Math,
  Number,
  String,
  JSON,
  Object,
  Array,
  structuredClone,
  crypto: require("crypto").webcrypto,
  localStorage: {
    getItem: (k) => stored[k] || null,
    setItem: (k, v) => (stored[k] = v),
    removeItem: (k) => delete stored[k],
  },
  document: {
    querySelector: (s) =>
      (elements[s] ??= {
        innerHTML: "",
        textContent: "",
        style: {},
        value: "",
        appendChild() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      }),
    querySelectorAll: () => [],
    createElement: () => ({}),
  },
  window: { scrollTo() {} },
  setTimeout() {},
  alert() {},
  confirm: () => true,
  prompt: () => c.promptAnswer,
};
vm.createContext(c);
vm.runInContext(
  fs.readFileSync("foods.js", "utf8") +
    "\n" +
    fs.readFileSync("app.js", "utf8"),
  c,
);
vm.runInContext(
  `
$('#newName').value='Saba';$('#newId').value='Saba';$('#newUser').onsubmit({preventDefault(){}});
if(identity.id!=='saba'||Object.keys(state.days).length)throw Error('New profile');
state.profile={height:165,baseline:74,goal:68,calories:1600,steps:4000,walking:15};updateDay({steps:2985,walking:null});
chooseUser();$('#newName').value='Sarah';$('#newId').value='sarah';$('#newUser').onsubmit({preventDefault(){}});
if(Object.keys(state.days).length||state.profile.height!==null)throw Error('Leaked profile');
state.profile={height:160,baseline:60,goal:60,calories:1800,steps:5000,walking:20};updateDay({steps:0});
openUser('saba');if(day().steps!==2985||day().walking!==null)throw Error('Persistence');
chooseUser();$('#newName').value='Duplicate';$('#newId').value='SABA';$('#newUser').onsubmit({preventDefault(){}});if(getUsers().length!==2)throw Error('Duplicate ID');
openUser('sarah');if(day().steps!==0)throw Error('Zero value');
if(bmi(74,165).toFixed(1)!=='27.2'||total({entries:[{kcal:301,qty:.25}]})!==75.25)throw Error('Calculations');
if(!validBackup(state))throw Error('Backup');chooseUser();navigate('today');if(state!==null)throw Error('Chooser navigation');
const fdates=[];const end=new Date(today()+'T12:00:00Z');for(let i=0;i<7;i++){const d=new Date(end);d.setUTCDate(d.getUTCDate()-i);fdates.push(d.toISOString().slice(0,10))}const sample={version:1,profile:{height:160,baseline:70,goal:68,calories:1600,steps:4000,walking:15},days:{}};for(let i=0;i<3;i++)sample.days[fdates[i]]={entries:[],reports:{Breakfast:'logged'},steps:4500,walking:20,weight:68};localStorage.setItem('my-health-family-data-sarah',JSON.stringify(sample));familyOverview(getUsers());if(!$('#familyOverview').innerHTML.includes('Reached weight goal')||!$('#familyOverview').innerHTML.includes('3 walks reached session goal')||!$('#familyTotals').innerHTML.includes('members with 3+ check-in days')||!$('#familyOverview').innerHTML.includes('Family walking minutes')||!$('#familyOverview').innerHTML.includes('Average reported steps')||!$('#familyOverview').innerHTML.includes('30 days'))throw Error('Family charts and achievements summary');familyOverview(getUsers(),30);if(!$('#familyOverview').innerHTML.includes('last 30 days'))throw Error('30-day view');
`,
  c,
);
assert(!fs.readFileSync("app.js", "utf8").includes("/api/me"));

// Regression tests for the audit fixes (Nov 2026)
vm.runInContext(
  `
openUser('saba');
activity();
if (!$('#modalBody').innerHTML.includes('<option value="yes"')) throw Error('Vegetables Yes option missing');

const gain = {height:165,baseline:60,goal:70,calories:1800,steps:5000,walking:20};
if (reachedGoal(61, gain) || !reachedGoal(70, gain) || goalText(61, gain) !== '9.0 kg to gain') throw Error('Weight-gain goal');
const lose = {height:165,baseline:80,goal:70,calories:1800,steps:5000,walking:20};
if (reachedGoal(71, lose) || !reachedGoal(69, lose) || goalText(75, lose) !== '5.0 kg to lose') throw Error('Weight-loss goal');
const keep = {height:165,baseline:60,goal:60,calories:1800,steps:5000,walking:20};
if (!reachedGoal(60.8, keep) || reachedGoal(62, keep)) throw Error('Maintain goal');

const extra = normalizeBackup({version:1,profile:{...gain,extra:1},days:{}});
if (!extra || 'extra' in extra.profile) throw Error('Unknown profile keys not stripped');
const old = normalizeBackup({profile:{height:'165',goal:70},days:{'2026-01-02':{steps:'1200',reports:{Lunch:'nasi lemak'}}}});
if (!old || old.profile.height !== 165 || old.profile.calories !== null || old.days['2026-01-02'].steps !== 1200 || old.days['2026-01-02'].entries.length !== 0) throw Error('Older backup not normalised');
if (normalizeBackup({version:2,profile:gain,days:{}}) || normalizeBackup({version:1,profile:{...gain,height:5},days:{}}) || normalizeBackup({days:{'bad':{}}})) throw Error('Invalid backup accepted');

state.profile = {...gain, extra: 1}; page = 'settings'; render();
for (const [k] of profileFields) $('#p_' + k).value = String(gain[k]);
$('#profileForm').onsubmit({preventDefault(){}});
if (state.profile.goal !== 70) throw Error('Save goals after import');

promptAnswer = 'WRONG'; deleteProfile();
if (!getUsers().some(u => u.id === 'saba')) throw Error('Deleted on wrong confirmation');
openUser('saba'); promptAnswer = 'SABA'; deleteProfile();
if (getUsers().some(u => u.id === 'saba') || localStorage.getItem(dataKey('saba')) !== null) throw Error('Delete profile');
if (!getUsers().some(u => u.id === 'sarah')) throw Error('Delete removed another profile');
if ($('#familyOverview').innerHTML.includes('onclick="openUser')) throw Error('Inline user-ID handler');
`,
  c,
);
// Edit profile: name and picture
vm.runInContext(
  `
openUser('sarah');
if (renameUser('   ') !== false || identity.name !== 'Sarah') throw Error('Blank name accepted');
if (!renameUser('  Sarah Aminah  ') || identity.name !== 'Sarah Aminah') throw Error('Rename');
if (getUsers().find(u => u.id === 'sarah').name !== 'Sarah Aminah') throw Error('Rename not saved');
if (!$('#accountName').textContent.includes('Sarah Aminah')) throw Error('Header name not updated');
renameUser('<img src=x onerror=alert(1)>');
if (avatarHTML(identity).includes('<img src=x') || !avatarHTML(identity).includes('&lt;')) throw Error('Avatar initial not escaped');
renameUser('Sarah Aminah');
const pic = 'data:image/jpeg;base64,' + 'A'.repeat(200);
if (setPhoto('sarah', 'javascript:alert(1)') !== false) throw Error('Bad picture accepted');
if (!setPhoto('sarah', pic) || getPhoto('sarah') !== pic) throw Error('Picture save');
if (!avatarHTML({id:'sarah',name:'S'}).includes('<img src="' + pic)) throw Error('Picture not shown');
setPhoto('sarah', null);
if (getPhoto('sarah') !== null || !avatarHTML({id:'sarah',name:'Sarah'}).includes('>S<')) throw Error('Picture remove');
setPhoto('sarah', pic); promptAnswer = 'sarah'; deleteProfile();
if (localStorage.getItem(photoKey('sarah')) !== null) throw Error('Picture left after delete');
`,
  c,
);
// Food library (Bank Kalori Makanan)
vm.runInContext(
  `
if (foods.length < 800) throw Error('Food list too short: ' + foods.length);
const catIds = FOOD_CATEGORIES.map(c => c[0]);
for (const f of foods) {
  if (!f.n || !f.s || !Number.isFinite(f.k) || f.k < 0 || !FOOD_SOURCES[f.src] || !f.c.length || !f.c.every(c => catIds.includes(c)) || (f.g != null && !(f.g > 0)))
    throw Error('Bad food row: ' + JSON.stringify(f));
}
const find = (q) => searchFoods(q).map(i => foods[i]);
const tt = find('teh tarik')[0];
if (tt.n !== 'Teh tarik' || tt.k !== 103) throw Error('Teh tarik should total 103 kcal, got ' + tt.k);
if (find('Air barli')[0].k !== 105) throw Error('Air barli total');
if (!find('chicken rice')[0].n.startsWith('Nasi ayam')) throw Error('chicken rice should list Nasi ayam first, got ' + find('chicken rice')[0].n);
if (find('mee goreng')[0].n !== 'Mi goreng') throw Error('mee goreng should list Mi goreng first, got ' + find('mee goreng')[0].n);
if (!find('nescafé').some(f => f.n.startsWith('Nescafe'))) throw Error('Accent-insensitive search');
if (find('roti canai')[0].n !== 'Roti canai' || find('roti c')[0].n !== 'Roti canai') throw Error('Name match ranks first');
if (find('fried rice')[0].n !== 'Nasi goreng') throw Error('fried rice -> Nasi goreng first, got ' + find('fried rice')[0].n);
if (searchFoods('', 'drink').some(i => !foods[i].c.includes('drink'))) throw Error('Category filter');
const lowFirst = sortedFoods('', 'fruit', 'low').map(i => foods[i].k);
if (lowFirst.some((k, i) => i && k < lowFirst[i - 1])) throw Error('Sort by kcal');
if (!find('Chicken boxing').length || find('Chicken boxing').length !== 1) throw Error('Duplicates not merged');
$('#newName').value = 'Foodie'; $('#newId').value = 'foodie'; $('#newUser').onsubmit({ preventDefault() {} });
entryForm(searchFoods('roti canai')[0]);
if (!$('#modalBody').innerHTML.includes('value="Roti canai"')) throw Error('Entry form prefill');
`,
  c,
);
// Tea break meal
vm.runInContext(
  `
if (meals.join('|') !== 'Breakfast|Lunch|Tea break|Dinner|Supper / snacks') throw Error('Meal order');
$('#newName').value = 'Tea'; $('#newId').value = 'teatime'; $('#newUser').onsubmit({ preventDefault() {} });
state.profile = {height:160,baseline:60,goal:58,calories:1700,steps:5000,walking:20}; save();
page = 'today'; render();
if (!$('#view').innerHTML.includes('☕</span>Tea break')) throw Error('Tea break section missing');
entryForm(searchFoods('kuih bakar')[0], 'Tea break');
if (!$('#modalBody').innerHTML.includes('<option selected>Tea break</option>') && !/<option[^>]*selected[^>]*>Tea break/.test($('#modalBody').innerHTML)) throw Error('Tea break not preselected');
const tb = normalizeBackup({version:1,profile:state.profile,days:{'2026-11-18':{entries:[{id:'t1',name:'Kuih bakar',portion:'1 potong',meal:'Tea break',kcal:150,qty:1}],reports:{'Tea break':'karipap'}}}});
if (!tb || tb.days['2026-11-18'].entries[0].meal !== 'Tea break' || tb.days['2026-11-18'].reports['Tea break'] !== 'karipap') throw Error('Tea break backup');
`,
  c,
);
// Sidebar before a profile is open: never a silent no-op
vm.runInContext(
  `
chooseUser(); toastText = '';
navigate('today');
if (state !== null || !/profile first/.test($('#toast').textContent)) throw Error('Today without profile gave no message');
navigate('foods');
if (!$('#view').innerHTML.includes('Browsing only') || !$('#foodResults').innerHTML.includes('Add')) throw Error('Food library not browsable without profile');
entryForm(0);
if (state !== null || !/Choose a profile/.test($('#toast').textContent)) throw Error('Add without profile not guarded');
`,
  c,
);
// Release stamp: every local CSS/JS file in index.html must share one ?v= value
{
  const html = fs.readFileSync("index.html", "utf8");
  const v = [
    ...html.matchAll(
      /(?:style\.css|foods\.js|app\.js|firebase-config\.js|cloud\.js)\?v=([\w.-]+)/g,
    ),
  ].map((m) => m[1]);
  if (v.length !== 5 || new Set(v).size !== 1)
    throw Error(
      "index.html: style.css, foods.js, app.js, firebase-config.js and cloud.js need the same ?v= version",
    );
}
console.log(
  "PASS: user creation, duplicate IDs, isolation, persistence, switching, blank activity, BMI, portions, backups, vegetables, gain/lose/maintain goals, old backups, goal saving, profile deletion, rename, profile pictures, the food library, tea break and sidebar without a profile",
);
