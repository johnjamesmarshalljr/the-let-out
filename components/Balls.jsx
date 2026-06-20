"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Camera, MapPin, Calendar, Trash2, ArrowUp, ArrowDown, Pencil, Trophy, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const C = {
  ink: "#14101f", panel: "#1e1830", panel2: "#241c39",
  border: "#322749", borderHot: "#46345f",
  gold: "#e8c66b", magenta: "#ff3d7f", violet: "#a87bff",
  text: "#f4f0fb", muted: "#9a90b3", mutedDim: "#6f6786",
};

const CATEGORY_TYPES = [
  ["performance", "Performance"], ["runway", "Runway"], ["face", "Face"],
  ["realness", "Realness"], ["voguing", "Voguing"], ["fashion", "Fashion"], ["other", "Other"],
];
const TYPE_LABEL = Object.fromEntries(CATEGORY_TYPES);

const inputStyle = { background: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 12px", width: "100%", outline: "none", fontSize: 14 };
const label = { display: "block", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", color: C.mutedDim };

function fmtDate(d) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" }); }
  catch { return d; }
}
function isPast(d) { if (!d) return false; return new Date(d + "T23:59:59") < new Date(); }

function Flyer({ url, name, w = 64, h = 80 }) {
  if (url) return <img src={url} alt="" style={{ width: w, height: h, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: C.panel2 }} />;
  return <div style={{ width: w, height: h, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${C.gold}, ${C.magenta})`, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink, fontWeight: 900, fontSize: w * 0.4 }}>{(name || "?")[0].toUpperCase()}</div>;
}

export default function Balls({ me, promptSignIn, goOnboard, openProfile, jumpBall, onJumped }) {
  const [bview, setBview] = useState("list");
  const [balls, setBalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ball, setBall] = useState(null);
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ name: "", ball_date: "", location: "", description: "", flyer_url: null });
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", category_type: "performance", prize: "" });
  const [results, setResults] = useState({});        // keyed by category_id
  const [editResult, setEditResult] = useState(null); // { categoryId, name, house }
  const [tab, setTab] = useState("balls");            // 'balls' | 'standings'
  const [standings, setStandings] = useState(null);
  const fileRef = useRef(null);

  const gate = () => { if (!me) { promptSignIn(); return false; } if (!me.onboarded) { goOnboard(); return false; } return true; };

  const loadBalls = useCallback(async () => {
    const { data } = await supabase.from("balls_directory").select("*");
    const list = (data || []).slice();
    list.sort((a, b) => {
      const ap = isPast(a.ball_date), bp = isPast(b.ball_date);
      if (ap !== bp) return ap ? 1 : -1;                  // upcoming first
      if (!a.ball_date || !b.ball_date) return 0;
      return ap ? (a.ball_date < b.ball_date ? 1 : -1)    // past: newest first
                : (a.ball_date < b.ball_date ? -1 : 1);   // upcoming: soonest first
    });
    setBalls(list); setLoading(false);
  }, []);
  useEffect(() => { loadBalls(); }, [loadBalls]);

  const openBall = useCallback(async (id) => {
    setBview("detail"); setBall(null); setCats([]); setResults({}); setEditResult(null); setErr(null); setEditing(false);
    const { data: b } = await supabase.from("balls_directory").select("*").eq("id", id).single();
    setBall(b);
    const { data: c } = await supabase.from("ball_categories").select("*").eq("ball_id", id).order("position", { ascending: true });
    setCats(c || []);
    const { data: r } = await supabase.from("ball_results_feed").select("*").eq("ball_id", id);
    const map = {}; (r || []).forEach((x) => (map[x.category_id] = x)); setResults(map);
  }, []);

  useEffect(() => { if (jumpBall) { openBall(jumpBall); onJumped && onJumped(); } }, [jumpBall, openBall, onJumped]);

  const loadStandings = useCallback(async () => {
    setStandings(null);
    const { data } = await supabase.from("ball_results_feed").select("*");
    const houses = {}, walkers = {};
    (data || []).forEach((r) => {
      const hk = r.winner_house_id || (r.winner_house_name ? "name:" + r.winner_house_name.toLowerCase() : null);
      if (hk) { houses[hk] = houses[hk] || { name: r.winner_house_display || r.winner_house_name, id: r.winner_house_id, wins: 0 }; houses[hk].wins++; }
      const wk = r.winner_profile_id || (r.winner_name ? "name:" + r.winner_name.toLowerCase() : null);
      if (wk) { walkers[wk] = walkers[wk] || { name: r.winner_username || r.winner_name, username: r.winner_username, wins: 0 }; walkers[wk].wins++; }
    });
    const sortDesc = (o) => Object.values(o).sort((a, b) => b.wins - a.wins);
    setStandings({ houses: sortDesc(houses), walkers: sortDesc(walkers) });
  }, []);

  const iAmOrganizer = me && ball && ball.organizer_id === me.id;

  const uploadFlyer = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setErr(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `ball/${me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (error) { setErr("Flyer upload failed: " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setForm((f) => ({ ...f, flyer_url: data.publicUrl + "?t=" + Date.now() })); setUploading(false);
  };

  const createBall = async () => {
    if (!gate() || !form.name.trim() || busy) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("balls").insert({ name: form.name.trim(), ball_date: form.ball_date || null, location: form.location.trim() || null, description: form.description.trim() || null, flyer_url: form.flyer_url, organizer_id: me.id }).select("id").single();
    if (error) { setErr("Could not create: " + error.message); setBusy(false); return; }
    setForm({ name: "", ball_date: "", location: "", description: "", flyer_url: null });
    setBusy(false); await loadBalls(); openBall(data.id);
  };

  const saveEdit = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    await supabase.from("balls").update({ name: form.name.trim(), ball_date: form.ball_date || null, location: form.location.trim() || null, description: form.description.trim() || null, flyer_url: form.flyer_url }).eq("id", ball.id);
    setBusy(false); setEditing(false); openBall(ball.id); loadBalls();
  };

  const deleteBall = async () => {
    if (!ball || busy) return;
    setBusy(true);
    await supabase.from("balls").delete().eq("id", ball.id);
    setBusy(false); setBview("list"); loadBalls();
  };

  const toggleStatus = async () => {
    setBusy(true);
    await supabase.from("balls").update({ status: ball.status === "upcoming" ? "completed" : "upcoming" }).eq("id", ball.id);
    setBusy(false); openBall(ball.id);
  };

  const saveResult = async () => {
    if (!editResult || !editResult.name.trim() || busy) return;
    setBusy(true);
    const name = editResult.name.trim(), house = editResult.house.trim();
    let winner_profile_id = null, winner_house_id = null;
    const { data: prof } = await supabase.from("profiles").select("id").ilike("username", name).maybeSingle();
    if (prof) winner_profile_id = prof.id;
    if (house) { const { data: h } = await supabase.from("houses").select("id").ilike("name", house).maybeSingle(); if (h) winner_house_id = h.id; }
    const { error } = await supabase.from("ball_results").upsert({ ball_id: ball.id, category_id: editResult.categoryId, winner_name: name, winner_profile_id, winner_house_name: house || null, winner_house_id }, { onConflict: "category_id" });
    if (error) setErr("Couldn't save result: " + error.message);
    setEditResult(null); setBusy(false); openBall(ball.id);
  };
  const clearResult = async (categoryId) => {
    setBusy(true);
    await supabase.from("ball_results").delete().eq("category_id", categoryId);
    setBusy(false); openBall(ball.id);
  };

  const addCategory = async () => {
    if (!newCat.name.trim() || busy) return;
    setBusy(true);
    const pos = cats.length ? Math.max(...cats.map((c) => c.position)) + 1 : 0;
    const { error } = await supabase.from("ball_categories").insert({ ball_id: ball.id, name: newCat.name.trim(), category_type: newCat.category_type, prize: newCat.prize.trim() || null, position: pos });
    if (!error) { setNewCat({ name: "", category_type: "performance", prize: "" }); openBall(ball.id); }
    setBusy(false);
  };
  const removeCategory = async (id) => {
    setBusy(true);
    await supabase.from("ball_categories").delete().eq("id", id);
    setBusy(false); openBall(ball.id);
  };
  const moveCategory = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= cats.length || busy) return;
    setBusy(true);
    const a = cats[index], b = cats[target];
    await supabase.from("ball_categories").update({ position: b.position }).eq("id", a.id);
    await supabase.from("ball_categories").update({ position: a.position }).eq("id", b.id);
    setBusy(false); openBall(ball.id);
  };

  /* ---------- LIST + STANDINGS ---------- */
  if (bview === "list") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.panel, borderRadius: 999, padding: 3 }}>
            <button onClick={() => setTab("balls")} style={{ fontWeight: 800, fontSize: 13.5, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", color: tab === "balls" ? C.ink : C.muted, background: tab === "balls" ? C.gold : "transparent" }}>Balls</button>
            <button onClick={() => { setTab("standings"); loadStandings(); }} style={{ fontWeight: 800, fontSize: 13.5, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", color: tab === "standings" ? C.ink : C.muted, background: tab === "standings" ? C.gold : "transparent" }}>Standings</button>
          </div>
          {tab === "balls" && <button onClick={() => { if (gate()) { setForm({ name: "", ball_date: "", location: "", description: "", flyer_url: null }); setErr(null); setBview("create"); } }} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Plus size={16} strokeWidth={2.6} /> Create a ball</button>}
        </div>

        {tab === "standings" ? (
          standings === null ? <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
          : (standings.houses.length === 0 && standings.walkers.length === 0) ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>No results recorded yet. Once organizers log category winners, standings build here.</div>
          : (
            <div style={{ display: "grid", gap: 22 }}>
              <div>
                <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Trophy size={13} /> House standings</div>
                {standings.houses.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 900, fontSize: 15, color: i === 0 ? C.gold : C.mutedDim, minWidth: 22 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 700, color: C.text }}>{h.name}</span>
                    <span style={{ fontWeight: 800, color: C.gold }}>{h.wins} {h.wins === 1 ? "win" : "wins"}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Trophy size={13} /> Top walkers</div>
                {standings.walkers.map((w, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 900, fontSize: 15, color: i === 0 ? C.gold : C.mutedDim, minWidth: 22 }}>{i + 1}</span>
                    {w.username ? <button onClick={() => openProfile(w.username)} style={{ flex: 1, textAlign: "left", fontWeight: 700, color: C.text, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{w.name}</button> : <span style={{ flex: 1, fontWeight: 700, color: C.text }}>{w.name}</span>}
                    <span style={{ fontWeight: 800, color: C.gold }}>{w.wins} {w.wins === 1 ? "win" : "wins"}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          loading ? <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>
          : balls.length === 0 ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.muted }}>No balls yet. Build the first night.</div>
          : balls.map((b) => (
            <button key={b.id} onClick={() => openBall(b.id)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12, cursor: "pointer", opacity: isPast(b.ball_date) ? 0.62 : 1 }}>
              <Flyer url={b.flyer_url} name={b.name} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 16.5, color: C.text }}>{b.name}</span>
                  {isPast(b.ball_date) || b.status === "completed" ? <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.mutedDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>past</span> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted, fontSize: 12.5, marginTop: 4, flexWrap: "wrap" }}>
                  {b.ball_date ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={12} /> {fmtDate(b.ball_date)}</span> : null}
                  {b.location ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {b.location}</span> : null}
                  <span>{b.category_count} {b.category_count === 1 ? "category" : "categories"}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    );
  }

  /* ---------- CREATE / EDIT FORM ---------- */
  if (bview === "create" || (bview === "detail" && editing)) {
    const onSave = bview === "create" ? createBall : saveEdit;
    return (
      <div style={{ maxWidth: 540 }}>
        <button onClick={() => { if (bview === "create") setBview("list"); else setEditing(false); }} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← cancel</button>
        <h1 style={{ fontWeight: 900, margin: "0 0 4px", fontSize: 24 }}>{bview === "create" ? "Create a ball" : "Edit ball"}</h1>
        <p style={{ color: C.muted, fontSize: 14, margin: "0 0 22px" }}>Set the night. You build the category lineup next.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <Flyer url={form.flyer_url} name={form.name} w={72} h={90} />
          <div>
            <input ref={fileRef} type="file" accept="image/*" onChange={uploadFlyer} style={{ display: "none" }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Camera size={15} /> {uploading ? "Uploading…" : form.flyer_url ? "Change flyer" : "Upload flyer"}</button>
          </div>
        </div>
        <label style={label}>Ball name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hottest Winter Ever 2027" style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>Date <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
        <input type="date" value={form.ball_date} onChange={(e) => setForm({ ...form, ball_date: e.target.value })} style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>Location <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City or venue" style={{ ...inputStyle, marginBottom: 18 }} />
        <label style={label}>Description <span style={{ textTransform: "none", color: C.mutedDim, letterSpacing: 0 }}>(optional)</span></label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="The theme, the vibe, the rules." rows={4} style={{ ...inputStyle, marginBottom: 18, resize: "vertical" }} />
        {err && <div style={{ color: C.magenta, fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <button onClick={onSave} disabled={!form.name.trim() || busy || uploading} style={{ fontWeight: 700, background: form.name.trim() ? `linear-gradient(135deg, ${C.magenta}, ${C.violet})` : C.panel2, color: form.name.trim() ? C.ink : C.mutedDim, borderRadius: 999, padding: "11px 26px", fontSize: 14, border: "none", cursor: form.name.trim() && !busy ? "pointer" : "not-allowed" }}>{busy ? "Saving…" : bview === "create" ? "Create ball" : "Save changes"}</button>
      </div>
    );
  }

  /* ---------- DETAIL ---------- */
  if (!ball) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading…</div>;
  return (
    <div>
      <button onClick={() => { setBview("list"); loadBalls(); }} style={{ fontWeight: 600, marginBottom: 16, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← all balls</button>
      <div style={{ background: `linear-gradient(135deg, ${C.panel2}, ${C.panel})`, border: `1px solid ${C.borderHot}`, borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
          <Flyer url={ball.flyer_url} name={ball.name} w={92} h={116} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <h1 style={{ fontWeight: 900, margin: "0 0 8px", fontSize: 25 }}>{ball.name}</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, color: C.muted, fontSize: 13.5 }}>
              {ball.ball_date ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={14} /> {fmtDate(ball.ball_date)}</span> : null}
              {ball.location ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> {ball.location}</span> : null}
              <span style={{ color: C.mutedDim }}>organized by <button onClick={() => ball.organizer && openProfile(ball.organizer)} style={{ fontWeight: 700, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{ball.organizer}</button></span>
            </div>
          </div>
          {iAmOrganizer && (
            <button onClick={() => { setForm({ name: ball.name, ball_date: ball.ball_date || "", location: ball.location || "", description: ball.description || "", flyer_url: ball.flyer_url }); setEditing(true); }} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}><Pencil size={14} /> Edit</button>
          )}
        </div>
        {ball.description ? <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.6, margin: "16px 0 0", whiteSpace: "pre-wrap" }}>{ball.description}</p> : null}
      </div>

      {/* lineup */}
      <div style={{ marginTop: 22, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.16em", color: C.mutedDim }}>The lineup · {cats.length} {cats.length === 1 ? "category" : "categories"}</div>
      </div>

      {cats.length === 0 && !iAmOrganizer ? <div style={{ color: C.mutedDim, fontSize: 13.5 }}>No categories posted yet.</div> : null}

      {cats.map((c, i) => {
        const res = results[c.id];
        const isEditing = editResult && editResult.categoryId === c.id;
        const winnerLabel = res ? (res.winner_username || res.winner_name) : null;
        const houseLabel = res ? (res.winner_house_display || res.winner_house_name) : null;
        return (
          <div key={c.id} style={{ background: C.panel, border: `1px solid ${res ? C.gold + "55" : C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: C.gold, minWidth: 22, textAlign: "center" }}>{i + 1}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{c.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.violet }}>{TYPE_LABEL[c.category_type]}</span>
                  {c.prize ? <span style={{ fontSize: 12.5, color: C.gold }}>· {c.prize}</span> : null}
                </div>
              </div>
              {iAmOrganizer && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => moveCategory(i, -1)} disabled={busy || i === 0} title="Move up" style={{ display: "flex", background: "none", border: "none", color: i === 0 ? C.mutedDim : C.muted, cursor: i === 0 ? "default" : "pointer", padding: 4 }}><ArrowUp size={16} /></button>
                  <button onClick={() => moveCategory(i, 1)} disabled={busy || i === cats.length - 1} title="Move down" style={{ display: "flex", background: "none", border: "none", color: i === cats.length - 1 ? C.mutedDim : C.muted, cursor: i === cats.length - 1 ? "default" : "pointer", padding: 4 }}><ArrowDown size={16} /></button>
                  <button onClick={() => removeCategory(c.id)} disabled={busy} title="Remove" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 4 }}><Trash2 size={15} /></button>
                </div>
              )}
            </div>

            {res && !isEditing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <Trophy size={15} style={{ color: C.gold, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: C.text, flex: 1, minWidth: 0 }}>
                  {res.winner_username ? <button onClick={() => openProfile(res.winner_username)} style={{ fontWeight: 800, color: C.gold, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{winnerLabel}</button> : <span style={{ fontWeight: 800, color: C.gold }}>{winnerLabel}</span>}
                  {houseLabel ? <span style={{ color: C.muted }}> · {houseLabel}</span> : null}
                </span>
                {iAmOrganizer && (
                  <>
                    <button onClick={() => setEditResult({ categoryId: c.id, name: res.winner_name || res.winner_username || "", house: res.winner_house_name || res.winner_house_display || "" })} title="Edit" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 3 }}><Pencil size={13} /></button>
                    <button onClick={() => clearResult(c.id)} disabled={busy} title="Clear" style={{ display: "flex", background: "none", border: "none", color: C.mutedDim, cursor: "pointer", padding: 3 }}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            )}

            {iAmOrganizer && !res && !isEditing && (
              <button onClick={() => setEditResult({ categoryId: c.id, name: "", house: "" })} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontWeight: 700, fontSize: 12.5, color: C.gold, background: "none", border: `1px solid ${C.gold}44`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}><Trophy size={13} /> Record winner</button>
            )}

            {iAmOrganizer && isEditing && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <input value={editResult.name} onChange={(e) => setEditResult({ ...editResult, name: e.target.value })} placeholder="Winner (their @username links their profile)" style={{ ...inputStyle, marginBottom: 8 }} autoFocus />
                <input value={editResult.house} onChange={(e) => setEditResult({ ...editResult, house: e.target.value })} placeholder="House (optional)" style={{ ...inputStyle, marginBottom: 8 }} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={() => setEditResult(null)} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, fontSize: 12.5, background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={14} /> cancel</button>
                  <button onClick={saveResult} disabled={busy || !editResult.name.trim()} style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "6px 14px", cursor: "pointer", opacity: busy || !editResult.name.trim() ? 0.6 : 1 }}><Check size={14} /> Save winner</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* organizer: add category + ball controls */}
      {iAmOrganizer && (
        <>
          <div style={{ background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 14, marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Add a category</div>
            <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Category name" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select value={newCat.category_type} onChange={(e) => setNewCat({ ...newCat, category_type: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 130 }}>{CATEGORY_TYPES.map(([v, l]) => <option key={v} value={v} style={{ background: C.ink }}>{l}</option>)}</select>
              <input value={newCat.prize} onChange={(e) => setNewCat({ ...newCat, prize: e.target.value })} placeholder="Prize (optional)" style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={addCategory} disabled={busy || !newCat.name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.magenta}, ${C.violet})`, color: C.ink, border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer", opacity: busy || !newCat.name.trim() ? 0.6 : 1 }}><Plus size={15} strokeWidth={2.6} /> Add to lineup</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button onClick={toggleStatus} disabled={busy} style={{ fontWeight: 700, fontSize: 12.5, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>{ball.status === "upcoming" ? "Mark completed" : "Mark upcoming"}</button>
            <button onClick={deleteBall} disabled={busy} style={{ fontWeight: 700, fontSize: 12.5, background: "none", color: C.magenta, border: `1px solid ${C.magenta}55`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>Delete ball</button>
          </div>
        </>
      )}
    </div>
  );
}
