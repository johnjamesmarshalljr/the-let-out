"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronUp, ChevronDown, MessageCircle, Plus, Home, X, LogOut, Camera, Pencil, Users, Calendar, Search, Trophy, Play, Pause, Radio, SkipBack, SkipForward, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Houses from "@/components/Houses";
import Balls from "@/components/Balls";

const C = {
  ink: "#14101f", panel: "#1e1830", panel2: "#241c39",
  border: "#322749", borderHot: "#46345f",
  gold: "#e8c66b", magenta: "#ff3d7f", violet: "#a87bff",
  text: "#f4f0fb", muted: "#9a90b3", mutedDim: "#6f6786",
};
const SUGGESTED_TAGS = ["runway", "vogue", "performance", "realness", "face", "beginners", "music", "balls", "tea", "legends", "fashion", "organizing"];

// ============================================================
//  RADIO STATION
//  Paste your SoundCloud playlist / set / station / track URL below.
//  Any PUBLIC SoundCloud URL works (a "set" = a playlist is ideal for a station).
//  This is the ONLY line you change to set what the radio plays.
// ============================================================
const RADIO_URL = "https://soundcloud.com/YOUR_HANDLE/sets/YOUR_PLAYLIST";
const RADIO_LABEL = "THE LET OUT RADIO";
const AVATAR_COLORS = ["#ff3d7f", "#a87bff", "#e8c66b", "#5fd6e0", "#5fe0a0", "#ff8a5f"];
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
const MAX_MEDIA_MB = 50;
const MAX_TAGS = 5;

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return Math.floor(s / 604800) + "w";
}
function sceneLabel(s) {
  if (s === "both") return "Kiki + Mainstream";
  if (s === "kiki") return "Kiki";
  if (s === "mainstream") return "Mainstream";
  return null;
}
function normTag(t) { return t.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20); }
function buildTree(flat) {
  const byId = {}; flat.forEach((c) => (byId[c.id] = { ...c, children: [] }));
  const roots = [];
  flat.forEach((c) => { if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children.push(byId[c.id]); else roots.push(byId[c.id]); });
  return roots;
}

function Avatar({ name, url, color, size = 32 }) {
  if (url) return <img src={url} alt={name || ""} style={{ width: size, height: size, borderRadius: size, objectFit: "cover", flexShrink: 0, background: C.panel2 }} />;
  const letter = (name || "?")[0].toUpperCase();
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, width: size, height: size, borderRadius: size, background: color || `linear-gradient(135deg, ${C.gold}, ${C.violet})`, color: C.ink, fontSize: size * 0.42 }}>{letter}</div>;
}

function Vote({ score, vote, onUp, onDown }) {
  const up = vote === "up", down = vote === "down";
  const btn = (active, bg, border, color, idle) => ({ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28, borderRadius: 8, border: `1px solid ${active ? border : C.border}`, background: active ? bg : "transparent", color: active ? color : idle, cursor: "pointer", transition: "all .12s" });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <button onClick={onUp} title="Upvote" style={btn(up, C.magenta, C.magenta, C.ink, C.muted)}><ChevronUp size={20} strokeWidth={2.6} /></button>
      <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "center", color: C.text, fontSize: 14, minWidth: 30 }}>{score}</div>
      <button onClick={onDown} title="Chop" style={btn(down, `${C.violet}22`, C.violet, C.violet, C.mutedDim)}><ChevronDown size={20} strokeWidth={2.6} /></button>
    </div>
  );
}
function CommentVote({ score, vote, onUp, onDown }) {
  const up = vote === "up", down = vote === "down";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <button onClick={onUp} title="Upvote" style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: up ? C.magenta : C.mutedDim, padding: 2 }}><ChevronUp size={17} strokeWidth={2.6} /></button>
      <span style={{ fontWeight: 700, fontSize: 12.5, color: C.muted, minWidth: 12, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{score}</span>
      <button onClick={onDown} title="Chop" style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: down ? C.violet : C.mutedDim, padding: 2 }}><ChevronDown size={17} strokeWidth={2.6} /></button>
    </div>
  );
}

function TagChip({ tag, onClick, active }) {
  return <button onClick={onClick} style={{ fontWeight: 700, fontSize: 11.5, padding: "2px 9px", borderRadius: 999, border: `1px solid ${active ? C.violet : C.border}`, background: active ? `${C.violet}22` : "transparent", color: C.violet, cursor: "pointer" }}>#{tag}</button>;
}

function MediaView({ url, type, rounded = 12, maxHeight }) {
  if (!url) return null;
  const common = { width: "100%", borderRadius: rounded, marginTop: 12, background: "#000", display: "block" };
  if (type === "video") return <video src={url} controls preload="metadata" style={{ ...common, maxHeight: maxHeight || 480 }} />;
  return <img src={url} alt="" style={{ ...common, maxHeight: maxHeight || 480, objectFit: "contain" }} />;
}

function parseEmbed(url) {
  if (!url) return null;
  let u; try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v"); if (v) return { type: "youtube", id: v };
    const parts = u.pathname.split("/").filter(Boolean);
    const si = parts.indexOf("shorts"); if (si >= 0 && parts[si + 1]) return { type: "youtube", id: parts[si + 1] };
    const ei = parts.indexOf("embed"); if (ei >= 0 && parts[ei + 1]) return { type: "youtube", id: parts[ei + 1] };
  }
  if (host === "youtu.be") { const id = u.pathname.slice(1); if (id) return { type: "youtube", id }; }
  if (host === "tiktok.com") { const m = u.pathname.match(/\/video\/(\d+)/); if (m) return { type: "tiktok", id: m[1] }; }
  if (host === "instagram.com") { const m = u.pathname.match(/\/(p|reel|tv)\/([^/]+)/); if (m) return { type: "instagram", code: m[2] }; }
  return { type: "link", url: u.href };
}
function LinkEmbed({ url }) {
  const e = parseEmbed(url);
  if (!e) return null;
  const frame = { marginTop: 12, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: "#000" };
  if (e.type === "youtube") return <div style={{ ...frame, position: "relative", paddingBottom: "56.25%", height: 0 }}><iframe src={`https://www.youtube-nocookie.com/embed/${e.id}`} title="YouTube" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /></div>;
  if (e.type === "tiktok") return <div style={frame}><iframe src={`https://www.tiktok.com/embed/v2/${e.id}`} title="TikTok" allow="encrypted-media; fullscreen" style={{ width: "100%", height: 600, border: 0, display: "block" }} /></div>;
  if (e.type === "instagram") return <div style={frame}><iframe src={`https://www.instagram.com/p/${e.code}/embed`} title="Instagram" scrolling="no" style={{ width: "100%", height: 560, border: 0, display: "block" }} /></div>;
  return <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel2, color: C.violet, fontSize: 13.5, fontWeight: 600, wordBreak: "break-all", textDecoration: "none" }}>{e.url}</a>;
}

