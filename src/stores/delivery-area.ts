'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The area a guest (or a logged-in customer with no saved address yet) last
 * confirmed as serviceable — via a typed pincode or "use current location"
 * on the serviceability-check screen.
 *
 * Nothing here is a real delivery address (no line1, no house number — B11's
 * pincode-radius check never collects one) and it is never sent to the
 * server; it exists purely so the home header can say "delivering to
 * wherever you just checked" instead of a bare "Select address" the instant
 * after you told the app exactly where you are. A real `defaultAddress`
 * from `useSession` always takes priority over this once one exists.
 */

interface DeliveryAreaState {
  areaName: string | null;
  pincode: string | null;
  set: (area: { areaName: string | null; pincode: string | null }) => void;
  clear: () => void;
}

export const useDeliveryArea = create<DeliveryAreaState>()(
  persist(
    (set) => ({
      areaName: null,
      pincode: null,
      set: (area) => set(area),
      clear: () => set({ areaName: null, pincode: null }),
    }),
    { name: 'planeat.delivery-area.v1' },
  ),
);
