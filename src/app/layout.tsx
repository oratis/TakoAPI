import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TakoAPI — One API to access all agents",
  description:
    "One API to access all agents. Discover and invoke AI agents through one unified API — plus thousands of OpenClaw skills for your coding agent.",
  openGraph: {
    title: "TakoAPI — One API to access all agents",
    description:
      "Discover and invoke AI agents through one unified API. Plus thousands of OpenClaw skills.",
    url: "https://takoapi.com",
    siteName: "TakoAPI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-full flex flex-col bg-white text-gray-900`}>
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
