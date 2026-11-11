import { 
  TrendingUp, TrendingDown, Minus, Inbox, X, Receipt, FileText, 
  UserCheck, Users, Package, AlertCircle, Search, Filter, MoreHorizontal, 
  ChevronLeft, ChevronRight, Lock, CheckCircle2
} from 'lucide-react';
import type { ReactNode, ReactElement, ComponentType } from 'react';
import { useState, useRef, useEffect, forwardRef } from 'react';

// ============================================================
// TYPES & INTERFACES GÉNÉRIQUES
// ============================================================

export interface Entity {
  type?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
}

export type DotTone =
  | 'sky' | 'teal' | 'violet' | 'amber' | 'emerald'
  | 'rose' | 'orange' | 'slate' | 'pink' | 'indigo' | 'red';

export type SharedStatus =
  | 'active' | 'inactive' | 'archived'
  | 'new' | 'contacted' | 'quote_sent' | 'pending' | 'followup' | 'won' | 'lost'
  | 'draft' | 'invoiced' | 'sent' | 'near_due' | 'overdue' | 'paid' | 'partial' | 'cancelled'
  | 'refunded' | 'partial_refund' | 'to_refund' | 'allocated';

// ============================================================
// LIBELLÉS CENTRALISÉS
// ============================================================

export const statusLabels: Record<string, string> = {
  active: 'Actif', inactive: 'Inactif', archived: 'Archivé',
  new: 'Nouveau', contacted: 'Contacté', quote_sent: 'Devis envoyé',
  pending: 'En attente', followup: 'Relance', won: 'Gagné', lost: 'Perdu',
  draft: 'Brouillon', invoiced: 'Facturé', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle', cancelled: 'Archivée',
  refunded: 'Remboursé', partial_refund: 'Remb. partiel',
  to_refund: 'À rembourser', allocated: 'Avoir imputé',
};

export const typeLabels: Record<string, string> = {
  particulier: 'Particulier', entreprise: 'Entreprise',
  standard: 'Facture', advance: 'Acompte', balance: 'Solde', credit: 'Avoir',
  quote: 'Devis',
};

// ============================================================
// CONFIGURATION VISUELLE DES STATUTS
// ============================================================

