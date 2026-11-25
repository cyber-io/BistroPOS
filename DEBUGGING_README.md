# BistroPOS Debugging Guide & Single-Functionality Tracker

This report tracks **what bugs were found**, **how each bug was reproduced and fixed (root cause vs symptom)**, and **which single functionality comes next** — so we debug systematically **one functionality at a time**.

> **How to use this file:**
> - **Completed (`✅ DONE`)** shows what is already fixed and verified in this codebase.
> - **Next (`🔍 NEXT`) / Pending (`⏳ PENDING`)** shows the queue of single functionalities to inspect one by one. Tell the assistant `"debug next"` (or name any `#` module below) whenever you want to tackle the next one.

---

## Single-Functionality Queue (Progress Tracker)

| # | Functionality / Module | Status | Key Areas Covered |
| :---: | :--- | :---: | :--- |
| **0** | **Baseline Stabilization Pass** *(initial scan before single-module mode)* | ✅ DONE | Dashboard `ReferenceError` crashes, QR mock HMAC & tip check, Feedback fake-success catch, Waiter timer reset, Dispute notification, `api-client-live.mjs` hang |
| **1** | **Bill Split & Gratuity Calculator** | ✅ DONE | `BillSplitAndTipModal.jsx`, `QrDineInPage.jsx` split props, `POST /api/payments/calculate-split`, `CalculateSplitRequestValidator` |
| **2** | **AI Chef Recommendations & Cart Pairing** | 🔍 NEXT | `AiRecommendationsRail.jsx`, `CartContext.jsx` *(already spotted: `'Full'` passed into `specialInstruction` argument instead of portion!)* |
| **3** | **Table Floor Plans & Seating Maps** | ⏳ PENDING | `TableFloorPlan.jsx`, `FamilyDiningPlan.css`, `TableFloorPlan.css`, Party Hall & status filter counts |
| **4** | **Digital Receipt & Customer Feedback** | ⏳ PENDING | `DigitalReceiptAndFeedbackModal.jsx`, `OrdersController.EmailReceipt`, `FeedbackController`, loyalty feedback phone propagation |
| **5** | **QR Dine-In Checkout & POS Multi-Order Billing** | ⏳ PENDING | `QrTablePaymentModal.jsx`, `QrDineInPage.jsx`, `PosWorkspace.jsx` `PaymentDialog` partial/multi-order atomicity |
| **6** | **POS Reservations, Cancellations & 10-Min Auto-Reserve** | ⏳ PENDING | `PosWorkspace.jsx` Reservations, `ReservationService.cs`, grace period / overlap edge cases |
| **7** | **Receptionist Desk & Waitlist Queue** | ⏳ PENDING | `ReceptionistDashboard.jsx`, `WaitlistService.cs`, error handling & table assignment |
| **8** | **Kitchen Display & Stock Shortage Workflows** | ⏳ PENDING | `KitchenDashboard.jsx`, `InventoryService.cs`, station filtering & shortage notifications |
| **9** | **Waiter Dashboard & Table Sanitization Flow** | ⏳ PENDING | `WaiterDashboard.jsx`, `TableAndHelpServices.cs`, help assignment & cleaning states |
| **10** | **Auth, Session Expiry & Real-Time SignalR/Polling Sync** | ⏳ PENDING | `AuthContext.jsx`, `NotificationContext.jsx`, `api.js` polling & rate-limit backoff |

---

## Detailed Debug Log

### Functionality #1: Bill Split & Gratuity Calculator — ✅ DONE

#### 1. Bugs Found & Root Causes
1. **Single Payment Marked Multiple Equal Diner Shares `PAID` (`PaymentService.CalculateSplitAsync`)**
   - **Symptom:** When an order of `₹984.90` had two `₹492.45` itemized shares and Diner 1 made **one** payment of `₹492.45`, the backend returned `paymentStatus: "PAID"` (with the exact same `PaymentId`) for **both** Diner 1 and Diner 2.
   - **Root Cause:** `existingPayments.FirstOrDefault(...)` matched by amount (`Math.Abs(p.Amount - dinerAmount) <= 0.05m`) without tracking which `PaymentId` records had already been consumed by an earlier diner share (in both `ITEMIZED` and `EQUAL` loops).
   - **Fix:** Tracked `consumedPaidIds` and `consumedPendingIds` (`HashSet<Guid>`) and enforced `runningPaid >= dinerAmount - 0.05m` in [`backend/Services/InfrastructureServices.cs`](backend/Services/InfrastructureServices.cs).

