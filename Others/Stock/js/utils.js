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

export function filterNullOHLCDataPoints(timestamps, opens, highs, lows, closes) {
  if (!timestamps || !opens || !highs || !lows || !closes || 
      timestamps.length !== opens.length || 
      timestamps.length !== highs.length || 
      timestamps.length !== lows.length || 
      timestamps.length !== closes.length) {
    return { timestamps: [], opens: [], highs: [], lows: [], closes: [] };
  }
  const validData = timestamps.map((ts, index) => ({
    timestamp: ts,
    open: opens[index],
    high: highs[index],
    low: lows[index],
    close: closes[index]
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
    closes: validData.map(item => item.close)
  };
}

export function isMarketOpen() {
    const d = new Date()
    const day = d.getDay()
    const h = d.getHours() + d.getMinutes()/60
    return day > 0 && day < 6 && h >= 9 && h <= 17.5
}
