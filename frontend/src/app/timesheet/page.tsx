'use client';

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, Check, Clock, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TimesheetEntry {
  id: string;
  meetingId: string | null;
  client: string;
  project: string | null;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isExtra: boolean;
  launched: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  meetingId: string;
  client: string;
  project: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  isExtra: boolean;
}

const emptyForm: FormData = {
  meetingId: '',
  client: '',
  project: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '10:00',
  isExtra: false,
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TimesheetPage() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadEntries = useCallback(async () => {
    try {
      const result = await invoke<TimesheetEntry[]>('timesheet_list_entries', { month });
      setEntries(result);
    } catch (e) {
      console.error('Failed to load timesheet entries:', e);
    }
  }, [month]);

  const loadClients = useCallback(async () => {
    try {
      const result = await invoke<string[]>('timesheet_list_clients');
      setClients(result);
    } catch (e) {
      console.error('Failed to load clients:', e);
    }
  }, []);

  useEffect(() => {
    loadEntries();
    loadClients();
  }, [loadEntries, loadClients]);

  const handleSubmit = async () => {
    if (!form.client.trim() || !form.description.trim()) return;

    try {
      if (editingId) {
        await invoke('timesheet_update_entry', {
          request: {
            id: editingId,
            meetingId: form.meetingId || null,
            client: form.client,
            project: form.project || null,
            description: form.description,
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            isExtra: form.isExtra,
          },
        });
      } else {
        await invoke('timesheet_create_entry', {
          request: {
            meetingId: form.meetingId || null,
            client: form.client,
            project: form.project || null,
            description: form.description,
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            isExtra: form.isExtra,
          },
        });
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      loadEntries();
      loadClients();
    } catch (e: any) {
      console.error('Failed to save entry:', e);
      const msg = typeof e === 'string' ? e : e?.message || 'Failed to save entry';
      // Show error to user via alert (sonner not imported in this page)
      window.alert(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('timesheet_delete_entry', { entryId: id });
      loadEntries();
    } catch (e) {
      console.error('Failed to delete entry:', e);
    }
  };

  const handleToggleLaunched = async (id: string, current: boolean) => {
    try {
      await invoke('timesheet_mark_launched', { entryId: id, launched: !current });
      loadEntries();
    } catch (e) {
      console.error('Failed to toggle launched:', e);
    }
  };

  const handleEdit = (entry: TimesheetEntry) => {
    setForm({
      meetingId: entry.meetingId || '',
      client: entry.client,
      project: entry.project || '',
      description: entry.description,
      date: entry.date,
      startTime: entry.startTime.substring(0, 5),
      endTime: entry.endTime.substring(0, 5),
      isExtra: entry.isExtra,
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--app-fg))]">Timesheet</h1>
          <p className="text-sm text-[rgb(var(--app-muted-fg))]">
            {entries.length} entries &middot; {formatDuration(totalMinutes)} total
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Entry Form */}
      {showForm && (
        <div className="mb-6 p-4 border border-[rgb(var(--app-border))] rounded-lg bg-[rgb(var(--app-muted))]">
          <h3 className="font-medium mb-3 text-[rgb(var(--app-fg))]">
            {editingId ? 'Edit Entry' : 'New Entry'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">Client *</label>
              <Input
                list="client-list"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                placeholder="Client name"
              />
              <datalist id="client-list">
                {clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">Project</label>
              <Input
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                placeholder="Project name"
              />
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">Description *</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What was done"
              />
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">Start Time</label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--app-muted-fg))] mb-1">End Time</label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-[rgb(var(--app-fg))]">
                <input
                  type="checkbox"
                  checked={form.isExtra}
                  onChange={(e) => setForm({ ...form, isExtra: e.target.checked })}
                  className="rounded"
                />
                Overtime
              </label>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSubmit} size="sm">
                {editingId ? 'Update' : 'Add'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="border border-[rgb(var(--app-border))] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--app-muted))]">
            <tr>
              <th className="px-3 py-2 text-left text-[rgb(var(--app-muted-fg))]">Date</th>
              <th className="px-3 py-2 text-left text-[rgb(var(--app-muted-fg))]">Client</th>
              <th className="px-3 py-2 text-left text-[rgb(var(--app-muted-fg))]">Description</th>
              <th className="px-3 py-2 text-center text-[rgb(var(--app-muted-fg))]">Time</th>
              <th className="px-3 py-2 text-center text-[rgb(var(--app-muted-fg))]">Duration</th>
              <th className="px-3 py-2 text-center text-[rgb(var(--app-muted-fg))]">Status</th>
              <th className="px-3 py-2 text-right text-[rgb(var(--app-muted-fg))]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-muted))]">
                <td className="px-3 py-2 text-[rgb(var(--app-fg))]">{entry.date}</td>
                <td className="px-3 py-2 text-[rgb(var(--app-fg))]">{entry.client}</td>
                <td className="px-3 py-2 text-[rgb(var(--app-fg))]">
                  {entry.description}
                  {entry.project && (
                    <span className="ml-1 text-xs text-[rgb(var(--app-muted-fg))]">({entry.project})</span>
                  )}
                  {entry.isExtra && (
                    <span className="ml-1 text-xs text-orange-500">OT</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-[rgb(var(--app-muted-fg))]">
                  {entry.startTime?.substring(0, 5)} - {entry.endTime?.substring(0, 5)}
                </td>
                <td className="px-3 py-2 text-center font-medium text-[rgb(var(--app-fg))]">
                  {formatDuration(entry.durationMinutes)}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => handleToggleLaunched(entry.id, entry.launched)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      entry.launched
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {entry.launched ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {entry.launched ? 'Exported' : 'Pending'}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleEdit(entry)}
                    className="p-1 hover:bg-[rgb(var(--app-muted))] rounded"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-[rgb(var(--app-muted-fg))]" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1 hover:bg-red-100 rounded ml-1"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[rgb(var(--app-muted-fg))]">
                  No timesheet entries for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
