import { getMasterDataBundle } from '@/app/actions/master';
import { ensureDbReady } from '@/db';
import { Navbar } from '@/components/Navbar';
import { MasterDataClient } from '@/components/master/MasterDataClient';

export const dynamic = 'force-dynamic';

export default async function MasterPage() {
  await ensureDbReady();
  const bundle = await getMasterDataBundle();

  return (
    <div className="min-h-screen bg-paper">
      <Navbar hasDummy={bundle.hasDummy} />
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
        <MasterDataClient initial={bundle} />
      </main>
    </div>
  );
}
