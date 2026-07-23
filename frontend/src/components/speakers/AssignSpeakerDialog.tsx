'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { User, Plus, Search, Check } from 'lucide-react';
import type { SpeakerPerson } from '@/lib/speaker-types';
import { listPeople, createPerson, assignMeetingSpeaker } from '@/lib/speaker-api';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AssignSpeakerDialogProps {
  meetingId: string;
  sourceLabel: string;
  segmentIds: string[];
  open: boolean;
  onClose: () => void;
  onAssigned: (speakerId: string, segmentIds: string[]) => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#f43f5e', '#06b6d4', '#f97316', '#6366f1',
];

export function AssignSpeakerDialog({
  meetingId,
  sourceLabel,
  segmentIds,
  open,
  onClose,
  onAssigned,
}: AssignSpeakerDialogProps) {
  const t = useTranslations('speakers.assign');
  const [people, setPeople] = useState<SpeakerPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create new person state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const loadPeople = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const list = await listPeople();
      setPeople(list);
    } catch {
      // silently fail; list just won't populate
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      loadPeople();
      setSelectedPersonId(null);
      setConfirmed(false);
      setCreating(false);
      setNewName('');
      setSearch('');
    }
  }, [open, loadPeople]);

  const filtered = useMemo(() => {
    if (!search.trim()) return people;
    const q = search.toLowerCase();
    return people.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q))
    );
  }, [people, search]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  const handleCreateAndSelect = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const color = PRESET_COLORS[people.length % PRESET_COLORS.length];
      const id = await createPerson(name, undefined, color);
      const person: SpeakerPerson = {
        id,
        display_name: name,
        email: null,
        color,
        reference_count: 0,
        playable_reference_count: 0,
        meeting_count: 0,
        last_seen_at: null,
      };
      setPeople((prev) => [...prev, person]);
      setSelectedPersonId(id);
      setCreating(false);
      setNewName('');
    } catch {
      toast.error(t('create_failed'));
    }
  };

  const handleConfirm = async () => {
    if (!selectedPersonId || !confirmed) return;
    setSubmitting(true);
    try {
      const result = await assignMeetingSpeaker(meetingId, selectedPersonId, segmentIds);
      toast.success(
        t('success', {
          count: result.segmentIds.length,
          reference: result.referenceCreated ? t('reference_created') : '',
        })
      );
      onAssigned(result.speakerId, result.segmentIds);
      onClose();
    } catch {
      toast.error(t('assign_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={t('title', { label: sourceLabel })}
      description={t('description', { count: segmentIds.length })}
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* People list */}
        <div className="max-h-48 overflow-y-auto space-y-1" role="listbox" aria-label={t('people_list')}>
          {loading && (
            <p className="text-xs text-muted-foreground py-2">{t('loading')}</p>
          )}
          {!loading && filtered.length === 0 && !creating && (
            <p className="text-xs text-muted-foreground py-2">{t('no_people')}</p>
          )}
          {!creating &&
            filtered.map((person) => (
              <button
                key={person.id}
                type="button"
                role="option"
                aria-selected={selectedPersonId === person.id}
                onClick={() => setSelectedPersonId(person.id)}
                className={
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ' +
                  (selectedPersonId === person.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground')
                }
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: person.color ?? '#3b82f6' }}
                >
                  <User size={12} className="text-white" />
                </div>
                <span className="flex-1 truncate">{person.display_name}</span>
                {person.reference_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t('reference_count', { count: person.reference_count })}
                  </span>
                )}
                {selectedPersonId === person.id && (
                  <Check size={14} className="text-primary flex-shrink-0" />
                )}
              </button>
            ))}

          {/* Create new person */}
          {!loading && (
            <>
              {creating ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Input
                    autoFocus
                    placeholder={t('new_name_placeholder')}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateAndSelect();
                      else if (e.key === 'Escape') {
                        setCreating(false);
                        setNewName('');
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="ghost" onClick={handleCreateAndSelect} disabled={!newName.trim()}>
                    <Check size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Plus size={14} />
                  {t('create_new')}
                </button>
              )}
            </>
          )}
        </div>

        {/* Confirmation */}
        {selectedPersonId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">{t('confirmation')}</p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="rounded border-amber-300"
              />
              <span className="text-xs text-amber-700 font-medium">{t('confirm_checkbox')}</span>
            </label>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          size="sm"
          disabled={!selectedPersonId || !confirmed || submitting}
          onClick={handleConfirm}
        >
          {submitting ? t('saving') : t('confirm_button')}
        </Button>
      </div>
    </AppDialog>
  );
}
