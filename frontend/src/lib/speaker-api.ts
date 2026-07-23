import { invoke } from '@tauri-apps/api/core';
import type { SpeakerPerson, VoiceReference, SpeakerSuggestion, RecognitionMode } from './speaker-types';

export async function listPeople(): Promise<SpeakerPerson[]> {
  return invoke('list_speaker_people');
}

export async function getPerson(id: string): Promise<SpeakerPerson> {
  return invoke('get_speaker_person', { id });
}

export async function createPerson(displayName: string, email?: string, color?: string): Promise<string> {
  return invoke('create_speaker_person', { displayName, email, color });
}

export async function renamePerson(id: string, newName: string): Promise<void> {
  return invoke('rename_speaker_person', { id, newName });
}

export async function deletePerson(id: string): Promise<void> {
  return invoke('delete_speaker_person', { id });
}

export async function mergePeople(sourceId: string, targetId: string): Promise<void> {
  return invoke('merge_speaker_people', { sourceId, targetId });
}

export async function listReferences(personId: string): Promise<VoiceReference[]> {
  return invoke('list_speaker_voice_references', { personId });
}

export async function getReferenceAudioPath(referenceId: string): Promise<string | null> {
  return invoke('get_speaker_voice_reference_audio_path', { referenceId });
}

export async function deleteReference(referenceId: string): Promise<void> {
  return invoke('delete_speaker_voice_reference', { referenceId });
}

export async function listSuggestions(meetingId: string): Promise<SpeakerSuggestion[]> {
  return invoke('list_speaker_suggestions', { meetingId });
}

export async function acceptSuggestion(suggestionId: string): Promise<void> {
  return invoke('accept_speaker_suggestion', { suggestionId });
}

export async function rejectSuggestion(suggestionId: string): Promise<void> {
  return invoke('reject_speaker_suggestion', { suggestionId });
}

export async function getRecognitionPreferences(): Promise<{ recognitionMode: RecognitionMode; lockAudioChannels: boolean; minimumReferenceQuality: number }> {
  return invoke('get_speaker_recognition_preferences');
}

export async function setRecognitionPreferences(prefs: { recognitionMode: RecognitionMode; lockAudioChannels: boolean; minimumReferenceQuality: number }): Promise<void> {
  return invoke('set_speaker_recognition_preferences', { prefs });
}
