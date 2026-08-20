import { Link, useNavigate } from "@tanstack/react-router";
import { Wallet, User as UserIcon, LogOut, Menu } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated, useMockState } from "@/lib/hooks";
import { authApi, formatKES, walletApi } from "@/lib/mockApi";

export function Navbar() {
  const state = useMockState();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  
  const balance = state.balances?.[state.mode] ?? 0;
  const user = hydrated ? state.session?.user : null;
  const isGuest = !user;

  // Debug logging
  console.log('[Navbar] state:', {
    mode: state.mode,
    balances: state.balances,
    session: state.session,
    user: user,
    isGuest: isGuest,
    hydrated: hydrated,
  });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <Link to="/" className="shrink-0">
          <Logo className="h-6 sm:h-7" />
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col items-end rounded-xl bg-elevated px-3 py-1.5 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                KES
              </span>
              <span className="truncate font-display text-sm font-extrabold tabular-nums sm:text-base">
                {hydrated ? formatKES(balance) : "—"}
              </span>
            </div>
            {hydrated && isGuest && (
              <span className="rounded bg-warning/15 px-1.5 text-[9px] font-bold tracking-widest text-warning">
                GUEST
              </span>
            )}
            {hydrated && !isGuest && state.mode === "demo" && (
              <span className="rounded bg-warning/15 px-1.5 text-[9px] font-bold tracking-widest text-warning">
                DEMO
              </span>
            )}
          </div>

          <Button asChild size="sm" className="hidden font-bold sm:inline-flex">
            <Link to="/wallet">Deposit</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-elevated text-foreground transition-colors hover:bg-accent"
              >
                {user ? (
                  <span className="font-display text-sm font-extrabold uppercase">
                    {(user.username || "U").slice(0, 2)}
                  </span>
                ) : (
                  <Menu className="size-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">
                {user ? `@${user.username || 'User'}` : "Guest — not signed in"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/wallet">
                  <Wallet className="mr-2 size-4" /> Wallet
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserIcon className="mr-2 size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {user && (
                <DropdownMenuItem
                  onSelect={() => {
                    const nextMode = state.mode === "demo" ? "real" : "demo";
                    walletApi.setMode(nextMode);
                  }}
                >
                  Switch to {state.mode === "demo" ? "Real" : "Demo"} mode
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {user ? (
                <DropdownMenuItem
                  onSelect={async () => {
                    await authApi.logout();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Log out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link to="/login">Log in</Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}