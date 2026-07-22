'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getSpeakerColorByIndex, SPEAKER_PALETTE } from '@/lib/speaker-colors';
import { toast } from 'sonner';
import { User, Pencil, Trash2, Check, X, Users, Play } from 'lucide-react';

interface SpeakerProfile {
  id: string;
  display_name: string;
  embedding: number[];
  slot: number;
  created_at: string;
  last_seen_at: string | null;
  meeting_count: number;
}

/** Group profiles by display_name (multiple slots per person). */
function groupByName(profiles: SpeakerProfile[]): Map<string, SpeakerProfile[]> {
  const map = new Map<string, SpeakerProfile[]>();
  for (const p of profiles) {
    const existing = map.get(p.display_name) ?? [];
    existing.push(p);
    map.set(p.display_name, existing);
  }
  return map;
}

export function SpeakersSettings() {
  const [profiles, setProfiles] = useState<SpeakerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [playingSpeaker, setPlayingSpeaker] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<SpeakerProfile[]>('list_speaker_profiles');
      setProfiles(data);
    } catch (e) {
      console.warn('Failed to load speaker profiles:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleRename = async (oldName: string) => {
    const newName = draftName.trim();
    if (!newName || newName === oldName) {
      setEditingName(null);
      return;
    }
    try {
      await invoke('rename_speaker_profile', { oldName, newName });
      await loadProfiles();
    } catch (e) {
      console.warn('Failed to rename speaker:', e);
    }
    setEditingName(null);
  };

  const handleDelete = async (name: string) => {
    try {
      await invoke('delete_speaker_profile', { displayName: name });
      setProfiles((prev) => prev.filter((p) => p.display_name !== name));
    } catch (e) {
      console.warn('Failed to delete speaker:', e);
    }
    setConfirmDelete(null);
  };

  const grouped = groupByName(profiles);
  const speakerNames = Array.from(grouped.keys());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Speakers
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage known speakers. When you rename a speaker in a transcript, their voice is saved here for future identification.
        </p>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 py-4">Loading speakers...</div>
      )}

      {!loading && speakerNames.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No saved speakers yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Rename a speaker in any transcript to save their voice profile.
          </p>
        </div>
      )}

      {!loading && speakerNames.length > 0 && (
        <div className="space-y-2">
          {speakerNames.map((name, idx) => {
            const color = getSpeakerColorByIndex(idx);
            const slots = grouped.get(name) ?? [];
            const isEditing = editingName === name;
            const isConfirmingDelete = confirmDelete === name;

            return (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Color dot */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color.accent }}
                  />
                  {/* Avatar placeholder */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${color.bg}`}
                  >
                    <User className={`w-4 h-4 ${color.text}`} />
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(name);
                          else if (e.key === 'Escape') setEditingName(null);
                        }}
                        className="text-sm px-2 py-1 border border-blue-300 rounded w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleRename(name)}
                        className="p-1 text-green-600 hover:text-green-800"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingName(null)}
                        className="p-1 text-gray-500 hover:text-gray-700"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate block">
                        {name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {slots.length} voice print{slots.length !== 1 ? 's' : ''}
                        {slots[0]?.meeting_count ? ` · ${slots[0].meeting_count} meeting${slots[0].meeting_count !== 1 ? 's' : ''}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600 mr-1">Delete?</span>
                        <button
                          onClick={() => handleDelete(name)}
                          className="p-1 text-red-600 hover:text-red-800"
                          title="Confirm delete"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            toast.info(`Playing voice sample for ${name}...`);
                            // TODO: implement actual audio playback when backend supports it
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                          title="Play voice sample"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setDraftName(name);
                            setEditingName(name);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          title="Rename"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                          title="Delete voice profile"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend showing the color palette */}
      {!loading && speakerNames.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Speaker colors in transcript:</p>
          <div className="flex flex-wrap gap-2">
            {speakerNames.map((name, idx) => {
              const color = getSpeakerColorByIndex(idx);
              return (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${color.bg} ${color.text}`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color.accent }}
                  />
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
