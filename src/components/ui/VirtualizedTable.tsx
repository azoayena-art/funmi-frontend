// src/components/ui/VirtualizedTable.tsx
import { FixedSizeList as List } from 'react-window';
import { useMemo, useRef, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface VirtualizedTableProps<T> {
  items: T[];
  rowHeight: number;
  header: ReactNode;
  renderRow: (item: T, index: number, style: React.CSSProperties) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  overscan?: number;
}

export default function VirtualizedTable<T>({
  items,
  rowHeight,
  header,
  renderRow,
  emptyState,
  className = '',
  overscan = 5,
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // Calculer la hauteur disponible dynamiquement
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Hauteur viewport - position actuelle - padding
        const availableHeight = window.innerHeight - rect.top - 100;
        setContainerHeight(Math.max(400, availableHeight));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const Row = useMemo(() => {
    return ({ index, style }: { index: number; style: React.CSSProperties }) => {
      return renderRow(items[index], index, style);
    };
  }, [items, renderRow]);

  if (items.length === 0) {
    return <>{emptyState || <div className="p-8 text-center text-slate-500">Aucun élément</div>}</>;
  }

  return (
    <div ref={containerRef} className={`flex flex-col ${className}`}>
      {/* Header fixe */}
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
        {header}
      </div>

      {/* Liste virtualisée */}
      <List
        height={containerHeight}
        itemCount={items.length}
        itemSize={rowHeight}
        width="100%"
        overscanCount={overscan}
      >
        {Row}
      </List>
    </div>
  );
}