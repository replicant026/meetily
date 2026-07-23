'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Trash2, ArrowRightLeft, User } from 'lucide-react';
import type { SpeakerPerson, VoiceReference } from '@/lib/speaker-types';
import {
  listReferences,
  renamePerson,
  deletePerson,
  mergePeople,
  updatePersonEmail,
  updatePersonColor,
} from '@/lib/speaker-api';
import { VoiceReferenceCard } from './VoiceReferenceCard';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#f43f5e', '#06b6d4', '#f97316', '#6366f1',
  '#ec4899', '#14b8a6',
];

interface SpeakerDetailPanelProps {
  person: SpeakerPerson;
  allPeople: SpeakerPerson[];
  onUpdated?: () => void;
}

export function SpeakerDetailPanel({ person, allPeople, onUpdated }: SpeakerDetailPanelProps) {
  const t = useTranslations('speakers.detail');
  const tRef = useTranslations('speakers.reference');
  const [references, setReferences] = useState<VoiceReference[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Rename state
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(person.display_name);

  // Email state
  const [editingEmail, setEditingEmail] = useState(false);
  const [draftEmail, setDraftEmail] = useState(person.email ?? '');

  // Color state
  const [editingColor, setEditingColor] = useState(false);

  // Merge state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const refs = await listReferences(person.id);
      setReferences(refs);
    } catch (e) {
      console.warn('Failed to load references:', e);
    } finally {
      setLoadingRefs(false);
    }
  }, [person.id]);

  useEffect(() => { loadRefs(); }, [loadRefs]);

  // Reset draft when person changes
  useEffect(() => {
    setDraftName(person.display_name);
    setDraftEmail(person.email ?? '');
    setEditingName(false);
    setEditingEmail(false);
    setEditingColor(false);
    setMergeOpen(false);
    setDeleteOpen(false);
  }, [person.id, person.display_name, person.email]);

  const handleRename = async () => {
    const newName = draftName.trim();
    if (!newName || newName === person.display_name) {
      setEditingName(false);
      return;
    }
    try {
      await renamePerson(person.id, newName);
      toast.success(t('renamed'));
      setEditingName(false);
      onUpdated?.();
    } catch {
      toast.error(t('rename_failed'));
    }
  };

  const handleSaveEmail = async () => {
    const email = draftEmail.trim();
    try {
      await updatePersonEmail(person.id, email);
      toast.success(t('email_saved'));
      setEditingEmail(false);
      onUpdated?.();
    } catch {
      toast.error(t('email_save_failed'));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePerson(person.id);
      toast.success(t('deleted'));
      setDeleteOpen(false);
      onUpdated?.();
    } catch {
      toast.error(t('delete_failed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    try {
      await mergePeople(person.id, mergeTargetId);
      toast.success(t('merged'));
      setMergeOpen(false);
      onUpdated?.();
    } catch {
      toast.error(t('merge_failed'));
    }
  };

  const otherPeople = allPeople.filter((p) => p.id !== person.id);
  const lastSeenDate = person.last_seen_at
    ? new Date(person.last_seen_at).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: person.color ?? '#3b82f6' }}
        >
          <User className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  else if (e.key === 'Escape') setEditingName(false);
                }}
                className="h-8 text-sm"
              />
              <Button size="sm" variant="ghost" onClick={handleRename}>✓</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground truncate">
                {person.display_name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t('meeting_count', { count: person.meeting_count })}
            {lastSeenDate && <> · {t('last_seen', { date: lastSeenDate })}</>}
            {!lastSeenDate && <> · {t('never_seen')}</>}
          </p>
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('email_label')}</label>
        {editingEmail ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              type="email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              placeholder={t('email_placeholder')}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="ghost" onClick={handleSaveEmail}>✓</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingEmail(false)}>✕</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingEmail(true)}
            className="text-sm text-foreground hover:text-primary transition-colors text-left"
          >
            {person.email || t('email_placeholder')}
          </button>
        )}
      </div>

      {/* Color */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('color_label')}</label>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={async () => {
                if (c === person.color) return;
                try {
                  await updatePersonColor(person.id, c);
                  toast.success(t('color_updated'));
                  onUpdated?.();
                } catch {
                  toast.error(t('color_update_error'));
                }
              }}
              className={`w-6 h-6 rounded-full border-2 transition-colors ${
                person.color === c ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/50'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Voice References */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">{t('references_title')}</h4>
        {loadingRefs ? (
          <div className="text-xs text-muted-foreground py-2">Loading...</div>
        ) : references.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">{t('references_empty')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('references_empty_hint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {references.map((ref) => (
              <VoiceReferenceCard
                key={ref.id}
                reference={ref}
                onDeleted={loadRefs}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMergeOpen(true)}
          disabled={otherPeople.length === 0}
        >
          <ArrowRightLeft size={14} />
          {t('merge_button')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 size={14} />
          {t('delete_button')}
        </Button>
      </div>

      {/* Merge Dialog */}
      <AppDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title={t('merge_title')}
        description={t('merge_description', {
          source: person.display_name,
          target: otherPeople.find((p) => p.id === mergeTargetId)?.display_name ?? '...',
        })}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setMergeOpen(false)}>
              {t('merge_cancel')}
            </Button>
            <Button size="sm" onClick={handleMerge} disabled={!mergeTargetId}>
              {t('merge_confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('merge_target_label')}</label>
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{t('merge_target_placeholder')}</option>
            {otherPeople.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>
      </AppDialog>

      {/* Delete Dialog */}
      <AppDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('delete_title')}
        description={t('delete_description', { name: person.display_name })}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              {t('delete_cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {t('delete_confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t('delete_description', { name: person.display_name })}
        </p>
      </AppDialog>
    </div>
  );
}
