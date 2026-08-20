import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatKES, multiplierTier, type LiveBet } from "@/lib/mockApi";
import { cn } from "@/lib/utils";

const tierText = {
  low: "text-destructive",
  mid: "text-warning",
  high: "text-primary",
} as const;

export function LiveBetsTable({
  liveBets,
  history,
}: {
  liveBets: LiveBet[];
  history: number[]; // crash points, most recent first
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = history.filter(
    (crashPoint) => query === "" || String(crashPoint).includes(query),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="panel-surface flex h-full min-h-0 flex-col p-3 lg:p-2.5">
      <Tabs defaultValue="live" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full bg-elevated">
          <TabsTrigger value="live" className="flex-1">
            Live
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-2 min-h-0 flex-1 lg:flex lg:flex-col">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>Player</span>
            <span className="text-right">Box</span>
            <span className="w-20 text-right">Amount</span>
          </div>
          <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
            {liveBets.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No live bets</p>
            ) : (
              liveBets.map((b) => (
                <div
                  key={b.key}
                  className={cn(
                    "grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                    b.cashedOutAt !== null ? "bg-primary/10" : "bg-elevated/60",
                    b.self && "ring-1 ring-primary/50",
                  )}
                >
                  <span className="truncate text-muted-foreground">
                    {b.self ? "You" : b.userId.slice(0, 8)}
                  </span>
                  <span className="text-right tabular-nums">Box {b.box}</span>
                  <span className="w-20 text-right tabular-nums">
                    {b.cashedOutAt !== null ? (
                      <span className="font-bold text-primary">
                        {formatKES(b.payout ?? 0)}
                        <span className="ml-1 text-[10px]">{b.cashedOutAt.toFixed(2)}x</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{formatKES(b.amount)}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-2 min-h-0 flex-1">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search multiplier"
            className="mb-2 h-8 bg-elevated text-sm"
          />
          <div className="space-y-0.5">
            {current.map((crashPoint, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-elevated/60 px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">#{history.length - idx}</span>
                <span
                  className={cn(
                    "font-display font-bold tabular-nums",
                    tierText[multiplierTier(crashPoint)],
                  )}
                >
                  {crashPoint.toFixed(2)}x
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 px-3 text-xs"
            >
              Prev
            </Button>
            <span>
              Page {page} / {pages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-3 text-xs"
            >
              Next
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}