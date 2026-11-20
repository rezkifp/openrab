import { getProjectsList } from '@/app/actions/project';
import { Navbar } from '@/components/Navbar';
import { ProjectsListClient } from '@/components/workspace/ProjectsListClient';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const { projects, regions, hasDummy } = await getProjectsList();

  return (
    <div className="min-h-screen bg-paper">
      <Navbar hasDummy={hasDummy} />
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
        <ProjectsListClient projects={projects} regions={regions} />
      </main>
    </div>
  );
}
