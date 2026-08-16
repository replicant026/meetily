export type MeetingWorkspaceTab = 'transcript' | 'notes' | 'actions' | 'summary';

export interface WorkspaceParticipant {
  id: string;
  name: string;
  color: string;
  /** A source is only shown when it comes from captured-audio provenance. */
  source: 'microphone' | 'system' | 'unknown';
  spokenSeconds: number;
  share: number;
}

export interface WorkspaceAction {
  id: string;
  text: string;
  assigneeId: string | null;
  completed: boolean;
}

export interface AudioController {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  toggle: () => void;
  seek: (seconds: number) => void;
}
