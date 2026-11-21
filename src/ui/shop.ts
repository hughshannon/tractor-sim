import { CROPS, CROP_IDS, FERTILIZER_BONUS, FERTILIZER_COST_PER_TILE } from '../sim/crops';
import { IMPLEMENTS, IMPLEMENT_KINDS, TRACTORS, canPull, repairCost } from '../sim/equipment';
import { STORAGE_LEVELS } from '../sim/farm';
import type { ActionResult, Game } from '../sim/game';
import { h, money } from './dom';

const pct = (c: number) => `${Math.round(c * 100)}%`;

/** Small condition meter; red below 25%, amber below 50%. */
export function conditionMeter(c: number): HTMLElement {
  const cls = c < 0.25 ? '.bad' : c < 0.5 ? '.worn' : '';
  return h(`span.cond${cls}`, { title: 'Condition' },
    h('span.cbar', {}, h('span.cfill', { style: `width:${c * 100}%` })), pct(c));
}

/** Garage & shop modal: attach implements, buy equipment, tractors and fields, repairs and storage. */
export class Shop {
  private el = h('div.shop.hidden');
  private body = h('div.shop-body');
  private status = h('div.shop-status');
  private moneyEl = h('span.money');

  constructor(root: HTMLElement, private game: Game, private onClose: () => void) {
    this.el.append(
      h('div.shop-window', {},
        h('div.shop-head', {}, h('h2', {}, 'Garage & Shop'), this.moneyEl, h('button.btn.close', { onclick: () => this.close() }, '✕')),
        this.status,
        this.body,
        h('div.dim.foot', {}, 'Press E or Esc to close'),
      ),
    );
    root.append(this.el);
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  show(): void {
    this.status.textContent = '';
    this.el.classList.remove('hidden');
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }

  private act(r: ActionResult): void {
    this.status.textContent = r.text;
    this.status.className = `shop-status ${r.ok ? 'good' : 'warn'}`;
    this.render();
  }

  private render(): void {
    const g = this.game;
    this.moneyEl.textContent = money(g.money);

    const implDefs = Object.values(IMPLEMENTS).sort((a, b) =>
      IMPLEMENT_KINDS.indexOf(a.kind) - IMPLEMENT_KINDS.indexOf(b.kind) || a.width - b.width);
    const implRows = implDefs.map((d) => {
      const owned = g.ownedImplements.has(d.id);
      const attached = g.attached === d.id;
      const fits = canPull(g.tractorDef, d);
      let btn: HTMLElement;
      if (attached) btn = h('button.btn.ghost', { onclick: () => this.act(g.attach(null)) }, 'Detach');
      else if (owned) {
        btn = h('button.btn', { disabled: !fits, title: fits ? null : `Needs ${d.power} hp`, onclick: () => this.act(g.attach(d.id)) }, 'Attach');
      } else btn = h('button.btn.buy', { disabled: g.money < d.price, onclick: () => this.act(g.buyImplement(d.id)) }, `Buy ${money(d.price)}`);
      const extra = d.kind === 'sprayer' ? ` · +${Math.round(FERTILIZER_BONUS * 100)}% yield for $${FERTILIZER_COST_PER_TILE}/tile` : '';
      return h(`div.item${attached ? '.active' : ''}`, {},
        h('div', {},
          h('b', {}, d.name), ' ', owned ? conditionMeter(g.implementCondition.get(d.id) ?? 1) : null,
          h(`div.dim${fits ? '' : '.need'}`, {}, `${d.kind} · ${d.width} m · ${Math.round(d.workSpeed * 3.6)} km/h · ${d.power} hp${extra}`)),
        btn,
      );
    });

    const tractorRows = Object.values(TRACTORS).map((d) => {
      const owned = g.ownedTractors.has(d.id);
      const current = g.tractorId === d.id;
      let btn: HTMLElement;
      if (current) btn = h('span.tag', {}, 'Driving');
      else if (owned) btn = h('button.btn', { onclick: () => this.act(g.selectTractor(d.id)) }, 'Drive');
      else btn = h('button.btn.buy', { disabled: g.money < d.price, onclick: () => this.act(g.buyTractor(d.id)) }, `Buy ${money(d.price)}`);
      return h(`div.item${current ? '.active' : ''}`, {},
        h('div', {},
          h('b', {}, d.name), ' ', owned ? conditionMeter(g.tractorCondition.get(d.id) ?? 1) : null,
          h('div.dim', {}, `${d.power} hp · ${Math.round(d.maxSpeed * 3.6)} km/h · ${d.fuelCapacity} L fuel · ${d.grainCapacity.toLocaleString()} L grain tank`)),
        btn,
      );
    });

    const fieldRows = g.fields.map((f) =>
      h('div.item', {},
        h('div', {}, h('b', {}, f.name), h('div.dim', {}, `${f.hectares.toFixed(2)} ha · ${f.size} tiles`)),
        f.owned
          ? h('span.tag', {}, 'Owned')
          : h('button.btn.buy', { disabled: g.money < f.price, onclick: () => this.act(g.buyField(f.id)) }, `Buy ${money(f.price)}`),
      ),
    );

    const seedRows = CROP_IDS.map((id) => {
      const c = CROPS[id];
      const active = g.seedCrop === id;
      return h(`div.item${active ? '.active' : ''}`, {},
        h('div', {}, h('b', {}, c.name),
          h('div.dim', {}, `$${c.seedCostPerTile}/tile · grows in ${c.growTime}s · ${c.yieldPerTile} ${c.unit}/tile · ~$${c.basePrice.toFixed(2)}/${c.unit}`
            + (c.kind === 'produce' ? ' · sell at the farm stand' : ''))),
        active ? h('span.tag', {}, 'Selected') : h('button.btn', { onclick: () => { g.seedCrop = id; this.act({ ok: true, text: `Seed set to ${c.name}.` }); } }, 'Select'),
      );
    });

    const repairs = [
      ...[...g.tractorCondition].map(([id, c]) => {
        const d = TRACTORS[id];
        return { name: d.name, c, cost: repairCost(d.price, c), fix: () => g.repairTractor(id) };
      }),
      ...[...g.implementCondition].map(([id, c]) => {
        const d = IMPLEMENTS[id];
        return { name: d.name, c, cost: repairCost(d.price, c), fix: () => g.repairImplement(id) };
      }),
    ].filter((r) => r.cost > 0);
    const allCost = g.repairAllCost();
    const workshop = h('section', {}, h('h3', {}, 'Workshop'),
      h('div.dim.note', {}, 'Equipment wears with use. Below 50% it works slower and burns more fuel. At 0% it stops working.'),
      ...repairs.map((r) =>
        h('div.item', {},
          h('div', {}, h('b', {}, r.name), ' ', conditionMeter(r.c)),
          h('button.btn', { disabled: g.money < r.cost, onclick: () => this.act(r.fix()) }, `Repair ${money(r.cost)}`),
        )),
      repairs.length > 1
        ? h('div.item', {}, h('b', {}, 'Everything'),
          h('button.btn', { disabled: g.money < allCost, onclick: () => this.act(g.repairAll()) }, `Repair all ${money(allCost)}`))
        : null,
      repairs.length === 0 ? h('div.item', {}, h('span.dim', {}, 'All equipment is in perfect condition.')) : null,
    );

    const level = STORAGE_LEVELS[g.storageLevel];
    const next = STORAGE_LEVELS[g.storageLevel + 1];
    const storage = h('section', {}, h('h3', {}, 'Grain storage'),
      h('div.dim.note', {}, 'Unload grain into storage at the silo, then sell it later when prices are high.'),
      h('div.item', {},
        h('div', {}, h('b', {}, level.name),
          g.storageLevel > 0 ? h('div.dim', {}, `${g.stored.toLocaleString()} / ${level.capacity.toLocaleString()} L used`) : null),
        h('span.tag', {}, 'Current')),
      next
        ? h('div.item', {},
          h('div', {}, h('b', {}, next.name), h('div.dim', {}, `Holds ${next.capacity.toLocaleString()} L`)),
          h('button.btn.buy', { disabled: g.money < next.price, onclick: () => this.act(g.buyStorage()) }, `Build ${money(next.price)}`))
        : null,
    );

    this.body.replaceChildren(
      h('section', {}, h('h3', {}, 'Implements'), ...implRows),
      h('section', {}, h('h3', {}, 'Tractors'), ...tractorRows, h('h3', {}, 'Seed'), ...seedRows),
      workshop,
      h('section', {}, h('h3', {}, 'Land'), ...fieldRows),
      storage,
    );
  }
}
