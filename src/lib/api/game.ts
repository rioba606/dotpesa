// src/lib/api/game.ts
//
// Rewritten against game.go. This backend's bet model is fundamentally
// different from what this frontend used to target:
//   - There's no free-form stake-per-user model with a betId you cash out
//     by ID. Every round has exactly two fixed "boxes" (box: 1 | 2), one
//     bet per user per box per round — placing a second bet on a box
//     you've already bet on this round is rejected by redis.go's Lua
//     script ("bet already placed on this box").
//   - Cashout targets a box, not a betId — POST /api/game/cashout takes
//     {box}, not {betId}.
//   - There is NO auto-cashout and NO cancel-bet anywhere in
//     game.go/redis.go. Both have been removed here. If auto-cashout is a
//     hard requirement, it needs to be a backend feature (server-side
//     watcher calling the same cashout Lua script when the multiplier
//     crosses a threshold) — doing it purely client-side is unsafe, since
//     it depends on the tab staying open and a WS tick arriving in time.
//   - There is no GET /api/game/live-bets endpoint. The only signal for
//     what other players are doing is the bet:placed / bet:cashout
//     WebSocket broadcasts (see socket.ts), and even those only carry
//     {roundId, userId, box, amount} / {..., multiplier, payout} — no
//     username, no betId. There's currently no way to render a
//     "PlayerX bet 500" feed with a real display name from what the
//     backend sends.
//   - GET /api/game/history returns a bare array of crash-point numbers
//     (most recent first, capped at 50 by redis.go's roundHistoryKey
//     LTRIM), not an array of {id, crash_point, hash, created_at}
//     objects — and there's no `limit` query param.
//   - GET /api/game/state returns game.go's publicRoundView: {id, phase,
//     multiplier, serverSeedHash, countdown}. The crash point is
//     deliberately withheld until the round actually crashes, and
//     there's no serverTime field.

import { api, ApiResponse } from './client';

export type Phase = 'waiting' | 'running' | 'crashed';
export type Box = 1 | 2;
export type Currency = 'demo' | 'real';

export interface GameState {
  id: number;
  phase: Phase;
  multiplier: number;
  serverSeedHash: string;
  countdown: number;
}

export interface PlaceBetData {
  box: Box;
  amount: number;
  currency: Currency;
}

export interface PlaceBetResponse {
  betId: string;
  roundId: number;
  box: Box;
}

export interface CashoutResponse {
  payout: number;
  multiplier: number;
}

// Only populated for admins, or influencers with can_debug (gated
// server-side by RequireDebugAccess). Reveals the pre-committed crash
// point before the round ends.
export interface RoundDebugState {
  roundId: number;
  phase: Phase;
  crashPoint: number;
  countdown: number;
}

export const gameApi = {
  async getState(): Promise<ApiResponse<GameState>> {
    return api.get<GameState>('/api/game/state');
  },

  async getHistory(): Promise<ApiResponse<number[]>> {
    return api.get<number[]>('/api/game/history');
  },

  async placeBet(data: PlaceBetData): Promise<ApiResponse<PlaceBetResponse>> {
    return api.post<PlaceBetResponse>('/api/game/bet', data);
  },

  async cashout(box: Box): Promise<ApiResponse<CashoutResponse>> {
    return api.post<CashoutResponse>('/api/game/cashout', { box });
  },

  async getRoundDebug(): Promise<ApiResponse<RoundDebugState>> {
    return api.get<RoundDebugState>('/api/game/admin/round-debug');
  },
};
