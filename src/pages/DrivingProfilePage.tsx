import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import type { CornerPhase, DrivingProfile } from '../types/setup';

interface DrivingProfilePageProps {
  profile: DrivingProfile;
  onSaveProfile: (profile: DrivingProfile) => Promise<void>;
  onLaunchWizard: () => void;
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
  profile,
  onSaveProfile,
  onLaunchWizard,
}) => {
  const [draft, setDraft] = useState<DrivingProfile>(profile);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const updateField = <K extends keyof DrivingProfile>(key: K, value: DrivingProfile[K]) => {
    setSavedNotice(null);
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      await onSaveProfile(draft);
      setSavedNotice('Driving Style saved on this device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save driving style.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#0A192F]">Driving Style</h1>
          <p className="text-xs text-[#526581]">Single unified profile used for all your setups.</p>
        </div>

        <button
          type="button"
          onClick={onLaunchWizard}
          className="ios-press inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[#007AFF] shadow-sm min-h-[38px] cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Quiz</span>
        </button>
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
                  {draft[s.key]}/10
                </span>
              </div>
              <input
                id={`slider-${s.key}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={draft[s.key]}
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
              value={draft.understeerPhase}
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
              value={draft.oversteerPhase}
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
          <span>{saving ? 'Saving...' : 'Save Driving Style'}</span>
        </button>
      </form>
    </div>
  );
};
