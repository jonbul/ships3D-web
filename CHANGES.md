CHANGES
=======
Version 0.10.0 - 2026-10-27
------------------
Homing missiles. Needs ships-go-3d 0.9.0.

- Keep an enemy close to your crosshair (within about 11°, and nearer than
  700 u) for 2 seconds to lock on to it. A dashed box closes in around it
  while locking, and turns into a red LOCKED box once locked. The lock holds
  while the enemy stays roughly ahead, and breaks when it gets away.
- Once locked, the MISSILE button appears: press it, or F on a keyboard. The
  missile chases the locked ship until it hits it (it turns faster than any
  ship, and flies almost twice as fast), or runs out of fuel after 8
  seconds. It takes 3 life, a bullet 1.
- One missile every 10 seconds: the button counts down while it reloads.
- "Missile incoming!" blinks while an enemy missile is after you.
- In the assault, attackers lock on to the mothership and gunners on
  attackers; a missile is one hit, like a bullet.
- Every player sees the missiles, with a smoke trail. In English, Spanish
  and Basque.

Version 0.9.0 - 2026-10-20
------------------
What the Nintendo 3DS version had and the browser didn't, so both feel like
the same game.

- Sound, made in code with the Web Audio API (no files): shots, yours and
  others' (quieter), hits, explosions, the force field, menu clicks, a looping
  chiptune track and the engine's hum, which rises with the speed. Volumes for
  effects and music on the Play page, remembered in the browser. Browsers only
  allow sound after a click, so it starts with Launch.
- The world's edge is a force field: as you near it, the face of its grid
  nearest you fills in, more and more, and the camera draws back.
- Running into the edge flashes the struck face, sends a blue shock wave
  across the field, throws sparks and shakes the camera.
- The copilot, a little robot, warns that you're leaving the combat arena.
  Keep heading out and it takes the helm: it turns you back toward the middle,
  softly, with your controls and guns set aside until you face inward.
- Being hit flashes the screen's edge red and shakes the camera a little.
- The hangar: on the Play page your ship turns on a platform floating in
  space, lit by sweeping spotlights. The arrows, the arrow keys or a swipe go
  through the ships, Enter launches. The lists of ships stay below it.
- The 3DS's pixel-art look across the site: pixel fonts (VT323, Silkscreen,
  Press Start 2P, under the OFL, served with the site), windows of night-blue
  glass with a light edge and a hard shadow, a sky-blue accent.
- Playing feels like the 3DS game: the Play page fills the screen with live
  space and pixel-art windows. Choose the mode (big icons, the arrow keys and
  Enter, or a click), then the ship in the hangar, then launch. Settings
  (volumes, and steering on a phone) are behind the gear.
- A title screen first, as on the 3DS: the name large over space, a ship
  crossing it with a barrel roll, and a blinking prompt.
- Blasts throw tumbling debris; a crash into the edge throws blue sparks.
- Settings, and the pause menu, add the 3DS's handling: fine aim (the stick
  softer near its centre) and whether up raises the nose. The pause menu also
  shows your kills and deaths.
- In the game, life is the 3DS's bar at the top left: a heart and ten charges,
  red and beating when low. Escape, P or the pause button opens the pause
  menu: Resume, the volumes, and Leave (which moved there). The ship flies on
  straight and holds its fire while it is open.

Version 0.8.0 - 2026-10-20
------------------
Import 3D models into a ship. Needs ships-go-3d 0.8.0.

- "Import 3D model (.glb)" in the designer's Add part section adds a .glb
  file as a part. It moves, rotates, sizes, mirrors, duplicates and undoes
  like any other part, is saved with the ship, and shows in the thumbnails
  and in game for every player.
- The model is fitted into the part along its longest side, keeping its
  proportions, and keeps its own colors, materials and textures (so the
  part has no color or texture to pick). It starts at size 4.
- Mirroring a model makes a true mirror image, since a model needn't be
  symmetric like the built-in shapes.
- Files must be .glb with everything embedded, at most 4 MB and 100,000
  triangles, and without Draco or meshopt compression. The file is checked
  before it is uploaded; importing the same file again reuses it.
- Until a model has loaded, or if it can't be, the part shows as a box
  outline.
