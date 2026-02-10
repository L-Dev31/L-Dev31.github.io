export function filterNullDataPoints(timestamps, prices) {
  if (!timestamps || !prices || timestamps.length !== prices.length) {
    return { timestamps: [], prices: [] };
  }
  const validData = timestamps.map((ts, index) => ({
    timestamp: ts,
    price: prices[index]
  })).filter(item =>
    item.timestamp != null &&
    item.price != null &&
    !isNaN(item.price) &&
    !isNaN(item.timestamp)
  );
  return {
    timestamps: validData.map(item => item.timestamp),
    prices: validData.map(item => item.price)
  };
}

export function filterNullOHLCDataPoints(timestamps, opens, highs, lows, closes, volumes) {
  if (!timestamps || !opens || !highs || !lows || !closes ||
      timestamps.length !== opens.length ||
      timestamps.length !== highs.length ||
      timestamps.length !== lows.length ||
      timestamps.length !== closes.length) {
    return { timestamps: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
  }
  const hasVolumes = Array.isArray(volumes) && volumes.length === timestamps.length;
  const validData = timestamps.map((ts, index) => ({
    timestamp: ts,
    open: opens[index],
    high: highs[index],
    low: lows[index],
    close: closes[index],
    volume: hasVolumes ? (volumes[index] || 0) : 0
  })).filter(item =>
    item.timestamp != null && !isNaN(item.timestamp) &&
    item.open != null && !isNaN(item.open) &&
    item.high != null && !isNaN(item.high) &&
    item.low != null && !isNaN(item.low) &&
    item.close != null && !isNaN(item.close)
  );
  return {
    timestamps: validData.map(item => item.timestamp),
    opens: validData.map(item => item.open),
    highs: validData.map(item => item.high),
    lows: validData.map(item => item.low),
    closes: validData.map(item => item.close),
    volumes: validData.map(item => item.volume)
  };
}

export function computeChange(open, price) {
  const safeOpen = Number.isFinite(open) ? open : 0;
  const safePrice = Number.isFinite(price) ? price : 0;
  const change = safePrice - safeOpen;
  const changePercent = safeOpen ? (change / safeOpen) * 100 : 0;
  return { change, changePercent };
}

export function periodToDays(period) {
  switch ((period || '').toUpperCase()) {
    case '1D': return 1;
    case '1W': return 7;
    case '1M': return 30;
    case '3M': return 90;
    case '6M': return 180;
    case '1Y': return 365;
    case '3Y': return 1095;
    case '5Y': return 1825;
    case 'MAX': return 36500;
    default: return 7;
  }
}

export function dateCutoff(days) {
  return Math.floor((Date.now() - (days || 0) * 86400000) / 1000);
}

export function normalizeSymbol(sym) {
  return (sym || '').toUpperCase()
    .replace(/^([A-Z0-9]+)\.([A-Z])$/, '$1-$2')
    .replace(/^([A-Z0-9]+)\/P([A-Z0-9]+)$/, '$1-P$2')
    .replaceAll('/', '-');
}

export function isMarketOpen() {
    const d = new Date();
    const day = d.getDay();
    const h = d.getHours() + d.getMinutes()/60;
    return day > 0 && day < 6 && h >= 9 && h <= 17.5;
}
