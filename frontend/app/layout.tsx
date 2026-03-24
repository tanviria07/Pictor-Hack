import type { Metadata } from "next";
import { Geist_Mono, Geist_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Jose-Morinho AI",
  description: "Python interview practice — run, evaluate, coach.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
