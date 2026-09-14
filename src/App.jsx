import React, { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Legend
} from "recharts";
import { Search, TrendingUp, TrendingDown, AlertTriangle, Loader2, Info } from "lucide-react";

// ---------- palette ----------
const INK = "#0D1117";
const PANEL = "#141B24";
const LINE = "#232D3A";
const TEXT = "#E7EBF0";
const MUTED = "#7C8A9B";
const BULL = "#3AC08A";
const BEAR = "#E4664C";
const WAIT = "#E0AA3E";
const ACCENT = "#5B8DEF";

const ASSET_CLASSES = [
  { id: "crypto", label: "Crypto", hint: "e.g. BTC, ETH, SOL", src: "Binance — live, no key needed" },
  { id: "forex", label: "Forex", hint: "e.g. EURUSD, GBPJPY", src: "Twelve Data — needs free API key" },
  { id: "metal", label: "Metals", hint: "e.g. XAUUSD, XAGUSD", src: "Twelve Data — needs free API key" },
  { id: "stock", label: "Stocks", hint: "e.g. AAPL, TSLA", src: "Twelve Data — needs free API key" },
];

const INTERVALS = [
  { id: "15m", label: "15m", binance: "15m", twelve: "15min" },
  { id: "1h", label: "1H", binance: "1h", twelve: "1h" },
  { id: "4h", label: "4H", binance: "4h", twelve: "4h" },
  { id: "1d", label: "1D", binance: "1d", twelve: "1day" },
];

const QUICK = {
  crypto: ["BTC", "ETH", "SOL", "XRP"],
  forex: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"],
  metal: ["XAUUSD", "XAGUSD"],
  stock: ["AAPL", "TSLA", "NVDA", "MSFT"],
};

// ---------- math helpers ----------
function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  const gains = [], losses = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  if (values.length <= period) return out;
  let avgG = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgL = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = 100 - 100 / (1 + avgG / (avgL || 1e-9));
  for (let i = period + 1; i < values.length; i++) {
    avgG = (avgG * (period - 1) + gains[i - 1]) / period;
    avgL = (avgL * (period - 1) + losses[i - 1]) / period;
    out[i] = 100 - 100 / (1 + avgG / (avgL || 1e-9));
  }
  return out;
}

function atr(highs, lows, closes, period = 14) {
  const trs = highs.map((h, i) => {
    if (i === 0) return h - lows[i];
    return Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  });
  const out = new Array(highs.length).fill(null);
  if (trs.length <= period) return out;
  let sum = trs.slice(0, period).reduce((a, b) => a + b, 0);
  out[period - 1] = sum / period;
  for (let i = period; i < trs.length; i++) out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
  return out;
}

function macdHist(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(macdLine, 9);
  return macdLine.map((v, i) => v - signal[i]);
}

function findSwings(highs, lows, window = 4) {
  const swingHighIdx = [], swingLowIdx = [];
  for (let i = window; i < highs.length - window; i++) {
    const hSlice = highs.slice(i - window, i + window + 1);
    const lSlice = lows.slice(i - window, i + window + 1);
    if (highs[i] === Math.max(...hSlice)) swingHighIdx.push(i);
    if (lows[i] === Math.min(...lSlice)) swingLowIdx.push(i);
  }
  return { swingHighIdx, swingLowIdx };
}

