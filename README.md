# My Health 2027 — Family Edition

A simple, private health diary for the whole family. Each person gets their own profile to log meals, steps, walking and weight, and a shared family page shows everyone's progress side by side.

It runs entirely in the web browser. There is no account to sign up for, no server, no app store and nothing to install. All records stay on the phone or computer where they were entered.

> Personal tracking only — not a medical diagnosis. Food calories are estimates; portion size, oil and recipes all make a difference.

---

## What it does

| Area | What you can do |
|---|---|
| **Family page** | See each member's check-ins, walking minutes, latest steps, latest weight and BMI for the last 7 or 30 days, with family charts and earned milestones. |
| **Today** | Log food by meal (breakfast, lunch, tea break, dinner, supper/snacks), record steps, walking minutes, weight, coffee, milk and whether you had vegetables at dinner. |
| **Food library** | 820 Malaysian foods and drinks from the *Bank Kalori Makanan* table, shown as a sortable list: serving, weight, kcal, kcal per 100 g and source. Filter by category, search in Malay or English, and add any row to your diary. Add your own from a food label. |
| **Progress** | Your last 7 days of logged calories, full weight history with BMI, activity history and every day you recorded. |
| **My goals** | Edit your display name and profile picture. Set height, starting weight, goal weight, daily calories, daily steps and walking-session length. Export or restore a backup, or delete the profile. |

### Milestones on the family page
- **Logged 3 days in period** — any real check-in on at least 3 days.
- **3 walks reached session goal** — walking minutes met your own session goal on 3 days.
- **Reached weight goal** — your latest recorded weight has reached your goal. This works in either direction:
  - *Losing weight* (goal below starting weight): reached when at or below the goal.
  - *Gaining weight* (goal above starting weight): reached when at or above the goal.
  - *Maintaining* (goal equals starting weight): reached when within ±1 kg of the goal.

The app never fills in gaps. A blank day means "not reported", not zero.

---

## Getting started

1. Open the site (or `index.html` directly).
2. Under **Create a new user**, enter your name and a user ID (3–30 letters, numbers, `_` or `-`; capitals are ignored).
3. You'll be taken to **My goals** — fill in your targets and press **Save goals**.
4. Start logging from **Today**.

To switch person, press **Switch user** at the top right.

**On iPhone:** open the site in Safari → Share → **Add to Home Screen** for an app-like icon. Apple Health readings need to be typed in manually.

---

## Food library

The library comes from the **Bank Kalori Makanan** calorie table (`bank_kalori_makanan.pdf`), grouped into its sections: rice & noodles, chicken & meat, fish & seafood, vegetables, fruit, beans & nuts, kuih & desserts, Western food, drinks, jams & spreads, others and vegetarian. An extra **Tambahan** group holds add-ons such as sugar, condensed milk and creamer.

- **Search** in Malay or English: *chicken rice* finds *Nasi ayam*, *mee* finds *Mi*, *kuey teow* finds *Kuetiau*, and accents are ignored.
- **Sort** by best match, name, lowest or highest kcal, or lowest kcal per 100 g (useful for comparing foods of different sizes).
- **Sources** are shown on each row: NP = Nutritionist Pro v2.1.13, NC = Nutrient Composition of Malaysian Foods (4th ed., 1997), Atlas = Atlas Makanan (2009). Rows marked **Estimate** are a few everyday foods the table does not cover (e.g. roti telur, onigiri, banana).
- **Drinks are complete:** where the table lists a drink as a 0 kcal base plus add-ons, the library shows the total. For example, *Teh tarik* is 103 kcal including its condensed and evaporated milk.
- The **serving guide** (under *Sources and serving guide*) explains Malay serving words such as *senduk*, *mangkuk* and *sudu teh*.

Values are averages. Recipes, oil and portion size change the real number, so match the serving and adjust the number of servings.

**Updating the list:** edit `foods.js` directly (one food per line), or regenerate it from a new copy of the PDF with `python3 tools/build_foods.py bank_kalori_makanan.pdf foods.js` (needs `pip install pdfplumber`).

---

## Editing your profile

Open **My goals → Edit profile**:
- **Display name** — type a new name and press **Save name**. It updates the top bar, the family page and the profile list.
- **Profile picture** — press **📷 Change picture** and choose a photo. It is cropped to a centred square and shown on the family page, the profile list and the top bar. **Remove picture** goes back to your initial.
- The **user ID** can't be changed, because your records are saved under it.

Pictures are kept on this browser only and are included in your backup file, so restoring a backup on a new phone brings your picture back.

---

## Changing the header photo

There are two ways, depending on who should see the new photo:

- **Just on this phone/browser** — on the family page, press **🖼 Change photo** on the header and choose a picture. It is resized automatically and saved in this browser only. Press **Reset** to go back to the default.
- **For everyone who opens the site** — replace `family-header.jpg` in the repository with your own photo, keeping the same file name. A wide landscape photo (about 1600 × 530 px, under ~300 KB) works best; the left side is darkened for the text, so keep faces towards the centre or right.

---

## Family Drive: one place for the whole family’s data

Every profile and diary, from every connected phone or computer, is saved to **one Google Sheet in the family admin’s Google Drive**. Family members don’t need a Google account or a sign-in. Each device is connected once with the **family passcode**.

