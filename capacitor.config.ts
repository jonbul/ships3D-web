import type { CapacitorConfig } from '@capacitor/cli'

// The Android app (android/, built by CI into an APK on each release) is a
// window onto the deployed site rather than a copy of it: it loads
// SHIPS_APP_URL, by default the production site. That keeps the app on the
// site's own origin, so the API's CORS list, the SameSite=Lax session cookie
// and the game websocket's origin check all work as they do in a browser,
// and the app is always the deployed version. dist/ is still bundled because
// Capacitor needs a webDir, but it isn't what the app shows.
const url = process.env.SHIPS_APP_URL ?? 'https://jonbul.ddns.net:5173'

const config: CapacitorConfig = {
  appId: 'io.github.jonbul.ships3d',
  appName: 'Ships 3D',
  webDir: 'dist',
  server: {
    url,
    // Links to the API (e.g. its /status page to accept the certificate)
    // open inside the app too, not in the browser.
    allowNavigation: [new URL(url).hostname],
  },
}

export default config
