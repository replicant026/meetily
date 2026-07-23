'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SpeakerDirectory } from '@/components/speakers/SpeakerDirectory';
import { countPendingSuggestions } from '@/lib/speaker-api';

export default function PeoplePage() {
  const t = useTranslations('speakers');
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    countPendingSuggestions()
      .then((count) => { if (!cancelled) setPendingReviews(count); })
      .catch(() => { /* ignore – banner stays hidden */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl text-[rgb(var(--app-fg))] mb-6 app-display-heading">
        {t('directory.title')}
      </h1>
      {pendingReviews !== null && pendingReviews > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            {t('review_queue.pending_count', { count: pendingReviews })}
          </p>
        </div>
      )}
      <SpeakerDirectory />
    </div>
  );
}
