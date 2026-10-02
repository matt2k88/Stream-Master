// Every word shown on a player control, in one place.
//
// These were previously typed inline in three screens, which is how the same
// control ended up called "CC" in one place and "Audio" with a different icon
// in another. Changing a name here changes it on live, movies and series at
// once.
export const PlayerLabels = {
  /** "CC" is US broadcast jargon for closed captions, which also describe sound
   *  effects. What this app actually lists is subtitle tracks. */
  subtitles: "Subtitles",

  /** NOTE: "Language" reads better than "Audio" and is right nearly always,
   *  because alternate audio tracks are usually other languages. It is wrong
   *  when a title carries the same language twice in different formats (an
   *  English 5.1 and an English stereo), which does happen on IPTV VOD. If that
   *  turns out to be common in the library, change this one line back to
   *  "Audio" and every screen follows. */
  audio: "Language",

  aspect: "Aspect Ratio",
  guide: "Guide",

  channelUp: "Ch Up",
  channelDown: "Ch Down",

  live: "LIVE",
  upNext: "UP NEXT",

  playNow: "Play Now",
  cancel: "Cancel",

  /** Subtitles can be switched off; audio cannot. */
  off: "Off",
} as const;
