// ============================================================
// 🛡️ SERVICE DE RATE LIMITING
// Protection contre les abus côté client (persistant localStorage)
// ============================================================

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  remainingTimeMs: number;
  remainingTimeFormatted: string;
}

// ============================================================
// 📦 CLASS RATE LIMITER (localStorage)
// ============================================================

class RateLimiter {
  private storage: Storage;
  private prefix: string;

  constructor(prefix: string = 'rl_') {
    this.storage = typeof window !== 'undefined' ? localStorage : {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage;
    this.prefix = prefix;
  }

  isAllowed(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
    const storageKey = this.prefix + key;
    const now = Date.now();

    try {
      const rawData = this.storage.getItem(storageKey);
      const attempts: number[] = rawData ? JSON.parse(rawData) : [];

      const validAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);

      if (validAttempts.length >= maxAttempts) {
        const oldest = Math.min(...validAttempts);
        const remainingTimeMs = windowMs - (now - oldest);

        return {
          allowed: false,
          remainingAttempts: 0,
          remainingTimeMs,
          remainingTimeFormatted: this.formatTime(remainingTimeMs),
        };
      }

      validAttempts.push(now);
      this.storage.setItem(storageKey, JSON.stringify(validAttempts));

      return {
        allowed: true,
        remainingAttempts: maxAttempts - validAttempts.length,
        remainingTimeMs: 0,
        remainingTimeFormatted: '0s',
      };
    } catch (error) {
      console.error('Erreur rate limiter:', error);
      return {
        allowed: true,
        remainingAttempts: maxAttempts,
        remainingTimeMs: 0,
        remainingTimeFormatted: '0s',
      };
    }
  }

  getRemainingTime(key: string, windowMs: number): number {
    const storageKey = this.prefix + key;
    const now = Date.now();

    try {
      const rawData = this.storage.getItem(storageKey);
      if (!rawData) return 0;

      const attempts: number[] = JSON.parse(rawData);
      const validAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);

      if (validAttempts.length === 0) return 0;

      const oldest = Math.min(...validAttempts);
      return Math.max(0, windowMs - (now - oldest));
    } catch {
      return 0;
    }
  }

  check(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
    const storageKey = this.prefix + key;
    const now = Date.now();

    try {
      const rawData = this.storage.getItem(storageKey);
      if (!rawData) {
        return {
          allowed: true,
          remainingAttempts: maxAttempts,
          remainingTimeMs: 0,
          remainingTimeFormatted: '0s',
        };
      }

      const attempts: number[] = JSON.parse(rawData);
      const validAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);

      if (validAttempts.length >= maxAttempts) {
        const oldest = Math.min(...validAttempts);
        const remainingTimeMs = windowMs - (now - oldest);

        return {
          allowed: false,
          remainingAttempts: 0,
          remainingTimeMs,
          remainingTimeFormatted: this.formatTime(remainingTimeMs),
        };
      }

      return {
        allowed: true,
        remainingAttempts: maxAttempts - validAttempts.length,
        remainingTimeMs: 0,
        remainingTimeFormatted: '0s',
      };
    } catch {
      return {
        allowed: true,
        remainingAttempts: maxAttempts,
        remainingTimeMs: 0,
        remainingTimeFormatted: '0s',
      };
    }
  }

  reset(key: string): void {
    const storageKey = this.prefix + key;
    this.storage.removeItem(storageKey);
  }

  cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key || !key.startsWith(this.prefix)) continue;

      try {
        const attempts: number[] = JSON.parse(this.storage.getItem(key) || '[]');
        const recentAttempts = attempts.filter((t) => now - t < 24 * 60 * 60 * 1000);

        if (recentAttempts.length === 0) {
          keysToRemove.push(key);
        } else if (recentAttempts.length !== attempts.length) {
          this.storage.setItem(key, JSON.stringify(recentAttempts));
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => this.storage.removeItem(key));
  }

  private formatTime(ms: number): string {
    if (ms <= 0) return '0s';

    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
    }
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
    }
    return `${seconds}s`;
  }
}

// ============================================================
// 🚀 INSTANCE GLOBALE
// ============================================================

export const rateLimiter = new RateLimiter();

// ============================================================
// 📋 CONFIGURATIONS PRÉDÉFINIES (UN SEUL BLOC)
// ============================================================

export const RATE_LIMITS = {
  // 🔐 Authentification
  LOGIN: { key: 'login', maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  REGISTER: { key: 'register', maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  PASSWORD_RESET: { key: 'password_reset', maxAttempts: 3, windowMs: 60 * 60 * 1000 },

  // 📄 Pages publiques
  PUBLIC_QUOTE_VIEW: { key: 'public_quote', maxAttempts: 30, windowMs: 60 * 60 * 1000 },
  PUBLIC_INVOICE_VIEW: { key: 'public_invoice', maxAttempts: 30, windowMs: 60 * 60 * 1000 },
  PUBLIC_REQUEST: { key: 'public_request_submit', maxAttempts: 5, windowMs: 60 * 60 * 1000 }, // ✅ NOUVEAU

  // 👥 Invitation d'équipe
  JOIN_TEAM_PROCESS: { key: 'join_team_process', maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // ✅ RESTAURÉ valeur normale
  TOKEN_ACCESS_FAILED: { key: 'token_failed', maxAttempts: 10, windowMs: 60 * 60 * 1000 },

  // 📤 Import / Export
  EXPORT: { key: 'export', maxAttempts: 10, windowMs: 60 * 60 * 1000 },
  IMPORT: { key: 'import', maxAttempts: 5, windowMs: 60 * 60 * 1000 },

  // 📧 Communication
  EMAIL_SEND: { key: 'email_send', maxAttempts: 20, windowMs: 60 * 60 * 1000 },
  REMINDER_SEND: { key: 'reminder_send', maxAttempts: 50, windowMs: 24 * 60 * 60 * 1000 },

  // ⚡ Actions générales
  CREATE_DOCUMENT: { key: 'create_doc', maxAttempts: 60, windowMs: 60 * 1000 },
  SEARCH: { key: 'search', maxAttempts: 100, windowMs: 60 * 1000 },

  // 💳 E-facturation
  E_INVOICE_TRANSMIT: { key: 'e_invoice', maxAttempts: 20, windowMs: 60 * 60 * 1000 },
} as const;

// ============================================================
// 🛠️ FONCTIONS UTILITAIRES
// ============================================================

export const checkRateLimit = (config: RateLimitConfig): RateLimitResult => {
  return rateLimiter.check(config.key, config.maxAttempts, config.windowMs);
};

export const consumeRateLimit = (config: RateLimitConfig): RateLimitResult => {
  return rateLimiter.isAllowed(config.key, config.maxAttempts, config.windowMs);
};

export const resetRateLimit = (key: string): void => {
  rateLimiter.reset(key);
};

export const cleanupRateLimits = (): void => {
  rateLimiter.cleanup();
};