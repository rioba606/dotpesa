// src/lib/api/wallet.ts
//
// Rewritten against wallet.go + daraja.go. Differences from what this
// frontend used to target:
//   - GET /api/wallet/balance takes no `mode` param and only ever returns
//     the real-money balance ({realBalance}). There's no wallet-level demo
//     balance on this backend — demo balance lives on the profile row
//     (see auth.ts's Profile.demoBalance) and only ever moves through the
//     Redis fast path during a round, never through a wallet endpoint.
//   - GET /api/wallet/transactions takes no query params — GetWalletTransactions
//     ignores type/limit/offset entirely and always returns the caller's
//     most recent 50 transactions of any type.
//   - The deposit route is POST /api/wallet/deposit/mpesa (not
//     /deposit/initiate), body is {amount, phone} not {amountKES, phone},
//     minimum is KES 200 (minDepositKES), and the response has no
//     `reference` field.
//   - There is NO deposit-status polling endpoint. A deposit only resolves
//     when Safaricom's callback hits the backend directly and updates
//     Postgres — CompleteDeposit sets status 'completed', FailDeposit sets
//     it 'rejected' (not 'failed' — see the Transaction.Status comment
//     below). The client finds out by re-checking transactions/balance,
//     not by polling a dedicated status route. See mockApi.ts's
//     depositStatus() for how that's approximated now.
//   - Withdraw body is {amount, phone} — phone is the M-Pesa number the
//     payout should land on (not necessarily the one on the profile).
//     Backend enforces 0 < amount <= maxWithdrawalKES (100,000) and a
//     valid 2547.../2541... phone, and the response is
//     {transactionId, status: "pending", message}.
//   - There is no GET /api/wallet/limits route. WALLET_LIMITS below are
//     the backend's actual hardcoded constants (wallet.go, game.go),
//     duplicated here since there's nowhere to fetch them from.

import { api, ApiResponse } from './client';

export interface WalletBalance {
  realBalance: number;
}

// CONFIRMED (db.go): Transaction has no json tags either — same PascalCase
// situation as Profile (see auth.ts's header). GET /api/wallet/transactions
// returns these raw, and MpesaReceipt/ReviewedBy are Go pointers, so they
// serialize as `null` rather than being omitted when unset.
export interface Transaction {
  ID: string;
  UserID: string;
  Type: 'deposit' | 'withdrawal';
  Amount: number;
  Status: 'pending' | 'approved' | 'rejected' | 'completed'; // per db.go's Transaction.Status comment — deposits use pending/completed/rejected, withdrawals also use approved
  MpesaReceipt: string | null;
  ReviewedBy: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface DepositResponse {
  transactionId: string;
  checkoutRequestId: string;
  message: string;
}

export interface WithdrawResponse {
  transactionId: string;
  status: 'pending';
  message: string;
}

export const WALLET_LIMITS = {
  minDepositKES: 200, // wallet.go: minDepositKES
  maxWithdrawalKES: 100000, // wallet.go: maxWithdrawalKES
  minBetKES: 10, // game.go: minBetKES
  maxCashoutKES: 1000000, // game.go: maxCashoutKES
} as const;

export const walletApi = {
  async getBalance(): Promise<ApiResponse<WalletBalance>> {
    return api.get<WalletBalance>('/api/wallet/balance');
  },

  async getTransactions(): Promise<ApiResponse<Transaction[]>> {
    return api.get<Transaction[]>('/api/wallet/transactions');
  },

  async depositInitiate(data: { phone: string; amount: number }): Promise<ApiResponse<DepositResponse>> {
    return api.post<DepositResponse>('/api/wallet/deposit/mpesa', data);
  },

  async withdraw(data: { amount: number; phone: string }): Promise<ApiResponse<WithdrawResponse>> {
    return api.post<WithdrawResponse>('/api/wallet/withdraw', data);
  },
};
