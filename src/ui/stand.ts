import { CROPS, PRODUCE_IDS, amountText, isProduce } from '../sim/crops';
import type { Game } from '../sim/game';
import { CLOSE_HOUR, OPEN_HOUR, PRICE_LEVELS, STAND_LEVELS, WHOLESALE_RATE } from '../sim/stand';
import { h, money } from './dom';
import { Panel } from './panel';

const hour = (n: number) => `${String(n).padStart(2, '0')}:00`;

/** Farm stand modal: stock it from the tank, set prices, upgrade it. */
export class Stand extends Panel {
  constructor(root: HTMLElement, game: Game, onClose: () => void) {
    super(root, game, onClose, 'Farm Stand', 'Time is paused while this window is open. Press E or Esc to close.');
  }

  protected render(): HTMLElement[] {
    const g = this.game;
    const level = STAND_LEVELS[g.standLevel];
    const { crop, amount } = g.grain;
    const space = g.standCapacity - g.standStocked;

    const tank = h('section', {}, h('h3', {}, 'Tractor tank'),
      !crop || amount <= 0
        ? h('div.item', {}, h('span.dim', {}, 'Tank is empty. Harvest potatoes, tomatoes, pumpkins or sunflowers to sell here.'))
        : !isProduce(crop)
          ? h('div.item', {}, h('div', {}, h('b', {}, amountText(crop, amount)),
            h('div.dim', {}, 'The farm stand sells vegetables and flowers. Take grain to the silo.')))
          : h('div.item', {},
            h('div', {}, h('b', {}, amountText(crop, amount)),
              h('div.dim', {}, `Wholesaler pays ${money(amount * CROPS[crop].basePrice * WHOLESALE_RATE)} now; customers pay $${g.standPrice(crop).toFixed(2)}/${CROPS[crop].unit}`)),
            h('div.btns', {},
              h('button.btn.buy', { disabled: space <= 0, onclick: () => this.act(g.stockStand()) }, 'Stock stand'),
              h('button.btn.ghost', { onclick: () => this.act(g.wholesale()) }, 'Wholesale'))),
    );

    const stock = h('section', {},
      h('h3', {}, `${level.name} · ${g.standStocked.toLocaleString()} / ${g.standCapacity.toLocaleString()} in stock`),
      h('div.item.stock', {}, ...PRODUCE_IDS.map((id) => h('div.row', {},
        h('b', {}, `${CROPS[id].name}: ${g.standStock[id].toLocaleString()} ${CROPS[id].unit}`),
        h('span.dim', {}, `$${g.standPrice(id).toFixed(2)} per ${CROPS[id].unit === 'pcs' ? 'pumpkin' : CROPS[id].unit === 'stems' ? 'stem' : CROPS[id].unit}`),
      ))),
      h('div.dim.note', {},
        `Open ${hour(OPEN_HOUR)}–${hour(CLOSE_HOUR)} · ${g.standOpen ? 'open now' : 'closed now'}`
        + ` · about ${Math.round(g.potentialCustomerRate * 60)} customers per minute with this stock.`
        + ' More kinds of produce bring more customers.'),
      h('div.row.dim', {}, h('span', {}, `Takings today ${money(g.standToday)}`), h('span', {}, `All time ${money(g.stats.standEarned)}`)),
    );

    const prices = h('section', {}, h('h3', {}, 'Prices'),
      h('div.item', {},
        h('div.dim', {}, 'Lower prices bring more customers; premium prices earn more from each sale.'),
        h('div.btns', {}, ...PRICE_LEVELS.map((p, i) =>
          h(`button.btn${g.standPriceLevel === i ? '' : '.ghost'}`, { onclick: () => this.act(g.setStandPrice(i)) },
            `${p.name} ${p.mul === 1 ? '' : p.mul < 1 ? `-${Math.round((1 - p.mul) * 100)}%` : `+${Math.round((p.mul - 1) * 100)}%`}`)))),
    );

    const next = STAND_LEVELS[g.standLevel + 1];
    const upgrade = h('section', {}, h('h3', {}, 'Upgrade'),
      next
        ? h('div.item', {},
          h('div', {}, h('b', {}, next.name),
            h('div.dim', {}, `Holds ${next.capacity.toLocaleString()} · ×${(next.demand / level.demand).toFixed(1)} customers`)),
          h('button.btn.buy', { disabled: g.money < next.price, onclick: () => this.act(g.buyStandUpgrade()) }, `Build ${money(next.price)}`))
        : h('div.item', {}, h('span.dim', {}, 'Your farm shop is fully upgraded.')),
    );
    return [tank, stock, prices, upgrade];
  }
}
