import "./globals.css";

export const metadata = {
  title: "the Let Out",
  description: "The ballroom scene, owned by us.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