- A model part has an opacity slider like the other parts.
- In English, Spanish and Basque.

Version 0.7.0 - 2026-10-20
------------------
Lights and see-through parts in the ship editor. Needs ships-go-3d 0.7.0 to
save them.

- A new part, the light: add it from "Add part" and place, move and mirror it
  like any other part. It shows as a glowing bulb (its size sets the bulb's)
  and shines its color on the parts around it. Pick the color as for any
  part, and the brightness with the intensity slider (0.1 to 10).
- A ship can have up to 8 lights; a mirrored light counts twice.
- In game the lights of your own ship shine on it; on other players' ships
  they show as glowing bulbs only, which keeps the game smooth on phones.
- Every other part has an opacity slider, from 5% (almost invisible) to 100%
  (solid, as before): glass canopies, force fields, windows into the hull.
- Ship thumbnails show both.
- In English, Spanish and Basque.

Version 0.6.0 - 2026-10-19
------------------
A new game mode: the assault. Pick it, or the free for all as before, at the
top of the Play page (the choice is remembered). Needs ships-go-3d 0.6.0.

- Two teams and a mothership at the centre of the world. Attackers fly their
  ship and shoot at the mothership; gunners sit in turrets on its hull and
  shoot the attackers down. An attacker's ship takes 3 hits and respawns a
  few seconds later, far out; the mothership takes 100.
- The attackers win by destroying the mothership. The gunners win if it is
  still flying when the clock (5 minutes) runs out.
- You wait in a lobby with the list of players. Once there are 4, it starts
  30 seconds after the last one joined (each new player restarts the count);
  with 20 it starts at once. Teams are dealt when the round starts, about one
  gunner for every three attackers.
- At the end the result and the final scores show for a few seconds, and
  everybody goes back to the lobby together for the next round.
- A gunner sees from their turret and only aims it: the mouse, the arrow keys,
  or the phone's stick or tilt turn it, and fire works as usual. The other
  gunners show as ball turrets on the hull.
- The HUD shows your team, the time left and the mothership's life; markers
  and the radar show only what you can shoot (the mothership for attackers,
  the attackers for gunners). The scoreboard adds the team and each
  attacker's hits on the mothership.
- Gunners' turrets are large amber balls with the gunner's name over them,
  so they stand out on the hull. Players you can't shoot (teammates, and
  gunners for an attacker) get a plain amber label while on screen.
- In English, Spanish and Basque.

Crashes, in both modes: flying into another ship destroys both, and in the
assault flying into the mothership destroys your ship (the mothership takes
no damage). Nobody gets a kill for a crash. The game reports the crash and
the server checks it against where it last saw both ships.

Version 0.5.0 - 2026-10-19
------------------
The site in Spanish and Basque (Euskara), as well as English.

- A language picker at the right of the navigation bar (inside the menu on
  phones) switches every page, the ship designer and the game's HUD.
- The first visit picks the browser's language when it is one of the three,
  English otherwise; the choice is remembered in the browser.
- Messages from the server (login and save errors, game errors, the default
  guest name) come in the chosen language too. Needs ships-go-3d 0.5.0; an
  older server answers in English.
- New ships start with a layer named in the chosen language ("Casco",
  "Kaskoa"); existing ships keep their layer names.
- The designer's textures and image links from 0.4.0 are translated too.

Version 0.4.1 - 2026-10-19
------------------
Space dust now surrounds the ship wherever it flies. Before, the dust stayed
in a small cloud at the centre of the world, so away from the centre there
was nothing passing by to show how fast the ship was moving.

Version 0.4.0 - 2026-10-19
------------------
Textures for ship parts in the designer.

- Each part can have one of eight built-in textures: hull panels, tiles,
  hazard stripes, carbon fibre, honeycomb, worn metal, camouflage and
  windows, picked from a row of previews under the part's color. "Plain"
  (the first one) is the old untextured look, and ships saved before keep it.
