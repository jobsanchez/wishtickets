const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function normalizeUsernameInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export function validateUsername(value: string | null | undefined): {
  ok: boolean;
  normalized: string | null;
  message?: string;
} {
  const normalized = normalizeUsernameInput(value);
  if (!normalized) {
    return { ok: false, normalized: null, message: "Username is required." };
  }
  if (!isValidUsername(normalized)) {
    return {
      ok: false,
      normalized,
      message:
        "Username must be 3-30 characters and can only include lowercase letters, numbers, dots, underscores, and hyphens.",
    };
  }
  return { ok: true, normalized };
}

export function looksLikeEmail(value: string): boolean {
  const normalized = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