// ---------- strategy engine ----------
function analyze(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const n = closes.length;
  const e50 = ema(closes, 50);
  const e200 = ema(closes, Math.min(200, Math.max(50, Math.floor(n / 2))));
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(highs, lows, closes, 14);
  const hist = macdHist(closes);
  const { swingHighIdx, swingLowIdx } = findSwings(highs, lows, 4);

  const last = n - 1;
  const price = closes[last];
  const atrVal = atrArr[last] || (Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20))) / 20;
  const e50v = e50[last], e200v = e200[last];

  // volatility spike check
  const atrWindow = atrArr.slice(-20).filter(v => v != null);
  const avgAtr = atrWindow.length ? atrWindow.reduce((a, b) => a + b, 0) / atrWindow.length : atrVal;
  const volSpike = atrVal > avgAtr * 2.2;

  const emaGapRatio = Math.abs(e50v - e200v) / (atrVal || 1e-9);
  const trendUp = e50v > e200v && price > e50v;
  const trendDown = e50v < e200v && price < e50v;
  const choppy = emaGapRatio < 0.5 || (!trendUp && !trendDown);

  const reasons = [];
  let verdict = "UNSTABLE";
  let entry = price, sl = null, tp1 = null, tp2 = null, rr = null;
  let side = null;

  if (volSpike) {
    reasons.push("Volatility just spiked well above its recent average — normal stop/target math is unreliable right now.");
  }

  if (choppy) {
    reasons.push("Trend EMAs (50/200) are tangled close together relative to volatility — no clean directional edge.");
    verdict = "UNSTABLE";
  } else {
    side = trendUp ? "bull" : "bear";
    reasons.push(trendUp
      ? "Daily-style trend filter: price is above both EMA 50 and 200, with EMA 50 above EMA 200 — bullish bias."
      : "Daily-style trend filter: price is below both EMA 50 and 200, with EMA 50 below EMA 200 — bearish bias.");

    // pullback zone check: price within 1.2 ATR of EMA50
    const distToE50 = Math.abs(price - e50v);
    const atZone = distToE50 <= atrVal * 1.2;
    reasons.push(atZone
      ? "Price has pulled back close to the EMA 50 zone — a valid entry area."
      : "Price hasn't pulled back to the EMA 50 zone yet — it's extended.");

    // confirmation: RSI or MACD histogram flip in last 3 bars
    let confirmed = false;
    const rsiRecent = rsiArr.slice(-4).filter(v => v != null);
    const histRecent = hist.slice(-3);
    if (side === "bull") {
      const rsiTurnUp = rsiRecent.length >= 2 && rsiRecent[rsiRecent.length - 1] > rsiRecent[0] && rsiRecent[0] < 45;
      const macdFlip = histRecent.length >= 2 && histRecent[histRecent.length - 2] <= 0 && histRecent[histRecent.length - 1] > 0;
      confirmed = rsiTurnUp || macdFlip;
      reasons.push(confirmed
        ? "Momentum confirmation present: RSI turning up from a dip, or MACD histogram just flipped positive."
        : "No momentum confirmation yet (RSI/MACD haven't turned in the trend's favor).");
    } else {
      const rsiTurnDown = rsiRecent.length >= 2 && rsiRecent[rsiRecent.length - 1] < rsiRecent[0] && rsiRecent[0] > 55;
      const macdFlip = histRecent.length >= 2 && histRecent[histRecent.length - 2] >= 0 && histRecent[histRecent.length - 1] < 0;
      confirmed = rsiTurnDown || macdFlip;
      reasons.push(confirmed
        ? "Momentum confirmation present: RSI turning down from a bounce, or MACD histogram just flipped negative."
        : "No momentum confirmation yet (RSI/MACD haven't turned in the trend's favor).");
    }

    if (atZone && confirmed && !volSpike) {
      verdict = side === "bull" ? "BUY" : "SELL";
      if (side === "bull") {
        const lastSwingLowIdx = [...swingLowIdx].reverse().find(i => i < last);
        const swingLow = lastSwingLowIdx != null ? lows[lastSwingLowIdx] : Math.min(...lows.slice(-20));
        sl = swingLow - atrVal;
        const risk = entry - sl;
        tp1 = entry + risk * 1;
        tp2 = entry + risk * 2;
        rr = risk > 0 ? ((tp2 - entry) / risk).toFixed(2) : null;
      } else {
        const lastSwingHighIdx = [...swingHighIdx].reverse().find(i => i < last);
        const swingHigh = lastSwingHighIdx != null ? highs[lastSwingHighIdx] : Math.max(...highs.slice(-20));
        sl = swingHigh + atrVal;
        const risk = sl - entry;
        tp1 = entry - risk * 1;
        tp2 = entry - risk * 2;
        rr = risk > 0 ? ((entry - tp2) / risk).toFixed(2) : null;
      }
    } else {
      verdict = "WAIT";
    }
  }

  return {
    verdict, side, entry, sl, tp1, tp2, rr, reasons,
    price, e50v, e200v, atrVal, volSpike,
    series: candles.map((c, i) => ({
      time: c.time, close: c.close, ema50: e50[i], ema200: e200[i],
    })),
  };
}

