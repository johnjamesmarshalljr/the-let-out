"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronUp, ChevronDown, MessageCircle, Plus, Home, X, LogOut, Camera, Pencil, Film, Users, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Houses from "@/components/Houses";
import Balls from "@/components/Balls";

const C = {
  ink: "#14101f", panel: "#1e1830", panel2: "#241c39",
  border: "#322749", borderHot: "#46345f",
  gold: "#e8c66b", magenta: "#ff3d7f", violet: "#a87bff",
  text: "#f4f0fb", muted: "#9a90b3", mutedDim: "#6f6786",
};
const ROOMS = ["performance", "runway", "organizing", "balls", "music", "history"];
const AVATAR_COLORS = ["#ff3d7f", "#a87bff", "#e8c66b", "#5fd6e0", "#5fe0a0", "#ff8a5f"];
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
const MAX_MEDIA_MB = 50;

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
function buildTree(flat) {
  const byId = {};
  flat.forEach((c) => (byId[c.id] = { ...c, children: [] }));
  const roots = [];
  flat.forEach((c) => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children.push(byId[c.id]);
    else roots.push(byId[c.id]);
  });
  return roots;
}

function Avatar({ name, url, color, size = 32 }) {
  if (url) return <img src={url} alt={name || ""} style={{ width: size, height: size, borderRadius: size, objectFit: "cover", flexShrink: 0, background: C.panel2 }} />;
  const letter = (name || "?")[0].toUpperCase();
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, width: size, height: size, borderRadius: size, background: color || `linear-gradient(135deg, ${C.gold}, ${C.violet})`, color: C.ink, fontSize: size * 0.42 }}>{letter}</div>;
}

/* vertical paddle for posts */
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

/* compact horizontal vote for comments */
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

function MediaView({ url, type, rounded = 12, maxHeight }) {
  if (!url) return null;
  const common = { width: "100%", borderRadius: rounded, marginTop: 12, background: "#000", display: "block" };
  if (type === "video") return <video src={url} controls preload="metadata" style={{ ...common, maxHeight: maxHeight || 480 }} />;
  return <img src={url} alt="" style={{ ...common, maxHeight: maxHeight || 480, objectFit: "contain" }} />;
}

