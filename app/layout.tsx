import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CurveGuard Launch — Design liquidity before you launch",
  description: "Build a Meteora DBC curve around real order sizes. Compare buy and sell depth, plan DAMM v2 graduation, and launch with your own wallet.",
  icons: {
    icon: "/curveguard.svg",
    shortcut: "/curveguard.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
