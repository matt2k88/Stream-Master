import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { supabase, lifetimeDb } from "./supabase";
import { CURATED_LEAGUE_IDS, fetchFixtureDetail, fetchTeamUpcomingFixtures, searchTeams } from "./football";

// ── Server-side in-memory cache ───────────────────────────────────────────────
// Reduces Supabase egress for high-frequency polling endpoints.
// Works for ALL app versions — no client update required.
interface CacheEntry { data: any; expiresAt: number; }
const _cache = new Map<string, CacheEntry>();

// ── Avatar upload tokens ──────────────────────────────────────────────────────
interface AvatarToken { profileId: string; ready: boolean; imageData?: string; expiresAt: number }
const _avatarTokens = new Map<string, AvatarToken>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _avatarTokens.entries()) if (v.expiresAt < now) _avatarTokens.delete(k);
}, 5 * 60_000);

const AVATAR_UPLOAD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Avatar Upload — Ultra Cast</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#090909;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100dvh;display:flex;flex-direction:column;align-items:center;overflow:hidden}
header{width:100%;padding:14px 20px 10px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:10px}
header h1{font-size:18px;font-weight:800;color:#FF6600}
header p{font-size:11px;color:#555;margin-top:2px}
#landing{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:20px;padding:28px}
#cropWrap{display:none;flex-direction:column;align-items:center;flex:1;width:100%;padding:12px 16px 16px;gap:14px}
.crop-hint{font-size:12px;color:#555;text-align:center}
#cropCanvas{border-radius:50%;touch-action:none;cursor:grab;display:block}
#cropCanvas:active{cursor:grabbing}
.zoom-row{display:flex;align-items:center;gap:10px;width:100%}
.zoom-row button{background:none;border:none;color:#777;font-size:22px;cursor:pointer;padding:4px 8px;line-height:1}
input[type=range]{flex:1;accent-color:#FF6600;height:4px}
.btn{padding:14px 24px;border-radius:14px;font-size:15px;font-weight:700;border:none;cursor:pointer;width:100%}
.btn-primary{background:linear-gradient(135deg,#FF8C1A,#FF5500);color:#fff;box-shadow:0 4px 20px rgba(255,102,0,0.35)}
.btn-secondary{background:#1a1a1a;color:#aaa;border:1px solid #2a2a2a;margin-top:2px}
.btn:active{opacity:0.82}
#loadingWrap{display:none;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px}
.spinner{width:44px;height:44px;border:3px solid #1e1e1e;border-top-color:#FF6600;border-radius:50%;animation:spin 0.75s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#successWrap{display:none;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:18px;padding:28px;text-align:center}
.success-ring{width:76px;height:76px;border-radius:50%;background:rgba(255,102,0,0.12);border:2px solid #FF6600;display:flex;align-items:center;justify-content:center}
.success-ring svg{width:36px;height:36px}
input[type=file]{display:none}
.pick-icon{width:90px;height:90px;border-radius:50%;background:rgba(255,102,0,0.08);border:2px solid rgba(255,102,0,0.4);display:flex;align-items:center;justify-content:center}
</style>
</head>
<body>
<header>
  <div>
    <h1>Ultra Cast</h1>
    <p>Profile Avatar Upload</p>
  </div>
</header>

<div id="landing">
  <div class="pick-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="#FF6600" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="44" height="44">
      <circle cx="12" cy="12" r="3.5"/><path d="M2 12.5V17a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4.5M9 5h1.5L12 3l1.5 2H15a2 2 0 0 1 2 2v1H7V7a2 2 0 0 1 2-2Z"/>
    </svg>
  </div>
  <div style="text-align:center;max-width:280px">
    <p style="font-size:19px;font-weight:700;margin-bottom:8px">Choose a photo</p>
    <p style="font-size:13px;color:#666;line-height:1.5">Select a photo from your gallery or take one with your camera. You can crop it to fit your avatar circle.</p>
  </div>
  <button class="btn btn-primary" onclick="fileInput.click()">Choose Photo</button>
  <input type="file" id="fileInput" accept="image/*">
</div>

<div id="cropWrap">
  <p class="crop-hint">Drag to reposition &nbsp;·&nbsp; Pinch or slide to zoom</p>
  <canvas id="cropCanvas"></canvas>
  <div class="zoom-row">
    <button onclick="adjustZoom(-0.1)">−</button>
    <input type="range" id="zoomSlider" min="0.1" max="4" step="0.005" value="1">
    <button onclick="adjustZoom(0.1)">+</button>
  </div>
  <button class="btn btn-primary" onclick="uploadCrop()">Use this photo</button>
  <button class="btn btn-secondary" onclick="fileInput.click()">Choose a different photo</button>
</div>

<div id="loadingWrap"><div class="spinner"></div><p style="color:#555;font-size:14px">Uploading photo...</p></div>

<div id="successWrap">
  <div class="success-ring">
    <svg viewBox="0 0 24 24" fill="none" stroke="#FF6600" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </div>
  <p style="font-size:22px;font-weight:800">Photo uploaded!</p>
  <p style="font-size:14px;color:#666;line-height:1.6">Your new avatar is ready.<br>You can close this page.</p>
</div>

<script>
const TOKEN = location.pathname.split('/').filter(Boolean).pop();
let img = null, scale = 1, panX = 0, panY = 0, fitScale = 1;
const canvas = document.getElementById('cropCanvas');
const ctx = canvas.getContext('2d');
const zoomSlider = document.getElementById('zoomSlider');
const fileInput = document.getElementById('fileInput');

function computeSize() {
  const s = Math.min(Math.floor(window.innerWidth * 0.78), 340);
  return s % 2 === 0 ? s : s - 1;
}

let SIZE = computeSize();
canvas.width = SIZE;
canvas.height = SIZE;
canvas.style.width = SIZE + 'px';
canvas.style.height = SIZE + 'px';

fileInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    img = new Image();
    img.onload = function() {
      fitScale = Math.max(SIZE / img.width, SIZE / img.height);
      scale = fitScale;
      panX = 0; panY = 0;
      zoomSlider.min = fitScale;
      zoomSlider.max = fitScale * 6;
      zoomSlider.step = fitScale * 0.005;
      zoomSlider.value = scale;
      document.getElementById('landing').style.display = 'none';
      document.getElementById('cropWrap').style.display = 'flex';
      draw();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function draw() {
  if (!img) return;
  ctx.clearRect(0, 0, SIZE, SIZE);
  const cx = SIZE/2 + panX, cy = SIZE/2 + panY;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE/2, SIZE/2, SIZE/2, 0, Math.PI*2);
  ctx.clip();
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(SIZE/2, SIZE/2, SIZE/2 - 1.5, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,102,0,0.65)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

zoomSlider.addEventListener('input', function() {
  scale = parseFloat(this.value);
  clampPan(); draw();
});

function adjustZoom(delta) {
  scale = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), scale + fitScale * delta * 2));
  zoomSlider.value = scale;
  clampPan(); draw();
}

let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  panX += e.clientX - lastX; panY += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  clampPan(); draw();
});

let touchLast = null, pinchDist0 = null, scale0 = 1;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    pinchDist0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    scale0 = scale;
  }
  touchLast = e.touches[0];
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && pinchDist0) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    scale = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), scale0 * d / pinchDist0));
    zoomSlider.value = scale;
  } else if (touchLast && e.touches.length === 1) {
    panX += e.touches[0].clientX - touchLast.clientX;
    panY += e.touches[0].clientY - touchLast.clientY;
  }
  touchLast = e.touches[0];
  clampPan(); draw();
}, { passive: false });
canvas.addEventListener('touchend', () => { touchLast = null; pinchDist0 = null; });

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  scale = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), scale * (e.deltaY < 0 ? 1.06 : 0.94)));
  zoomSlider.value = scale;
  clampPan(); draw();
}, { passive: false });

function clampPan() {
  if (!img) return;
  const hw = img.width * scale / 2, hh = img.height * scale / 2, r = SIZE/2;
  panX = Math.max(r - hw, Math.min(hw - r, panX));
  panY = Math.max(r - hh, Math.min(hh - r, panY));
}

