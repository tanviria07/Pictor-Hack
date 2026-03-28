import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Pictor Hack",
  description: "Python interview practice - run, evaluate, coach.",
  openGraph: {
    title: "Pictor Hack",
    description: "Python interview practice - run, evaluate, coach.",
    siteName: "Pictor Hack",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans min-h-screen bg-[#09090b] text-zinc-200 antialiased">
        {children}
      </body>
    </html>
  );
}
