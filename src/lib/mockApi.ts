// src/lib/mockApi.ts

import { authApi as realAuthApi, type AuthUser } from './api/auth';
import { walletApi as realWalletApi, type Transaction, WALLET_LIMITS } from './api/wallet';
import { influencerApi as realInfluencerApi } from './api/influencer';
import { gameApi as realGameApi, type Box } from './api/game';
import { api } from './api/client';

export type { Transaction, Box };
export type Mode = 'demo' | 'real';
export type Phase = 'waiting' | 'running' | 'crashed';

export interface Session {
  token: string;
  user: AuthUser;
}

export interface LiveBet {
  key: string;
  userId: string;
  box: Box;
  amount: number;
  cashedOutAt: number | null;
  payout: number | null;
  self: boolean;
}

export interface GameSnapshot {
  phase: Phase;
  roundId: number;
  multiplier: number;
  countdown: number;
  history: number[];
  liveBets: LiveBet[];
}

interface AppState {
  session: Session | null;
  mode: Mode;
  balances: { demo: number; real: number };
  transactions: Transaction[];
  responsible: { depositLimit: number | null; selfExcluded: boolean; sessionReminder: boolean };
}

const state: AppState = {
  session: null,
  mode: 'demo',
  balances: { demo: 50000, real: 0 },
  transactions: [],
  responsible: { depositLimit: null, selfExcluded: false, sessionReminder: true },
};

// ── Auth ──
export const authApi = {
  async login(email: string, password: string) {
    const result = await realAuthApi.login({ email, password });
    if (result.success && result.data) {
      state.session = { token: result.data.token, user: result.data.user };
      state.mode = 'demo';
      // Load balances immediately after login
      await refreshBalances();
      startBalancePolling();
      notifyListeners();
      return { ok: true as const, session: state.session };
    }
    return { ok: false as const, error: result.error || 'Login failed' };
  },

  async signup(data: { username: string; email: string; phone: string; password: string }) {
    const result = await realAuthApi.signup(data);
    if (result.success && result.data) {
      state.session = { token: result.data.token, user: result.data.user };
      state.mode = 'demo';
      await refreshBalances();
      startBalancePolling();
      notifyListeners();
      return { ok: true as const, session: state.session };
    }
    return { ok: false as const, error: result.error || 'Signup failed' };
  },

  async adminLogin(email: string, password: string) {
    const result = await realAuthApi.adminLogin({ email, password });
    if (result.success && result.data) {
      state.session = { token: result.data.token, user: result.data.user };
      state.mode = 'real';
      await refreshBalances();
      startBalancePolling();
      notifyListeners();
      return { ok: true as const, session: state.session };
    }
    return { ok: false as const, error: result.error || 'Login failed' };
  },

  logout() {
    realAuthApi.logout();
    state.session = null;
    state.balances = { demo: 50000, real: 0 };
    state.mode = 'demo';
    notifyListeners();
    return { ok: true as const };
  },

  me() {
    return state.session;
  },

  async updatePhone(phone: string) {
    const result = await realAuthApi.updatePhone(phone);
    if (result.success) {
      if (state.session) {
        state.session = { ...state.session, user: { ...state.session.user, phone } };
        notifyListeners();
      }
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error || 'Failed to update phone number' };
  },

  async forgotPassword(email: string) {
    const result = await realAuthApi.requestPasswordReset(email);
    return result.success
      ? { ok: true as const }
      : { ok: false as const, error: result.error || 'Failed to send reset email' };
  },

  async verifyOtp(_code: string) {
    return { ok: false as const, error: 'OTP verification not available — password reset uses an email link' };
  },
  async resetPassword(_password: string) {
    return { ok: false as const, error: 'Password reset not available here — follow the link in the reset email' };
  },
};

// ── Wallet ──
export const walletApi = {
  async depositInitiate(phone: string, amount: number) {
    const result = await realWalletApi.depositInitiate({ phone, amount });
    if (result.success && result.data) {
      return { ok: true as const, transactionId: result.data.transactionId };
    }
    return { ok: false as const, error: result.error || 'Deposit failed' };
  },

  async depositStatus(transactionId: string): Promise<{ status: 'pending' | 'success' | 'failed' }> {
    const result = await realWalletApi.getTransactions();
    if (result.success && result.data) {
      const tx = result.data.find((t) => t.ID === transactionId);
      if (tx?.Status === 'completed') return { status: 'success' };
      if (tx?.Status === 'rejected') return { status: 'failed' };
    }
    return { status: 'pending' };
  },

  async withdraw(amount: number, phone: string) {
    if (state.session?.user.role === 'influencer') {
      const result = await realInfluencerApi.withdrawToMockMpesa(amount);
      if (result.success && result.data) {
        applyBalanceDelta('real', -amount);
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error || 'Withdrawal failed' };
    }

    const result = await realWalletApi.withdraw({ amount, phone });
    if (result.success) {
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error || 'Withdrawal failed' };
  },

  transactions() {
    return realWalletApi.getTransactions();
  },

  setMode(mode: Mode) {
    state.mode = mode;
    if (typeof window !== 'undefined') localStorage.setItem('dotpesa_mode', mode);
    notifyListeners();
  },

  mode() {
    return state.mode;
  },

  limits: () => ({
    minDeposit: WALLET_LIMITS.minDepositKES,
    maxWithdraw: WALLET_LIMITS.maxWithdrawalKES,
    minStake: WALLET_LIMITS.minBetKES,
    maxSinglePayout: WALLET_LIMITS.maxCashoutKES,
  }),
};

