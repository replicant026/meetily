import {
  Settings2, Mic, HardDrive, Keyboard, Bell, Type, Users,
  Cpu, FileText, Download, FlaskConical,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export interface SettingsSectionDef {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  labelKey: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'general', icon: Settings2, labelKey: 'app_settings.sections.general' },
  { id: 'audio', icon: Mic, labelKey: 'app_settings.sections.audio' },
  { id: 'recordings', icon: HardDrive, labelKey: 'app_settings.sections.recordings' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'app_settings.sections.shortcuts' },
  { id: 'notifications', icon: Bell, labelKey: 'app_settings.sections.notifications' },
  { id: 'transcription', icon: Type, labelKey: 'app_settings.sections.transcription' },
  { id: 'speakers', icon: Users, labelKey: 'app_settings.sections.speakers' },
  { id: 'llms', icon: Cpu, labelKey: 'app_settings.sections.llms' },
  { id: 'summaries', icon: FileText, labelKey: 'app_settings.sections.summaries' },
  { id: 'export', icon: Download, labelKey: 'app_settings.sections.export' },
  { id: 'advanced', icon: FlaskConical, labelKey: 'app_settings.sections.advanced' },
];
