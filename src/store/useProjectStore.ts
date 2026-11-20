'use client';

import { create } from 'zustand';
import type { SnapshotCalcRow } from '@/lib/rab/calc';
import {
  computeDraftWorkspace,
  computeFinalizedWorkspace,
  type ComputedWorkspaceState,
  type WorkspaceAhspItem,
  type WorkspaceCompositionItem,
  type WorkspacePriceItem,
  type WorkspaceProject,
  type WorkspaceRegion,
  type WorkspaceTakeoffRow,
  type WorkspaceWbsNode,
} from '@/lib/rab/workspace-calc';
import type { WorkspacePayload } from '@/app/actions/project';

interface ProjectStoreState {
  project: WorkspaceProject | null;
  regions: WorkspaceRegion[];
  wbsList: WorkspaceWbsNode[];
  takeoffs: WorkspaceTakeoffRow[];
  ahsps: WorkspaceAhspItem[];
  compositions: WorkspaceCompositionItem[];
  prices: WorkspacePriceItem[];
  snapshots: SnapshotCalcRow[];
  computed: ComputedWorkspaceState | null;
  selectedWbsId: string | null;
  hasDummy: boolean;
  dirtyRowIds: Record<string, boolean>;
  rowServerErrors: Record<string, string | null>;

  hydrate: (payload: WorkspacePayload, keepSelectedWbs?: boolean) => void;
  selectWbs: (wbsId: string | null) => void;
  updateTakeoffFieldLocal: (
    takeoffId: string,
    patch: Partial<WorkspaceTakeoffRow>
  ) => void;
  applyServerTakeoffRow: (row: WorkspaceTakeoffRow) => void;
  setRowServerError: (takeoffId: string, error: string | null) => void;
  recompute: () => void;
}

function runCompute(state: {
  project: WorkspaceProject | null;
  wbsList: WorkspaceWbsNode[];
  takeoffs: WorkspaceTakeoffRow[];
  ahsps: WorkspaceAhspItem[];
  compositions: WorkspaceCompositionItem[];
  prices: WorkspacePriceItem[];
  snapshots: SnapshotCalcRow[];
}): ComputedWorkspaceState | null {
  if (!state.project) return null;
  if (state.project.status === 'FINALIZED') {
    return computeFinalizedWorkspace({
      project: state.project,
      wbsList: state.wbsList,
      takeoffs: state.takeoffs,
      snapshots: state.snapshots,
    });
  }
  return computeDraftWorkspace({
    project: state.project,
    wbsList: state.wbsList,
    takeoffs: state.takeoffs,
    ahsps: state.ahsps,
    compositions: state.compositions,
    prices: state.prices,
  });
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: null,
  regions: [],
  wbsList: [],
  takeoffs: [],
  ahsps: [],
  compositions: [],
  prices: [],
  snapshots: [],
  computed: null,
  selectedWbsId: null,
  hasDummy: false,
  dirtyRowIds: {},
  rowServerErrors: {},

  hydrate: (payload, keepSelectedWbs = true) => {
    const prevSelected = get().selectedWbsId;
    const stillExists =
      keepSelectedWbs &&
      prevSelected !== null &&
      payload.wbsList.some((w) => w.id === prevSelected);

    const firstLeafOrRoot =
      payload.wbsList.find(
        (w) => !payload.wbsList.some((c) => c.parentId === w.id)
      )?.id ??
      payload.wbsList[0]?.id ??
      null;

    set({
      project: payload.project,
      regions: payload.regions,
      wbsList: payload.wbsList,
      takeoffs: payload.takeoffs,
      ahsps: payload.ahsps,
      compositions: payload.compositions,
      prices: payload.prices,
      snapshots: payload.snapshots,
      computed: payload.computed,
      hasDummy: payload.hasDummy,
      selectedWbsId: stillExists ? prevSelected : firstLeafOrRoot,
      dirtyRowIds: {},
      rowServerErrors: {},
    });
  },

  selectWbs: (wbsId) => set({ selectedWbsId: wbsId }),

  updateTakeoffFieldLocal: (takeoffId, patch) => {
    const state = get();
    if (!state.project || state.project.status === 'FINALIZED') return;

    const nextTakeoffs = state.takeoffs.map((row) =>
      row.id === takeoffId ? { ...row, ...patch } : row
    );

    const computed = runCompute({
      project: state.project,
      wbsList: state.wbsList,
      takeoffs: nextTakeoffs,
      ahsps: state.ahsps,
      compositions: state.compositions,
      prices: state.prices,
      snapshots: state.snapshots,
    });

    set({
      takeoffs: nextTakeoffs,
      computed,
      dirtyRowIds: { ...state.dirtyRowIds, [takeoffId]: true },
      rowServerErrors: { ...state.rowServerErrors, [takeoffId]: null },
    });
  },

  applyServerTakeoffRow: (serverRow) => {
    const state = get();
    const exists = state.takeoffs.some((r) => r.id === serverRow.id);
    const nextTakeoffs = exists
      ? state.takeoffs.map((r) => (r.id === serverRow.id ? serverRow : r))
      : [...state.takeoffs, serverRow];

    const computed = runCompute({
      project: state.project,
      wbsList: state.wbsList,
      takeoffs: nextTakeoffs,
      ahsps: state.ahsps,
      compositions: state.compositions,
      prices: state.prices,
      snapshots: state.snapshots,
    });

    const nextDirty = { ...state.dirtyRowIds };
    delete nextDirty[serverRow.id];

    set({
      takeoffs: nextTakeoffs,
      computed,
      dirtyRowIds: nextDirty,
      rowServerErrors: { ...state.rowServerErrors, [serverRow.id]: null },
    });
  },

  setRowServerError: (takeoffId, error) => {
    set((state) => ({
      rowServerErrors: { ...state.rowServerErrors, [takeoffId]: error },
    }));
  },

  recompute: () => {
    const state = get();
    const computed = runCompute(state);
    set({ computed });
  },
}));
