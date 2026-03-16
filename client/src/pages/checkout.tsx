import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowRight, CheckCircle, Lock, ArrowLeft, Loader2 } from "lucide-react";

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
    ".Input::placeholder": {
      color: "#666666",
    },
    ".Label": {
      color: "#888",
      fontWeight: "500",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontSize: "10px",
      marginBottom: "8px",
    },
    ".Tab": {
      border: "2px solid #2a2a2a",
      backgroundColor: "#111111",
      color: "#aaa",
    },
    ".Tab:hover": {
      border: "2px solid #3a3a3a",
      color: "#e8e8e8",
    },
    ".Tab--selected": {
      border: "2px solid #0080ff",
      backgroundColor: "#0a1a2e",
      color: "#e8e8e8",
    },
    ".Tab--selected:hover": {
      border: "2px solid #0080ff",
    },
    ".TabIcon--selected": {
      fill: "#0080ff",
    },
    ".TabLabel--selected": {
      color: "#e8e8e8",
    },
    ".Error": {
      color: "#ff4444",
      fontSize: "12px",
    },
    ".Block": {
      border: "2px solid #2a2a2a",
      backgroundColor: "#111111",
    },
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

function PaymentForm({
  formData,
  items,
  total,
  onBack,
  onSuccess,
}: {
  formData: FormData;
  items: ReturnType<typeof useCart>["items"];
  total: number;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);
  const [ready, setReady] = useState(false);

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
        toast({
          title: "Payment Failed",
          description: error.message || "Your card was declined.",
          variant: "destructive",
        });
        setPaying(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        try {
          await apiRequest("POST", "/api/orders", {
            customerEmail: formData.email,
            customerName: formData.name,
            customerPhone: formData.phone,
            stripePaymentIntentId: paymentIntent.id,
            items: items.map((item) => ({
              productId: item.productId,
              productName: item.name,
              size: item.size,
              quantity: item.quantity,
              price: item.price,
            })),
            total: total.toFixed(2),
            shippingAddress: {
              name: formData.name,
              street: formData.street,
              city: formData.city,
              state: formData.state,
              zip: formData.zip,
            },
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
          } else {
            // Payment went through but order record failed — still advance to success
            // so the customer knows their payment was accepted
            console.error("[Checkout] Order creation failed after payment:", orderErr);
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            onSuccess();
          }
          setPaying(false);
        }
      }
    } catch (err: any) {
      const msg: string = err?.message || "";
      const serverMsg = msg.includes(":") ? msg.split(":").slice(1).join(":").trim() : msg;
      toast({
        title: "Error",
        description: serverMsg || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-6">
      <div className="border-2 border-[#333] bg-[#181818]">
        <div className="px-5 py-3 border-b-2 border-[#333]">
          <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-accent-blue">
            Payment Details
          </p>
        </div>
        <div className="p-5">
          <PaymentElement
            onReady={() => setReady(true)}
            options={{
              layout: {
                type: "tabs",
                defaultCollapsed: false,
              },
              fields: {
                billingDetails: "never",
              },
              wallets: {
                applePay: "never",
                googlePay: "never",
              },
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

      <div className="flex items-center gap-2 text-muted-foreground/50">
        <Lock className="w-3 h-3" />
        <span className="text-[10px] font-mono tracking-[0.1em] uppercase">
          256-bit SSL — Your card info never touches our servers
        </span>
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
            <><Lock className="w-3 h-3 mr-2" /> Pay ${total.toFixed(2)}</>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function CheckoutPage() {
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("info");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [paymentMounted, setPaymentMounted] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
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

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    const required = ["name", "email", "street", "city", "state", "zip"] as const;
    for (const field of required) {
      if (!form[field]) {
        toast({
          title: "Missing Information",
          description: `Please fill in ${field}.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (!stripePromise) {
      toast({
        title: "Payments Not Configured",
        description: "Stripe is not set up yet. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    setCreatingIntent(true);
    try {
      const res = await apiRequest("POST", "/api/create-payment-intent", {
        total: total.toFixed(2),
      });
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setStep("payment");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not initialize payment. Please try again.",
        variant: "destructive",
      });
    }
    setCreatingIntent(false);
  };

  const handleSuccess = useCallback(() => {
    clearCart();
    setOrderComplete(true);
  }, [clearCart]);

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
          <p className="text-muted-foreground text-sm font-mono mb-2">
            Thank you for your purchase.
          </p>
          <p className="text-muted-foreground/60 text-xs font-mono mb-8">
            A confirmation email is on its way to {form.email}
          </p>
          <Button
            onClick={() => navigate("/shop")}
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors"
            data-testid="button-back-to-shop"
          >
            Continue Shopping
            <ArrowRight className="w-4 h-4 ml-2" />
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
          <Button
            onClick={() => navigate("/shop")}
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors"
          >
            Shop Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-checkout">
      <div className="max-w-5xl mx-auto px-6 pt-32 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">
            Secure Checkout
          </p>
          <h1 className="font-display text-4xl tracking-luxury uppercase mb-4">Checkout</h1>

          <div className="flex items-center gap-3 mb-12">
            {(["info", "payment"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 flex items-center justify-center border-2 text-[9px] font-mono font-bold transition-colors ${
                    step === s
                      ? "border-accent-blue bg-accent-blue text-white"
                      : step === "payment" && s === "info"
                      ? "border-accent-blue/40 text-accent-blue/40"
                      : "border-border/30 text-muted-foreground/30"
                  }`}>
                    {step === "payment" && s === "info" ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] font-mono tracking-luxury uppercase transition-colors ${
                    step === s ? "text-white" : "text-muted-foreground/40"
                  }`}>
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

            {/* INFO STEP — animated */}
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
                    <Input
                      data-testid="input-checkout-name"
                      placeholder="Full Name"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      className="h-12 text-sm border-2 font-mono"
                    />
                    <Input
                      data-testid="input-checkout-email"
                      type="email"
                      placeholder="Email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      className="h-12 text-sm border-2 font-mono"
                    />
                    <Input
                      data-testid="input-checkout-phone"
                      type="tel"
                      placeholder="Phone (optional)"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      className="h-12 text-sm border-2 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Shipping Address</p>
                  <div className="space-y-3">
                    <Input
                      data-testid="input-checkout-street"
                      placeholder="Street Address"
                      value={form.street}
                      onChange={(e) => updateField("street", e.target.value)}
                      className="h-12 text-sm border-2 font-mono"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <Input
                        data-testid="input-checkout-city"
                        placeholder="City"
                        value={form.city}
                        onChange={(e) => updateField("city", e.target.value)}
                        className="h-12 text-sm border-2 font-mono"
                      />
                      <Input
                        data-testid="input-checkout-state"
                        placeholder="State"
                        value={form.state}
                        onChange={(e) => updateField("state", e.target.value)}
                        className="h-12 text-sm border-2 font-mono"
                      />
                      <Input
                        data-testid="input-checkout-zip"
                        placeholder="ZIP"
                        value={form.zip}
                        onChange={(e) => updateField("zip", e.target.value)}
                        className="h-12 text-sm border-2 font-mono"
                      />
                    </div>
                  </div>
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

            {/* PAYMENT STEP — NO motion wrapper around Elements (prevents iframe lag) */}
            {step === "payment" && clientSecret && stripePromise && (
              <div
                style={{ opacity: paymentMounted ? 1 : 0, transition: "opacity 0.25s ease" }}
              >
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: STRIPE_APPEARANCE,
                    loader: "auto",
                  }}
                >
                  <PaymentForm
                    formData={form}
                    items={items}
                    total={total}
                    onBack={() => {
                      setStep("info");
                      setPaymentMounted(false);
                    }}
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
                  <div
                    key={`${item.productId}-${item.size}`}
                    className="flex gap-4 items-center"
                  >
                    <div className="w-16 h-20 bg-muted overflow-hidden flex-shrink-0 border-2 border-border/50">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold uppercase truncate">{item.name}</p>
                      <p className="text-muted-foreground text-xs font-mono">
                        <span className="text-accent-blue font-bold">{item.size}</span> / Qty: {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-mono">
                      ${(Number(item.price) * item.quantity).toFixed(0)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-border/50 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Subtotal</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Shipping</span>
                  <span className="text-muted-foreground text-xs font-mono">Free</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t-2 border-border/50">
                  <span>Total</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
