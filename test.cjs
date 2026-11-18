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
  },
  document: {
    querySelector: (s) =>
      (elements[s] ??= {
        innerHTML: "",
        textContent: "",
        style: {},
        value: "",
        appendChild() {},
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
console.log(
  "PASS: user creation, duplicate IDs, isolation, persistence, switching, blank activity, BMI, portions and backups",
);
