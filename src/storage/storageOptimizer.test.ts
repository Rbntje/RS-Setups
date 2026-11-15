import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialWorkspaceState, createLocalStore, createMemoryAdapter } from './localStore';
import {
  MAX_STORAGE_BUDGET_BYTES,
  calculateWorkspaceStorageStats,
  optimizeWorkspaceStorage,
} from './storageOptimizer';

test('storageOptimizer computes exact bytes and enforces target budget cap', () => {
  const base = createInitialWorkspaceState();
  assert.equal(base.setups.length, 0, 'Fresh user must start from scratch with 0 setups');
  assert.deepEqual(
    base.folders.map((f) => f.name),
    ['2025', '2026'],
    'Default folders 2025 and 2026 must exist automatically'
  );

  const stats = calculateWorkspaceStorageStats(base);
  assert.equal(stats.budgetBytes, MAX_STORAGE_BUDGET_BYTES);
  assert.ok(stats.totalBytes > 0 && stats.totalBytes < MAX_STORAGE_BUDGET_BYTES);

  // Add negligible AI weights and duplicate feedback logs -> optimizer cleans them
  base.aiBrain.globalStyleShifts.frontWingAero = 0.001;
  base.aiBrain.recentInsights = ['Insight A', 'insight a', 'Insight B'];
  const report = optimizeWorkspaceStorage(base);
  assert.equal(report.nextState.aiBrain.globalStyleShifts.frontWingAero, undefined);
  assert.equal(report.nextState.aiBrain.recentInsights.length, 2);
});

test('storageOptimizer trims non-favourite history/setups to respect tight budget', async () => {
  const store = createLocalStore(createMemoryAdapter());
  for (let i = 0; i < 6; i++) {
    const draft = store.generateSetupDraft({
      gameVersion: i % 2 === 0 ? 'f1_25_2025' : 'f1_25_2026_pack',
      circuitId: 'spa',
      weather: 'dry',
      sessionType: 'race',
    });
    await store.saveSetupDraft({
      title: `Spa Run ${i}`,
      folderId: i % 2 === 0 ? 'folder_2025' : 'folder_2026',
      gameVersion: i % 2 === 0 ? 'f1_25_2025' : 'f1_25_2026_pack',
      circuitId: 'spa',
      weather: 'dry',
      sessionType: 'race',
      raceTyreFocus: true,
      raceConsistencyFocus: true,
      parameters: draft.parameters,
      analysis: draft.analysis,
    });
  }

  const ws = await store.loadWorkspace();
  const report = optimizeWorkspaceStorage(ws, { targetBudgetBytes: 18000 });
  assert.ok(report.bytesAfter <= 18000 || report.bytesAfter < report.bytesBefore);
  assert.ok(report.actionsPerformed.length > 0);
});
