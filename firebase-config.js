// Firebase web settings for the family cloud (Firebase console → Project
// settings → Your apps → My Health web). These identify the project; they
// are not secrets. Access is protected by Google sign-in and firestore.rules.
// Set to null to run in browser-only mode.

// Family cloud on/off switch. It was on hold (KIV) on 18 Nov 2026 after
// Google sign-in problems on phones, and switched back on for a trial with
// the repaired sign-in guidance. Set to false to put it on hold again; the
// Firebase project, family group and rules are kept either way.
window.CLOUD_SYNC_ON = true;

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBA7nRXz3iVzscw5WOHUSliVd-j327FgLU",
  authDomain: "my-health-family.firebaseapp.com",
  projectId: "my-health-family",
  storageBucket: "my-health-family.firebasestorage.app",
  messagingSenderId: "431942090620",
  appId: "1:431942090620:web:d1a98ff9a9664a3a7eeef9",
};
