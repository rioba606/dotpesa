import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { LimitsInfo } from "@/components/LimitsInfo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useHydrated, useMockState } from "@/lib/hooks";
import { authApi, formatKES, maskPhone, profileApi, walletApi } from "@/lib/mockApi";
import { cn, isValidKenyanLocal, localPart } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & safer play — dotPesa" },
      {
        name: "description",
        content:
          "Manage your dotPesa account, switch between demo and real mode, and set deposit limits, session reminders and self-exclusion.",
      },
      { property: "og:title", content: "Profile & safer play — dotPesa" },
      {
        property: "og:description",
        content: "Manage your account, switch demo/real mode and set responsible-gambling controls.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const state = useMockState();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const user = state.session?.user;
  const rg = state.responsible;
  const [limitInput, setLimitInput] = useState(rg.depositLimit ? String(rg.depositLimit) : "");

  // user.phone only arrives once the session finishes loading (it's
  // fetched async), so this syncs in when it shows up rather than trying
  // to read it at mount — but backs off once the person starts editing so
  // their in-progress input isn't clobbered by a background refresh.
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneDirty, setPhoneDirty] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  useEffect(() => {
    if (!phoneDirty) setPhoneInput(localPart(user?.phone));
  }, [user?.phone, phoneDirty]);
  const phoneValid = isValidKenyanLocal(phoneInput);

  async function savePhone() {
    if (!phoneValid) {
      toast.error("Enter a valid M-Pesa number (07... or 01...)");
      return;
    }
    setSavingPhone(true);
    const res = await authApi.updatePhone(`254${phoneInput}`);
    setSavingPhone(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPhoneDirty(false);
    toast.success("Phone number updated");
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold">Profile</h1>
          <LimitsInfo />
        </div>

        <section className="panel-surface p-5">
          {hydrated && user ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 font-display text-lg font-extrabold uppercase text-primary">
                {user.username.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-extrabold">@{user.username}</p>
                <p className="text-xs text-muted-foreground">
                  Role: <span className="font-semibold capitalize">{user.role}</span>
                  {user.canDebug && <span className="ml-2 text-primary">(debug)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user.phone ? `M-Pesa: ${maskPhone(user.phone)}` : "No M-Pesa number on file"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are browsing as a guest. Log in to place bets and manage your wallet.
            </p>
          )}
        </section>

        {hydrated && user && (
          <section className="panel-surface space-y-3 p-5">
            <div>
              <h2 className="font-display text-base font-extrabold">M-Pesa number</h2>
              <p className="text-sm text-muted-foreground">
                Used to prefill deposits and withdrawals — you can still send to a different number on either form.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pphone">Phone number</Label>
              <div className="flex gap-2">
                <div className="flex h-11 flex-1 items-stretch overflow-hidden rounded-md bg-elevated">
                  <span className="flex items-center border-r border-border/50 px-3 text-sm font-semibold text-muted-foreground">
                    +254
                  </span>
                  <Input
                    id="pphone"
                    inputMode="numeric"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneDirty(true);
                      setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 9));
                    }}
                    className="h-full flex-1 rounded-none border-0 bg-transparent"
                    placeholder="7XXXXXXXX or 1XXXXXXXX"
                    autoComplete="tel-national"
                  />
                </div>
                <Button variant="secondary" className="h-11" onClick={savePhone} disabled={savingPhone || !phoneValid}>
                  {savingPhone ? "Saving…" : "Save"}
                </Button>
              </div>
              {phoneInput !== "" && !phoneValid && (
                <p className="text-xs text-destructive">Enter a valid number (07... or 01...)</p>
              )}
            </div>
          </section>
        )}

        <section className="panel-surface p-5">
          <h2 className="font-display text-base font-extrabold">Play mode</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Demo balance is play money and never pays out.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["demo", "real"] as const).map((m) => (
              <button
                key={m}
                onClick={() => walletApi.setMode(m)}
                className={cn(
                  "rounded-xl bg-elevated p-4 text-left transition-colors",
                  state.mode === m ? "ring-2 ring-primary" : "hover:bg-accent",
                )}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{m}</p>
                <p className="font-display text-lg font-extrabold tabular-nums">
                  {hydrated ? `KES ${formatKES(state.balances[m])}` : "—"}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-surface space-y-4 p-5">
          <div>
            <h2 className="font-display text-base font-extrabold">Responsible gambling</h2>
            <p className="text-sm text-muted-foreground">Tools to keep your play under control.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dlimit">Daily deposit limit (KES)</Label>
            <div className="flex gap-2">
              <Input
                id="dlimit"
                inputMode="decimal"
                placeholder="No limit set"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value.replace(/[^\d]/g, ""))}
                className="h-11 bg-elevated"
              />
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => {
                  profileApi.updateResponsible({ depositLimit: limitInput ? Number(limitInput) : null });
                  toast.success(limitInput ? `Deposit limit set to KES ${limitInput}` : "Deposit limit removed");
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <ToggleRow
            label="Self-exclusion"
            hint="Blocks all betting and deposits for 30 days."
            checked={rg.selfExcluded}
            onChange={(v) => {
              profileApi.updateResponsible({ selfExcluded: v });
              toast(v ? "Self-exclusion enabled" : "Self-exclusion disabled");
            }}
          />
          <ToggleRow
            label="Session reminders"
            hint="Get a reminder every 60 minutes of play."
            checked={rg.sessionReminder}
            onChange={(v) => profileApi.updateResponsible({ sessionReminder: v })}
          />
        </section>

        <Button
          variant="secondary"
          className="h-12 w-full font-display font-bold"
          onClick={async () => {
            await authApi.logout();
            navigate({ to: "/login" });
          }}
        >
          Log out
        </Button>
      </main>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl bg-elevated/60 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}