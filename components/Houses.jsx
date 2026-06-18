"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Camera, MapPin, Crown, X, Check, UserMinus, ArrowUp, Calendar, Trash2, Link2, Pencil, UserPlus, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const C = {
  ink: "#14101f", panel: "#1e1830", panel2: "#241c39",
  border: "#322749", borderHot: "#46345f",
  gold: "#e8c66b", magenta: "#ff3d7f", violet: "#a87bff",
  text: "#f4f0fb", muted: "#9a90b3", mutedDim: "#6f6786",
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return Math.floor(s / 604800) + "w";
}
function fmtEvent(iso) {
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return iso; }
}

function Avatar({ name, url, color, size = 32 }) {
  if (url) return <img src={url} alt={name || ""} style={{ width: size, height: size, borderRadius: size, objectFit: "cover", flexShrink: 0, background: C.panel2 }} />;
  const letter = (name || "?")[0].toUpperCase();
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, width: size, height: size, borderRadius: size, background: color || `linear-gradient(135deg, ${C.gold}, ${C.violet})`, color: C.ink, fontSize: size * 0.42 }}>{letter}</div>;
}

function HouseLogo({ name, url, size = 56 }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: 14, objectFit: "cover", flexShrink: 0, background: C.panel2 }} />;
  const letter = (name || "?")[0].toUpperCase();
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0, width: size, height: size, borderRadius: 14, background: `linear-gradient(135deg, ${C.violet}, ${C.magenta})`, color: C.ink, fontSize: size * 0.4 }}>{letter}</div>;
}

function TitleBadge({ title, isLeader }) {
  if (!title && !isLeader) return null;
  const color = isLeader ? C.gold : C.violet;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color, border: `1px solid ${color}55`, borderRadius: 999, padding: "1px 8px" }}>{isLeader ? <Crown size={11} /> : null} {title || "Leader"}</span>;
}

const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 12px", width: "100%", outline: "none", fontSize: 14 };
const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };

export default function Houses({ me, promptSignIn, goOnboard, openProfile }) {
  const [hview, setHview] = useState("list");
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myActive, setMyActive] = useState(null);
  const [house, setHouse] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [houseTrophies, setHouseTrophies] = useState([]);
  const [evt, setEvt] = useState({ title: "", date: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [form, setForm] = useState({ name: "", city: "", description: "", logo_url: null, title: "" });
  const [addUser, setAddUser] = useState("");
  const [inviteUrl, setInviteUrl] = useState(null);
  const [editTitle, setEditTitle] = useState(null); // { userId, value }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const gate = () => { if (!me) { promptSignIn(); return false; } if (!me.onboarded) { goOnboard(); return false; } return true; };

  const loadHouses = useCallback(async () => {
    const { data } = await supabase.from("houses_directory").select("*").order("member_count", { ascending: false });
    setHouses(data || []); setLoading(false);
  }, []);

  const loadMyActive = useCallback(async () => {
    if (!me) { setMyActive(null); return; }
    const { data } = await supabase.from("house_memberships").select("house_id").eq("user_id", me.id).eq("status", "active").maybeSingle();
    if (data && data.house_id) {
      const { data: h } = await supabase.from("houses").select("id,name").eq("id", data.house_id).single();
      setMyActive(h ? { id: h.id, name: h.name } : null);
    } else setMyActive(null);
  }, [me]);

  useEffect(() => { loadHouses(); loadMyActive(); }, [loadHouses, loadMyActive]);

  const openHouse = useCallback(async (id) => {
    setHview("detail"); setHouse(null); setMembers([]); setMessages([]); setEvents([]); setHouseTrophies([]); setMsgText(""); setErr(null); setInviteUrl(null); setAddUser(""); setEditTitle(null);
    const { data: h } = await supabase.from("houses_directory").select("*").eq("id", id).single();
    setHouse(h);
    const { data: trophies } = await supabase.from("ball_results_feed").select("category_name,ball_name,ball_date,winner_username").eq("winner_house_id", id).order("ball_date", { ascending: false });
    setHouseTrophies(trophies || []);
    const { data: m } = await supabase.from("house_members").select("*").eq("house_id", id).order("created_at", { ascending: true });
    setMembers(m || []);
    // messages only load if active member (RLS will simply return nothing otherwise)
    if (me) {
      const mine = (m || []).find((x) => x.user_id === me.id);
      if (mine && mine.status === "active") {
        const { data: msgs } = await supabase.from("house_messages").select("id,body,created_at,author_id").eq("house_id", id).order("created_at", { ascending: true });
        // attach author info from members list
        const byId = {}; (m || []).forEach((x) => (byId[x.user_id] = x));
        setMessages((msgs || []).map((x) => ({ ...x, author: byId[x.author_id] })));
        const { data: evs } = await supabase.from("house_events").select("*").eq("house_id", id).order("event_date", { ascending: true });
        setEvents(evs || []);
      }
    }
  }, [me]);

  const myMembership = me && members.find((x) => x.user_id === me.id);
  const iAmLeader = myMembership && myMembership.status === "active" && myMembership.is_leader === true;
  const iAmFounder = myMembership && house && me && house.founder_id === me.id;
  const iAmActive = myMembership && myMembership.status === "active";

  const uploadLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setErr(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `house/${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (error) { setErr("Logo upload failed: " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setForm((f) => ({ ...f, logo_url: data.publicUrl + "?t=" + Date.now() })); setUploading(false);
  };

  const createHouse = async () => {
    if (!gate() || !form.name.trim() || busy) return;
    if (myActive) { setErr("You're already in " + myActive.name + ". Leave it before founding a new house."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("houses").insert({ name: form.name.trim(), city: form.city.trim() || null, description: form.description.trim() || null, logo_url: form.logo_url, founder_id: me.id }).select("id").single();
    if (error) { setErr(error.code === "23505" ? "A house with that name already exists." : "Could not create: " + error.message); setBusy(false); return; }
    await supabase.from("house_memberships").insert({ house_id: data.id, user_id: me.id, status: "active", is_leader: true, title: form.title.trim() || "Mother" });
    setForm({ name: "", city: "", description: "", logo_url: null, title: "" });
    setBusy(false);
    await loadHouses(); await loadMyActive();
    openHouse(data.id);
  };

  const requestJoin = async () => {
    if (!gate() || !house || busy) return;
    if (myActive && myActive.id !== house.id) { setErr("You're in " + myActive.name + ". Leave it before joining another house."); return; }
    setBusy(true);
    const { error } = await supabase.from("house_memberships").insert({ house_id: house.id, user_id: me.id, status: "pending" });
    if (error) setErr("Couldn't request to join: " + error.message);
    setBusy(false); openHouse(house.id);
  };
  const leaveHouse = async () => {
    if (!house || busy) return;
    setBusy(true);
    await supabase.from("house_memberships").delete().eq("house_id", house.id).eq("user_id", me.id);
    setBusy(false); await loadMyActive(); openHouse(house.id);
  };
  const setMemberStatus = async (userId, status) => {
    setBusy(true);
    const { error } = await supabase.from("house_memberships").update({ status }).eq("house_id", house.id).eq("user_id", userId);
    if (error) setErr(error.code === "23505" ? "That person is already active in another house and must leave it first." : "Could not update: " + error.message);
    setBusy(false); openHouse(house.id);
  };
  const removeMember = async (userId) => {
    setBusy(true);
    await supabase.from("house_memberships").delete().eq("house_id", house.id).eq("user_id", userId);
    setBusy(false); openHouse(house.id);
  };
  const toggleLeader = async (userId, makeLeader) => {
    setBusy(true);
    await supabase.from("house_memberships").update({ is_leader: makeLeader }).eq("house_id", house.id).eq("user_id", userId);
    setBusy(false); openHouse(house.id);
  };
  const saveTitle = async (userId) => {
    if (!editTitle || busy) return;
    setBusy(true);
    await supabase.from("house_memberships").update({ title: editTitle.value.trim() || "Member" }).eq("house_id", house.id).eq("user_id", userId);
    setEditTitle(null); setBusy(false); openHouse(house.id);
  };
  const addByUsername = async () => {
    const name = addUser.trim();
    if (!name || busy) return;
    setBusy(true); setErr(null);
    const { data: prof } = await supabase.from("profiles").select("id").ilike("username", name).maybeSingle();
    if (!prof) { setErr("No one here goes by “" + name + "”. Check the spelling."); setBusy(false); return; }
    const { error } = await supabase.from("house_memberships").insert({ house_id: house.id, user_id: prof.id, status: "active", is_leader: false, title: "Member" });
    if (error) setErr(error.code === "23505" ? "That person is already in a house — they'd have to leave it first." : "Couldn't add them: " + error.message);
    else setAddUser("");
    setBusy(false); openHouse(house.id);
  };
  const createInvite = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("house_invites").insert({ house_id: house.id, created_by: me.id }).select("token").single();
    setBusy(false);
    if (error || !data) { setErr("Couldn't make an invite link: " + (error ? error.message : "unknown")); return; }
    const url = window.location.origin + "/?invite=" + data.token;
    setInviteUrl(url);
    try { await navigator.clipboard.writeText(url); } catch {}
  };
  const postMessage = async () => {
    if (!msgText.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("house_messages").insert({ house_id: house.id, author_id: me.id, body: msgText.trim() });
    if (!error) { setMsgText(""); openHouse(house.id); }
    setBusy(false);
  };
  const addEvent = async () => {
    if (!evt.title.trim() || !evt.date || busy) return;
    setBusy(true);
    const { error } = await supabase.from("house_events").insert({ house_id: house.id, title: evt.title.trim(), event_date: new Date(evt.date).toISOString(), note: evt.note.trim() || null, created_by: me.id });
    if (!error) { setEvt({ title: "", date: "", note: "" }); openHouse(house.id); }
    setBusy(false);
  };
  const deleteEvent = async (id) => {
    setBusy(true);
    await supabase.from("house_events").delete().eq("id", id);
    setBusy(false); openHouse(house.id);
  };

  /* ---------- LIST ---------- */
  if (hview === "list") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>Houses</h1>
          <button onClick={() => { if (gate()) { setForm({ name: "", city: "", description: "", logo_url: null, title: "" }); setErr(null); setHview("create"); } }} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Plus size={16} strokeWidth={2.6} /> Create a house</button>
        </div>
        {loading ? <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
          : houses.length === 0 ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>No houses yet. Start the first one.</div>
          : houses.map((h) => (
            <button key={h.id} onClick={() => openHouse(h.id)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12, cursor: "pointer" }}>
              <HouseLogo name={h.name} url={h.logo_url} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16.5, color: C.text }}>{h.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.muted, fontSize: 12.5, marginTop: 3 }}>
                  {h.city ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {h.city}</span> : null}
                  <span>{h.member_count} {h.member_count === 1 ? "member" : "members"}</span>
                </div>
              </div>
            </button>
          ))}
      </div>
    );
  }

  /* ---------- CREATE ---------- */
  if (hview === "create") {
    return (
      <div style={{ maxWidth: 520 }}>
        <button onClick={() => setHview("list")} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>
        <h1 style={{ fontWeight: 900, margin: "0 0 4px", fontSize: 24 }}>Start a house</h1>
        <p style={{ color: C.muted, fontSize: 14, margin: "0 0 22px" }}>You lead the house. Set your own title — Mother, Father, Overall, whatever you go by.</p>
        {myActive && <div style={{ color: C.magenta, fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>You're already in {myActive.name}. You can only be in one house at a time — leave it first to found a new one.</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <HouseLogo name={form.name} url={form.logo_url} size={72} />
          <div>
            <input ref={fileRef} type="file" accept="image/*" onChange={uploadLogo} style={{ display: "none" }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Camera size={15} /> {uploading ? "Uploading…" : form.logo_url ? "Change logo" : "Upload logo"}</button>
          </div>
        </div>
        <label style={label}>House name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. House of Gabbana" style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>Your title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mother" style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>City <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
        <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Miami" style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>Description <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the house is about." rows={4} style={{ ...inputStyle, marginBottom: 18, resize: "vertical" }} />
        {err && <div style={{ color: C.magenta, fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <button onClick={createHouse} disabled={!form.name.trim() || busy || uploading || !!myActive} style={{ fontWeight: 700, background: form.name.trim() && !myActive ? `linear-gradient(135deg, ${C.magenta}, ${C.violet})` : C.panel2, color: form.name.trim() && !myActive ? C.ink : C.mutedDim, borderRadius: 999, padding: "11px 26px", fontSize: 14, border: "none", cursor: form.name.trim() && !busy && !myActive ? "pointer" : "not-allowed" }}>{busy ? "Creating…" : "Create house"}</button>
      </div>
    );
  }

  /* ---------- DETAIL ---------- */
  if (!house) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>;
  const actives = members.filter((m) => m.status === "active");
  const pendings = members.filter((m) => m.status === "pending");

  return (
    <div>
      <button onClick={() => { setHview("list"); loadHouses(); }} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← all houses</button>
      <div style={{ background: `linear-gradient(135deg, ${C.panel2}, ${C.panel})`, border: `1px solid ${C.borderHot}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <HouseLogo name={house.name} url={house.logo_url} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 900, margin: "0 0 4px", fontSize: 24 }}>{house.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted, fontSize: 13 }}>
              {house.city ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={13} /> {house.city}</span> : null}
              <span>{actives.length} {actives.length === 1 ? "member" : "members"}</span>
            </div>
          </div>
          {me && (
            !myMembership ? (
              myActive && myActive.id !== house.id
                ? <span style={{ fontSize: 12.5, color: C.muted, maxWidth: 190, textAlign: "right", lineHeight: 1.4 }}>You're in {myActive.name}. Leave it to join another house.</span>
                : <button onClick={requestJoin} disabled={busy} style={{ fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>Request to join</button>
            )
            : myMembership.status === "pending" ? <span style={{ fontWeight: 700, fontSize: 13, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 999, padding: "8px 14px" }}>Requested</span>
            : !iAmFounder ? <button onClick={leaveHouse} disabled={busy} style={{ fontWeight: 700, fontSize: 13, background: C.panel2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>Leave</button>
            : null
          )}
        </div>
        {house.description ? <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.6, margin: "16px 0 0" }}>{house.description}</p> : null}
      </div>
      {err && <div style={{ color: C.magenta, fontSize: 13, marginTop: 12 }}>{err}</div>}

      {houseTrophies.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Trophy size={13} /> Trophies · {houseTrophies.length}</div>
          {houseTrophies.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: "11px 14px", marginBottom: 8 }}>
              <Trophy size={17} style={{ color: C.gold, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{t.category_name}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{t.ball_name}{t.winner_username ? " · " + t.winner_username : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* pending requests (leaders only) */}
      {iAmLeader && pendings.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10 }}>Requests ({pendings.length})</div>
          {pendings.map((m) => (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 8 }}>
              <Avatar name={m.username} url={m.avatar_url} color={m.avatar_color} size={32} />
              <button onClick={() => openProfile(m.username)} style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14, color: C.text, background: "none", border: "none", cursor: "pointer" }}>{m.username || "unknown"}</button>
              <button onClick={() => setMemberStatus(m.user_id, "active")} disabled={busy} title="Approve" style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5, background: C.magenta, color: C.ink, border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}><Check size={14} /> Approve</button>
              <button onClick={() => removeMember(m.user_id)} disabled={busy} title="Reject" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer" }}><X size={17} /></button>
            </div>
          ))}
        </div>
      )}

      {/* members */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>Members</div>
          {iAmLeader && <button onClick={createInvite} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}><Link2 size={14} /> Invite link</button>}
        </div>

        {iAmLeader && inviteUrl && (
          <div style={{ background: C.panel2, border: `1px solid ${C.borderHot}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 4 }}>Link copied — send it via text or DM</div>
            <div style={{ fontSize: 12.5, color: C.muted, wordBreak: "break-all" }}>{inviteUrl}</div>
            <div style={{ fontSize: 11.5, color: C.mutedDim, marginTop: 4 }}>Anyone who opens it joins {house.name} (if they're not already in a house).</div>
          </div>
        )}

        {iAmLeader && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <UserPlus size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.mutedDim }} />
              <input value={addUser} onChange={(e) => setAddUser(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addByUsername(); }} placeholder="Add a member by username" style={{ ...inputStyle, paddingLeft: 34 }} />
            </div>
            <button onClick={addByUsername} disabled={busy || !addUser.trim()} style={{ fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 16px", cursor: "pointer", opacity: busy || !addUser.trim() ? 0.6 : 1 }}>Add</button>
          </div>
        )}

        {actives.map((m) => {
          const isMe = me && m.user_id === me.id;
          const isHouseFounder = house.founder_id === m.user_id;
          const editing = editTitle && editTitle.userId === m.user_id;
          return (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
              <Avatar name={m.username} url={m.avatar_url} color={m.avatar_color} size={34} />
              <button onClick={() => openProfile(m.username)} style={{ fontWeight: 700, fontSize: 14.5, color: C.text, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{m.username || "unknown"}</button>
              {editing ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input value={editTitle.value} onChange={(e) => setEditTitle({ ...editTitle, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(m.user_id); }} autoFocus style={{ ...inputStyle, padding: "3px 8px", width: 120, fontSize: 12.5 }} />
                  <button onClick={() => saveTitle(m.user_id)} disabled={busy} style={{ display: "flex", background: "none", border: "none", color: C.gold, cursor: "pointer", padding: 2 }}><Check size={15} /></button>
                  <button onClick={() => setEditTitle(null)} style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 2 }}><X size={15} /></button>
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <TitleBadge title={m.title} isLeader={m.is_leader} />
                  {iAmLeader && <button onClick={() => setEditTitle({ userId: m.user_id, value: m.title || "" })} title="Edit title" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 2 }}><Pencil size={12} /></button>}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {iAmLeader && !isMe && !isHouseFounder && (
                <>
                  {m.is_leader
                    ? <button onClick={() => toggleLeader(m.user_id, false)} disabled={busy} style={{ fontSize: 12, fontWeight: 700, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>remove leader</button>
                    : <button onClick={() => toggleLeader(m.user_id, true)} disabled={busy} title="Make leader" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: C.gold, background: "none", border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}><Crown size={13} /> make leader</button>}
                  <button onClick={() => removeMember(m.user_id)} disabled={busy} title="Remove" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer" }}><UserMinus size={16} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* calendar */}
      {iAmActive && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Calendar size={13} /> Calendar <span style={{ color: C.mutedDim, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>· practices & events</span></div>
          <div style={{ background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <input value={evt.title} onChange={(e) => setEvt({ ...evt, title: e.target.value })} placeholder="What's happening (e.g. Thursday practice)" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input type="datetime-local" value={evt.date} onChange={(e) => setEvt({ ...evt, date: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
              <input value={evt.note} onChange={(e) => setEvt({ ...evt, note: e.target.value })} placeholder="Note (optional)" style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={addEvent} disabled={busy || !evt.title.trim() || !evt.date} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer", opacity: busy || !evt.title.trim() || !evt.date ? 0.6 : 1 }}><Plus size={15} strokeWidth={2.6} /> Add to calendar</button>
            </div>
          </div>
          {events.length === 0 ? <div style={{ color: C.mutedDim, fontSize: 13 }}>Nothing scheduled yet.</div>
            : events.map((ev) => {
              const past = new Date(ev.event_date) < new Date();
              return (
                <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderTop: `1px solid ${C.border}`, opacity: past ? 0.55 : 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 10, background: C.panel2, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: C.magenta }}>{new Date(ev.event_date).toLocaleString(undefined, { month: "short" })}</span>
                    <span style={{ fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1 }}>{new Date(ev.event_date).getDate()}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{ev.title}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{fmtEvent(ev.event_date)}</div>
                    {ev.note ? <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{ev.note}</div> : null}
                  </div>
                  {(ev.created_by === me.id || iAmLeader) && <button onClick={() => deleteEvent(ev.id)} disabled={busy} title="Remove" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 4 }}><Trash2 size={15} /></button>}
                </div>
              );
            })}
        </div>
      )}

      {/* private board */}
      <div style={{ marginTop: 26 }}>
        <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10 }}>House board <span style={{ color: C.mutedDim, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>· members only</span></div>
        {!iAmActive ? (
          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 20, textAlign: "center", color: C.muted, fontSize: 13.5 }}>Join the house to see and post on the private board.</div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Message your house…" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button onClick={postMessage} disabled={busy || !msgText.trim()} style={{ fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "7px 16px", cursor: "pointer", opacity: busy || !msgText.trim() ? 0.6 : 1 }}>Send</button>
              </div>
            </div>
            {messages.length === 0 ? <div style={{ color: C.mutedDim, fontSize: 13 }}>No messages yet.</div>
              : messages.map((m) => (
                <div key={m.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
                  <Avatar name={m.author && m.author.username} url={m.author && m.author.avatar_url} color={m.author && m.author.avatar_color} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}><span style={{ fontWeight: 700, color: C.text }}>{(m.author && m.author.username) || "member"}</span> · {timeAgo(m.created_at)}</div>
                    <p style={{ color: C.text, fontSize: 14, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
