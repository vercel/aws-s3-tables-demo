import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Catalog Insights | Amazon S3 Tables",
  description: "Review managed movie catalog snapshots with Amazon S3 Tables and Vercel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