- The texture is tinted by the part's color, so color works as before.
- A new part gets the last texture picked, like it gets the last color.
- Or an image from the web: paste an https link to an image in "Image link"
  and it is tiled over the part like the built-in textures (pick white to
  show the image's own colors). The site hosting it has to allow other sites
  to use its images (CORS); if it doesn't, or the link breaks, the part
  shows plain, and the editor says the image couldn't be loaded. Every
  player's browser loads the image from that site in game.
- Textures are projected along each face, so they keep the same size on
  every shape however much a part is stretched, and show in thumbnails and
  in game too. They are drawn in the browser, so nothing extra is
  downloaded.

Needs ships-go-3d 0.4.0, which saves the texture with the ship.

Version 0.3.0 - 2026-10-18
------------------
Six new shapes in the ship designer, for more detailed ships.

- Dome (half sphere) for cockpits and turrets.
- Capsule (cylinder with rounded ends) for engines and fuel pods.
- Pyramid for noses and spikes.
- Tube (hollow cylinder) for thrusters and gun barrels.
- Hex prism for armour plates and details.
- Tapered cylinder for engine nozzles.

Like the other shapes, each fits a unit cube and can be mirrored. Needs
ships-go-3d 0.3.0, which accepts the new shapes when a ship is saved.

Clearer axes
- The X, Y and Z fields for position, rotation and size are colored red,
  green and blue, with a colored X / Y / Z header above them.
- The editor draws the X (red), Y (green) and Z (blue) axes in the same
  colors, matching the move/rotate/scale gizmo, so it's clear which field
  moves a part which way. The front arrow is the same blue as Z.

Version 0.2.0 - 2026-10-10
------------------
A 3D sphere radar, and the game made playable on phones: steer with an
on-screen stick or by tilting the phone, and switch between the two at any
time.

Radar
- A radar sphere in the bottom-right corner shows every enemy around you in
  3D. It turns with your ship, so ahead is always the same way on the radar,
  and each blip has a stalk down to the radar's equator, so you can tell at a
  glance whether an enemy is above or below you. Enemies beyond range are
  pinned to the surface, dimmed. `+` and `-` change the range (300, 600, 1200
  or 2400 units).
- It is drawn by the game's own renderer into a corner of the canvas, not a
  second WebGL context, so it stays cheap on phones.
- Tapping or clicking its caption cycles the range too.

Phones
- On a touch screen the game shows on-screen controls: a throttle slider on
  the left edge (it sets the speed to hold, including reverse), fire and
  roll buttons on the right, plus buttons to switch steering mode, show the
  scores and go full screen. The radar moves to the top right, out of the
  way of the thumbs.
- Two ways to steer, switchable in game or before launching (the choice is
  remembered): an on-screen stick, or tilting the phone. Tilt is relative to
  how the phone is held when it starts, with a Recenter button, a small dead
  zone and full turn rate at 25 degrees; it works in portrait and either
  landscape. Speed always stays on the slider, since tilting can't set it.
- Launching on a phone goes full screen (and locks landscape where the
  browser allows it). On iOS the motion-sensor permission is asked for on
  the Launch tap; if it is refused, or a device sends no sensor readings,
  the game falls back to the stick and says so.

Bugfixes
- Position updates are no longer queued while the connection is backed up
  (a stalled mobile network): they are snapshots, each replacing the last,
  and the queued pile used to arrive all at once and trip the server's flood
  protection, disconnecting phone players within seconds.
- "Could not reach the server" now explains the usual cause on the home
  server - a certificate the browser doesn't trust for the address the site
  was opened at, e.g. by IP - with a link to open the API and accept it. The
  game likewise says "Could not connect" instead of "Disconnected" when it
  never got in.

Version 0.1.0 - 2026-10-09
------------------
First version: the web client of Ships 3D. Design a spaceship from 3D parts,
then fly it against other players in open space.

- Accounts shared with the 2D game: register, log in, log out, change
  password.
- My ships: thumbnails of every design, edit, delete.
- 3D editor: layers of primitives (box, sphere, cylinder, cone, wedge, ring),
  move/rotate/scale gizmo with snapping, numeric properties, colors, left/right
  mirroring, undo/redo, keyboard shortcuts, unsaved-changes guard. Works on
  narrow screens too.
- Game: arcade 6-degrees-of-freedom flight with keyboard and mouse, chase
  camera, bullets, kills and respawns, scoreboard, kill feed, and markers
  pointing to every enemy. Guests can play with the built-in ships.