/* ---------- profile form ---------- */
function ProfileForm({ mode, me, initial, onSaved, onCancel }) {
  const [username, setUsername] = useState(initial.username || "");
  const [house, setHouse] = useState(initial.house || "");
  const [scene, setScene] = useState(initial.scene || null);
  const [bio, setBio] = useState(initial.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url || null);
  const [avatarColor, setAvatarColor] = useState(initial.avatar_color || AVATAR_COLORS[0]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 12px", width: "100%", outline: "none", fontSize: 14 };
  const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };
  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setUploading(true); setErr(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setErr("Photo upload failed: " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl + "?t=" + Date.now());
    setUploading(false);
  };
  const save = async () => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) { setErr("Username must be 3–20 characters: letters, numbers, _ or . only."); return; }
    setSaving(true); setErr(null);
    const payload = { username: u, house: house.trim() || null, scene: scene || null, bio: bio.trim() || null, avatar_url: avatarUrl || null, avatar_color: avatarColor, onboarded: true };
    const { error } = await supabase.from("profiles").update(payload).eq("id", me.id);
    if (error) { setErr(error.code === "23505" ? "That username is taken — try another." : "Could not save: " + error.message); setSaving(false); return; }
    setSaving(false); onSaved({ ...initial, ...payload, id: me.id });
  };
  return (
    <div style={{ maxWidth: 520 }}>
      {mode === "edit" && <button onClick={onCancel} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>}
      <h1 style={{ fontWeight: 900, margin: "0 0 4px", fontSize: 24 }}>{mode === "edit" ? "Edit your profile" : "Set up your profile"}</h1>
      <p style={{ color: C.muted, fontSize: 14, margin: "0 0 22px" }}>{mode === "edit" ? "Update how you show up on the Let Out." : "This is how the scene sees you here. Pick a name — the rest is optional."}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <Avatar name={username || initial.username} url={avatarUrl} color={avatarColor} size={72} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Camera size={15} /> {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}</button>
          {avatarUrl && <button onClick={() => setAvatarUrl(null)} style={{ display: "block", marginTop: 8, color: C.mutedDim, fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>remove photo</button>}
        </div>
      </div>
      {!avatarUrl && <div style={{ marginBottom: 20 }}><label style={label}>Icon color</label><div style={{ display: "flex", gap: 10 }}>{AVATAR_COLORS.map((col) => <button key={col} onClick={() => setAvatarColor(col)} style={{ width: 30, height: 30, borderRadius: 30, background: col, cursor: "pointer", border: avatarColor === col ? `3px solid ${C.text}` : `2px solid ${C.border}` }} />)}</div></div>}
      <label style={label}>Username</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your handle" style={{ ...inputStyle, marginBottom: 18 }} />
      <label style={label}>House <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
      <input value={house} onChange={(e) => setHouse(e.target.value)} placeholder="e.g. House of Gabbana" style={{ ...inputStyle, marginBottom: 18 }} />
      <label style={label}>Scene <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>{[["kiki", "Kiki"], ["mainstream", "Mainstream"], ["both", "Both"]].map(([v, l]) => <button key={v} onClick={() => setScene(scene === v ? null : v)} style={{ fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 999, cursor: "pointer", border: `1px solid ${scene === v ? C.magenta : C.border}`, background: scene === v ? C.magenta : "transparent", color: scene === v ? C.ink : C.muted }}>{l}</button>)}</div>
      <label style={label}>Bio <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line about you." rows={3} style={{ ...inputStyle, marginBottom: 18, resize: "vertical" }} />
      {err && <div style={{ color: C.magenta, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <button onClick={save} disabled={saving || uploading} style={{ fontWeight: 700, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 999, padding: "11px 26px", fontSize: 14, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Enter the Let Out"}</button>
    </div>
  );
}

function RadioBar() {
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState("");
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const widgetRef = useRef(null);
  const iframeRef = useRef(null);
  const configured = !/YOUR_HANDLE|YOUR_PLAYLIST/.test(RADIO_URL);

  useEffect(() => {
    if (!configured) return;
    let widget;
    const init = () => {
      if (!iframeRef.current || !window.SC || !window.SC.Widget) return;
      widget = window.SC.Widget(iframeRef.current);
      widgetRef.current = widget;
      const E = window.SC.Widget.Events;
      widget.bind(E.READY, () => {
        widget.play(); // try to start on its own; browsers may block until a tap
        widget.getCurrentSound((s) => { if (s && s.title) setTrack(s.title); });
        setTimeout(() => widget.isPaused((p) => { if (p) setHint(true); }), 1200);
      });
      widget.bind(E.PLAY, () => { setPlaying(true); setHint(false); widget.getCurrentSound((s) => { if (s && s.title) setTrack(s.title); }); });
      widget.bind(E.PAUSE, () => setPlaying(false));
      widget.bind(E.FINISH, () => widget.getCurrentSound((s) => { if (s && s.title) setTrack(s.title); }));
    };
    if (window.SC && window.SC.Widget) init();
    else {
      let s = document.getElementById("sc-widget-api");
      if (!s) { s = document.createElement("script"); s.id = "sc-widget-api"; s.src = "https://w.soundcloud.com/player/api.js"; s.onload = init; document.body.appendChild(s); }
      else s.addEventListener("load", init);
    }
  }, [configured]);

  const toggle = () => { const w = widgetRef.current; if (!w) return; w.toggle(); setHint(false); };
  const next = () => { const w = widgetRef.current; if (w) { w.next(); setHint(false); } };
  const prev = () => { const w = widgetRef.current; if (w) { w.prev(); setHint(false); } };
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(RADIO_URL)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&color=%23ff3d7f`;

  return (
    <div className="radiobar" style={{ background: "rgba(20,16,31,0.98)", borderTop: `1px solid ${C.borderHot}`, backdropFilter: "blur(10px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={prev} disabled={!configured} title="Previous" style={{ display: "flex", background: "none", border: "none", color: configured ? C.muted : C.mutedDim, cursor: configured ? "pointer" : "default", padding: 4 }}><SkipBack size={17} /></button>
          <button onClick={toggle} disabled={!configured} title={playing ? "Pause" : "Play"} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, border: "none", cursor: configured ? "pointer" : "default", background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink }}>
            {playing ? <Pause size={18} fill={C.ink} /> : <Play size={18} fill={C.ink} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={next} disabled={!configured} title="Next" style={{ display: "flex", background: "none", border: "none", color: configured ? C.muted : C.mutedDim, cursor: configured ? "pointer" : "default", padding: 4 }}><SkipForward size={17} /></button>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, flexShrink: 0, background: playing ? C.magenta : C.mutedDim, boxShadow: playing ? `0 0 6px ${C.magenta}` : "none" }} />
            <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: playing ? C.magenta : C.muted }}>{playing ? "On Air" : "Off Air"}</span>
            <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.mutedDim }} className="hide-sm">· {RADIO_LABEL}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
            {!configured ? "Set your SoundCloud URL to go live" : hint ? "Tap play to tune in" : track || "Loading the station…"}
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} disabled={!configured} title={open ? "Collapse" : "Browse the station"} style={{ display: "flex", background: "none", border: "none", color: C.muted, cursor: configured ? "pointer" : "default", padding: 4, flexShrink: 0 }}>
          <Radio size={18} />
        </button>
      </div>
      <div style={{ height: open ? 166 : 0, overflow: "hidden", transition: "height .2s", maxWidth: 1000, margin: "0 auto" }}>
        {configured && <iframe ref={iframeRef} title={RADIO_LABEL} allow="autoplay" scrolling="no" frameBorder="no" src={src} style={{ width: "100%", height: 166, border: 0, display: "block" }} />}
      </div>
    </div>
  );
}

/* ========================================================================== */
export default function Forum() {
  const [posts, setPosts] = useState([]);
  const [votes, setVotes] = useState({});
  const [comments, setComments] = useState([]);
  const [cVotes, setCVotes] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [view, setView] = useState("feed");
  const [tagFilter, setTagFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState("hot");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", tags: [], media_url: null, media_type: null, link_url: "" });
  const [profileData, setProfileData] = useState(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteMsg, setInviteMsg] = useState(null);
  const redeemed = useRef(false);

  const loadFeed = useCallback(async () => {
    const { data, error } = await supabase.from("post_feed").select("*").order("created_at", { ascending: false });
    if (!error && data) setPosts(data);
    setLoading(false);
  }, []);
  const loadMyVotes = useCallback(async (userId) => {
    const { data } = await supabase.from("votes").select("post_id, value").eq("user_id", userId);
    const map = {}; (data || []).forEach((v) => (map[v.post_id] = v.value === 1 ? "up" : "down")); setVotes(map);
  }, []);
  const hydrateUser = useCallback(async (user) => {
    let { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof) { await supabase.from("profiles").insert({ id: user.id, onboarded: false }); prof = { id: user.id, onboarded: false }; }
    const sug = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (user.email ? user.email.split("@")[0] : "");
    setMe({ ...prof, email: user.email, suggestion: sug.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20) });
    if (!prof.onboarded) setView("onboarding");
    await loadMyVotes(user.id);
  }, [loadMyVotes]);

  useEffect(() => {
    let active = true;
    let tok = null;
    try { tok = new URLSearchParams(window.location.search).get("invite"); } catch {}
    if (tok) setInviteToken(tok);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session && session.user) await hydrateUser(session.user);
      else if (tok) setShowSignIn(true);
      await loadFeed();
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Keep this callback synchronous. Awaiting a Supabase query inside it can
      // deadlock gotrue's lock and stop the session from restoring on refresh.
      if (session && session.user) {
        setShowSignIn(false);
        setTimeout(() => { hydrateUser(session.user); }, 0);
      } else if (event === "SIGNED_OUT") {
        setMe(null); setVotes({}); setView("feed");
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [hydrateUser, loadFeed]);

  useEffect(() => {
    if (!me || !me.id || !inviteToken || redeemed.current) return;
    redeemed.current = true;
    (async () => {
      const { error } = await supabase.rpc("redeem_invite", { invite_token: inviteToken });
      try { const u = new URL(window.location.href); u.searchParams.delete("invite"); window.history.replaceState({}, "", u.pathname + u.search); } catch {}
      setInviteToken(null);
      if (error) setInviteMsg(/duplicate|unique|one_active|23505|already/i.test(error.message || "") ? "You're already in a house — leave it first to join a new one." : "That invite link isn't valid anymore.");
      else { setInviteMsg("You're in! Welcome to the house."); if (me.onboarded) setView("houses"); }
      setTimeout(() => setInviteMsg(null), 6000);
    })();
  }, [me, inviteToken]);

  const requireIdentity = () => { if (!me) { setShowSignIn(true); return false; } if (!me.onboarded) { setView("onboarding"); return false; } return true; };

  const applyVote = async (postId, dir) => {
    if (!requireIdentity()) return;
    const prevVote = votes[postId];
    const prevScore = (posts.find((p) => p.id === postId) || {}).score;
    const next = prevVote === dir ? null : dir;
    let delta = 0;
    if (dir === "up") delta = prevVote === "up" ? -1 : prevVote === "down" ? 2 : 1;
    if (dir === "down") delta = prevVote === "down" ? 1 : prevVote === "up" ? -2 : -1;
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, score: p.score + delta } : p)));
    setVotes((prev) => ({ ...prev, [postId]: next || undefined }));
    let error;
    if (next === null) ({ error } = await supabase.from("votes").delete().eq("post_id", postId).eq("user_id", me.id));
    else ({ error } = await supabase.from("votes").upsert({ post_id: postId, user_id: me.id, value: next === "up" ? 1 : -1 }, { onConflict: "post_id,user_id" }));
    if (error) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, score: prevScore } : p)));
      setVotes((prev) => ({ ...prev, [postId]: prevVote || undefined }));
      setVoteError("Vote didn't save: " + error.message); console.error("vote failed:", error); setTimeout(() => setVoteError(null), 5000);
    }
  };
  const voteComment = async (commentId, dir) => {
    if (!requireIdentity()) return;
    const prev = cVotes[commentId];
    const prevScore = (comments.find((c) => c.id === commentId) || {}).score;
    const next = prev === dir ? null : dir;
    let delta = 0;
    if (dir === "up") delta = prev === "up" ? -1 : prev === "down" ? 2 : 1;
    if (dir === "down") delta = prev === "down" ? 1 : prev === "up" ? -2 : -1;
    setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, score: c.score + delta } : c)));
    setCVotes((v) => ({ ...v, [commentId]: next || undefined }));
    let error;
    if (next === null) ({ error } = await supabase.from("comment_votes").delete().eq("comment_id", commentId).eq("user_id", me.id));
    else ({ error } = await supabase.from("comment_votes").upsert({ comment_id: commentId, user_id: me.id, value: next === "up" ? 1 : -1 }, { onConflict: "comment_id,user_id" }));
    if (error) {
      setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, score: prevScore } : c)));
      setCVotes((v) => ({ ...v, [commentId]: prev || undefined }));
      setVoteError("Vote didn't save: " + error.message); setTimeout(() => setVoteError(null), 5000);
    }
  };

  const goHome = () => { setTagFilter(null); setQuery(""); setView("feed"); };
  const filterByTag = (tag) => { setTagFilter(tag); setView("feed"); };

  const loadComments = useCallback(async (postId, user) => {
    const { data } = await supabase.from("comment_feed").select("*").eq("post_id", postId).order("created_at", { ascending: true });
    setComments(data || []);
    if (user && data && data.length) {
      const ids = data.map((c) => c.id);
      const { data: cv } = await supabase.from("comment_votes").select("comment_id,value").eq("user_id", user.id).in("comment_id", ids);
      const map = {}; (cv || []).forEach((v) => (map[v.comment_id] = v.value === 1 ? "up" : "down")); setCVotes(map);
    } else setCVotes({});
  }, []);
  const openPost = async (id) => {
    setSelectedId(id); setView("post"); setReplyTo(null); setComments([]);
    await loadComments(id, me);
  };
  const openProfile = async (username) => {
    setView("profile"); setProfileData(null);
    const { data } = await supabase.from("profiles").select("id,username,house,scene,bio,avatar_url,avatar_color").eq("username", username).single();
    let trophies = [];
    if (data && data.id) {
      const { data: tr } = await supabase.from("ball_results_feed").select("category_name,ball_name,ball_date,winner_house_display,winner_house_name").eq("winner_profile_id", data.id).order("ball_date", { ascending: false });
      trophies = tr || [];
    }
    setProfileData(data ? { ...data, trophies } : { username, trophies: [] });
  };

  const submitPost = async () => {
    if (!requireIdentity() || !draft.title.trim() || busy) return;
    setBusy(true);
    const tags = draft.tags.slice(0, MAX_TAGS);
    const { data, error } = await supabase.from("posts").insert({ author_id: me.id, category: tags[0] || null, tags, title: draft.title.trim(), body: draft.body.trim(), media_url: draft.media_url, media_type: draft.media_type, link_url: draft.link_url && draft.link_url.trim() ? draft.link_url.trim() : null }).select("id").single();
    if (!error && data) {
      await supabase.from("votes").upsert({ post_id: data.id, user_id: me.id, value: 1 }, { onConflict: "post_id,user_id" });
      setDraft({ title: "", body: "", tags: [], media_url: null, media_type: null, link_url: "" });
      await loadFeed(); await loadMyVotes(me.id); await openPost(data.id);
    }
    setBusy(false);
  };
  const submitComment = async (parentId, text, imageUrl) => {
    const body = (text || "").trim();
    if (!requireIdentity() || (!body && !imageUrl) || !selectedId || busy) return;
    setBusy(true);
    const { error } = await supabase.from("comments").insert({ post_id: selectedId, author_id: me.id, body: body || null, image_url: imageUrl || null, parent_id: parentId || null });
    if (!error) {
      if (parentId) setReplyTo(null);
      await loadComments(selectedId, me);
      setPosts((prev) => prev.map((p) => (p.id === selectedId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p)));
    }
    setBusy(false);
  };

  const createProfile = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) { console.error("anonymous sign-in error:", error); const detail = error.message && error.message !== "{}" ? error.message : (error.code || ("HTTP " + (error.status || "?"))); setAuthError("Couldn't start a profile: " + detail + ". If it mentions a server/database error, re-run schema.sql; if it says anonymous is disabled, enable it in Supabase → Authentication → Providers."); }
  };
  const signInGoogle = async () => { await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); };
  const sendMagicLink = async () => { if (!email.trim()) return; const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } }); if (!error) setLinkSent(true); };
  const signOut = async () => { await supabase.auth.signOut(); setView("feed"); goHome(); };
  const onProfileSaved = async (updated) => { setMe((prev) => ({ ...prev, ...updated })); await loadFeed(); if (me) await loadMyVotes(me.id); setView("feed"); };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (tagFilter && !(p.tags || []).includes(tagFilter)) return false;
      if (q) {
        const hay = (p.title + " " + (p.body || "") + " " + (p.tags || []).join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list];
    if (sort === "hot") list.sort((a, b) => b.score + b.comment_count * 3 - (a.score + a.comment_count * 3));
    if (sort === "top") list.sort((a, b) => b.score - a.score);
    if (sort === "new") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [posts, tagFilter, query, sort]);

  const selected = posts.find((p) => p.id === selectedId);
  const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 12px", width: "100%", outline: "none", fontSize: 14 };
  const pill = (bg, color) => ({ background: bg, color, borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" });
  const railBtn = (active) => ({ display: "flex", alignItems: "center", gap: 8, width: "100%", fontWeight: 700, padding: "9px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", color: active ? C.ink : C.text, background: active ? C.gold : "transparent" });

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.text }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 60, borderBottom: `1px solid ${C.border}`, background: "rgba(20,16,31,0.85)", backdropFilter: "blur(10px)" }}>
        <button onClick={goHome} style={{ display: "flex", alignItems: "baseline", gap: 8, background: "none", border: "none", cursor: "pointer" }}>
          <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.16em", fontSize: 20, color: C.text }}>THE LET OUT</span>
          <span className="hide-sm" style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: 9, color: C.magenta, fontWeight: 700 }}>the scene, owned by us</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { if (requireIdentity()) setView("create"); }} className="hide-sm" style={{ ...pill(`linear-gradient(135deg, ${C.magenta}, ${C.violet})`, C.ink), display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} strokeWidth={2.6} /> Post</button>
          {me ? (
            <>
              <button onClick={() => me.username ? openProfile(me.username) : setView("onboarding")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><Avatar name={me.username} url={me.avatar_url} color={me.avatar_color} /></button>
              <button onClick={signOut} title="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><LogOut size={18} /></button>
            </>
          ) : <button onClick={() => setShowSignIn(true)} style={pill(C.panel, C.text)}>Sign in</button>}
        </div>
      </header>

      <div style={{ display: "flex", maxWidth: 1000, margin: "0 auto" }}>
        <aside className="rail" style={{ flexShrink: 0, padding: "20px 12px", width: 200, borderRight: `1px solid ${C.border}` }}>
          <button onClick={goHome} style={railBtn(view === "feed")}><Home size={16} /> Home</button>
          <button onClick={() => setView("houses")} style={railBtn(view === "houses")}><Users size={16} /> Houses</button>
          <button onClick={() => setView("balls")} style={{ ...railBtn(view === "balls"), marginBottom: 12 }}><Calendar size={16} /> Balls</button>
          <div style={{ textTransform: "uppercase", fontWeight: 700, padding: "0 8px", marginBottom: 8, fontSize: 10, letterSpacing: "0.18em", color: C.mutedDim }}>Tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 6px" }}>
            {SUGGESTED_TAGS.map((t) => <button key={t} onClick={() => filterByTag(t)} style={{ fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 999, border: `1px solid ${tagFilter === t ? C.violet : C.border}`, background: tagFilter === t ? `${C.violet}22` : "transparent", color: tagFilter === t ? C.violet : C.muted, cursor: "pointer" }}>#{t}</button>)}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
          {loading ? <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
            : view === "onboarding" && me ? <ProfileForm mode="onboard" me={me} initial={{ username: me.username || me.suggestion }} onSaved={onProfileSaved} />
            : view === "edit" && me ? <ProfileForm mode="edit" me={me} initial={me} onSaved={(u) => { onProfileSaved(u); openProfile(u.username); }} onCancel={() => me.username && openProfile(me.username)} />
            : (
              <>
                {view === "feed" && <Feed visible={visible} sort={sort} setSort={setSort} query={query} setQuery={setQuery} tagFilter={tagFilter} setTagFilter={setTagFilter} votes={votes} applyVote={applyVote} openPost={openPost} openProfile={openProfile} onTag={filterByTag} />}
                {view === "houses" && <Houses me={me} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} openProfile={openProfile} />}
                {view === "balls" && <Balls me={me} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} openProfile={openProfile} />}
                {view === "post" && selected && <PostDetail post={selected} comments={comments} cVotes={cVotes} voteComment={voteComment} vote={votes[selected.id]} applyVote={applyVote} back={() => setView("feed")} openProfile={openProfile} onTag={filterByTag} me={me} submitComment={submitComment} replyTo={replyTo} setReplyTo={setReplyTo} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} busy={busy} />}
                {view === "profile" && profileData && <Profile profile={profileData} posts={posts} openPost={openPost} back={() => setView("feed")} isMe={!!(me && me.username && me.username === profileData.username)} onEdit={() => setView("edit")} />}
                {view === "create" && me && <Create draft={draft} setDraft={setDraft} submitPost={submitPost} back={() => setView("feed")} inputStyle={inputStyle} busy={busy} me={me} />}
              </>
            )}
        </main>
      </div>

      {voteError && <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", zIndex: 40, background: C.panel, border: `1px solid ${C.magenta}`, color: C.text, borderRadius: 10, padding: "10px 16px", fontSize: 13, maxWidth: "90%" }}>{voteError}</div>}
      {inviteMsg && <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", zIndex: 40, background: C.panel, border: `1px solid ${C.gold}`, color: C.text, borderRadius: 10, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, maxWidth: "90%", textAlign: "center" }}>{inviteMsg}</div>}

      {showSignIn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(8,6,14,0.7)" }} onClick={() => { setShowSignIn(false); setLinkSent(false); setAuthError(null); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.borderHot}`, borderRadius: 18, padding: 24, width: 380, maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 16 }}>Walk in</span>
              <button onClick={() => { setShowSignIn(false); setLinkSent(false); setAuthError(null); }} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {linkSent ? <p style={{ color: C.text, fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>Check <strong>{email}</strong> for a sign-in link. Open it on this device and you're back in — same account, whether you're new or returning.</p>
              : (
                <>
                  <div style={{ textTransform: "uppercase", fontWeight: 700, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim, margin: "8px 0 10px" }}>Sign in or back in</div>
                  <button onClick={signInGoogle} style={{ width: "100%", fontWeight: 700, marginBottom: 12, background: "#fff", color: "#1a1a1a", borderRadius: 10, padding: 11, border: "none", cursor: "pointer", fontSize: 14 }}>Continue with Google</button>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" style={{ ...inputStyle, marginBottom: 10 }} />
                  <button onClick={sendMagicLink} style={{ width: "100%", fontWeight: 700, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11, cursor: "pointer", fontSize: 14 }}>Email me a sign-in link</button>
                  <p style={{ color: C.mutedDim, fontSize: 11.5, lineHeight: 1.5, margin: "10px 0 0" }}>Use the same Google or email as before and you'll land right back in your account — no password, on any device.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px", color: C.mutedDim, fontSize: 11 }}><div style={{ height: 1, background: C.border, flex: 1 }} /> NEW HERE? <div style={{ height: 1, background: C.border, flex: 1 }} /></div>
                  <button onClick={createProfile} style={{ width: "100%", fontWeight: 800, marginBottom: 8, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 10, padding: 12, border: "none", cursor: "pointer", fontSize: 14.5 }}>Create a name-only profile</button>
                  <p style={{ color: C.mutedDim, fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>Fastest way in — no email needed. But a name-only profile lives only in this browser and can't be recovered if it's cleared or you switch devices. Add Google or email anytime to lock it in.</p>
                  {authError && <div style={{ color: C.magenta, fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>{authError}</div>}
                </>
              )}
          </div>
        </div>
      )}

      <RadioBar />

      <nav className="bottomnav">
        {[
          { k: "home", icon: <Home size={20} />, label: "Home", on: goHome, active: view === "feed" },
          { k: "houses", icon: <Users size={20} />, label: "Houses", on: () => setView("houses"), active: view === "houses" },
          { k: "balls", icon: <Calendar size={20} />, label: "Balls", on: () => setView("balls"), active: view === "balls" },
          { k: "post", icon: <Plus size={20} />, label: "Post", on: () => { if (requireIdentity()) setView("create"); }, active: view === "create" },
        ].map((t) => (
          <button key={t.k} onClick={t.on} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: "9px 0", color: t.active ? C.magenta : C.muted, fontSize: 10.5, fontWeight: 700 }}>{t.icon}{t.label}</button>
        ))}
      </nav>

      <style>{`
        .bottomnav { display: none; }
        .radiobar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 24; }
        main { padding-bottom: 84px !important; }
        @media (max-width: 760px) {
          .rail { display: none !important; }
          .hide-sm { display: none !important; }
          main { padding-bottom: 150px !important; }
          .radiobar { bottom: 58px; }
          .bottomnav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; background: rgba(20,16,31,0.97); border-top: 1px solid ${C.border}; backdrop-filter: blur(10px); padding-bottom: env(safe-area-inset-bottom); }
        }
      `}</style>
    </div>
  );
}

/* ---------- subviews ---------- */
function Byline({ author, house, avatar, color, size, openProfile }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted }}>
      <Avatar name={author} url={avatar} color={color} size={size} />
      <button onClick={() => author && openProfile(author)} style={{ fontWeight: 700, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{author || "unknown"}</button>
      {house ? <span style={{ color: C.violet, fontWeight: 600 }}>· {house}</span> : null}
    </div>
  );
}

function Feed({ visible, sort, setSort, query, setQuery, tagFilter, setTagFilter, votes, applyVote, openPost, openProfile, onTag }) {
  return (
    <div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.mutedDim }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the forum…" style={{ width: "100%", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, color: C.text, padding: "10px 14px 10px 36px", outline: "none", fontSize: 14 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        {tagFilter ? (
          <button onClick={() => setTagFilter(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: C.violet, background: `${C.violet}22`, border: `1px solid ${C.violet}55`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>#{tagFilter} <X size={14} /></button>
        ) : <div style={{ color: C.mutedDim, fontSize: 13, fontWeight: 600 }}>All posts</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.panel, borderRadius: 999, padding: 3 }}>{["hot", "new", "top"].map((s) => <button key={s} onClick={() => setSort(s)} style={{ textTransform: "uppercase", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", color: sort === s ? C.ink : C.muted, background: sort === s ? C.gold : "transparent" }}>{s}</button>)}</div>
      </div>
      {visible.length === 0 ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>{query || tagFilter ? "Nothing matches that." : "Nothing here yet. Be the first to post."}</div>
        : visible.map((p) => <PostCard key={p.id} post={p} vote={votes[p.id]} applyVote={applyVote} openPost={openPost} openProfile={openProfile} onTag={onTag} />)}
    </div>
  );
}

function PostCard({ post, vote, applyVote, openPost, openProfile, onTag }) {
  return (
    <div style={{ display: "flex", gap: 12, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
          <Byline author={post.author} house={post.author_house} avatar={post.author_avatar} color={post.author_color} size={20} openProfile={openProfile} />
          <span style={{ color: C.mutedDim, fontSize: 12.5 }}>· {timeAgo(post.created_at)}</span>
        </div>
        <button onClick={() => openPost(post.id)} style={{ textAlign: "left", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <h2 style={{ fontWeight: 700, lineHeight: 1.3, margin: "0 0 4px", fontSize: 16.5, color: C.text }}>{post.title}</h2>
          {post.body ? <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, margin: 0 }} className="line-clamp-2">{post.body}</p> : null}
        </button>
        {post.media_url ? <MediaView url={post.media_url} type={post.media_type} maxHeight={280} /> : null}
        {post.link_url ? <LinkEmbed url={post.link_url} /> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {(post.tags || []).map((t) => <TagChip key={t} tag={t} onClick={() => onTag(t)} />)}
          <button onClick={() => openPost(post.id)} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: C.muted, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}><MessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}</button>
        </div>
      </div>
    </div>
  );
}

function CommentComposer({ me, onSubmit, busy, placeholder, submitLabel = "Reply", onCancel, compact }) {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: compact ? "9px 11px" : "10px 12px", width: "100%", outline: "none", fontSize: compact ? 13.5 : 14, resize: "vertical" };
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setUploading(true);
    const ext = (file.name.split(".").pop() || "gif").toLowerCase();
    const path = `comment/${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (!error) { const { data } = supabase.storage.from("media").getPublicUrl(path); setImg(data.publicUrl); }
    setUploading(false);
  };
  const canSend = (text.trim() || img) && !busy && !uploading;
  const send = () => { if (!canSend) return; onSubmit(text, img); setText(""); setImg(null); };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={compact ? 2 : 3} style={inputStyle} autoFocus={!!onCancel} />
      {img && <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}><img src={img} alt="" style={{ maxHeight: 160, borderRadius: 10, display: "block" }} /><button onClick={() => setImg(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: 999, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button></div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, background: C.panel2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}><ImageIcon size={14} /> {uploading ? "Uploading…" : "Meme / GIF"}</button>
        <div style={{ display: "flex", gap: 8 }}>
          {onCancel && <button onClick={onCancel} style={{ fontWeight: 600, fontSize: 12.5, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>cancel</button>}
          <button onClick={send} disabled={!canSend} style={{ fontWeight: 700, fontSize: 12.5, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 999, padding: "6px 16px", border: "none", cursor: canSend ? "pointer" : "not-allowed", opacity: canSend ? 1 : 0.5 }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function CommentNode({ node, depth, cVotes, voteComment, me, replyTo, setReplyTo, submitComment, openProfile, promptSignIn, goOnboard, busy }) {
  const startReply = () => { if (!me) return promptSignIn(); if (!me.onboarded) return goOnboard(); setReplyTo(node.id); };
  const wrapMargin = depth === 0 ? 0 : depth < 6 ? 14 : 4;
  return (
    <div>
      <div style={{ padding: "10px 0", borderTop: depth === 0 ? `1px solid ${C.border}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, fontSize: 12 }}>
          <Avatar name={node.author} url={node.author_avatar} color={node.author_color} size={24} />
          <button onClick={() => node.author && openProfile(node.author)} style={{ fontWeight: 700, color: C.text, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{node.author || "unknown"}</button>
          {node.author_house ? <span style={{ color: C.violet, fontWeight: 600 }}>· {node.author_house}</span> : null}
          <span style={{ color: C.mutedDim }}>· {timeAgo(node.created_at)}</span>
        </div>
        {node.body ? <p style={{ color: C.text, fontSize: 14, lineHeight: 1.55, margin: "0 0 7px", whiteSpace: "pre-wrap" }}>{node.body}</p> : null}
        {node.image_url ? <img src={node.image_url} alt="" style={{ maxHeight: 260, maxWidth: "100%", borderRadius: 10, margin: "0 0 8px", display: "block", border: `1px solid ${C.border}` }} /> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CommentVote score={node.score} vote={cVotes[node.id]} onUp={() => voteComment(node.id, "up")} onDown={() => voteComment(node.id, "down")} />
          <button onClick={startReply} style={{ fontWeight: 700, fontSize: 12.5, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reply</button>
        </div>
        {replyTo === node.id && <CommentComposer me={me} onSubmit={(t, img) => submitComment(node.id, t, img)} onCancel={() => setReplyTo(null)} busy={busy} placeholder={"Reply to " + (node.author || "this")} compact />}
      </div>
      {node.children && node.children.length > 0 && (
        <div style={{ marginLeft: wrapMargin, borderLeft: `1px solid ${C.border}`, paddingLeft: 10 }}>
          {node.children.map((child) => <CommentNode key={child.id} node={child} depth={depth + 1} cVotes={cVotes} voteComment={voteComment} me={me} replyTo={replyTo} setReplyTo={setReplyTo} submitComment={submitComment} openProfile={openProfile} promptSignIn={promptSignIn} goOnboard={goOnboard} busy={busy} />)}
        </div>
      )}
    </div>
  );
}

function PostDetail({ post, comments, cVotes, voteComment, vote, applyVote, back, openProfile, onTag, me, submitComment, replyTo, setReplyTo, promptSignIn, goOnboard, busy }) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const canReply = me && me.onboarded;
  const topLabel = !me ? "Sign in to reply" : "Finish your profile to reply";
  return (
    <div>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← back</button>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <Byline author={post.author} house={post.author_house} avatar={post.author_avatar} color={post.author_color} size={22} openProfile={openProfile} />
              <span style={{ color: C.mutedDim, fontSize: 12.5 }}>· {timeAgo(post.created_at)}</span>
            </div>
            <h1 style={{ fontWeight: 900, lineHeight: 1.15, margin: "0 0 12px", fontSize: 22 }}>{post.title}</h1>
            {post.body ? <p style={{ color: C.text, fontSize: 15, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>{post.body}</p> : null}
            {post.media_url ? <MediaView url={post.media_url} type={post.media_type} /> : null}
            {post.link_url ? <LinkEmbed url={post.link_url} /> : null}
            {(post.tags || []).length ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>{post.tags.map((t) => <TagChip key={t} tag={t} onClick={() => onTag(t)} />)}</div> : null}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>{comments.length} {comments.length === 1 ? "reply" : "replies"}</div>
      <div style={{ marginBottom: 14 }}>
        {canReply
          ? <CommentComposer me={me} onSubmit={(t, img) => submitComment(null, t, img)} busy={busy} placeholder="Add your reply…" submitLabel="Reply" />
          : <button onClick={!me ? promptSignIn : goOnboard} style={{ fontWeight: 700, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "10px 18px", fontSize: 13, cursor: "pointer" }}>{topLabel}</button>}
      </div>
      {tree.map((node) => <CommentNode key={node.id} node={node} depth={0} cVotes={cVotes} voteComment={voteComment} me={me} replyTo={replyTo} setReplyTo={setReplyTo} submitComment={submitComment} openProfile={openProfile} promptSignIn={promptSignIn} goOnboard={goOnboard} busy={busy} />)}
    </div>
  );
}

function Profile({ profile, posts, openPost, back, isMe, onEdit }) {
  const theirs = posts.filter((p) => p.author === profile.username);
  const total = theirs.reduce((s, p) => s + p.score, 0);
  const sl = sceneLabel(profile.scene);
  const trophies = profile.trophies || [];
  return (
    <div>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← back</button>
      <div style={{ background: `linear-gradient(135deg, ${C.panel2}, ${C.panel})`, border: `1px solid ${C.borderHot}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar name={profile.username} url={profile.avatar_url} color={profile.avatar_color} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 900, margin: "0 0 5px", fontSize: 24 }}>{profile.username || "unknown"}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profile.house ? <span style={{ fontSize: 12, fontWeight: 700, color: C.violet, border: `1px solid ${C.violet}55`, borderRadius: 999, padding: "2px 10px" }}>{profile.house}</span> : null}
              {sl ? <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 999, padding: "2px 10px" }}>{sl}</span> : null}
            </div>
          </div>
          {isMe && <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}><Pencil size={14} /> Edit</button>}
        </div>
        {profile.bio ? <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.6, margin: "16px 0 0" }}>{profile.bio}</p> : null}
        <div style={{ color: C.muted, fontSize: 13, marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>{theirs.length} posts · {total} upvotes</span>
          {trophies.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.gold, fontWeight: 700 }}><Trophy size={13} /> {trophies.length} {trophies.length === 1 ? "win" : "wins"}</span> : null}
        </div>
      </div>

      {trophies.length > 0 && (
        <>
          <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, display: "flex", alignItems: "center", gap: 7 }}><Trophy size={13} /> Trophies</div>
          {trophies.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: "11px 14px", marginBottom: 8 }}>
              <Trophy size={17} style={{ color: C.gold, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{t.category_name}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{t.ball_name}{t.winner_house_display || t.winner_house_name ? " · " + (t.winner_house_display || t.winner_house_name) : ""}</div>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>Posts</div>
      {theirs.length === 0 ? <div style={{ color: C.muted, fontSize: 14 }}>No posts yet.</div>
        : theirs.map((p) => (
          <button key={p.id} onClick={() => openPost(p.id)} style={{ display: "block", width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: C.text }}>{p.title}</div>
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4 }}>{p.score} upvotes · {p.comment_count} replies · {timeAgo(p.created_at)}</div>
          </button>
        ))}
    </div>
  );
}

function Create({ draft, setDraft, submitPost, back, inputStyle, busy, me }) {
  const ready = draft.title.trim().length > 0;
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const [customTag, setCustomTag] = useState("");
  const fileRef = useRef(null);
  const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };

  const toggleTag = (t) => {
    setDraft((d) => {
      const has = d.tags.includes(t);
      if (has) return { ...d, tags: d.tags.filter((x) => x !== t) };
      if (d.tags.length >= MAX_TAGS) return d;
      return { ...d, tags: [...d.tags, t] };
    });
  };
  const addCustom = () => {
    const t = normTag(customTag);
    if (!t) return;
    setDraft((d) => (d.tags.includes(t) || d.tags.length >= MAX_TAGS ? d : { ...d, tags: [...d.tags, t] }));
    setCustomTag("");
  };
  const allTags = Array.from(new Set([...SUGGESTED_TAGS, ...draft.tags]));

  const pickMedia = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setErr(null);
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) { setErr(`That file is over ${MAX_MEDIA_MB}MB. Pick something smaller.`); return; }
    const type = file.type.startsWith("video") ? "video" : "image";
    setUploading(true);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setErr("Upload failed: " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setDraft({ ...draft, media_url: data.publicUrl, media_type: type }); setUploading(false);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>
      <h1 style={{ fontWeight: 900, margin: "0 0 20px", fontSize: 22 }}>New post</h1>
      <label style={label}>Title</label>
      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Say it plainly" style={{ ...inputStyle, marginBottom: 16 }} />
      <label style={label}>Body</label>
      <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Optional with a link or photo." rows={5} style={{ ...inputStyle, marginBottom: 16, resize: "vertical" }} />

      <label style={label}>Tags <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(up to {MAX_TAGS})</span></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {allTags.map((t) => { const on = draft.tags.includes(t); return <button key={t} onClick={() => toggleTag(t)} style={{ fontWeight: 700, fontSize: 12.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C.violet : C.border}`, background: on ? C.violet : "transparent", color: on ? C.ink : C.muted }}>#{t}</button>; })}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="add your own tag" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addCustom} style={{ fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 16px", cursor: "pointer" }}>Add</button>
      </div>

      <label style={label}>Link <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(YouTube, TikTok, Instagram — optional)</span></label>
      <input value={draft.link_url} onChange={(e) => setDraft({ ...draft, link_url: e.target.value })} placeholder="Paste a clip link to embed it" style={{ ...inputStyle, marginBottom: 16 }} />
      {draft.link_url && draft.link_url.trim() ? <div style={{ marginBottom: 16, marginTop: -4 }}><LinkEmbed url={draft.link_url} /></div> : null}

      <label style={label}>Photo or video <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional, up to {MAX_MEDIA_MB}MB)</span></label>
      <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pickMedia} style={{ display: "none" }} />
      {draft.media_url ? <div style={{ marginBottom: 18 }}><MediaView url={draft.media_url} type={draft.media_type} maxHeight={300} rounded={10} /><button onClick={() => setDraft({ ...draft, media_url: null, media_type: null })} style={{ marginTop: 8, color: C.mutedDim, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}>remove</button></div>
        : <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", marginBottom: 18 }}><Camera size={16} /> {uploading ? "Uploading…" : "Add photo or video"}</button>}
      {err && <div style={{ color: C.magenta, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div><button onClick={submitPost} disabled={!ready || busy || uploading} style={{ fontWeight: 700, background: ready ? `linear-gradient(135deg, ${C.magenta}, ${C.violet})` : C.panel2, color: ready ? C.ink : C.mutedDim, borderRadius: 999, padding: "11px 24px", fontSize: 14, border: "none", cursor: ready && !busy ? "pointer" : "not-allowed" }}>{busy ? "Posting…" : "Post"}</button></div>
    </div>
  );
}
