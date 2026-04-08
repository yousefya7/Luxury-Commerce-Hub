import { storage } from "./storage";
import { db } from "./db";
import { products, stock, categories } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { pool } from "./db";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_KEY,
  api_key: process.env.CLOUDINARY_API_SECRET,
  api_secret: process.env.CLOUDINARY_CLOUD_NAME,
});

const GALLERY_SEED = [
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619295/resilient/gallery/chat-portrait-tee.jpg", alt: "Being Resilient Defines Character", displayOrder: 0 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619296/resilient/gallery/jacket-graffiti-duo.jpg", alt: "Jacket Drop — Graffiti Wall", displayOrder: 1 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619297/resilient/gallery/pt2-elliston-duo.png", alt: "Elliston Place — Hoodie Duo", displayOrder: 2 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619298/resilient/gallery/jacket-garage-action.jpg", alt: "Parking Garage Session", displayOrder: 3 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619299/resilient/gallery/chat-knight-tee.jpg", alt: "Knight Tee Editorial", displayOrder: 4 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619300/resilient/gallery/jacket-rooftop.jpg", alt: "Rooftop Session", displayOrder: 5 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619301/resilient/gallery/chat-stairs-duo.jpg", alt: "Fire Escape — Golden Hour", displayOrder: 6 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619301/resilient/gallery/jacket-mural-front.jpg", alt: "Bubble Mural", displayOrder: 7 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619302/resilient/gallery/chat-donuts.jpg", alt: "Donut Shop Vibes", displayOrder: 8 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619303/resilient/gallery/jacket-sidewalk-duo.jpg", alt: "Sidewalk Duo", displayOrder: 9 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619304/resilient/gallery/chat-wall-lean.jpg", alt: "Character Tee Portrait", displayOrder: 10 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619305/resilient/gallery/jacket-elevator-solo.jpg", alt: "Elevator — Graffiti", displayOrder: 11 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619305/resilient/gallery/chat-stairs-crew.jpg", alt: "Crew on Steps", displayOrder: 12 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619306/resilient/gallery/jacket-mural-hat.jpg", alt: "Mural Series II", displayOrder: 13 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619307/resilient/gallery/chat-flannels.jpg", alt: "Resilient Flannels", displayOrder: 14 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619308/resilient/gallery/pt2-donut-trio.jpg", alt: "Donut Spot — Trio", displayOrder: 15 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619309/resilient/gallery/jacket-storefront.jpg", alt: "Night Storefront", displayOrder: 16 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619309/resilient/gallery/chat-profile.jpg", alt: "Profile Shot", displayOrder: 17 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619310/resilient/gallery/jacket-rooftop-drone.jpg", alt: "Rooftop — Drone", displayOrder: 18 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619311/resilient/gallery/chat-duo-street.jpg", alt: "Street Duo", displayOrder: 19 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619312/resilient/gallery/jacket-bikeroute.jpg", alt: "Bike Route — Night", displayOrder: 20 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619313/resilient/gallery/jacket-mural-solo.jpg", alt: "Mural Series", displayOrder: 21 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619314/resilient/gallery/chat-car-lean.jpg", alt: "Car Lean", displayOrder: 22 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619315/resilient/gallery/jacket-night-sign.jpg", alt: "Night Sign", displayOrder: 23 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619316/resilient/gallery/jacket-phone.jpg", alt: "Candid — Phone Check", displayOrder: 24 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619317/resilient/gallery/jacket-elliston.jpg", alt: "Elliston Place", displayOrder: 25 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619318/resilient/gallery/jacket-flatlay-drone.jpg", alt: "Jacket — Overhead", displayOrder: 26 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619319/resilient/gallery/chat-balcony.jpg", alt: "Balcony Shot", displayOrder: 27 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619319/resilient/gallery/chat-alley.jpg", alt: "Alley Session", displayOrder: 28 },
  { src: "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619320/resilient/gallery/jacket-flatlay.jpg", alt: "Resilient Jacket — Flat Lay", displayOrder: 29 },
];

const HOMEPAGE_GALLERY_DEFAULT = JSON.stringify([
  "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619296/resilient/gallery/jacket-graffiti-duo.jpg",
  "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619295/resilient/gallery/chat-portrait-tee.jpg",
  "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619298/resilient/gallery/jacket-garage-action.jpg",
  "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619301/resilient/gallery/chat-stairs-duo.jpg",
  "https://res.cloudinary.com/dgawn40ku/image/upload/v1775619303/resilient/gallery/jacket-sidewalk-duo.jpg",
  "", "", "",
]);

