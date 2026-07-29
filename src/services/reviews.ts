import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { Review } from "../types/models";

const reviewsCollection = collection(db, "reviews");

export async function submitReview(data: Omit<Review, "id" | "createdAt">) {
  await addDoc(reviewsCollection, {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getReviewsForSpot(spotId: string): Promise<Review[]> {
  const q = query(reviewsCollection, where("spotId", "==", spotId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
}
