import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import type { DrivingProfile } from '../types/setup';
import {
  DEFAULT_WIZARD_ANSWERS,
  buildProfileFromAnswers,
  getVisibleWizardSteps,
  type WizardAnswers,
} from '../engine/wizard';
import { BrandMark } from './BrandMark';

interface SetupWizardProps {
  onSaveProfile: (profile: DrivingProfile) => Promise<DrivingProfile>;
  onComplete: (profile: DrivingProfile) => void;
  onCancel?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  onSaveProfile,
  onComplete,
  onCancel,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(DEFAULT_WIZARD_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSteps = useMemo(() => getVisibleWizardSteps(answers), [answers]);
  const currentStep = visibleSteps[stepIndex];
  const progressPct = Math.round(((stepIndex + 1) / visibleSteps.length) * 100);

  const handleNext = async () => {
    setError(null);
    if (stepIndex < visibleSteps.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }

    setSaving(true);
    try {
      const built = buildProfileFromAnswers(answers, 'f1_25_2025');
      const saved = await onSaveProfile(built);
      onComplete(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save driving style.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="ios-card rounded-[26px] p-5">
        {/* Header & Progress */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#0A192F] truncate">
                Calibrate Driving Style
              </div>
              <div className="text-xs text-[#526581]">
                Question {stepIndex + 1} of {visibleSteps.length}
              </div>
            </div>
          </div>

          <div className="text-xs font-mono-tabular font-bold text-[#007AFF] shrink-0">
            {progressPct}%
          </div>
        </div>

        <div className="mt-3.5 h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
          <div
            className="h-full bg-[#007AFF] transition-all duration-300 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {error}
          </div>
        )}

        <div className="mt-5 min-h-[270px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {currentStep && (
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.16 }}
              >
                <h2 className="text-lg font-bold tracking-tight text-[#0A192F] text-balance">
                  {currentStep.title}
                </h2>
                <p className="mt-1.5 text-xs text-[#526581] leading-relaxed">
                  {currentStep.subtitle}
                </p>

                {currentStep.type === 'scale' ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#475569] mb-2.5">
                      <span>{currentStep.minLabel}</span>
                      <span className="font-mono-tabular text-sm font-bold text-[#007AFF]">
                        {answers[currentStep.id] as number} / 10
                      </span>
                      <span>{currentStep.maxLabel}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                        const selected = answers[currentStep.id] === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [currentStep.id]: num }))
                            }
                            aria-label={`Select ${num} out of 10`}
                            className={`ios-press h-11 rounded-2xl font-mono-tabular text-sm font-semibold cursor-pointer ${
                              selected
                                ? 'bg-[#007AFF] text-white shadow-sm'
                                : 'bg-[#F2F2F7] text-[#334155]'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {currentStep.choices?.map((choice) => {
                      const active = answers[currentStep.id] === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [currentStep.id]: choice.value,
                            }))
                          }
                          className={`ios-press w-full rounded-2xl p-3.5 text-left border cursor-pointer min-h-[54px] ${
                            active
                              ? 'border-[#007AFF] bg-[#EBF3FF]'
                              : 'border-black/[0.06] bg-[#F2F2F7]/75'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#0A192F]">{choice.label}</span>
                            {active && <CheckCircle2 className="w-4 h-4 text-[#007AFF] shrink-0" />}
                          </div>
                          <div className="mt-1 text-xs text-[#526581]">{choice.detail}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="ios-press inline-flex items-center gap-1.5 rounded-2xl bg-[#F2F2F7] px-4 py-2.5 text-xs font-semibold text-[#334155] min-h-[44px] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{stepIndex === 0 ? 'Cancel' : 'Back'}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleNext}
              className="ios-press flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60 min-h-[46px] cursor-pointer"
            >
              {stepIndex === visibleSteps.length - 1 ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Driving Style'}</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
