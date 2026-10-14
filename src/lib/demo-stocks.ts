/** Display-only examples for the participant A interface. No prices or API data. */
export type DemoStock = {
  symbol: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
};

export const demoStocks: readonly DemoStock[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ" },
  { symbol: "KO", name: "The Coca-Cola Company", exchange: "NYSE" },
];

export function findDemoStock(symbol: string): DemoStock | undefined {
  return demoStocks.find((stock) => stock.symbol === symbol.toUpperCase());
}
