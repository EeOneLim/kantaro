import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter: clean, highly readable — used for all text (Redstream Pro system)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kantaro",
  description: "Learn Spanish through music",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
