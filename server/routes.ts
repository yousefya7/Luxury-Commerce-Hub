import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, type OrderItem, type ShippingAddress } from "@shared/schema";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { sendOrderConfirmationSms, sendWelcomeSms, blastSms, twilioConfigured } from "./sms";
import { sendOrderConfirmationEmail, sendShippingEmail, sendCancellationEmail, blastEmail, sendContactEmail, sendContactConfirmationEmail, resendConfigured } from "./email";
import { createPaymentIntent, createRefund, calculateTaxAmount, createStripeCoupon, deleteStripeCoupon, verifyStripeAccount, syncProductToStripe, archiveStripeProduct } from "./stripe";
import { insertPromoCodeSchema } from "@shared/schema";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_KEY,
  api_key: process.env.CLOUDINARY_API_SECRET,
  api_secret: process.env.CLOUDINARY_CLOUD_NAME,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|avif)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

async function uploadToCloudinary(buffer: Buffer, folder = "resilient"): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(error || new Error("Upload failed"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2026";

async function requireUnlock(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).unlocked) return next();
  const result = await pool.query("SELECT value FROM site_settings WHERE key = 'maintenance_mode'");
  if (result.rows[0]?.value === "false") return next();
  res.status(401).json({ message: "Site access required" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).admin) return next();
  res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = pgSession(session);

  verifyStripeAccount().catch(() => {});

  app.use(
    session({
      store: new PgStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "resilient-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const products = await storage.getAllProducts();
      const base = "https://resilientofficial.com";
      const now = new Date().toISOString().split("T")[0];

      const staticPages = [
        { url: `${base}/`, priority: "1.0", changefreq: "weekly" },
        { url: `${base}/shop`, priority: "0.9", changefreq: "daily" },
        { url: `${base}/gallery`, priority: "0.7", changefreq: "monthly" },
      ];

      const productPages = products.map((p) => ({
        url: `${base}/product/${p.id}`,
        priority: "0.8",
        changefreq: "weekly",
        lastmod: now,
      }));

      const allPages = [...staticPages, ...productPages];

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${(page as any).lastmod || now}</lastmod>
    <changefreq>${(page as any).changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

      res.set("Content-Type", "application/xml");
      res.send(xml);
    } catch (err) {
      res.status(500).send("Error generating sitemap");
    }
  });

  app.post("/api/contact", async (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }
    try {
      // Save to database
      await storage.createContactSubmission({ name, email, subject, message });
      // Send notification to store
      await sendContactEmail(
        "info@resilientofficial.com",
        `Contact Form: ${subject} — from ${name} <${email}>`,
        `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`
      );
      // Send confirmation to customer
      if (resendConfigured()) {
        await sendContactConfirmationEmail(email, name);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[contact form]", err);
      res.status(500).json({ message: "Failed to send message. Please try again." });
    }
  });

  app.post("/api/auth/unlock", async (req, res) => {
    const { password } = req.body;
    const result = await pool.query("SELECT value FROM site_settings WHERE key = 'site_password'");
    const sitePassword = result.rows[0]?.value || "resilient2026";
    console.log(`[unlock] Comparing input="${password}" with db_password="${sitePassword}" (match=${password === sitePassword})`);
    if (password === sitePassword) {
      (req.session as any).unlocked = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ message: "Invalid password" });
    }
  });

  app.get("/api/auth/check", async (req, res) => {
    const mmResult = await pool.query("SELECT value FROM site_settings WHERE key = 'maintenance_mode'");
    const isProtected = mmResult.rows[0]?.value !== "false";
    if (!isProtected) {
      res.json({ unlocked: true, maintenanceMode: false });
    } else {
      res.json({ unlocked: !!(req.session as any).unlocked, maintenanceMode: true });
    }
  });

  app.post("/api/sms-subscribe", async (req, res) => {
    const { phone, email } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });
    try {
      const sub = await storage.createSmsSubscriber({ phone, email });
      sendWelcomeSms(phone).catch((e) => console.error("[SMS] Welcome SMS failed:", e));
      res.json(sub);
    } catch {
      res.status(409).json({ message: "Already subscribed" });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      (req.session as any).admin = true;
      (req.session as any).unlocked = true;
      req.session.save((err) => {
        if (err) {
          console.error("[Session] Save error on admin login:", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.json({ success: true });
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.get("/api/admin/check", (req, res) => {
    res.json({ authenticated: !!(req.session as any).admin });
  });

  app.get("/api/products", async (_req, res) => {
    const prods = await storage.getProducts();
    res.json(prods);
  });

  app.get("/api/products/:id", async (req, res) => {
    const product = await storage.getProduct(req.params.id as string);
    if (!product || !product.active) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { total, promoCode, shippingAddress } = req.body;
      if (!total || isNaN(Number(total))) {
        return res.status(400).json({ message: "Invalid total amount" });
      }
      const subtotal = Number(total);
      if (subtotal < 0.5) {
        return res.status(400).json({ message: "Amount too small (minimum $0.50)" });
      }

      // Validate and apply promo code
      let discountAmount = 0;
      let appliedPromoCode: string | null = null;
      if (promoCode) {
        const promo = await storage.getPromoCodeByCode(promoCode.trim());
        if (promo && promo.active) {
          const now = new Date();
          const expired = promo.expirationDate && new Date(promo.expirationDate) < now;
          const limitHit = promo.usageLimit !== null && promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit;
          const minNotMet = promo.minOrderAmount && subtotal < Number(promo.minOrderAmount);
          if (!expired && !limitHit && !minNotMet) {
            if (promo.type === "percentage") {
              discountAmount = Math.min(subtotal * (Number(promo.value) / 100), subtotal);
            } else if (promo.type === "fixed") {
              discountAmount = Math.min(Number(promo.value), subtotal);
            } else if (promo.type === "free_shipping") {
              discountAmount = 0; // shipping is already free; tracked for display
            }
            appliedPromoCode = promo.code.toUpperCase();
          }
        }
      }

      const discountedSubtotal = subtotal - discountAmount;

      let taxAmount = 0;
      if (shippingAddress?.street && shippingAddress?.city && shippingAddress?.state && shippingAddress?.zip) {
        const taxCents = await calculateTaxAmount(
          Math.round(discountedSubtotal * 100),
          {
            line1: shippingAddress.street,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.zip,
          }
        );
        taxAmount = taxCents / 100;
      }

      const finalTotal = discountedSubtotal + taxAmount;
      const chargeAmount = Math.max(finalTotal, 0.5);

      const result = await createPaymentIntent(chargeAmount, {
        platform: "resilient-store",
        ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
      });

      res.json({
        clientSecret: result.clientSecret,
        discountAmount: discountAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        finalTotal: chargeAmount.toFixed(2),
        appliedPromoCode,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Payment intent creation failed" });
    }
  });

  // Public: validate promo code
  app.get("/api/promo-codes/validate", async (req, res) => {
    try {
      const { code, subtotal } = req.query as { code?: string; subtotal?: string };
      if (!code) return res.status(400).json({ message: "Code required" });
      const sub = Number(subtotal) || 0;

      const promo = await storage.getPromoCodeByCode(code.trim());
      if (!promo || !promo.active) {
        return res.status(404).json({ message: "Invalid or expired promo code" });
      }
      const now = new Date();
      if (promo.expirationDate && new Date(promo.expirationDate) < now) {
        return res.status(400).json({ message: "Invalid or expired promo code" });
      }
      if (promo.usageLimit !== null && promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit) {
        return res.status(400).json({ message: "Invalid or expired promo code" });
      }
      if (promo.minOrderAmount && sub < Number(promo.minOrderAmount)) {
        return res.status(400).json({ message: `Minimum order of $${Number(promo.minOrderAmount).toFixed(2)} required` });
      }

      let discountAmount = 0;
      if (promo.type === "percentage") {
        discountAmount = sub * (Number(promo.value) / 100);
      } else if (promo.type === "fixed") {
        discountAmount = Math.min(Number(promo.value), sub);
      }

      res.json({
        code: promo.code.toUpperCase(),
        type: promo.type,
        value: Number(promo.value),
        discountAmount: discountAmount.toFixed(2),
        label:
          promo.type === "percentage"
            ? `${Number(promo.value)}% off`
            : promo.type === "fixed"
            ? `$${Number(promo.value).toFixed(2)} off`
            : "Free shipping",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Validation failed" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    const { customerEmail, customerName, customerPhone, items, total, shippingAddress, stripePaymentIntentId, promoCode, discountAmount, taxAmount } = req.body;

    if (!customerEmail || !customerName || !items || !total || !Array.isArray(items)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    for (const item of items as OrderItem[]) {
      const product = await storage.getProduct(item.productId);
      if (!product) {
        return res.status(400).json({ message: `Product ${item.productId} not found` });
      }
      const sizeStock = product.stock.find((s) => s.size === item.size);
      if (!sizeStock || sizeStock.quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name} size ${item.size}. Available: ${sizeStock?.quantity || 0}`,
        });
      }
    }

    let customer = await storage.getCustomerByEmail(customerEmail);
    if (!customer) {
      customer = await storage.createCustomer({
        email: customerEmail,
        name: customerName,
        phone: customerPhone || null,
        totalSpent: "0",
        smsSubscribed: false,
      });
    }

    const order = await storage.createOrder({
      customerId: customer.id,
      items: items as OrderItem[],
      total,
      status: stripePaymentIntentId ? "paid" : "pending",
      shippingAddress: shippingAddress as ShippingAddress,
      stripePaymentIntentId: stripePaymentIntentId || null,
      promoCode: promoCode || null,
      discountAmount: discountAmount ? Number(discountAmount).toFixed(2) : "0",
      taxAmount: taxAmount ? Number(taxAmount).toFixed(2) : "0",
    });

    const newTotal = Number(customer.totalSpent || 0) + Number(total);
    await storage.updateCustomer(customer.id, {
      totalSpent: newTotal.toFixed(2),
      lastPurchase: new Date(),
    });

    if (promoCode) {
      storage.incrementPromoUsage(promoCode).catch(() => {});
    }

    for (const item of items as OrderItem[]) {
      const product = await storage.getProduct(item.productId);
      if (product) {
        const sizeStock = product.stock.find((s) => s.size === item.size);
        if (sizeStock) {
          const newQty = sizeStock.quantity - item.quantity;
          await storage.updateStock(item.productId, item.size, newQty);

          if (newQty === 0) {
            const updatedProduct = await storage.getProduct(item.productId);
            if (updatedProduct && updatedProduct.stock.every((s) => s.quantity === 0)) {
              await storage.updateProduct(item.productId, { active: false });
            }
          }
        }
      }
    }

    res.json(order);

    // Fire confirmations async — don't block response
    (async () => {
      try {
        const resolvedItems = await Promise.all(
          (items as OrderItem[]).map(async (item) => {
            const product = await storage.getProduct(item.productId);
            return { name: product?.name || "Item", size: item.size, quantity: item.quantity, price: Number(item.price) };
          })
        );

        // Order confirmation SMS disabled — re-enable when ready
        // if (customerPhone) {
        //   await sendOrderConfirmationSms(customerPhone, customerName, order.id, total);
        // }
        await sendOrderConfirmationEmail(customerEmail, customerName, order.id, resolvedItems, total, shippingAddress as ShippingAddress);
      } catch (e) {
        console.error("[Notifications] Order confirmation error:", e);
      }
    })();
  });

  // Public order lookup — customers look up by order ID + email (no lock required)
  app.get("/api/orders/lookup", async (req, res) => {
    try {
      const { orderId, email } = req.query as { orderId?: string; email?: string };
      if (!orderId || !email) return res.status(400).json({ message: "orderId and email are required" });
      const allOrders = await storage.getOrders();
      const order = allOrders.find((o) => o.id === orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      const allCustomers = await storage.getCustomersWithOrders();
      const customer = allCustomers.find((c) => c.id === order.customerId);
      if (!customer || customer.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json({
        id: order.id,
        status: order.status,
        carrier: order.carrier || null,
        trackingNumber: order.trackingNumber || null,
        items: order.items,
        total: order.total,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
        statusChangedAt: order.statusChangedAt,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lookup failed" });
    }
  });

  app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, carrier, trackingNumber } = req.body;
      const VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "paid"];
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be one of: " + VALID_STATUSES.join(", ") });
      }

      if (status === "shipped") {
        if (!carrier) return res.status(400).json({ message: "Carrier is required when marking as shipped." });
        if (!trackingNumber) return res.status(400).json({ message: "Tracking number is required when marking as shipped." });
      }

      // Cancellation: attempt Stripe refund before changing status
      if (status === "cancelled") {
        const allOrders = await storage.getOrders();
        const order = allOrders.find((o) => o.id === id);
        if (!order) return res.status(404).json({ message: "Order not found." });

        let refundId: string | undefined;

        if (order.stripePaymentIntentId) {
          try {
            const result = await createRefund(order.stripePaymentIntentId);
            refundId = result.id;
            console.log(`[Stripe] ${result.method === "refund" ? "Refund" : "PI cancellation"} successful for order ${id}: ${result.id}`);
          } catch (stripeErr: any) {
            const msg = stripeErr?.message || "Stripe refund failed.";
            console.error("[Stripe] Refund failed for order", id, stripeErr);
            return res.status(402).json({ message: `Refund failed: ${msg}. Order not cancelled.` });
          }
        }

        const cancelledAt = new Date();
        await storage.updateOrderStatus(id, "cancelled", undefined, undefined, refundId, cancelledAt);

        // Send cancellation email async
        const allCustomers = await storage.getCustomersWithOrders();
        const customer = allCustomers.find((c) => c.id === order.customerId);
        if (customer?.email) {
          const items = (order.items as any[]).map((i) => ({
            name: i.productName || i.name || "Item",
            size: i.size || "—",
            quantity: Number(i.quantity) || 1,
            price: Number(i.price) || 0,
          }));
          sendCancellationEmail(customer.email, customer.name, order.id, items, order.total, refundId).catch((e) =>
            console.error("[Email] Cancellation email error:", e)
          );
        }

        return res.json({ success: true, status: "cancelled", refundId: refundId || null });
      }

      await storage.updateOrderStatus(id, status, carrier || undefined, trackingNumber || undefined);

      if (status === "shipped") {
        const allOrders = await storage.getOrders();
        const order = allOrders.find((o) => o.id === id);
        if (order) {
          const allCustomers = await storage.getCustomersWithOrders();
          const customer = allCustomers.find((c) => c.id === order.customerId);
          if (customer?.email) {
            const items = (order.items as any[]).map((i) => ({
              name: i.productName || i.name || "Item",
              size: i.size || "—",
              quantity: Number(i.quantity) || 1,
              price: Number(i.price) || 0,
            }));
            sendShippingEmail(customer.email, customer.name, order.id, items, carrier, trackingNumber).catch((e) =>
              console.error("[Email] Shipping email error:", e)
            );
          }
        }
      }

      res.json({ success: true, status, carrier, trackingNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update order status" });
    }
  });

  app.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteOrder(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete order" });
    }
  });

  app.post("/api/admin/customers", requireAdmin, async (req, res) => {
    try {
      const { name, email, phone, street, city, state, zip } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
      }
      const existing = await storage.getCustomerByEmail(email.trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ message: "A contact with that email already exists" });
      }
      const shippingAddress = (street || city || state || zip)
        ? { street: street || "", city: city || "", state: state || "", zip: zip || "" }
        : null;
      const customer = await storage.createCustomer({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        shippingAddress,
        totalSpent: "0",
        lastPurchase: null,
        smsSubscribed: false,
      });
      res.json(customer);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create contact" });
    }
  });

  app.delete("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const deleted = await storage.deleteCustomer(id);
    if (!deleted) return res.status(404).json({ message: "Contact not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    const [prods, custs, ords, stats, cats] = await Promise.all([
      storage.getAllProducts(),
      storage.getCustomersWithOrders(),
      storage.getOrders(),
      storage.getStats(),
      storage.getCategories(),
    ]);

    res.json({
      products: prods,
      customers: custs,
      orders: ords,
      stats,
      categories: cats,
    });
  });

  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    const result = await pool.query("SELECT key, value FROM site_settings");
    const settings: Record<string, string> = {};
    result.rows.forEach((r: any) => { settings[r.key] = r.value; });
    res.json({
      maintenanceMode: settings.maintenance_mode !== "false",
      sitePassword: settings.site_password || "resilient2026",
    });
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    const { maintenanceMode, sitePassword } = req.body;
    if (typeof maintenanceMode === "boolean") {
      await pool.query(
        "INSERT INTO site_settings (key, value) VALUES ('maintenance_mode', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [String(maintenanceMode)]
      );
    }
    if (typeof sitePassword === "string") {
      const trimmed = sitePassword.trim();
      if (trimmed.length === 0) {
        return res.status(400).json({ message: "Password cannot be blank" });
      }
      if (trimmed.length > 20) {
        return res.status(400).json({ message: "Password must be 20 characters or fewer" });
      }
      await pool.query("UPDATE site_settings SET value = $1 WHERE key = 'site_password'", [trimmed]);
      console.log(`[settings] Password updated to "${trimmed}" via direct SQL`);
      const verify = await pool.query("SELECT value FROM site_settings WHERE key = 'site_password'");
      console.log(`[settings] Verified DB now contains: "${verify.rows[0]?.value}"`);
      await pool.query(
        `DELETE FROM session WHERE sess::text LIKE '%"unlocked":true%' AND sess::text NOT LIKE '%"admin":true%'`
      );
    }
    const result = await pool.query("SELECT key, value FROM site_settings");
    const settings: Record<string, string> = {};
    result.rows.forEach((r: any) => { settings[r.key] = r.value; });
    res.json({
      maintenanceMode: settings.maintenance_mode !== "false",
      sitePassword: settings.site_password || "resilient2026",
    });
  });

  app.get("/api/categories", async (_req, res) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  app.get("/api/admin/categories", requireAdmin, async (_req, res) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  app.post("/api/admin/categories", requireAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Category name is required" });
      }
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!slug) {
        return res.status(400).json({ message: "Invalid category name" });
      }
      const existing = await storage.getCategoryBySlug(slug);
      if (existing) {
        return res.status(409).json({ message: "A category with that name already exists" });
      }
      const cat = await storage.createCategory({ name: name.trim(), slug });
      res.json(cat);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create category" });
    }
  });

  app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Category name is required" });
      }
      const cat = await storage.getCategory(req.params.id);
      if (!cat) return res.status(404).json({ message: "Category not found" });

      const newSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const existingWithSlug = await storage.getCategoryBySlug(newSlug);
      if (existingWithSlug && existingWithSlug.id !== req.params.id) {
        return res.status(409).json({ message: "A category with that name already exists" });
      }

      const oldSlug = cat.slug;
      const updated = await storage.updateCategory(req.params.id, { name: name.trim(), slug: newSlug });
      if (oldSlug !== newSlug) {
        await storage.reassignProducts(oldSlug, newSlug);
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update category" });
    }
  });

  app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    try {
      const cat = await storage.getCategory(req.params.id);
      if (!cat) return res.status(404).json({ message: "Category not found" });

      const allCats = await storage.getCategories();
      if (allCats.length <= 1) {
        return res.status(400).json({ message: "Cannot delete the last category" });
      }

      const { reassignTo } = req.body || {};
      if (!reassignTo || typeof reassignTo !== "string") {
        return res.status(400).json({ message: "Must specify a category to reassign products to" });
      }

      if (reassignTo === req.params.id) {
        return res.status(400).json({ message: "Cannot reassign products to the category being deleted" });
      }

      const targetCat = await storage.getCategory(reassignTo);
      if (!targetCat) return res.status(400).json({ message: "Target category not found" });

      const moved = await storage.reassignProducts(cat.slug, targetCat.slug);
      await storage.deleteCategory(req.params.id);
      res.json({ deleted: cat, movedProducts: moved, movedTo: targetCat });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete category" });
    }
  });

  app.use("/uploads", (await import("express")).default.static("uploads"));

  app.post("/api/admin/upload", requireAdmin, upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    try {
      const url = await uploadToCloudinary(req.file.buffer);
      res.json({ url });
    } catch (err: any) {
      console.error("[Upload] Cloudinary upload failed:", err?.message);
      res.status(500).json({ message: "Image upload failed" });
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const parsed = insertProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid product data", errors: parsed.error.flatten() });
      }

      const product = await storage.createProduct(parsed.data);

      const stockData = req.body.stockQuantities || {};
      for (const [size, quantity] of Object.entries(stockData)) {
        if (typeof quantity === "number" && quantity >= 0) {
          await storage.createStock({
            productId: product.id,
            size,
            quantity,
          });
        }
      }

      // Sync to Stripe synchronously so ID is persisted before responding
      try {
        const { stripeProductId, stripePriceId, syncedAt } = await syncProductToStripe({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          images: product.images,
          stripeProductId: null,
          stripePriceId: null,
        }, async (spId) => {
          await storage.updateProduct(product.id, { stripeProductId: spId });
        });
        await storage.updateProduct(product.id, {
          stripeProductId,
          stripePriceId,
          stripeSyncError: null,
          stripeLastSyncedAt: syncedAt,
        });
      } catch (e: any) {
        console.error(`[Stripe] Sync failed for new product "${product.name}":`, e?.message);
        await storage.updateProduct(product.id, {
          stripeSyncError: e?.message || "Sync failed",
          stripeLastSyncedAt: new Date(),
        }).catch(() => {});
      }

      const fullProduct = await storage.getProduct(product.id);
      res.json(fullProduct);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create product" });
    }
  });

  app.patch("/api/admin/products/batch", requireAdmin, async (req, res) => {
    try {
      const { productIds, updates } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ message: "No products selected" });
      }
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ message: "No updates provided" });
      }

      const results = [];
      for (const id of productIds) {
        const existing = await storage.getProduct(id);
        if (!existing) continue;

        const updateData: Record<string, any> = {};

        if (updates.category !== undefined && updates.category !== "") {
          updateData.category = updates.category;
        }
        if (updates.active !== undefined) {
          updateData.active = updates.active;
        }
        if (updates.featured !== undefined) {
          updateData.featured = updates.featured;
        }
        if (updates.priceAction && updates.priceValue !== undefined) {
          const currentPrice = parseFloat(existing.price);
          const value = parseFloat(updates.priceValue);
          if (!isNaN(value)) {
            let newPrice = currentPrice;
            if (updates.priceAction === "increase_percent") {
              newPrice = currentPrice * (1 + value / 100);
            } else if (updates.priceAction === "decrease_percent") {
              newPrice = currentPrice * (1 - value / 100);
            } else if (updates.priceAction === "increase_fixed") {
              newPrice = currentPrice + value;
            } else if (updates.priceAction === "decrease_fixed") {
              newPrice = currentPrice - value;
            } else if (updates.priceAction === "set") {
              newPrice = value;
            }
            updateData.price = Math.max(0, newPrice).toFixed(2);
          }
        }

        if (Object.keys(updateData).length > 0) {
          await storage.updateProduct(id, updateData);
        }

        if (Array.isArray(updates.stockEdits) && updates.stockEdits.length > 0) {
          const existingStock = existing.stock;
          const existingSizeMap = new Map(existingStock.map((s) => [s.size, s.quantity]));

          for (const edit of updates.stockEdits) {
            const { size, action, value } = edit;
            const qty = parseInt(value);
            if (isNaN(qty) || qty < 0) continue;

            const targetSizes = size === "ALL"
              ? existingStock.map((s) => s.size)
              : [size];

            for (const targetSize of targetSizes) {
              const current = existingSizeMap.get(targetSize) ?? 0;
              let newQty = current;

              if (action === "set") {
                newQty = qty;
              } else if (action === "increase") {
                newQty = current + qty;
              } else if (action === "decrease") {
                newQty = Math.max(0, current - qty);
              }

              if (existingSizeMap.has(targetSize)) {
                await storage.updateStock(id, targetSize, newQty);
              } else {
                await storage.createStock({ productId: id, size: targetSize, quantity: newQty });
              }
              existingSizeMap.set(targetSize, newQty);
            }
          }
        }

        results.push(id);
      }

      res.json({ updated: results.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Batch update failed" });
    }
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getProduct(id);
      if (!existing) {
        return res.status(404).json({ message: "Product not found" });
      }

      const { stockQuantities, ...productData } = req.body;

      if (Object.keys(productData).length > 0) {
        await storage.updateProduct(id, productData);
      }

      if (stockQuantities && typeof stockQuantities === "object") {
        const existingSizes = new Set(existing.stock.map((s) => s.size));
        for (const [size, rawQty] of Object.entries(stockQuantities)) {
          const quantity = typeof rawQty === "string" ? parseInt(rawQty, 10) : Number(rawQty);
          if (isNaN(quantity) || quantity < 0) continue;
          if (existingSizes.has(size)) {
            await storage.updateStock(id, size, quantity);
          } else {
            await storage.createStock({ productId: id, size, quantity });
          }
        }
        for (const existingSize of existingSizes) {
          if (!(existingSize in stockQuantities)) {
            await storage.deleteStock(id, existingSize);
          }
        }
      }

      const updated = await storage.getProduct(id);

      // Sync to Stripe synchronously so ID is persisted before responding
      if (updated) {
        try {
          const { stripeProductId, stripePriceId, syncedAt } = await syncProductToStripe({
            id: updated.id,
            name: updated.name,
            description: updated.description,
            price: updated.price,
            images: updated.images,
            stripeProductId: updated.stripeProductId,
            stripePriceId: updated.stripePriceId,
          }, async (spId) => {
            await storage.updateProduct(updated.id, { stripeProductId: spId });
          });
          await storage.updateProduct(updated.id, {
            stripeProductId,
            stripePriceId,
            stripeSyncError: null,
            stripeLastSyncedAt: syncedAt,
          });
        } catch (e: any) {
          console.error(`[Stripe] Sync failed for product "${updated?.name}":`, e?.message);
          await storage.updateProduct(id, {
            stripeSyncError: e?.message || "Sync failed",
            stripeLastSyncedAt: new Date(),
          }).catch(() => {});
        }
      }

      const final = await storage.getProduct(id);
      res.json(final);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update product" });
    }
  });

  app.post("/api/admin/products/sync-all", requireAdmin, async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const results: { id: string; name: string; stripeProductId?: string; stripePriceId?: string; error?: string }[] = [];

      for (const product of allProducts) {
        try {
          const { stripeProductId, stripePriceId, syncedAt } = await syncProductToStripe({
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            images: product.images,
            stripeProductId: product.stripeProductId,
            stripePriceId: product.stripePriceId,
          }, async (spId) => {
            await storage.updateProduct(product.id, { stripeProductId: spId });
          });
          await storage.updateProduct(product.id, {
            stripeProductId,
            stripePriceId,
            stripeSyncError: null,
            stripeLastSyncedAt: syncedAt,
          });
          results.push({ id: product.id, name: product.name, stripeProductId, stripePriceId });
        } catch (e: any) {
          console.error(`[Stripe] Sync failed for "${product.name}":`, e?.message);
          await storage.updateProduct(product.id, {
            stripeSyncError: e?.message || "Sync failed",
            stripeLastSyncedAt: new Date(),
          }).catch(() => {});
          results.push({ id: product.id, name: product.name, error: e?.message || "Sync failed" });
        }
      }

      const succeeded = results.filter((r) => !r.error).length;
      const failed = results.filter((r) => r.error).length;
      res.json({ synced: succeeded, failed, results });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Sync all failed" });
    }
  });

  app.post("/api/admin/products/deduplicate-stripe", requireAdmin, async (req, res) => {
    try {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });
      const allProducts = await storage.getAllProducts();

      let archived = 0;
      let repaired = 0;
      const report: string[] = [];

      for (const product of allProducts) {
        // Search Stripe for all products matching this product's ID in metadata
        const search = await stripeClient.products.search({
          query: `metadata["resilientProductId"]:"${product.id}"`,
          limit: 10,
        });

        const matches = search.data;
        if (matches.length === 0) continue;

        // Sort newest first (Stripe returns newest first by default, but sort by created just in case)
        const sorted = matches.sort((a, b) => b.created - a.created);
        const keeper = sorted[0];
        const dupes = sorted.slice(1);

        // Archive duplicates
        for (const dupe of dupes) {
          if (dupe.active) {
            await stripeClient.products.update(dupe.id, { active: false });
            archived++;
            report.push(`Archived dupe ${dupe.id} for "${product.name}"`);
          }
        }

        // Ensure DB has the correct Stripe product ID
        if (product.stripeProductId !== keeper.id) {
          // Find the active price for the keeper
          const prices = await stripeClient.prices.list({ product: keeper.id, active: true, limit: 1 });
          const priceId = prices.data[0]?.id || product.stripePriceId;
          await storage.updateProduct(product.id, {
            stripeProductId: keeper.id,
            stripePriceId: priceId ?? undefined,
            stripeSyncError: null,
          });
          repaired++;
          report.push(`Repaired DB for "${product.name}": set stripeProductId=${keeper.id}`);
        }
      }

      report.forEach((line) => console.log("[Stripe Dedup]", line));
      res.json({ archived, repaired, report });
    } catch (err: any) {
      console.error("[Stripe Dedup] Failed:", err?.message);
      res.status(500).json({ message: err.message || "Deduplication failed" });
    }
  });

  // Archive any Stripe product NOT currently referenced by the DB (orphan cleanup)
  app.post("/api/admin/products/purge-stripe-orphans", requireAdmin, async (req, res) => {
    try {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

      // Collect all currently-valid Stripe product IDs from DB
      const allProducts = await storage.getAllProducts();
      const validIds = new Set(allProducts.map((p) => p.stripeProductId).filter(Boolean) as string[]);

      // Page through all active Stripe products and archive any not in validIds
      let archived = 0;
      const report: string[] = [];
      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const page = await stripeClient.products.list({
          active: true,
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const sp of page.data) {
          if (!validIds.has(sp.id)) {
            // Deactivate all prices first (required before deletion)
            const prices = await stripeClient.prices.list({ product: sp.id, limit: 100 });
            for (const price of prices.data) {
              if (price.active) {
                await stripeClient.prices.update(price.id, { active: false }).catch(() => {});
              }
            }
            // Delete the product
            await stripeClient.products.del(sp.id);
            archived++;
            report.push(`Deleted: ${sp.id} ("${sp.name}")`);
            console.log(`[Stripe Cleanup] Deleted: ${sp.id} ("${sp.name}")`);
          }
        }

        hasMore = page.has_more;
        if (page.data.length > 0) {
          startingAfter = page.data[page.data.length - 1].id;
        }
      }

      res.json({ archived, validKept: validIds.size, report });
    } catch (err: any) {
      console.error("[Stripe Cleanup] Failed:", err?.message);
      res.status(500).json({ message: err.message || "Cleanup failed" });
    }
  });

  app.post("/api/admin/products/:id/sync", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const product = await storage.getProduct(id);
      if (!product) return res.status(404).json({ message: "Product not found" });

      const { stripeProductId, stripePriceId, syncedAt } = await syncProductToStripe({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        images: product.images,
        stripeProductId: product.stripeProductId,
        stripePriceId: product.stripePriceId,
      }, async (spId) => {
        await storage.updateProduct(id, { stripeProductId: spId });
      });
      await storage.updateProduct(id, {
        stripeProductId,
        stripePriceId,
        stripeSyncError: null,
        stripeLastSyncedAt: syncedAt,
      });
      const updated = await storage.getProduct(id);
      res.json({ success: true, stripeProductId, stripePriceId, product: updated });
    } catch (err: any) {
      console.error(`[Stripe] Manual sync failed:`, err?.message);
      // Persist the error so admin can see it in the UI
      const product = await storage.getProduct(req.params.id as string).catch(() => null);
      if (product) {
        await storage.updateProduct(req.params.id as string, {
          stripeSyncError: err?.message || "Sync failed",
          stripeLastSyncedAt: new Date(),
        }).catch(() => {});
      }
      res.status(500).json({ message: err.message || "Sync failed" });
    }
  });

  app.patch("/api/admin/products/:id/display-order", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { displayOrder } = req.body;
      const order = parseInt(String(displayOrder), 10);
      if (isNaN(order) || order < 0) {
        return res.status(400).json({ message: "displayOrder must be a non-negative integer" });
      }
      await storage.updateDisplayOrder(id, order);
      res.json({ success: true, displayOrder: order });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update display order" });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getProduct(id);
      if (!existing) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Archive in Stripe before deleting (awaited for correctness)
      if (existing.stripeProductId) {
        await archiveStripeProduct(existing.stripeProductId);
      }

      const imagePaths = existing.images || [];
      const deleted = await storage.deleteProduct(id);

      for (const img of imagePaths) {
        if (img.startsWith("https://res.cloudinary.com/")) {
          const parts = img.split("/upload/");
          if (parts[1]) {
            const publicId = parts[1].replace(/^v\d+\//, "").replace(/\.[^.]+$/, "");
            cloudinary.uploader.destroy(publicId).catch((e: any) =>
              console.warn(`Failed to delete Cloudinary image ${publicId}:`, e?.message)
            );
          }
        } else if (img.startsWith("/uploads/")) {
          const fs = await import("fs");
          const uploadsDir = path.default.resolve(process.cwd(), "uploads");
          const relativeName = img.slice("/uploads/".length);
          const resolved = path.default.resolve(uploadsDir, relativeName);
          if (resolved.startsWith(uploadsDir + path.default.sep)) {
            try { fs.default.unlinkSync(resolved); } catch (e: any) {
              console.warn(`Failed to delete image file ${resolved}: ${e.message}`);
            }
          }
        }
      }

      res.json(deleted);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete product" });
    }
  });

  app.patch("/api/admin/stock/:productId", requireAdmin, async (req, res) => {
    try {
      const productId = req.params.productId as string;
      const existing = await storage.getProduct(productId);
      if (!existing) {
        return res.status(404).json({ message: "Product not found" });
      }

      const stockUpdates = req.body;
      if (!stockUpdates || typeof stockUpdates !== "object") {
        return res.status(400).json({ message: "Invalid stock data" });
      }

      const existingSizes = new Set(existing.stock.map((s) => s.size));

      for (const [size, quantity] of Object.entries(stockUpdates)) {
        if (typeof quantity !== "number" || quantity < 0) {
          return res.status(400).json({ message: `Invalid quantity for size ${size}` });
        }
        if (existingSizes.has(size)) {
          await storage.updateStock(productId, size, quantity);
        } else {
          await storage.createStock({ productId, size, quantity });
        }
      }

      for (const existingSize of existingSizes) {
        if (!(existingSize in stockUpdates)) {
          await storage.deleteStock(productId, existingSize);
        }
      }

      const updated = await storage.getProduct(productId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update stock" });
    }
  });

  // ── Marketing / Blast routes ────────────────────────────────────────────────
  app.get("/api/admin/marketing/stats", requireAdmin, async (_req, res) => {
    try {
      const customers = await storage.getCustomers();
      const smsSubscribers = customers.filter((c) => c.smsSubscribed && c.phone);
      const emailSubscribers = customers.filter((c) => c.email);
      res.json({
        smsCount: smsSubscribers.length,
        emailCount: emailSubscribers.length,
        twilioConfigured: twilioConfigured(),
        resendConfigured: resendConfigured(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get stats" });
    }
  });

  app.post("/api/admin/sms-blast", requireAdmin, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }
      if (message.length > 320) {
        return res.status(400).json({ message: "Message too long (max 320 chars)" });
      }

      const customers = await storage.getCustomers();
      const subscribers = customers
        .filter((c) => c.smsSubscribed && c.phone)
        .map((c) => ({ phone: c.phone! }));

      const result = await blastSms(subscribers, message.trim());
      res.json({ ...result, total: subscribers.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "SMS blast failed" });
    }
  });

  app.delete("/api/admin/sms-subscribers", requireAdmin, async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone required" });
      await storage.deleteSmsSubscriber(phone);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/test-sms", requireAdmin, async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone required" });
      await sendWelcomeSms(phone);
      res.json({ success: true, message: `Test SMS sent to ${phone}` });
    } catch (err: any) {
      console.error("[SMS] Test SMS failed:", err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/admin/contact-email", requireAdmin, async (req, res) => {
    try {
      const { to, subject, message } = req.body;
      if (!to || !subject || !message) {
        return res.status(400).json({ message: "To, subject, and message are required" });
      }
      await sendContactEmail(to.trim(), subject.trim(), message.trim());
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to send email" });
    }
  });

  // ── Admin: Promo Codes ───────────────────────────────────────────────────────

  app.get("/api/admin/promo-codes", requireAdmin, async (_req, res) => {
    try {
      const codes = await storage.getPromoCodes();
      res.json(codes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/promo-codes", requireAdmin, async (req, res) => {
    try {
      const parsed = insertPromoCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const data = parsed.data;

      // Sync to Stripe as a Coupon
      let stripeCouponId: string | null = null;
      try {
        stripeCouponId = await createStripeCoupon(
          data.code,
          data.type as "percentage" | "fixed" | "free_shipping",
          Number(data.value)
        );
      } catch (e) {
        console.warn("[Stripe] Coupon sync failed:", e);
      }

      const created = await storage.createPromoCode({
        ...data,
        code: data.code.toUpperCase(),
        stripeCouponId,
      });
      res.json(created);
    } catch (err: any) {
      const msg = err.message || "Failed to create promo code";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return res.status(409).json({ message: "A promo code with that name already exists" });
      }
      res.status(500).json({ message: msg });
    }
  });

  app.patch("/api/admin/promo-codes/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params as { id: string };

      // Fetch current record so we can decide what to sync
      const existing = (await storage.getPromoCodes()).find((p) => p.id === id);
      if (!existing) return res.status(404).json({ message: "Not found" });

      let dbUpdates: Record<string, any> = { ...req.body };

      // Sync active-state changes to Stripe
      if (typeof req.body.active === "boolean") {
        if (!req.body.active && existing.stripeCouponId) {
          // Deactivating — delete the coupon from Stripe
          try {
            await deleteStripeCoupon(existing.stripeCouponId);
            dbUpdates.stripeCouponId = null;
            console.log(`[Stripe] Deleted coupon for deactivated promo ${existing.code}`);
          } catch (e) {
            console.warn("[Stripe] Could not delete coupon on deactivate:", e);
          }
        } else if (req.body.active && !existing.stripeCouponId) {
          // Reactivating — recreate coupon in Stripe
          try {
            const newCouponId = await createStripeCoupon(
              existing.code,
              existing.type as "percentage" | "fixed" | "free_shipping",
              Number(existing.value)
            );
            dbUpdates.stripeCouponId = newCouponId;
            console.log(`[Stripe] Recreated coupon for reactivated promo ${existing.code}: ${newCouponId}`);
          } catch (e) {
            console.warn("[Stripe] Could not recreate coupon on reactivate:", e);
          }
        }
      }

      const updated = await storage.updatePromoCode(id, dbUpdates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/promo-codes/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = (await storage.getPromoCodes()).find((p) => p.id === id);
      if (existing?.stripeCouponId) {
        await deleteStripeCoupon(existing.stripeCouponId).catch(() => {});
      }
      const deleted = await storage.deletePromoCode(id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: Contact Submissions ────────────────────────────────────────────────

  app.get("/api/admin/contact-submissions", requireAdmin, async (_req, res) => {
    try {
      const submissions = await storage.getContactSubmissions();
      res.json(submissions);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch contact submissions" });
    }
  });

  app.delete("/api/admin/contact-submissions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteContactSubmission(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete submission" });
    }
  });

  app.post("/api/admin/email-blast", requireAdmin, async (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) {
        return res.status(400).json({ message: "Subject and body are required" });
      }

      const customers = await storage.getCustomers();
      const recipients = customers
        .filter((c) => c.email)
        .map((c) => ({ email: c.email }));

      const safeBody = body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
      const result = await blastEmail(recipients, subject.trim(), safeBody);
      res.json({ ...result, total: recipients.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Email blast failed" });
    }
  });

  return httpServer;
}
