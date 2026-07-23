import { invoke } from '@tauri-apps/api/core';

export const getMeetingNote = (meetingId: string) =>
  invoke<string | null>('get_meeting_note', { meetingId });

export const saveMeetingNote = (meetingId: string, content: string) =>
  invoke<void>('save_meeting_note', { meetingId, content });

export const getMeetingActionStates = (meetingId: string) =>
  invoke<Record<string, boolean>>('get_meeting_action_states', { meetingId });

export const setMeetingActionCompleted = (
  meetingId: string,
  actionId: string,
  completed: boolean,
) => invoke<void>('set_meeting_action_completed', { meetingId, actionId, completed });