const statusConfig: Record<string, { text: string; bg: string; ring: string; dot: string }> = {
  active: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  inactive: { text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20', dot: 'bg-slate-400 dark:bg-slate-500' },
  archived: { text: 'text-slate-500 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/60', ring: 'ring-slate-500/10 dark:ring-slate-700/30', dot: 'bg-slate-400 dark:bg-slate-600' },
  new: { text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20', dot: 'bg-sky-500' },
  contacted: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  quote_sent: { text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-600/10 dark:ring-violet-500/20', dot: 'bg-violet-500' },
  pending: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  followup: { text: 'text-pink-700 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-500/10', ring: 'ring-pink-600/10 dark:ring-pink-500/20', dot: 'bg-pink-500' },
  won: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  lost: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  draft: { text: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20', dot: 'bg-slate-400 dark:bg-slate-500' },
  invoiced: { text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-600/10 dark:ring-violet-500/20', dot: 'bg-violet-500' },
  sent: { text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20', dot: 'bg-sky-500' },
  near_due: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  overdue: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  paid: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  partial: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  cancelled: { text: 'text-slate-500 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/60', ring: 'ring-slate-500/10 dark:ring-slate-700/30', dot: 'bg-slate-400 dark:bg-slate-600' },
  refunded: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  partial_refund: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  to_refund: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  allocated: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
};

const fallbackConfig = {
  text: 'text-slate-600 dark:text-slate-400',
  bg: 'bg-slate-100 dark:bg-slate-500/10',
  ring: 'ring-slate-500/10 dark:ring-slate-500/20',
  dot: 'bg-slate-400',
};

// ============================================================
// TONS POUR DOTLABEL
// ============================================================

const toneMap: Record<DotTone, { text: string; dot: string; bg?: string; ring?: string }> = {
  sky: { text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-400 dark:bg-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20' },
  teal: { text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-400 dark:bg-teal-500', bg: 'bg-teal-50 dark:bg-teal-500/10', ring: 'ring-teal-600/10 dark:ring-teal-500/20' },
  violet: { text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-400 dark:bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-600/10 dark:ring-violet-500/20' },
  amber: { text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400 dark:bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400 dark:bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20' },
  rose: { text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-400 dark:bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20' },
  orange: { text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-400 dark:bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20' },
  slate: { text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400 dark:bg-slate-500', bg: 'bg-slate-50 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20' },
  pink: { text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-400 dark:bg-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10', ring: 'ring-pink-600/10 dark:ring-pink-500/20' },
  indigo: { text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-400 dark:bg-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', ring: 'ring-indigo-600/10 dark:ring-indigo-500/20' },
  red: { text: 'text-red-600 dark:text-red-400', dot: 'bg-red-400 dark:bg-red-500', bg: 'bg-red-50 dark:bg-red-500/10', ring: 'ring-red-600/10 dark:ring-red-500/20' },
};

export const typeTones: Record<string, DotTone> = {
  entreprise: 'sky', particulier: 'teal',
  standard: 'violet', advance: 'sky', balance: 'teal', credit: 'rose',
  quote: 'indigo',
};

// ============================================================
// HELPERS DE MAPPING
// ============================================================

export const mapInvoiceStatusToShared = (status: string, type?: string, creditStatus?: string): string => {
  if (type === 'credit' && creditStatus) return creditStatus;
  return status;
};

export const toEntity = (item: any): Entity => {
  if (!item) return { type: 'particulier' };
  if (item.clientName && !item.firstName) {
    return { type: 'entreprise', companyName: item.clientName, email: item.clientEmail, phone: item.clientPhone };
  }
  return {
    type: item.type || 'particulier', firstName: item.firstName, lastName: item.lastName,
    companyName: item.companyName, email: item.email, phone: item.phone,
  };
};

export const formatDate = (d?: string | null): string => {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return '-'; }
};

// ============================================================
// COMPOSANTS UI DE BASE
// ============================================================

export const StatusIndicator = ({ status }: { status: string }) => {
  const config = statusConfig[status] || fallbackConfig;
  const label = statusLabels[status] || status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap ring-1 ring-inset ${config.bg} ${config.text} ${config.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {label}
    </span>
  );
};

export const DotLabel = ({ label, tone = 'slate' }: { label: string; tone?: DotTone }) => {
  const config = toneMap[tone] || toneMap.slate;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {label}
    </span>
  );
};

export const TypeLabel = ({ type }: { type: string }) => (
  <DotLabel label={typeLabels[type] || type} tone={typeTones[type] || 'slate'} />
);

export const Avatar = ({ client, size = 'md' }: { client: Entity; size?: 'sm' | 'md' | 'lg' }) => {
  const initials = client.type === 'entreprise'
    ? (client.companyName?.charAt(0) || 'E').toUpperCase()
    : ((client.firstName?.charAt(0) || '') + (client.lastName?.charAt(0) || '')).toUpperCase() || '?';
  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-xs', lg: 'w-11 h-11 text-sm' }[size];
  return (
    <div className={`flex-shrink-0 ${sizeClasses} rounded-full bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-100 dark:ring-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-semibold`}>
      {initials}
    </div>
  );
};

export const StatCell = ({
  value, trend, label, sublabel, active, onClick,
}: {
  value: ReactNode; trend?: number; label: string; sublabel?: string; active?: boolean; onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="relative bg-white dark:bg-slate-900 px-4 py-3 text-left transition-colors duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 focus:outline-none w-full border-r border-slate-200 dark:border-slate-800 last:border-r-0 group"
  >
    <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white tabular-nums group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{value}</span>
      {typeof trend === 'number' && (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
          {trend > 0 ? <TrendingUp size={10} strokeWidth={2.5} /> : trend < 0 ? <TrendingDown size={10} strokeWidth={2.5} /> : <Minus size={10} />}
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mt-0.5">{label}</p>
    {sublabel && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{sublabel}</p>}
    {active && <span className="absolute left-4 right-4 bottom-0 h-[2px] rounded-full bg-slate-900 dark:bg-white" />}
  </button>
);

// ============================================================
// COMPOSANTS RÉUTILISABLES
// ============================================================

export const EmptyState = ({
  icon: Icon = Inbox, title, description, action, tone = 'slate',
}: {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title: string; description?: string; action?: ReactNode;
  tone?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber';
}) => {
  const iconToneMap: Record<string, string> = {
    slate: 'text-slate-400 dark:text-slate-500',
    indigo: 'text-indigo-400 dark:text-indigo-500',
    emerald: 'text-emerald-400 dark:text-emerald-500',
    rose: 'text-rose-400 dark:text-rose-500',
    amber: 'text-amber-400 dark:text-amber-500',
  };
  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200 dark:ring-slate-700">
        <Icon size={32} className={iconToneMap[tone]} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export const Modal = ({
  open, onClose, title, icon, children, footer, maxWidth = 'sm:max-w-md', closeOnBackdrop = true,
}: {
  open: boolean; onClose: () => void; title: string; icon?: ReactNode;
  children: ReactNode; footer?: ReactNode; maxWidth?: string; closeOnBackdrop?: boolean;
}): ReactElement | null => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-300 ring-1 ring-black/5 dark:ring-white/10`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            {icon}<span>{title}</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 rounded-b-2xl flex-shrink-0 backdrop-blur-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const PageHeader = ({
  icon: Icon, iconColor = 'purple', title, description, action, currency, currencySymbol,
}: {
  icon?: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconColor?: 'purple' | 'sky' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'violet' | 'cyan' | 'slate';
  title: string; description?: ReactNode; action?: ReactNode; currency?: string; currencySymbol?: string;
}) => {
  const colorMap: Record<string, { bg: string; ring: string; text: string }> = {
    purple: { bg: 'bg-purple-50 dark:bg-purple-500/10', ring: 'ring-purple-100 dark:ring-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
    sky: { bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-100 dark:ring-sky-500/20', text: 'text-sky-600 dark:text-sky-400' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-100 dark:ring-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-100 dark:ring-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-100 dark:ring-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10', ring: 'ring-indigo-100 dark:ring-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
    violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-100 dark:ring-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
    cyan: { bg: 'bg-cyan-50 dark:bg-cyan-500/10', ring: 'ring-cyan-100 dark:ring-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-500/10', ring: 'ring-slate-200 dark:ring-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
  };
  const colors = colorMap[iconColor] || colorMap.purple;
  return (
    <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={`w-10 h-10 rounded-xl ${colors.bg} ring-1 ring-inset ${colors.ring} flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={colors.text} strokeWidth={2} />
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
              {(description || (currency && currencySymbol)) && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {description}
                  {currency && currencySymbol && (
                    <> <span className="mx-1.5 text-slate-300 dark:text-slate-600">•</span> Devise : <strong className={colors.text}>{currencySymbol} {currency}</strong></>
                  )}
                </p>
              )}
            </div>
          </div>
          {action && <div className="flex items-center gap-2.5">{action}</div>}
        </div>
      </div>
    </header>
  );
};

export const TabButton = ({
  active, onClick, children, count, color = 'purple',
}: {
  active: boolean; onClick: () => void; children: ReactNode; count?: number;
  color?: 'purple' | 'cyan' | 'indigo' | 'emerald';
}) => {
  const colorMap = {
    purple: { active: 'border-purple-600 text-purple-600 dark:text-purple-400' },
    cyan: { active: 'border-cyan-600 text-cyan-600 dark:text-cyan-400' },
    indigo: { active: 'border-indigo-600 text-indigo-600 dark:text-indigo-400' },
    emerald: { active: 'border-emerald-600 text-emerald-600 dark:text-emerald-400' },
  };
  const activeClass = colorMap[color].active;
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${active ? activeClass : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
    >
      {children}
      {typeof count === 'number' && <span className="ml-1.5 text-xs text-slate-400 tabular-nums">({count})</span>}
    </button>
  );
};

// ============================================================
// ACTION MENU (VERSION PREMIUM)
// ============================================================

export interface ActionMenuItemProps {
  onClick: (e?: React.MouseEvent) => void;
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

export const ActionMenuItem = ({
  onClick, icon: Icon, label, danger = false, disabled = false,
}: ActionMenuItemProps) => {
  return (
    <button
      role="menuitem"
      onClick={(e) => { e?.stopPropagation(); onClick(e); }}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-left 
        transition-all duration-150 rounded-md mx-1 my-0.5
        ${disabled 
          ? 'opacity-50 cursor-not-allowed text-slate-400 dark:text-slate-500' 
          : danger 
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300' 
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }
        focus:outline-none focus:ring-2 focus:ring-purple-500/20
      `}
    >
      {Icon && <Icon size={16} className="flex-shrink-0" />}
      <span className="truncate flex-1">{label}</span>
    </button>
  );
};

export const ActionMenu = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        aria-expanded={isOpen} aria-haspopup="true"
        className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
        aria-label="Ouvrir le menu d'actions"
      >
        <MoreHorizontal size={18} className="transition-transform duration-200" />
      </button>

      {isOpen && (
        <div 
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 ring-1 ring-black/5 dark:ring-white/10 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200"
        >
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPOSANTS UI/UX
// ============================================================

export const TypeTabs = ({
  tabs, activeTab, onTabChange, color = 'purple',
}: {
  tabs: Array<{ key: string; label: string; count: number }>;
  activeTab: string; onTabChange: (key: string) => void;
  color?: 'purple' | 'cyan' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet';
}) => {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-600 text-white shadow-lg shadow-purple-500/20',
    cyan: 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20',
    indigo: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20',
    emerald: 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20',
    rose: 'bg-rose-600 text-white shadow-lg shadow-rose-500/20',
    amber: 'bg-amber-600 text-white shadow-lg shadow-amber-500/20',
    violet: 'bg-violet-600 text-white shadow-lg shadow-violet-500/20',
  };
  const activeClass = colorMap[color] || colorMap.purple;
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            activeTab === tab.key
              ? activeClass
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          {tab.label}
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${
            activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
};

export const SearchFilter = ({
  value, onChange, placeholder = 'Rechercher...', shortcut = 'Ctrl K', inputRef,
}: {
  value: string; onChange: (value: string) => void; placeholder?: string; shortcut?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) => (
  <div className="relative flex-1">
    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      ref={inputRef}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-10 pr-16 py-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none text-sm transition-all duration-200 placeholder:text-slate-400"
    />
    {shortcut && (
      <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 pointer-events-none">
        <kbd className="h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 flex">
          {shortcut}
        </kbd>
      </div>
    )}
  </div>
);

export const SelectFilter = ({
  value, onChange, options, placeholder = 'Tous', icon: Icon = Filter,
}: {
  value: string; onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>; placeholder?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}) => (
  <div className="relative sm:w-48 flex-1">
    <Icon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-10 pr-8 py-2.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none text-sm bg-white dark:bg-slate-900 appearance-none cursor-pointer transition-all duration-200"
    >
      <option value="all">{placeholder}</option>
      {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
    <ChevronLeft size={14} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-[-90deg] text-slate-400 pointer-events-none" />
  </div>
);

export const DataTable = ({ 
  children, loading = false, headers 
}: { 
  children: ReactNode; loading?: boolean; 
  headers?: { label: string; align?: 'left' | 'right' | 'center', width?: string }[] 
}) => {
  const defaultHeaders = [
    { label: 'Facture', align: 'left' }, { label: 'Client', align: 'left' },
    { label: 'Dates', align: 'left' }, { label: 'Montants', align: 'right' },
    { label: 'Statut', align: 'left' }, { label: '', align: 'right', width: 'w-12' },
  ];
  const cols = headers || defaultHeaders;

  return (
    <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible relative">
      <table className="w-full">
        <thead className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl relative z-0">
          <tr>
            {cols.map((col, i) => (
              <th key={i} className={`text-${col.align || 'left'} px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${col.width || ''}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 relative z-10">
          {loading ? <><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></> : children}
        </tbody>
      </table>
    </div>
  );
};

export const MobileCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${className}`}>
    {children}
  </div>
);

export const KPIGrid = ({ children, columns = 7 }: { children: ReactNode; columns?: number }) => {
  const gridColsClass = {
    4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6',
    7: 'xl:grid-cols-7', 8: 'xl:grid-cols-8',
  }[columns] || 'xl:grid-cols-7';

  return (
    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-8">
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 ${gridColsClass} gap-px bg-slate-200/50 dark:bg-slate-800/50`}>
        {children}
      </div>
    </div>
  );
};

export const Pagination = ({
  currentPage, totalPages, onPageChange, startItem, endItem, totalItems, itemName = 'élément',
}: {
  currentPage: number; totalPages: number; onPageChange: (page: number) => void;
  startItem?: number; endItem?: number; totalItems?: number; itemName?: string;
}) => {
  if (totalPages <= 1) return null;

  const getPages = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); } 
    else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 rounded-b-xl">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {typeof startItem === 'number' && typeof endItem === 'number' && typeof totalItems === 'number' ? (
          <>Affichage de <span className="font-semibold text-slate-900 dark:text-white">{startItem}</span> à <span className="font-semibold text-slate-900 dark:text-white">{endItem}</span> sur <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> {itemName}{totalItems > 1 ? 's' : ''}</>
        ) : (<>Page <span className="font-semibold text-slate-900 dark:text-white">{currentPage}</span> sur {totalPages}</>)}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200">
          <ChevronLeft size={16} /> <span className="hidden sm:inline">Précédent</span>
        </button>
        {getPages().map((page, idx) =>
          typeof page === 'string' ? (
            <span key={`ellipsis-${idx}`} className="w-9 h-9 flex items-center justify-center text-slate-400">...</span>
          ) : (
            <button key={page} onClick={() => onPageChange(page)} className={`w-9 h-9 flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-200 ${currentPage === page ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {page}
            </button>
          )
        )}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200">
          <span className="hidden sm:inline">Suivant</span> <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

// ============================================================
// SKELETON LOADERS
// ============================================================

export const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 bg-slate-200 dark:bg-slate-800 rounded-full" /><div className="space-y-2 flex-1"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-32" /><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-24" /></div></div></td>
    <td className="px-6 py-4"><div className="space-y-2"><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-40" /><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-28" /></div></td>
    <td className="px-6 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-20" /></td>
    <td className="px-6 py-4"><div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-16" /></td>
    <td className="px-2 py-4 w-12"><div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-8 ml-auto" /></td>
  </tr>
);

export const SkeletonCard = () => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-3 flex-1"><div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full" /><div className="space-y-2 flex-1"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-32" /><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-24" /></div></div>
      <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-16" />
    </div>
    <div className="h-16 bg-slate-100 dark:bg-slate-950/50 rounded-xl mb-4" />
    <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
  </div>
);

// ============================================================
// COMPOSANTS AJOUTÉS
// ============================================================

export const Alert = ({ tone = 'info', icon: Icon, title, children, className = '' }: { tone?: 'info' | 'success' | 'warning' | 'error'; icon?: ComponentType<{ size?: number; className?: string }>; title?: string; children?: ReactNode; className?: string }) => {
  const tones = {
    info: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-800 dark:text-blue-300',
    success: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    warning: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300',
    error: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300',
  };
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${tones[tone]} ${className}`}>
      {Icon && <Icon size={18} className="flex-shrink-0 mt-0.5" />}
      <div className="flex-1 text-sm">{title && <p className="font-semibold mb-1">{title}</p>}{children}</div>
    </div>
  );
};

export const Card = ({ children, className = '', padding = true }: { children: ReactNode; className?: string; padding?: boolean }) => (
  <div className={`bg-white dark:bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow duration-300 ${padding ? 'p-4 sm:p-6' : ''} ${className}`}>
    {children}
  </div>
);

export const LegacyKpiCard = ({ label, value, color = 'blue', icon: Icon, children }: { label: string; value: ReactNode; color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'teal' | 'emerald'; icon?: ComponentType<{ size?: number; className?: string }>; children?: ReactNode }) => {
  const colors = {
    blue: 'border-blue-500 text-blue-600 dark:text-blue-400', green: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
    red: 'border-red-500 text-red-600 dark:text-red-400', orange: 'border-orange-500 text-orange-600 dark:text-orange-400',
    purple: 'border-purple-500 text-purple-600 dark:text-purple-400', teal: 'border-teal-500 text-teal-600 dark:text-teal-400',
    emerald: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-4 border-l-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">{label}</p>
        {Icon && <Icon size={20} className="hidden sm:block" />}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">{value}</p>
      {children && <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">{children}</div>}
    </div>
  );
};

export const FormField = ({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label} {required && <span className="text-red-500">*</span>}</label>
    {children}
    {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);

const inputBase = "w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:focus:border-purple-500 outline-none transition-all duration-200 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:cursor-not-allowed";

export const Input = ({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={`${inputBase} ${className}`} {...props} />;
export const Select = ({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={`${inputBase} appearance-none cursor-pointer ${className}`} {...props}>{children}</select>;
export const Textarea = ({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={`${inputBase} resize-none ${className}`} {...props} />;

export const ViewTabs = ({ active, onChange, counts, color = 'purple' }: { active: 'active' | 'archived'; onChange: (view: 'active' | 'archived') => void; counts?: { active: number; archived: number }; color?: 'purple' | 'blue' | 'cyan' | 'green' | 'indigo' | 'teal' }) => {
  const colors = { purple: 'border-purple-600 text-purple-600 dark:text-purple-400', blue: 'border-blue-600 text-blue-600 dark:text-blue-400', cyan: 'border-cyan-600 text-cyan-600 dark:text-cyan-400', green: 'border-emerald-600 text-emerald-600 dark:text-emerald-400', indigo: 'border-indigo-600 text-indigo-600 dark:text-indigo-400', teal: 'border-teal-600 text-teal-600 dark:text-teal-400' };
  const activeClass = colors[color] || colors.purple;
  return (
    <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto">
      <button onClick={() => onChange('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${active === 'active' ? activeClass : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
        Actifs {counts && <span className="ml-1.5 text-xs text-slate-400 tabular-nums">({counts.active})</span>}
      </button>
      <button onClick={() => onChange('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${active === 'archived' ? activeClass : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
        Archivés {counts && <span className="ml-1.5 text-xs text-slate-400 tabular-nums">({counts.archived})</span>}
      </button>
    </div>
  );
};

export const ConfirmDialog = ({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', tone = 'danger', loading = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'warning' | 'info' | 'success'; loading?: boolean }) => {
  if (!open) return null;
  const tones = {
    danger: { bg: 'bg-red-100 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', btn: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-amber-100 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', btn: 'bg-amber-600 hover:bg-amber-700' },
    info: { bg: 'bg-blue-100 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700' },
    success: { bg: 'bg-emerald-100 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  };
  const t = tones[tone];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className={`w-12 h-12 ${t.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <AlertCircle size={24} className={t.text} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">{title}</h3>
          {description && <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6 leading-relaxed">{description}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200">{cancelLabel}</button>
            <button onClick={onConfirm} disabled={loading} className={`flex-1 px-4 py-2.5 text-sm font-bold text-white ${t.btn} rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50`}>
              {loading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SectionTitle = ({ children, icon: Icon, action }: { children: ReactNode; icon?: ComponentType<{ size?: number; className?: string }>; action?: ReactNode }) => (
  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
    <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
      {Icon && <Icon size={18} className="text-purple-600 dark:text-purple-400" />}
      {children}
    </h3>
    {action && <div>{action}</div>}
  </div>
);

// ============================================================
// BADGE (VERSION UNIFIÉE)
// ============================================================
export const Badge = ({ children, tone = 'slate' }: { children: React.ReactNode; tone?: string }) => {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};

// ============================================================
// TOGGLE SWITCH
// ============================================================
export const Toggle = ({ checked, onChange, disabled = false, size = 'md', color = 'indigo' }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; color?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'blue' }) => {
  const sizes = { sm: { track: 'w-9 h-5', knob: 'h-3.5 w-3.5', translate: 'translate-x-4' }, md: { track: 'w-11 h-6', knob: 'h-4 w-4', translate: 'translate-x-5' }, lg: { track: 'w-14 h-7', knob: 'h-5 w-5', translate: 'translate-x-7' } };
  const colors = { indigo: 'bg-indigo-600', emerald: 'bg-emerald-600', rose: 'bg-rose-600', amber: 'bg-amber-600', blue: 'bg-blue-600' };
  const s = sizes[size]; const activeColor = colors[color];

  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)} className={`relative inline-flex ${s.track} items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${checked ? activeColor : 'bg-slate-300 dark:bg-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="sr-only">{checked ? 'Activé' : 'Désactivé'}</span>
      <span className={`inline-block ${s.knob} transform rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-in-out ${checked ? s.translate : 'translate-x-1'}`} />
    </button>
  );
};

// ============================================================
// PROGRESS BAR
// ============================================================
export const ProgressBar = ({ value, max = 100, color = 'indigo', size = 'md', showLabel = false, animated = true }: { value: number; max?: number; color?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'blue' | 'purple'; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean; animated?: boolean }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const sizes = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
  const colors = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500', amber: 'bg-amber-500', blue: 'bg-blue-500', purple: 'bg-purple-500' };
  const sizeClass = sizes[size]; const colorClass = colors[color];

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Progression</span>
          <span className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={`w-full ${sizeClass} bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden`}>
        <div className={`${sizeClass} ${colorClass} rounded-full transition-all duration-500 ease-out`} style={{ width: `${percentage}%` }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} />
      </div>
    </div>
  );
};

// ============================================================
// SÉLECTION MULTIPLE
// ============================================================
export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }>(({ className = '', indeterminate, ...props }, ref) => {
  const innerRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (innerRef.current) innerRef.current.indeterminate = !!indeterminate; }, [indeterminate]);

  return (
    <input type="checkbox" ref={(node) => { innerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) (ref as any).current = node; }} className={`w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 dark:focus:ring-purple-600 dark:bg-slate-800 dark:checked:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 ${className}`} {...props} />
  );
});
Checkbox.displayName = 'Checkbox';

export const BulkActionBar = ({ selectedCount, onClear, actions }: { selectedCount: number; onClear: () => void; actions: ReactNode }) => {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-950/90 dark:bg-slate-900/90 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300 border border-slate-800 dark:border-slate-700 ring-1 ring-black/5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shadow-sm">{selectedCount}</div>
        <span className="text-sm font-medium text-slate-200">sélectionné(s)</span>
      </div>
      <div className="h-6 w-px bg-slate-700" />
      <div className="flex items-center gap-2">{actions}</div>
      <button onClick={onClear} className="ml-2 p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white" title="Effacer la sélection"><X size={16} /></button>
    </div>
  );
};