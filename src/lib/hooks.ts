// src/lib/hooks.ts

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { socketClient } from './api/socket';
import { gameApi } from './api/game';
import type { Box } from './api/game';
import { getState, subscribeState, type GameSnapshot } from './mockApi';

const emptySnapshot: GameSnapshot = {
  phase: 'waiting',
  roundId: 0,
  multiplier: 1,
  countdown: 0,
  history: [],
  liveBets: [],
};

// ---- Front-end-only "live bets" filler ----
//
// There are no real users yet, so the live-bet feed is empty. This layers
// synthetic bot activity on top of whatever real bets come through the
// WebSocket, purely in the browser — no backend call, no balance touched,
// nothing persisted. Bots share the exact LiveBet shape real bets use, so
// every page that renders useGame().liveBets gets them for free.
//
// Flip this to false (or delete the BOT_* block + the three call sites
// marked "bots:" below) once there's enough real traffic that filler
// bets would look out of place.
const ENABLE_BOT_LIVE_BETS = true;

// Kept to 8 chars or fewer: LiveBetsTable renders non-self players as
// b.userId.slice(0, 8), so anything longer gets chopped mid-word (e.g.
// "NairobiKing" -> "NairobiK"). These all read fine even if a numeric
// suffix pushes them past 8 and gets truncated too (e.g. "Kevo1" from
// "Kevo123").
const BOT_NAMES = [
  'Wanjiru', 'KevoBet', 'MamaPesa', 'Trader', 'Mwangi',
  'Nairobi', 'CashOut', 'BetaKE', 'Maisha', 'DiamondD',
  'Otieno', 'PesaPlug', 'SkyRckt', 'Candle', 'RiskyB',
  'Jambo', 'FastKE', 'NightOwl', 'Sunrise', 'Bonga',
];
const BOT_AMOUNTS = [50, 100, 100, 200, 200, 500, 500, 1000, 2000, 5000];
// Must match game.go's crashGrowthPerSec so a bot's target cashout
// multiplier lands at roughly the same wall-clock moment the real
// multiplier display would show that number.
const BOT_GROWTH_PER_SEC = 0.09;

function randomBotAmount() {
  return BOT_AMOUNTS[Math.floor(Math.random() * BOT_AMOUNTS.length)];
}

// Exponential-ish spread: clustered around 1.2x-3x with occasional big
// cashouts, similar to how real crash-game cashout distributions look.
function randomBotTarget() {
  const t = 1 + -Math.log(Math.random()) * 0.8;
  return Math.min(Math.max(t, 1.05), 15);
}

function randomBotName(used: Set<string>) {
  let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  let tries = 0;
  while (used.has(name) && tries < 10) {
    name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 90 + 10);
    tries++;
  }
  used.add(name);
  return name;
}

/** Reactive access to session/wallet/mode state. */
export function useMockState() {
  const [, force] = useState(0);
  
  useEffect(() => {
    const unsubscribe = subscribeState(() => force((n) => n + 1));
    return unsubscribe;
  }, []);
  
  return getState();
}

