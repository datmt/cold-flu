import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "⚡ ColdFlu",
  description: "A lightweight curl step machine for chaining HTTP requests.",
};

const navigation = [
  { href: '/chains', label: 'Chains' },
  { href: '/environments', label: 'Environments' },
  { href: '/functions', label: 'Global Functions' },
  { href: '/docs', label: '📖 Docs' },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100">
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-gray-800 bg-gray-950/90 px-4 py-3 sm:px-6 lg:px-10">
            <Link href="/chains" className="flex items-baseline gap-2 text-xl font-semibold tracking-tight text-gray-100">
              ⚡ ColdFlu
              <span className="text-xs font-normal text-gray-500">
                <code>*curl-flow* by <Link href="https://datmt.com/?ref=cold-flu" target="_blank">datmt.com</Link></code>
              </span>
            </Link>
            <nav className="flex flex-wrap gap-2">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200 transition hover:border-indigo-500 hover:bg-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="min-h-0 flex-1 bg-gray-950 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
