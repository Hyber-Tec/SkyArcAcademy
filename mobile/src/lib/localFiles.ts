import { Directory, Paths } from "expo-file-system";

/**
 * Forgets every file this phone kept in its cache: Drive files, a post's attachments and scan photos (at sign-out:
 * whoever signs in next starts with none of the last person's files; src/features/drive/download.ts and
 * src/features/scan/photo.ts keep them). Scans still waiting to upload are kept: they live elsewhere, and their upload
 * goes on.
 */
export function forgetLocalFiles(): void {
  for (const name of ["drive", "announcements", "scans"]) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch {
      // The system may have cleared its cache already.
    }
  }
}