async function uploadCrop() {
  if (!img) return;
  const OUT = 320;
  const ratio = OUT / SIZE;
  const off = document.createElement('canvas');
  off.width = OUT; off.height = OUT;
  const oc = off.getContext('2d');
  oc.save();
  oc.beginPath();
  oc.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI*2);
  oc.clip();
  const w = img.width * scale * ratio, h = img.height * scale * ratio;
  oc.drawImage(img, OUT/2 + panX*ratio - w/2, OUT/2 + panY*ratio - h/2, w, h);
  oc.restore();
  const imageData = off.toDataURL('image/jpeg', 0.88);

  document.getElementById('cropWrap').style.display = 'none';
  document.getElementById('loadingWrap').style.display = 'flex';

  try {
    const res = await fetch('/api/avatar-upload/' + TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData })
    });
    if (!res.ok) throw new Error();
    document.getElementById('loadingWrap').style.display = 'none';
    document.getElementById('successWrap').style.display = 'flex';
  } catch {
    document.getElementById('loadingWrap').style.display = 'none';
    document.getElementById('cropWrap').style.display = 'flex';
    alert('Upload failed — please try again.');
  }
}
</script>
</body>
</html>`;
function cacheGet(key: string): any | null {
  const e = _cache.get(key);
  if (!e || Date.now() > e.expiresAt) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key: string, data: any, ttlMs: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
function cacheDel(key: string): void { _cache.delete(key); }
// ─────────────────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Servers ──────────────────────────────────────────────────────────────
  app.get("/api/servers", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("server")
        .select("id, name, url")
        .order("name");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  // ── Profiles ──────────────────────────────────────────────────────────────
  app.get("/api/profiles", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("account_username", username)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch profiles" });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    const { account_username, name, avatar_icon, avatar_color, pin } = req.body;
    if (!account_username || !name) {
      return res.status(400).json({ error: "account_username and name required" });
    }
    try {
      // Enforce 10 profile limit
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("account_username", account_username);
      if ((count ?? 0) >= 10) {
        return res.status(400).json({ error: "Maximum 10 profiles per account" });
      }
      const { data, error } = await supabase
        .from("profiles")
        .insert({ account_username, name, avatar_icon: avatar_icon ?? "user", avatar_color: avatar_color ?? "#FF6600", pin: pin ?? null })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.put("/api/profiles/:id", async (req, res) => {
    const { id } = req.params;
    const { name, avatar_icon, avatar_color, avatar_image, pin, player_vod, player_live, player_hw_decode, player_buffer_ms, private_viewing } = req.body;
    try {
      // Build a partial update so callers (e.g. PlayerSettingsScreen)
      // can patch only the fields they care about.
      const patch: Record<string, any> = {};
      if (name !== undefined) patch.name = name;
      if (avatar_icon !== undefined) patch.avatar_icon = avatar_icon;
      if (avatar_color !== undefined) patch.avatar_color = avatar_color;
      if (avatar_image !== undefined) patch.avatar_image = avatar_image ?? null;
      if (pin !== undefined) patch.pin = pin ?? null;
      if (player_vod !== undefined) {
        if (player_vod !== "vlc" && player_vod !== "expo") {
          return res.status(400).json({ error: "player_vod must be 'vlc' or 'expo'" });
        }
        patch.player_vod = player_vod;
      }
      if (player_live !== undefined) {
        if (player_live !== "vlc" && player_live !== "expo") {
          return res.status(400).json({ error: "player_live must be 'vlc' or 'expo'" });
        }
        patch.player_live = player_live;
      }
      if (player_hw_decode !== undefined) {
        if (
          player_hw_decode !== "auto" &&
          player_hw_decode !== "on" &&
          player_hw_decode !== "off"
        ) {
          return res
            .status(400)
            .json({ error: "player_hw_decode must be 'auto', 'on' or 'off'" });
        }
        patch.player_hw_decode = player_hw_decode;
      }
      if (player_buffer_ms !== undefined) {
        const bms = Number(player_buffer_ms);
        if (!Number.isInteger(bms) || bms < 1000 || bms > 60000) {
          return res.status(400).json({ error: "player_buffer_ms must be an integer between 1000 and 60000" });
        }
        patch.player_buffer_ms = bms;
      }
      if (private_viewing !== undefined) {
        patch.private_viewing = !!private_viewing;
      }
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.delete("/api/profiles/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  // ── Avatar photo upload (QR-code flow) ────────────────────────────────────

  // Step 1: app requests a short-lived token for a profile
  app.post("/api/avatar-token", async (req, res) => {
    const { profileId } = req.body ?? {};
    if (!profileId) return res.status(400).json({ error: "profileId required" });
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    _avatarTokens.set(token, { profileId, ready: false, expiresAt: Date.now() + 10 * 60_000 });
    const forwarded = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
    const proto = ((req.headers["x-forwarded-proto"] as string) ?? "").split(",")[0].trim() || (req.secure ? "https" : "http");
    const uploadUrl = `${proto}://${forwarded}/avatar-upload/${token}`;
    // Shorten the URL so the underlying host is not visible in the QR code
    let qrUrl = uploadUrl;
    const shorteners = [
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(uploadUrl)}`,
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(uploadUrl)}`,
    ];
    for (const api of shorteners) {
      try {
        const r = await fetch(api, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const text = (await r.text()).trim();
          if (text.startsWith("http")) { qrUrl = text; break; }
        }
      } catch { /* try next */ }
    }
    res.json({ token, uploadUrl, qrUrl });
  });

  // Step 2: serve the mobile crop page
  app.get("/avatar-upload/:token", (req, res) => {
    const entry = _avatarTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(410).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Expired</title><style>body{background:#090909;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px}p{color:#666;margin-top:8px}h2{color:#FF6600}</style></head><body><div><h2>Link expired</h2><p>This upload link has expired. Please open the profile editor again to get a new QR code.</p></div></body></html>`);
    }
    if (entry.ready) {
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Done</title><style>body{background:#090909;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px}p{color:#666;margin-top:8px}h2{color:#FF6600}</style></head><body><div><h2>Already uploaded</h2><p>Your avatar photo was already uploaded. You can close this page.</p></div></body></html>`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(AVATAR_UPLOAD_HTML);
  });

  // Step 3: receive the cropped base64 image from the phone browser
  app.post("/api/avatar-upload/:token", async (req, res) => {
    const entry = _avatarTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) return res.status(410).json({ error: "Token expired" });
    const { imageData } = req.body ?? {};
    if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid image data" });
    }
    try {
      const { error } = await supabase.from("profiles").update({ avatar_image: imageData }).eq("id", entry.profileId);
      if (error) return res.status(500).json({ error: error.message });
      entry.ready = true;
      entry.imageData = imageData;
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save avatar" });
    }
  });

  // Step 4: app polls this until ready
  app.get("/api/avatar-status/:token", (req, res) => {
    const entry = _avatarTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) return res.json({ ready: false, expired: true });
    res.json({ ready: entry.ready, imageData: entry.ready ? entry.imageData : undefined });
  });

  // ── Favourites ────────────────────────────────────────────────────────────
  app.get("/api/favourites", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("favourites")
        .select("*")
        .eq("profile_id", profile_id)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch favourites" });
    }
  });

  app.post("/api/favourites", async (req, res) => {
    const { profile_id, stream_id, stream_type, stream_name, stream_icon, category_id } = req.body;
    if (!profile_id || stream_id === undefined || !stream_type) {
      return res.status(400).json({ error: "profile_id, stream_id, stream_type required" });
    }
    try {
      const { data, error } = await supabase
        .from("favourites")
        .insert({ profile_id, stream_id, stream_type, stream_name, stream_icon: stream_icon ?? null, category_id: category_id ?? null })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to add favourite" });
    }
  });

  app.delete("/api/favourites/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("favourites").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove favourite" });
    }
  });

  app.delete("/api/favourites", async (req, res) => {
    const { profile_id, stream_type } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase.from("favourites").delete().eq("profile_id", profile_id as string);
      if (stream_type) q = q.eq("stream_type", stream_type as string);
      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to clear favourites" });
    }
  });

  // ── Category Prefs (per-profile organise) ─────────────────────────────────
  app.get("/api/category-prefs", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("category_prefs")
        .select("type, order_ids, hidden_ids")
        .eq("profile_id", profile_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch category prefs" });
    }
  });

  app.put("/api/category-prefs", async (req, res) => {
    const { profile_id, type, order_ids, hidden_ids } = req.body;
    if (!profile_id || !type) {
      return res.status(400).json({ error: "profile_id and type required" });
    }
    if (!["live", "movies", "series"].includes(type)) {
      return res.status(400).json({ error: "invalid type" });
    }
    try {
      const { data, error } = await supabase
        .from("category_prefs")
        .upsert(
          {
            profile_id,
            type,
            order_ids: Array.isArray(order_ids) ? order_ids : [],
            hidden_ids: Array.isArray(hidden_ids) ? hidden_ids : [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,type" },
        )
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to save category prefs" });
    }
  });

  // ── Announcements ─────────────────────────────────────────────────────────
  app.get("/api/announcements", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("id, message")
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  });

  // ── Adverts ───────────────────────────────────────────────────────────────
  app.get("/api/adverts", async (req, res) => {
    try {
      // Full select including orientation (021), category (022), content link columns
      let { data, error } = await supabase
        .from("adverts")
        .select("id, name, image_url, orientation, category, content_type, content_id, content_name, content_icon, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      // Content columns not yet present — retry without them
      if (error && (error.code === "42703" || /content_type|content_id|content_name|content_icon|sort_order/i.test(error.message))) {
        ({ data, error } = (await supabase
          .from("adverts")
          .select("id, name, image_url, orientation, category, created_at")
          .order("created_at")) as any);
      }
      // Migration 022 not yet run — retry without category
      if (error && (error.code === "42703" || /category/i.test(error.message))) {
        ({ data, error } = (await supabase
          .from("adverts")
          .select("id, name, image_url, orientation, created_at")
          .order("created_at")) as any);
      }
      // Migration 021 not yet run — retry without orientation either
      if (error && (error.code === "42703" || /orientation/i.test(error.message))) {
        ({ data, error } = (await supabase
          .from("adverts")
          .select("id, name, image_url, created_at")
          .order("created_at")) as any);
      }
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch adverts" });
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  app.get("/api/messages", async (req, res) => {
    const { username } = req.query;
    const cacheKey = `messages:${username ?? "__all__"}`;
    const cached = cacheGet(cacheKey);
    if (cached !== null) return res.json(cached);
    try {
      let q = supabase.from("messages").select("*").order("created_at", { ascending: false });
      if (username) q = q.eq("username", username as string);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      const payload = data ?? [];
      cacheSet(cacheKey, payload, 2 * 60_000);
      res.json(payload);
    } catch {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/message-seen", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await supabase
        .from("message_seen")
        .select("message_id")
        .eq("username", username as string);
      if (error) return res.status(500).json({ error: error.message });
      res.json((data ?? []).map((r: any) => r.message_id));
    } catch {
      res.status(500).json({ error: "Failed to fetch seen messages" });
    }
  });

  app.post("/api/message-seen", async (req, res) => {
    const { message_id, username } = req.body;
    if (!message_id || !username) return res.status(400).json({ error: "message_id and username required" });
    try {
      // Upsert to avoid duplicates
      const { data, error } = await supabase
        .from("message_seen")
        .upsert({ message_id, username }, { onConflict: "message_id,username", ignoreDuplicates: true })
        .select()
        .single();
      if (error && error.code !== "23505") return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to mark message as seen" });
    }
  });

  // ── Intros ────────────────────────────────────────────────────────────────
  app.get("/api/intros", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("intros")
        .select("id, name, video_url")
        .order("created_at")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? null);
    } catch {
      res.status(500).json({ error: "Failed to fetch intro" });
    }
  });

  // ── App Version (latest release — used by "Check for Updates") ────────────
  app.get("/api/app-version", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_versions")
        .select("id, version, released_at, created_at, downloader_code")
        .order("released_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      // Keep response shape backwards-compatible with the existing client
      // (which reads `version`, `downloader_code`, and `updated_at`).
      const payload = data
        ? {
            id: data.id,
            version: data.version,
            downloader_code: data.downloader_code,
            updated_at: data.released_at ?? data.created_at,
          }
        : null;
      res.json(payload);
    } catch {
      res.status(500).json({ error: "Failed to fetch app version" });
    }
  });

  // ── App Versions (full list — used by "What's New" modal) ─────────────────
  app.get("/api/app-versions", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_versions")
        .select("id, version, released_at, created_at, downloader_code")
        .order("released_at", { ascending: false });
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch app versions" });
    }
  });

  // ── App Download Link (URL of the latest APK — used by in-app installer) ─
  // Returns the most recently-updated row from `app_download_link` and
  // exposes only the `url` field so the client can download the APK
  // straight to the device without us ever logging or echoing the link
  // outside of the install flow.
  app.get("/api/app-download-link", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_download_link")
        .select("url, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        return res.status(500).json({ error: error.message });
      }
      const url = typeof data?.url === "string" ? data.url.trim() : null;
      if (!url) return res.json({ url: null });
      // Refuse to hand a non-HTTPS URL back to the client — an in-app
      // APK installer over plain HTTP would be trivially MITM'd and
      // could result in a tampered package being installed.
      if (!/^https:\/\//i.test(url)) {
        return res.status(500).json({ error: "Download URL must be HTTPS" });
      }
      res.json({ url });
    } catch {
      res.status(500).json({ error: "Failed to fetch download link" });
    }
  });

  // ── App Theme (admin-controlled, applies to all clients on next launch) ──
  app.get("/api/app-theme", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_theme")
        .select("id, theme_key, show_top_picks_badge, updated_at")
        .eq("id", 1)
        .maybeSingle();
      // Gracefully fall back to default when table is missing (migration
      // 004 not yet applied) or no row exists, so clients always get a
      // valid theme instead of an error.
      if (error && error.code !== "PGRST116") {
        return res.json({ id: 1, theme_key: "default", show_top_picks_badge: true, updated_at: null });
      }
      res.json(data ?? { id: 1, theme_key: "default", show_top_picks_badge: true, updated_at: null });
    } catch {
      res.json({ id: 1, theme_key: "default", updated_at: null });
    }
  });

  // ── App Notes (changelog / known issues) ──────────────────────────────────
  app.get("/api/app-notes", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_notes")
        .select("id, type, text, sort_order, created_at, version_id")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch app notes" });
    }
  });

  // ── Recently Watched ──────────────────────────────────────────────────────
  app.get("/api/recently-watched", async (req, res) => {
    const { profile_id, limit } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase
        .from("recently_watched")
        .select("*")
        .eq("profile_id", profile_id as string)
        .order("updated_at", { ascending: false });
      const lim = limit ? Math.max(1, Math.min(2000, Number(limit))) : null;
      if (lim) q = q.limit(lim);
      const { data, error } = await q;
      if (error && error.code !== "PGRST116" && !error.message?.includes("does not exist") && !error.message?.includes("Could not find")) {
        return res.status(500).json({ error: error.message });
      }
      // Safety dedup by stream_id (latest wins, preserve order)
      const seen = new Set<string>();
      const out: any[] = [];
      for (const row of data ?? []) {
        const key = row.stream_id != null ? String(row.stream_id) : `__noid_${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
      res.json(out);
    } catch {
      res.json([]);
    }
  });

  // Single resume entry by stream
  app.get("/api/recently-watched/by-stream", async (req, res) => {
    const { profile_id, stream_id } = req.query;
    if (!profile_id || !stream_id) return res.status(400).json({ error: "profile_id and stream_id required" });
    try {
      const { data, error } = await supabase
        .from("recently_watched")
        .select("*")
        .eq("profile_id", profile_id as string)
        .eq("stream_id", String(stream_id))
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? null);
    } catch {
      res.json(null);
    }
  });

  app.post("/api/recently-watched", async (req, res) => {
    const {
      profile_id, content_type, stream_id, name, thumbnail_url, stream_url,
      current_time, duration, is_completed, series_id, season_num, episode_num,
      audio_track, text_track,
      series_last_modified, series_total_episodes,
      series_final_season, series_final_episode,
    } = req.body;
    if (!profile_id || !content_type || !name) {
      return res.status(400).json({ error: "profile_id, content_type, and name required" });
    }
    try {
      // Server-side Private Viewing guard — skip insert silently.
      const { data: pvRow } = await supabase
        .from("profiles")
        .select("private_viewing")
        .eq("id", profile_id)
        .single();
      if (pvRow?.private_viewing) return res.json(null);

      const now = new Date().toISOString();
      const entry: Record<string, any> = {
        profile_id,
        content_type,
        stream_id: stream_id ?? null,
        name,
        thumbnail_url: thumbnail_url ?? null,
        stream_url: stream_url ?? null,
        updated_at: now,
      };
      if (typeof current_time === "number") entry.current_time = current_time;
      if (typeof duration === "number") entry.duration = duration;
      if (typeof is_completed === "boolean") entry.is_completed = is_completed;
      if (series_id != null) entry.series_id = String(series_id);
      if (season_num != null) entry.season_num = Number(season_num);
      if (episode_num != null) entry.episode_num = Number(episode_num);
      if (typeof audio_track === "number") entry.audio_track = audio_track;
      if (typeof text_track === "number") entry.text_track = text_track;
      if (typeof series_last_modified === "string") entry.series_last_modified = series_last_modified;
      if (typeof series_total_episodes === "number") entry.series_total_episodes = series_total_episodes;
      if (typeof series_final_season === "number") entry.series_final_season = series_final_season;
      if (typeof series_final_episode === "number") entry.series_final_episode = series_final_episode;

      // Dedup: remove any existing entry for the same stream (also handles re-watch)
      if (stream_id) {
        await supabase
          .from("recently_watched")
          .delete()
          .eq("profile_id", profile_id)
          .eq("stream_id", String(stream_id));
      }

      // Insert fresh entry (movies/series = full lifetime log; live = capped to 20 below)
      const { data, error: insertErr } = await supabase
        .from("recently_watched")
        .insert(entry)
        .select()
        .single();

      if (insertErr) {
        console.error("[recently-watched] insert error:", insertErr.message, insertErr.code);
        return res.json(null);
      }

      // Per-profile caps. Each content type stays bounded; when the cap is
      // reached, the least-recently-active entry/series is trimmed on insert.
      // - Live TV  → newest 20 entries.
      // - Movies   → newest 50 entries (one row per movie).
      // - Series   → newest 20 distinct series titles (grouped by series_id;
      //              a multi-episode show counts once, and trimming removes
      //              ALL episode rows of the evicted series).
      if (content_type === "live") {
        try {
          const { data: liveRows } = await supabase
            .from("recently_watched")
            .select("id")
            .eq("profile_id", profile_id)
            .eq("content_type", "live")
            .order("updated_at", { ascending: false });
          if (liveRows && liveRows.length > 20) {
            const toDelete = liveRows.slice(20).map((r: any) => r.id);
            if (toDelete.length > 0) {
              await supabase.from("recently_watched").delete().in("id", toDelete);
            }
          }
        } catch (capErr: any) {
          console.error("[recently-watched] live cap trim failed:", capErr?.message);
        }
      } else if (content_type === "movie") {
        try {
          const { data: movieRows } = await supabase
            .from("recently_watched")
            .select("id")
            .eq("profile_id", profile_id)
            .eq("content_type", "movie")
            .order("updated_at", { ascending: false });
          if (movieRows && movieRows.length > 50) {
            const toDelete = movieRows.slice(50).map((r: any) => r.id);
            if (toDelete.length > 0) {
              await supabase.from("recently_watched").delete().in("id", toDelete);
            }
          }
        } catch (capErr: any) {
          console.error("[recently-watched] movie cap trim failed:", capErr?.message);
        }
      } else if (content_type === "series") {
        try {
          const { data: seriesRows } = await supabase
            .from("recently_watched")
            .select("id, series_id, updated_at")
            .eq("profile_id", profile_id)
            .eq("content_type", "series")
            .order("updated_at", { ascending: false });
          if (seriesRows && seriesRows.length > 0) {
            // Rank distinct series by most-recent activity. Rows are already
            // ordered newest-first, so the first time we see a series key it is
            // that series' most-recent activity.
            const rank: string[] = [];
            const seenSeries = new Set<string>();
            for (const row of seriesRows) {
              const key = row.series_id != null ? String(row.series_id) : `__noid_${row.id}`;
              if (seenSeries.has(key)) continue;
              seenSeries.add(key);
              rank.push(key);
            }
            if (rank.length > 20) {
              const keep = new Set(rank.slice(0, 20));
              const toDelete = seriesRows
                .filter((r: any) => {
                  const key = r.series_id != null ? String(r.series_id) : `__noid_${r.id}`;
                  return !keep.has(key);
                })
                .map((r: any) => r.id);
              if (toDelete.length > 0) {
                await supabase.from("recently_watched").delete().in("id", toDelete);
              }
            }
          }
        } catch (capErr: any) {
          console.error("[recently-watched] series cap trim failed:", capErr?.message);
        }
      }

      res.json(data ?? null);
    } catch (e: any) {
      console.error("[recently-watched] POST exception:", e?.message);
      res.json(null);
    }
  });

  // ── Recently Watched — delete a single entry ─────────────────────────────
  app.delete("/api/recently-watched/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      const { error } = await supabase
        .from("recently_watched")
        .delete()
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete entry" });
    }
  });

  // ── Recently Watched — clear all for profile/type ────────────────────────
  app.delete("/api/recently-watched", async (req, res) => {
    const { profile_id, content_type } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase.from("recently_watched").delete().eq("profile_id", profile_id as string);
      if (content_type) q = q.eq("content_type", content_type as string);
      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to clear watch history" });
    }
  });

  // ── Content Reports ───────────────────────────────────────────────────────
  app.post("/api/content-reports", async (req, res) => {
    const { profile_id, stream_id, stream_name, stream_type, reason, other_text } = req.body;
    if (!profile_id || !reason) {
      return res.status(400).json({ error: "profile_id and reason required" });
    }
    try {
      const { data, error } = await supabase
        .from("content_reports")
        .insert({
          profile_id,
          stream_id: stream_id ?? null,
          stream_name: stream_name ?? null,
          stream_type: stream_type ?? null,
          reason,
          other_text: other_text ?? null,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // ── Recently Watched — dev seed (test only) ───────────────────────────────
  app.get("/api/recently-watched/seed", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      // Delete existing seed entries for clean state
      await supabase.from("recently_watched").delete().eq("profile_id", profile_id as string);
      // Insert 2 test entries
      const entries = [
        { profile_id: profile_id as string, content_type: "movie", stream_id: "99998", name: "Furious 7", thumbnail_url: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsLMId5A5kUre.jpg", stream_url: null, updated_at: new Date(Date.now() - 60000).toISOString() },
        { profile_id: profile_id as string, content_type: "live", stream_id: "99999", name: "BBC One HD", thumbnail_url: null, stream_url: null, updated_at: new Date().toISOString() },
      ];
      const { data, error } = await supabase.from("recently_watched").insert(entries).select();
      if (error && !error.message?.includes("does not exist") && !error.message?.includes("Could not find")) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ error: "Seed failed" });
    }
  });

  // ── Lifetime access check ─────────────────────────────────────────────────
  // Checks the separate lifetime_users DB — returns { isLifetime: bool }
  app.get("/api/lifetime-check", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb
        .from("lifetime_users")
        .select("id")
        .eq("username", username as string)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[lifetime-check] error:", error.message);
        return res.json({ isLifetime: false });
      }
      res.json({ isLifetime: !!data });
    } catch (e: any) {
      console.error("[lifetime-check] exception:", e?.message);
      res.json({ isLifetime: false });
    }
  });

  // ── VPN subscription ──────────────────────────────────────────────────────
  // Reads/writes the `vpn_subscriptions` table on the lifetime DB.
  // Status: { subscribed: bool, isEnabled: bool, planType?: string, expiryDate?: string }
  app.get("/api/vpn/status", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    const cacheKey = `vpn:${username}`;
    const cached = cacheGet(cacheKey);
    if (cached !== null) return res.json(cached);
    try {
      const { data, error } = await lifetimeDb
        .from("vpn_subscriptions")
        .select("is_enabled, plan_type, expiry_date")
        .eq("username", username as string)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[vpn/status] error:", error.message);
        return res.json({ subscribed: false, isEnabled: false });
      }
      const payload = !data
        ? { subscribed: false, isEnabled: false }
        : {
            subscribed: true,
            isEnabled: !!data.is_enabled,
            planType: data.plan_type ?? null,
            expiryDate: data.expiry_date ?? null,
          };
      cacheSet(cacheKey, payload, 60_000);
      res.json(payload);
    } catch (e: any) {
      console.error("[vpn/status] exception:", e?.message);
      res.json({ subscribed: false, isEnabled: false });
    }
  });

  app.post("/api/vpn/toggle", async (req, res) => {
    const { username, isEnabled } = req.body ?? {};
    if (!username || typeof isEnabled !== "boolean") {
      return res.status(400).json({ error: "username and isEnabled required" });
    }
    try {
      const { data, error } = await lifetimeDb
        .from("vpn_subscriptions")
        .update({ is_enabled: isEnabled })
        .eq("username", username)
        .select("is_enabled")
        .maybeSingle();
      if (error) {
        console.error("[vpn/toggle] error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "No VPN subscription for that username" });
      cacheDel(`vpn:${username}`);
      res.json({ success: true, isEnabled: !!data.is_enabled });
    } catch (e: any) {
      console.error("[vpn/toggle] exception:", e?.message);
      res.status(500).json({ error: "Toggle failed" });
    }
  });

  // ── Content requests (lifetime DB) ────────────────────────────────────────
  // Returns the content_requests rows for a given xtream username, newest first.
  // The `content_details` column is jsonb populated from the TMDB API at
  // submission time, so it usually already contains poster_path, title/name,
  // overview, release_date/first_air_date, etc.
  app.get("/api/content-requests", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb
        .from("content_requests")
        .select("id, status, admin_notes, comments, content_details, created_at, requester_username")
        .eq("requester_username", username as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[content-requests] error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ requests: data ?? [] });
    } catch (e: any) {
      console.error("[content-requests] exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch content requests" });
    }
  });

  // ── Watchlist (lifetime DB) ───────────────────────────────────────────────
  // Keyed by xtream username (NOT profile id) — the watchlist follows the
  // account across profile switches, mirroring the existing content_requests
  // pattern. Two writers exist: the external "Add to Watchlist" page (TMDB
  // form) and the in-app MovieInfo / SeriesDetail screens. See
  // migrations/009_watchlist.sql for the table contract.

  app.get("/api/watchlist", async (req, res) => {
    const { username, content_type } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      let q = lifetimeDb
        .from("watchlist")
        .select("id, user_username, content_id, content_type, content_data, status, created_at")
        .eq("user_username", username as string)
        .order("created_at", { ascending: false })
        .limit(500);
      if (content_type === "movie" || content_type === "series") {
        q = q.eq("content_type", content_type);
      }
      const { data, error } = await q;
      if (error) {
        console.error("[watchlist] GET error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ items: data ?? [] });
    } catch (e: any) {
      console.error("[watchlist] GET exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", async (req, res) => {
    const { user_username, content_id, content_type, content_data, status } = req.body;
    if (!user_username || !content_id || !content_type) {
      return res.status(400).json({ error: "user_username, content_id, content_type required" });
    }
    if (content_type !== "movie" && content_type !== "series") {
      return res.status(400).json({ error: "content_type must be 'movie' or 'series'" });
    }
    try {
      const row = {
        user_username: String(user_username),
        content_id: String(content_id),
        content_type,
        content_data: content_data ?? null,
        status: status === "watched" ? "watched" : "unwatched",
      };
      // Manual "upsert": the production `watchlist` table doesn't carry the
      // unique constraint on (user_username, content_id, content_type) so
      // postgres-level upsert fails with "no constraint matches ON CONFLICT".
      // Look up an existing row first and update in place if found.
      const { data: existing, error: selErr } = await lifetimeDb
        .from("watchlist")
        .select("id")
        .eq("user_username", row.user_username)
        .eq("content_id", row.content_id)
        .eq("content_type", row.content_type)
        .maybeSingle();
      if (selErr) {
        console.error("[watchlist] POST select error:", selErr.message);
        return res.status(500).json({ error: selErr.message });
      }
      if (existing?.id) {
        const { data: updated, error: updErr } = await lifetimeDb
          .from("watchlist")
          .update({ content_data: row.content_data, status: row.status })
          .eq("id", existing.id)
          .select()
          .single();
        if (updErr) {
          console.error("[watchlist] POST update error:", updErr.message);
          return res.status(500).json({ error: updErr.message });
        }
        return res.json(updated);
      }
      const { data, error } = await lifetimeDb
        .from("watchlist")
        .insert(row)
        .select()
        .single();
      if (error) {
        console.error("[watchlist] POST insert error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } catch (e: any) {
      console.error("[watchlist] POST exception:", e?.message);
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  app.patch("/api/watchlist/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (status !== "watched" && status !== "unwatched") {
      return res.status(400).json({ error: "status must be 'watched' or 'unwatched'" });
    }
    try {
      const { data, error } = await lifetimeDb
        .from("watchlist")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("[watchlist] PATCH error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } catch (e: any) {
      console.error("[watchlist] PATCH exception:", e?.message);
      res.status(500).json({ error: "Failed to update watchlist" });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await lifetimeDb.from("watchlist").delete().eq("id", id);
      if (error) {
        console.error("[watchlist] DELETE error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[watchlist] DELETE exception:", e?.message);
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  // ── TMDB proxy ────────────────────────────────────────────────────────────
  // Fetches fresh details for a TMDB title without exposing the bearer token
  // to the client. type must be "movie" or "tv".
  app.get("/api/tmdb/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    if (type !== "movie" && type !== "tv") {
      return res.status(400).json({ error: "type must be 'movie' or 'tv'" });
    }
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "valid numeric id required" });
    }
    const token = process.env.TMDB_READ_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "TMDB_READ_TOKEN not configured" });
    }
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!r.ok) {
        return res.status(r.status).json({ error: `TMDB ${r.status}` });
      }
      const json = await r.json();
      res.json(json);
    } catch (e: any) {
      console.error("[tmdb] exception:", e?.message);
      res.status(500).json({ error: "TMDB fetch failed" });
    }
  });

  // ── User Groups (per-profile custom collections) ──────────────────────────
  // Groups are scoped per (profile_id, type). Items inside a group are
  // xtream streams (live channels, movies, or series).
  app.get("/api/groups", async (req, res) => {
    const { profile_id, type } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase
        .from("user_groups")
        .select("*")
        .eq("profile_id", profile_id as string)
        .order("created_at");
      if (type) q = q.eq("type", type as string);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    const { profile_id, type, name, icon_key, color, pinned } = req.body;
    if (!profile_id || !type || !name) {
      return res.status(400).json({ error: "profile_id, type, name required" });
    }
    if (!["live", "movies", "series"].includes(type)) {
      return res.status(400).json({ error: "invalid type" });
    }
    try {
      const { data, error } = await supabase
        .from("user_groups")
        .insert({
          profile_id,
          type,
          name: String(name).trim().slice(0, 60),
          icon_key: icon_key || "folder",
          color: color || "#FF6600",
          pinned: typeof pinned === "boolean" ? pinned : false,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    const { id } = req.params;
    const { name, icon_key, color, pinned } = req.body;
    const patch: Record<string, unknown> = {};
    if (typeof name === "string") patch.name = name.trim().slice(0, 60);
    if (typeof icon_key === "string") patch.icon_key = icon_key;
    if (typeof color === "string") patch.color = color;
    if (typeof pinned === "boolean") patch.pinned = pinned;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "no fields to update" });
    }
    try {
      const { data, error } = await supabase
        .from("user_groups")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to update group" });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("user_groups").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // Items inside a group
  app.get("/api/groups/:id/items", async (req, res) => {
    const { id } = req.params;
    try {
      const { data, error } = await supabase
        .from("user_group_items")
        .select("*")
        .eq("group_id", id)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch group items" });
    }
  });

  // Fetch ALL items for ALL groups of a profile (for fast client caching).
  app.get("/api/group-items", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      // Join via two queries — first fetch this profile's group ids, then
      // pull items in one shot. Avoids needing a PostgREST join.
      const groupsRes = await supabase
        .from("user_groups")
        .select("id")
        .eq("profile_id", profile_id as string);
      if (groupsRes.error) return res.status(500).json({ error: groupsRes.error.message });
      const ids = (groupsRes.data ?? []).map((g: any) => g.id);
      if (ids.length === 0) return res.json([]);
      const { data, error } = await supabase
        .from("user_group_items")
        .select("*")
        .in("group_id", ids);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch group items" });
    }
  });

  app.post("/api/groups/:id/items", async (req, res) => {
    const { id } = req.params;
    const { stream_id, stream_name, stream_icon, category_id } = req.body;
    if (stream_id === undefined || !stream_name) {
      return res.status(400).json({ error: "stream_id and stream_name required" });
    }
    try {
      // Upsert by (group_id, stream_id) so re-adds don't error.
      const { data, error } = await supabase
        .from("user_group_items")
        .upsert(
          {
            group_id: id,
            stream_id,
            stream_name,
            stream_icon: stream_icon ?? null,
            category_id: category_id ?? null,
          },
          { onConflict: "group_id,stream_id" },
        )
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to add item to group" });
    }
  });

  app.delete("/api/groups/:id/items/:stream_id", async (req, res) => {
    const { id, stream_id } = req.params;
    try {
      const { error } = await supabase
        .from("user_group_items")
        .delete()
        .eq("group_id", id)
        .eq("stream_id", stream_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove item from group" });
    }
  });

  // ── Football Scores ───────────────────────────────────────────────────────
  // Per-profile tracker settings (selected league + screen corner).
  const FOOTBALL_CORNERS = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "middle-left",
    "middle-right",
  ];

  // Global kill-switch for the whole football feature (singleton row, admin
  // flips it externally). Defaults to enabled=true and degrades gracefully when
  // the table is missing (migration 013 not yet run), so the feature stays on.
  app.get("/api/football/global", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("football_global")
        .select("enabled")
        .eq("id", 1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        return res.json({ enabled: true });
      }
      res.json({ enabled: data?.enabled !== false });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/football/prefs", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      // Select "*" so visible_lines flows through when present, but the route
      // still works before migration 014 adds that column.
      const { data, error } = await supabase
        .from("football_prefs")
        .select("*")
        .eq("profile_id", profile_id as string)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      res.json(
        data
          ? {
              league_id: data.league_id ?? null,
              corner: data.corner ?? "top-right",
              enabled: data.enabled !== false,
              visible_lines: data.visible_lines ?? 5,
            }
          : { league_id: null, corner: "top-right", enabled: true, visible_lines: 5 },
      );
    } catch {
      res.status(500).json({ error: "Failed to fetch football prefs" });
    }
  });

  app.put("/api/football/prefs", async (req, res) => {
    const { profile_id, league_id, corner, enabled, visible_lines } = req.body;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    const c = FOOTBALL_CORNERS.includes(corner) ? corner : "top-right";
    try {
      const { data, error } = await supabase
        .from("football_prefs")
        .upsert(
          {
            profile_id,
            league_id: league_id == null ? null : Number(league_id),
            corner: c,
            enabled: typeof enabled === "boolean" ? enabled : true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id" },
        )
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });

      // visible_lines is written separately and best-effort so a not-yet-run
      // migration (014) never blocks the core pref save.
      let visibleLines = data?.visible_lines ?? 5;
      if (visible_lines != null) {
        const vl = Math.min(6, Math.max(1, Math.round(Number(visible_lines))));
        const { error: vlErr } = await supabase
          .from("football_prefs")
          .update({ visible_lines: vl })
          .eq("profile_id", profile_id);
        if (vlErr) {
          console.error(
            "[football] visible_lines update error (has migration 014 been run?):",
            vlErr.message,
          );
        } else {
          visibleLines = vl;
        }
      }
      res.json({ ...data, visible_lines: visibleLines });
    } catch {
      res.status(500).json({ error: "Failed to save football prefs" });
    }
  });

  // ── Favourite team ────────────────────────────────────────────────────────
  // Per-profile favourite football team, stored in the MAIN db
  // (profile_favourite_team). team_data is the api-football team object the
  // picker chose, shaped { id, name, code, logo }.

  app.get("/api/football/favourite-team", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("profile_favourite_team")
        .select("team_id, team_data, updated_at")
        .eq("profile_id", profile_id as string)
        .maybeSingle();
      if (error) {
        // Until migration 018 runs the table is missing — degrade to "no team".
        console.error("[football/favourite-team] get error:", error.message);
        return res.json({ team: null });
      }
      res.json({ team: data?.team_data ?? null });
    } catch {
      res.status(500).json({ error: "Failed to fetch favourite team" });
    }
  });

  app.put("/api/football/favourite-team", async (req, res) => {
    const { profile_id, team_id, team_data } = req.body ?? {};
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    const teamIdNum = Number(team_id);
    if (team_id == null || !Number.isFinite(teamIdNum) || !team_data || typeof team_data !== "object") {
      return res.status(400).json({ error: "team_id (numeric) and team_data required" });
    }
    try {
      const { data, error } = await supabase
        .from("profile_favourite_team")
        .upsert(
          {
            profile_id,
            team_id: teamIdNum,
            team_data,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id" },
        )
        .select("team_data")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ team: data?.team_data ?? team_data });
    } catch {
      res.status(500).json({ error: "Failed to save favourite team" });
    }
  });

  // ── Match reminders on/off ─────────────────────────────────────────────────
  // Per-profile Match Notifications preference, stored on
  // profile_favourite_team.reminders_enabled (migration 019) so it follows the
  // profile across devices. The per-fixture "already shown" dedupe state stays
  // device-local on the client. The toggle is only usable once a favourite team
  // is set, so the row always exists before this flag is written.

  app.get("/api/football/match-reminders", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("profile_favourite_team")
        .select("reminders_enabled")
        .eq("profile_id", profile_id as string)
        .maybeSingle();
      if (error) {
        // Until migration 019 runs the column is missing — degrade to "off".
        console.error("[football/match-reminders] get error:", error.message);
        return res.json({ enabled: false });
      }
      res.json({ enabled: data?.reminders_enabled ?? false });
    } catch {
      res.status(500).json({ error: "Failed to fetch match reminders preference" });
    }
  });

  app.put("/api/football/match-reminders", async (req, res) => {
    const { profile_id, enabled } = req.body ?? {};
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    const on = !!enabled;
    try {
      const { error } = await supabase
        .from("profile_favourite_team")
        .update({ reminders_enabled: on, updated_at: new Date().toISOString() })
        .eq("profile_id", profile_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ enabled: on });
    } catch {
      res.status(500).json({ error: "Failed to save match reminders preference" });
    }
  });

  // Team search — proxies api-football /teams?search= (min 3 chars). Used by the
  // favourite-team picker. Returns { teams: [{ id, name, code, logo, country }] }.
  app.get("/api/football/teams", async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    if (search.length < 3) {
      return res.status(400).json({ error: "search must be at least 3 characters" });
    }
    try {
      const teams = await searchTeams(search);
      if (teams == null) {
        return res.status(502).json({ error: "Team search is unavailable right now" });
      }
      res.json({ teams });
    } catch {
      res.status(500).json({ error: "Failed to search teams" });
    }
  });

  // One-time bulk import: copy each account's existing favourite from the
  // lifetime db (user_favorite_teams, keyed by iptv_username) onto every profile
  // under that account_username in the MAIN db. Idempotent — profiles that
  // already have a favourite are left untouched, so it is safe to re-run.
  app.post("/api/football/favourite-team/import", async (req, res) => {
    // Privileged one-off admin op (cross-db bulk write). Require the import
    // secret unless triggered locally from the server host (dev convenience).
    const secret = process.env.SESSION_SECRET;
    const provided = req.get("x-import-secret");
    const host = req.hostname || "";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!isLocal && (!secret || provided !== secret)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const PAGE = 1000;
    try {
      // 1. Latest favourite per account from the lifetime db.
      const favByUser = new Map<string, { team_id: number; team_data: any }>();
      for (let page = 0; ; page++) {
        const { data, error } = await lifetimeDb
          .from("user_favorite_teams")
          .select("iptv_username, team_id, team_data, updated_at")
          .order("updated_at", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) return res.status(500).json({ error: `lifetime read failed: ${error.message}` });
        if (!data || data.length === 0) break;
        for (const r of data as any[]) {
          const u = r?.iptv_username;
          if (!u || r?.team_id == null || !r?.team_data) continue;
          // Ascending order means later rows win → keeps the most recent pick.
          favByUser.set(u, { team_id: Number(r.team_id), team_data: r.team_data });
        }
        if (data.length < PAGE) break;
      }

      // 2. All profiles in the main db.
      const profiles: { id: string; account_username: string }[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, account_username")
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) return res.status(500).json({ error: `profiles read failed: ${error.message}` });
        if (!data || data.length === 0) break;
        profiles.push(...(data as any[]));
        if (data.length < PAGE) break;
      }

      // 3. Profiles that already have a favourite (skip them — idempotent).
      const existing = new Set<string>();
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("profile_favourite_team")
          .select("profile_id")
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) return res.status(500).json({ error: `favourite-team read failed (has migration 018 run?): ${error.message}` });
        if (!data || data.length === 0) break;
        for (const r of data as any[]) existing.add(r.profile_id);
        if (data.length < PAGE) break;
      }

      // 4. Build the rows to insert.
      const now = new Date().toISOString();
      const rows = profiles
        .filter((p) => !existing.has(p.id) && favByUser.has(p.account_username))
        .map((p) => {
          const fav = favByUser.get(p.account_username)!;
          return {
            profile_id: p.id,
            team_id: fav.team_id,
            team_data: fav.team_data,
            created_at: now,
            updated_at: now,
          };
        });

      // 5. Insert in batches.
      let imported = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("profile_favourite_team")
          .upsert(batch, { onConflict: "profile_id", ignoreDuplicates: true });
        if (error) return res.status(500).json({ error: `import write failed: ${error.message}`, imported });
        imported += batch.length;
      }

      res.json({
        ok: true,
        accountsWithFavourite: favByUser.size,
        profilesTotal: profiles.length,
        alreadySet: existing.size,
        imported,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? "Import failed" });
    }
  });

  // One-off maintenance: trim already-stored over-the-limit watch history so
  // every profile is brought within the same per-type caps enforced at save
  // time (POST /api/recently-watched):
  //   - Live TV → newest 20 rows.
  //   - Movies  → newest 50 rows.
  //   - Series  → newest 20 distinct series (grouped by series_id; removes ALL
  //               episode rows of evicted series).
  // Idempotent — re-running on an already-trimmed table deletes nothing.
  app.post("/api/recently-watched/trim-over-cap", async (req, res) => {
    // Privileged one-off admin op that bulk-deletes across ALL profiles, so
    // authorization must be robust. Always require the secret. The only bypass
    // is a genuine loopback connection (validated via the socket address, NOT
    // the spoofable Host header) and only outside production, for dev runs.
    const secret = process.env.SESSION_SECRET;
    const provided = req.get("x-import-secret");
    const remote = req.socket?.remoteAddress ?? "";
    const isLoopback =
      remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    const allowLocal = isLoopback && process.env.NODE_ENV !== "production";
    if (!allowLocal && (!secret || provided !== secret)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const PAGE = 1000;
    try {
      // 1. Pull every row (just the fields needed to rank + trim), paginated.
      type Row = { id: string; profile_id: string; content_type: string; series_id: string | null; updated_at: string };
      const rows: Row[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("recently_watched")
          .select("id, profile_id, content_type, series_id, updated_at")
          .order("updated_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) return res.status(500).json({ error: `recently_watched read failed: ${error.message}` });
        if (!data || data.length === 0) break;
        rows.push(...(data as Row[]));
        if (data.length < PAGE) break;
      }

      // 2. Group by profile, then by content type (rows are already newest-first).
      const byProfile = new Map<string, { live: Row[]; movie: Row[]; series: Row[] }>();
      for (const r of rows) {
        if (!r.profile_id) continue;
        let g = byProfile.get(r.profile_id);
        if (!g) {
          g = { live: [], movie: [], series: [] };
          byProfile.set(r.profile_id, g);
        }
        if (r.content_type === "live") g.live.push(r);
        else if (r.content_type === "movie") g.movie.push(r);
        else if (r.content_type === "series") g.series.push(r);
      }

      // 3. Determine the ids to delete, mirroring the save-time trim logic.
      const toDelete: string[] = [];
      for (const g of byProfile.values()) {
        if (g.live.length > 20) {
          for (const r of g.live.slice(20)) toDelete.push(r.id);
        }
        if (g.movie.length > 50) {
          for (const r of g.movie.slice(50)) toDelete.push(r.id);
        }
        if (g.series.length > 0) {
          // Rank distinct series by most-recent activity (rows newest-first, so
          // the first sighting of a key is that series' most-recent activity).
          const rank: string[] = [];
          const seen = new Set<string>();
          for (const r of g.series) {
            const key = r.series_id != null ? String(r.series_id) : `__noid_${r.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rank.push(key);
          }
          if (rank.length > 20) {
            const keep = new Set(rank.slice(0, 20));
            for (const r of g.series) {
              const key = r.series_id != null ? String(r.series_id) : `__noid_${r.id}`;
              if (!keep.has(key)) toDelete.push(r.id);
            }
          }
        }
      }

      // 4. Delete in batches.
      let removed = 0;
      for (let i = 0; i < toDelete.length; i += 500) {
        const batch = toDelete.slice(i, i + 500);
        const { error } = await supabase.from("recently_watched").delete().in("id", batch);
        if (error) return res.status(500).json({ error: `delete failed: ${error.message}`, removed });
        removed += batch.length;
      }

      console.log(`[recently-watched] trim-over-cap removed ${removed} rows across ${byProfile.size} profiles (${rows.length} scanned)`);
      res.json({
        ok: true,
        profilesScanned: byProfile.size,
        rowsScanned: rows.length,
        rowsRemoved: removed,
      });
    } catch (e: any) {
      console.error("[recently-watched] trim-over-cap exception:", e?.message);
      res.status(500).json({ error: e?.message ?? "Trim failed" });
    }
  });

  // Live scores cache (maintained by the background poller). Clients poll this
  // every ~30s instead of hitting api-football directly.
  app.get("/api/football/scores", async (req, res) => {
    const { league_id } = req.query;
    try {
      let q = supabase
        .from("football_scores")
        .select("*")
        .order("finished_at", { ascending: true, nullsFirst: true })
        .order("elapsed", { ascending: false, nullsFirst: false });
      if (league_id) q = q.eq("league_id", Number(league_id));
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch football scores" });
    }
  });

  // ── Football Centre ───────────────────────────────────────────────────────
  // All Football Centre read endpoints are best-effort cache reads and never
  // hard-fail the UI — they degrade gracefully to [] when a migration hasn't
  // been run or the table is otherwise unavailable.
  //
  // Live scores scoped to the curated leagues only (the poller caches every
  // live game worldwide; the Centre shows just the curated set).
  app.get("/api/football/centre/scores", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("football_scores")
        .select("*")
        .in("league_id", CURATED_LEAGUE_IDS)
        .order("elapsed", { ascending: false, nullsFirst: false });
      if (error) {
        console.error("[football] centre scores fetch error:", error.message);
        return res.json([]);
      }
      res.json(data ?? []);
    } catch {
      res.json([]);
    }
  });

  // Upcoming fixtures (next ~7 days, curated leagues), ordered by kickoff.
  // Degrades gracefully to [] when migration 015 hasn't been run.
  app.get("/api/football/centre/fixtures", async (_req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("football_fixtures")
        .select("*")
        .gte("date_key", today)
        .order("kickoff", { ascending: true, nullsFirst: false });
      if (error) {
        console.error("[football] fixtures fetch error:", error.message);
        return res.json([]);
      }
      res.json(data ?? []);
    } catch {
      res.json([]);
    }
  });

  // Upcoming fixtures for a single team (?team_id=...), straight from
  // api-football and NOT limited to the curated leagues. Powers the match
  // reminder engine so reminders fire for ANY of the favourite team's games.
  // Degrades gracefully to [] on bad input / no key / upstream error.
  app.get("/api/football/team-fixtures", async (req, res) => {
    try {
      const teamId = Number(req.query.team_id);
      if (!Number.isFinite(teamId) || teamId <= 0) return res.json([]);
      const rows = await fetchTeamUpcomingFixtures(teamId);
      res.json(rows);
    } catch {
      res.json([]);
    }
  });

  // TV-channel links for fixtures. Optional ?fixture_ids=1,2,3 filter.
  // Degrades gracefully to [] when migration 016 hasn't been run.
  app.get("/api/football/centre/channels", async (req, res) => {
    try {
      const { fixture_ids } = req.query;
      let q = supabase
        .from("football_fixture_channels")
        .select("fixture_id, channel_name, stream_id");
      if (typeof fixture_ids === "string" && fixture_ids.trim()) {
        const ids = fixture_ids
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
        if (ids.length) q = q.in("fixture_id", ids);
      }
      const { data, error } = await q;
      if (error) {
        console.error("[football] channels fetch error:", error.message);
        return res.json([]);
      }
      res.json(data ?? []);
    } catch {
      res.json([]);
    }
  });

  // On-demand detail (stats / lineups / events) for a single live fixture.
  // Fetched only when a user opens a game; returns null fields gracefully when
  // the kill-switch is off or the API key is missing.
  app.get("/api/football/centre/fixture/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid fixture id" });
    }
    try {
      const detail = await fetchFixtureDetail(id);
      if (!detail) {
        return res.json({ statistics: [], lineups: [], events: [] });
      }
      res.json(detail);
    } catch (e: any) {
      console.error("[football] fixture detail error:", e?.message);
      res.json({ statistics: [], lineups: [], events: [] });
    }
  });

  // ── Developer details ─────────────────────────────────────────────────────
  app.get("/api/developer-details", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("developer_details")
        .select("developer_name, developer_contact, website_link, renewal_link")
        .limit(1)
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? {});
    } catch {
      res.status(500).json({ error: "Failed to fetch developer details" });
    }
  });

  // ── Referrals ─────────────────────────────────────────────────────────────
  // Queries the lifetime DB `profiles` table by Xtream username.
  // Returns referral_code (null if not yet generated), referral_count,
  // referral_tokens. Gracefully returns nulls when the row isn't found.
  app.get("/api/referrals", async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username required" });
    }
    try {
      const { data, error } = await lifetimeDb
        .from("profiles")
        .select("referral_code, referral_count, referral_tokens")
        .eq("username", username)
        .maybeSingle();
      if (error) {
        console.error("[referrals] fetch error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json(data ?? { referral_code: null, referral_count: 0, referral_tokens: 0 });
    } catch (e: any) {
      console.error("[referrals] exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch referral data" });
    }
  });

  // Calls the Supabase RPC `create_referral_code_for_user` on the lifetime DB.
  // Returns { referral_code } on success.
  app.post("/api/referrals/generate", async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb.rpc("create_referral_code_for_user", {
        p_username: username,
      });
      if (error) {
        console.error("[referrals/generate] rpc error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ referral_code: data });
    } catch (e: any) {
      console.error("[referrals/generate] exception:", e?.message);
      res.status(500).json({ error: "Failed to generate referral code" });
    }
  });

  // Referral history — rows from the lifetime DB `referral_logs` table where
  // `referrer_username` matches the logged-in user. Each row = one referral
  // received. Returns newest first. Gracefully returns [] when none/not found.
  app.get("/api/referrals/history", async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username required" });
    }
    try {
      const { data, error } = await lifetimeDb
        .from("referral_logs")
        .select("id, created_at")
        .eq("referrer_username", username)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[referrals/history] fetch error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ history: data ?? [] });
    } catch (e: any) {
      console.error("[referrals/history] exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch referral history" });
    }
  });

  // ── Top Picks (lifetime DB) ───────────────────────────────────────────────
  // Returns up to 8 curated picks from the top_picks table, ordered by
  // popularity descending. Poster path is stored as the TMDB relative path;
  // the client builds the full URL.
  app.get("/api/top-picks", async (req, res) => {
    const cacheKey = "top_picks";
    const cached = cacheGet(cacheKey);
    if (cached !== null) return res.json(cached);
    try {
      const { data, error } = await lifetimeDb
        .from("top_picks")
        .select("id, tmdb_id, media_type, title, poster_path, overview, release_date, position, popularity_score")
        .order("position", { ascending: true })
        .limit(8);
      if (error) {
        console.error("[top-picks] fetch error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      const payload = data ?? [];
      cacheSet(cacheKey, payload, 5 * 60_000); // 5-minute cache
      res.json(payload);
    } catch (e: any) {
      console.error("[top-picks] exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch top picks" });
    }
  });

  // ── Ultra Tube ─────────────────────────────────────────────────────────────
  // Config: APK URL, downloader code, badge toggle.  Reads from ultra_tube_config
  // row id=1.  Gracefully falls back to hardcoded defaults when the table is
  // missing (migration 025 not yet run).
  app.get("/api/ultra-tube/config", async (_req, res) => {
    const DEFAULTS = {
      apk_url: "https://app.ultracast.co.uk/ultratube2.apk",
      downloader_code: "6844940",
      show_badge: true,
    };
    try {
      const { data, error } = await supabase
        .from("ultra_tube_config")
        .select("apk_url, downloader_code, show_badge")
        .eq("id", 1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return res.json(DEFAULTS);
      res.json(data ?? DEFAULTS);
    } catch {
      res.json(DEFAULTS);
    }
  });

  // Access check: given the user's ultracast username, returns their Ultra Tube
  // credentials if they have a row in ultra_tube_access, otherwise { hasAccess: false }.
  app.get("/api/ultra-tube/check", async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== "string") return res.json({ hasAccess: false });
    try {
      const { data, error } = await supabase
        .from("ultra_tube_access")
        .select("ultra_tube_username, ultra_tube_password")
        .eq("username", username.trim().toLowerCase())
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        console.error("[ultra-tube] check error:", error.message);
        return res.json({ hasAccess: false });
      }
      if (!data) return res.json({ hasAccess: false });
      res.json({
        hasAccess: true,
        ultra_tube_username: data.ultra_tube_username,
        ultra_tube_password: data.ultra_tube_password,
      });
    } catch (e: any) {
      console.error("[ultra-tube] check exception:", e?.message);
      res.json({ hasAccess: false });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