/** Reactive access to the live round via the plain-WebSocket broadcast. */
export function useGame(): GameSnapshot {
  const [snap, setSnap] = useState<GameSnapshot>(emptySnapshot);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // bots: pending setTimeout handles (bet-appears / cashout-fires) for the
  // current round, so a round change or unmount can cancel cleanly.
  const botTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // bots: metadata for whichever bot bets have been added this round, kept
  // outside React state so scheduling their cashouts doesn't need to read
  // state back out of a setState updater.
  const activeBotBets = useRef<{ key: string; box: Box; amount: number }[]>([]);

  const clearBotTimers = () => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
  };

  useEffect(() => {
    socketClient.connect();

    async function loadInitialState() {
      try {
        const response = await gameApi.getState();
        if (response.success && response.data) {
          setSnap((prev) => ({
            ...prev,
            phase: response.data!.phase,
            roundId: response.data!.id,
            multiplier: response.data!.multiplier,
            countdown: response.data!.countdown,
          }));
        }
      } catch (error) {
        console.error('[Game] Failed to load initial state:', error);
      }
    }
    loadInitialState();

    const onWaiting = (data: { id: number; countdown: number }) => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);

      setSnap((prev) => ({
        ...prev,
        phase: 'waiting',
        roundId: data.id,
        countdown: data.countdown,
        multiplier: 1,
        liveBets: [],
      }));

      clearBotTimers();
      activeBotBets.current = [];

      // bots: trickle a handful of fake bets in over the countdown window
      // instead of dumping them all in at once.
      if (ENABLE_BOT_LIVE_BETS) {
        const usedNames = new Set<string>();
        const botCount = 8 + Math.floor(Math.random() * 18); // 8–25 per round
        for (let i = 0; i < botCount; i++) {
          const delay = Math.random() * Math.max(data.countdown - 1, 1) * 1000;
          const timer = setTimeout(() => {
            const box = (Math.random() < 0.5 ? 1 : 2) as Box;
            const name = randomBotName(usedNames);
            const amount = randomBotAmount();
            const key = `bot:${data.id}:${name}:${box}`;
            activeBotBets.current.push({ key, box, amount });
            setSnap((prev) => {
              if (prev.roundId !== data.id) return prev; // round already moved on
              return {
                ...prev,
                liveBets: [
                  { key, userId: name, box, amount, cashedOutAt: null, payout: null, self: false },
                  ...prev.liveBets,
                ],
              };
            });
          }, delay);
          botTimers.current.push(timer);
        }
      }

      let remaining = data.countdown;
      countdownTimer.current = setInterval(() => {
        remaining -= 1;
        setSnap((prev) => (prev.phase === 'waiting' ? { ...prev, countdown: Math.max(0, remaining) } : prev));
        if (remaining <= 0 && countdownTimer.current) {
          clearInterval(countdownTimer.current);
          countdownTimer.current = null;
        }
      }, 1000);
    };

    const onStarted = (data: { id: number }) => {
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = null;
      }
      setSnap((prev) => ({ ...prev, phase: 'running', roundId: data.id, multiplier: 1 }));

      // bots: schedule a fake cashout for most bot bets that made it in
      // before the round started; ~25% ride it out and lose, like real
      // players do. Timing is derived from game.go's growth curve so the
      // cashout fires around the same wall-clock moment the multiplier
      // display would actually show that number.
      if (ENABLE_BOT_LIVE_BETS) {
        activeBotBets.current.forEach((bet) => {
          if (Math.random() < 0.25) return; // rides to the crash, no cashout
          const target = randomBotTarget();
          const msUntilTarget = (Math.log(target) / BOT_GROWTH_PER_SEC) * 1000;
          const timer = setTimeout(() => {
            setSnap((cur) => {
              if (cur.roundId !== data.id || cur.phase !== 'running') return cur;
              return {
                ...cur,
                liveBets: cur.liveBets.map((b) =>
                  b.key === bet.key ? { ...b, cashedOutAt: target, payout: bet.amount * target } : b,
                ),
              };
            });
          }, msUntilTarget);
          botTimers.current.push(timer);
        });
      }
    };

    const onTick = (data: { id: number; multiplier: number }) => {
      setSnap((prev) => ({ ...prev, multiplier: data.multiplier }));
    };

    const onCrashed = (data: { id: number; crashPoint: number }) => {
      clearBotTimers();
      setSnap((prev) => {
        if (prev.roundId === data.id && prev.history[0] === data.crashPoint) {
          return { ...prev, phase: 'crashed', multiplier: data.crashPoint };
        }
        return {
          ...prev,
          phase: 'crashed',
          multiplier: data.crashPoint,
          history: [data.crashPoint, ...prev.history].slice(0, 50),
        };
      });
    };

    const onBetPlaced = (data: { roundId: number; userId: string; box: Box; amount: number }) => {
      const currentUserId = getState().session?.user.id;
      const key = `${data.userId}:${data.box}`;
      setSnap((prev) => ({
        ...prev,
        liveBets: [
          {
            key,
            userId: data.userId,
            box: data.box,
            amount: data.amount,
            cashedOutAt: null,
            payout: null,
            self: data.userId === currentUserId,
          },
          ...prev.liveBets.filter((b) => b.key !== key),
        ],
      }));
    };

    const onCashout = (data: { roundId: number; userId: string; box: Box; multiplier: number; payout: number }) => {
      const key = `${data.userId}:${data.box}`;
      setSnap((prev) => ({
        ...prev,
        liveBets: prev.liveBets.map((bet) =>
          bet.key === key ? { ...bet, cashedOutAt: data.multiplier, payout: data.payout } : bet
        ),
      }));
    };

    socketClient.on('round:waiting', onWaiting);
    socketClient.on('round:started', onStarted);
    socketClient.on('round:tick', onTick);
    socketClient.on('round:crashed', onCrashed);
    socketClient.on('bet:placed', onBetPlaced);
    socketClient.on('bet:cashout', onCashout);

    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      clearBotTimers();
      socketClient.off('round:waiting', onWaiting);
      socketClient.off('round:started', onStarted);
      socketClient.off('round:tick', onTick);
      socketClient.off('round:crashed', onCrashed);
      socketClient.off('bet:placed', onBetPlaced);
      socketClient.off('bet:cashout', onCashout);
    };
  }, []);

  return snap;
}

/** Avoids SSR/hydration mismatch for localStorage-backed UI. */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}