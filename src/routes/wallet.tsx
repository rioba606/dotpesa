import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { LimitsInfo } from "@/components/LimitsInfo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrated, useMockState } from "@/lib/hooks";
import { formatKES, LIMITS, walletApi, type Transaction } from "@/lib/mockApi";
import { cn, isValidKenyanLocal, localPart } from "@/lib/utils";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — dotPesa M-Pesa deposits & withdrawals" },
      {
        name: "description",
        content:
          "Top up via M-Pesa STK push, withdraw to your phone, and review your dotPesa transaction history.",
      },
      { property: "og:title", content: "Wallet — dotPesa M-Pesa deposits & withdrawals" },
      {
        property: "og:description",
        content: "Top up via M-Pesa STK push, withdraw to your phone, and review your transaction history.",
      },
    ],
  }),
  component: WalletPage,
});

type DepositStage = "idle" | "pushed" | "polling" | "success" | "failed";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// M-Pesa numbers everywhere in the wallet UI are entered as just the local
// 9 digits (07... or 01... with the leading 0 dropped) — the +254 country
// code is fixed so people don't have to type it, and don't accidentally get
// rejected for typing "0712..." or "+254712..." instead of "254712...".
function PhoneField({
  id,
  label,
  value,
  onChange,
  disabled,
  helperText,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-12 items-stretch overflow-hidden rounded-md bg-elevated">
        <span className="flex items-center border-r border-border/50 px-3 text-sm font-semibold text-muted-foreground">
          +254
        </span>
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
          disabled={disabled}
          className="h-full flex-1 rounded-none border-0 bg-transparent"
          placeholder="7XXXXXXXX or 1XXXXXXXX"
          autoComplete="tel-national"
        />
      </div>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

function WalletPage() {
  const state = useMockState();
  const hydrated = useHydrated();
  const isGuest = !state.session;
  // Prefill deposit/withdraw with the number captured at signup, but this
  // is only a default — a customer may want to top up or withdraw from a
  // different number, so both forms below leave it as an editable field.
  const defaultPhone = localPart(state.session?.user.phone);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold">Wallet</h1>
          <LimitsInfo label="View limits" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => walletApi.setMode("demo")}
            className={cn(
              "panel-surface p-5 text-left transition-colors",
              state.mode === "demo" ? "ring-2 ring-primary" : "hover:bg-elevated/40",
            )}
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {isGuest ? "Demo (Guest)" : "Demo balance"}
            </p>
            <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">
              {hydrated ? `KES ${formatKES(state.balances.demo)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {state.mode === "demo" ? "Active for betting" : "Tap to switch"}
            </p>
          </button>

          <button
            onClick={() => walletApi.setMode("real")}
            disabled={isGuest}
            className={cn(
              "panel-surface p-5 text-left transition-colors",
              isGuest && "opacity-50 cursor-not-allowed",
              state.mode === "real" ? "ring-2 ring-primary" : "hover:bg-elevated/40",
            )}
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Real balance
            </p>
            <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">
              {hydrated ? `KES ${formatKES(state.balances.real)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isGuest ? "Sign in to access real balance" : state.mode === "real" ? "Active for betting" : "Tap to switch"}
            </p>
          </button>
        </div>

        <Tabs defaultValue="deposit">
          <TabsList className="w-full bg-elevated">
            <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Transactions</TabsTrigger>
          </TabsList>
          <TabsContent value="deposit" className="mt-3">
            <DepositForm defaultPhone={defaultPhone} />
          </TabsContent>
          <TabsContent value="withdraw" className="mt-3">
            <WithdrawForm balance={state.balances.real} isGuest={isGuest} defaultPhone={defaultPhone} />
          </TabsContent>
          <TabsContent value="history" className="mt-3">
            <TransactionList />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const DEPOSIT_POLL_INTERVAL_MS = 3000;
const DEPOSIT_POLL_MAX_ATTEMPTS = 30;

function DepositForm({ defaultPhone }: { defaultPhone: string }) {
  const [phone, setPhone] = useState(defaultPhone);
  const [amount, setAmount] = useState("500");
  const [stage, setStage] = useState<DepositStage>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const amt = Number(amount);
  const invalid = !Number.isFinite(amt) || amt < LIMITS.minDeposit || amt > LIMITS.maxSinglePayout;
  const phoneInvalid = !isValidKenyanLocal(phone);

  async function start() {
    setError(null);
    if (phoneInvalid) {
      setError("Enter a valid M-Pesa number (07... or 01...)");
      return;
    }
    // Flip to a disabled/processing state immediately, before the network
    // call resolves, so a slow request can't be double-clicked into two
    // STK pushes.
    setSubmitting(true);
    const res = await walletApi.depositInitiate(`254${phone}`, amt);
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error);
      return;
    }
    setTxId(res.transactionId);
    setStage("pushed");
    setTimeout(() => setStage("polling"), 900);

    let cancelled = false;
    for (let attempt = 1; attempt <= DEPOSIT_POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(DEPOSIT_POLL_INTERVAL_MS);
      if (cancelled) return;
      const s = await walletApi.depositStatus(res.transactionId);
      if (s.status !== "pending") {
        setStage(s.status === "success" ? "success" : "failed");
        setSubmitting(false);
        s.status === "success"
          ? toast.success(`Deposit of KES ${formatKES(amt)} confirmed`)
          : toast.error("Deposit failed or was cancelled");
        return;
      }
    }
    setStage("failed");
    setSubmitting(false);
    toast.error("Deposit timed out. Check your M-Pesa messages, or try again.");
  }

  const busy = submitting || stage === "pushed" || stage === "polling";

  return (
    <div className="panel-surface space-y-4 p-5">
      <PhoneField
        id="dphone"
        label="M-Pesa phone number"
        value={phone}
        onChange={setPhone}
        disabled={busy}
        helperText={phone !== "" && phoneInvalid ? "Enter a valid number (07... or 01...)" : undefined}
      />
      <div className="space-y-1.5">
        <Label htmlFor="damount">Amount (KES)</Label>
        <Input id="damount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} disabled={busy} className="h-12 bg-elevated font-display text-lg font-bold tabular-nums" />
        <p className="text-xs text-muted-foreground">
          Min {LIMITS.minDeposit.toLocaleString()} · Max {LIMITS.maxSinglePayout.toLocaleString()} KES
        </p>
        {invalid && amount !== "" && <p className="text-xs text-destructive">Amount outside deposit limits</p>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[100, 500, 1000, 5000].map((q) => (
          <button key={q} onClick={() => setAmount(String(q))} disabled={busy} className="rounded-lg bg-elevated py-2 text-sm font-bold tabular-nums hover:bg-accent disabled:opacity-40">
            {q}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {submitting && stage === "idle" && (
        <div className="rounded-xl bg-elevated p-4 text-sm">
          <p className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            Sending STK push…
          </p>
        </div>
      )}

      {stage !== "idle" && (
        <div className="rounded-xl bg-elevated p-4 text-sm">
          {stage === "pushed" && (
            <div className="space-y-1">
              <p>STK push sent — check your phone and enter your M-Pesa PIN.</p>
              <p className="text-xs text-muted-foreground">
                The prompt will appear from <span className="font-semibold">GROVER COMMERCE</span> — that's us, so
                don't be alarmed by the name.
              </p>
            </div>
          )}
          {stage === "polling" && (
            <div className="space-y-1">
              <p className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                Waiting for M-Pesa confirmation…
              </p>
              <p className="text-xs text-muted-foreground">
                Please stay on this page until the transaction finishes processing.
              </p>
            </div>
          )}
          {stage === "success" && <p className="font-semibold text-primary">Deposit confirmed and credited.</p>}
          {stage === "failed" && <p className="font-semibold text-destructive">Deposit failed. No funds were taken.</p>}
        </div>
      )}

      <Button onClick={start} disabled={busy || invalid || phoneInvalid} className="h-12 w-full font-display font-extrabold glow-primary">
        {busy ? "Processing…" : "Send STK push"}
      </Button>
    </div>
  );
}

function WithdrawForm({
  balance,
  isGuest,
  defaultPhone,
}: {
  balance: number;
  isGuest: boolean;
  defaultPhone: string;
}) {
  const [amount, setAmount] = useState("500");
  const [phone, setPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const amt = Number(amount);
  const gateFailed = balance < LIMITS.minDeposit || isGuest;
  const phoneInvalid = !isValidKenyanLocal(phone);

  async function submit() {
    setError(null);
    if (phoneInvalid) {
      setError("Enter a valid M-Pesa number to withdraw to (07... or 01...)");
      return;
    }
    setLoading(true);
    const res = await walletApi.withdraw(amt, `254${phone}`);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    toast.success(`Withdrawal of KES ${formatKES(amt)} sent to M-Pesa`);
  }

  return (
    <div className="panel-surface space-y-4 p-5">
      {isGuest && (
        <p className="rounded-lg bg-warning/15 p-3 text-sm text-warning">
          Sign in to withdraw real money. This is a demo account.
        </p>
      )}
      {!isGuest && gateFailed && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Minimum balance of KES {LIMITS.minDeposit} required to withdraw.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="wamount">Amount (KES)</Label>
        <Input id="wamount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} className="h-12 bg-elevated font-display text-lg font-bold tabular-nums" />
        <p className="text-xs text-muted-foreground">
          Min {LIMITS.minDeposit.toLocaleString()} · Max {LIMITS.maxWithdraw.toLocaleString()} KES
        </p>
      </div>
      <PhoneField
        id="wphone"
        label="Withdraw to M-Pesa number"
        value={phone}
        onChange={setPhone}
        helperText={phone !== "" && phoneInvalid ? "Enter a valid number (07... or 01...)" : "Defaults to your signup number, but you can send to a different one"}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={loading || gateFailed || phoneInvalid} className="h-12 w-full font-display font-extrabold glow-primary">
        {loading ? "Sending…" : "Withdraw to M-Pesa"}
      </Button>
    </div>
  );
}

// Transaction types from the actual backend - only deposit and withdrawal
const TYPES: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
];

function TransactionList() {
  const [type, setType] = useState<string>("all");
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    walletApi
      .transactions()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          let filtered = res.data;
          if (type !== "all") {
            filtered = res.data.filter((t: Transaction) => t.Type === type);
          }
          setItems(filtered);
        } else {
          setLoadError(res.error || "Failed to load transactions");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load transactions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  return (
    <div className="panel-surface space-y-3 p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="truncate text-sm text-muted-foreground">{items.length} transactions</p>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v);
          }}
        >
          <SelectTrigger className="w-36 shrink-0 bg-elevated">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {!loading && loadError && (
        <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
      )}
      {!loading && !loadError && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
      )}

      <div className="space-y-1.5">
        {items.map((t) => {
          // Only 'deposit' is a credit - 'withdrawal' is a debit
          const isCredit = t.Type === "deposit";
          return (
            <div key={t.ID} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-elevated/60 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold capitalize">
                  {t.Type}
                  {t.MpesaReceipt ? <span className="text-muted-foreground"> · {t.MpesaReceipt}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(t.CreatedAt).toLocaleString("en-KE")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("font-display font-bold tabular-nums", isCredit ? "text-primary" : "text-foreground")}>
                  {isCredit ? "+" : "−"}
                  {formatKES(t.Amount)}
                </p>
                <p
                  className={cn(
                    "text-[10px] uppercase tracking-widest",
                    t.Status === "completed"
                      ? "text-muted-foreground"
                      : t.Status === "pending"
                        ? "text-warning"
                        : "text-destructive",
                  )}
                >
                  {t.Status}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}