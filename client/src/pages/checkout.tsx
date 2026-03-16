import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowRight, CheckCircle, Lock, ArrowLeft, Loader2, Tag, X, Check } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
  : null;

const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#0080ff",
    colorBackground: "#181818",
    colorText: "#ffffff",
    colorTextSecondary: "#aaaaaa",
    colorTextPlaceholder: "#666666",
    colorDanger: "#ff4444",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0px",
    fontSizeBase: "14px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      border: "2px solid #333333",
      backgroundColor: "#181818",
      color: "#ffffff",
      padding: "12px 14px",
      transition: "border-color 0.15s ease",
    },
    ".Input:focus": {
      border: "2px solid #0080ff",
      boxShadow: "none",
      outline: "none",
      color: "#ffffff",
    },
    ".Input::placeholder": { color: "#666666" },
    ".Label": {
      color: "#888",
      fontWeight: "500",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontSize: "10px",
      marginBottom: "8px",
    },
    ".Tab": { border: "2px solid #2a2a2a", backgroundColor: "#111111", color: "#aaa" },
    ".Tab:hover": { border: "2px solid #3a3a3a", color: "#e8e8e8" },
    ".Tab--selected": { border: "2px solid #0080ff", backgroundColor: "#0a1a2e", color: "#e8e8e8" },
    ".Tab--selected:hover": { border: "2px solid #0080ff" },
    ".TabIcon--selected": { fill: "#0080ff" },
    ".TabLabel--selected": { color: "#e8e8e8" },
    ".Error": { color: "#ff4444", fontSize: "12px" },
    ".Block": { border: "2px solid #2a2a2a", backgroundColor: "#111111" },
  },
};

type Step = "info" | "payment";

