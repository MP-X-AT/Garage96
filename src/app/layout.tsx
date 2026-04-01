import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import dayjs from "@/lib/dayjs";
import "dayjs/locale/de";
import "./globals.css";

dayjs.locale("de");

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Garage96 Kalender",
  description: "Werkstatt-Planung, Tagessteuerung und Auftragsübersicht für Garage96.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}