// ── Game ──
export const gameApi = {
  async placeBet(box: Box, amount: number, mode: Mode) {
    // Guest mode: local-only demo betting (unauthenticated)
    if (!state.session) {
      const currentBalance = state.balances.demo;
      if (currentBalance < amount) {
        return { ok: false as const, error: 'Insufficient demo balance' };
      }
      applyBalanceDelta('demo', -amount);
      return { ok: true as const, betId: `guest_${Date.now()}_${box}` };
    }

    const result = await realGameApi.placeBet({ box, amount, currency: mode });
    if (result.success && result.data) {
      applyBalanceDelta(mode, -amount);
      return { ok: true as const, betId: result.data.betId };
    }
    return { ok: false as const, error: result.error || 'Bet failed' };
  },

  async cashout(box: Box, mode: Mode) {
    if (!state.session) {
      return { ok: true as const, payout: 0, multiplier: 0 };
    }

    const result = await realGameApi.cashout(box);
    if (result.success && result.data) {
      applyBalanceDelta(mode, result.data.payout);
      return { ok: true as const, payout: result.data.payout, multiplier: result.data.multiplier };
    }
    return { ok: false as const, error: result.error || 'Cashout failed' };
  },
};

// ── Profile / responsible-gaming prefs ──
export const profileApi = {
  responsible: () => state.responsible,
  updateResponsible(patch: Partial<AppState['responsible']>) {
    state.responsible = { ...state.responsible, ...patch };
    if (typeof window !== 'undefined') {
      localStorage.setItem('dotpesa_responsible', JSON.stringify(state.responsible));
    }
    notifyListeners();
  },
};

// ── State plumbing ──
const listeners = new Set<() => void>();

export function subscribeState(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function getState() {
  if (typeof window !== 'undefined') {
    const savedMode = localStorage.getItem('dotpesa_mode') as Mode | null;
    if (savedMode && (savedMode === 'demo' || savedMode === 'real')) {
      state.mode = savedMode;
    }
    const savedResponsible = localStorage.getItem('dotpesa_responsible');
    if (savedResponsible) {
      try {
        state.responsible = JSON.parse(savedResponsible);
      } catch {}
    }
  }
  return state;
}

export function applyBalanceDelta(mode: Mode, delta: number) {
  state.balances[mode] = Math.max(0, Math.round((state.balances[mode] + delta) * 100) / 100);
  notifyListeners();
}

// ── Balance reconciliation ──
async function refreshBalances() {
  if (!state.session) {
    state.balances = { demo: 50000, real: 0 };
    notifyListeners();
    return;
  }
  
  try {
    const [profileRes, walletRes] = await Promise.all([
      realAuthApi.getProfile(),
      realWalletApi.getBalance()
    ]);
    
    let changed = false;

    if (profileRes.success && profileRes.data) {
      const demo = profileRes.data.demoBalance ?? 0;
      if (demo !== state.balances.demo) {
        state.balances.demo = demo;
        changed = true;
      }
    }
    
    if (walletRes.success && walletRes.data) {
      const real = walletRes.data.realBalance ?? 0;
      if (real !== state.balances.real) {
        state.balances.real = real;
        changed = true;
      }
    }
    
    if (changed) {
      notifyListeners();
    }
  } catch (error) {
    console.error('[Balance] Failed to refresh balances:', error);
  }
}

let pollingStarted = false;
function startBalancePolling() {
  if (pollingStarted || typeof window === 'undefined') return;
  pollingStarted = true;
  setInterval(refreshBalances, 30000);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBalances();
  });
  window.addEventListener('focus', () => refreshBalances());
}

// ── Session rehydration ──
let authInitStarted = false;
export function initAuth() {
  if (authInitStarted || typeof window === 'undefined') return;
  authInitStarted = true;

  const token = api.getToken();
  if (!token) {
    // No token: start in demo mode with 50,000 for guest play
    state.session = null;
    state.mode = 'demo';
    state.balances = { demo: 50000, real: 0 };
    notifyListeners();
    return;
  }

  // We have a token, try to load the profile
  realAuthApi.getProfile().then((result) => {
    if (result.success && result.data) {
      const profile = result.data;
      state.session = {
        token,
        user: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          phone: profile.phone,
          role: profile.role,
          canDebug: profile.canDebug,
        },
      };
      state.mode = 'demo';
      state.balances.demo = profile.demoBalance ?? 0;
      state.balances.real = profile.realBalance ?? 0;
      
      // Also get real balance from wallet endpoint for accuracy
      refreshBalances();
      startBalancePolling();
    } else {
      // Token is invalid
      api.clearToken();
      state.session = null;
      state.mode = 'demo';
      state.balances = { demo: 50000, real: 0 };
    }
    notifyListeners();
  }).catch(() => {
    // Error loading profile, clear token
    api.clearToken();
    state.session = null;
    state.mode = 'demo';
    state.balances = { demo: 50000, real: 0 };
    notifyListeners();
  });
}

if (typeof window !== 'undefined') {
  initAuth();
}

// ── Formatting helpers ──
export function formatKES(n: number) {
  return new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function multiplierTier(m: number): 'low' | 'mid' | 'high' {
  if (m < 2) return 'low';
  if (m <= 10) return 'mid';
  return 'high';
}

export function maskPhone(phone: string) {
  if (!phone) return '';
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

export const LIMITS = {
  minStake: WALLET_LIMITS.minBetKES,
  minDeposit: WALLET_LIMITS.minDepositKES,
  maxWithdraw: WALLET_LIMITS.maxWithdrawalKES,
  maxSinglePayout: WALLET_LIMITS.maxCashoutKES,
};