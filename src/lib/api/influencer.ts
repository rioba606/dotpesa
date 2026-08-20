// src/lib/api/influencer.ts
//
// Rewritten against influencer.go. The withdrawal flow is a two-hop mock,
// not a single call:
//   1. POST /api/influencer/withdraw {amount} moves money out of the
//      influencer's in-game real_balance into a mock M-Pesa wallet
//      (influencer_mock_mpesa). Final the instant it succeeds — no admin
//      approval step.
//   2. GET /api/influencer/mpesa/balance reads that mock wallet's balance
//      ({withdrawnAmount}).
//   3. POST /api/influencer/mpesa/withdraw {amount} "cashes out" of the
//      mock wallet — purely decrements withdrawnAmount. Per influencer.go's
//      own file header, no real money moves anywhere in this file.
//
// There is no GET /api/influencer/withdrawals route for an influencer to
// see their own withdrawal history/status. admin.go's
// ListInfluencerWithdrawals exists but sits under /api/admin and returns
// every influencer's withdrawals, not just the caller's — that's an
// admin-only view, not something this client can call for a self-service
// history page.

import { api, ApiResponse } from './client';

export interface MockMpesaBalance {
  withdrawnAmount: number;
}

export interface WithdrawResult {
  withdrawn: number;
}

export const influencerApi = {
  async getMockMpesaBalance(): Promise<ApiResponse<MockMpesaBalance>> {
    return api.get<MockMpesaBalance>('/api/influencer/mpesa/balance');
  },

  // Step 1: real_balance -> mock M-Pesa wallet.
  async withdrawToMockMpesa(amount: number): Promise<ApiResponse<WithdrawResult>> {
    return api.post<WithdrawResult>('/api/influencer/withdraw', { amount });
  },

  // Step 2: "cash out" of the mock M-Pesa wallet itself.
  async withdrawFromMockMpesa(amount: number): Promise<ApiResponse<WithdrawResult>> {
    return api.post<WithdrawResult>('/api/influencer/mpesa/withdraw', { amount });
  },

  // CONFIRMED (db.go's ListInfluencerTransactions): this is a hand-built
  // map, not a struct passed through json.Marshal, so it has yet another
  // casing convention — snake_case, matching the SQL column names
  // directly: {type, amount, balance_after, created_at}. Three different
  // routes in this backend (login's camelCase, profile's PascalCase, this
  // one's snake_case) all describe similar "account activity" data with
  // three different key conventions.
  async getTransactions(): Promise<ApiResponse<Array<{ type: string; amount: number; balance_after: number; created_at: string }>>> {
    return api.get('/api/influencer/transactions');
  },
};
