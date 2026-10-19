import { useState, useEffect, useCallback } from 'react';
import { 
  checkRateLimit, 
  consumeRateLimit, 
  resetRateLimit, 
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult 
} from '../services/rateLimitService';

// ============================================================
// 🎯 HOOK PRINCIPAL : useRateLimit
// ============================================================

export const useRateLimit = (config: RateLimitConfig | undefined) => {
  // ✅ Fallback par défaut si config manquante (évite les crashes)
  const safeConfig: RateLimitConfig = config || {
    key: 'unknown_rate_limit',
    maxAttempts: 10,
    windowMs: 60 * 1000,
  };

  const [state, setState] = useState<RateLimitResult>(() => 
    checkRateLimit(safeConfig)
  );

  // Rafraîchir l'état périodiquement (pour décompte temps réel)
  useEffect(() => {
    const interval = setInterval(() => {
      setState(checkRateLimit(safeConfig));
    }, 1000);

    return () => clearInterval(interval);
  }, [safeConfig.key, safeConfig.maxAttempts, safeConfig.windowMs]);

  const tryConsume = useCallback((): RateLimitResult => {
    const result = consumeRateLimit(safeConfig);
    setState(result);
    return result;
  }, [safeConfig]);

  const reset = useCallback(() => {
    resetRateLimit(safeConfig.key);
    setState(checkRateLimit(safeConfig));
  }, [safeConfig.key, safeConfig]);

  return {
    tryConsume,
    isBlocked: !state.allowed,
    remainingAttempts: state.remainingAttempts,
    remainingTimeMs: state.remainingTimeMs,
    remainingTimeFormatted: state.remainingTimeFormatted,
    reset,
    state,
  };
};

// ============================================================
// 🎯 HOOKS SPÉCIALISÉS (rétrocompatibilité)
// ============================================================

export const useLoginRateLimit = () => useRateLimit(RATE_LIMITS.LOGIN);
export const useRegisterRateLimit = () => useRateLimit(RATE_LIMITS.REGISTER);
export const usePasswordResetRateLimit = () => useRateLimit(RATE_LIMITS.PASSWORD_RESET);
export const useExportRateLimit = () => useRateLimit(RATE_LIMITS.EXPORT);
export const useImportRateLimit = () => useRateLimit(RATE_LIMITS.IMPORT);
export const useEmailRateLimit = () => useRateLimit(RATE_LIMITS.EMAIL_SEND);
export const useReminderRateLimit = () => useRateLimit(RATE_LIMITS.REMINDER_SEND);
export const useCreateDocumentRateLimit = () => useRateLimit(RATE_LIMITS.CREATE_DOCUMENT);
export const useSearchRateLimit = () => useRateLimit(RATE_LIMITS.SEARCH);
export const usePublicQuoteRateLimit = () => useRateLimit(RATE_LIMITS.PUBLIC_QUOTE_VIEW);
export const usePublicInvoiceRateLimit = () => useRateLimit(RATE_LIMITS.PUBLIC_INVOICE_VIEW);
export const useJoinTeamRateLimit = () => useRateLimit(RATE_LIMITS.JOIN_TEAM_PROCESS);
export const useTokenAccessFailedRateLimit = () => useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
export const useEInvoiceRateLimit = () => useRateLimit(RATE_LIMITS.E_INVOICE_TRANSMIT);

// Hook générique pour config personnalisée inline
export const useCustomRateLimit = (key: string, maxAttempts: number, windowMs: number) => 
  useRateLimit({ key, maxAttempts, windowMs });