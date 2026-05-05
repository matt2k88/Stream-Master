import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";

export interface Favourite {
  id: string;
  profile_id: string;
  stream_id: number;
  stream_type: "live" | "movies" | "series";
  stream_name: string;
  stream_icon: string | null;
  category_id: string | null;
  created_at: string;
}

interface ToggleParams {
  streamId: number;
  streamType: "live" | "movies" | "series";
  streamName: string;
  streamIcon?: string | null;
  categoryId?: string | null;
}

interface FavouritesContextType {
  favourites: Favourite[];
  isLoading: boolean;
  isFavourite: (streamId: number, streamType: string) => boolean;
  toggleFavourite: (params: ToggleParams) => Promise<void>;
  getFavouritesByType: (type: "live" | "movies" | "series") => Favourite[];
}

const FavouritesContext = createContext<FavouritesContextType | undefined>(undefined);

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (profileId: string) => {
    setIsLoading(true);
    try {
      const url = new URL("/api/favourites", getApiUrl());
      url.searchParams.set("profile_id", profileId);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setFavourites(data);
      }
    } catch {
      // silent — favourites are non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeProfile?.id) {
      load(activeProfile.id);
    } else {
      setFavourites([]);
    }
  }, [activeProfile?.id]);

  const isFavourite = useCallback(
    (streamId: number, streamType: string) =>
      favourites.some((f) => f.stream_id === streamId && f.stream_type === streamType),
    [favourites]
  );

  const toggleFavourite = useCallback(
    async (params: ToggleParams) => {
      if (!activeProfile?.id) return;
      const { streamId, streamType, streamName, streamIcon, categoryId } = params;
      const existing = favourites.find((f) => f.stream_id === streamId && f.stream_type === streamType);

      if (existing) {
        // Optimistic remove
        setFavourites((prev) => prev.filter((f) => f.id !== existing.id));
        try {
          const url = new URL(`/api/favourites/${existing.id}`, getApiUrl());
          await fetch(url.toString(), { method: "DELETE" });
        } catch {
          // Revert on error
          setFavourites((prev) => [...prev, existing]);
        }
      } else {
        // Optimistic add (temp id)
        const temp: Favourite = {
          id: `temp-${streamId}-${streamType}`,
          profile_id: activeProfile.id,
          stream_id: streamId,
          stream_type: streamType,
          stream_name: streamName,
          stream_icon: streamIcon ?? null,
          category_id: categoryId ?? null,
          created_at: new Date().toISOString(),
        };
        setFavourites((prev) => [...prev, temp]);
        try {
          const url = new URL("/api/favourites", getApiUrl());
          const res = await fetch(url.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile_id: activeProfile.id,
              stream_id: streamId,
              stream_type: streamType,
              stream_name: streamName,
              stream_icon: streamIcon ?? null,
              category_id: categoryId ?? null,
            }),
          });
          if (res.ok) {
            const saved = await res.json();
            // Replace temp with real record
            setFavourites((prev) =>
              prev.map((f) => (f.id === temp.id ? saved : f))
            );
          } else {
            // Revert
            setFavourites((prev) => prev.filter((f) => f.id !== temp.id));
          }
        } catch {
          setFavourites((prev) => prev.filter((f) => f.id !== temp.id));
        }
      }
    },
    [activeProfile?.id, favourites]
  );

  const getFavouritesByType = useCallback(
    (type: "live" | "movies" | "series") =>
      favourites.filter((f) => f.stream_type === type),
    [favourites]
  );

  return (
    <FavouritesContext.Provider
      value={{ favourites, isLoading, isFavourite, toggleFavourite, getFavouritesByType }}
    >
      {children}
    </FavouritesContext.Provider>
  );
}

export function useFavourites() {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error("useFavourites must be used within FavouritesProvider");
  return ctx;
}