2. **Missing Input Validation & Negative Loyalty Discount Bill Inflation (`POST /api/payments/calculate-split`)**
   - **Symptom:** Passing `loyaltyDiscount: -500` inflated `TotalBill` from `₹984.90` to `₹1484.90` (`200 OK`); `splitCount: 0` or negative `tipAmount` / `tipPercent` also had no FluentValidation rules.
   - **Root Cause:** No `AbstractValidator<CalculateSplitRequest>` existed in [`backend/Validators/ApiValidators.cs`](backend/Validators/ApiValidators.cs), and `CalculateSplitAsync` did not clamp `LoyaltyDiscount` or guard invalid `ItemShares` quantities.
   - **Fix:** Added `CalculateSplitRequestValidator` (`SplitCount` `1..50`, non-negative `TipAmount`/`LoyaltyDiscount`, `TipPercent` `0..100`, valid `ItemShares`) in [`backend/Validators/ApiValidators.cs`](backend/Validators/ApiValidators.cs), plus defensive clamping and positive-quantity/item existence validation in [`backend/Services/InfrastructureServices.cs`](backend/Services/InfrastructureServices.cs).

3. **Penny Rounding Drift in Itemized Split (`CalculateSplitAsync` & `BillSplitAndTipModal.jsx`)**
   - **Symptom:** A 3-way itemized split on `₹985.90` returned shares summing to `₹985.89` (`0.01` lost).
   - **Root Cause:** Each group independently called `Math.Round(totalBill * proportion, 2)` instead of assigning the exact remainder (`totalBill - runningAllocated`) to the final diner (unlike the `EQUAL` branch).
   - **Fix:** Adjusted the last diner's share in both [`backend/Services/InfrastructureServices.cs`](backend/Services/InfrastructureServices.cs) and [`frontend/src/components/billing/BillSplitAndTipModal.jsx`](frontend/src/components/billing/BillSplitAndTipModal.jsx) so shares always sum cleanly to `TotalBill`/`grandTotal`, and clarified the last-diner rounding note in Equal mode when an odd remainder occurs.

4. **Itemized Assignments Silently Disappeared When Lowering Diner Count (`BillSplitAndTipModal.jsx`)**
   - **Symptom:** Assigning a dish to `Diner 3` (index `2`) and then switching `Diners to Split` to `2 Diners` caused that dish to vanish from all visible diner totals (`(itemAssignments[idx] ?? 0) === dinerIndex`).
   - **Root Cause:** Switching `splitCount` down did not clamp existing `itemAssignments` back into `[0, splitCount - 1]`.
   - **Fix:** Added a `useEffect` in [`frontend/src/components/billing/BillSplitAndTipModal.jsx`](frontend/src/components/billing/BillSplitAndTipModal.jsx) to reassign out-of-range indices to Diner 1 (`0`) and cap `splitCount <= 4` when switching to `ITEMIZED` mode.

5. **Negative Custom Tip Allowed in UI (`BillSplitAndTipModal.jsx`)**
   - **Root Cause:** Custom tip `<input type="number">` lacked `min="0"` and `computedTip` did not clamp negative numbers, allowing negative tips to lower `Final Total`.
   - **Fix:** Clamped custom tip to `>= 0` in state and calculation in [`frontend/src/components/billing/BillSplitAndTipModal.jsx`](frontend/src/components/billing/BillSplitAndTipModal.jsx).

6. **Loyalty UX & Disconnected Subtotal/Proceed Flow (`BillSplitAndTipModal.jsx` + `QrDineInPage.jsx`)**
   - **Problems Fixed:**
     - Added `"Change"` button to switch phone numbers, toggle-off on clicking a selected points tier, and a clear `"Minimum 100 points required to redeem"` note when balance `< 100`.
     - Fixed `QrDineInPage.jsx` passing `o.total - o.tax` as `subtotal` (which breaks proportional `taxShare`/`tipShare` whenever a server discount exists) — now uses `o.subtotal`, and `"Confirm & Proceed"` closes the calculator and opens the Pay Table Bill modal (`setIsPayModalOpen(true)`) instead of dropping the action.

