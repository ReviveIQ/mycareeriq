import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";

// Storage proxy — redirects /manus-storage/* paths to S3 signed URLs
// Kept for backwards compatibility with existing PDF keys in the database
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) { res.status(400).send("Missing storage key"); return; }
    try {
      const url = await storageGetSignedUrl(key);
      if (!url) { res.status(404).send("File not found"); return; }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
