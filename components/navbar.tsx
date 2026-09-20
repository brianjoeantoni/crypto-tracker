import { BarChart3 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export function Navbar() {
  return (
    <nav
      aria-label="Crypto Tracker"
      className="flex items-center justify-between border-b border-slate-800 pb-5"
    >
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-300">
          <BarChart3 className="size-4" /> Crypto Trend v1
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Crypto Tracker
        </h1>
        <p className="mt-2 text-base text-slate-400">
          BTC &amp; ETH trend-following monitor
        </p>
      </div>
      <ThemeToggle />
    </nav>
  );
}
