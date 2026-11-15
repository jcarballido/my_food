import { create } from "zustand";
import type { Schedule } from "../types/api.js";

export type ScheduleModalMode = "existing" | "new";

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface UiState {
  /** Whether the recipe drawer is expanded. */
  drawerOpen: boolean;
  /** Whether the scheduling modal is visible. */
  scheduleModalOpen: boolean;
  /** Which workflow the scheduling modal is running. */
  scheduleModalMode: ScheduleModalMode;
  /** Date pre-selected in the scheduling modal. */
  scheduleModalDate: string | null;
  /** Recipe pre-selected in the scheduling modal (existing-recipe workflow). */
  scheduleModalRecipeId: string | null;
  /** Schedule being edited; when set the modal edits instead of creating. */
  scheduleModalSchedule: Schedule | null;
  confirmDialog: ConfirmDialogState | null;
  recipeDirty: boolean;
  setRecipeDirty: (dirty: boolean) => void;
  navigate: (action: () => void) => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  openScheduleModal: (options: {
    mode?: ScheduleModalMode;
    date?: string | null;
    recipeId?: string | null;
    schedule?: Schedule | null;
  }) => void;
  closeScheduleModal: () => void;
  openConfirmDialog: (dialog: ConfirmDialogState) => void;
  closeConfirmDialog: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  drawerOpen: true,
  scheduleModalOpen: false,
  scheduleModalMode: "existing",
  scheduleModalDate: null,
  scheduleModalRecipeId: null,
  scheduleModalSchedule: null,
  confirmDialog: null,
  recipeDirty: false,
  setRecipeDirty: (recipeDirty) => set({ recipeDirty }),
  navigate: (action) => {
    if (!get().recipeDirty) {
      action();
      return;
    }
    set({
      confirmDialog: {
        title: "Discard unsaved changes?",
        message: "Your recipe edits have not been saved. Leaving now will discard them.",
        confirmLabel: "Discard changes",
        onConfirm: () => {
          set({ confirmDialog: null, recipeDirty: false });
          action();
        },
      },
    });
  },

  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),

  openScheduleModal: ({
    mode = "existing",
    date = null,
    recipeId = null,
    schedule = null,
  } = {}) =>
    set({
      scheduleModalOpen: true,
      // Editing an existing schedule uses the same modal but no workflow tabs.
      scheduleModalMode: schedule ? "existing" : mode,
      scheduleModalDate: date,
      scheduleModalRecipeId: schedule?.recipe_id ?? recipeId,
      scheduleModalSchedule: schedule,
    }),

  closeScheduleModal: () =>
    set({
      scheduleModalOpen: false,
      scheduleModalMode: "existing",
      scheduleModalDate: null,
      scheduleModalRecipeId: null,
      scheduleModalSchedule: null,
    }),

  openConfirmDialog: (dialog) => set({ confirmDialog: dialog }),
  closeConfirmDialog: () => set({ confirmDialog: null }),
}));
