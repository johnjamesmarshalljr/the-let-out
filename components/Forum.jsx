"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, MessageCircle, Plus, Home, X, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/* ---------- design tokens (same palette as the approved prototype) ---------- */
const C = {
  ink: "#14101f",
  panel: "#1e1830",
  panel2: "#241c39",
  border: "#322749",
  borderHot: "#46345f",
  gold: "#e8c66b",
  magenta: "#ff3d7f",
  violet: "#a87bff",
  text: "#f4f0fb",
  muted: "#9a90b3",
  mutedDim: "#6f6786",
};

const ROOMS = ["performance", "runway", "organizing", "balls", "music", "history"];

/* ---------- helpers ---------- */
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return Math.floor(s / 604800) + "w";
}

const flex = (extra = {}) => ({ display: "flex", ...extra });

/* ---------- small components ---------- */
function Avatar({ name, size = 32 }) {
  const letter = (name || "?")[0].toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size,
        background: `linear-gradient(135deg, ${C.gold}, ${C.violet})`,
        color: C.ink,
        fontSize: size * 0.42,
      }}
    >
      {letter}
    </div>
  );
}

function Vote({ score, vote, onUp, onDown }) {
  const up = vote === "up";
  const down = vote === "down";
  const btn = (active, activeBg, activeBorder, activeColor, idleColor) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 28,
    borderRadius: 8,
    border: `1px solid ${active ? activeBorder : C.border}`,
    background: active ? activeBg : "transparent",
    color: active ? activeColor : idleColor,
    cursor: "pointer",
    transition: "all .12s",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <button onClick={onUp} title="Upvote" style={btn(up, C.magenta, C.magenta, C.ink, C.muted)}>
        <ChevronUp size={20} strokeWidth={2.6} />
      </button>
      <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "center", color: C.text, fontSize: 14, minWidth: 30 }}>
        {score}
      </div>
      <button onClick={onDown} title="Chop" style={btn(down, `${C.violet}22`, C.violet, C.violet, C.mutedDim)}>
        <ChevronDown size={20} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* ========================================================================== */
