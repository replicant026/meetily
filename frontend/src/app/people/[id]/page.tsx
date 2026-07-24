import { PersonDetailClient } from './person-detail-client';

export function generateStaticParams() {
  // Placeholder so the static shell is generated; real IDs are handled client-side via SPA routing.
  return [{ id: 'new' }];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <PersonDetailClient id={id} />;
}
