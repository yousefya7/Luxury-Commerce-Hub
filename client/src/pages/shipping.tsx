import { useSEO } from "@/hooks/use-seo";
import { Truck, Clock, Package, MapPin, Mail } from "lucide-react";

export default function ShippingPage() {
  useSEO({
    title: "Shipping Info | Resilient Official",
    description:
      "Resilient Official shipping information — processing times, carriers, estimated delivery windows, and order tracking. Free shipping on all domestic orders.",
  });

  return (
    <div className="min-h-screen bg-background" data-testid="page-shipping">
      <div className="max-w-3xl mx-auto px-6 pt-32 pb-24">
        <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">
          Policies
        </p>
        <h1 className="font-display text-4xl tracking-luxury uppercase mb-4">
          Shipping
        </h1>
        <p className="text-muted-foreground text-sm font-mono mb-16 max-w-lg">
          We ship directly from our fulfillment center to your door. Here's everything you need to know.
        </p>

        <div className="space-y-10">
          <section className="border-2 border-border/50 p-8">
            <div className="flex items-start gap-4 mb-4">
              <Package className="w-5 h-5 text-accent-blue mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-display text-sm tracking-luxury uppercase mb-3">Preorders</h2>
                <p className="text-muted-foreground text-sm font-mono leading-relaxed">
                  For preorder items, please allow up to <span className="text-white">30 days</span> for your order to be shipped. You will receive a tracking number via email once your order has been dispatched.
                </p>
              </div>
            </div>
          </section>

          <section className="border-2 border-border/50 p-8">
            <div className="flex items-start gap-4 mb-4">
              <Clock className="w-5 h-5 text-accent-blue mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-display text-sm tracking-luxury uppercase mb-3">Regular Orders</h2>
                <p className="text-muted-foreground text-sm font-mono leading-relaxed">
                  Regular orders may take some time to process before being shipped. Once your order has shipped you can expect delivery within <span className="text-white">3–5 business days</span>. You will receive a tracking number via email once your order is on its way.
                </p>
              </div>
            </div>
          </section>

          <section className="border-2 border-border/50 p-8">
            <div className="flex items-start gap-4 mb-4">
              <Truck className="w-5 h-5 text-accent-blue mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-display text-sm tracking-luxury uppercase mb-3">Carriers & Delivery</h2>
                <p className="text-muted-foreground text-sm font-mono leading-relaxed mb-6">
                  We ship via USPS, UPS, and FedEx depending on your location and order size.
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Standard Shipping", time: "5–8 business days" },
                    { label: "Expedited Shipping", time: "2–4 business days" },
                    { label: "Express Shipping", time: "1–2 business days" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0">
                      <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-mono text-white">{row.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="border-2 border-border/50 p-8">
            <div className="flex items-start gap-4 mb-4">
              <MapPin className="w-5 h-5 text-accent-blue mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-display text-sm tracking-luxury uppercase mb-3">Order Tracking</h2>
                <p className="text-muted-foreground text-sm font-mono leading-relaxed">
                  Once your order ships, you will receive a tracking number via email. Use this number on the carrier's website to monitor your delivery status in real time.
                </p>
              </div>
            </div>
          </section>

          <section className="border-2 border-border/50 p-8">
            <div className="flex items-start gap-4">
              <Mail className="w-5 h-5 text-accent-blue mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-display text-sm tracking-luxury uppercase mb-3">Peak Season Notice</h2>
                <p className="text-muted-foreground text-sm font-mono leading-relaxed">
                  During high-volume periods (holidays, major drops), shipping times may be longer than estimated. We appreciate your patience and will always communicate any delays as soon as possible.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
