import { Suspense } from 'react';
import { PersonDetailRoute } from './person-detail-route';

/** The query is read only in the client so this shell remains statically exportable. */
export default function PersonDetailPage() {
  return (
    <Suspense fallback={null}>
      <PersonDetailRoute />
    </Suspense>
  );
}
