import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { ParkingSpot } from "../types/models";

const spotsCollection = collection(db, "spots");

export async function createSpot(
  ownerId: string,
  data: Omit<ParkingSpot, "id" | "ownerId" | "isActive" | "averageRating" | "reviewCount" | "createdAt" | "updatedAt">
) {
  const docRef = await addDoc(spotsCollection, {
    ...data,
    ownerId,
    isActive: true,
    averageRating: 0,
    reviewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSpot(spotId: string, data: Partial<ParkingSpot>) {
  await updateDoc(doc(db, "spots", spotId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSpot(spotId: string) {
  await deleteDoc(doc(db, "spots", spotId));
}

export async function getSpot(spotId: string): Promise<ParkingSpot | null> {
  const snapshot = await getDoc(doc(db, "spots", spotId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as ParkingSpot;
}

export async function getActiveSpots(): Promise<ParkingSpot[]> {
  const q = query(spotsCollection, where("isActive", "==", true), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ParkingSpot);
}

export async function getSpotsByOwner(ownerId: string): Promise<ParkingSpot[]> {
  const q = query(spotsCollection, where("ownerId", "==", ownerId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ParkingSpot);
}

export async function uploadSpotPhoto(ownerId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const filename = `spots/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
