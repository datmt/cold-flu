import Sidebar from '@/components/Sidebar';

export default function ChainsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:h-[calc(100vh-3rem)] lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
      <div className="h-64 overflow-hidden rounded-2xl border border-gray-800 lg:h-full">
        <Sidebar />
      </div>
      <div className="lg:overflow-y-auto">{children}</div>
    </div>
  );
}