type FormData = {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

type Breakdown = {
  discountAmount: number;
  taxAmount: number;
  finalTotal: number;
  appliedPromoCode: string | null;
};

function PaymentForm({
  formData,
  items,
  subtotal,
  breakdown,
  clientSecret,
  onBack,
  onSuccess,
}: {
  formData: FormData;
  items: ReturnType<typeof useCart>["items"];
  subtotal: number;
  breakdown: Breakdown;
  clientSecret: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<any>(null);

  const createOrderRecord = useCallback(async (paymentIntentId: string) => {
    try {
      await apiRequest("POST", "/api/orders", {
        customerEmail: formData.email,
        customerName: formData.name,
        customerPhone: formData.phone,
        stripePaymentIntentId: paymentIntentId,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.name,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        })),
        total: breakdown.finalTotal.toFixed(2),
        shippingAddress: {
          name: formData.name,
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
        },
        promoCode: breakdown.appliedPromoCode,
        discountAmount: breakdown.discountAmount.toFixed(2),
        taxAmount: breakdown.taxAmount.toFixed(2),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      onSuccess();
    } catch (orderErr: any) {
      const msg: string = orderErr?.message || "";
      const serverMsg = msg.includes(":") ? msg.split(":").slice(1).join(":").trim() : msg;
      if (serverMsg.toLowerCase().includes("insufficient stock")) {
        toast({
          title: "Item Sold Out",
          description: serverMsg || "An item in your cart is no longer available.",
          variant: "destructive",
        });
        setPaying(false);
      } else {
        console.error("[Checkout] Order creation failed after payment:", orderErr);
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        onSuccess();
      }
    }
  }, [formData, items, breakdown, onSuccess, toast]);

  useEffect(() => {
    if (!stripe || !clientSecret) return;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "Resilient", amount: Math.round(breakdown.finalTotal * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result: any) => {
      if (result) setPaymentRequest(pr);
    });

    pr.on("paymentmethod", async (ev: any) => {
      setPaying(true);
      try {
        const { error, paymentIntent } = await (stripe as any).confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );

        if (error) {
          ev.complete("fail");
          toast({ title: "Apple Pay Failed", description: error.message || "Payment failed.", variant: "destructive" });
          setPaying(false);
          return;
        }

        ev.complete("success");

        if (paymentIntent.status === "requires_action") {
          const { error: actionError, paymentIntent: updatedPI } = await (stripe as any).confirmCardPayment(clientSecret);
          if (actionError) {
            toast({ title: "Payment Failed", description: actionError.message, variant: "destructive" });
            setPaying(false);
            return;
          }
          if (updatedPI?.status === "succeeded") await createOrderRecord(updatedPI.id);
          return;
        }

        if (paymentIntent.status === "succeeded") await createOrderRecord(paymentIntent.id);
      } catch (err: any) {
        ev.complete("fail");
        toast({ title: "Error", description: err.message || "Something went wrong.", variant: "destructive" });
        setPaying(false);
      }
    });
  }, [stripe, clientSecret, breakdown.finalTotal, createOrderRecord, toast]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout`,
          payment_method_data: {
            billing_details: {
              name: formData.name,
              email: formData.email,
              phone: formData.phone || null,
              address: {
                line1: formData.street,
                city: formData.city,
                state: formData.state,
                postal_code: formData.zip,
                country: "US",
              },
            },
          },
        },
        redirect: "if_required",
      });

      if (error) {
        toast({ title: "Payment Failed", description: error.message || "Your card was declined.", variant: "destructive" });
        setPaying(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        await createOrderRecord(paymentIntent.id);
      }
    } catch (err: any) {
      const msg: string = err?.message || "";
      const serverMsg = msg.includes(":") ? msg.split(":").slice(1).join(":").trim() : msg;
      toast({ title: "Error", description: serverMsg || "Something went wrong. Please try again.", variant: "destructive" });
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-6">
      {paymentRequest && (
        <div>
          <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-accent-blue mb-3">Express Checkout</p>
          <PaymentRequestButtonElement
            data-testid="button-apple-pay"
            options={{
              paymentRequest,
              style: { paymentRequestButton: { type: "default", theme: "dark", height: "48px" } },
            }}
          />
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">or pay with card</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        </div>
      )}

      <div className="border-2 border-[#333] bg-[#181818]">
        <div className="px-5 py-3 border-b-2 border-[#333]">
          <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-accent-blue">Payment Details</p>
        </div>
        <div className="p-5">
          <PaymentElement
            onReady={() => setReady(true)}
            options={{
              layout: { type: "tabs", defaultCollapsed: false },
              fields: { billingDetails: "never" },
              wallets: { applePay: "never", googlePay: "never" },
            }}
          />
          {!ready && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-accent-blue" />
              <span className="text-xs text-muted-foreground font-mono">Loading payment form...</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment step summary with full breakdown */}
      <div className="border-2 border-[#333] bg-[#111]">
        <div className="px-5 py-3 border-b-2 border-[#333]">
          <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-accent-blue">Order Total</p>
        </div>
        <div className="px-5 py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-mono">Subtotal</span>
            <span className="font-mono">${subtotal.toFixed(2)}</span>
          </div>
          {breakdown.discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-400 font-mono flex items-center gap-1">
                <Tag className="w-3 h-3" /> {breakdown.appliedPromoCode}
              </span>
              <span className="text-green-400 font-mono">−${breakdown.discountAmount.toFixed(2)}</span>
            </div>
          )}
          {breakdown.taxAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-mono">Tax</span>
              <span className="font-mono">${breakdown.taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-mono">Shipping</span>
            <span className="text-muted-foreground text-xs font-mono">Free</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t-2 border-[#333]">
            <span>Total</span>
            <span className="font-mono">${breakdown.finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground/50">
        <Lock className="w-3 h-3" />
        <span className="text-[10px] font-mono tracking-[0.1em] uppercase">256-bit SSL — Your card info never touches our servers</span>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={paying}
          className="border-2 text-xs tracking-luxury uppercase h-12 px-6"
          data-testid="button-back-to-info"
        >
          <ArrowLeft className="w-3 h-3 mr-2" />
          Back
        </Button>
        <Button
          type="submit"
          disabled={paying || !stripe || !ready}
          className="flex-1 h-12 text-xs tracking-luxury uppercase border-2 border-accent-blue bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
          data-testid="button-pay-now"
        >
          {paying ? (
            <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Processing...</>
          ) : (
            <><Lock className="w-3 h-3 mr-2" /> Pay ${breakdown.finalTotal.toFixed(2)}</>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function CheckoutPage() {
  useSEO({
    title: "Checkout | Resilient Official",
    description: "Complete your Resilient Official order. Secure checkout with Apple Pay, credit card, and promo code support.",
  });
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("info");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown>({
    discountAmount: 0,
    taxAmount: 0,
    finalTotal: total,
    appliedPromoCode: null,
  });
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [paymentMounted, setPaymentMounted] = useState(false);

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; label: string; discountAmount: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "", email: "", phone: "", street: "", city: "", state: "", zip: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (step === "payment" && clientSecret) {
      const t = setTimeout(() => setPaymentMounted(true), 50);
      return () => clearTimeout(t);
    }
  }, [step, clientSecret]);

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const res = await fetch(`/api/promo-codes/validate?code=${encodeURIComponent(promoInput.trim())}&subtotal=${total}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.message || "Invalid or expired promo code");
        setPromoApplied(null);
      } else {
        setPromoApplied({ code: data.code, label: data.label, discountAmount: Number(data.discountAmount) });
        setPromoError(null);
      }
    } catch {
      setPromoError("Failed to validate promo code");
    }
    setPromoLoading(false);
  };

  const handleRemovePromo = () => {
    setPromoApplied(null);
    setPromoInput("");
    setPromoError(null);
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    const required = ["name", "email", "street", "city", "state", "zip"] as const;
    for (const field of required) {
      if (!form[field]) {
        toast({ title: "Missing Information", description: `Please fill in ${field}.`, variant: "destructive" });
        return;
      }
    }

    if (!stripePromise) {
      toast({ title: "Payments Not Configured", description: "Stripe is not set up yet.", variant: "destructive" });
      return;
    }

    setCreatingIntent(true);
    try {
      const res = await apiRequest("POST", "/api/create-payment-intent", {
        total: total.toFixed(2),
        promoCode: promoApplied?.code || null,
        shippingAddress: {
          street: form.street,
          city: form.city,
          state: form.state,
          zip: form.zip,
        },
      });
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setBreakdown({
        discountAmount: Number(data.discountAmount),
        taxAmount: Number(data.taxAmount),
        finalTotal: Number(data.finalTotal),
        appliedPromoCode: data.appliedPromoCode,
      });
      setStep("payment");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not initialize payment. Please try again.", variant: "destructive" });
    }
    setCreatingIntent(false);
  };

  const handleSuccess = useCallback(() => {
    clearCart();
    setOrderComplete(true);
  }, [clearCart]);

  // Preview totals on info step
  const previewDiscount = promoApplied?.discountAmount ?? 0;
  const previewTotal = total - previewDiscount;

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6" data-testid="page-checkout-success">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <CheckCircle className="w-16 h-16 mx-auto mb-6 text-accent-blue" />
          <h1 className="font-display text-3xl tracking-luxury uppercase mb-4">Order Confirmed</h1>
          <p className="text-muted-foreground text-sm font-mono mb-2">Thank you for your purchase.</p>
          <p className="text-muted-foreground/60 text-xs font-mono mb-8">
            A confirmation email is on its way to {form.email}
          </p>
          <Button
            onClick={() => navigate("/shop")}
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors"
            data-testid="button-back-to-shop"
          >
            Continue Shopping <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-muted-foreground text-sm font-mono mb-4">Your cart is empty.</p>
          <Button onClick={() => navigate("/shop")} variant="outline" className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors">
            Shop Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-checkout">
      <div className="max-w-5xl mx-auto px-6 pt-32 pb-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">Secure Checkout</p>
          <h1 className="font-display text-4xl tracking-luxury uppercase mb-4">Checkout</h1>

          <div className="flex items-center gap-3 mb-12">
            {(["info", "payment"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 flex items-center justify-center border-2 text-[9px] font-mono font-bold transition-colors ${
                    step === s ? "border-accent-blue bg-accent-blue text-white"
                    : step === "payment" && s === "info" ? "border-accent-blue/40 text-accent-blue/40"
                    : "border-border/30 text-muted-foreground/30"
                  }`}>
                    {step === "payment" && s === "info" ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] font-mono tracking-luxury uppercase transition-colors ${step === s ? "text-white" : "text-muted-foreground/40"}`}>
                    {s === "info" ? "Contact & Shipping" : "Payment"}
                  </span>
                </div>
                {i < 1 && <div className="w-8 h-px bg-border/30" />}
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-7">

            {/* INFO STEP */}
            {step === "info" && (
              <motion.form
                key="info"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleContinue}
                className="space-y-8"
              >
                <div>
                  <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Contact</p>
                  <div className="space-y-3">
                    <Input data-testid="input-checkout-name" placeholder="Full Name" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                    <Input data-testid="input-checkout-email" type="email" placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                    <Input data-testid="input-checkout-phone" type="tel" placeholder="Phone (optional)" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                  </div>
                </div>

                <div>
                  <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Shipping Address</p>
                  <div className="space-y-3">
                    <Input data-testid="input-checkout-street" placeholder="Street Address" value={form.street} onChange={(e) => updateField("street", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                    <div className="grid grid-cols-3 gap-3">
                      <Input data-testid="input-checkout-city" placeholder="City" value={form.city} onChange={(e) => updateField("city", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                      <Input data-testid="input-checkout-state" placeholder="State" value={form.state} onChange={(e) => updateField("state", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                      <Input data-testid="input-checkout-zip" placeholder="ZIP" value={form.zip} onChange={(e) => updateField("zip", e.target.value)} className="h-12 text-sm border-2 font-mono" />
                    </div>
                  </div>
                </div>

                {/* Promo Code */}
                <div>
                  <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Promo Code</p>
                  {promoApplied ? (
                    <div className="flex items-center gap-3 border-2 border-green-500/40 bg-green-500/10 px-4 py-3">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono font-bold text-green-400">{promoApplied.code}</p>
                        <p className="text-xs text-green-400/70 font-mono">{promoApplied.label}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        className="text-muted-foreground hover:text-white transition-colors"
                        data-testid="button-remove-promo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        data-testid="input-promo-code"
                        placeholder="Enter promo code"
                        value={promoInput}
                        onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApplyPromo())}
                        className="h-12 text-sm border-2 font-mono flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={!promoInput.trim() || promoLoading}
                        variant="outline"
                        className="border-2 h-12 text-xs tracking-luxury uppercase px-5 hover:border-accent-blue transition-colors"
                        data-testid="button-apply-promo"
                      >
                        {promoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                  )}
                  {promoError && (
                    <p className="text-xs text-red-400 font-mono mt-2" data-testid="text-promo-error">{promoError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={creatingIntent}
                  className="w-full h-14 text-xs tracking-luxury uppercase border-2 border-accent-blue bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
                  data-testid="button-continue-to-payment"
                >
                  {creatingIntent ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Preparing Payment...</>
                  ) : (
                    <>Continue to Payment <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </motion.form>
            )}

            {/* PAYMENT STEP */}
            {step === "payment" && clientSecret && stripePromise && (
              <div style={{ opacity: paymentMounted ? 1 : 0, transition: "opacity 0.25s ease" }}>
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE, loader: "auto" }}>
                  <PaymentForm
                    formData={form}
                    items={items}
                    subtotal={total}
                    breakdown={breakdown}
                    clientSecret={clientSecret}
                    onBack={() => { setStep("info"); setPaymentMounted(false); }}
                    onSuccess={handleSuccess}
                  />
                </Elements>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="md:col-span-5">
            <div className="border-2 border-border/50 p-6 bg-card sticky top-24">
              <p className="text-xs tracking-luxury uppercase mb-6 font-bold text-accent-blue">Order Summary</p>
              <div className="space-y-4 mb-6">
                {items.map((item) => (
                  <div key={`${item.productId}-${item.size}`} className="flex gap-4 items-center">
                    <div className="w-16 h-20 bg-muted overflow-hidden flex-shrink-0 border-2 border-border/50">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold uppercase truncate">{item.name}</p>
                      <p className="text-muted-foreground text-xs font-mono">
                        <span className="text-accent-blue font-bold">{item.size}</span> / Qty: {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-mono">${(Number(item.price) * item.quantity).toFixed(0)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-border/50 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Subtotal</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </div>

                {/* Promo discount preview on info step, confirmed on payment step */}
                {step === "info" && promoApplied && promoApplied.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400 font-mono flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {promoApplied.code}
                    </span>
                    <span className="text-green-400 font-mono">−${promoApplied.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {step === "payment" && breakdown.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400 font-mono flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {breakdown.appliedPromoCode}
                    </span>
                    <span className="text-green-400 font-mono">−${breakdown.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {step === "payment" && breakdown.taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-mono">Tax</span>
                    <span className="font-mono">${breakdown.taxAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Shipping</span>
                  <span className="text-muted-foreground text-xs font-mono">Free</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t-2 border-border/50">
                  <span>Total</span>
                  <span className="font-mono">
                    ${step === "payment" ? breakdown.finalTotal.toFixed(2) : previewTotal.toFixed(2)}
                  </span>
                </div>
                {step === "info" && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono text-right">
                    Tax calculated at checkout
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
