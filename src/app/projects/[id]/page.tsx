import { notFound } from 'next/navigation';
import { getProjectWorkspace } from '@/app/actions/project';
import { Navbar } from '@/components/Navbar';
import { ProjectWorkspaceClient } from '@/components/workspace/ProjectWorkspaceClient';

export const dynamic = 'force-dynamic';

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await getProjectWorkspace(id);

  if (!payload) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-paper">
      <Navbar hasDummy={payload.hasDummy} />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <ProjectWorkspaceClient initial={payload} />
      </main>
    </div>
  );
}
