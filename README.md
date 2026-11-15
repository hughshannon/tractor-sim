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
| E | Interact: garage & shop, sell grain at silo, refuel |
| 1 2 3 | Choose seed (wheat, corn, canola) |
| C | Cycle camera: chase / cab (first-person) / overhead |
| Mouse wheel | Zoom |
| Mouse drag | Look around (cab view) |
| M | Mute / unmute sound |
| H | Help |

**Loop:** harvest ripe crops → sell at the silo → plow stubble → seed → wait for growth → harvest again.
Swap implements (plow, seeder, harvester) at the garage. Prices drift over time, so check the market panel before selling.

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
- [ ] M5 Day/night, seasons, weather, save/load
- [ ] M6 Particles, minimap, touch controls
