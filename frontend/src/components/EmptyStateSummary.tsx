'use client';

import { motion } from 'framer-motion';
import { FileQuestion, Sparkles } from 'lucide-react';
import { AppButton } from '@/components/ui/app-button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';

interface EmptyStateSummaryProps {
  onGenerate: () => void;
  hasModel: boolean;
  isGenerating?: boolean;
}

export function EmptyStateSummary({ onGenerate, hasModel, isGenerating = false }: EmptyStateSummaryProps) {
  const t = useTranslations('settings');
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center h-full p-8 text-center"
    >
      <FileQuestion className="w-16 h-16 text-[rgb(var(--app-muted-fg))] mb-4" />
      <h3 className="text-lg font-semibold text-[rgb(var(--app-fg))] mb-2">
        {t('empty_state.title')}
      </h3>
      <p className="text-sm text-[rgb(var(--app-muted-fg))] mb-6 max-w-md">
        {t('empty_state.description')}
      </p>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <AppButton
                variant="primary"
                onClick={onGenerate}
                disabled={!hasModel || isGenerating}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isGenerating ? t('empty_state.generating') : t('empty_state.generate')}
              </AppButton>
            </div>
          </TooltipTrigger>
          {!hasModel && (
            <TooltipContent>
              <p>{t('empty_state.select_model_first')}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {!hasModel && (
        <p className="text-xs text-[rgb(var(--app-warning))] mt-3">
          {t('empty_state.select_model_first')}
        </p>
      )}
    </motion.div>
  );
}