/* ---------- profile form (onboarding + edit) ---------- */
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setErr(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setErr("Photo upload failed: " + error.message + " — check the 'avatars' storage bucket exists."); setUploading(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl + "?t=" + Date.now()); setUploading(false);
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
      <p style={{ color: C.muted, fontSize: 14, margin: "0 0 22px" }}>{mode === "edit" ? "Update how you show up on the Let Out." : "This is how the scene sees you here. Pick a name — the rest is optional and you can change it anytime."}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <Avatar name={username || initial.username} url={avatarUrl} color={avatarColor} size={72} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Camera size={15} /> {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}</button>
          {avatarUrl && <button onClick={() => setAvatarUrl(null)} style={{ display: "block", marginTop: 8, color: C.mutedDim, fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>remove photo</button>}
        </div>
      </div>
      {!avatarUrl && (
        <div style={{ marginBottom: 20 }}>
          <label style={label}>Icon color</label>
          <div style={{ display: "flex", gap: 10 }}>{AVATAR_COLORS.map((col) => <button key={col} onClick={() => setAvatarColor(col)} style={{ width: 30, height: 30, borderRadius: 30, background: col, cursor: "pointer", border: avatarColor === col ? `3px solid ${C.text}` : `2px solid ${C.border}` }} />)}</div>
        </div>
      )}
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

/* ========================================================================== */
export default function Forum() {
  const [posts, setPosts] = useState([]);
  const [votes, setVotes] = useState({});
  const [comments, setComments] = useState([]);
  const [cVotes, setCVotes] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [view, setView] = useState("feed");
  const [room, setRoom] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState("hot");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", room: "performance", media_url: null, media_type: null });
  const [commentText, setCommentText] = useState("");
  const [profileData, setProfileData] = useState(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voteError, setVoteError] = useState(null);

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
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session && session.user) await hydrateUser(session.user);
      await loadFeed();
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session && session.user) { await hydrateUser(session.user); setShowSignIn(false); }
      else { setMe(null); setVotes({}); setView("feed"); }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [hydrateUser, loadFeed]);

  const requireIdentity = () => {
    if (!me) { setShowSignIn(true); return false; }
    if (!me.onboarded) { setView("onboarding"); return false; }
    return true;
  };

  /* post voting — toggle: click the active arrow again to remove your vote */
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

  /* comment voting — same toggle behavior */
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
      setVoteError("Vote didn't save: " + error.message); console.error("comment vote failed:", error); setTimeout(() => setVoteError(null), 5000);
    }
  };

  const navTo = (r) => { setRoom(r); setView("feed"); };

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
    setSelectedId(id); setView("post"); setCommentText(""); setReplyTo(null); setReplyText(""); setComments([]);
    await loadComments(id, me);
  };

  const openProfile = async (username) => {
    setView("profile"); setProfileData(null);
    const { data } = await supabase.from("profiles").select("username,house,scene,bio,avatar_url,avatar_color").eq("username", username).single();
    setProfileData(data || { username });
  };

  const submitPost = async () => {
    if (!requireIdentity() || !draft.title.trim() || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from("posts").insert({ author_id: me.id, category: draft.room, title: draft.title.trim(), body: draft.body.trim(), media_url: draft.media_url, media_type: draft.media_type }).select("id").single();
    if (!error && data) {
      await supabase.from("votes").upsert({ post_id: data.id, user_id: me.id, value: 1 }, { onConflict: "post_id,user_id" });
      setDraft({ title: "", body: "", room: "performance", media_url: null, media_type: null });
      await loadFeed(); await loadMyVotes(me.id); await openPost(data.id);
    }
    setBusy(false);
  };

  const submitComment = async (parentId, text) => {
    if (!requireIdentity() || !text.trim() || !selectedId || busy) return;
    setBusy(true);
    const { error } = await supabase.from("comments").insert({ post_id: selectedId, author_id: me.id, body: text.trim(), parent_id: parentId || null });
    if (!error) {
      if (parentId) { setReplyTo(null); setReplyText(""); } else setCommentText("");
      await loadComments(selectedId, me);
      setPosts((prev) => prev.map((p) => (p.id === selectedId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p)));
    }
    setBusy(false);
  };

  const createProfile = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("anonymous sign-in error:", error);
      const detail = error.message && error.message !== "{}" ? error.message : (error.code || ("HTTP " + (error.status || "?")));
      setAuthError("Couldn't start a profile: " + detail + ". If this mentions a server/database error, re-run schema.sql; if it says anonymous is disabled, enable it in Supabase → Authentication → Providers (and click Save).");
    }
  };
  const signInGoogle = async () => { await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); };
  const sendMagicLink = async () => { if (!email.trim()) return; const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } }); if (!error) setLinkSent(true); };
  const signOut = async () => { await supabase.auth.signOut(); setView("feed"); setRoom("home"); };

  const onProfileSaved = async (updated) => { setMe((prev) => ({ ...prev, ...updated })); await loadFeed(); if (me) await loadMyVotes(me.id); setView("feed"); };

  const visible = useMemo(() => {
    let list = room === "home" ? posts : posts.filter((p) => p.category === room);
    list = [...list];
    if (sort === "hot") list.sort((a, b) => b.score + b.comment_count * 3 - (a.score + a.comment_count * 3));
    if (sort === "top") list.sort((a, b) => b.score - a.score);
    if (sort === "new") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [posts, room, sort]);

  const selected = posts.find((p) => p.id === selectedId);
  const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 12px", width: "100%", outline: "none", fontSize: 14 };
  const pill = (bg, color) => ({ background: bg, color, borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" });

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.text }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 60, borderBottom: `1px solid ${C.border}`, background: "rgba(20,16,31,0.85)", backdropFilter: "blur(10px)" }}>
        <button onClick={() => navTo("home")} style={{ display: "flex", alignItems: "baseline", gap: 8, background: "none", border: "none", cursor: "pointer" }}>
          <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.16em", fontSize: 20, color: C.text }}>THE LET OUT</span>
          <span className="hide-sm" style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: 9, color: C.magenta, fontWeight: 700 }}>the scene, owned by us</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { if (requireIdentity()) setView("create"); }} style={{ ...pill(`linear-gradient(135deg, ${C.magenta}, ${C.violet})`, C.ink), display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} strokeWidth={2.6} /> Post</button>
          {me ? (
            <>
              <button onClick={() => me.username ? openProfile(me.username) : setView("onboarding")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><Avatar name={me.username} url={me.avatar_url} color={me.avatar_color} /></button>
              <button onClick={signOut} title="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><LogOut size={18} /></button>
            </>
          ) : (
            <button onClick={() => setShowSignIn(true)} style={pill(C.panel, C.text)}>Sign in</button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", maxWidth: 1000, margin: "0 auto" }}>
        <aside className="rail" style={{ flexShrink: 0, padding: "20px 12px", width: 200, borderRight: `1px solid ${C.border}` }}>
          <button onClick={() => navTo("home")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontWeight: 700, marginBottom: 4, padding: "9px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", color: view === "feed" && room === "home" ? C.ink : C.text, background: view === "feed" && room === "home" ? C.gold : "transparent" }}><Home size={16} /> Home</button>
          <button onClick={() => setView("houses")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontWeight: 700, marginBottom: 4, padding: "9px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", color: view === "houses" ? C.ink : C.text, background: view === "houses" ? C.gold : "transparent" }}><Users size={16} /> Houses</button>
          <button onClick={() => setView("balls")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontWeight: 700, marginBottom: 12, padding: "9px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", color: view === "balls" ? C.ink : C.text, background: view === "balls" ? C.gold : "transparent" }}><Calendar size={16} /> Balls</button>
          <div style={{ textTransform: "uppercase", fontWeight: 700, padding: "0 8px", marginBottom: 8, fontSize: 10, letterSpacing: "0.18em", color: C.mutedDim }}>Categories</div>
          {ROOMS.map((r) => <button key={r} onClick={() => navTo(r)} style={{ display: "block", width: "100%", textAlign: "left", fontWeight: 600, padding: "8px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", background: room === r ? C.panel2 : "transparent", color: room === r ? C.text : C.muted }}>{r}</button>)}
        </aside>

        <main style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
          {loading ? <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
            : view === "onboarding" && me ? <ProfileForm mode="onboard" me={me} initial={{ username: me.username || me.suggestion }} onSaved={onProfileSaved} />
            : view === "edit" && me ? <ProfileForm mode="edit" me={me} initial={me} onSaved={(u) => { onProfileSaved(u); openProfile(u.username); }} onCancel={() => me.username && openProfile(me.username)} />
            : (
              <>
                {view === "feed" && <Feed visible={visible} room={room} sort={sort} setSort={setSort} votes={votes} applyVote={applyVote} openPost={openPost} openProfile={openProfile} />}
                {view === "houses" && <Houses me={me} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} openProfile={openProfile} />}
                {view === "balls" && <Balls me={me} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} openProfile={openProfile} />}
                {view === "post" && selected && (
                  <PostDetail post={selected} comments={comments} cVotes={cVotes} voteComment={voteComment} vote={votes[selected.id]} applyVote={applyVote} back={() => setView("feed")} openProfile={openProfile} me={me} commentText={commentText} setCommentText={setCommentText} submitComment={submitComment} replyTo={replyTo} setReplyTo={setReplyTo} replyText={replyText} setReplyText={setReplyText} promptSignIn={() => setShowSignIn(true)} goOnboard={() => setView("onboarding")} inputStyle={inputStyle} busy={busy} />
                )}
                {view === "profile" && profileData && <Profile profile={profileData} posts={posts} openPost={openPost} back={() => setView("feed")} isMe={!!(me && me.username && me.username === profileData.username)} onEdit={() => setView("edit")} />}
                {view === "create" && me && <Create draft={draft} setDraft={setDraft} submitPost={submitPost} back={() => setView("feed")} inputStyle={inputStyle} busy={busy} me={me} />}
              </>
            )}
        </main>
      </div>

      {voteError && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 40, background: C.panel, border: `1px solid ${C.magenta}`, color: C.text, borderRadius: 10, padding: "10px 16px", fontSize: 13, maxWidth: "90%" }}>{voteError}</div>}

      {showSignIn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(8,6,14,0.7)" }} onClick={() => { setShowSignIn(false); setLinkSent(false); setAuthError(null); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.borderHot}`, borderRadius: 18, padding: 24, width: 380, maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 16 }}>Walk in</span>
              <button onClick={() => { setShowSignIn(false); setLinkSent(false); setAuthError(null); }} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {linkSent ? (
              <p style={{ color: C.text, fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>Check <strong>{email}</strong> for a sign-in link. Open it on this device and you're in.</p>
            ) : (
              <>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Pick a name and you're in. No email required.</p>
                <button onClick={createProfile} style={{ width: "100%", fontWeight: 800, marginBottom: 8, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 10, padding: 12, border: "none", cursor: "pointer", fontSize: 14.5 }}>Create a profile</button>
                <p style={{ color: C.mutedDim, fontSize: 11.5, lineHeight: 1.5, margin: "0 0 16px" }}>A name-only profile lives on this device. Use Google or email below to keep it across devices.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px", color: C.mutedDim, fontSize: 11 }}><div style={{ height: 1, background: C.border, flex: 1 }} /> OR <div style={{ height: 1, background: C.border, flex: 1 }} /></div>
                <button onClick={signInGoogle} style={{ width: "100%", fontWeight: 700, marginBottom: 12, background: "#fff", color: "#1a1a1a", borderRadius: 10, padding: 11, border: "none", cursor: "pointer", fontSize: 14 }}>Continue with Google</button>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" style={{ ...inputStyle, marginBottom: 10 }} />
                <button onClick={sendMagicLink} style={{ width: "100%", fontWeight: 700, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11, cursor: "pointer", fontSize: 14 }}>Email me a sign-in link</button>
                {authError && <div style={{ color: C.magenta, fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>{authError}</div>}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@media (max-width: 760px){ .rail{display:none !important} .hide-sm{display:none !important} }`}</style>
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
function Toolbar({ room, sort, setSort }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
      <h1 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{room === "home" ? "Home" : room}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.panel, borderRadius: 999, padding: 3 }}>{["hot", "new", "top"].map((s) => <button key={s} onClick={() => setSort(s)} style={{ textTransform: "uppercase", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", color: sort === s ? C.ink : C.muted, background: sort === s ? C.gold : "transparent" }}>{s}</button>)}</div>
    </div>
  );
}
function PostCard({ post, vote, applyVote, openPost, openProfile }) {
  return (
    <div style={{ display: "flex", gap: 12, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: C.violet, fontSize: 12.5 }}>{post.category}</span>
          <span style={{ color: C.mutedDim }}>·</span>
          <Byline author={post.author} house={post.author_house} avatar={post.author_avatar} color={post.author_color} size={20} openProfile={openProfile} />
          <span style={{ color: C.mutedDim, fontSize: 12.5 }}>· {timeAgo(post.created_at)}</span>
        </div>
        <button onClick={() => openPost(post.id)} style={{ textAlign: "left", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <h2 style={{ fontWeight: 700, lineHeight: 1.3, margin: "0 0 4px", fontSize: 16.5, color: C.text }}>{post.title}</h2>
          {post.body ? <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, margin: 0 }} className="line-clamp-2">{post.body}</p> : null}
        </button>
        {post.media_url ? <MediaView url={post.media_url} type={post.media_type} maxHeight={280} /> : null}
        <button onClick={() => openPost(post.id)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontWeight: 600, color: C.muted, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}><MessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}</button>
      </div>
    </div>
  );
}
function Feed({ visible, room, sort, setSort, votes, applyVote, openPost, openProfile }) {
  return (
    <div>
      <Toolbar room={room} sort={sort} setSort={setSort} />
      {visible.length === 0 ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>Nothing here yet. Be the first to post.</div>
        : visible.map((p) => <PostCard key={p.id} post={p} vote={votes[p.id]} applyVote={applyVote} openPost={openPost} openProfile={openProfile} />)}
    </div>
  );
}

function ReplyComposer({ value, setValue, onSubmit, onCancel, busy, placeholder }) {
  const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "9px 11px", width: "100%", outline: "none", fontSize: 13.5, resize: "vertical" };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={2} style={inputStyle} autoFocus />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <button onClick={onCancel} style={{ fontWeight: 600, fontSize: 12.5, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>cancel</button>
        <button onClick={onSubmit} disabled={busy} style={{ fontWeight: 700, fontSize: 12.5, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 999, padding: "6px 14px", border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Reply</button>
      </div>
    </div>
  );
}

function CommentNode({ node, depth, cVotes, voteComment, me, replyTo, setReplyTo, replyText, setReplyText, submitComment, openProfile, promptSignIn, goOnboard, busy }) {
  const startReply = () => { if (!me) return promptSignIn(); if (!me.onboarded) return goOnboard(); setReplyText(""); setReplyTo(node.id); };
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
        <p style={{ color: C.text, fontSize: 14, lineHeight: 1.55, margin: "0 0 7px", whiteSpace: "pre-wrap" }}>{node.body}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CommentVote score={node.score} vote={cVotes[node.id]} onUp={() => voteComment(node.id, "up")} onDown={() => voteComment(node.id, "down")} />
          <button onClick={startReply} style={{ fontWeight: 700, fontSize: 12.5, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reply</button>
        </div>
        {replyTo === node.id && <ReplyComposer value={replyText} setValue={setReplyText} onSubmit={() => submitComment(node.id, replyText)} onCancel={() => setReplyTo(null)} busy={busy} placeholder={"Reply to " + (node.author || "this")} />}
      </div>
      {node.children && node.children.length > 0 && (
        <div style={{ marginLeft: wrapMargin, borderLeft: `1px solid ${C.border}`, paddingLeft: 10 }}>
          {node.children.map((child) => <CommentNode key={child.id} node={child} depth={depth + 1} cVotes={cVotes} voteComment={voteComment} me={me} replyTo={replyTo} setReplyTo={setReplyTo} replyText={replyText} setReplyText={setReplyText} submitComment={submitComment} openProfile={openProfile} promptSignIn={promptSignIn} goOnboard={goOnboard} busy={busy} />)}
        </div>
      )}
    </div>
  );
}

function PostDetail({ post, comments, cVotes, voteComment, vote, applyVote, back, openProfile, me, commentText, setCommentText, submitComment, replyTo, setReplyTo, replyText, setReplyText, promptSignIn, goOnboard, inputStyle, busy }) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const canReply = me && me.onboarded;
  const topAction = !me ? promptSignIn : !me.onboarded ? goOnboard : () => submitComment(null, commentText);
  const topLabel = !me ? "Sign in to reply" : !me.onboarded ? "Finish your profile to reply" : "Reply";
  return (
    <div>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← back</button>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: C.violet, fontSize: 12.5 }}>{post.category}</span>
              <span style={{ color: C.mutedDim }}>·</span>
              <Byline author={post.author} house={post.author_house} avatar={post.author_avatar} color={post.author_color} size={22} openProfile={openProfile} />
              <span style={{ color: C.mutedDim, fontSize: 12.5 }}>· {timeAgo(post.created_at)}</span>
            </div>
            <h1 style={{ fontWeight: 900, lineHeight: 1.15, margin: "0 0 12px", fontSize: 22 }}>{post.title}</h1>
            {post.body ? <p style={{ color: C.text, fontSize: 15, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>{post.body}</p> : null}
            {post.media_url ? <MediaView url={post.media_url} type={post.media_type} /> : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>{comments.length} {comments.length === 1 ? "reply" : "replies"}</div>

      <div style={{ marginBottom: 14 }}>
        <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={canReply ? "Add your reply…" : topLabel} disabled={!canReply} rows={3} style={{ ...inputStyle, resize: "vertical", opacity: canReply ? 1 : 0.6 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={topAction} disabled={busy} style={{ fontWeight: 700, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 999, padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{topLabel}</button>
        </div>
      </div>

      {tree.map((node) => <CommentNode key={node.id} node={node} depth={0} cVotes={cVotes} voteComment={voteComment} me={me} replyTo={replyTo} setReplyTo={setReplyTo} replyText={replyText} setReplyText={setReplyText} submitComment={submitComment} openProfile={openProfile} promptSignIn={promptSignIn} goOnboard={goOnboard} busy={busy} />)}
    </div>
  );
}

function Profile({ profile, posts, openPost, back, isMe, onEdit }) {
  const theirs = posts.filter((p) => p.author === profile.username);
  const total = theirs.reduce((s, p) => s + p.score, 0);
  const sl = sceneLabel(profile.scene);
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
        <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>{theirs.length} posts · {total} upvotes</div>
      </div>
      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>Posts</div>
      {theirs.length === 0 ? <div style={{ color: C.muted, fontSize: 14 }}>No posts yet.</div>
        : theirs.map((p) => (
          <button key={p.id} onClick={() => openPost(p.id)} style={{ display: "block", width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" }}>
            <div style={{ fontSize: 12, color: C.violet, fontWeight: 700, marginBottom: 4 }}>{p.category}</div>
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
  const fileRef = useRef(null);
  const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };

  const pickMedia = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErr(null);
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) { setErr(`That file is over ${MAX_MEDIA_MB}MB. Pick something smaller.`); return; }
    const type = file.type.startsWith("video") ? "video" : "image";
    setUploading(true);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setErr("Upload failed: " + error.message + " — check the 'media' storage bucket exists."); setUploading(false); return; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setDraft({ ...draft, media_url: data.publicUrl, media_type: type });
    setUploading(false);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>
      <h1 style={{ fontWeight: 900, margin: "0 0 20px", fontSize: 22 }}>New post</h1>
      <label style={label}>Category</label>
      <select value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} style={{ ...inputStyle, marginBottom: 16 }}>{ROOMS.map((r) => <option key={r} value={r} style={{ background: C.ink }}>{r}</option>)}</select>
      <label style={label}>Title</label>
      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Say it plainly" style={{ ...inputStyle, marginBottom: 16 }} />
      <label style={label}>Body</label>
      <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Optional with a photo or video." rows={5} style={{ ...inputStyle, marginBottom: 16, resize: "vertical" }} />

      <label style={label}>Photo or video <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional, up to {MAX_MEDIA_MB}MB)</span></label>
      <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pickMedia} style={{ display: "none" }} />
      {draft.media_url ? (
        <div style={{ marginBottom: 18 }}>
          <MediaView url={draft.media_url} type={draft.media_type} maxHeight={300} rounded={10} />
          <button onClick={() => setDraft({ ...draft, media_url: null, media_type: null })} style={{ marginTop: 8, color: C.mutedDim, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}>remove</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", marginBottom: 18 }}><Film size={16} /> {uploading ? "Uploading…" : "Add photo or video"}</button>
      )}
      {err && <div style={{ color: C.magenta, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div>
        <button onClick={submitPost} disabled={!ready || busy || uploading} style={{ fontWeight: 700, background: ready ? `linear-gradient(135deg, ${C.magenta}, ${C.violet})` : C.panel2, color: ready ? C.ink : C.mutedDim, borderRadius: 999, padding: "11px 24px", fontSize: 14, border: "none", cursor: ready && !busy ? "pointer" : "not-allowed" }}>{busy ? "Posting…" : "Post"}</button>
      </div>
    </div>
  );
}
