import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CREDENTIALS_KEY = "xtream_credentials";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface UserInfo {
  username: string;
  password: string;
  message: string;
  auth: number;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface ServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timezone: string;
  timestamp_now: number;
  time_now: string;
}

export interface AuthResponse {
  user_info: UserInfo;
  server_info: ServerInfo;
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface VodStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}

export interface Series {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

export interface EpgListing {
  id: string;
  epg_id: string;
  title: string;
  lang: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: number;
  stop_timestamp: number;
  now_playing: number;
  has_archive: number;
}

export interface VodInfo {
  info: {
    tmdb_id?: number | string;
    name?: string;
    o_name?: string;
    cover_big?: string;
    movie_image?: string;
    releasedate?: string;
    release_date?: string;
    episode_run_time?: string | number;
    youtube_trailer?: string;
    director?: string;
    actors?: string;
    cast?: string;
    description?: string;
    plot?: string;
    age?: string;
    mpaa_rating?: string;
    country?: string;
    genre?: string;
    backdrop_path?: string[] | string;
    duration_secs?: number;
    duration?: string;
    rating?: number | string;
    bitrate?: number;
  };
  movie_data: {
    stream_id: number;
    name: string;
    added: string;
    category_id: string;
    container_extension: string;
    custom_sid: string;
    direct_source: string;
  };
}

export interface SeriesInfo {
  seasons: { [key: string]: { season_number: number; name: string; cover: string }[] };
  info: Series;
  episodes: { [key: string]: Episode[] };
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image: string;
    plot: string;
    duration_secs: number;
    duration: string;
    rating: number;
  };
  custom_sid: string;
  added: string;
  season: number;
  direct_source: string;
}

class XtreamAPI {
  private credentials: XtreamCredentials | null = null;

  async loadCredentials(): Promise<XtreamCredentials | null> {
    try {
      const stored = await getItem(CREDENTIALS_KEY);
      if (stored) {
        this.credentials = JSON.parse(stored);
        return this.credentials;
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
    return null;
  }

  async saveCredentials(credentials: XtreamCredentials): Promise<void> {
    try {
      await setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
      this.credentials = credentials;
    } catch (error) {
      console.error("Error saving credentials:", error);
      throw error;
    }
  }

  async clearCredentials(): Promise<void> {
    try {
      await deleteItem(CREDENTIALS_KEY);
      this.credentials = null;
    } catch (error) {
      console.error("Error clearing credentials:", error);
    }
  }

  getCredentials(): XtreamCredentials | null {
    return this.credentials;
  }

  setCredentials(credentials: XtreamCredentials): void {
    this.credentials = credentials;
  }

  private getBaseUrl(): string {
    if (!this.credentials) throw new Error("Not authenticated");
    let url = this.credentials.serverUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url;
    }
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    return url;
  }

  private getAuthParams(): string {
    if (!this.credentials) throw new Error("Not authenticated");
    return `username=${encodeURIComponent(this.credentials.username)}&password=${encodeURIComponent(this.credentials.password)}`;
  }

  async authenticate(credentials: XtreamCredentials): Promise<AuthResponse> {
    this.credentials = credentials;
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data: AuthResponse = await response.json();
    
    if (!data.user_info || data.user_info.auth !== 1) {
      throw new Error("Invalid credentials");
    }

    await this.saveCredentials(credentials);
    return data;
  }

  async getAccountInfo(): Promise<AuthResponse> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get account info");
    return response.json();
  }

  async getLiveCategories(): Promise<Category[]> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_live_categories`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get live categories");
    return response.json();
  }

  async getLiveStreams(categoryId?: string): Promise<LiveStream[]> {
    let url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_live_streams`;
    if (categoryId) {
      url += `&category_id=${categoryId}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get live streams");
    return response.json();
  }

  async getVodCategories(): Promise<Category[]> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_vod_categories`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get VOD categories");
    return response.json();
  }

  async getVodStreams(categoryId?: string): Promise<VodStream[]> {
    let url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_vod_streams`;
    if (categoryId) {
      url += `&category_id=${categoryId}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get VOD streams");
    return response.json();
  }

  async getSeriesCategories(): Promise<Category[]> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_series_categories`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get series categories");
    return response.json();
  }

  async getSeries(categoryId?: string): Promise<Series[]> {
    let url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_series`;
    if (categoryId) {
      url += `&category_id=${categoryId}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get series");
    return response.json();
  }

  async getVodInfo(vodId: number | string): Promise<VodInfo> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_vod_info&vod_id=${vodId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get VOD info");
    return response.json();
  }

  async getSeriesInfo(seriesId: number): Promise<SeriesInfo> {
    const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_series_info&series_id=${seriesId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to get series info");
    return response.json();
  }

  getLiveStreamUrl(streamId: number): string {
    return `${this.getBaseUrl()}/live/${this.credentials?.username}/${this.credentials?.password}/${streamId}.ts`;
  }

  getVodStreamUrl(streamId: number, containerExtension: string): string {
    return `${this.getBaseUrl()}/movie/${this.credentials?.username}/${this.credentials?.password}/${streamId}.${containerExtension}`;
  }

  getSeriesStreamUrl(streamId: string, containerExtension: string): string {
    return `${this.getBaseUrl()}/series/${this.credentials?.username}/${this.credentials?.password}/${streamId}.${containerExtension}`;
  }

  async getShortEpg(streamId: number, limit = 3): Promise<EpgListing[]> {
    try {
      const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_short_epg&stream_id=${streamId}&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.epg_listings) ? data.epg_listings : [];
    } catch {
      return [];
    }
  }

  async getSimpleDataTable(streamId: number): Promise<EpgListing[]> {
    try {
      const url = `${this.getBaseUrl()}/player_api.php?${this.getAuthParams()}&action=get_simple_data_table&stream_id=${streamId}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.epg_listings) ? data.epg_listings : [];
    } catch {
      return [];
    }
  }

  getCatchupStreamUrl(streamId: number, startTimestamp: number, durationMinutes: number): string {
    const d = new Date(startTimestamp * 1000);
    // Xtream's /timeshift/ endpoint expects the date+time in the
    // panel's *server-local* timezone, not UTC. UK IPTV setups are
    // overwhelmingly hosted in the same region as their viewers, so
    // formatting with the device's local components matches the
    // server's expectation and lands on the correct broadcast slot.
    // (Using UTC here was off by the user's UTC offset — e.g. on BST
    // an 8pm tap would play the 7pm programme.)
    const yyyy = d.getFullYear();
    const MM = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const HH = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const start = `${yyyy}-${MM}-${dd}:${HH}-${mm}`;
    const u = this.credentials?.username ?? "";
    const p = this.credentials?.password ?? "";
    return `${this.getBaseUrl()}/timeshift/${u}/${p}/${durationMinutes}/${start}/${streamId}.ts`;
  }
}

export const xtreamApi = new XtreamAPI();
