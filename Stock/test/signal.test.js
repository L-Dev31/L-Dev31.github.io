import assert from 'assert';
import { calculateRSI, calculateEMA, calculateATR, computeStops, computePositionSizing } from '../js/signal-bot.js';

console.log('Running basic signal-bot unit tests...');

// RSI tests
{
  const up = Array.from({length: 30}, (_, i) => i + 1);
  const rsi = calculateRSI(up);
  console.log('RSI(up) =', rsi);
  assert(rsi > 70, `Expected RSI > 70 for an upward sequence, got ${rsi}`);
}

{
  const down = Array.from({length: 30}, (_, i) => 100 - i);
  const rsi = calculateRSI(down);
  console.log('RSI(down) =', rsi);
  assert(rsi < 30, `Expected RSI < 30 for a downward sequence, got ${rsi}`);
}

// EMA test: constant signal
{
  const arr = Array(30).fill(100);
  const ema = calculateEMA(arr, 10);
  console.log('EMA const =', ema);
  assert(Math.abs(ema - 100) < 1e-6, 'EMA on constant signal should be constant');
}

// ATR test: simple values
{
  const highs = [10, 11, 12, 13, 14, 15];
  const lows = [9, 10, 11, 12, 13, 14];
  const closes = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5];
  const atr = calculateATR(highs, lows, closes, 3);
  console.log('ATR =', atr);
  assert(atr > 0, 'ATR should be > 0 for rising candles');
}

// computeStops test
{
  const cs = computeStops(100, 2, 1, 1.5, 2.5);
  console.log('Stops buy =', cs);
  assert(cs.stopLoss < 100, 'Buy stopLoss should be below price');
  const cs2 = computeStops(100, 2, -1, 1.5, 2.5);
  console.log('Stops sell =', cs2);
  assert(cs2.stopLoss > 100, 'Sell stopLoss should be above price');
}

// computePositionSizing test: risk-based outputs
{
  const posPct = computePositionSizing(80, 100, 98, 10000, 0.01, 0.2);
  console.log('Position % =', posPct);
  assert(Math.abs(posPct) > 0, 'Position sizing should result in a non-zero allocation for valid inputs');
}

console.log('All basic tests passed.');
