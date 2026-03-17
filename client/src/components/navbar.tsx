import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAudio } from "@/lib/audio";

export default function Navbar() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { itemCount } = useCart();
  const { playHover } = useAudio();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const isHome = location === "/";

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled || !isHome
            ? "bg-background/80 backdrop-blur-xl border-b border-border/50"
            : "bg-transparent"
        }`}
        data-testid="navbar"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 flex-1">
            <button
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              data-testid="button-mobile-menu"
            >
              <Menu className={`w-5 h-5 ${isHome && !scrolled ? "text-white" : ""}`} />
            </button>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/shop">
                <span
                  className={`text-[11px] font-bold tracking-luxury uppercase cursor-pointer transition-colors relative after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-accent-blue after:transition-all after:duration-300 hover:after:w-full ${
                    isHome && !scrolled ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="link-shop"
                  onMouseEnter={playHover}
                >
                  Shop
                </span>
              </Link>
              <Link href="/gallery">
                <span
                  className={`text-[11px] font-bold tracking-luxury uppercase cursor-pointer transition-colors relative after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-accent-blue after:transition-all after:duration-300 hover:after:w-full ${
                    isHome && !scrolled ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="link-gallery"
                  onMouseEnter={playHover}
                >
                  Gallery
                </span>
              </Link>
            </div>
          </div>

          <Link href="/">
            <span
              className="flex items-center gap-2 cursor-pointer"
              data-testid="link-brand"
            >
              <motion.img
                src="/images/logo-icon.png"
                alt="Resilient"
                className="w-8 h-8 object-contain"
                animate={{ rotate: [0, -12, 12, -8, 8, -4, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
              />
              <span className={`font-display text-lg tracking-luxury uppercase ${
                isHome && !scrolled ? "text-white" : ""
              }`}>
                Resilient
              </span>
            </span>
          </Link>

          <div className="flex items-center justify-end flex-1">
            <Link href="/cart">
              <span className="relative cursor-pointer" data-testid="link-cart">
                <ShoppingBag className={`w-5 h-5 ${isHome && !scrolled ? "text-white" : ""}`} />
                {itemCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-accent-blue text-white text-[10px] w-5 h-5 flex items-center justify-center font-mono" data-testid="text-cart-count">
                    {itemCount}
                  </span>
                )}
              </span>
            </Link>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-background"
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-16">
                <span className="flex items-center gap-2 font-display text-lg tracking-luxury uppercase">
                  <motion.img
                    src="/images/logo-icon.png"
                    alt="Resilient"
                    className="w-8 h-8 object-contain"
                    animate={{ rotate: [0, -12, 12, -8, 8, -4, 4, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
                  />
                  Resilient
                </span>
                <button onClick={() => setMobileOpen(false)} data-testid="button-close-menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-8">
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <span className="block font-display text-3xl tracking-luxury uppercase">
                    Home
                  </span>
                </Link>
                <Link href="/shop" onClick={() => setMobileOpen(false)}>
                  <span className="block font-display text-3xl tracking-luxury uppercase">
                    Shop
                  </span>
                </Link>
                <Link href="/gallery" onClick={() => setMobileOpen(false)}>
                  <span className="block font-display text-3xl tracking-luxury uppercase">
                    Gallery
                  </span>
                </Link>
                <Link href="/cart" onClick={() => setMobileOpen(false)}>
                  <span className="block font-display text-3xl tracking-luxury uppercase">
                    Cart ({itemCount})
                  </span>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
