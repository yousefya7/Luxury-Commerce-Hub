import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/navbar";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Shop from "@/pages/shop";
import ProductPage from "@/pages/product";
import CartPage from "@/pages/cart";
import CheckoutPage from "@/pages/checkout";
import AdminPage from "@/pages/admin/index";
import GalleryPage from "@/pages/gallery";
import DropLock from "@/pages/drop-lock";
import OrderStatusPage from "@/pages/order-status";
import ShippingPage from "@/pages/shipping";
import ReturnsPage from "@/pages/returns";
import ContactPage from "@/pages/contact";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AudioProvider } from "@/lib/audio";
import CustomCursor from "@/components/custom-cursor";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/product/:id" component={ProductPage} />
      <Route path="/cart" component={CartPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/gallery" component={GalleryPage} />
      <Route path="/order-status" component={OrderStatusPage} />
      <Route path="/shipping" component={ShippingPage} />
      <Route path="/returns" component={ReturnsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function NoiseOverlay() {
  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: "256px 256px",
      }}
    />
  );
}

function LoadingBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] h-[2px] bg-transparent overflow-hidden">
      <div className="h-full w-full bg-accent-blue loading-bar-animation" />
    </div>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function NavigationLoadingBar() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const prevLocation = useRef(location);

  useEffect(() => {
    if (location !== prevLocation.current) {
      prevLocation.current = location;
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [location]);

  return <LoadingBar visible={visible} />;
}

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

function GoogleAnalytics() {
  const [location] = useLocation();

  useEffect(() => {
    if (!GA_ID) return;
    if (!document.getElementById("ga-script")) {
      const script1 = document.createElement("script");
      script1.id = "ga-script";
      script1.async = true;
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(script1);

      const script2 = document.createElement("script");
      script2.id = "ga-init";
      script2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false});`;
      document.head.appendChild(script2);
    }
  }, []);

  useEffect(() => {
    if (!GA_ID || typeof (window as any).gtag !== "function") return;
    (window as any).gtag("event", "page_view", { page_path: location });
  }, [location]);

  return null;
}

function AppInner() {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [location] = useLocation();

  useEffect(() => {
    fetch("/api/auth/check", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.unlocked) setUnlocked(true);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const isAdminRoute = location.startsWith("/admin");
  const isOrderStatusRoute = location.startsWith("/order-status");

  if (!unlocked && !isAdminRoute && !isOrderStatusRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <NoiseOverlay />
          <DropLock onUnlock={() => setUnlocked(true)} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AudioProvider>
          <CartProvider>
            <GoogleAnalytics />
            <ScrollToTop />
            <NoiseOverlay />
            <NavigationLoadingBar />
            <Navbar />
            <Router />
            <Toaster />
          </CartProvider>
        </AudioProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <>
      <CustomCursor />
      <AppInner />
    </>
  );
}

export default App;
