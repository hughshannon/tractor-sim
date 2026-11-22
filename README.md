# Tractor Farm 🚜

A browser-based, low-poly 3D tractor farming simulator built with Three.js, TypeScript and Vite.

Drive your tractor, harvest, plow, seed and grow crops, sell grain at the silo and expand your farm with
bigger implements, a better tractor and more land.

## Play

```bash
npm install
npm run dev        # http://localhost:5000
```

| Key | Action |
| --- | --- |
| W A S D / Arrows | Drive & steer |
| Shift | Brake |
| Space | Lower / raise implement |
| E | Interact: garage & shop, sell grain at silo, refuel, bank, farm stand |
| 1 – 7 | Choose seed (wheat, corn, canola, potatoes, tomatoes, pumpkins, sunflowers) |
| C | Cycle camera: chase / cab (first-person) / overhead |
| Mouse wheel | Zoom |
| Mouse drag | Look around (cab view) |
| M | Mute / unmute sound |
| H | Help |

**Touch screens** (phones, tablets) get on-screen controls automatically: drag anywhere on the left half for a
joystick (up = forward, down = reverse, sideways = steer), hold **Brake**, tap **⇅** to lower/raise the implement,
**Use** to interact (it lights up near a building), 🎥 for camera, **?** for help. Tap a seed chip to choose it,
pinch to zoom, and drag with one finger to look around in the cab view.

**Loop:** harvest ripe crops → sell at the silo → plow stubble → seed → (spray fertilizer) → wait for growth → harvest again.
Swap implements (plow, seeder, sprayer, harvester) at the garage. Prices drift over time, so check the market panel before selling.

**Spending money:**
- **Sprayer** (6/12/18 m): fertilize growing crops for $2/tile to get +40% yield.
- **Grain storage** (10k / 25k / 60k L, built from the garage): unload at the silo and sell later, when prices peak.
- **Wear & repairs**: tractors wear with distance driven, implements with time worked. Below 50% condition they
  work slower and burn more fuel; at 0% they stop. Repair at the garage workshop.
- **Equipment tiers**: Scout 50 (fast utility), Workhorse 200, Titan 400; 9 m implements need 180 hp.

**Boulder fields:** two cheap plots south of the yard, **Boulder Meadow** ($9,000) and **Rocky Ridge** ($13,000), are
strewn with giant boulders. The tractor can't drive through them, and the ground under each one can never be farmed. A
lowered implement that hits a boulder stops the tractor dead and takes damage, so steer wide implements around them
or raise them (Space) to get past.

**Vegetables & the farm stand:** potatoes, tomatoes, pumpkins and sunflowers are planted, grown and harvested like
grain, but the silo won't take them. Drive to the **farm stand** by the road (east of the silo) and press E to stock it from
the tank. Between 07:00 and 20:00 customers walk in from the road and buy what's on the counter. More kinds of produce
and lower prices bring more customers; premium prices earn more per sale. Upgrade the roadside cart to a farm stand
($6,000) or farm shop ($18,000) for more space and more customers. A wholesaler buys a tank of produce at half price.

**Bank:** short of money? The bank, west of the garage, lends up to $8,000 plus half of what you've paid for land,
buildings and equipment. Interest is 3% per game day. Each morning at 07:30 the bank collects 10% of the balance. If
you can't cover it, a 3% late fee is added instead. Repay early at any time.

## Development

```bash
npm test           # unit tests for the simulation (vitest)
npm run typecheck
npm run build      # static build into dist/
```

**Crop models** are built procedurally in `src/render/cropModels.ts` (one low-poly model per crop per growth stage).
Run `npm run dev` and open `/crops.html` to see every crop at every stage side by side; add `?at=col,row` to zoom
on one plot (e.g. `?at=4,0` for ripe wheat).

```
src/
  sim/      pure game logic: fields, crops, tractor physics, market, economy (unit tested)
  render/   three.js scene, tractor & implement meshes, field textures + instanced crops, camera
  ui/       DOM HUD and garage/shop
  core/     input
```

## Deploying on Replit

The repo includes a `.replit` config. Import the GitHub repo into Replit, press **Run** for the dev server,
and use **Deploy → Static** (build: `npm ci && npm run build`, public dir: `dist`).

## Roadmap

- [x] M1 Driving, camera, world
- [x] M2 Fields + plow
- [x] M3 Seed, grow, harvest
- [x] M4 Economy, HUD, shop
- [x] Synthesised sound (engine, implements, effects, ambience)
- [x] Day/night cycle (10-minute days, floodlit yard, tractor headlights & work lights, field-edge lights)
- [ ] M5 Seasons, weather, save/load
- [x] Touch controls
- [ ] M6 Particles, minimap
