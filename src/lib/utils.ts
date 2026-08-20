import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Kenyan phone numbers ──
// Every phone input in the app collects just the 9-digit local part (the
// number after dropping the leading 0), since the +254 country code is
// fixed in the UI. Safaricom/other mobile numbers start with 7 (07...) or
// 1 (01...).
export const KENYAN_LOCAL_RE = /^[71]\d{8}$/;

export function isValidKenyanLocal(local: string) {
  return KENYAN_LOCAL_RE.test(local);
}

// Strips a "254" prefix (or any non-digits) off a phone number and returns
// just the 9-digit local part, e.g. "254712345678" -> "712345678". Used to
// turn a stored full number (from the backend) into what the phone inputs
// expect. Returns "" for accounts with no phone on file.
export function localPart(phone: string | undefined | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return (digits.startsWith("254") ? digits.slice(3) : digits).slice(0, 9);
}
