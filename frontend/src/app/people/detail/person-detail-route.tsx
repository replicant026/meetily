'use client';

import { useSearchParams } from 'next/navigation';
import { PersonDetailClient } from '../[id]/person-detail-client';

export function PersonDetailRoute() {
  const searchParams = useSearchParams();
  return <PersonDetailClient id={searchParams.get('id') ?? ''} />;
}
