import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { FeedbackTag, SavedSetup, SetupVersionRecord } from './types/setup';
import { GAME_VERSIONS } from './engine/specs';
import {
  countLearnedCircuits,
  fetchTargetOnlineKnowledge,
  pickNextCircuitToLearn,
} from './engine/realtimeLearner';
import {
  localStore,
  type LocalWorkspaceState,
} from './storage/localStore';
import {
  calculateWorkspaceStorageStats,
  formatStorageBytes,
} from './storage/storageOptimizer';
import { NavigationShell, type AppRoute } from './components/NavigationShell';
import { SetupWizard } from './components/SetupWizard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { HomePage } from './pages/HomePage';
import { CreateSetupPage } from './pages/CreateSetupPage';
import { MySetupsPage } from './pages/MySetupsPage';
import { SetupDetailsPage } from './pages/SetupDetailsPage';
import { DrivingProfilePage } from './pages/DrivingProfilePage';
import { ResearchPage } from './pages/ResearchPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [workspace, setWorkspace] = useState<LocalWorkspaceState | null>(null);
  const [route, setRoute] = useState<AppRoute>('home');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [activeSetupId, setActiveSetupId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<'setup' | 'ai' | 'feedback' | 'history'>('setup');
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [learnerStatus, setLearnerStatus] = useState<'idle' | 'learning' | 'paused' | 'offline'>(
    'idle'
  );
  const [liveAiActivity, setLiveAiActivity] = useState<string>('Initializing realtime AI engine...');
  const learningInFlightRef = useRef(false);
  const workspaceRef = useRef<LocalWorkspaceState | null>(null);

  const refreshWorkspace = useCallback(async () => {
    const next = await localStore.loadWorkspace();
    setWorkspace(next);
    return next;
  }, []);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    let active = true;
    localStore.loadWorkspace().then((ws) => {
      if (!active) return;
      setWorkspace(ws);
      if (ws.setups[0]) {
        setActiveSetupId(ws.setups[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const storageStats = useMemo(
    () =>
      workspace
        ? calculateWorkspaceStorageStats(workspace)
        : {
            totalBytes: 0,
            budgetBytes: 200 * 1024 * 1024,
            percentUsed: 0,
            setupsBytes: 0,
            aiBrainBytes: 0,
            historyAndRefsBytes: 0,
            overSoftThreshold: false,
            overBudget: false,
          },
    [workspace]
  );

  // Automatic 200 MB guard whenever workspace crosses soft threshold
  useEffect(() => {
    if (!workspace) return;
    if (storageStats.overSoftThreshold || storageStats.overBudget) {
      localStore.runAiOptimization().then((report) => {
        setWorkspace(report.nextState);
      });
    }
  }, [workspace, storageStats.overSoftThreshold, storageStats.overBudget]);

  const runLiveLearningCycle = useCallback(async (force = false): Promise<boolean> => {
    const currentWs = workspaceRef.current;
    if (!currentWs || learningInFlightRef.current) return false;
    if (!force && !currentWs.settings.autoLearnOnline) {
      setLearnerStatus('paused');
      setLiveAiActivity('Realtime web learning paused by user.');
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLearnerStatus('offline');
      const { uniqueCircuits } = countLearnedCircuits(currentWs.aiBrain);
      setLiveAiActivity(`Offline · Using ${uniqueCircuits}/24 locally learned circuits`);
      return false;
    }

    learningInFlightRef.current = true;
    const target = pickNextCircuitToLearn(
      currentWs.aiBrain,
      currentWs.settings.preferredGameVersion,
      currentWs.settings.lastCircuitId
    );
    const specShort = target.gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Spec';

    setLearnerStatus('learning');
    setLiveAiActivity(
      `Scanning websites for ${target.circuit.name} (${specShort} · ${target.weather.toUpperCase()})...`
    );

    try {
      const webPayload = await fetchTargetOnlineKnowledge(target);
      if (webPayload?.ok) {
        await localStore.recordOnlineCircuitLearning({
          webPayload,
          weather: target.weather,
        });
        const updatedWs = await refreshWorkspace();
        const { uniqueCircuits } = countLearnedCircuits(updatedWs.aiBrain);
        const domains = Array.from(new Set(webPayload.webSources.map((s) => s.domain)))
          .slice(0, 2)
          .join(', ');
        setLearnerStatus('idle');
        setLiveAiActivity(
          `Learned ${target.circuit.name} (${webPayload.matchedParameterCount}p via ${domains}) · ${uniqueCircuits}/24 on phone (${formatStorageBytes(calculateWorkspaceStorageStats(updatedWs).aiBrainBytes)})`
        );
        return true;
      } else {
        setLearnerStatus('offline');
        const { uniqueCircuits } = countLearnedCircuits(currentWs.aiBrain);
        setLiveAiActivity(
          `Web unreachable · ${uniqueCircuits}/24 circuits cached locally on phone`
        );
        return false;
      }
    } finally {
      learningInFlightRef.current = false;
    }
  }, [refreshWorkspace]);

  // Real-time background web-learning daemon while user is on the app
  useEffect(() => {
    if (!workspace) return;
    if (!workspace.settings.autoLearnOnline) {
      setLearnerStatus('paused');
      const { uniqueCircuits } = countLearnedCircuits(workspace.aiBrain);
      setLiveAiActivity(`Paused · ${uniqueCircuits}/24 circuits saved locally on phone`);
      return;
    }

    const bootTimer = setTimeout(() => {
      void runLiveLearningCycle(false);
    }, 1500);

    const intervalId = setInterval(() => {
      void runLiveLearningCycle(false);
    }, 16000);

    return () => {
      clearTimeout(bootTimer);
      clearInterval(intervalId);
    };
  }, [Boolean(workspace), workspace?.settings.autoLearnOnline, runLiveLearningCycle]);

  if (!workspace) {
    return (
      <div className="ios-canvas min-h-[100dvh] flex items-center justify-center p-6">
        <div className="ios-card rounded-3xl px-6 py-4 text-xs font-semibold text-[#007AFF]">
          Loading RS Setups...
        </div>
      </div>
    );
  }

  const activeSetup: (SavedSetup & { versions: SetupVersionRecord[] }) | null =
    workspace.setups.find((s) => s.id === activeSetupId) ?? null;

  const unifiedProfile = workspace.profiles[workspace.settings.preferredGameVersion];

  const totalVersionsCount = workspace.setups.reduce(
    (sum, s) => sum + (s.versions?.length ?? 1),
    0
  );

  const motionProp =
    workspace.settings.reducedMotionOverride === 'reduced'
      ? 'always'
      : workspace.settings.reducedMotionOverride === 'full'
        ? 'never'
        : 'user';

  const handleOpenSetup = (
    setupId: string,
    tab: 'setup' | 'ai' | 'feedback' | 'history' = 'setup'
  ) => {
    setActiveSetupId(setupId);
    setDetailsInitialTab(tab);
    setRoute('details');
  };

  const handleToggleFavourite = async (setupId: string) => {
    await localStore.toggleFavourite(setupId);
    await refreshWorkspace();
  };

  const handleDeleteSetup = async (setupId: string) => {
    await localStore.deleteSetup(setupId);
    const next = await refreshWorkspace();
    if (activeSetupId === setupId) {
      setActiveSetupId(next.setups[0]?.id ?? null);
      setRoute('setups');
    }
  };

  const handleExportBackup = async () => {
    const json = await localStore.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rs-setups-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <MotionConfig reducedMotion={motionProp}>
      <div className={workspace.settings.reducedMotionOverride === 'reduced' ? 'reduced-motion' : ''}>
        <OfflineIndicator />

        <NavigationShell
          activeRoute={route}
          onNavigate={(next) => {
            setShowWizard(false);
            setRoute(next);
          }}
          setupCount={workspace.setups.length}
          folderCount={workspace.folders.length}
          activeVersionLabel={GAME_VERSIONS[workspace.settings.preferredGameVersion].shortLabel}
          storageStats={storageStats}
          liveAiActivity={liveAiActivity}
          savedGithubRepo={workspace.settings.githubRepo}
          onSaveGithubRepo={async (repo) => {
            await localStore.saveSettings({ githubRepo: repo });
            await refreshWorkspace();
          }}
          onRunAdminOptimize={async () => {
            const report = await localStore.runAiOptimization();
            setWorkspace(report.nextState);
          }}
          onExportBackup={handleExportBackup}
          onResetWorkspace={async () => {
            const ws = await localStore.resetWorkspace();
            setWorkspace(ws);
            setSelectedFolderId('all');
            setActiveSetupId(null);
            setRoute('home');
          }}
          activeSetupId={activeSetupId}
        >
          {showWizard ? (
            <SetupWizard
              onSaveProfile={async (profile) => {
                const saved = await localStore.saveProfile(profile);
                await refreshWorkspace();
                return saved;
              }}
              onComplete={() => {
                setShowWizard(false);
                setRoute('home');
              }}
              onCancel={() => setShowWizard(false)}
            />
          ) : (
            <>
              {route === 'home' && (
                <HomePage
                  preferredGameVersion={workspace.settings.preferredGameVersion}
                  profiles={workspace.profiles}
                  folders={workspace.folders}
                  setups={workspace.setups}
                  onNavigate={setRoute}
                  onOpenFolder={(folderId) => {
                    setSelectedFolderId(folderId);
                    setRoute('setups');
                  }}
                  onCreateFolder={async (name) => {
                    await localStore.createFolder(name);
                    await refreshWorkspace();
                  }}
                  onOpenSetup={handleOpenSetup}
                  onLaunchWizard={() => setShowWizard(true)}
                />
              )}

              {route === 'create' && (
                <CreateSetupPage
                  initialGameVersion={workspace.settings.preferredGameVersion}
                  initialCircuitId={workspace.settings.lastCircuitId}
                  folders={workspace.folders}
                  profiles={workspace.profiles}
                  aiBrain={workspace.aiBrain}
                  references={workspace.references}
                  circuitNotes={workspace.circuitNotes}
                  onSaveCircuitNote={async (cid, gv, note) => {
                    await localStore.saveCircuitNote(cid, gv, note);
                    await refreshWorkspace();
                  }}
                  onRecordOnlineLearning={async (payload) => {
                    await localStore.recordOnlineCircuitLearning(payload);
                    await refreshWorkspace();
                  }}
                  onRecordAiFeedbackOutcome={async (payload) => {
                    await localStore.recordAiFeedbackOutcome(payload);
                    await refreshWorkspace();
                  }}
                  onGenerateDraft={(payload) => localStore.generateSetupDraft(payload)}
                  onSaveSetupDraft={async (payload) => {
                    const created = await localStore.saveSetupDraft(payload);
                    await refreshWorkspace();
                    return created;
                  }}
                  onCreated={(created) => {
                    setSelectedFolderId(created.folderId);
                    setActiveSetupId(created.id);
                    setDetailsInitialTab('setup');
                    setRoute('details');
                  }}
                />
              )}

              {route === 'setups' && (
                <MySetupsPage
                  folders={workspace.folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                  setups={workspace.setups}
                  onCreateFolder={async (name) => {
                    const created = await localStore.createFolder(name);
                    await refreshWorkspace();
                    setSelectedFolderId(created.id);
                  }}
                  onRenameFolder={async (folderId, name) => {
                    await localStore.renameFolder(folderId, name);
                    await refreshWorkspace();
                  }}
                  onDeleteFolder={async (folderId) => {
                    await localStore.deleteFolder(folderId);
                    await refreshWorkspace();
                  }}
                  onOpenSetup={handleOpenSetup}
                  onToggleFavourite={handleToggleFavourite}
                  onDeleteSetup={handleDeleteSetup}
                  onCreateNew={() => setRoute('create')}
                />
              )}

              {route === 'details' && activeSetup && (
                <SetupDetailsPage
                  setup={activeSetup}
                  folders={workspace.folders}
                  profile={workspace.profiles[activeSetup.gameVersion]}
                  aiBrain={workspace.aiBrain}
                  references={workspace.references}
                  initialTab={detailsInitialTab}
                  onToggleFavourite={handleToggleFavourite}
                  onUpdateSetup={async (setupId, patch) => {
                    await localStore.updateSetup(setupId, patch);
                    await refreshWorkspace();
                  }}
                  onSubmitFeedback={async (setupId, tags, notes) => {
                    await localStore.submitFeedback(setupId, { tags, notes });
                    await refreshWorkspace();
                  }}
                  onApplyAiTune={async (setupId, prompt, precomputedDiagnosis) => {
                    await localStore.applyAiTune(setupId, prompt, precomputedDiagnosis);
                    await refreshWorkspace();
                  }}
                  onRecordOnlineLearning={async (payload) => {
                    await localStore.recordOnlineCircuitLearning(payload);
                    await refreshWorkspace();
                  }}
                  onRecordAiFeedbackOutcome={async (payload) => {
                    await localStore.recordAiFeedbackOutcome(payload);
                    await refreshWorkspace();
                  }}
                  onRestoreVersion={async (setupId, versionNumber) => {
                    await localStore.restoreSetupVersion(setupId, versionNumber);
                    await refreshWorkspace();
                  }}
                />
              )}

              {route === 'profile' && (
                <DrivingProfilePage
                  profile={unifiedProfile}
                  onSaveProfile={async (updated) => {
                    await localStore.saveProfile(updated);
                    await refreshWorkspace();
                  }}
                  onLaunchWizard={() => setShowWizard(true)}
                />
              )}

              {route === 'library' && (
                <ResearchPage
                  references={workspace.references}
                  onAddReference={async (payload) => {
                    const created = await localStore.addParsedReference(payload);
                    await refreshWorkspace();
                    return created;
                  }}
                  onDeleteReference={async (refId) => {
                    await localStore.deleteReference(refId);
                    await refreshWorkspace();
                  }}
                />
              )}

              {route === 'settings' && (
                <SettingsPage
                  settings={workspace.settings}
                  storageStats={storageStats}
                  aiBrain={workspace.aiBrain}
                  learnerStatus={learnerStatus}
                  liveAiActivity={liveAiActivity}
                  stats={{
                    setupsCount: workspace.setups.length,
                    versionsCount: totalVersionsCount,
                    foldersCount: workspace.folders.length,
                    referencesCount: workspace.references.length,
                    aiLearnedCount: workspace.aiBrain.learnedInteractions,
                  }}
                  onOpenLibrary={() => setRoute('library')}
                  onSaveSettings={async (patch) => {
                    await localStore.saveSettings(patch);
                    await refreshWorkspace();
                  }}
                  onTriggerLearnNow={() => runLiveLearningCycle(true)}
                  onRunAiOptimize={async () => {
                    const report = await localStore.runAiOptimization();
                    setWorkspace(report.nextState);
                    return report;
                  }}
                  onExportBackup={() => localStore.exportBackupJson()}
                  onImportBackup={async (rawJson) => {
                    await localStore.importBackupJson(rawJson);
                    const ws = await refreshWorkspace();
                    setActiveSetupId(ws.setups[0]?.id ?? null);
                  }}
                  onResetWorkspace={async () => {
                    const ws = await localStore.resetWorkspace();
                    setWorkspace(ws);
                    setSelectedFolderId('all');
                    setActiveSetupId(null);
                  }}
                />
              )}
            </>
          )}
        </NavigationShell>
      </div>
    </MotionConfig>
  );
}
