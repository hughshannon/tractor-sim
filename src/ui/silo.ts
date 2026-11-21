import { CROPS, GRAIN_IDS, amountText, isGrain } from '../sim/crops';
import type { ActionResult, Game } from '../sim/game';
import { priceTrend } from '../sim/market';
import { h, money } from './dom';

/** Silo modal (only once storage is built): unload the tank, sell from the tank or from storage. */
export class Silo {
  private el = h('div.shop.hidden');
  private body = h('div.silo-body');
  private status = h('div.shop-status');
  private moneyEl = h('span.money');

  constructor(root: HTMLElement, private game: Game, private onClose: () => void) {
    this.el.append(
      h('div.shop-window.silo-window', {},
        h('div.shop-head', {}, h('h2', {}, 'Silo'), this.moneyEl, h('button.btn.close', { onclick: () => this.close() }, '✕')),
        this.status,
        this.body,
        h('div.dim.foot', {}, 'Prices are paused while this window is open. Press E or Esc to close.'),
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
    const { crop, amount } = g.grain;
    const space = g.storageCapacity - g.stored;

    const tank = h('section', {}, h('h3', {}, 'Tractor tank'),
      !crop || amount <= 0
        ? h('div.item', {}, h('span.dim', {}, 'Tank is empty.'))
        : !isGrain(crop)
        ? h('div.item', {}, h('div', {}, h('b', {}, amountText(crop, amount)),
          h('div.dim', {}, 'The silo only takes grain. Sell produce at the farm stand.')))
        : h('div.item', {},
          h('div', {}, h('b', {}, `${amount.toLocaleString()} L ${CROPS[crop].name}`),
            h('div.dim', {}, `Worth ${money(amount * g.price(crop))} now at $${g.price(crop).toFixed(2)}/L`)),
          h('div.btns', {},
            h('button.btn', { disabled: space <= 0, onclick: () => this.act(g.unloadGrain()) }, 'Store'),
            h('button.btn.buy', { onclick: () => this.act(g.sellGrain()) }, 'Sell'))),
    );

    const rows = GRAIN_IDS.map((id) => {
      const litres = g.storage[id];
      const price = g.price(id);
      const tr = priceTrend(id, g.time);
      return h('div.item', {},
        h('div', {}, h('b', {}, `${CROPS[id].name}: ${litres.toLocaleString()} L`),
          h('div.dim', {}, h(`span.price.t${tr + 1}`, {}, `$${price.toFixed(2)}/L ${tr > 0 ? '▲' : tr < 0 ? '▼' : '•'}`),
            ` · base $${CROPS[id].basePrice.toFixed(2)}`)),
        h('button.btn.buy', { disabled: litres <= 0, onclick: () => this.act(g.sellStored(id)) },
          litres > 0 ? `Sell ${money(litres * price)}` : 'Sell'),
      );
    });

    this.body.replaceChildren(
      tank,
      h('section', {}, h('h3', {}, `Storage · ${g.stored.toLocaleString()} / ${g.storageCapacity.toLocaleString()} L`), ...rows),
    );
  }
}
