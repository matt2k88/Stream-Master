import type { VodStream } from "@/lib/xtream-api";

export const CINEMA_CATEGORY_ID = "cinema-releases";
export const cinemaHistoryId = (id: string) => `cinema:${id}`;
export const cinemaIdFromHistory = (id?: string | null) =>
  id?.startsWith("cinema:") ? id.slice(7) : null;

export interface CinemaMovie extends VodStream {
  cinemaId: string;
  videoUrl: string;
}

// Existing movie cards/favourites expect a numeric ID. History uses the full
// UUID instead, so playback progress cannot collide with provider streams.
export function cinemaNumericId(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return -(1 + ((hash >>> 0) % 2147483646));
}

export function toCinemaMovie(row: {
  id: string;
  title: string;
  cover_url: string;
  vod_link: string;
  created_at: string;
}): CinemaMovie {
  return {
    cinemaId: row.id,
    videoUrl: row.vod_link,
    stream_id: cinemaNumericId(row.id),
    name: row.title,
    stream_icon: row.cover_url,
    category_id: CINEMA_CATEGORY_ID,
    container_extension: "mp4",
    stream_type: "movie",
    num: 0,
    rating: "",
    rating_5based: 0,
    added: String(Math.floor(Date.parse(row.created_at) / 1000) || 0),
    custom_sid: "",
    direct_source: "",
  };
}