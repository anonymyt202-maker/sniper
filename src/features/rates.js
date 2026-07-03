const axios = require('axios');

async function getCurrencyRates() {
  // CBU (O'zbekiston Markaziy banki) rasmiy kurslari - keysiz, bepul
  const { data } = await axios.get('https://cbu.uz/oz/arkhiv-kursov-valyut/json/', { timeout: 10000 });
  const wanted = ['USD', 'EUR', 'RUB', 'GBP', 'CNY', 'KZT'];
  const filtered = data.filter((c) => wanted.includes(c.Ccy));

  let text = '💱 *Valyuta narxlari* (CBU rasmiy)\n\n';
  for (const c of filtered) {
    const diff = parseFloat(c.Diff);
    const arrow = diff > 0 ? '🔺' : diff < 0 ? '🔻' : '➖';
    text += `${flagFor(c.Ccy)} ${c.Ccy}: *${Number(c.Rate).toLocaleString('ru-RU')}* so'm ${arrow}${Math.abs(diff)}\n`;
  }
  text += `\n📅 ${data[0]?.Date || ''}`;
  return text;
}

function flagFor(ccy) {
  const map = { USD: '🇺🇸', EUR: '🇪🇺', RUB: '🇷🇺', GBP: '🇬🇧', CNY: '🇨🇳', KZT: '🇰🇿' };
  return map[ccy] || '💰';
}

async function getCryptoRates() {
  // Binance public API - keysiz, bepul
  const symbols = ['BTCUSDT', 'ETHUSDT', 'TONUSDT', 'BNBUSDT', 'SOLUSDT', 'DOGEUSDT'];
  const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 10000 });
  const filtered = data.filter((d) => symbols.includes(d.symbol));

  let text = '💱 *Kripto narxlari* (Binance)\n\n';
  const nameMap = { BTCUSDT: '₿ BTC', ETHUSDT: 'Ξ ETH', TONUSDT: '💎 TON', BNBUSDT: '🟡 BNB', SOLUSDT: '🌞 SOL', DOGEUSDT: '🐕 DOGE' };
  for (const sym of symbols) {
    const d = filtered.find((x) => x.symbol === sym);
    if (!d) continue;
    const change = parseFloat(d.priceChangePercent);
    const arrow = change > 0 ? '🔺' : change < 0 ? '🔻' : '➖';
    text += `${nameMap[sym]}: *$${Number(d.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })}* ${arrow}${Math.abs(change).toFixed(2)}%\n`;
  }
  return text;
}

module.exports = { getCurrencyRates, getCryptoRates };
