import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SplitText, FadeInSection } from "@/components/split-text";
import { Watermark } from "@/components/watermark";
import { Marquee } from "@/components/marquee";
import type { ProductWithStock } from "@shared/schema";
import { useAudio } from "@/lib/audio";
import { useSEO } from "@/hooks/use-seo";

export default function Home() {
  useSEO({
    title: "Resilient Official | Premium Streetwear",
    description:
      "Shop Resilient Official — premium streetwear crafted for those who refuse to conform. Exclusive limited drops, graphic tees, hoodies, and jackets.",
    keywords:
      "resilient official, premium streetwear, luxury streetwear, limited drops, graphic tees, hoodies, urban fashion, resilient clothing",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Resilient Official",
      url: "https://resilientofficial.com",
      logo: "https://resilientofficial.com/images/logo-icon.png",
      sameAs: ["https://instagram.com/resilientofficial"],
    },
  });

  const { data: products } = useQuery<ProductWithStock[]>({
    queryKey: ["/api/products"],
  });

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(heroProgress, [0, 1], ["0%", "30%"]);
  const heroScale = useTransform(heroProgress, [0, 1], [1, 1.1]);

  const collectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: collectionProgress } = useScroll({
    target: collectionRef,
    offset: ["start end", "end start"],
  });
  const collectionY = useTransform(collectionProgress, [0, 1], ["-10%", "10%"]);
  const { muted, toggleMute } = useAudio();

  const featured = products?.filter((p) => p.featured)?.slice(0, 4) || [];

  return (
    <div className="min-h-screen bg-background" data-testid="page-home">
      <section ref={heroRef} className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: heroY, scale: heroScale }}>
          <img
            src="/images/hero-main.png"
            alt="Resilient Collection"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative z-10 text-center"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-white/60 text-xs font-mono tracking-luxury uppercase mb-6"
          >
            Season One
          </motion.p>
          <h1 className="text-white font-display text-5xl md:text-7xl tracking-luxury uppercase mb-4">
            <SplitText text="RESILIENT" delay={0.5} />
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="text-white/50 text-sm tracking-wide max-w-md mx-auto mb-10 font-mono"
          >
            Built for those who refuse to break. Premium streetwear engineered for the relentless.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.6 }}
          >
            <Link href="/shop">
              <Button
                data-testid="button-shop-now"
                variant="outline"
                className="border-2 border-accent-blue/60 text-white px-10 h-12 text-xs tracking-luxury uppercase backdrop-blur-sm no-default-hover-elevate no-default-active-elevate btn-liquid transition-all duration-500 hover:border-accent-blue hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]"
              >
                Shop Collection
                <ArrowRight className="w-4 h-4 ml-3" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-5 h-8 border-2 border-white/30 flex justify-center pt-2"
          >
            <motion.div className="w-1 h-1 bg-accent-blue" />
          </motion.div>
        </motion.div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-24">
        <FadeInSection>
          <p className="text-muted-foreground text-xs font-mono tracking-luxury uppercase mb-3">
            Curated
          </p>
          <h2 className="font-display text-3xl tracking-luxury uppercase mb-16">
            <SplitText text="THE EDIT" />
          </h2>
        </FadeInSection>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {featured.map((product, i) => (
            <FadeInSection key={product.id} delay={i * 0.1}>
              <Link href={`/product/${product.id}`}>
                <div className="group cursor-pointer" data-testid={`card-featured-product-${product.id}`}>
                  <div className="aspect-[2/3] bg-muted mb-4 overflow-hidden relative border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300">
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
                    />
                    <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                      <div className="bg-accent-blue text-white text-center py-3 text-xs tracking-luxury uppercase font-bold">
                        Quick Add
                      </div>
                    </div>
                  </div>
                  <h3 className="text-sm font-bold tracking-wide uppercase">{product.name}</h3>
                  <p className="text-muted-foreground text-sm mt-1 font-mono">
                    ${Number(product.price).toFixed(0)}
                  </p>
                </div>
              </Link>
            </FadeInSection>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <FadeInSection>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            <div ref={collectionRef} className="md:col-span-8 relative aspect-[16/9] overflow-hidden group border-2 border-border/50 hover:border-accent-blue/30 transition-colors duration-300">
              <Link href="/shop" className="absolute inset-0 z-10" aria-label="Shop New Arrivals" />
              <motion.img
                src="/images/hero-main.JPG"
                alt="New Arrivals"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer"
                style={{ y: collectionY }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <div className="absolute bottom-8 left-8 pointer-events-none">
                <h3 className="text-white font-display text-2xl tracking-luxury uppercase">
                  <SplitText text="NEW ARRIVALS" />
                </h3>
              </div>
            </div>

            <div className="md:col-span-4 grid grid-rows-2 gap-4 md:gap-6">
              <FadeInSection delay={0.2}>
                <div className="relative h-full overflow-hidden bg-[#0A0A0A] border-2 border-border/50 flex items-center justify-center p-8 group">
                  <div className="text-center">
                    <p className="text-accent-blue/60 text-xs font-mono tracking-luxury uppercase mb-3">
                      Philosophy
                    </p>
                    <p className="text-white/80 text-sm leading-relaxed max-w-xs">
                      Every piece is a statement. Designed to endure, crafted for those who demand more.
                    </p>
                  </div>
                </div>
              </FadeInSection>
              <FadeInSection delay={0.3}>
                <div className="relative h-full overflow-hidden bg-[#0A0A0A] border-2 border-border/50 flex items-center justify-center p-8">
                  <div className="text-center">
                    <p className="text-xs font-mono tracking-luxury uppercase mb-3 text-accent-blue/60">
                      Free Shipping
                    </p>
                    <p className="font-display text-2xl tracking-luxury uppercase">
                      $150+
                    </p>
                    <p className="text-muted-foreground text-xs font-mono mt-2">
                      On all domestic orders
                    </p>
                  </div>
                </div>
              </FadeInSection>
            </div>
          </div>
        </FadeInSection>
      </section>

      <Marquee />

      <section className="relative border-t-2 border-border/30 py-24 px-6">
        <Watermark />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <FadeInSection>
            <p className="text-muted-foreground text-xs font-mono tracking-luxury uppercase mb-4">
              The Brand
            </p>
            <h2 className="font-display text-3xl md:text-5xl tracking-luxury uppercase mb-6">
              <SplitText text="RESILIENT SUPPLY" />
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed mb-10">
              We don't make clothes for everyone. We make them for the ones who show up every day, 
              who refuse to quit, who understand that real style is earned, not bought.
            </p>
            <Link href="/shop">
              <Button
                variant="outline"
                className="border-2 border-border text-xs tracking-luxury uppercase px-8 h-12 btn-liquid no-default-hover-elevate no-default-active-elevate hover:border-accent-blue transition-colors duration-300"
                data-testid="button-explore-collection"
              >
                Explore Collection
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </FadeInSection>
        </div>
      </section>

      <section className="border-t-2 border-border/30 py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <FadeInSection>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
              <div>
                <p className="text-muted-foreground text-xs font-mono tracking-luxury uppercase mb-3">
                  Visual
                </p>
                <h2 className="font-display text-3xl tracking-luxury uppercase">
                  <SplitText text="THE GALLERY" />
                </h2>
              </div>
              <Link href="/gallery">
                <Button
                  variant="outline"
                  className="border-2 border-border text-xs tracking-luxury uppercase px-6 h-10 btn-liquid no-default-hover-elevate no-default-active-elevate hover:border-accent-blue transition-colors duration-300"
                  data-testid="button-view-gallery"
                >
                  View All
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[200px] md:auto-rows-[250px]">
            <FadeInSection delay={0}>
              <Link href="/gallery">
                <div className="row-span-2 h-full overflow-hidden group cursor-pointer border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300" data-testid="gallery-teaser-0">
                  <img src="/images/gallery/jacket-graffiti-duo.jpg" alt="Jacket Drop" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              </Link>
            </FadeInSection>
            <FadeInSection delay={0.1}>
              <Link href="/gallery">
                <div className="h-full overflow-hidden group cursor-pointer border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300" data-testid="gallery-teaser-1">
                  <img src="/images/gallery/chat-portrait-tee.jpg" alt="Being Resilient" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              </Link>
            </FadeInSection>
            <FadeInSection delay={0.15}>
              <Link href="/gallery">
                <div className="col-span-2 h-full overflow-hidden group cursor-pointer border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300" data-testid="gallery-teaser-2">
                  <img src="/images/gallery/jacket-garage-action.jpg" alt="Garage Session" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              </Link>
            </FadeInSection>
            <FadeInSection delay={0.2}>
              <Link href="/gallery">
                <div className="h-full overflow-hidden group cursor-pointer border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300" data-testid="gallery-teaser-3">
                  <img src="/images/gallery/chat-stairs-duo.jpg" alt="Fire Escape" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              </Link>
            </FadeInSection>
            <FadeInSection delay={0.25}>
              <Link href="/gallery">
                <div className="col-span-2 h-full overflow-hidden group cursor-pointer border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300" data-testid="gallery-teaser-4">
                  <img src="/images/gallery/jacket-sidewalk-duo.jpg" alt="Sidewalk Duo" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              </Link>
            </FadeInSection>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-border/50 py-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src="/images/logo-icon.png" alt="Resilient" className="w-8 h-8 object-contain" />
              <h4 className="font-display text-lg tracking-luxury uppercase">
                Resilient
              </h4>
            </div>
            <p className="text-muted-foreground text-xs max-w-xs leading-relaxed font-mono">
              Premium streetwear for the relentless. Built to endure.
            </p>
          </div>
          <div className="flex gap-16">
            <div>
              <p className="text-xs tracking-luxury uppercase mb-4 font-bold">Shop</p>
              <div className="space-y-2">
                <Link href="/shop" className="block text-muted-foreground text-sm hover:text-accent-blue transition-colors" data-testid="link-footer-all">All</Link>
                <Link href="/shop?category=hoodies" className="block text-muted-foreground text-sm hover:text-accent-blue transition-colors" data-testid="link-footer-hoodies">Hoodies</Link>
                <Link href="/shop?category=tees" className="block text-muted-foreground text-sm hover:text-accent-blue transition-colors" data-testid="link-footer-tees">Tees</Link>
              </div>
            </div>
            <div>
              <p className="text-xs tracking-luxury uppercase mb-4 font-bold">Info</p>
              <div className="space-y-2">
                <span className="block text-muted-foreground text-sm">Shipping</span>
                <span className="block text-muted-foreground text-sm">Returns</span>
                <span className="block text-muted-foreground text-sm">Contact</span>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t-2 border-border/30 flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-mono tracking-wide">
            &copy; 2026 Resilient Supply Co. All rights reserved.
          </p>
          <button
            onClick={toggleMute}
            className="flex items-center gap-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-200 text-[10px] font-mono tracking-luxury uppercase"
            title={muted ? "Unmute sounds" : "Mute sounds"}
            data-testid="button-mute-toggle"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {muted ? "Muted" : "Sound On"}
          </button>
        </div>
      </footer>
    </div>
  );
}
