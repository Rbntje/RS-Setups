import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FOLDER_2026_ID,
  createLocalStore,
  createMemoryAdapter,
} from './localStore';

test('localStore starts from scratch with 2025/2026 folders, saves edited drafts into custom folders, and trains AI', async () => {
  const adapter = createMemoryAdapter();
  const store = createLocalStore(adapter);

  const ws1 = await store.loadWorkspace();
  assert.equal(ws1.setups.length, 0, 'Should start completely empty with 0 setups');
  assert.deepEqual(
    ws1.folders.map((f) => f.name),
    ['2025', '2026']
  );

  // 1. Generate draft BEFORE saving
  const draft = store.generateSetupDraft({
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'spa',
    weather: 'wet',
    sessionType: 'race',
    raceTyreFocus: true,
    raceConsistencyFocus: true,
  });

  // Modify one parameter manually before saving & create a new folder inline
  const tweakedParams = {
    ...draft.parameters,
    frontWingAero: draft.parameters.frontWingAero + 1,
  };

  const created = await store.saveSetupDraft({
    title: 'My Spa Wet Attack',
    folderId: DEFAULT_FOLDER_2026_ID,
    newFolderName: 'League Wet',
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'spa',
    weather: 'wet',
    sessionType: 'race',
    raceTyreFocus: true,
    raceConsistencyFocus: true,
    parameters: tweakedParams,
    analysis: draft.analysis,
  });

  assert.equal(created.title, 'My Spa Wet Attack');
  assert.equal(created.currentVersion, 1);

  const wsAfterSave = await store.loadWorkspace();
  assert.equal(wsAfterSave.folders.length, 3);
  const leagueFolder = wsAfterSave.folders.find((f) => f.name === 'League Wet');
  assert.ok(leagueFolder);
  assert.equal(created.folderId, leagueFolder.id);

  // 2. Submit feedback -> creates v2 and teaches AI brain
  const fbRes = await store.submitFeedback(created.id, {
    tags: ['less_oversteer', 'better_traction'],
    notes: 'Slight snap exiting Pouhon',
  });
  assert.equal(fbRes.setup.currentVersion, 2);

  // 3. Apply custom-coded RS AI tune -> creates v3
  const aiRes = await store.applyAiTune(
    created.id,
    'Achterkant breekt uit bij gas geven en stuitert over kerbs'
  );
  assert.equal(aiRes.setup.currentVersion, 3);

  // 4. Delete custom folder -> setup safely moves back to 2026 default folder
  await store.deleteFolder(leagueFolder.id);
  const wsAfterFolderDelete = await store.loadWorkspace();
  assert.equal(wsAfterFolderDelete.folders.length, 2);
  assert.equal(wsAfterFolderDelete.setups[0].folderId, DEFAULT_FOLDER_2026_ID);

  // 5. Run AI storage optimization
  const optReport = await store.runAiOptimization();
  assert.ok(optReport.bytesAfter > 0);

  // 6. Export and import JSON backup cleanly
  const backup = await store.exportBackupJson();
  const freshStore = createLocalStore(createMemoryAdapter());
  const imported = await freshStore.importBackupJson(backup);
  assert.equal(imported.setups.length, 1);
  assert.equal(imported.setups[0].title, 'My Spa Wet Attack');
  assert.ok(imported.aiBrain.learnedInteractions >= 2);
});
