import type { Metadata } from "next";

import { Providers } from "./providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Activity dashboard",
  description: "GitHub-style coding activity heatmap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black font-sans text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
