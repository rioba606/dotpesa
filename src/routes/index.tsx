import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { MultiplierStrip } from "@/components/MultiplierStrip";
import { CrashCanvas } from "@/components/CrashCanvas";
import { BetPanel } from "@/components/BetPanel";
import { LiveBetsTable } from "@/components/LiveBetsTable";
import { LimitsInfo } from "@/components/LimitsInfo";
import { useGame, useMockState } from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "dotPesa — Crash Betting with M-Pesa" },
      {
        name: "description",
        content:
          "Play dotPesa crash: watch the multiplier climb, cash out before it crashes. Instant M-Pesa deposits and withdrawals in Kenya.",
      },
      { property: "og:title", content: "dotPesa — Crash Betting with M-Pesa" },
      {
        property: "og:description",
        content:
          "Watch the multiplier climb and cash out before the crash. Dual bets, auto-cashout and instant M-Pesa payouts.",
      },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  const game = useGame();
  const state = useMockState();
  const username = state.session?.user.username ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background lg:h-screen lg:overflow-hidden">
      <Navbar />
      <main className="mx-auto flex w-full flex-1 max-w-[1600px] flex-col gap-3 p-3 sm:p-5 lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:p-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-lg font-extrabold sm:text-xl">
            Crash <span className="text-primary">·</span> Round #{game.roundId}
          </h1>
          <LimitsInfo />
        </div>

        {/* Desktop: smaller canvas, more compact layout */}
        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:gap-2 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="order-2 lg:order-1 lg:min-h-0">
            <LiveBetsTable liveBets={game.liveBets} history={game.history} />
          </div>

          <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-2 lg:min-h-0 lg:gap-2">
            <MultiplierStrip history={game.history} />
            <CrashCanvas
              phase={game.phase}
              multiplier={game.multiplier}
              countdown={game.countdown}
              roundId={game.roundId}
            />
            <div className="grid gap-3 md:grid-cols-2 lg:gap-2">
              <BetPanel
                index={1}
                phase={game.phase}
                multiplier={game.multiplier}
                roundId={game.roundId}
                mode={state.mode}
                username={username}
              />
              <BetPanel
                index={2}
                phase={game.phase}
                multiplier={game.multiplier}
                roundId={game.roundId}
                mode={state.mode}
                username={username}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}