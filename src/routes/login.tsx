import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/mockApi";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — dotPesa" },
      {
        name: "description",
        content:
          "Sign in to your dotPesa account to play crash and manage your M-Pesa wallet.",
      },
      { property: "og:title", content: "Log in — dotPesa" },
      {
        property: "og:description",
        content:
          "Sign in to your dotPesa account to play crash and manage your M-Pesa wallet.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    const res = await authApi.login(email, password);
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    toast.success(`Welcome back, ${res.session.user.displayName || res.session.user.username}`);
    navigate({ to: "/" });
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in with your email address."
      footer={
        <>
          New to dotPesa?{" "}
          <Link to="/signup" className="font-semibold text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 bg-elevated"
            autoComplete="email"
            placeholder="your@email.com"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {/* Password reset disabled - OTP not available */}
            <span className="text-xs text-muted-foreground opacity-50 cursor-not-allowed">
              Forgot password?
            </span>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 bg-elevated"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full font-display font-extrabold glow-primary"
        >
          {loading ? "Signing in…" : "Log in"}
        </Button>
        <p className="rounded-lg bg-elevated p-3 text-xs text-muted-foreground">
          Demo accounts: <span className="font-semibold text-foreground">user1 … user200</span>, shared
          password <span className="font-semibold text-foreground">demo1234</span>.
          <br />
          <span className="text-[10px] text-muted-foreground/70">
            Or sign up with your own email and username.
          </span>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link to="/">
            <Logo className="h-8" />
          </Link>
        </div>
        <div className="panel-surface p-6 sm:p-8">
          <h1 className="font-display text-2xl font-extrabold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}