import { SummaryPanel } from '@/components/MeetingDetails/SummaryPanel';

// Re-export the SummaryPanel props type
export type MeetingSummaryTabProps = React.ComponentProps<typeof SummaryPanel>;

export function MeetingSummaryTab(props: MeetingSummaryTabProps) {
  return <SummaryPanel {...props} />;
}
