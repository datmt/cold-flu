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
        <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b border-gray-800 bg-gray-950/90 px-6 py-8 lg:border-b-0 lg:border-r">
            <Link href="/chains" className="text-2xl font-semibold tracking-tight text-gray-100">
              ⚡ ColdFlu 
            </Link>
            <p><sub><code>*curl-flow* by <Link href="https://datmt.com/?ref=cold-flu" target="_blank">datmt.com</Link></code></sub></p>
            <p className="mt-3 text-sm text-gray-400">
              Chain curl requests, reuse step output, and inspect every run in one dark workspace.
            </p>
            <nav className="mt-8 space-y-2">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl border border-gray-800 px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-indigo-500 hover:bg-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="min-h-screen bg-gray-950 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
