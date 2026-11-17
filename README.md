# Vice Shores — Make GTA 6 (gta6-01)

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/rahmadramadhab7/gta6-01-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/rahmadramadhab7/gta6-01-game/reward.svg)](https://make.fun/bounty/gta6-01)

**Vice Shores** is an original open-world crime game for the
[Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun: a sun-soaked,
low-poly city you explore on foot (and soon by car), with traffic, pedestrians,
a wanted level, missions and a story, a HUD with a minimap, a start screen and
saves. Everything is original — the city, the characters, the names, the music.
No Rockstar assets, names or trademarks anywhere.

## The game

You are **Marisol Vega**, a wheelwoman fresh out of the county lockup. The city
of Vice Shores never sleeps — and neither does its debt. Walk the avenues,
borrow a car or two, and make the Marina Pier meet before the sun goes down.

Night 1 (this skeleton) ships: a procedural 3D city at sunset (three.js,
vendored), a 5×5 street grid with towers, palms, lamps, a beach and a pier,
third-person walking with a chase camera, driving traffic and sidewalk
pedestrians, a HUD (cash, wanted stars, health, clock, speed, objective) with
a live minimap, a start screen with New Game / Continue, localStorage saves,
synthesised WebAudio sound, and deterministic `?shot=` staging for screenshots.

Coming next: stealing and driving cars, police and the wanted system, missions
and story beats, combat and side activities.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D or arrows | Walk (camera-relative) |
| Shift | Run |
| Mouse drag | Look / orbit camera |
| P or Esc | Pause (autosaves) |
| M | Mute |
| Enter (on title) | New Game |

## How to run

No build step, no network — the game is plain static files under `game/`
(three.js is vendored at `game/vendor/three.module.min.js`).

```sh
node serve.ts            # serves game/ at http://localhost:8080
# or: node serve.ts --port 18081
```

Open http://localhost:8080 in a desktop browser and play. Screenshots are
staged deterministically, e.g. `http://localhost:8080/?shot=play&seed=1`.

## How to hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
make.fun library. See `shots.json` for the staged screenshot scenes.

## Layout

```
game/
  index.html            page shell, import map, HUD + start screen
  style.css             HUD and menu styling
  vendor/
    three.module.min.js three.js r160 (vendored, minified)
  src/
    main.js             boot, fixed-step loop, screens, save wiring
    config.js           tuning numbers, city layout, palette
    city.js             procedural city: sky, streets, towers, beach, pier
    player.js           on-foot movement, collision, chase camera
    traffic.js          cars on the grid, pedestrians on sidewalks
    hud.js              HUD widgets + 2D minimap
    minimap             (drawn by hud.js)
    save.js             localStorage save / load
    audio.js            WebAudio synth: pad, footsteps, chimes
    shots.js            deterministic ?shot= staging
    input.js            keyboard + pointer-drag input
    random.js           seeded RNG
main.ts                 entry program (copies game/ + screenshots/, writes dossier.json)
serve.ts                tiny static server for local play
shots.json              staged screenshot scenes
screenshots/            1-start.jpg (cover), 2-play.jpg, 3-end.jpg
```

## License

MIT — see [LICENSE](LICENSE).
