// src/hooks/usePaginatedQuery.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import type { Query, Models } from 'appwrite';

/**
 * Hook de pagination serveur pour les collections Appwrite.
 * Charge les documents par lots pour éviter de charger 2500+ docs d'un coup.
 */
export interface PaginatedQueryOptions<T extends Models.Document> {
  collectionId: string;
  queries?: Query[];
  pageSize?: number;
  enabled?: boolean;
  teamId?: string | null;
}

export interface PaginatedQueryResult<T extends Models.Document> {
  documents: T[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  total: number;
  loadMore: () => void;
  reload: () => void;
}

export function usePaginatedQuery<T extends Models.Document = Models.Document>(
  options: PaginatedQueryOptions<T>
): PaginatedQueryResult<T> {
  const {
    collectionId,
    queries = [],
    pageSize = 50,
    enabled = true,
    teamId,
  } = options;

  const [documents, setDocuments] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  // Ref pour éviter les requêtes concurrentes
  const isLoadingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadPage = useCallback(async (currentOffset: number, append: boolean) => {
    if (!enabled || isLoadingRef.current) return;

    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Construire les requêtes avec pagination
      const allQueries = [
        ...queries,
        Query.limit(pageSize),
        Query.offset(currentOffset),
      ];

      // Ajouter le filtre teamId si fourni
      if (teamId) {
        allQueries.unshift(Query.equal('teamId', teamId));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        collectionId,
        allQueries
      );

      if (!mountedRef.current) return;

      const newDocs = response.documents as T[];

      setDocuments(prev => append ? [...prev, ...newDocs] : newDocs);
      setTotal(response.total);
      setHasMore(newDocs.length === pageSize);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        isLoadingRef.current = false;
      }
    }
  }, [collectionId, queries, pageSize, enabled, teamId]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      const newOffset = offset + pageSize;
      setOffset(newOffset);
      loadPage(newOffset, true);
    }
  }, [hasMore, loading, offset, pageSize, loadPage]);

  const reload = useCallback(() => {
    setOffset(0);
    setHasMore(true);
    setDocuments([]);
    loadPage(0, false);
  }, [loadPage]);

  // Chargement initial
  useEffect(() => {
    mountedRef.current = true;
    if (enabled && teamId) {
      reload();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, teamId, collectionId]);

  return {
    documents,
    loading,
    error,
    hasMore,
    total,
    loadMore,
    reload,
  };
}

/**
 * Hook simplifié : charge TOUS les documents par lots (pour migration progressive).
 * À terme, remplacer par usePaginatedQuery avec bouton "Charger plus".
 */
export function useAllDocumentsPaginated<T extends Models.Document = Models.Document>(
  options: Omit<PaginatedQueryOptions<T>, 'pageSize'> & { pageSize?: number }
): { documents: T[]; loading: boolean; error: Error | null; total: number; reload: () => void } {
  const { pageSize = 100, ...rest } = options;
  const { documents, loading, error, hasMore, loadMore, reload, total } = usePaginatedQuery<T>({
    ...rest,
    pageSize,
  });

  // Auto-charger toutes les pages
  useEffect(() => {
    if (hasMore && !loading) {
      const timer = setTimeout(() => loadMore(), 50);
      return () => clearTimeout(timer);
    }
  }, [hasMore, loading, loadMore]);

  return { documents, loading, error, total, reload };
}