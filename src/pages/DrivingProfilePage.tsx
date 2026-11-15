import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import type { CornerPhase, DrivingProfile, GameVersion } from '../types/setup';
import { GAME_VERSIONS } from '../engine/specs';

interface DrivingProfilePageProps {
  initialVersion?: GameVersion;
  profiles: Record<GameVersion, DrivingProfile>;
  onSaveProfile: (profile: DrivingProfile) => Promise<void>;
  onLaunchWizard: (gameVersion: GameVersion) => void;
}

const SLIDERS: Array<{
  key: keyof Pick<
    DrivingProfile,
    | 'speedVsGrip'
    | 'rearStability'
    | 'carAggression'
    | 'understeerTendency'
    | 'oversteerTendency'
    | 'tyreWearPriority'
    | 'paceVsConsistency'
    | 'limitConfidence'
    | 'wetConfidence'
  >;
  label: string;
  low: string;
  high: string;
}> = [
  { key: 'speedVsGrip', label: 'Top Speed vs. Cornering Grip', low: 'Top speed', high: 'Grip' },
  { key: 'rearStability', label: 'Rear-End Stability', low: 'Agile', high: 'Planted' },
  { key: 'carAggression', label: 'Car Aggression', low: 'Predictable', high: 'Sharp' },
  { key: 'understeerTendency', label: 'Understeer Sensitivity', low: 'Rare', high: 'Frequent' },
  { key: 'oversteerTendency', label: 'Oversteer Sensitivity', low: 'Rare', high: 'Frequent' },
  { key: 'tyreWearPriority', label: 'Tyre Wear Management', low: 'Pace', high: 'Long life' },
  { key: 'paceVsConsistency', label: 'Qualifying vs. Consistency', low: 'Quali', high: 'Race' },
  { key: 'limitConfidence', label: 'Confidence on the Limit', low: 'Margin', high: 'On edge' },
  { key: 'wetConfidence', label: 'Wet Weather Confidence', low: 'Safe', high: 'Aggressive' },
];

export const DrivingProfilePage: React.FC<DrivingProfilePageProps> = ({
  initialVersion = 'f1_25_2025',
  profiles,
  onSaveProfile,
  onLaunchWizard,
}) => {
  const [activeVersion, setActiveVersion] = useState<GameVersion>(initialVersion);
  const [drafts, setDrafts] = useState<Record<GameVersion, DrivingProfile>>(profiles);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setDrafts(profiles);
  }, [profiles]);

  const current = drafts[activeVersion];

  const updateField = <K extends keyof DrivingProfile>(key: K, value: DrivingProfile[K]) => {
    setSavedNotice(null);
    setDrafts((prev) => ({
      ...prev,
      [activeVersion]: {
        ...prev[activeVersion],
        [key]: value,
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      await onSaveProfile(current);
      setSavedNotice(`Saved ${GAME_VERSIONS[activeVersion].shortLabel} profile on this phone.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save driving profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#0A192F]">Driving Style</h1>
          <p className="text-xs text-[#526581]">Saved separately for 2025 &amp; 2026.</p>
        </div>

        <button
          type="button"
          onClick={() => onLaunchWizard(activeVersion)}
          className="ios-press inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[#007AFF] shadow-sm min-h-[38px] cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Wizard</span>
        </button>
      </div>

      {/* Animated iOS Segmented Version Toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[#E5E7EB]/85 rounded-2xl">
        {(['f1_25_2025', 'f1_25_2026_pack'] as const).map((ver) => {
          const active = activeVersion === ver;
          return (
            <button
              key={ver}
              type="button"
              onClick={() => {
                setActiveVersion(ver);
                setSavedNotice(null);
              }}
              className={`relative z-0 px-3 py-2 text-xs font-bold rounded-xl cursor-pointer min-h-[38px] whitespace-nowrap transition-colors ${
                active ? 'text-[#007AFF]' : 'text-[#526581]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="profile-version-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-white shadow-sm -z-10"
                />
              )}
              {GAME_VERSIONS[ver].shortLabel}
            </button>
          );
        })}
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#C6DAF7] bg-[#EBF3FF] p-3 text-xs font-medium text-[#0A2558]">
          <CheckCircle2 className="w-4 h-4 text-[#007AFF] shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="ios-card rounded-[26px] p-4 space-y-5">
        <div className="space-y-4">
          {SLIDERS.map((s) => (
            <div key={s.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`slider-${s.key}`} className="text-xs font-bold text-[#0A192F]">
                  {s.label}
                </label>
                <span className="font-mono-tabular text-xs font-bold text-[#007AFF] shrink-0">
                  {current[s.key]}/10
                </span>
              </div>
              <input
                id={`slider-${s.key}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={current[s.key]}
                onChange={(e) => updateField(s.key, Number(e.target.value))}
                className="w-full h-7 accent-[#007AFF] cursor-pointer"
              />
              <div className="flex justify-between text-[10.5px] text-[#64748B]">
                <span>{s.low}</span>
                <span>{s.high}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-black/[0.06] grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="understeer-phase" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Understeer Phase
            </label>
            <select
              id="understeer-phase"
              value={current.understeerPhase}
              onChange={(e) => updateField('understeerPhase', e.target.value as CornerPhase)}
              className="w-full rounded-2xl bg-[#F2F2F7] px-2.5 py-2 text-xs font-semibold text-[#0A192F] min-h-[42px]"
            >
              <option value="none">Balanced</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid-Corner</option>
              <option value="exit">Exit</option>
            </select>
          </div>

          <div>
            <label htmlFor="oversteer-phase" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Oversteer Phase
            </label>
            <select
              id="oversteer-phase"
              value={current.oversteerPhase}
              onChange={(e) => updateField('oversteerPhase', e.target.value as CornerPhase)}
              className="w-full rounded-2xl bg-[#F2F2F7] px-2.5 py-2 text-xs font-semibold text-[#0A192F] min-h-[42px]"
            >
              <option value="none">Balanced</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid-Corner</option>
              <option value="exit">Exit</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="ios-press w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-4 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 min-h-[46px] cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Local Profile'}</span>
        </button>
      </form>
    </div>
  );
};
