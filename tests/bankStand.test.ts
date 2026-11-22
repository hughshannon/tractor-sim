import { describe, expect, it } from 'vitest';
import { BASE_CREDIT, LOAN_RATE, creditLimit, instalment } from '../src/sim/bank';
import { CROPS, PRODUCE_IDS, tileYield } from '../src/sim/crops';
import { DAY_LENGTH } from '../src/sim/daylight';
import { IMPLEMENTS } from '../src/sim/equipment';
import { Field, TileState } from '../src/sim/field';
import { Game, START_MONEY } from '../src/sim/game';
import {
  BASKET, MAX_CUSTOMERS, PRICE_LEVELS, STAND_COUNTER, STAND_LEVELS, WHOLESALE_RATE,
  customerPose, customerRate, isOpen, makeCustomer, standPrice, timeline,
} from '../src/sim/stand';

const idle = { throttle: 0, steer: 0, brake: true };

/** Deterministic PRNG for customers. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function run(g: Game, seconds: number, step = 0.1) {
  for (let t = 0; t < seconds; t += step) g.update(step, idle);
}

describe('bank loans', () => {
  it('lends up to the credit limit, which grows with what the farm owns', () => {
    const g = new Game();
    expect(g.creditLimit).toBe(BASE_CREDIT);
    expect(g.borrow(BASE_CREDIT + 1).ok).toBe(false);
    expect(g.borrow(5000).ok).toBe(true);
    expect(g.money).toBe(START_MONEY + 5000);
    expect(g.loan).toBe(5000);
    expect(g.creditAvailable).toBe(BASE_CREDIT - 5000);

    g.money = 1e5;
    g.buyField(2);
    expect(g.creditLimit).toBe(creditLimit(12000));
    expect(g.creditLimit).toBeGreaterThan(BASE_CREDIT);
  });

  it('charges interest over time', () => {
    const g = new Game();
    g.borrow(5000);
    run(g, DAY_LENGTH / 2);
    // Half a day of continuous interest, slightly more than simple interest.
    expect(g.loan).toBeGreaterThan(5000 * (1 + LOAN_RATE / 2));
    expect(g.loan).toBeLessThan(5000 * (1 + LOAN_RATE / 2) * 1.001);
  });

  it('collects an instalment each morning', () => {
    const g = new Game();
    g.borrow(5000);
    const money = g.money;
    g.time = DAY_LENGTH - 0.05;
    const before = g.loan;
    g.update(0.1, idle);
    // The tick also accrues a fraction of a cent of interest before collecting.
    const paid = money - g.money;
    expect(paid).toBeGreaterThanOrEqual(instalment(before));
    expect(paid).toBeLessThanOrEqual(instalment(before) + 1);
    expect(g.loan).toBeCloseTo(before - paid, 1);
    expect(g.loanMissed).toBe(0);
  });

  it('records a missed instalment without charging a late fee', () => {
    const g = new Game();
    g.borrow(5000);
    g.money = 10;
    g.time = DAY_LENGTH - 0.05;
    const before = g.loan;
    g.update(0.1, idle);
    expect(g.money).toBe(10);
    expect(g.loanMissed).toBe(1);
    // Only a fraction of a cent of interest from the tick itself; no penalty.
    expect(g.loan - before).toBeLessThan(0.01);
    expect(g.messages.some((m) => /missed a \$\d+ instalment/i.test(m.text))).toBe(true);
  });

  it('repays part or all of the loan', () => {
    const g = new Game();
    g.borrow(5000);
    expect(g.repay(1000).ok).toBe(true);
    expect(g.loan).toBe(4000);
    expect(g.repay().ok).toBe(true);
    expect(g.loan).toBe(0);
    expect(g.money).toBe(START_MONEY);
    expect(g.repay().ok).toBe(false);
  });

  it('only repays what you can afford', () => {
    const g = new Game();
    g.borrow(5000);
    g.money = 700;
    expect(g.repay().ok).toBe(true);
    expect(g.money).toBe(0);
    expect(g.loan).toBe(4300);
  });

  it('clears small balances in one instalment', () => {
    expect(instalment(0)).toBe(0);
    expect(instalment(60.2)).toBe(61);
    expect(instalment(500)).toBe(100);
    expect(instalment(5000)).toBe(500);
  });

  it('points broke players to the bank', () => {
    const g = new Game();
    g.money = 0;
    g.fuel = 10;
    expect(g.refuel().text).toMatch(/not enough money for fuel.*bank/i);
    g.attach('seeder_s');
    expect(g.buyImplement('plow_l').text).toMatch(/bank/i);
  });
});

describe('vegetable crops', () => {
  it('grow and harvest like other crops, counted in their own units', () => {
    const f = new Field(1, 'Veg', 0, 0, 4, 1, 0, true);
    PRODUCE_IDS.forEach((id, i) => {
      f.plow(i);
      f.seed(i, id);
    });
    f.update(Math.max(...PRODUCE_IDS.map((id) => CROPS[id].growTime)));
    PRODUCE_IDS.forEach((id, i) => {
      expect(f.state[i]).toBe(TileState.Ripe);
      expect(f.harvest(i)).toEqual({ crop: id, amount: tileYield(id, false) });
    });
  });

  it('cannot be sold or stored at the silo', () => {
    const g = new Game();
    g.grain = { crop: 'pumpkin', amount: 40 };
    expect(g.sellGrain().ok).toBe(false);
    g.money = 1e5;
    g.buyStorage();
    expect(g.unloadGrain().ok).toBe(false);
    expect(g.grain.amount).toBe(40);
  });

  it('harvests produce into the tank', () => {
    const g = new Game();
    const f = g.fields[0];
    for (let i = 0; i < f.size; i++) {
      f.state[i] = TileState.Ripe;
      f.crop[i] = 3; // potato
    }
    f.version++;
    g.lowered = true;
    g.tractor.heading = 0;
    g.tractor.x = f.x + 10;
    g.tractor.z = f.z + 5 - IMPLEMENTS.harvester_s.offset;
    g.work();
    expect(g.grain.crop).toBe('potato');
    expect(g.grain.amount).toBeGreaterThanOrEqual(2 * CROPS.potato.yieldPerTile);
  });
});

describe('farm stand', () => {
  it('stocks produce from the tank up to its capacity', () => {
    const g = new Game();
    g.grain = { crop: 'wheat', amount: 100 };
    expect(g.stockStand().ok).toBe(false);
    g.grain = { crop: 'tomato', amount: 500 };
    expect(g.stockStand().ok).toBe(true);
    expect(g.standStock.tomato).toBe(STAND_LEVELS[0].capacity);
    expect(g.grain).toEqual({ crop: 'tomato', amount: 500 - STAND_LEVELS[0].capacity });
    expect(g.stockStand().ok).toBe(false);
  });

  it('opens during the day only', () => {
    expect(isOpen(0)).toBe(true); // 07:30
    expect(isOpen(DAY_LENGTH * 0.6)).toBe(false); // ~22:00
  });

  it('gets more customers with lower prices, more variety and a bigger stand', () => {
    expect(customerRate(0, 1, 0)).toBe(0);
    expect(customerRate(0, 0, 1)).toBeGreaterThan(customerRate(0, 1, 1));
    expect(customerRate(0, 2, 1)).toBeLessThan(customerRate(0, 1, 1));
    expect(customerRate(0, 1, 3)).toBeGreaterThan(customerRate(0, 1, 1));
    expect(customerRate(2, 1, 1)).toBeGreaterThan(customerRate(1, 1, 1));
    expect(standPrice('tomato', 2)).toBeCloseTo(CROPS.tomato.basePrice * PRICE_LEVELS[2].mul);
  });

  it('customers walk in from the road, buy at the counter and leave', () => {
    const c = makeCustomer(1, 'potato', seeded(3));
    const { arrive, leave, gone } = timeline(c);
    expect(arrive).toBeGreaterThan(5);
    expect(c.want).toBeGreaterThanOrEqual(BASKET.potato[0]);
    expect(c.want).toBeLessThanOrEqual(BASKET.potato[1]);
    const start = customerPose(c);
    expect(start.z).toBeGreaterThan(8);
    c.age = (arrive + leave) / 2;
    const atCounter = customerPose(c);
    expect(atCounter.walking).toBe(false);
    expect(Math.abs(atCounter.x - STAND_COUNTER.x)).toBeLessThan(2);
    expect(atCounter.z).toBeCloseTo(STAND_COUNTER.z, 0);
    c.age = gone;
    expect(customerPose(c).z).toBeGreaterThan(8);
  });

  it('sells stock to customers over the day', () => {
    const g = new Game();
    g.random = seeded(7);
    g.standStock = { potato: 100, tomato: 100, pumpkin: 20, sunflower: 100 };
    const stocked = g.standStocked;
    run(g, 120);
    expect(g.standStocked).toBeLessThan(stocked);
    expect(g.money).toBeGreaterThan(START_MONEY);
    expect(g.stats.standEarned).toBe(g.money - START_MONEY);
    expect(g.standToday).toBe(g.stats.standEarned);
    expect(g.customers.length).toBeLessThanOrEqual(MAX_CUSTOMERS);
  });

  it('gets no new customers when empty or closed', () => {
    const g = new Game();
    g.random = seeded(9);
    run(g, 60);
    expect(g.customers.length).toBe(0);
    g.standStock.potato = 50;
    g.time = DAY_LENGTH * 0.6;
    run(g, 60);
    expect(g.customers.length).toBe(0);
    expect(g.standStock.potato).toBe(50);
  });

  it('never sells more than is in stock', () => {
    const g = new Game();
    g.random = seeded(11);
    g.standStock.pumpkin = 3;
    run(g, 200);
    expect(g.standStock.pumpkin).toBe(0);
    expect(g.stats.standEarned).toBe(3 * CROPS.pumpkin.basePrice);
    expect(g.money).toBe(START_MONEY + g.stats.standEarned);
  });

  it('wholesales the tank at a low price', () => {
    const g = new Game();
    g.grain = { crop: 'sunflower', amount: 100 };
    expect(g.wholesale().ok).toBe(true);
    expect(g.money).toBe(START_MONEY + Math.round(100 * CROPS.sunflower.basePrice * WHOLESALE_RATE));
    expect(g.grain.amount).toBe(0);
  });

  it('upgrades level by level', () => {
    const g = new Game();
    g.money = 1e6;
    for (let i = 1; i < STAND_LEVELS.length; i++) expect(g.buyStandUpgrade().ok).toBe(true);
    expect(g.buyStandUpgrade().ok).toBe(false);
    expect(g.standCapacity).toBe(STAND_LEVELS.at(-1)!.capacity);
  });
});
