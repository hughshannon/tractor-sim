import { CROPS, CROP_IDS } from '../sim/crops';
import { clockText, nightFactor } from '../sim/daylight';
import { Game } from '../sim/game';
import { priceTrend } from '../sim/market';
import { h, money } from './dom';
import {
  STATE_NAMES, fieldReport, grainText, implementStateText, percent, promptText, reversing, showGrain, speedKmh,
} from './readouts';

function bar(cls: string): { el: HTMLElement; fill: HTMLElement } {
  const fill = h('div.fill');
  return { el: h(`div.bar.${cls}`, {}, fill), fill };
}

export class Hud {
  private moneyEl = h('div.money');
  private tractorEl = h('div.sub');
  private clockEl = h('div.clock');
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

  constructor(private root: HTMLElement, private game: Game, onNewFarm: () => void) {
    const stats = h('div.panel.stats', {},
      h('div.row', {}, this.moneyEl, this.clockEl), this.tractorEl,
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
          ['C', 'Camera: chase / cab / overhead'],
          ['M', 'Mute / unmute sound'],
          ['Mouse wheel', 'Zoom (in the cab: narrow the view to read the screens)'],
          ['Mouse drag', 'Look around (cab view)'],
          ['H', 'Show / hide this help'],
        ].map(([k, v]) => h('tr', {}, h('td.key', {}, k), h('td', {}, v))),
      ),
      h('p.dim', {}, 'Cycle: harvest → plow → seed → wait → harvest. Swap implements at the garage.'),
      h('div.help-actions', {},
        h('button.btn', { onclick: () => this.toggleHelp(false) }, 'Start farming'),
        h('button.btn.ghost', { onclick: onNewFarm, title: 'Replace this farm with a fresh one (the old save is kept as a backup)' }, 'New farm'),
      ),
      h('p.dim', {}, 'Your farm saves automatically in this browser.'),
    );
    root.append(stats, this.market, imp, this.fieldEl, this.prompt, this.toasts, this.help);
  }

  /** In the cab view the in-cab instruments replace the screen HUD (help and shop stay). */
  setCabMode(on: boolean): void {
    this.root.classList.toggle('cab-mode', on);
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
    this.clockEl.textContent = `${nightFactor(g.time) > 0.5 ? '🌙' : '☀️'} ${clockText(g.time)}`;
    const fuelPct = g.fuel / def.fuelCapacity;
    this.fuel.fill.style.width = `${fuelPct * 100}%`;
    this.fuel.el.classList.toggle('low', fuelPct < 0.15);
    this.fuelText.textContent = `${Math.round(g.fuel)} L`;
    this.speedEl.textContent = `${speedKmh(g)} km/h${reversing(g) ? ' (R)' : ''}`;

    const imp = g.implement;
    this.impName.textContent = imp ? imp.name : 'No implement';
    this.impState.textContent = implementStateText(g);
    this.impState.classList.toggle('on', g.lowered);
    this.seedRow.style.display = imp?.kind === 'seeder' ? '' : 'none';
    this.grainWrap.style.display = showGrain(g) ? '' : 'none';
    const cap = def.grainCapacity;
    this.grain.fill.style.width = `${(g.grain.amount / cap) * 100}%`;
    this.grain.el.classList.toggle('full', g.grain.amount >= cap - 15);
    this.grainText.textContent = grainText(g);

    const prompt = promptText(g);
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

    const report = fieldReport(g);
    if (!report) {
      this.fieldEl.style.display = 'none';
      return;
    }
    this.fieldEl.style.display = '';
    const f = report.field;
    this.fieldEl.replaceChildren(
      h('div.title', {}, `${f.name}${f.owned ? '' : ' (not owned)'}`),
      ...report.coverage.map(({ state, share }) => h('div.row', {}, h('span', {}, STATE_NAMES[state]), h('span', {}, percent(share)))),
      ...(report.underImplement ? [h('div.dim', {}, `Under implement: ${report.underImplement}`)] : []),
    );
  }
}
