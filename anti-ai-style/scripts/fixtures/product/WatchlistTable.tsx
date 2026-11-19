// Fixture: a dense market-data table built from product decisions.
import { formatPrice } from "./format";

const rows = [
  { symbol: "2330", name: "台積電", price: 1085, change: 15, volume: 28431 },
  { symbol: "2603", name: "長榮", price: 187.5, change: -2.5, volume: 51207 },
  { symbol: "00878", name: "國泰永續高股息", price: 22.91, change: 0, volume: 96512 },
  { symbol: "6669", name: "緯穎", price: 2415, change: -85, volume: 1904 },
];

export function WatchlistTable() {
  return (
    <table className="w-full border-collapse text-sm tabular-nums">
      <thead>
        <tr className="border-b border-divider text-secondary">
          <th className="py-2 text-left font-normal">商品</th>
          <th className="py-2 text-right font-normal">成交</th>
          <th className="py-2 text-right font-normal">漲跌</th>
          <th className="py-2 text-right font-normal">總量</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.symbol} className="h-11 border-b border-divider transition-colors hover:bg-surface-raised">
            <td className="text-left">
              {row.name} <span className="text-secondary">{row.symbol}</span>
            </td>
            <td className="text-right">{formatPrice(row.price)}</td>
            <td className={row.change > 0 ? "text-right text-market-up" : "text-right text-market-down"}>
              {row.change}
            </td>
            <td className="text-right">{row.volume.toLocaleString("zh-TW")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