export default function Forum() {
  const [posts, setPosts] = useState([]);
  const [votes, setVotes] = useState({}); // postId -> 'up' | 'down'
  const [comments, setComments] = useState([]); // for the open post
  const [view, setView] = useState("feed");
  const [room, setRoom] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState("hot");
  const [me, setMe] = useState(null); // { id, username }
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", room: "performance" });
  const [commentText, setCommentText] = useState("");
  const [profileName, setProfileName] = useState(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);

  /* ----- data loaders ----- */
  const loadFeed = useCallback(async () => {
    const { data, error } = await supabase
      .from("post_feed")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPosts(data);
    setLoading(false);
  }, []);

  const loadMyVotes = useCallback(async (userId) => {
    const { data } = await supabase.from("votes").select("post_id, value").eq("user_id", userId);
    const map = {};
    (data || []).forEach((v) => (map[v.post_id] = v.value === 1 ? "up" : "down"));
    setVotes(map);
  }, []);

  const loadProfile = useCallback(async (user) => {
    const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
    setMe({ id: user.id, username: data?.username || user.email?.split("@")[0] || "you" });
  }, []);

  /* ----- init + auth listener ----- */
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.user) {
        await loadProfile(session.user);
        await loadMyVotes(session.user.id);
      }
      await loadFeed();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadProfile(session.user);
        await loadMyVotes(session.user.id);
        setShowSignIn(false);
      } else {
        setMe(null);
        setVotes({});
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadFeed, loadMyVotes, loadProfile]);

  /* ----- voting ----- */
  const applyVote = async (postId, dir) => {
    if (!me) return setShowSignIn(true);
    const cur = votes[postId];
    const next = cur === dir ? null : dir;

    // optimistic score update
    let delta = 0;
    if (dir === "up") delta = cur === "up" ? -1 : cur === "down" ? 2 : 1;
    if (dir === "down") delta = cur === "down" ? 1 : cur === "up" ? -2 : -1;
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, score: p.score + delta } : p)));
    setVotes((prev) => ({ ...prev, [postId]: next || undefined }));

    if (next === null) {
      const { error } = await supabase.from("votes").delete().eq("post_id", postId).eq("user_id", me.id);
      if (error) console.error("vote remove failed:", error.message);
    } else {
      const { error } = await supabase
        .from("votes")
        .upsert(
          { post_id: postId, user_id: me.id, value: next === "up" ? 1 : -1 },
          { onConflict: "post_id,user_id" }
        );
      if (error) console.error("vote save failed:", error.message);
    }
  };

  /* ----- navigation ----- */
  const navTo = (r) => {
    setRoom(r);
    setView("feed");
  };
  const openPost = async (id) => {
    setSelectedId(id);
    setView("post");
    setCommentText("");
    setComments([]);
    const { data } = await supabase
      .from("comment_feed")
      .select("*")
      .eq("post_id", id)
      .order("created_at", { ascending: true });
    setComments(data || []);
  };
  const openProfile = (name) => {
    setProfileName(name);
    setView("profile");
  };

  /* ----- create post ----- */
  const submitPost = async () => {
    if (!draft.title.trim() || !me || busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("posts")
      .insert({ author_id: me.id, category: draft.room, title: draft.title.trim(), body: draft.body.trim() })
      .select("id")
      .single();
    if (!error && data) {
      await supabase.from("votes").upsert({ post_id: data.id, user_id: me.id, value: 1 });
      setDraft({ title: "", body: "", room: "performance" });
      await loadFeed();
      await loadMyVotes(me.id);
      await openPost(data.id);
    }
    setBusy(false);
  };

  /* ----- comments ----- */
  const submitComment = async () => {
    if (!commentText.trim() || !me || !selectedId || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: selectedId, author_id: me.id, body: commentText.trim() });
    if (!error) {
      setCommentText("");
      const { data } = await supabase
        .from("comment_feed")
        .select("*")
        .eq("post_id", selectedId)
        .order("created_at", { ascending: true });
      setComments(data || []);
      setPosts((prev) => prev.map((p) => (p.id === selectedId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p)));
    }
    setBusy(false);
  };

  /* ----- auth actions ----- */
  const signInGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };
  const signInFacebook = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: window.location.origin },
    });
  };
  const sendMagicLink = async () => {
    if (!email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (!error) setLinkSent(true);
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setView("feed");
    setRoom("home");
  };

  /* ----- derived feed ----- */
  const visible = useMemo(() => {
    let list = room === "home" ? posts : posts.filter((p) => p.category === room);
    list = [...list];
    if (sort === "hot") list.sort((a, b) => b.score + b.comment_count * 3 - (a.score + a.comment_count * 3));
    if (sort === "top") list.sort((a, b) => b.score - a.score);
    if (sort === "new") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [posts, room, sort]);

  const selected = posts.find((p) => p.id === selectedId);

  /* ----- shared styles ----- */
  const inputStyle = {
    background: C.ink,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: "10px 12px",
    width: "100%",
    outline: "none",
    fontSize: 14,
  };
  const pill = (bg, color) => ({
    background: bg,
    color,
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  });

  /* ====================================================================== */
  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.text }}>
      {/* header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 60,
          borderBottom: `1px solid ${C.border}`,
          background: "rgba(20,16,31,0.85)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button onClick={() => navTo("home")} style={{ display: "flex", alignItems: "baseline", gap: 8, background: "none", border: "none", cursor: "pointer" }}>
          <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.16em", fontSize: 20, color: C.text }}>
            THE LET OUT
          </span>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: 9, color: C.magenta, fontWeight: 700 }} className="hide-sm">
            the scene, owned by us
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => (me ? setView("create") : setShowSignIn(true))}
            style={{ ...pill(`linear-gradient(135deg, ${C.magenta}, ${C.violet})`, C.ink), display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={16} strokeWidth={2.6} /> Post
          </button>
          {me ? (
            <>
              <button onClick={() => openProfile(me.username)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <Avatar name={me.username} />
              </button>
              <button onClick={signOut} title="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button onClick={() => setShowSignIn(true)} style={pill(C.panel, C.text)} >
              Sign in
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", maxWidth: 1000, margin: "0 auto" }}>
        {/* left rail */}
        <aside className="rail" style={{ flexShrink: 0, padding: "20px 12px", width: 200, borderRight: `1px solid ${C.border}` }}>
          <button
            onClick={() => navTo("home")}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontWeight: 700, marginBottom: 12, padding: "9px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", color: room === "home" ? C.ink : C.text, background: room === "home" ? C.gold : "transparent" }}
          >
            <Home size={16} /> Home
          </button>
          <div style={{ textTransform: "uppercase", fontWeight: 700, padding: "0 8px", marginBottom: 8, fontSize: 10, letterSpacing: "0.18em", color: C.mutedDim }}>
            Categories
          </div>
          {ROOMS.map((r) => (
            <button
              key={r}
              onClick={() => navTo(r)}
              style={{ display: "block", width: "100%", textAlign: "left", fontWeight: 600, padding: "8px 10px", borderRadius: 9, fontSize: 14, border: "none", cursor: "pointer", background: room === r ? C.panel2 : "transparent", color: room === r ? C.text : C.muted }}
            >
              {r}
            </button>
          ))}
        </aside>

        {/* main */}
        <main style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
          {loading ? (
            <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
          ) : (
            <>
              {view === "feed" && (
                <Feed visible={visible} room={room} sort={sort} setSort={setSort} votes={votes} applyVote={applyVote} openPost={openPost} openProfile={openProfile} />
              )}
              {view === "post" && selected && (
                <PostDetail
                  post={selected}
                  comments={comments}
                  vote={votes[selected.id]}
                  applyVote={applyVote}
                  back={() => setView("feed")}
                  openProfile={openProfile}
                  me={me}
                  commentText={commentText}
                  setCommentText={setCommentText}
                  submitComment={submitComment}
                  promptSignIn={() => setShowSignIn(true)}
                  inputStyle={inputStyle}
                  busy={busy}
                />
              )}
              {view === "profile" && profileName && (
                <Profile name={profileName} posts={posts} openPost={openPost} back={() => setView("feed")} />
              )}
              {view === "create" && me && (
                <Create draft={draft} setDraft={setDraft} submitPost={submitPost} back={() => setView("feed")} inputStyle={inputStyle} busy={busy} />
              )}
            </>
          )}
        </main>
      </div>

      {/* sign-in modal */}
      {showSignIn && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(8,6,14,0.7)" }}
          onClick={() => { setShowSignIn(false); setLinkSent(false); }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.borderHot}`, borderRadius: 18, padding: 24, width: 360, maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 16 }}>Walk in</span>
              <button onClick={() => { setShowSignIn(false); setLinkSent(false); }} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {linkSent ? (
              <p style={{ color: C.text, fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>
                Check <strong>{email}</strong> for a sign-in link. Open it on this device and you're in.
              </p>
            ) : (
              <>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 18 }}>Keep the same identity the scene already knows you by.</p>
                <button onClick={signInGoogle} style={{ width: "100%", fontWeight: 700, marginBottom: 10, background: "#fff", color: "#1a1a1a", borderRadius: 10, padding: 11, border: "none", cursor: "pointer", fontSize: 14 }}>
                  Continue with Google
                </button>
                <button onClick={signInFacebook} style={{ width: "100%", fontWeight: 700, marginBottom: 14, background: "#1877f2", color: "#fff", borderRadius: 10, padding: 11, border: "none", cursor: "pointer", fontSize: 14 }}>
                  Continue with Facebook
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px", color: C.mutedDim, fontSize: 11 }}>
                  <div style={{ height: 1, background: C.border, flex: 1 }} /> OR <div style={{ height: 1, background: C.border, flex: 1 }} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  style={{ ...inputStyle, marginBottom: 10 }}
                />
                <button onClick={sendMagicLink} style={{ width: "100%", fontWeight: 700, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 10, padding: 11, border: "none", cursor: "pointer", fontSize: 14 }}>
                  Email me a sign-in link
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .rail { display: none !important; }
          .hide-sm { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ---------- subviews ---------- */
function Toolbar({ room, sort, setSort }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
      <h1 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{room === "home" ? "Home" : room}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.panel, borderRadius: 999, padding: 3 }}>
        {["hot", "new", "top"].map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={{ textTransform: "uppercase", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", color: sort === s ? C.ink : C.muted, background: sort === s ? C.gold : "transparent" }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function PostCard({ post, vote, applyVote, openPost, openProfile }) {
  return (
    <div style={{ display: "flex", gap: 12, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, color: C.muted }}>
          <span style={{ fontWeight: 700, color: C.violet }}>{post.category}</span>
          <span style={{ color: C.mutedDim }}>·</span>
          <button onClick={() => openProfile(post.author)} style={{ fontWeight: 600, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{post.author}</button>
          <span style={{ color: C.mutedDim }}>· {timeAgo(post.created_at)}</span>
        </div>
        <button onClick={() => openPost(post.id)} style={{ textAlign: "left", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <h2 style={{ fontWeight: 700, lineHeight: 1.3, margin: "0 0 4px", fontSize: 16.5, color: C.text }}>{post.title}</h2>
          {post.body ? <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, margin: 0 }} className="line-clamp-2">{post.body}</p> : null}
        </button>
        <button onClick={() => openPost(post.id)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontWeight: 600, color: C.muted, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <MessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}
        </button>
      </div>
    </div>
  );
}

function Feed({ visible, room, sort, setSort, votes, applyVote, openPost, openProfile }) {
  return (
    <div>
      <Toolbar room={room} sort={sort} setSort={setSort} />
      {visible.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>
          Nothing here yet. Be the first to post.
        </div>
      ) : (
        visible.map((p) => (
          <PostCard key={p.id} post={p} vote={votes[p.id]} applyVote={applyVote} openPost={openPost} openProfile={openProfile} />
        ))
      )}
    </div>
  );
}

function PostDetail({ post, comments, vote, applyVote, back, openProfile, me, commentText, setCommentText, submitComment, promptSignIn, inputStyle, busy }) {
  return (
    <div>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← back</button>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Vote score={post.score} vote={vote} onUp={() => applyVote(post.id, "up")} onDown={() => applyVote(post.id, "down")} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap", fontSize: 12.5, color: C.muted }}>
              <span style={{ fontWeight: 700, color: C.violet }}>{post.category}</span>
              <span style={{ color: C.mutedDim }}>·</span>
              <button onClick={() => openProfile(post.author)} style={{ fontWeight: 600, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{post.author}</button>
              <span style={{ color: C.mutedDim }}>· {timeAgo(post.created_at)}</span>
            </div>
            <h1 style={{ fontWeight: 900, lineHeight: 1.15, margin: "0 0 12px", fontSize: 22 }}>{post.title}</h1>
            {post.body ? <p style={{ color: C.text, fontSize: 15, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>{post.body}</p> : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>
        {comments.length} {comments.length === 1 ? "reply" : "replies"}
      </div>

      <div style={{ marginBottom: 18 }}>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={me ? "Add your reply…" : "Sign in to reply"}
          disabled={!me}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", opacity: me ? 1 : 0.6 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={me ? submitComment : promptSignIn}
            disabled={busy}
            style={{ fontWeight: 700, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, borderRadius: 999, padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {me ? "Reply" : "Sign in to reply"}
          </button>
        </div>
      </div>

      {comments.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
          <Avatar name={c.author} size={30} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12, color: C.muted }}>
              <button onClick={() => openProfile(c.author)} style={{ fontWeight: 600, color: C.text, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{c.author}</button>
              <span style={{ color: C.mutedDim }}>· {timeAgo(c.created_at)}</span>
            </div>
            <p style={{ color: C.text, fontSize: 14, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{c.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Profile({ name, posts, openPost, back }) {
  const theirs = posts.filter((p) => p.author === name);
  const total = theirs.reduce((s, p) => s + p.score, 0);
  return (
    <div>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: `linear-gradient(135deg, ${C.panel2}, ${C.panel})`, border: `1px solid ${C.borderHot}`, borderRadius: 16, padding: 22 }}>
        <Avatar name={name} size={64} />
        <div>
          <h1 style={{ fontWeight: 900, margin: "0 0 4px", fontSize: 22 }}>{name}</h1>
          <div style={{ color: C.muted, fontSize: 13 }}>{theirs.length} posts · {total} upvotes</div>
        </div>
      </div>

      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>Posts</div>
      {theirs.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 14 }}>No posts yet.</div>
      ) : (
        theirs.map((p) => (
          <button key={p.id} onClick={() => openPost(p.id)} style={{ display: "block", width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" }}>
            <div style={{ fontSize: 12, color: C.violet, fontWeight: 700, marginBottom: 4 }}>{p.category}</div>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: C.text }}>{p.title}</div>
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4 }}>{p.score} upvotes · {p.comment_count} replies · {timeAgo(p.created_at)}</div>
          </button>
        ))
      )}
    </div>
  );
}

function Create({ draft, setDraft, submitPost, back, inputStyle, busy }) {
  const ready = draft.title.trim().length > 0;
  const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };
  return (
    <div style={{ maxWidth: 560 }}>
      <button onClick={back} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>
      <h1 style={{ fontWeight: 900, margin: "0 0 20px", fontSize: 22 }}>New post</h1>

      <label style={label}>Category</label>
      <select value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} style={{ ...inputStyle, marginBottom: 16 }}>
        {ROOMS.map((r) => (
          <option key={r} value={r} style={{ background: C.ink }}>{r}</option>
        ))}
      </select>

      <label style={label}>Title</label>
      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Say it plainly" style={{ ...inputStyle, marginBottom: 16 }} />

      <label style={label}>Body</label>
      <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Text only for now." rows={6} style={{ ...inputStyle, marginBottom: 18, resize: "vertical" }} />

      <button
        onClick={submitPost}
        disabled={!ready || busy}
        style={{ fontWeight: 700, background: ready ? `linear-gradient(135deg, ${C.magenta}, ${C.violet})` : C.panel2, color: ready ? C.ink : C.mutedDim, borderRadius: 999, padding: "11px 24px", fontSize: 14, border: "none", cursor: ready && !busy ? "pointer" : "not-allowed" }}
      >
        {busy ? "Posting…" : "Post"}
      </button>
    </div>
  );
}
