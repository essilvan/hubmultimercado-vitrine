import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Hub Auto Peças | Catálogo e Ofertas com Frete Rápido",
    template: "%s | Hub Auto Peças",
  },
  description:
    "Catálogo completo de peças mecânicas, suspensão, embreagens, freios e arrefecimento com entrega rápida e garantia.",
  verification: {
    google: "sJ4A4x69_xNlbPCGfp70qf5ggQtpRUTxLmbMYyqALS4",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
