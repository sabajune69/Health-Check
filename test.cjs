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
vm.runInContext(fs.readFileSync("app.js", "utf8"), c);
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
console.log(
  "PASS: user creation, duplicate IDs, isolation, persistence, switching, blank activity, BMI, portions, backups, vegetables, gain/lose/maintain goals, old backups, goal saving, profile deletion, rename and profile pictures",
);
