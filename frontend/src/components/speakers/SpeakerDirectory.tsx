'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Search, Plus } from 'lucide-react';
import type { SpeakerPerson } from '@/lib/speaker-types';
import { listPeople, createPerson } from '@/lib/speaker-api';
import { SpeakerDetailPanel } from './SpeakerDetailPanel';
import { SpeakerRecognitionSettings } from './SpeakerRecognitionSettings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo`;
}

export function SpeakerDirectory() {
  const t = useTranslations('speakers');
  const [people, setPeople] = useState<SpeakerPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const loadPeople = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPeople();
      setPeople(data);
    } catch (e) {
      console.warn('Failed to load people:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  const filtered = people.filter((p) =>
    p.display_name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedPerson = selectedId ? people.find((p) => p.id === selectedId) ?? null : null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await createPerson(name);
      setNewName('');
      setCreating(false);
      toast.success(t('directory.created'));
      await loadPeople();
      setSelectedId(id);
    } catch {
      toast.error(t('directory.create_failed'));
    }
  };

  const handleUpdated = useCallback(() => {
    loadPeople();
  }, [loadPeople]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t('directory.title')}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('directory.description')}
        </p>
      </div>

      {/* Recognition Settings */}
      <SpeakerRecognitionSettings />

      {/* Two-pane layout */}
      <div className="flex gap-4 min-h-[400px]">
        {/* Left: People list */}
        <div className="w-72 flex-shrink-0 space-y-3">
          {/* Search + create */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('directory.search_placeholder')}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={14} />
            </Button>
          </div>

          {/* Create inline */}
          {creating && (
            <div className="flex gap-1">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('directory.create_placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  else if (e.key === 'Escape') setCreating(false);
                }}
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleCreate}>✓</Button>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="text-sm text-muted-foreground py-4">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('directory.empty')}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{t('directory.empty_hint')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedId(person.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                    selectedId === person.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground',
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: person.color ?? '#6b7280' }}
                  >
                    <span className="text-xs font-medium text-white">
                      {person.display_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                   <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{person.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {person.playable_reference_count === 0
                        ? t('directory.needs_reference')
                        : `${person.reference_count} ref${person.reference_count !== 1 ? 's' : ''}`}
                      {' · '}
                      {person.meeting_count} mtg{person.meeting_count !== 1 ? 's' : ''}
                      {person.last_seen_at && (
                        <> · {t('directory.last_seen_ago', { time: formatRelativeTime(person.last_seen_at) })}</>
                      )}
                      {!person.last_seen_at && (
                        <> · {t('directory.never_seen')}</>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 border border-border rounded-lg p-4 overflow-y-auto">
          {selectedPerson ? (
            <SpeakerDetailPanel
              person={selectedPerson}
              allPeople={people}
              onUpdated={handleUpdated}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">{t('detail.no_selection')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
