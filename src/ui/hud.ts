import { CROPS, CROP_IDS } from '../sim/crops';
import { TileState } from '../sim/field';
import { FUEL_PRICE, Game } from '../sim/game';
import { priceTrend } from '../sim/market';
import { h, money } from './dom';

const STATE_NAMES: Record<TileState, string> = {
  [TileState.Grass]: 'Grass',
  [TileState.Plowed]: 'Plowed',
  [TileState.Seeded]: 'Growing',
  [TileState.Ripe]: 'Ripe',
  [TileState.Stubble]: 'Stubble',
};

function bar(cls: string): { el: HTMLElement; fill: HTMLElement } {
  const fill = h('div.fill');
  return { el: h(`div.bar.${cls}`, {}, fill), fill };
}

export class Hud {
  private moneyEl = h('div.money');
  private tractorEl = h('div.sub');
  private speedEl = h('div.speed');
  private fuel = bar('fuel');
  private fuelText = h('span');
  private market = h('div.panel.market');
  private impName = h('div.imp-name');
  private impState = h('div.imp-state');
  private seedRow = h('div.seed-row');
  private grainWrap = h('div.grain-row');
  private grain = bar('grain');
  private grainText = h('span');
  private fieldEl = h('div.panel.field-info');
  private prompt = h('div.prompt');
  private toasts = h('div.toasts');
  private help: HTMLElement;
  private shownMessages = new WeakSet<object>();
  private slowTimer = 0;

  constructor(root: HTMLElement, private game: Game) {
    const stats = h('div.panel.stats', {},
      this.moneyEl, this.tractorEl,
      h('div.row', {}, h('span.label', {}, 'Fuel'), this.fuel.el, this.fuelText),
      this.speedEl,
    );
    this.grainWrap.append(h('span.label', {}, 'Tank'), this.grain.el, this.grainText);
    const imp = h('div.panel.implement', {}, this.impName, this.impState, this.seedRow, this.grainWrap);
    this.help = h('div.help', {},
      h('h2', {}, '🚜 Tractor Farm'),
      h('p', {}, 'Harvest the ripe wheat in your Home Field, sell it at the silo, then plow, seed and grow your farm.'),
      h('table', {},
        ...[
          ['W A S D / Arrows', 'Drive & steer'],
          ['Shift', 'Brake'],
          ['Space', 'Lower / raise implement'],
          ['E', 'Interact (garage, silo, fuel)'],
          ['1 2 3', 'Choose seed: wheat, corn, canola'],
          ['C', 'Toggle camera'],
          ['Mouse wheel', 'Zoom'],
          ['H', 'Show / hide this help'],
        ].map(([k, v]) => h('tr', {}, h('td.key', {}, k), h('td', {}, v))),
      ),
      h('p.dim', {}, 'Cycle: harvest → plow → seed → wait → harvest. Swap implements at the garage.'),
      h('button.btn', { onclick: () => this.toggleHelp(false) }, 'Start farming'),
    );
    root.append(stats, this.market, imp, this.fieldEl, this.prompt, this.toasts, this.help);
  }

  get helpVisible(): boolean {
    return !this.help.classList.contains('hidden');
  }

  toggleHelp(show = !this.helpVisible): void {
    this.help.classList.toggle('hidden', !show);
  }

