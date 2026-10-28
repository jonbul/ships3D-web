# ships-vue-3d

Web client for **Ships 3D**: a 3D ship editor and a multiplayer space game.
Vue 3 + TypeScript + Vite + three.js. Backend: [ships-go-3d](../ships-go-3d).

## Run

```bash
npm install
npm run dev        # https://localhost:5173 (the 2D site's port: run one at a time)
npm test           # vitest: ship model, flight model, undo history
npm run build      # type-check + production build
npm run lint
```

The API defaults to this page's host on port 3000 (`VITE_API_PORT` changes
the port, `VITE_API_URL` the whole base URL). `ssl/` is a symlink to the workspace's `../files/ssl`: the
dev server must be HTTPS because the session cookie is `Secure`.

## Android app

`android/` is a [Capacitor](https://capacitorjs.com) app that opens the
production site (`https://jonbul.ddns.net:5173`, or `SHIPS_APP_URL` at build
time; see `capacitor.config.ts`). It is a window onto the site, not a copy, so
it always runs the deployed version and talks to the API exactly as the site
does. CI builds it on every run and attaches it to the release (`ships-3d-snapshot.apk` on
`latest-snapshot`, `ships-3d-release.apk` on `v<version>`).
The site itself serves it too, at `/ships-3d.apk`.

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # needs JDK 21 and the Android SDK
```

The APK is signed with a throwaway debug key unless the repository has the
secrets `ANDROID_KEYSTORE_BASE64` (the keystore, base64), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, in which case it is a signed
release build. Its version comes from `metadata.properties`.

## Layout

- `src/views/`, `src/components/` — Vue pages: home, login, register,
  profile, projects, editor, game.
- `src/api/` — typed fetch wrappers for ships-go-3d.
- `src/shared/` — the ship model (mirrors `ships-go-3d/models/project3d.go`),
  the three.js mesh builder shared by editor, thumbnails and game, and the
  single offscreen thumbnail renderer.
- `src/editor/` — the editor viewport (`Editor.ts`) and undo history. No Vue
  inside: `EditorView.vue` hosts it and draws the panels.
- `src/game/` — the game. **No Vue, no router, no app state**: only
  three.js and the DOM, so it can be embedded in a phone app's webview later.
  `Game` takes a container and options and must be `destroy()`ed. Input sits
  behind `InputSource`: `KeyboardMouseInput` (desktop) and `TouchInput`
  (phones: throttle slider, fire/roll, and a stick or tilt via `tilt.ts`),
  merged by `CombinedInput`. The host turns phone controls on with
  `options.touch` (GameView does it for a coarse pointer). Locking on and
  missile homing are pure functions in `missile.ts`; the missile button is
  the HUD's, for both mouse and touch (and F). The protocol (`protocol.ts`) mirrors `ships-go-3d/game/protocol.go`.

## Conventions

- Ships face **+Z** with **+Y up**. Every part is modelled in a unit cube,
  which is what lets client and server compute the same bounding radius.
  Imported `.glb` models are fitted into it too (`models.ts`).
- Part geometries/materials are shared caches (`shipMesh.ts`, and
  `models.ts` for imported models): never dispose them.
- Player names come from strangers: render them as text only (Vue
  interpolation, `textContent`), never `innerHTML`.
