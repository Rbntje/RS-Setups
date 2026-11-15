import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import type { DrivingProfile, GameVersion } from '../types/setup';
import { GAME_VERSIONS } from '../engine/specs';
import {
  DEFAULT_WIZARD_ANSWERS,
  buildProfileFromAnswers,
  getVisibleWizardSteps,
  type WizardAnswers,
} from '../engine/wizard';
import { BrandMark } from './BrandMark';

interface SetupWizardProps {
  initialVersion?: GameVersion;
  onSaveProfile: (profile: DrivingProfile) => Promise<DrivingProfile>;
  onComplete: (profile: DrivingProfile) => void;
  onCancel?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  initialVersion = 'f1_25_2025',
  onSaveProfile,
  onComplete,
  onCancel,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<GameVersion>(initialVersion);
  const [stepIndex, setStepIndex] = useState(-1);
  const [answers, setAnswers] = useState<WizardAnswers>(DEFAULT_WIZARD_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSteps = useMemo(() => getVisibleWizardSteps(answers), [answers]);
  const currentStep = stepIndex >= 0 ? visibleSteps[stepIndex] : null;
  const progressPct =
    stepIndex < 0 ? 5 : Math.round(((stepIndex + 1) / visibleSteps.length) * 100);

  const handleNext = async () => {
    setError(null);
    if (stepIndex < visibleSteps.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }

    setSaving(true);
    try {
      const built = buildProfileFromAnswers(answers, selectedVersion);
      const saved = await onSaveProfile(built);
      onComplete(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save driving profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (stepIndex >= 0) {
      setStepIndex((i) => i - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="space-y-4">
      <div className="liquid-glass rounded-3xl p-5">
        {/* Header & Progress */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#0A192F] truncate">
                Driving Style Calibration
              </div>
              <div className="text-xs text-[#526581]">
                {stepIndex < 0
                  ? 'Step 1 · Select Car Spec'
                  : `Question ${stepIndex + 1} of ${visibleSteps.length}`}
              </div>
            </div>
          </div>

          <div className="text-xs font-mono-tabular font-bold text-[#0B4F9E] shrink-0">
            {progressPct}%
          </div>
        </div>

        <div className="mt-3.5 h-1.5 w-full rounded-full bg-[#DCE6F5] overflow-hidden">
          <div
            className="h-full bg-[#1D6FE8] transition-all duration-300 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {error}
          </div>
        )}

        {/* Step Body */}
        <div className="mt-5 min-h-[300px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {stepIndex < 0 ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
              >
                <h1 className="text-xl font-bold tracking-tight text-[#0A192F] text-balance">
                  Calibrate your driving style
                </h1>
                <p className="mt-2 text-xs text-[#475569] leading-relaxed">
                  Answer a quick 2-minute questionnaire so the on-device AI balances top speed,
                  rear stability, and tyre wear for your exact driving feel. Saved on your phone.
                </p>

                <div className="mt-4 space-y-2.5">
                  <div className="text-xs font-semibold text-[#334155]">
                    Choose EA Sports F1 25 cars to calibrate
                  </div>
                  {(['f1_25_2025', 'f1_25_2026_pack'] as const).map((ver) => {
                    const info = GAME_VERSIONS[ver];
                    const active = selectedVersion === ver;
                    return (
                      <button
                        key={ver}
                        type="button"
                        onClick={() => setSelectedVersion(ver)}
                        className={`w-full rounded-2xl p-3.5 text-left border transition-all cursor-pointer min-h-[60px] ${
                          active
                            ? 'border-[#0B4F9E] bg-[#EBF3FF] shadow-sm'
                            : 'border-[#D5E1F2] bg-white/80 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#0A192F]">{info.shortLabel}</span>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#0B4F9E] shrink-0" />}
                        </div>
                        <div className="mt-1 text-xs text-[#526581] leading-snug">
                          {info.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : currentStep ? (
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
                      <span className="font-mono-tabular text-sm font-bold text-[#0B4F9E]">
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
                            className={`h-11 rounded-xl font-mono-tabular text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
                              selected
                                ? 'bg-[#0B4F9E] text-white shadow-[0_6px_14px_rgba(11,79,158,0.28)]'
                                : 'bg-white/85 border border-[#D4E2F5] text-[#334155] hover:border-[#1D6FE8]'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2.5">
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
                          className={`w-full rounded-2xl p-3.5 text-left border transition-all cursor-pointer min-h-[54px] ${
                            active
                              ? 'border-[#0B4F9E] bg-[#EBF3FF]'
                              : 'border-[#D4E2F5] bg-white/85 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#0A192F]">{choice.label}</span>
                            {active && <CheckCircle2 className="w-4 h-4 text-[#0B4F9E] shrink-0" />}
                          </div>
                          <div className="mt-1 text-xs text-[#526581]">{choice.detail}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Footer Thumb Controls */}
          <div className="mt-6 pt-4 border-t border-[#DCE6F5] flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD8EC] bg-white/85 px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-white transition-colors min-h-[44px] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{stepIndex < 0 ? 'Cancel' : 'Back'}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleNext}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4F9E] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(11,79,158,0.28)] hover:bg-[#093E7E] disabled:opacity-60 transition-colors min-h-[46px] cursor-pointer"
            >
              {stepIndex === visibleSteps.length - 1 ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Driving Profile'}</span>
                </>
              ) : (
                <>
                  <span>{stepIndex < 0 ? 'Start Calibration' : 'Continue'}</span>
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
