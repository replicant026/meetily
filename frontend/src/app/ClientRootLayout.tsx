'use client'

import './globals.css'
import { SidebarProvider } from '@/components/Sidebar/SidebarProvider'
import { AppShell } from '@/components/AppShell/AppShell'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useTranslations } from 'next-intl'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecordingStateProvider } from '@/contexts/RecordingStateContext'
import { OllamaDownloadProvider } from '@/contexts/OllamaDownloadContext'
import { TranscriptProvider } from '@/contexts/TranscriptContext'
import { ConfigProvider } from '@/contexts/ConfigContext'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { OnboardingFlow } from '@/components/onboarding'
import { UpdateCheckProvider } from '@/components/UpdateCheckProvider'
import { RecordingPostProcessingProvider } from '@/contexts/RecordingPostProcessingProvider'
import { GlobalFeedbackLayer } from './_components/GlobalFeedbackLayer'

export default function ClientRootLayout({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const t = useTranslations('common');

  useEffect(() => {
    invoke<{ completed: boolean } | null>('get_onboarding_status')
      .then((status) => {
        const isComplete = status?.completed ?? false;
        if (!isComplete) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        setShowOnboarding(true);
      });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const handler = (e: MouseEvent) => e.preventDefault();
      document.addEventListener('contextmenu', handler);
      return () => document.removeEventListener('contextmenu', handler);
    }
  }, []);

  useEffect(() => {
    const unlisten = listen('request-recording-toggle', () => {
      if (showOnboarding) {
        toast.error(t('feedback.onboarding_complete_setup'), {
          description: t('feedback.onboarding_complete_description')
        });
      } else {
        window.dispatchEvent(new CustomEvent('start-recording-from-sidebar'));
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [showOnboarding, t]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    window.location.reload();
  };

  return (
    <AnalyticsProvider>
      <RecordingStateProvider>
        <TranscriptProvider>
          <ConfigProvider>
            <OllamaDownloadProvider>
              <OnboardingProvider>
                <UpdateCheckProvider>
                  <SidebarProvider>
                    <TooltipProvider>
                      <RecordingPostProcessingProvider>
                        {/* All feedback surfaces: toasts, downloads, import, recovery */}
                        <GlobalFeedbackLayer suppressOverlays={showOnboarding}>
                          {showOnboarding ? (
                            <OnboardingFlow onComplete={handleOnboardingComplete} />
                          ) : (
                            <AppShell>{children}</AppShell>
                          )}
                        </GlobalFeedbackLayer>
                      </RecordingPostProcessingProvider>
                    </TooltipProvider>
                  </SidebarProvider>
                </UpdateCheckProvider>
              </OnboardingProvider>
            </OllamaDownloadProvider>
          </ConfigProvider>
        </TranscriptProvider>
      </RecordingStateProvider>
    </AnalyticsProvider>
  );
}