  update(dt: number): void {
    const g = this.game;
    const def = g.tractorDef;
    this.moneyEl.textContent = money(g.money);
    this.tractorEl.textContent = def.name;
    const fuelPct = g.fuel / def.fuelCapacity;
    this.fuel.fill.style.width = `${fuelPct * 100}%`;
    this.fuel.el.classList.toggle('low', fuelPct < 0.15);
    this.fuelText.textContent = `${Math.round(g.fuel)} L`;
    this.speedEl.textContent = `${Math.round(Math.abs(g.tractor.speed) * 3.6)} km/h${g.tractor.speed < -0.1 ? ' (R)' : ''}`;

    const imp = g.implement;
    this.impName.textContent = imp ? imp.name : 'No implement';
    this.impState.textContent = imp ? (g.lowered ? '▼ LOWERED — working' : '▲ Raised  [Space] to lower') : 'Attach one at the garage';
    this.impState.classList.toggle('on', g.lowered);
    this.seedRow.style.display = imp?.kind === 'seeder' ? '' : 'none';
    this.grainWrap.style.display = imp?.kind === 'harvester' || g.grain.amount > 0 ? '' : 'none';
    const cap = def.grainCapacity;
    this.grain.fill.style.width = `${(g.grain.amount / cap) * 100}%`;
    this.grain.el.classList.toggle('full', g.grain.amount >= cap - 15);
    this.grainText.textContent = `${g.grain.amount} / ${cap} L${g.grain.crop ? ' ' + CROPS[g.grain.crop].name : ''}`;

    const zone = g.zone;
    let prompt = '';
    if (zone?.id === 'shed') prompt = 'Press E to open the garage & shop';
    else if (zone?.id === 'silo') prompt = g.grain.amount > 0 ? `Press E to sell ${g.grain.amount} L` : 'Silo: bring grain here to sell';
    else if (zone?.id === 'fuel') prompt = `Press E to refuel ($${Math.ceil((def.fuelCapacity - g.fuel) * FUEL_PRICE)})`;
    this.prompt.textContent = prompt;
    this.prompt.style.display = prompt ? '' : 'none';

    for (const m of g.messages) {
      if (this.shownMessages.has(m)) continue;
      this.shownMessages.add(m);
      const t = h(`div.toast.${m.kind}`, {}, m.text);
      this.toasts.append(t);
      setTimeout(() => t.classList.add('fade'), 3200);
      setTimeout(() => t.remove(), 4000);
    }

    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      this.updateSlow();
    }
  }

  private updateSlow(): void {
    const g = this.game;
    this.market.replaceChildren(
      h('div.title', {}, 'Market (per L)'),
      ...CROP_IDS.map((id) => {
        const tr = priceTrend(id, g.time);
        return h('div.row', {},
          h('span', {}, CROPS[id].name),
          h(`span.price.t${tr + 1}`, {}, `$${g.price(id).toFixed(2)} ${tr > 0 ? '▲' : tr < 0 ? '▼' : '•'}`),
        );
      }),
    );

    this.seedRow.replaceChildren(
      h('span.label', {}, 'Seed'),
      ...CROP_IDS.map((id, i) =>
        h(`span.chip${g.seedCrop === id ? '.active' : ''}`, {}, `${i + 1} ${CROPS[id].name} $${CROPS[id].seedCostPerTile}/tile`),
      ),
    );

    const p = g.implementPos();
    const f = g.fieldAt(g.tractor.x, g.tractor.z) ?? g.fieldAt(p.x, p.z);
    if (!f) {
      this.fieldEl.style.display = 'none';
      return;
    }
    this.fieldEl.style.display = '';
    const c = f.counts();
    const pct = (n: number) => `${Math.round((n / f.size) * 100)}%`;
    const ti = f.tileAt(p.x, p.z);
    let tileText = '';
    if (ti >= 0) {
      const s = f.state[ti] as TileState;
      const crop = f.cropAt(ti);
      tileText = STATE_NAMES[s] + (crop ? ` ${CROPS[crop].name}` : '') + (s === TileState.Seeded ? ` ${Math.round(f.growth[ti] * 100)}%` : '');
    }
    this.fieldEl.replaceChildren(
      h('div.title', {}, `${f.name}${f.owned ? '' : ' (not owned)'}`),
      ...([TileState.Ripe, TileState.Seeded, TileState.Plowed, TileState.Stubble, TileState.Grass] as TileState[])
        .filter((s) => c[s] > 0)
        .map((s) => h('div.row', {}, h('span', {}, STATE_NAMES[s]), h('span', {}, pct(c[s])))),
      ...(tileText ? [h('div.dim', {}, `Under implement: ${tileText}`)] : []),
    );
  }
}
