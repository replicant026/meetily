export type MeetingWorkspaceTab = 'transcript' | 'notes' | 'actions' | 'summary';

export interface WorkspaceParticipant {
  id: string;
  name: string;
  color: string;
  source: 'microphone' | 'system';
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
