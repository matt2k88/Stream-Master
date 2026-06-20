export interface MusicTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string;
  searchKey: string;
}

export interface MusicPlaylist {
  id: string;
  profileId: string;
  name: string;
  isLikedSongs: boolean;
  trackCount: number;
  updatedAt: string;
}

export interface MusicPlaylistTrack {
  id: string;
  playlistId: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  thumbnail: string;
  searchKey: string;
  position: number;
  addedAt: string;
}
