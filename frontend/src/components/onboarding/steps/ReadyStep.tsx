import React from 'react';
import { CheckCircle2, Mic, Sparkles } from 'lucide-react';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';

export function ReadyStep() {
  const { completeOnboarding, parakeetDownloaded, summaryModelDownloaded } = useOnboarding();

  const handleFinish = async () => {
    try {
      await completeOnboarding();
      window.location.reload();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  return (
    <OnboardingContainer
      title="You're all set"
      description="Meetily is ready to record, transcribe, and summarize."
      step={5}
      totalSteps={5}
      hideProgress
    >
      <div className="flex flex-col items-center space-y-8">
        {/* Ready indicator */}
        <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>

        {/* Summary of what's ready */}
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Mic className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-700">
              Transcription engine {parakeetDownloaded ? 'ready' : 'downloading in background'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-700">
              Summary engine {summaryModelDownloaded ? 'ready' : 'downloading in background'}
            </span>
          </div>
        </div>

        {/* Finish button */}
        <div className="w-full max-w-xs">
          <button
            onClick={handleFinish}
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Using Meetily
          </button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
