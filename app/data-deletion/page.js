const C = {
  text: "#f4f0fb",
  muted: "#9a90b3",
  magenta: "#ff3d7f",
};

export const metadata = {
  title: "Data Deletion — the Let Out",
};

const wrap = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "48px 24px 80px",
  color: C.text,
  lineHeight: 1.7,
  fontSize: 15.5,
};
const h1 = { fontSize: 28, fontWeight: 900, margin: "0 0 6px" };
const h2 = { fontSize: 17, fontWeight: 800, margin: "32px 0 8px" };
const p = { color: C.muted, margin: "0 0 12px" };
const a = { color: C.magenta };

export default function DataDeletion() {
  return (
    <div style={wrap}>
      <a href="/" style={{ ...a, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>← the Let Out</a>
      <h1 style={h1}>Deleting your data</h1>
      <p style={p}>You can have your account and everything connected to it permanently deleted at any time.</p>

      <h2 style={h2}>How to request deletion</h2>
      <p style={p}>
        Email <a href="mailto:your-email@example.com" style={a}>your-email@example.com</a> from the address you signed up with,
        with the subject line <strong>Delete my data</strong>. We'll confirm and remove your profile, posts, comments, and votes
        within 30 days.
      </p>

      <h2 style={h2}>What gets deleted</h2>
      <p style={p}>
        Everything tied to your account: your profile and name, every post and comment you wrote, and all of your votes.
        Once deleted, this cannot be recovered.
      </p>

      <h2 style={h2}>Note</h2>
      <p style={p}>
        Replace the email address above with your own before going live. This page exists so Facebook and other providers
        can point users here, as they require.
      </p>
    </div>
  );
}