async function uploadLocalToCloudinary(filePath: string, publicId: string): Promise<string> {
  return new Promise((resolve_fn, reject) => {
    const buffer = readFileSync(filePath);
    const stream = cloudinary.uploader.upload_stream(
      { folder: "resilient/gallery", public_id: publicId, overwrite: true, resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err || new Error("No result"));
        resolve_fn(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Migrate any gallery_images records with local /images/gallery/ paths to Cloudinary.
 * Also seeds the gallery if empty. Runs at startup — safe to call on every boot.
 */
export async function migrateGalleryImages(): Promise<void> {
  const client = await pool.connect();
  try {
    // Seed gallery if empty
    const countRes = await client.query("SELECT COUNT(*) FROM gallery_images");
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      console.log("[gallery] Empty gallery — seeding with Cloudinary URLs...");
      for (const img of GALLERY_SEED) {
        await client.query(
          "INSERT INTO gallery_images (id, src, alt, display_order) VALUES (gen_random_uuid(), $1, $2, $3)",
          [img.src, img.alt, img.displayOrder]
        );
      }
      console.log("[gallery] Gallery seeded.");
    }

    // Migrate any local-path records to Cloudinary
    const localRes = await client.query(
      "SELECT id, src FROM gallery_images WHERE src NOT LIKE 'http%'"
    );
    if (localRes.rows.length > 0) {
      console.log(`[gallery] Migrating ${localRes.rows.length} local-path images to Cloudinary...`);
      for (const row of localRes.rows) {
        const localName = row.src.replace(/^\/images\/gallery\//, "");
        const filePath = resolve("client/public/images/gallery", localName);
        const publicId = localName.replace(/\.[^.]+$/, "");
        if (existsSync(filePath)) {
          try {
            const url = await uploadLocalToCloudinary(filePath, publicId);
            await client.query("UPDATE gallery_images SET src = $1 WHERE id = $2", [url, row.id]);
            console.log(`[gallery] Migrated ${localName} → ${url}`);
          } catch (e: any) {
            console.error(`[gallery] Migration failed for ${localName}:`, e.message);
          }
        } else {
          console.warn(`[gallery] Local file missing for ${row.src} — skipping`);
        }
      }
    }

    // Ensure homepage_gallery_images setting exists and uses Cloudinary URLs
    const settingRes = await client.query(
      "SELECT value FROM site_settings WHERE key = 'homepage_gallery_images'"
    );
    if (settingRes.rows.length === 0) {
      await client.query(
        "INSERT INTO site_settings (key, value) VALUES ('homepage_gallery_images', $1) ON CONFLICT (key) DO NOTHING",
        [HOMEPAGE_GALLERY_DEFAULT]
      );
      console.log("[gallery] Inserted homepage_gallery_images setting.");
    } else {
      // Check if it contains local paths and migrate them
      let imgs: string[] = [];
      try { imgs = JSON.parse(settingRes.rows[0].value); } catch {}
      const hasLocal = imgs.some((u) => u && !u.startsWith("http"));
      if (hasLocal) {
        const updated = await Promise.all(imgs.map(async (u) => {
          if (!u || u.startsWith("http")) return u;
          const localName = u.replace(/^\/images\/gallery\//, "");
          const { rows } = await client.query(
            "SELECT src FROM gallery_images WHERE src LIKE $1",
            [`%${localName.replace(/\.[^.]+$/, "")}%`]
          );
          return rows[0]?.src || u;
        }));
        await client.query(
          "UPDATE site_settings SET value = $1 WHERE key = 'homepage_gallery_images'",
          [JSON.stringify(updated)]
        );
        console.log("[gallery] Updated homepage_gallery_images to Cloudinary URLs.");
      }
    }
  } catch (e: any) {
    console.error("[gallery] Migration error:", e.message);
  } finally {
    client.release();
  }
}

const REAL_PRODUCTS = [
  {
    name: "Rhinestone Jacket",
    description:
      "The sleeves are meticulously embellished with a high-density rhinestone stipple, creating a reflective contrast against the rugged, weathered fabric. Arched across the chest is the signature raw-edge \"RESILIENT\" patchwork, finished with intentional fraying for an archive aesthetic. Complete with a double-layered hood, matte silver hardware, and the mission statement patch at the cuff.",
    price: "777",
    category: "jackets",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716088/resilient/ouwujk2mpplhhcwucger.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716089/resilient/o1wpo5qmuu4www4sbqbn.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716090/resilient/va3f2ijaguxcpep4acjc.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716091/resilient/dkipgfnyoc3yaqylsrx6.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716092/resilient/zasxkwzq6bvoeslsektk.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716093/resilient/vbkvliotwhwmzbyqojx9.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 1,
    stock: { S: 30, M: 25, L: 25, XL: 25, "2XL": 25, "3XL": 25, "4XL": 25, "5XL": 25 },
  },
  {
    name: "Black Resilient Defines Character",
    description:
      "More than just a graphic, it's a mission statement. This heavyweight, boxy-fit tee features our signature Resilient branding layered over a bold \"Character\" motif. Designed for those who let their endurance speak for them, the high-density screen print and drop-shoulder silhouette provide a rugged, oversized look that stands up to the streets.",
    price: "77",
    category: "tees",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716094/resilient/outiuli9csdtgr6l5rif.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716095/resilient/udonue1ky0asxjjcgevk.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716096/resilient/zspaz5w5brk5zqketzbu.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716097/resilient/dpyhlu0tiqd5s5npnn3c.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 2,
    stock: { S: 30, M: 25, L: 25, XL: 25, "2XL": 25, "3XL": 25, "4XL": 25, "5XL": 25 },
  },
  {
    name: "White Resilient Defines Character",
    description:
      "More than just a graphic, it's a mission statement. This heavyweight, boxy-fit tee features our signature Resilient branding layered over a bold \"Character\" motif. Designed for those who let their endurance speak for them, the high-density screen print and drop-shoulder silhouette provide a rugged, oversized look that stands up to the streets.",
    price: "77",
    category: "tees",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716097/resilient/ysilaccdbyfbwoi06l25.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716098/resilient/bmpl4fu8jr23dmvctxws.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716099/resilient/ebxyah00b3ouaxdxwufa.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716100/resilient/eamxix2y0efqalnyts2s.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 3,
    stock: { S: 30, M: 25, L: 25, XL: 25, "2XL": 25, "3XL": 25, "4XL": 25, "5XL": 25 },
  },
  {
    name: "Resilient Warrior T",
    description:
      "Every scar tells a story; every battle builds the soul. The Resilient Warrior T features a custom-illustrated knight graphic over a premium charcoal mineral wash, symbolizing the armor we wear through the daily hustle. Designed with a boxy, lived-in feel, this tee is a tribute to those who stay standing regardless of the odds.",
    price: "77",
    category: "tees",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716081/resilient/csznh3qqhdqvcz1vpc9q.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716082/resilient/sfb9umwr7ovbdjt7wshm.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716083/resilient/apnyqmcuqqawvji3zgqv.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716084/resilient/ssqws5fwkerg9zqwnd0y.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 4,
    stock: { S: 1, M: 1, L: 1, XL: 1, "2XL": 1, "3XL": 1, "4XL": 1, "5XL": 1 },
  },
  {
    name: "Blue Resilient Flannel",
    description:
      "Make an entrance and an exit. The Obsidian Blue Flannel features a reconstructed multi-plaid design in deep cobalt, black, and white. The standout feature is the massive, hand-set rhinestone \"Resilient\" script across the back, designed to catch every light in the city. With additional studded detailing on the sleeves, this is high-octane streetwear at its finest.",
    price: "77",
    category: "tees",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716085/resilient/sm0t6pxv0cnv7ghxdiwb.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716086/resilient/kvcibv1g6tacdzvsks8p.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716087/resilient/ownwqu01woplapdio1xv.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716087/resilient/dygutbbbrlveywfeiawd.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 5,
    stock: { S: 0, M: 0, L: 0, XL: 0, "2XL": 0, "3XL": 0, "4XL": 0, "5XL": 0 },
  },
  {
    name: "Crimson Resilient Flannel",
    description:
      "Redefining a classic. The Resilient Crimson Flannel takes the rugged aesthetic of a traditional plaid and elevates it with hand-placed rhinestone detailing along the forearms and cuffs. Featuring a contrasting black collar and button placket for a sharp, industrial silhouette, this piece is designed to catch the light while maintaining its street-ready edge. Premium weight, maximum impact.",
    price: "77",
    category: "tees",
    images: [
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716078/resilient/d5n0vn9bilgjs6ijytov.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716079/resilient/exj7i3h4ye2ajfofqiwa.jpg",
      "https://res.cloudinary.com/dgawn40ku/image/upload/v1773716080/resilient/iklgazgvdsfsoqrqr07c.jpg",
    ],
    featured: true,
    active: true,
    displayOrder: 6,
    stock: { S: 1, M: 1, L: 1, XL: 1, "2XL": 1, "3XL": 1, "4XL": 1, "5XL": 1 },
  },
];

const PLACEHOLDER_NAMES = [
  "Phantom Hoodie",
  "Void Tee",
  "Apex Cargo",
  "Shadow Bomber",
  "Essential Tee II",
];

export async function seedDatabase() {
  // Check permanent seeded flag — if set, never reseed regardless of product state.
  // This flag is written once to site_settings after the first successful seed
  // and is never cleared, so deleting products will never trigger a reseed.
  const flagRow = await pool.query(
    "SELECT value FROM site_settings WHERE key = 'db_seeded'"
  );
  if (flagRow.rows.length > 0 && flagRow.rows[0].value === "true") {
    console.log("[seed] Database already seeded — skipping.");
    return;
  }

  const existing = await db.select().from(products);

  // Remove leftover placeholder products from initial development if present
  const placeholderIds = existing
    .filter((p) => PLACEHOLDER_NAMES.includes(p.name))
    .map((p) => p.id);

  if (placeholderIds.length > 0) {
    console.log("[seed] Removing placeholder products...");
    await db.delete(stock).where(inArray(stock.productId, placeholderIds));
    await db.delete(products).where(inArray(products.id, placeholderIds));
  }

  // Only insert real products if the table is empty (fresh install)
  const remaining = await db.select().from(products);
  if (remaining.length === 0) {
    console.log("[seed] Empty database — seeding Resilient catalog...");

    const existingCats = await db.select().from(categories);
    const catMap: Record<string, string> = {};
    for (const c of existingCats) {
      catMap[c.slug] = c.id;
    }

    const needed = [
      { name: "Jackets", slug: "jackets" },
      { name: "Tees", slug: "tees" },
    ];
    for (const cat of needed) {
      if (!catMap[cat.slug]) {
        const created = await storage.createCategory(cat);
        catMap[cat.slug] = created.id;
      }
    }

    for (const p of REAL_PRODUCTS) {
      const { stock: stockData, ...productFields } = p;
      const product = await storage.createProduct(productFields);
      for (const [size, quantity] of Object.entries(stockData)) {
        await storage.createStock({ productId: product.id, size, quantity });
      }
    }

    const existingCustomers = await storage.getCustomers();
    if (existingCustomers.length === 0) {
      const customerData = [
        {
          email: "marcus.chen@gmail.com",
          name: "Marcus Chen",
          phone: "+1-555-0101",
          totalSpent: "720",
          lastPurchase: new Date("2026-02-15"),
          smsSubscribed: true,
        },
        {
          email: "aria.johnson@icloud.com",
          name: "Aria Johnson",
          phone: "+1-555-0102",
          totalSpent: "195",
          lastPurchase: new Date("2025-12-01"),
          smsSubscribed: true,
        },
        {
          email: "jaylen.williams@outlook.com",
          name: "Jaylen Williams",
          phone: "+1-555-0103",
          totalSpent: "0",
          smsSubscribed: true,
        },
        {
          email: "sofia.martinez@gmail.com",
          name: "Sofia Martinez",
          totalSpent: "550",
          lastPurchase: new Date("2026-03-01"),
          smsSubscribed: false,
        },
      ];
      for (const c of customerData) {
        await storage.createCustomer(c);
      }
    }

    console.log("[seed] Resilient catalog seeded successfully.");
  } else {
    console.log("[seed] Products already present — skipping insert.");
  }

  // Write the permanent seeded flag so this never runs again
  await pool.query(
    "INSERT INTO site_settings (key, value) VALUES ('db_seeded', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'"
  );
  console.log("[seed] db_seeded flag written.");
}
