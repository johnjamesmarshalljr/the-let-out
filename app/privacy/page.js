const C = {
  ink: "#14101f",
  text: "#f4f0fb",
  muted: "#9a90b3",
  magenta: "#ff3d7f",
  border: "#322749",
};

export const metadata = {
  title: "Privacy Policy — the Let Out",
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
const h2 = { fontSize: 17, fontWeight: 800, margin: "32px 0 8px", color: C.text };
const p = { color: C.muted, margin: "0 0 12px" };
const a = { color: C.magenta };

export default function Privacy() {
  return (
    <div style={wrap}>
      <a href="/" style={{ ...a, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>← the Let Out</a>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={{ ...p, fontSize: 13 }}>Last updated: when you deploy. Replace the contact email below with your own before going live.</p>

      <h2 style={h2}>Who we are</h2>
      <p style={p}>the Let Out is a community forum for the ballroom scene. This policy explains what we collect and what we do with it.</p>

      <h2 style={h2}>What we collect</h2>
      <p style={p}>
        When you sign in, we receive your name and email address from your login provider (Google, Facebook, or an email sign-in link).
        We also store the content you create on the forum: your posts, comments, and votes, along with the time you created them.
      </p>

      <h2 style={h2}>How we use it</h2>
      <p style={p}>
        We use this only to run the forum — showing your name next to your posts, letting you sign back in, and counting votes.
        We do not sell your data, we do not run ads, and we do not share it with advertisers.
      </p>

      <h2 style={h2}>Where it lives</h2>
      <p style={p}>
        Your data is stored in our database, hosted by Supabase. Authentication is handled by Supabase together with your chosen
        login provider. These services process your data on our behalf so the forum can function.
      </p>

      <h2 style={h2}>Deleting your data</h2>
      <p style={p}>
        You can have your account and everything tied to it permanently removed. See our{" "}
        <a href="/data-deletion" style={a}>data deletion page</a> for how.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        Questions about your data? Email <a href="mailto:your-email@example.com" style={a}>your-email@example.com</a>.
      </p>
    </div>
  );
}
