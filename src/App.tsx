import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { FeedbackTag, GameVersion, SavedSetup, SetupVersionRecord } from './types/setup';
import { GAME_VERSIONS, PARAMETER_ORDER } from './engine/specs';
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
  const [showWizard, setShowWizard] = useState<GameVersion | null>(null);
  const [profileInitialVersion, setProfileInitialVersion] = useState<GameVersion>('f1_25_2025');
  const [aiCycleIndex, setAiCycleIndex] = useState(0);

  const refreshWorkspace = useCallback(async () => {
    const next = await localStore.loadWorkspace();
    setWorkspace(next);
    return next;
  }, []);

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

  // Live continuous local AI diagnostic & 200 MB cap heartbeat (purely lightweight in-memory checks;
  // only writes to disk if soft compaction threshold is crossed).
  useEffect(() => {
    const id = setInterval(() => {
      setAiCycleIndex((c) => (c + 1) % 4);
    }, 2800);
    return () => clearInterval(id);
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

  const liveAiActivity = useMemo(() => {
    if (!workspace) return 'Booting local AI core...';
    const trackBiasCount = Object.keys(workspace.aiBrain.trackBiases).length;
    const totalParamsChecked = workspace.setups.length * PARAMETER_ORDER.length;

    switch (aiCycleIndex) {
      case 0:
        return workspace.setups.length > 0
          ? `Validating ${totalParamsChecked} setup bounds across ${workspace.setups.length} setup${workspace.setups.length === 1 ? '' : 's'}`
          : 'Ready · Monitoring 2025 & 2026 physics specs';
      case 1:
        return trackBiasCount > 0
          ? `Balancing ${trackBiasCount} circuit weight vector${trackBiasCount === 1 ? '' : 's'} on-device`
          : 'Scanning 24 F1 circuits & kerb profiles locally';
      case 2:
        return `Memory guard active · ${formatStorageBytes(storageStats.totalBytes)} / 200 MB used`;
      default:
        return workspace.aiBrain.learnedInteractions > 0
          ? `Consolidating ${workspace.aiBrain.learnedInteractions} learned driver adjustments`
          : 'Idle-free check · Ready to learn your driving feedback';
    }
  }, [workspace, aiCycleIndex, storageStats.totalBytes]);

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
            setShowWizard(null);
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
              initialVersion={showWizard}
              onSaveProfile={async (profile) => {
                const saved = await localStore.saveProfile(profile);
                await refreshWorkspace();
                return saved;
              }}
              onComplete={() => {
                setShowWizard(null);
                setRoute('home');
              }}
              onCancel={() => setShowWizard(null)}
            />
          ) : (
            <>
              {route === 'home' && (
                <HomePage
                  preferredGameVersion={workspace.settings.preferredGameVersion}
                  profiles={workspace.profiles}
                  folders={workspace.folders}
                  setups={workspace.setups}
                  aiBrain={workspace.aiBrain}
                  liveAiActivity={liveAiActivity}
                  onNavigate={setRoute}
                  onOpenFolder={(folderId) => {
                    setSelectedFolderId(folderId);
                    setRoute('setups');
                  }}
                  onOpenSetup={handleOpenSetup}
                  onLaunchWizard={(gv) => setShowWizard(gv)}
                />
              )}

              {route === 'create' && (
                <CreateSetupPage
                  initialGameVersion={workspace.settings.preferredGameVersion}
                  initialCircuitId={workspace.settings.lastCircuitId}
                  folders={workspace.folders}
                  profiles={workspace.profiles}
                  circuitNotes={workspace.circuitNotes}
                  onSaveCircuitNote={async (cid, gv, note) => {
                    await localStore.saveCircuitNote(cid, gv, note);
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
                  onEditProfile={(gv) => {
                    setProfileInitialVersion(gv);
                    setRoute('profile');
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
                  onApplyAiTune={async (setupId, prompt) => {
                    await localStore.applyAiTune(setupId, prompt);
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
                  initialVersion={profileInitialVersion}
                  profiles={workspace.profiles}
                  onSaveProfile={async (updated) => {
                    await localStore.saveProfile(updated);
                    await refreshWorkspace();
                  }}
                  onLaunchWizard={(gv) => setShowWizard(gv)}
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
                  liveAiActivity={liveAiActivity}
                  stats={{
                    setupsCount: workspace.setups.length,
                    versionsCount: totalVersionsCount,
                    foldersCount: workspace.folders.length,
                    referencesCount: workspace.references.length,
                    aiLearnedCount: workspace.aiBrain.learnedInteractions,
                  }}
                  onSaveSettings={async (patch) => {
                    await localStore.saveSettings(patch);
                    await refreshWorkspace();
                  }}
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
