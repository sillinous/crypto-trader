# ⚡ CryptoTrader — Hybrid Trading Platform

A professional-grade crypto trading platform built with React + Vite. Runs entirely in the browser — no backend required.

![Dark terminal aesthetic](https://img.shields.io/badge/theme-dark%20terminal-0d0d0f?style=flat-square)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Features

### 📈 Live Chart
- Real-time candlestick chart via Binance WebSocket
- 44 trading pairs across 6 groups (Large Cap, Mid Cap, DeFi, Layer 2, Meme, Other)
- Indicator overlays: EMA 9/21, SMA 50, Bollinger Bands
- Live ticker for top 20 pairs with 24h change
- ⭐ Watchlist with persistent state
- Search / filter pairs by name

### 🤖 Strategy Factory
- Auto-generates profitable strategies by testing N candidates against real market data
- 4 strategy styles: Mean Reversion, Trend Following, Breakout, Scalping
- Quality filter: Sharpe ≥ 0.5, Win Rate ≥ 42%, Max DD ≤ 25%, Profit Factor ≥ 1.15
- Composite scoring (Sharpe + win rate + drawdown + profit factor)
- AI names and describes top strategies
- AI-from-prompt mode: describe a strategy in plain English → backtested instantly

### 🧬 Strategy Refiner
- Iterative refinement via natural language chat
- Each request → AI rewrites strategy → immediately backtested → metrics shown with deltas
- Version history with restore and score timeline
- Quick-request buttons: ↑ Win Rate, ↓ Drawdown, Add MACD, Tighter SL, etc.
- AI weakness analysis with prioritized improvement suggestions
- Session persistence per strategy (localStorage)

### 🔧 Strategy Builder
- Visual IF/THEN rule editor (no code required)
- 5 built-in presets + save/load custom strategies
- Supported indicators: RSI, MACD, EMA, SMA, Bollinger Bands %, Stochastic %K, Price
- Risk sliders with live R:R ratio and break-even win rate
- One-click export to PineScript v5

### 🌲 PineScript I/O
- Export any strategy to valid PineScript v5 (paste directly into TradingView)
- Import PineScript — AI parses rules and thresholds into strategy format

### ⏪ Backtester
- Real Binance historical data (up to 1000 bars)
- In-browser calculation — no server needed
- Equity curve chart with trade entry/exit dots
- Metrics: Total Return, Win Rate, Max Drawdown, Sharpe Ratio, Profit Factor, Trade Count
- Trade log with filter tabs (All / Wins / Losses / Stop Loss / Take Profit)
- AI explain and AI improve buttons

### 🔔 Signal Monitor
- Live multi-pair signal detection (up to 8 pairs simultaneously)
- Signals: RSI oversold/overbought, EMA crossover, MACD histogram flip
- Sound alerts (Web Audio API — no dependencies)
- Alert history with one-click copy

### 🔬 Optimizer
- Parameter sweep: stop loss % × take profit % grid
- Sharpe ratio heatmap (canvas-rendered)
- Sortable results table (by Sharpe, Return, Win Rate, Drawdown)
- Click any row to apply parameters
- Configurable combination count with fast/slow warning

### 🛡️ Risk Dashboard
- Performance gauges (Win Rate, Drawdown Risk, Sharpe)
- Kelly Criterion calculator (Full / Half / Quarter Kelly)
- Daily P&L journal with bar chart history
- Win/loss streak counter

### 💱 Exchange (crypto.com)
- crypto.com Exchange API v2 integration
- HMAC-SHA256 request signing via browser SubtleCrypto API
- Account balance, open orders, order history
- Place market and limit orders
- **Paper trading mode** — simulate orders without real API calls

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 8 |
| Styling | Inline styles (dark terminal theme, no CSS framework) |
| Charts | Canvas API (custom candlestick renderer) |
| Data | Binance REST + WebSocket public APIs |
| AI | Groq (llama-3.3-70b-versatile) → OpenRouter free-tier fallback |
| Exchange | crypto.com Exchange API v2 |
| State | React hooks + localStorage |
| Indicators | Pure JS (RSI, MACD, EMA, SMA, Bollinger Bands, ATR, Stochastic, VWAP) |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

The app runs at `http://localhost:5173` by default.

## Configuration

All API keys are stored in `localStorage` — nothing leaves the browser.

| Key | Where to configure | Used for |
|-----|--------------------|---------|
| Groq API key | Hardcoded in `src/ai.js` | Strategy naming, AI analysis, PineScript parsing |
| OpenRouter key | Hardcoded in `src/ai.js` | AI fallback |
| crypto.com API key + secret | Exchange → Settings panel | Live trading / balance |

To use your own AI keys, edit `src/ai.js`.

## Architecture

```
src/
├── App.jsx              # Root layout + navigation
├── ai.js                # Groq/OpenRouter callAI wrapper
├── binance.js           # REST + WebSocket helpers, 44 pairs
├── cryptodotcom.js      # crypto.com API + HMAC signing + paper trading
├── indicators.js        # RSI, MACD, EMA, SMA, BB, ATR, Stochastic, VWAP
├── backtest.js          # Backtesting engine + optimizer + parameter grid
├── strategy.js          # Strategy schema, PineScript I/O, AI explain/improve
├── strategyFactory.js   # Strategy generation, scoring, refinement engine
└── components/
    ├── Chart.jsx           # Canvas candlestick chart (responsive, ResizeObserver)
    ├── LiveChart.jsx        # Pair selector, watchlist, live WebSocket chart
    ├── StrategyBuilder.jsx  # Visual rule editor + presets
    ├── StrategyFactory.jsx  # Auto-generation + AI-from-prompt
    ├── StrategyRefiner.jsx  # Iterative refinement chat + version history
    ├── PineEditor.jsx       # PineScript import/export
    ├── Backtester.jsx       # Backtest runner + equity curve + trade log
    ├── SignalMonitor.jsx    # Live signal detection + alerts
    ├── Optimizer.jsx        # Parameter sweep + heatmap
    ├── RiskDashboard.jsx    # Gauges + Kelly + P&L journal
    └── Exchange.jsx         # crypto.com trading interface
```

## Disclaimer

This software is for educational and research purposes only. Do not trade with money you cannot afford to lose. Past backtest performance does not guarantee future results. Always test strategies in paper trading mode before using real funds.

## License

MIT
