import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

export async function requestAccountDeletion(password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("Sign in before deleting your account.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
  const result = await httpsCallable<{ confirmation: string }, { accepted: boolean }>(functions, "requestAccountDeletion")({ confirmation: "DELETE" });
  if (!result.data.accepted) throw new Error("We couldn't confirm your request. Please try again.");
}

export async function resetAccountPassword(email: string) {
  if (!email.trim()) throw new Error("Enter your account email first.");
  await sendPasswordResetEmail(auth, email.trim());
}

export function accountActionError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(code ?? "")) return "That password wasn't accepted. Try again or reset your password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait before trying again.";
  if (code === "auth/user-disabled") return "This account is disabled or already being deleted. Contact spotbnb1@gmail.com for help.";
  if (code === "functions/failed-precondition" || code === "functions/aborted") return (error as Error).message;
  if (code === "functions/unavailable" || code === "functions/deadline-exceeded" || code === "auth/network-request-failed") return "We couldn't confirm the result. Check your connection and try again. If your account is already disabled, contact spotbnb1@gmail.com.";
  return "We couldn't complete this request. Please try again, or contact spotbnb1@gmail.com.";
}
