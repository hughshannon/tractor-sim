/**
 * Farm loans. Interest accrues continuously on the balance. Every morning (each new game day) the bank
 * collects an instalment of the balance; if you cannot cover it a late fee is added instead.
 */

/** Interest per game day on the outstanding balance (0.03 = 3%). */
export const LOAN_RATE = 0.03;
/** Fraction of the balance collected each morning. */
export const INSTALMENT_RATE = 0.1;
/** Balances below this are collected in full. */
export const MIN_INSTALMENT = 100;
/** Penalty added to the balance for a missed instalment, as a fraction of the balance. */
export const LATE_FEE_RATE = 0.03;
/** Credit every farm gets, before counting what it owns. */
export const BASE_CREDIT = 8000;
/** Share of the value of land, buildings and bought equipment the bank will lend against. */
export const COLLATERAL_RATE = 0.5;
/** Borrowing and credit limits move in steps of this size. */
export const CREDIT_STEP = 500;

/** Credit limit for a farm whose purchases are worth `assets`. */
export function creditLimit(assets: number): number {
  return Math.floor((BASE_CREDIT + assets * COLLATERAL_RATE) / CREDIT_STEP) * CREDIT_STEP;
}

/** The instalment due for a balance: 10%, rounded up, or the whole thing once it is small. */
export function instalment(balance: number): number {
  if (balance <= 0) return 0;
  const owed = Math.ceil(balance);
  return owed <= MIN_INSTALMENT ? owed : Math.min(owed, Math.max(MIN_INSTALMENT, Math.ceil(balance * INSTALMENT_RATE)));
}

/** Late fee for missing an instalment on this balance. */
export function lateFee(balance: number): number {
  return Math.ceil(balance * LATE_FEE_RATE);
}
