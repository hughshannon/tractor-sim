import { CROPS, CROP_IDS, FERTILIZER_BONUS, FERTILIZER_COST_PER_TILE, GRAIN_IDS, PRODUCE_IDS } from '../sim/crops';
import { WEAR_THRESHOLD } from '../sim/equipment';
import { TileState } from '../sim/field';
import { clockText, nightFactor } from '../sim/daylight';
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
  private loanEl = h('div.loan');
  private tractorEl = h('div.sub');
  private clockEl = h('div.clock');
  private speedEl = h('div.speed');
  private fuel = bar('fuel');
  private fuelText = h('span');
  private market = h('div.panel.market');
  private impName = h('div.imp-name');
  private impState = h('div.imp-state');
  private seedRow = h('div.seed-row');
  private sprayRow = h('div.seed-row.dim');
  private wear = bar('wear');
  private wearText = h('span');
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
      h('div.row', {}, this.moneyEl, this.clockEl), this.loanEl, this.tractorEl,
      h('div.row', {}, h('span.label', {}, 'Fuel'), this.fuel.el, this.fuelText),
      h('div.row', {}, h('span.label', {}, 'Cond'), this.wear.el, this.wearText),
      this.speedEl,
    );
    this.grainWrap.append(h('span.label', {}, 'Tank'), this.grain.el, this.grainText);
    this.sprayRow.textContent = `Fertilizer $${FERTILIZER_COST_PER_TILE}/tile · +${Math.round(FERTILIZER_BONUS * 100)}% yield on growing crops`;
    const imp = h('div.panel.implement', {}, this.impName, this.impState, this.seedRow, this.sprayRow, this.grainWrap);
    this.help = h('div.help', {},
      h('h2', {}, '🚜 Tractor Farm'),
      h('p', {}, 'Harvest the ripe wheat in your Home Field, sell it at the silo, then plow, seed and grow your farm. Grow vegetables and sunflowers to sell at the farm stand, and borrow from the bank when money is tight.'),
      h('table', {},
        ...[
          ['W A S D / Arrows', 'Drive & steer'],
          ['Shift', 'Brake'],
          ['Space', 'Lower / raise implement'],
          ['E', 'Interact (garage, silo, fuel, bank, farm stand)'],
          ['1 - 7', 'Seed: wheat, corn, canola, potatoes, tomatoes, pumpkins, sunflowers'],
          ['C', 'Camera: chase / cab / overhead'],
          ['M', 'Mute / unmute sound'],
          ['Mouse wheel', 'Zoom'],
          ['Mouse drag', 'Look around (cab view)'],
          ['H', 'Show / hide this help'],
        ].map(([k, v]) => h('tr', {}, h('td.key', {}, k), h('td', {}, v))),
      ),
      h('p.dim', {}, 'Cycle: harvest → plow → seed → (spray fertilizer) → wait → harvest. Swap implements, repair worn equipment and build grain storage at the garage.'),
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
    this.loanEl.textContent = g.loan > 0 ? `Loan ${money(Math.ceil(g.loan))}${g.loanMissed ? ` · ${g.loanMissed} missed` : ''}` : '';
    this.loanEl.style.display = g.loan > 0 ? '' : 'none';
    this.loanEl.classList.toggle('late', g.loanMissed > 0);
    this.tractorEl.textContent = def.name;
    this.clockEl.textContent = `${nightFactor(g.time) > 0.5 ? '🌙' : '☀️'} ${clockText(g.time)}`;
    const fuelPct = g.fuel / def.fuelCapacity;
    this.fuel.fill.style.width = `${fuelPct * 100}%`;
    this.fuel.el.classList.toggle('low', fuelPct < 0.15);
    this.fuelText.textContent = `${Math.round(g.fuel)} L`;
    this.speedEl.textContent = `${Math.round(Math.abs(g.tractor.speed) * 3.6)} km/h${g.tractor.speed < -0.1 ? ' (R)' : ''}`;
    const tw = g.tractorWear;
    this.wear.fill.style.width = `${tw * 100}%`;
    this.wear.el.classList.toggle('low', tw < WEAR_THRESHOLD);
    this.wearText.textContent = `${Math.round(tw * 100)}%`;

    const imp = g.implement;
    const iw = g.implementWear;
    this.impName.textContent = imp ? `${imp.name} · ${Math.round(iw * 100)}%` : 'No implement';
    this.impName.classList.toggle('worn', imp !== null && iw < WEAR_THRESHOLD);
    this.impState.textContent = !imp ? 'Attach one at the garage'
      : iw <= 0 ? '✖ BROKEN — repair at the garage'
        : g.lowered ? '▼ LOWERED — working' : '▲ Raised  [Space] to lower';
    this.impState.classList.toggle('on', g.lowered && iw > 0);
    this.seedRow.style.display = imp?.kind === 'seeder' ? '' : 'none';
    this.sprayRow.style.display = imp?.kind === 'sprayer' ? '' : 'none';
    this.grainWrap.style.display = imp?.kind === 'harvester' || g.grain.amount > 0 ? '' : 'none';
    const cap = def.grainCapacity;
    this.grain.fill.style.width = `${(g.grain.amount / cap) * 100}%`;
    this.grain.el.classList.toggle('full', g.grain.amount >= cap - 15);
    const unit = g.grain.crop ? CROPS[g.grain.crop].unit : 'L';
    this.grainText.textContent = `${g.grain.amount} / ${cap} ${unit}${g.grain.crop ? ' ' + CROPS[g.grain.crop].name : ''}`;

    const zone = g.zone;
    let prompt = '';
    if (zone?.id === 'shed') prompt = 'Press E to open the garage & shop';
    else if (zone?.id === 'silo' && g.storageLevel > 0) prompt = 'Press E to open the silo (store or sell grain)';
    else if (zone?.id === 'silo' && g.grain.crop && CROPS[g.grain.crop].kind === 'produce') prompt = 'The silo only takes grain. Sell produce at the farm stand.';
    else if (zone?.id === 'silo') prompt = g.grain.amount > 0 ? `Press E to sell ${g.grain.amount} L` : 'Silo: bring grain here to sell';
    else if (zone?.id === 'bank') prompt = 'Press E to visit the bank (loans)';
    else if (zone?.id === 'stand') prompt = 'Press E to open the farm stand';
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
      ...GRAIN_IDS.map((id) => {
        const tr = priceTrend(id, g.time);
        return h('div.row', {},
          h('span', {}, CROPS[id].name),
          h(`span.price.t${tr + 1}`, {}, `$${g.price(id).toFixed(2)} ${tr > 0 ? '▲' : tr < 0 ? '▼' : '•'}`),
        );
      }),
      ...(g.storageLevel > 0
        ? [h('div.title.sub-title', {}, `Stored ${g.stored.toLocaleString()} / ${g.storageCapacity.toLocaleString()} L`),
          ...GRAIN_IDS.filter((id) => g.storage[id] > 0).map((id) =>
            h('div.row.dim', {}, h('span', {}, CROPS[id].name), h('span', {}, `${g.storage[id].toLocaleString()} L`)))]
        : []),
      h('div.title.sub-title', {}, `Farm stand · ${g.standOpen ? 'open' : 'closed'}`),
      ...(g.standStocked > 0
        ? PRODUCE_IDS.filter((id) => g.standStock[id] > 0).map((id) =>
          h('div.row.dim', {}, h('span', {}, CROPS[id].name), h('span', {}, `${g.standStock[id].toLocaleString()} ${CROPS[id].unit}`)))
        : [h('div.dim', {}, 'Empty: grow produce to stock it')]),
      ...(g.standToday > 0 ? [h('div.row.dim', {}, h('span', {}, 'Takings today'), h('span', {}, money(g.standToday)))] : []),
    );

    this.seedRow.replaceChildren(
      h('span.label', {}, 'Seed'),
      ...CROP_IDS.map((id, i) =>
        h(`span.chip${g.seedCrop === id ? '.active' : ''}${CROPS[id].kind === 'produce' ? '.veg' : ''}`, {}, `${i + 1} ${CROPS[id].name} $${CROPS[id].seedCostPerTile}`),
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
      tileText = STATE_NAMES[s] + (crop ? ` ${CROPS[crop].name}` : '') + (s === TileState.Seeded ? ` ${Math.round(f.growth[ti] * 100)}%` : '')
        + (f.fert[ti] ? ' · fertilized' : '');
    }
    let fertilized = 0;
    for (let i = 0; i < f.size; i++) fertilized += f.fert[i];
    const crops = c[TileState.Seeded] + c[TileState.Ripe];
    this.fieldEl.replaceChildren(
      h('div.title', {}, `${f.name}${f.owned ? '' : ' (not owned)'}`),
      ...([TileState.Ripe, TileState.Seeded, TileState.Plowed, TileState.Stubble, TileState.Grass] as TileState[])
        .filter((s) => c[s] > 0)
        .map((s) => h('div.row', {}, h('span', {}, STATE_NAMES[s]), h('span', {}, pct(c[s])))),
      ...(crops > 0 ? [h('div.row.dim', {}, h('span', {}, 'Fertilized crops'), h('span', {}, `${Math.round((fertilized / crops) * 100)}%`))] : []),
      ...(tileText ? [h('div.dim', {}, `Under implement: ${tileText}`)] : []),
    );
  }
}
