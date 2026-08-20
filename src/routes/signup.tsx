import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { authApi } from "@/lib/mockApi";
import { isValidKenyanLocal } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — dotPesa" },
      {
        name: "description",
        content:
          "Open a dotPesa account in seconds and start playing crash with M-Pesa deposits.",
      },
      { property: "og:title", content: "Create account — dotPesa" },
      {
        property: "og:description",
        content:
          "Open a dotPesa account in seconds and start playing crash with M-Pesa deposits.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Local Kenyan subscriber number only — the 254 country code is fixed in
  // the UI so people don't have to type it. Safaricom/other mobile numbers
  // are 9 digits after the leading 0, starting with 7 (07...) or 1 (01...).
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
    setForm((f) => ({ ...f, phone: digits }));
  };
  const phoneValid = isValidKenyanLocal(form.phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (form.username.length < 3) {
      return setError("Username must be at least 3 characters");
    }
    if (form.username.length > 30) {
      return setError("Username must be less than 30 characters");
    }
    if (!form.email || !form.email.includes("@")) {
      return setError("Enter a valid email address");
    }
    if (!phoneValid) {
      return setError("Enter a valid M-Pesa number (07... or 01...)");
    }
    if (form.password.length < 8) {
      return setError("Password must be at least 8 characters");
    }
    if (form.password !== form.confirm) {
      return setError("Passwords do not match");
    }
    if (!terms) {
      return setError("You must accept the terms to continue");
    }

    setLoading(true);
    const res = await authApi.signup({
      username: form.username,
      email: form.email,
      phone: `254${form.phone}`,
      password: form.password,
    });
    setLoading(false);

    if (!res.ok) {
      return setError(res.error);
    }

    toast.success(`Account created — KES 50,000 demo balance added`);
    navigate({ to: "/" });
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="You must be 18+ to play. Demo balance included."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-primary">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={form.username}
            onChange={set("username")}
            className="h-12 bg-elevated"
            placeholder="Choose a unique username"
            autoComplete="username"
          />
          <p className="text-[10px] text-muted-foreground">
            3-30 characters, letters and numbers only
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={set("email")}
            className="h-12 bg-elevated"
            placeholder="your@email.com"
            autoComplete="email"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">M-Pesa phone number</Label>
          <div className="flex h-12 items-stretch overflow-hidden rounded-md bg-elevated">
            <span className="flex items-center border-r border-border/50 px-3 text-sm font-semibold text-muted-foreground">
              +254
            </span>
            <Input
              id="phone"
              inputMode="numeric"
              value={form.phone}
              onChange={setPhone}
              className="h-full flex-1 rounded-none border-0 bg-transparent"
              placeholder="7XXXXXXXX or 1XXXXXXXX"
              autoComplete="tel-national"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Used for M-Pesa deposits and withdrawals — you can use a different number later
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={set("password")}
              className="h-12 bg-elevated"
              autoComplete="new-password"
              placeholder="Min 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={form.confirm}
              onChange={set("confirm")}
              className="h-12 bg-elevated"
              autoComplete="new-password"
              placeholder="Confirm your password"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 text-xs text-muted-foreground">
          <Checkbox
            checked={terms}
            onCheckedChange={(v) => setTerms(v === true)}
            className="mt-0.5"
          />
          <span>
            I am 18 or older and accept the Terms &amp; Conditions and Privacy Policy.
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full font-display font-extrabold glow-primary"
        >
          {loading ? "Creating…" : "Create account"}
        </Button>

        <p className="rounded-lg bg-elevated p-3 text-xs text-muted-foreground">
          By creating an account, you get:
          <br />
          <span className="text-[10px] text-muted-foreground/70">
            ✅ KES 50,000 demo balance to practice
            <br />
            ✅ Real money play with M-Pesa deposits
            <br />
            ✅ Provably fair crash game
          </span>
        </p>
      </form>
    </AuthShell>
  );
}