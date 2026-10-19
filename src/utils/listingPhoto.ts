const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", gif: "image/gif",
  bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
};

export function listingPhotoMetadata(uri: string, blob: { size: number; type: string }, pickerType?: string | null) {
  if (!Number.isFinite(blob.size) || blob.size <= 0) throw new Error("This photo is empty or unavailable. Choose it again.");
  if (blob.size >= 10 * 1024 * 1024) throw new Error("Each listing photo must be smaller than 10 MB. Choose a smaller photo.");
  const normalize = (value?: string | null) => {
    const type = value?.split(";")[0].trim().toLowerCase();
    return type === "image/jpg" ? "image/jpeg" : type;
  };
  const blobType = normalize(blob.type);
  // Native file responses can report application/octet-stream. Use the actual
  // local file extension before picker metadata, which may describe the original.
  const extension = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  const contentType = blobType && Object.values(IMAGE_TYPES).includes(blobType)
    ? blobType : IMAGE_TYPES[extension] ?? normalize(pickerType);
  if ((blobType && blobType !== "application/octet-stream" && !Object.values(IMAGE_TYPES).includes(blobType))
      || !contentType || !Object.values(IMAGE_TYPES).includes(contentType)) {
    throw new Error("This photo format isn't supported. Choose a JPEG, PNG or another standard image.");
  }
  return { contentType, extension: Object.keys(IMAGE_TYPES).find(key => IMAGE_TYPES[key] === contentType)! };
}

export function listingSaveError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "storage/unauthorized") return "Photo upload was denied. Your listing hasn't been saved. Try signing in again; if this continues, contact support.";
  if (code === "storage/unauthenticated") return "Sign in again to upload your listing photos.";
  if (code === "storage/retry-limit-exceeded") return "Photo upload timed out. Check your connection and try again.";
  if (code === "permission-denied") return "Your account couldn't save this listing. Sign in again and try again.";
  return (error as Error)?.message || "Couldn't save your listing. Please try again.";
}
