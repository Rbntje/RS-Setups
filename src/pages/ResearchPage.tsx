import React, { useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import type { GameVersion, ResearchResult, SessionType, WeatherType } from '../types/setup';
import { CIRCUITS, GAME_VERSIONS } from '../engine/specs';

interface ResearchPageProps {
  references: ResearchResult[];
  onAddReference: (payload: {
    title: string;
    sourceName: string;
    circuitId: string;
    gameVersion: GameVersion;
    weather: WeatherType;
    sessionType: SessionType;
    rawText: string;
  }) => Promise<ResearchResult>;
  onDeleteReference: (refId: string) => Promise<void>;
}

export const ResearchPage: React.FC<ResearchPageProps> = ({
  references,
  onAddReference,
  onDeleteReference,
}) => {
  const [title, setTitle] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [circuitId, setCircuitId] = useState('silverstone');
  const [gameVersion, setGameVersion] = useState<GameVersion>('f1_25_2025');
  const [weather, setWeather] = useState<WeatherType>('dry');
  const [sessionType, setSessionType] = useState<SessionType>('race');
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      setError('Paste setup values or notes first.');
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const created = await onAddReference({
        title,
        sourceName,
        circuitId,
        gameVersion,
        weather,
        sessionType,
        rawText,
      });
      setTitle('');
      setSourceName('');
      setRawText('');
      setNotice(created.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse reference setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#0A192F]">Setup Library</h1>
        <p className="mt-0.5 text-xs text-[#526581] leading-relaxed">
          Paste any community or friend&apos;s setup text offline. RS Setups extracts valid parameters
          locally and blends them gently (max 22%) into future setups for that track.
        </p>
      </div>

      {/* Paste & Parse Offline Form */}
      <form onSubmit={handleSubmit} className="liquid-glass rounded-3xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-[#0B4F9E]" />
          <h2 className="text-sm font-bold text-[#0A192F]">Import Reference Setup</h2>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-[#C6DAF7] bg-[#EBF3FF] p-2.5 text-xs text-[#0A2558]">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="lib-ver" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Car Spec
            </label>
            <select
              id="lib-ver"
              value={gameVersion}
              onChange={(e) => setGameVersion(e.target.value as GameVersion)}
              className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-2.5 py-2 text-xs min-h-[40px]"
            >
              <option value="f1_25_2025">2025 Cars</option>
              <option value="f1_25_2026_pack">2026 Pack</option>
            </select>
          </div>

          <div>
            <label htmlFor="lib-circuit" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Circuit
            </label>
            <select
              id="lib-circuit"
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value)}
              className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-2.5 py-2 text-xs min-h-[40px]"
            >
              {CIRCUITS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="lib-weather" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Weather
            </label>
            <select
              id="lib-weather"
              value={weather}
              onChange={(e) => setWeather(e.target.value as WeatherType)}
              className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-2.5 py-2 text-xs min-h-[40px]"
            >
              <option value="dry">Dry</option>
              <option value="wet">Wet</option>
            </select>
          </div>

          <div>
            <label htmlFor="lib-session" className="block text-[11px] font-semibold text-[#334155] mb-1">
              Session
            </label>
            <select
              id="lib-session"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-2.5 py-2 text-xs min-h-[40px]"
            >
              <option value="race">Race</option>
              <option value="qualifying">Qualifying</option>
              <option value="time_trial">Time Trial</option>
              <option value="practice">Practice</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            aria-label="Setup title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Label (e.g. League Dry)"
            className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-3 py-2 text-xs min-h-[40px]"
          />
          <input
            type="text"
            aria-label="Source name"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Source (e.g. YouTube)"
            className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-3 py-2 text-xs min-h-[40px]"
          />
        </div>

        <div>
          <label htmlFor="lib-raw" className="block text-[11px] font-semibold text-[#334155] mb-1">
            Paste Setup Numbers
          </label>
          <textarea
            id="lib-raw"
            rows={4}
            required
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'Front Wing: 34\nRear Wing: 32\nOn Throttle: 55%\nOff Throttle: 45%\nFront Brake Bias: 55%'}
            className="w-full rounded-xl border border-[#CBD8EC] bg-white/95 px-3 py-2 text-xs font-mono-tabular text-[#0A192F]"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F9E] py-3 px-4 text-xs font-bold text-white hover:bg-[#093E7E] disabled:opacity-60 min-h-[44px] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{saving ? 'Parsing...' : 'Parse & Save Locally'}</span>
        </button>
      </form>

      {/* Saved References List */}
      <section className="liquid-glass rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0A192F]">Saved Reference Setups</h2>
          <span className="font-mono-tabular text-xs text-[#64748B]">{references.length}</span>
        </div>

        {references.length === 0 ? (
          <p className="mt-3 pt-3 border-t border-[#DCE6F5] text-xs text-[#526581] leading-relaxed">
            No reference setups imported yet. Paste any setup above whenever you want to blend it
            into your personal baseline.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-[#DCE6F5]">
            {references.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#526581]">
                    {GAME_VERSIONS[item.gameVersion].shortLabel} <span aria-hidden="true">·</span>{' '}
                    {item.circuitName} <span aria-hidden="true">·</span>{' '}
                    {item.weather.toUpperCase()}
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-[#0A192F] truncate">
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#475569]">{item.summary}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteReference(item.id)}
                  aria-label={`Delete reference ${item.title}`}
                  className="w-9 h-9 rounded-xl bg-white/80 border border-[#D5E1F2] flex items-center justify-center text-[#64748B] hover:text-red-600 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
