/**
 * One-time migration: Upload all local gallery images to Cloudinary,
 * update gallery_images table with Cloudinary URLs, and update
 * site_settings homepage_gallery_images to use Cloudinary URLs.
 */

import { v2 as cloudinary } from "cloudinary";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import pg from "pg";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_KEY,
  api_key: process.env.CLOUDINARY_API_SECRET,
  api_secret: process.env.CLOUDINARY_CLOUD_NAME,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function uploadToCloudinary(filePath: string, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buffer = readFileSync(filePath);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "resilient/gallery",
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("No result"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string; src: string; alt: string; display_order: number }>(
      "SELECT id, src, alt, display_order FROM gallery_images ORDER BY display_order"
    );

    console.log(`Found ${rows.length} gallery images to process.`);

    for (const row of rows) {
      if (row.src.startsWith("https://res.cloudinary.com/")) {
        console.log(`[SKIP] ${row.alt} — already Cloudinary`);
        continue;
      }

      const localPath = row.src.replace(/^\/images\/gallery\//, "");
      const filePath = resolve("client/public/images/gallery", localPath);

      if (!existsSync(filePath)) {
        console.warn(`[MISSING] File not found: ${filePath}`);
        continue;
      }

      const publicId = localPath.replace(/\.[^.]+$/, ""); // strip extension
      try {
        const url = await uploadToCloudinary(filePath, publicId);
        await client.query("UPDATE gallery_images SET src = $1 WHERE id = $2", [url, row.id]);
        console.log(`[OK] ${row.alt} → ${url}`);
      } catch (err: any) {
        console.error(`[ERROR] ${row.alt}: ${err.message}`);
      }
    }

    // Now update homepage_gallery_images setting
    const settingsRes = await client.query(
      "SELECT value FROM site_settings WHERE key = 'homepage_gallery_images'"
    );
    if (settingsRes.rows.length > 0) {
      let existing: string[] = [];
      try { existing = JSON.parse(settingsRes.rows[0].value); } catch {}

      const updated: string[] = [];
      for (const url of existing) {
        if (!url || url.startsWith("https://res.cloudinary.com/")) {
          updated.push(url);
          continue;
        }
        // Look up the Cloudinary URL we just migrated
        const localName = url.replace(/^\/images\/gallery\//, "");
        const lookup = await client.query(
          "SELECT src FROM gallery_images WHERE src LIKE $1",
          [`%${localName.replace(/\.[^.]+$/, "")}%`]
        );
        if (lookup.rows.length > 0) {
          updated.push(lookup.rows[0].src);
          console.log(`[SETTINGS] ${url} → ${lookup.rows[0].src}`);
        } else {
          updated.push(url);
        }
      }

      await client.query(
        "UPDATE site_settings SET value = $1 WHERE key = 'homepage_gallery_images'",
        [JSON.stringify(updated)]
      );
      console.log("[SETTINGS] homepage_gallery_images updated.");
    }

    console.log("\n✅ Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
