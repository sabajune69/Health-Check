# My Health 2027 — Family Edition

A simple, private health diary for the whole family. Each person gets their own profile to log meals, steps, walking and weight, and a shared family page shows everyone's progress side by side.

It runs entirely in the web browser. There is no account to sign up for, no server, no app store and nothing to install. All records stay on the phone or computer where they were entered.

> Personal tracking only — not a medical diagnosis. Food calories are estimates; portion size, oil and recipes all make a difference.

---

## What it does

| Area | What you can do |
|---|---|
| **Family page** | See each member's check-ins, walking minutes, latest steps, latest weight and BMI for the last 7 or 30 days, with family charts and earned milestones. |
| **Today** | Log food by meal (breakfast, lunch, dinner, supper/snacks), record steps, walking minutes, weight, coffee, milk and whether you had vegetables at dinner. |
| **Food library** | ~35 common Malaysian foods and drinks with calories per serving. Items marked *MOH reference* come from the Ministry of Health Malaysia; the rest are editable starter estimates. Add your own from a food label. |
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

## Your data and privacy

- **Stored only in this browser.** Nothing is uploaded anywhere. Different phones, different browsers, and even a different website address each have separate storage — records do **not** sync, even with the same user ID.
- **Profiles are not passwords.** Anyone using the same browser can open any profile. Don't use a shared device if that's a concern.
- **Clearing browser data erases records.** Export a backup regularly from **My goals → Export backup**.
- No names, health history, email addresses or passwords come bundled with the app. Every new profile starts empty.

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

1. Make sure these files are in the repository root: `index.html`, `app.js`, `style.css`, `family-header.jpg`, `.nojekyll`.
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Share the Pages URL with the family. No build step is needed.

---

## For developers

| File | Purpose |
|---|---|
| `index.html` | Page shell: sidebar, header, dialog and footer. |
| `app.js` | All app logic: profiles, diary, family overview, charts, goals, backups and header photo. Plain JavaScript, no libraries. |
| `style.css` | Layout and styling, including mobile layout under 700 px. |
| `family-header.jpg` | Default header photo. |
| `test.cjs` | Automated tests (Node.js, no dependencies). |

Run the tests:

```bash
node test.cjs
```

Browser storage keys: `my-health-family-users-v1` (profile list), `my-health-family-data-<id>` (one per profile), `my-health-family-photo-<id>` (profile picture) and `my-health-family-header-v1` (custom header photo).

### Not included
- No automatic sync with Apple Health, Google Fit or Notion.
- No cloud backup or sharing between devices.
- Calorie values are estimates, not laboratory measurements.
