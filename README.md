# senja-heat — Last Second Chance

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bagusadi780/senja-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bagusadi780/senja-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Last Second Chance** is an original open-world crime game set in Port Senja, a
tropical harbour city at dusk, built with three.js in the browser — no build
step. You play **Raka**, a driver-for-hire. Fixer **Sari** feeds you jobs
against the **Sindikat Dermaga** (the Dock Syndicate): a five-mission chain
that runs from a first pickup through a river chase, a run to Pulau Senja and
a canal sail-through, ending with the syndicate driven out of Port Senja.
Between jobs the city is yours — walk the neon streets, take any car, cross
the bridges by boat, hide from the police, and free-roam.

## Features

- Open world: a harbour city with a winding river, Pulau Senja island, a
  working drawbridge, curved roads, traffic and pedestrians
- Five-mission story chain (M1–M5) for Sari, plus free-roam mode
- Driving, on-foot movement, combat and a witness-based wanted system with
  police chases, roadblocks and a helicopter searchlight
- Five enterable interiors, NPC interaction and dialogue
- Boats, a garage and economy, and a `localStorage` save
- In-game phone with map and GPS route, photo mode, and synthesised WebAudio
  with three radio stations
- Minimap radar, HUD with cash, health and weapon status

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Any static file
server over `game/` works just as well — there is no build step.

## Play

| Input | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Run |
| E | Enter / exit car |
| C | Crouch |
| F | Interact (talk to Sari and NPCs) |
| Click / F | Shoot |
| R | Reload |
| Tab / 1–5 | Weapon wheel / select weapon |
| Space | Roll / vault on foot, handbrake in a car |
| V | Camera view |
| L / H | Lights / horn |
| M | Phone / map |
| O | Photo mode |
| P / Esc | Pause |

Start with **Free Roam** or jump into **Story — Sari's Chain** from the title
screen. Lose line of sight and leave the search zone to drop your wanted
stars.

Screenshot scenes for the entry are built into the game itself:
`index.html?shot=start|play|end&seed=1` renders one frozen, seeded frame of
each screen.

## Hand it in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` there with the vendored make.fun library in
`vendor/makefun-game.ts`.

## Layout

- `game/index.html` — the page, HUD and title screen
- `game/src/main.js` — the whole game: world, traffic, missions, police,
  combat, interiors, boats, audio and rendering
- `game/vendor/` — vendored three.js, unchanged
- `main.ts` — the entry program that hands the game in
- `serve.ts` — a tiny local server for play-testing
- `screenshots/` — the three entry screenshots (title, chase, M5 finale)

MIT licensed; see `LICENSE`.

---
<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