// ---------- data fetchers ----------
async function fetchBinance(symbolRaw, interval) {
  let symbol = symbolRaw.toUpperCase().replace(/[^A-Z]/g, "");
  const quotes = ["USDT", "USD", "BUSD", "BTC", "ETH"];
  const hasQuote = quotes.some(q => symbol.length > q.length && symbol.endsWith(q));
  if (!hasQuote) symbol = symbol + "USDT";
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=260`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance couldn't find "${symbolRaw}" — check the symbol (try BTC, ETH, SOL...).`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("No data returned for that symbol.");
  return raw.map(k => ({
    time: new Date(k[0]).toLocaleString(),
    open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
  }));
}

async function fetchTwelveData(symbolRaw, interval, apiKey) {
  if (!apiKey) throw new Error("NEED_KEY");
  let symbol = symbolRaw.toUpperCase().trim();
  if (!symbol.includes("/")) {
    if (symbol.length === 6) symbol = symbol.slice(0, 3) + "/" + symbol.slice(3);
  }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=260&apikey=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status === "error" || !json.values) {
    throw new Error(json.message || `Couldn't find "${symbolRaw}" — check the symbol and your API key.`);
  }
  return json.values.reverse().map(v => ({
    time: v.datetime,
    open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close),
  }));
}

// ---------- UI ----------
function VerdictBadge({ verdict }) {
  const map = {
    BUY: { color: BULL, icon: TrendingUp, text: "BUY" },
    SELL: { color: BEAR, icon: TrendingDown, text: "SELL" },
    WAIT: { color: WAIT, icon: AlertTriangle, text: "WAIT" },
    UNSTABLE: { color: WAIT, icon: AlertTriangle, text: "MARKET UNSTABLE" },
  };
  const m = map[verdict] || map.WAIT;
  const Icon = m.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg px-5 py-4" style={{ background: `${m.color}1A`, border: `1px solid ${m.color}55` }}>
      <Icon size={28} color={m.color} />
      <div>
        <div className="text-2xl font-semibold tracking-tight" style={{ color: m.color }}>{m.text}</div>
        <div className="text-sm" style={{ color: MUTED }}>
          {verdict === "BUY" && "Trend, pullback zone, and momentum confirmation all align long."}
          {verdict === "SELL" && "Trend, pullback zone, and momentum confirmation all align short."}
          {verdict === "WAIT" && "Directional bias exists, but entry conditions aren't complete yet."}
          {verdict === "UNSTABLE" && "No clean trend or volatility is spiking — sit this one out."}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg px-4 py-3" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <span className="text-xs" style={{ color: MUTED }}>{label}</span>
      <span className="text-base font-mono" style={{ color: color || TEXT }}>{value}</span>
    </div>
  );
}