#### 2. Verification Results (Post-Fix)
- Re-ran automated live PostgreSQL reproduction & verification (`debug_split.mjs`):
  - Negative `tipAmount` -> `400 Bad Request` (`PASS`)
  - Negative `loyaltyDiscount` -> `400 Bad Request` (`PASS`)
  - Zero `splitCount` -> `400 Bad Request` (`PASS`)
  - Single half-payment in `ITEMIZED` split -> marks **1** share `PAID`, **1** share `UNPAID` (`PASS`)
  - 3-way `ITEMIZED` split sum (`985.9`) equals `TotalBill` (`985.9`) with zero drift (`PASS`)
- `dotnet build backend/RestaurantSystem.Api.csproj` (`0` errors) and `npm --prefix frontend run build` (`1740` modules built cleanly).

---

### Functionality #0 (Baseline Stabilization Pass) — ✅ DONE

Previously diagnosed and fixed across the codebase before switching to single-functionality mode:
- **Dashboard `ReferenceError` Crashes:**
  - [`frontend/src/pages/receptionist/ReceptionistDashboard.jsx`](frontend/src/pages/receptionist/ReceptionistDashboard.jsx): Missing `useCallback` import and `useAuth()` (`currentUser`); removed swallowed `recordPayment` catch during table checkout.
  - [`frontend/src/pages/kitchen/KitchenDashboard.jsx`](frontend/src/pages/kitchen/KitchenDashboard.jsx): Restored missing `getItemStation`, `dateFilterMode`, `selectedDate`, `todayStr`, `yesterdayStr`, `getLocalDateString`, `getShiftedDate`, `formatDisplayDate`, wired `api.reportShortage`, and synced `"Completed"` tab count via `getTabCount`.
  - [`frontend/src/pages/pos/PosWorkspace.jsx`](frontend/src/pages/pos/PosWorkspace.jsx): Added `editingCategory`/`editingItem` states, imported `getCancelWhatsAppUrl`/`getCancelSmsUrl`, removed dead `setNew*Alert` calls.
- **QR Payment HMAC, Tip Cap & Loyalty Persist:**
  - [`backend/Services/InfrastructureServices.cs`](backend/Services/InfrastructureServices.cs), [`backend/DTOs/ApiDtos.cs`](backend/DTOs/ApiDtos.cs), [`backend/Services/LoyaltyAndFeedbackService.cs`](backend/Services/LoyaltyAndFeedbackService.cs), [`frontend/src/components/billing/QrTablePaymentModal.jsx`](frontend/src/components/billing/QrTablePaymentModal.jsx), [`frontend/src/pages/dineIn/QrDineInPage.jsx`](frontend/src/pages/dineIn/QrDineInPage.jsx): Added dev-only `RazorpayMock` `MockSignature` (`null` in production), excluded `TipAmount` from bill-cap balance checks so default 10% tips succeed, applied loyalty redemption to `Order.Discount` / `Order.Total`, removed fake client `signature: 'verified'` & swallowed staff `recordPayment` fallback, and refreshed server state rather than forging `PAID` on Cash/split payments.
- **Feedback, Waiter Timer, Dispute & Test Harness:**
  - [`frontend/src/components/billing/DigitalReceiptAndFeedbackModal.jsx`](frontend/src/components/billing/DigitalReceiptAndFeedbackModal.jsx): Stopped showing `"Feedback saved. Thank you!"` inside error `catch`.
  - [`frontend/src/pages/waiter/WaiterDashboard.jsx`](frontend/src/pages/waiter/WaiterDashboard.jsx): Stabilized `CleaningCountdown` with `useRef` + `canAutoComplete` (`isMine`) and fixed non-cleaning bystander resolve label.
  - [`backend/Services/OrderService.cs`](backend/Services/OrderService.cs): Stopped broadcasting `"Table Order Status: DELIVERED"` when customer disputes receipt (`confirmed == false`).
  - [`tests/integration/api-client-live.mjs`](tests/integration/api-client-live.mjs) & [`frontend/src/services/api.js`](frontend/src/services/api.js): Inlined `tablePresentation.js` for `data:` ESM loading and unref'd Node `BroadcastChannel` (`realtimeChannel.unref?.()`) so integration runs exit cleanly.
