import type { EarningsItem } from "../services/earnings";

export function earningsState({ booking, transfer }: EarningsItem, now: number) {
  if (transfer) {
    const labels = {
      processing: "Withdrawal processing — refresh shortly",
      transferred: "Transferred to Stripe — bank arrival follows your payout schedule",
      held: "Withdrawal needs review — contact SpotBnB",
      reversed: "Transfer reversed — payment needs review",
      reversal_pending: "Payment adjustment in progress — earnings on hold",
    };
    return { label: labels[transfer.status] || "Withdrawal status unavailable", canWithdraw: false };
  }
  if (booking.status === "cancelled") return { label: "Cancelled", canWithdraw: false };
  if (booking.status === "pending_payment") return { label: "Awaiting payment", canWithdraw: false };
  if (booking.paymentFlow !== "separate_v1") return { label: "Uses automatic Stripe transfers — check your Stripe account", canWithdraw: false };
  if (booking.cancellationRequestedAt || booking.refundedCents || booking.paymentDisputed) return { label: "Payment adjustment — earnings on hold", canWithdraw: false };
  if (!["confirmed", "completed"].includes(booking.status) || !Number.isFinite(booking.endTime)) return { label: "Earnings unavailable", canWithdraw: false };
  if (booking.endTime > now) return { label: "Available after this booking ends", canWithdraw: false };
  return { label: "Ready to withdraw, subject to Stripe payment checks", canWithdraw: true };
}