**Connect a device:** open the site in Chrome or Safari, type the family passcode in **Connect this device to the family** on the family page, and press **Connect**. If the device already has profiles, the app offers to save them to the family Drive. A profile with the same user ID as an existing family profile is treated as the same person, and its diary is combined day by day.

**How syncing works**
- Changes are saved to the Sheet a second or two after they’re made. Other devices pick them up every 30 seconds, when the app is reopened, or with **Sync now**.
- The app keeps working offline. Changes wait on the device (**Offline · will sync**) and are sent when it reconnects.
- If the same day is edited on two devices, the most recent edit wins.
- The sidebar shows **Saved to family Drive**, **Saving to family Drive…**, **Offline · will sync** or **This device only**.

**For the admin**
- The Sheet **My Health Family – data** has three tabs:
  - **profiles:** one row per person
  - **days:** one row per person per day, with readable weight, steps, walking, calories and foods, plus the full record
  - **header:** the family header photo, split into parts
- Google Sheets keeps version history (**File → Version history**).
- The passcode is kept only in the Apps Script’s **Script Properties** (key `PASSCODE`), never in this public repository.
- **To change the passcode:** edit `PASSCODE` in the script’s Script Properties. Each device then asks for the new passcode once.
- After 20 wrong passcodes in 10 minutes, all devices are locked out for 10 minutes.
- **Security:** anyone who has the passcode can read and change the family’s records. Choose one that isn’t used anywhere else, and change it if it leaks. Each connected device keeps the passcode in its browser, so use **Disconnect** on shared or borrowed devices.
- **Disconnect** can also remove the family’s records from that device. It refuses while changes haven’t reached the Drive yet.

**Setup (already done for this family):**
1. Create a Google Sheet, then **Extensions → Apps Script**.
2. Paste `apps-script/Code.gs` and save.
3. In **Project Settings → Script Properties**, add `PASSCODE`.
4. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*, and authorise it.
5. Put the `/exec` web address in `drive-config.js`.

The script only has access to its own Sheet (`@OnlyCurrentDoc`), not the rest of your Drive.

### Google sign-in (Firebase): on hold

An earlier version synced through Firebase with Google sign-in. Several family members couldn’t sign in on their phones (Google blocks sign-in in WhatsApp’s and other apps’ built-in browsers), so it is **on hold (KIV)**: `window.CLOUD_SYNC_ON = false` in `firebase-config.js`. The project `my-health-family`, `cloud.js` and `firestore.rules` are kept. To switch back, set it to `true` and set `DRIVE_SYNC_URL` to `""`.

### Moving to another phone or a new site address
1. On the old device: **My goals → Export backup** (downloads a `.json` file).
2. On the new device: create your profile, then **My goals → Restore backup** and choose the file.

A restore replaces only the profile you're signed into; other profiles are untouched. Backups from earlier versions of this app are accepted — missing goals are left blank and you'll be asked to fill them in on **My goals**.

### Deleting a profile
**My goals → Delete profile…**, then type the user ID to confirm. This removes that person and all their records from this browser only.

---

## Dates and time zone

"Today" follows the time zone of the device being used, so family members abroad log against their own local date.

---

## Publishing with GitHub Pages

1. Make sure these files are in the repository root: `index.html`, `foods.js`, `app.js`, `drive-sync.js`, `drive-config.js`, `cloud.js`, `firebase-config.js`, `vendor/`, `style.css`, `family-header.jpg`, `.nojekyll`.
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Share the Pages URL with the family. No build step is needed.

---

## For developers

| File | Purpose |
|---|---|
| `index.html` | Page shell: sidebar, header, dialog and footer. |
| `foods.js` | Food library data (generated from the calorie table). |
| `tools/build_foods.py` | Rebuilds `foods.js` from the PDF. |
| `drive-sync.js` | Family Drive sync: passcode connection and two-way sync with the family Google Sheet. |
| `drive-config.js` | Web address of the family's Apps Script (not a secret). |
| `apps-script/Code.gs` | The Google Apps Script that saves to the family Sheet. |
| `cloud.js` | Firebase Google sign-in sync (on hold). |
| `firebase-config.js` | Firebase project settings (public identifiers, not secrets). Set to `null` for browser-only mode. |
| `firestore.rules` | Database security rules; paste into Firebase console → Firestore → Rules → Publish after changing. |
| `vendor/firebase-13.4.0.js` | Firebase SDK bundled locally (app, auth, firestore). |
| `app.js` | All app logic: profiles, diary, family overview, charts, goals, backups and header photo. Plain JavaScript, no libraries. |
| `style.css` | Layout and styling, including mobile layout under 700 px. |
| `family-header.jpg` | Default header photo. |
| `test.cjs` | Automated tests (Node.js, no dependencies). |

Run the tests:

```bash
node test.cjs
```

**Releasing a change:** in `index.html`, raise the `?v=` number on `style.css`, `foods.js`, `app.js`, `firebase-config.js`, `cloud.js`, `drive-config.js` and `drive-sync.js` (keep them all the same; `node test.cjs` checks this). Browsers then load the new files together instead of mixing new and cached copies.

Browser storage keys: `my-health-family-users-v1` (profile list), `my-health-family-data-<id>` (one per profile), `my-health-family-photo-<id>` (profile picture) and `my-health-family-header-v1` (custom header photo).

### Not included
- No automatic sync with Apple Health, Google Fit or Notion.
- Calorie values are estimates, not laboratory measurements.
