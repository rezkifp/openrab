import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="border border-gridBorder bg-white p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slateInk">
          OpenRAB Workbench
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          Rencana Anggaran Biaya &amp; Takeoff Arsitektural
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slateInk">
          Sistem kalkulasi RAB presisi tinggi berbasis AHSP, volume takeoff, harga
          efektif regional, dan snapshot audit terkunci.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center border border-ink bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buka Daftar Proyek
          </Link>
          <Link
            href="/master"
            className="inline-flex items-center border border-gridBorder bg-subtle px-4 py-2 text-sm font-medium text-ink hover:bg-stone-200"
          >
            Kelola Master Data
          </Link>
        </div>
      </div>
    </main>
  );
}
