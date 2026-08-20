// src/lib/api/auth.ts
//
// Rewritten against the actual Go backend (auth.go + middleware.go).
// Key differences from what this frontend used to target:
//   - No /api/auth/me and no /api/auth/logout route exist. "Who am I"
//     goes through GET /api/auth/profile — the same route used for the
//     full profile fetch. Logout is purely a client-side token clear.
//   - Signup/login only return {token, user}. The `user` shape the
//     backend sends is minimal — id, username, role (and canDebug, but
//     only on login/admin-login, not signup). There's no email,
//     displayName, or phone echoed back; auth.go never asks Postgres for
//     those fields on signup/login.
//   - UpdateOwnProfile only accepts `username` — that's the one field
//     PATCH /api/auth/profile supports.
//   - Password reset is real (proxied straight to Supabase's
//     /auth/v1/recover) but it's an email-link flow, not an OTP-code
//     flow — there's no verify/reset-with-code endpoint to call.
//
// CONFIRMED (db.go): Profile has NO `json:"..."` struct tags, so
// encoding/json falls back to the literal Go field names — PascalCase.
// GET /api/auth/profile therefore returns {ID, Username, Role, CanDebug,
// DemoBalance, RealBalance, InfluencerCredited, CreatedAt}. This is a real
// inconsistency in the backend itself: doLogin builds its response by hand
// with lowercase/camelCase keys ("id", "username", "role", "canDebug"),
// while GetOwnProfile/ListUsers pass the raw struct straight to
// writeSuccess and get PascalCase instead. Same conceptual object, two
// different casings depending which route you hit — worth raising with
// whoever owns auth.go/db.go (adding json tags to Profile would fix it at
// the source), but until then this client has to match each route as it
// actually behaves rather than assume they're consistent.

import { api, ApiResponse } from './client';

export type Role = 'user' | 'admin' | 'influencer';

// Shape returned by POST /api/auth/{signup,login,admin/login} — hand-built
// camelCase maps in auth.go's doLogin/Signup.
export interface AuthUser {
  id: string;
  username: string;
  displayName?: string; // backend returns this on login/signup
  phone?: string; // backend returns this on login/signup too (see auth.go)
  role: Role;
  canDebug?: boolean; // present on login/admin-login responses only, not signup
}

// Shape returned by GET /api/auth/profile — camelCase, matching auth.go
export interface Profile {
  id: string;
  username: string;
  displayName: string;
  phone: string; // "" for accounts created before phone capture was added
  role: Role;
  canDebug: boolean;
  demoBalance: number;
  realBalance: number;
  influencerCredited: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  username: string;
  phone: string; // 2547XXXXXXXX / 2541XXXXXXXX — required by auth.go's Signup
}

export const authApi = {
  async signup(data: SignupData): Promise<ApiResponse<AuthResponse>> {
    const response = await api.post<AuthResponse>('/api/auth/signup', data);
    if (response.success && response.data) api.setToken(response.data.token);
    return response;
  },

  async login(data: LoginData): Promise<ApiResponse<AuthResponse>> {
    const response = await api.post<AuthResponse>('/api/auth/login', data);
    if (response.success && response.data) api.setToken(response.data.token);
    return response;
  },

  // Portal login for admin/influencer accounts only — doLogin(..., "portal")
  // on the backend 403s a plain 'user' role account here.
  async adminLogin(data: LoginData): Promise<ApiResponse<AuthResponse>> {
    const response = await api.post<AuthResponse>('/api/auth/admin/login', data);
    if (response.success && response.data) api.setToken(response.data.token);
    return response;
  },

  // No server-side logout route — the JWT is stateless (Supabase-issued),
  // so "logging out" is just discarding the token client-side.
  logout(): void {
    api.clearToken();
  },

  async getProfile(): Promise<ApiResponse<Profile>> {
    return api.get<Profile>('/api/auth/profile');
  },

  async updateUsername(username: string): Promise<ApiResponse<{ username: string }>> {
    return api.patch<{ username: string }>('/api/auth/profile', { username });
  },

  // PATCH /api/auth/profile now accepts { phone } on its own (auth.go's
  // updateProfileRequest takes username/phone as independent optional
  // fields) — lets someone update their M-Pesa number from the profile
  // page without also having to resend their username.
  async updatePhone(phone: string): Promise<ApiResponse<{ phone: string }>> {
    return api.patch<{ phone: string }>('/api/auth/profile', { phone });
  },

  // Sends an email reset link via Supabase — there's no matching
  // verify-code / reset-with-token API call on this backend; that part of
  // the flow is handled by whatever page Supabase's email link lands on.
  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return api.post<{ message: string }>('/api/auth/password-reset/request', { email });
  },
};