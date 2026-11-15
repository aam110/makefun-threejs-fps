# makefun-threejs-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/aam110/makefun-threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/aam110/makefun-threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**DUSTLINE** — a round-based tactical FPS in the browser: 3v3 on an original desert container yard at dusk ("Yard 9"), Counter-Strike rules. You carry the charge: plant it at site A or B, or wipe the defending Sentinels. First to 5 rounds takes the match (max 9). Each round opens with a 15-second buy phase — economy starts at $800, kills pay $300, round wins $3,250 — then 100 seconds of live play, then a 35-second bomb timer once planted. Four weapons (P-9 sidearm, VK-9 Vector SMG, AR-7 Carbine rifle, LW-50 Longshot sniper with a scope) plus HE and smoke grenades, Kevlar that absorbs half the damage. Hitscan gunplay with 4× headshots, distance falloff, recoil and spread that punish firing on the move, crouch, jump, and acceleration-based movement with AABB collision. Five bots with roles, waypoint routes, hold positions, line-of-sight and hearing perception, burst fire, retakes and defuses — they play the same objective you do. Fixed 60 Hz simulation kept separate from rendering, a single state object, synthesized WebAudio sound, procedural canvas textures, and no assets to download: the whole game is static files under `game/`, built on three.js 0.187.0.

**v2 polish (this entry):** the dusk is deeper — a glowing sun sprite and dusk cloud bands in the sky, 220 drifting dust motes in the air, stacked containers at both sites (with matching collision), scattered rubble, and a four-point star muzzle flash that spins on every shot. Death now has a **deathcam**: when you are killed, the camera eases around to face your killer and tracks them live, with a death card naming the weapon that got you.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 and click to play. `WASD` move, mouse look, click fire, `R` reload, `Ctrl` crouch, `Space` jump, `B` buy menu, `1`–`6` buy / switch weapons and grenades, `E` hold to plant the charge.

`node main.ts` builds the entry dossier (`dossier.json` plus `game/` and `screenshots/`) into the output directory, as the bounty requires.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4kc4aac3&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
