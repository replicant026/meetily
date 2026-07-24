'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import type { SpeakerPerson } from '@/lib/speaker-types';
import { getPerson, listPeople } from '@/lib/speaker-api';
import { SpeakerDetailPanel } from '@/components/speakers/SpeakerDetailPanel';
import { AppStatus } from '@/components/ui/app-status';
import { Button } from '@/components/ui/button';

interface PersonDetailClientProps {
  id: string;
}

export function PersonDetailClient({ id }: PersonDetailClientProps) {
  const router = useRouter();
  const t = useTranslations('common');
  const tSpeakers = useTranslations('speakers');
  const [person, setPerson] = useState<SpeakerPerson | null>(null);
  const [allPeople, setAllPeople] = useState<SpeakerPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, people] = await Promise.all([getPerson(id), listPeople()]);
      setPerson(p);
      setAllPeople(people);
    } catch (e) {
      console.warn('Failed to load person:', e);
      setError(tSpeakers('detail.no_selection'));
    } finally {
      setLoading(false);
    }
  }, [id, tSpeakers]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus model={{ kind: 'loading', tone: 'neutral', title: t('status.loading') }} />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus model={{ kind: 'error', tone: 'danger', title: t('status.failed'), description: error ?? '' }} />
      </div>
    );
  }

  return (
    <div className="app-page max-w-5xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/people')}
        className="gap-1"
      >
        <ArrowLeft size={14} />
        {tSpeakers('directory.title')}
      </Button>
      <SpeakerDetailPanel
        person={person}
        allPeople={allPeople}
        onUpdated={load}
      />
    </div>
  );
}
