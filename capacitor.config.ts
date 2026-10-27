import type { CapacitorConfig } from '@capacitor/cli'

// The Android app (android/, built by CI into an APK on every run) carries
// its own copy of the site, dist/, so each APK is exactly the build it came
// from. The app serves it as https://SHIPS_APP_HOST (by default the
// production host), and the site finds the API at that host on port 3000 as
// it does in a browser. Being the API's own host (only the port differs)
// keeps the API same-site, so the SameSite=Lax session cookie is sent; the
// server must allow the origin https://SHIPS_APP_HOST (no port) in
// SHIPS3D_ALLOWED_ORIGINS, for CORS and the game websocket.
const host = process.env.SHIPS_APP_HOST ?? 'jonbul.ddns.net'

const config: CapacitorConfig = {
  appId: 'io.github.jonbul.ships3d',
  appName: 'Ships 3D',
  webDir: 'dist',
  server: {
    hostname: host,
    androidScheme: 'https',
    // Links to the API (e.g. its /status page to accept the certificate)
    // open inside the app too, not in the browser.
    allowNavigation: [host],
  },
}

export default config
