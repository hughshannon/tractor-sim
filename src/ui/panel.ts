import type { ActionResult, Game } from '../sim/game';
import { h, money } from './dom';

/** A modal window opened from a yard zone: a header with money, a status line and a body re-rendered after each action. */
export abstract class Panel {
  protected el = h('div.shop.hidden');
  protected body = h('div.silo-body');
  private status = h('div.shop-status');
  private moneyEl = h('span.money');

  constructor(root: HTMLElement, protected game: Game, private onClose: () => void, title: string, foot: string) {
    this.el.append(
      h('div.shop-window.silo-window', {},
        h('div.shop-head', {}, h('h2', {}, title), this.moneyEl, h('button.btn.close', { onclick: () => this.close() }, '✕')),
        this.status,
        this.body,
        h('div.dim.foot', {}, foot),
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
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }

  protected act(r: ActionResult): void {
    this.status.textContent = r.text;
    this.status.className = `shop-status ${r.ok ? 'good' : 'warn'}`;
    this.refresh();
  }

  private refresh(): void {
    this.moneyEl.textContent = money(this.game.money);
    this.body.replaceChildren(...this.render());
  }

  protected abstract render(): HTMLElement[];
}
