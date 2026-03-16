import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Minus, Plus, X, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useSEO } from "@/hooks/use-seo";

export default function CartPage() {
  useSEO({
    title: "Your Cart | Resilient Official",
    description:
      "Review your Resilient Official cart. Secure checkout with Apple Pay, card payments, and promo code support.",
  });
  const { items, removeItem, updateQuantity, total } = useCart();

  return (
    <div className="min-h-screen bg-background" data-testid="page-cart">
      <div className="max-w-4xl mx-auto px-6 pt-32 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">
            Your Selection
          </p>
          <h1 className="font-display text-4xl tracking-luxury uppercase mb-12">
            Cart
          </h1>
        </motion.div>

        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <p className="text-muted-foreground text-sm font-mono mb-8">Your cart is empty.</p>
            <Link href="/shop">
              <Button
                variant="outline"
                className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors"
                data-testid="button-continue-shopping"
              >
                Continue Shopping
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div>
            <div className="border-b-2 border-border/50 pb-2 mb-6 hidden md:grid grid-cols-12 gap-4 text-xs font-mono tracking-luxury uppercase text-muted-foreground">
              <span className="col-span-6">Product</span>
              <span className="col-span-2 text-center">Qty</span>
              <span className="col-span-3 text-right">Total</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-6">
              {items.map((item, i) => (
                <motion.div
                  key={`${item.productId}-${item.size}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="grid grid-cols-12 gap-4 items-center py-4 border-b-2 border-border/30"
                  data-testid={`cart-item-${item.productId}-${item.size}`}
                >
                  <div className="col-span-12 md:col-span-6 flex gap-4 items-center">
                    <div className="w-20 h-24 bg-muted overflow-hidden flex-shrink-0 border-2 border-border/50">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide">{item.name}</h3>
                      <p className="text-muted-foreground text-xs font-mono mt-1">
                        Size: <span className="text-accent-blue font-bold">{item.size}</span>
                      </p>
                      <p className="text-sm font-mono mt-1">${Number(item.price).toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="col-span-6 md:col-span-2 flex items-center justify-center gap-3">
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.size, item.quantity - 1)
                      }
                      className="w-8 h-8 border-2 border-border flex items-center justify-center hover:border-accent-blue/50 transition-colors"
                      data-testid={`button-cart-minus-${item.productId}-${item.size}`}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-mono w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.size, item.quantity + 1)
                      }
                      className="w-8 h-8 border-2 border-border flex items-center justify-center hover:border-accent-blue/50 transition-colors"
                      data-testid={`button-cart-plus-${item.productId}-${item.size}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="col-span-4 md:col-span-3 text-right text-sm font-mono">
                    ${(Number(item.price) * item.quantity).toFixed(0)}
                  </div>

                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <button
                      onClick={() => removeItem(item.productId, item.size)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`button-cart-remove-${item.productId}-${item.size}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-end">
              <div className="w-full md:w-80 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Subtotal</span>
                  <span className="font-mono">${total.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Shipping</span>
                  <span className="text-xs text-muted-foreground font-mono">Calculated at checkout</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-4 border-t-2 border-border/50">
                  <span>Total</span>
                  <span className="font-mono" data-testid="text-cart-total">${total.toFixed(0)}</span>
                </div>

                <Link href="/checkout">
                  <Button
                    className="w-full h-14 text-xs tracking-luxury uppercase mt-4 border-2 border-accent-blue bg-accent-blue text-white btn-liquid no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-shadow"
                    data-testid="button-checkout"
                  >
                    Proceed to Checkout
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
