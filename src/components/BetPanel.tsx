import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { gameApi, LIMITS, formatKES, applyBalanceDelta, type Mode, type Phase } from "@/lib/mockApi";
import { useMockState } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Props {
  index: 1 | 2;
  phase: Phase;
  multiplier: number;
  roundId: number;
  mode: Mode;
  username: string | null;
}

type BetStatus = "idle" | "queued" | "active" | "settled";

const QUICK = [100, 500, 1000];

export function BetPanel({ index, phase, multiplier, roundId, mode, username }: Props) {
  const isGuest = !username;
  const effectiveMode: Mode = isGuest ? "demo" : mode;
  const mockState = useMockState();

  const [stake, setStake] = useState("100");
  const [autoOn, setAutoOn] = useState(false);
  const [auto, setAuto] = useState("2.00");
  const [status, setStatus] = useState<BetStatus>("idle");
  const [placedStake, setPlacedStake] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const betBox = useRef<1 | 2 | null>(null);
  const betRound = useRef<number>(-1);

  const stakeNum = Number(stake);
  const stakeError =
    stake !== "" && (!Number.isFinite(stakeNum) || stakeNum < LIMITS.minStake || stakeNum > LIMITS.maxSinglePayout)
      ? `Stake must be between ${LIMITS.minStake} and ${LIMITS.maxSinglePayout.toLocaleString()} KES`
      : null;
  const autoNum = Number(auto);
  const autoError = autoOn && (!Number.isFinite(autoNum) || autoNum < 1.01) ? "Min 1.01x" : null;

  // Queued bet becomes active when the round starts.
  useEffect(() => {
    if (phase === "running" && status === "queued") {
      setStatus("active");
      betRound.current = roundId;
    }
    if (phase === "crashed" && status === "active") {
      setStatus("idle");
      toast.error(`Bet ${index} lost — crashed at ${multiplier.toFixed(2)}x`);
    }
    if (phase === "waiting" && status === "settled") setStatus("idle");
  }, [phase, multiplier, index, status, roundId]);

  // Auto-cashout
  useEffect(() => {
    if (status === "active" && autoOn && !autoError && multiplier >= autoNum) {
      doCashout(Math.min(multiplier, autoNum));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier]);

  async function doCashout(at: number) {
    if (isSubmitting || betBox.current === null) return;

    // Guest path: settle entirely client-side against the real multiplier
    if (isGuest) {
      setIsSubmitting(true);
      try {
        const payout = Math.min(LIMITS.maxSinglePayout, Math.round(placedStake * at * 100) / 100);
        applyBalanceDelta("demo", payout);
        setStatus("settled");
        toast.success(`Cashed out @ ${at.toFixed(2)}x — KES ${formatKES(payout)} (demo)`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      // Cashout uses box, not betId
      const result = await gameApi.cashout(betBox.current, effectiveMode);

      if (result.ok) {
        setStatus("settled");
        toast.success(`Cashed out @ ${result.multiplier.toFixed(2)}x — KES ${formatKES(result.payout)}`);
      } else {
        toast.error(result.error || 'Cashout failed');
      }
    } catch (error) {
      toast.error('Cashout failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function placeBet() {
    if (stakeError || !stakeNum) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Guest path: use local demo balance
      if (isGuest) {
        if (stakeNum > mockState.balances.demo) {
          toast.error("Insufficient demo balance");
          return;
        }
        applyBalanceDelta("demo", -stakeNum);
        betBox.current = index;
        setPlacedStake(stakeNum);
        setStatus("queued");
        toast.success(`Bet ${index} placed — KES ${formatKES(stakeNum)} (demo)`);
        return;
      }

      const result = await gameApi.placeBet(index, stakeNum, effectiveMode);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      betBox.current = index;
      setPlacedStake(stakeNum);
      setStatus("queued");
      toast.success(`Bet ${index} placed — KES ${formatKES(stakeNum)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cancel bet is not supported by the backend - this just clears local state for guests
  async function cancelBet() {
    if (isGuest) {
      applyBalanceDelta("demo", placedStake);
      setStatus("idle");
      betBox.current = null;
      toast("Bet cancelled");
      return;
    }

    // No cancel endpoint exists - just reset local state
    setStatus("idle");
    betBox.current = null;
    toast("Bet reset");
  }

  const canBet = (phase !== "running" || status === "idle") && !isSubmitting;

  let action: { label: string; onClick?: () => void; variant: "primary" | "cashout" | "cancel"; disabled?: boolean };
  if (status === "active") {
    action = {
      label: isSubmitting ? "Cashing out…" : `Cashout ${(placedStake * multiplier).toFixed(0)} @ ${multiplier.toFixed(2)}x`,
      onClick: () => doCashout(multiplier),
      variant: "cashout",
      disabled: isSubmitting,
    };
  } else if (status === "queued") {
    action = { label: "Bet placed — waiting…", onClick: cancelBet, variant: "cancel", disabled: isSubmitting };
  } else if (status === "settled") {
    action = { label: "Cashed out ✓", variant: "cancel", disabled: true };
  } else if (phase === "running") {
    action = { label: "Waiting for next round", variant: "cancel", disabled: true };
  } else {
    action = {
      label: isSubmitting ? "Placing bet…" : `Place Bet ${stakeNum ? formatKES(stakeNum) : ""}`.trim(),
      onClick: placeBet,
      variant: "primary",
      disabled: !!stakeError || !stakeNum || isSubmitting,
    };
  }

  return (
    <div className="panel-surface flex flex-col gap-2 p-3 lg:gap-1.5 lg:p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Bet {index}
        </span>
        <div className="flex items-center gap-1.5">
          {isGuest && (
            <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-warning">
              Guest
            </span>
          )}
          {!isGuest && effectiveMode === "demo" && (
            <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-warning">
              Demo
            </span>
          )}
          {!isGuest && effectiveMode === "real" && (
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              Real
            </span>
          )}
          {status !== "idle" && (
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              {status === "queued" ? "Queued" : status === "active" ? "In round" : "Settled"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={!canBet}
            onClick={() => setStake(String(q))}
            className="rounded-lg bg-elevated py-1.5 font-display text-sm font-bold tabular-nums transition-colors hover:bg-accent disabled:opacity-40 lg:py-1"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="space-y-0.5">
        <Label htmlFor={`stake-${index}`} className="text-xs text-muted-foreground">
          Stake (KES)
        </Label>
        <Input
          id={`stake-${index}`}
          inputMode="decimal"
          value={stake}
          disabled={!canBet}
          onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ""))}
          className="h-9 bg-elevated font-display text-sm font-bold tabular-nums lg:h-8"
        />
        {stakeError && <p className="text-xs text-destructive">{stakeError}</p>}
      </div>

      <div className="space-y-0.5 rounded-xl bg-elevated/60 p-2 lg:p-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`auto-${index}`} className="text-xs text-muted-foreground">
            Auto cashout
          </Label>
          <Switch
            id={`auto-${index}`}
            checked={autoOn}
            onCheckedChange={setAutoOn}
            disabled={!canBet}
            className="scale-75"
          />
        </div>
        {autoOn ? (
          <>
            <Input
              inputMode="decimal"
              value={auto}
              disabled={!canBet}
              onChange={(e) => setAuto(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-8 bg-card font-display text-sm font-bold tabular-nums"
            />
            {autoError && <p className="text-xs text-destructive">{autoError}</p>}
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Off — cash out manually during the round.
          </p>
        )}
      </div>

      <Button
        onClick={action.onClick}
        disabled={action.disabled}
        className={cn(
          "h-11 w-full rounded-xl font-display text-sm font-extrabold tabular-nums lg:h-10",
          action.variant === "cashout" && "bg-warning text-warning-foreground hover:bg-warning/90",
          action.variant === "cancel" && "bg-elevated text-foreground hover:bg-accent",
          action.variant === "primary" && "glow-primary",
        )}
      >
        {action.label}
      </Button>
    </div>
  );
}