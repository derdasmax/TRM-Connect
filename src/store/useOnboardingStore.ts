import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  completed: boolean;
  complete: () => void;
  /** Lets "Replay tour" in Settings show it again without waiting for a
   *  fresh install. */
  reset: () => void;
}

/** Whether the first-run tour has been shown - persisted so it only ever
 *  appears once per install, whether the user finished it or skipped it. */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
    }),
    { name: "trm-connect.onboarding" },
  ),
);
