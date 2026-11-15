import { CROPS, CROP_IDS } from '../sim/crops';
import { IMPLEMENTS, TRACTORS } from '../sim/equipment';
import type { ActionResult, Game } from '../sim/game';
import { h, money } from './dom';

/** Garage & shop modal: attach implements, buy equipment, tractors and fields. */
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

    const implRows = Object.values(IMPLEMENTS).map((d) => {
      const owned = g.ownedImplements.has(d.id);
      const attached = g.attached === d.id;
      let btn: HTMLElement;
      if (attached) btn = h('button.btn.ghost', { onclick: () => this.act(g.attach(null)) }, 'Detach');
      else if (owned) btn = h('button.btn', { onclick: () => this.act(g.attach(d.id)) }, 'Attach');
      else btn = h('button.btn.buy', { disabled: g.money < d.price, onclick: () => this.act(g.buyImplement(d.id)) }, `Buy ${money(d.price)}`);
      return h(`div.item${attached ? '.active' : ''}`, {},
        h('div', {}, h('b', {}, d.name), h('div.dim', {}, `${d.kind} · ${d.width} m wide · ${Math.round(d.workSpeed * 3.6)} km/h work speed`)),
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
        h('div', {}, h('b', {}, d.name), h('div.dim', {}, `${Math.round(d.maxSpeed * 3.6)} km/h · ${d.fuelCapacity} L fuel · ${d.grainCapacity} L grain tank`)),
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
          h('div.dim', {}, `$${c.seedCostPerTile}/tile · grows in ${c.growTime}s · ${c.yieldPerTile} L/tile · ~$${c.basePrice.toFixed(2)}/L`)),
        active ? h('span.tag', {}, 'Selected') : h('button.btn', { onclick: () => { g.seedCrop = id; this.act({ ok: true, text: `Seed set to ${c.name}.` }); } }, 'Select'),
      );
    });

    this.body.replaceChildren(
      h('section', {}, h('h3', {}, 'Implements'), ...implRows),
      h('section', {}, h('h3', {}, 'Seed'), ...seedRows),
      h('section', {}, h('h3', {}, 'Tractors'), ...tractorRows),
      h('section', {}, h('h3', {}, 'Land'), ...fieldRows),
    );
  }
}
