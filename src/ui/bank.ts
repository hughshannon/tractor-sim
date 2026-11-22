import { COLLATERAL_RATE, INSTALMENT_RATE, LOAN_RATE, instalment } from '../sim/bank';
import { DAY_LENGTH, clockText } from '../sim/daylight';
import type { Game } from '../sim/game';
import { h, money } from './dom';
import { Panel } from './panel';

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** Bank modal: borrow against the farm and repay the loan. */
export class Bank extends Panel {
  constructor(root: HTMLElement, game: Game, onClose: () => void) {
    super(root, game, onClose, 'Farm Bank', 'Time is paused while you are at the bank. Press E or Esc to close.');
  }

  protected render(): HTMLElement[] {
    const g = this.game;
    const owed = Math.ceil(g.loan);
    const avail = g.creditAvailable;
    const due = instalment(g.loan);
    const nextAt = clockText(g.time + g.nextPaymentIn);
    const minsLeft = Math.ceil(g.nextPaymentIn / 60);

    const account = h('section', {}, h('h3', {}, 'Your account'),
      h('div.item', {}, h('div', {}, h('b', {}, owed > 0 ? `Loan balance ${money(owed)}` : 'No loan'),
        h('div.dim', {}, owed > 0
          ? `Next instalment ${money(due)} at ${nextAt} (in about ${minsLeft} min)`
          : `Interest is ${pct(LOAN_RATE)} per day. Borrow only what you need.`)),
        g.loanMissed > 0 ? h('span.tag.late', {}, `${g.loanMissed} missed`) : null),
      h('div.item', {}, h('div', {}, h('b', {}, `Credit limit ${money(g.creditLimit)}`),
        h('div.dim', {}, `You can borrow ${money(avail)} more. The limit rises by ${pct(COLLATERAL_RATE)} of what you pay for land, buildings and equipment.`))),
    );

    const steps = [1000, 5000, 10000].filter((n) => n < avail);
    const borrow = h('section', {}, h('h3', {}, 'Borrow'),
      h('div.item', {},
        h('div.dim', {}, 'Money is paid into your account straight away.'),
        h('div.btns', {},
          ...steps.map((n) => h('button.btn', { onclick: () => this.act(g.borrow(n)) }, `+${money(n)}`)),
          h('button.btn.buy', { disabled: avail <= 0, onclick: () => this.act(g.borrow(avail)) }, avail > 0 ? `Max ${money(avail)}` : 'At limit'))),
    );

    const payAll = Math.min(owed, Math.floor(g.money));
    const repay = h('section', {}, h('h3', {}, 'Repay'),
      h('div.item', {},
        h('div.dim', {}, owed > 0 ? 'Pay early to save on interest.' : 'Nothing to repay.'),
        h('div.btns', {},
          ...[1000, 5000].filter((n) => n < owed).map((n) =>
            h('button.btn', { disabled: g.money < n, onclick: () => this.act(g.repay(n)) }, money(n))),
          h('button.btn.buy', { disabled: owed <= 0 || payAll <= 0, onclick: () => this.act(g.repay()) },
            payAll >= owed ? `Pay off ${money(owed)}` : `Pay ${money(payAll)}`))),
    );

    const terms = h('section', {}, h('h3', {}, 'Terms'),
      h('div.dim.note', {},
        `Interest: ${pct(LOAN_RATE)} per day (a day is ${DAY_LENGTH / 60} minutes), added continuously. `
        + `Every morning at ${clockText(0)} the bank collects ${pct(INSTALMENT_RATE)} of the balance. `
        + `If you can't cover it, the instalment is marked missed. There are no late fees.`),
    );
    return [account, borrow, repay, terms];
  }
}
