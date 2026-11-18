# My Health 2027 — Family HTML edition

Standalone HTML, CSS and JavaScript. No ChatGPT sign-in, backend, API key or installation is needed.

## Use
Open index.html, choose Create a new user, and enter a name and user ID. Fill in personal targets, then log meals and activity. The landing page compares each profile’s last 7 days of actual check-ins, walking, latest steps, latest measured weight and BMI. It highlights earned milestones: 3 check-in days, 3 walks meeting the user’s session target, and a recorded weight at or below their goal. Use Switch user to select a local profile. IDs ignore case and must contain 3–30 letters, numbers, underscores or hyphens.

The family overview only combines profiles on the same browser; it cannot see other phones. Profiles are local labels, not secure accounts. Anyone using the same browser can open them. Records remain on that browser and do not sync to other devices, even with the same user ID. Export backups regularly; clearing browser data can erase records.

## Publish with GitHub Pages
Upload index.html, app.js, style.css, family-header.png and .nojekyll to a GitHub repository. Enable Pages for the main branch and root folder in repository settings. Share the resulting Pages URL with family. No build is required. README and test.cjs may also be uploaded; tests run with `node test.cjs`.

## Move existing records
In the old app, export a backup from My goals. In this edition, create your local user, set your targets, and use My goals > Restore backup. Restore replaces only the selected profile. Old-format backups are supported. A different website address uses different browser storage, so export and restore is required.

No personal health history, names, email addresses or passwords are bundled. Each new user begins with an empty diary. Food values remain estimates. Apple Health and Notion are not automatically synced.