export default function StrategyDashboard() {
  const [assetClass, setAssetClass] = useState("crypto");
  const [symbol, setSymbol] = useState("");
  const [interval, setInterval_] = useState("1h");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [lastSymbol, setLastSymbol] = useState("");

  const activeClass = ASSET_CLASSES.find(a => a.id === assetClass);
  const activeInterval = INTERVALS.find(i => i.id === interval);

  const runSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    const sym = symbol.trim();
    if (!sym) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let candles;
      if (assetClass === "crypto") {
        candles = await fetchBinance(sym, activeInterval.binance);
      } else {
        if (!apiKey) {
          setError("NEED_KEY");
          setLoading(false);
          return;
        }
        candles = await fetchTwelveData(sym, activeInterval.twelve, apiKey);
      }
      const analysis = analyze(candles);
      setResult(analysis);
      setLastSymbol(sym.toUpperCase());
    } catch (err) {
      setError(err.message === "NEED_KEY" ? "NEED_KEY" : (err.message || "Something went wrong fetching that symbol."));
    } finally {
      setLoading(false);
    }
  }, [symbol, assetClass, activeInterval, apiKey]);

  const chartDomain = useMemo(() => {
    if (!result) return ["auto", "auto"];
    const vals = result.series.map(s => s.close).filter(Boolean);
    if (result.sl) vals.push(result.sl);
    if (result.tp2) vals.push(result.tp2);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.08 || max * 0.01;
    return [min - pad, max + pad];
  }, [result]);

  return (
    <div style={{ background: INK, color: TEXT, minHeight: "100%", fontFamily: "ui-sans-serif, system-ui, sans-serif" }} className="w-full rounded-xl overflow-hidden">
      {/* header */}
      <div className="px-6 py-5 border-b" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">Confluence Desk</div>
            <div className="text-sm" style={{ color: MUTED }}>Trend-pullback strategy engine — forex, metals, stocks, crypto</div>
          </div>
        </div>
      </div>

      {/* search panel */}
      <div className="px-6 py-5 border-b" style={{ borderColor: LINE }}>
        <div className="flex gap-2 mb-4 flex-wrap">
          {ASSET_CLASSES.map(a => (
            <button
              key={a.id}
              onClick={() => { setAssetClass(a.id); setResult(null); setError(null); }}
              className="px-3 py-1.5 rounded-md text-sm transition-colors"
              style={{
                background: assetClass === a.id ? ACCENT : PANEL,
                color: assetClass === a.id ? "#0D1117" : TEXT,
                border: `1px solid ${assetClass === a.id ? ACCENT : LINE}`,
                fontWeight: assetClass === a.id ? 600 : 400,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        <form onSubmit={runSearch} className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: MUTED }} />
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder={activeClass.hint}
              className="w-full pl-9 pr-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: PANEL, border: `1px solid ${LINE}`, color: TEXT }}
            />
          </div>

          <div className="flex gap-1 rounded-md p-1" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
            {INTERVALS.map(iv => (
              <button
                type="button"
                key={iv.id}
                onClick={() => setInterval_(iv.id)}
                className="px-2.5 py-1.5 rounded text-xs"
                style={{
                  background: interval === iv.id ? LINE : "transparent",
                  color: interval === iv.id ? TEXT : MUTED,
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !symbol.trim()}
            className="px-4 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: ACCENT, color: "#0D1117" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Analyze"}
          </button>
        </form>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="text-xs" style={{ color: MUTED }}>Try:</span>
          {QUICK[assetClass].map(q => (
            <button
              key={q}
              onClick={() => setSymbol(q)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: PANEL, color: MUTED, border: `1px solid ${LINE}` }}
            >
              {q}
            </button>
          ))}
          <span className="text-xs ml-auto flex items-center gap-1" style={{ color: MUTED }}>
            <Info size={12} /> {activeClass.src}
          </span>
        </div>

        {assetClass !== "crypto" && (
          <div className="mt-3">
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              type="password"
              placeholder="Twelve Data API key (free at twelvedata.com)"
              className="w-full max-w-sm px-3 py-2 rounded-md text-xs outline-none"
              style={{ background: PANEL, border: `1px solid ${LINE}`, color: TEXT }}
            />
          </div>
        )}
      </div>

      {/* results */}
      <div className="px-6 py-6">
        {error === "NEED_KEY" && (
          <div className="rounded-lg px-4 py-4 text-sm" style={{ background: `${WAIT}1A`, border: `1px solid ${WAIT}55`, color: TEXT }}>
            This asset class needs a free Twelve Data API key (forex/metals/stocks aren't open, anonymous data like crypto is).
            Get one at twelvedata.com in under a minute, paste it above, then search again.
          </div>
        )}
        {error && error !== "NEED_KEY" && (
          <div className="rounded-lg px-4 py-4 text-sm" style={{ background: `${BEAR}1A`, border: `1px solid ${BEAR}55`, color: TEXT }}>
            {error}
          </div>
        )}

        {!result && !error && !loading && (
          <div className="text-center py-16" style={{ color: MUTED }}>
            Search a symbol above to run it through the strategy.
          </div>
        )}

        {loading && (
          <div className="text-center py-16 flex flex-col items-center gap-2" style={{ color: MUTED }}>
            <Loader2 size={20} className="animate-spin" />
            Pulling candles and running the trend/zone/momentum checks…
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xl font-mono">{lastSymbol} <span className="text-sm" style={{ color: MUTED }}>· {activeInterval.label}</span></div>
            </div>

            <VerdictBadge verdict={result.verdict} />

            {result.verdict === "BUY" || result.verdict === "SELL" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Entry" value={result.entry.toFixed(4)} />
                <Stat label="Stop loss" value={result.sl.toFixed(4)} color={BEAR} />
                <Stat label="Take profit 1 (1R)" value={result.tp1.toFixed(4)} color={BULL} />
                <Stat label="Take profit 2 (2R)" value={result.tp2.toFixed(4)} color={BULL} />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Price" value={result.price.toFixed(4)} />
                <Stat label="EMA 50" value={result.e50v.toFixed(4)} />
                <Stat label="EMA 200" value={result.e200v.toFixed(4)} />
              </div>
            )}

            <div className="rounded-lg overflow-hidden" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={result.series} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
                  <YAxis domain={chartDomain} tick={{ fontSize: 10, fill: MUTED }} width={70} />
                  <Tooltip contentStyle={{ background: INK, border: `1px solid ${LINE}`, fontSize: 12 }} labelStyle={{ color: MUTED }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />
                  <Line type="monotone" dataKey="close" name="Price" stroke={TEXT} dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="ema50" name="EMA 50" stroke={ACCENT} dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="ema200" name="EMA 200" stroke={WAIT} dot={false} strokeWidth={1.2} />
                  {result.sl && <ReferenceLine y={result.sl} stroke={BEAR} strokeDasharray="4 4" label={{ value: "SL", fill: BEAR, fontSize: 10, position: "left" }} />}
                  {result.tp1 && <ReferenceLine y={result.tp1} stroke={BULL} strokeDasharray="4 4" label={{ value: "TP1", fill: BULL, fontSize: 10, position: "left" }} />}
                  {result.tp2 && <ReferenceLine y={result.tp2} stroke={BULL} strokeDasharray="2 2" label={{ value: "TP2", fill: BULL, fontSize: 10, position: "left" }} />}
                  {result.entry && (result.verdict === "BUY" || result.verdict === "SELL") && (
                    <ReferenceLine y={result.entry} stroke={ACCENT} label={{ value: "Entry", fill: ACCENT, fontSize: 10, position: "left" }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg px-4 py-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <div className="text-sm font-medium mb-3" style={{ color: TEXT }}>Checklist reasoning</div>
              <ul className="flex flex-col gap-2">
                {result.reasons.map((r, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: MUTED }}>
                    <span style={{ color: ACCENT }}>·</span> {r}
                  </li>
                ))}
              </ul>
              {result.rr && (
                <div className="text-sm mt-3" style={{ color: TEXT }}>
                  Risk:reward to TP2 ≈ <span className="font-mono">1 : {result.rr}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t text-xs" style={{ borderColor: LINE, color: MUTED }}>
        Educational tool only, not financial advice. Verdicts are mechanical output of the trend-pullback strategy, not a guarantee — size every trade at 0.5–1% risk.
      </div>
    </div>
  );
}
