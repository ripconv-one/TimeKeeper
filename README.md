# TimeKeeper

![Next.js](https://img.shields.io/badge/Next.js-16.3%2B-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?logo=typescript&logoColor=white)
![Alpaca](https://img.shields.io/badge/Market%20Data-Alpaca-FEDC00)
![WebSocket](https://img.shields.io/badge/WebSocket-Live%20Streaming-010101)

TimeKeeper is a real-time financial market dashboard built with Next.js, TypeScript, WebSockets, Alpaca Market Data, and Lightweight Charts.

It streams stock and cryptocurrency market data through a local WebSocket server and displays trades, quotes, market statistics, and candlestick charts.

## Installation

Clone the repository:

```bash
git clone https://github.com/ripconv-one/TimeKeeper.git
cd TimeKeeper
```

Install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env.local` file in the project root:

```env
ALPACA_API_KEY=your_api_key
ALPACA_SECRET_KEY=your_secret_key
```

Do not commit `.env.local` or expose API credentials in client-side code.

## Running the Application

Start the Next.js development server:

```bash
npm run dev
```

In a second terminal, start the market data server:

```bash
npx tsx server/market-server.ts
```

Open:

```text
http://localhost:3000
```

## Architecture

```text
Alpaca Market Data
        |
        | WebSocket
        v
market-server.ts
        |
        | ws://localhost:8080
        v
Next.js Dashboard
        |
        v
Lightweight Charts
```

Alpaca credentials remain server-side. The market server connects to Alpaca, processes incoming market events, and forwards normalized data to the browser over a local WebSocket connection.

## Author

**Parthin**

GitHub: [@ripconv-one](https://github.com/ripconv-one)

## Project Status

![Status](https://img.shields.io/badge/Status-In%20Progress-yellow?style=for-the-badge)

TimeKeeper is currently under active development.