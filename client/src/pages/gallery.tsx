import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
import { Link } from "wouter";
import { SplitText, FadeInSection } from "@/components/split-text";
import { useSEO } from "@/hooks/use-seo";

const GALLERY_IMAGES = [
  { id: 1,  src: "/images/gallery/chat-portrait-tee.jpg",      alt: "Being Resilient Defines Character" },
  { id: 2,  src: "/images/gallery/jacket-graffiti-duo.jpg",    alt: "Jacket Drop — Graffiti Wall" },
  { id: 3,  src: "/images/gallery/pt2-elliston-duo.jpg",       alt: "Elliston Place — Hoodie Duo" },
  { id: 4,  src: "/images/gallery/jacket-garage-action.jpg",   alt: "Parking Garage Session" },
  { id: 5,  src: "/images/gallery/chat-knight-tee.jpg",        alt: "Knight Tee Editorial" },
  { id: 6,  src: "/images/gallery/jacket-rooftop.jpg",         alt: "Rooftop Session" },
  { id: 7,  src: "/images/gallery/chat-stairs-duo.jpg",        alt: "Fire Escape — Golden Hour" },
  { id: 8,  src: "/images/gallery/jacket-mural-front.jpg",     alt: "Bubble Mural" },
  { id: 9,  src: "/images/gallery/chat-donuts.jpg",            alt: "Donut Shop Vibes" },
  { id: 10, src: "/images/gallery/jacket-sidewalk-duo.jpg",    alt: "Sidewalk Duo" },
  { id: 11, src: "/images/gallery/chat-wall-lean.jpg",         alt: "Character Tee Portrait" },
  { id: 12, src: "/images/gallery/jacket-elevator-solo.jpg",   alt: "Elevator — Graffiti" },
  { id: 13, src: "/images/gallery/chat-stairs-crew.jpg",       alt: "Crew on Steps" },
  { id: 14, src: "/images/gallery/jacket-mural-hat.jpg",       alt: "Mural Series II" },
  { id: 15, src: "/images/gallery/chat-flannels.jpg",          alt: "Resilient Flannels" },
  { id: 16, src: "/images/gallery/pt2-donut-trio.jpg",         alt: "Donut Spot — Trio" },
  { id: 17, src: "/images/gallery/jacket-storefront.jpg",      alt: "Night Storefront" },
  { id: 18, src: "/images/gallery/chat-profile.jpg",           alt: "Profile Shot" },
  { id: 19, src: "/images/gallery/jacket-rooftop-drone.jpg",   alt: "Rooftop — Drone" },
  { id: 20, src: "/images/gallery/chat-duo-street.jpg",        alt: "Street Duo" },
  { id: 21, src: "/images/gallery/jacket-bikeroute.jpg",       alt: "Bike Route — Night" },
  { id: 22, src: "/images/gallery/jacket-mural-solo.jpg",      alt: "Mural Series" },
  { id: 23, src: "/images/gallery/chat-car-lean.jpg",          alt: "Car Lean" },
  { id: 24, src: "/images/gallery/jacket-night-sign.jpg",      alt: "Night Sign" },
  { id: 25, src: "/images/gallery/jacket-phone.jpg",           alt: "Candid — Phone Check" },
  { id: 26, src: "/images/gallery/jacket-elliston.jpg",        alt: "Elliston Place" },
  { id: 27, src: "/images/gallery/jacket-flatlay-drone.jpg",   alt: "Jacket — Overhead" },
  { id: 28, src: "/images/gallery/chat-balcony.jpg",           alt: "Balcony Shot" },
  { id: 29, src: "/images/gallery/chat-alley.jpg",             alt: "Alley Session" },
  { id: 30, src: "/images/gallery/jacket-flatlay.jpg",         alt: "Resilient Jacket — Flat Lay" },
];

function distributeColumns<T>(items: T[], numCols: number): T[][] {
  const cols: T[][] = Array.from({ length: numCols }, () => []);
  items.forEach((item, i) => cols[i % numCols].push(item));
  return cols;
}

function useColumnCount() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCols(w >= 1024 ? 4 : w >= 768 ? 3 : 2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

export default function Gallery() {
  useSEO({
    title: "Editorial Gallery | Resilient Official",
    description:
      "Explore the Resilient Official editorial gallery — raw, authentic imagery capturing the culture behind the brand. Premium streetwear in the wild.",
    keywords:
      "resilient official gallery, streetwear editorial, fashion photography, resilient lookbook, urban streetwear photos",
  });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const numCols = useColumnCount();
  const columns = distributeColumns(GALLERY_IMAGES, numCols);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex((i) => (i === null ? null : (i - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length));
  }, []);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex((i) => (i === null ? null : (i + 1) % GALLERY_IMAGES.length));
  }, []);

  const activeLightbox = lightboxIndex !== null ? GALLERY_IMAGES[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-[#0A0A0A]" data-testid="page-gallery">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-32 pb-24">
        <FadeInSection>
          <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">
            Editorial
          </p>
          <h1 className="font-display text-4xl tracking-luxury uppercase mb-4">
            <SplitText text="THE GALLERY" />
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mb-16 font-mono">
            A visual journey through the Resilient universe. Each frame tells a story of persistence and craft.
          </p>
        </FadeInSection>

        {/* Flex masonry — manual columns for even bottoms */}
        <div className="flex gap-3 md:gap-4 items-start">
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-3 md:gap-4">
              {col.map((image) => {
                const globalIndex = GALLERY_IMAGES.findIndex((g) => g.id === image.id);
                return (
                  <motion.div
                    key={image.id}
                    className="relative overflow-hidden cursor-pointer group border border-white/5 hover:border-accent-blue/40 transition-colors duration-300"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: Math.min(globalIndex * 0.04, 0.8) }}
                    onClick={() => openLightbox(globalIndex)}
                    data-testid={`gallery-image-${image.id}`}
                  >
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="w-full h-auto block transition-all duration-500 group-hover:brightness-110 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <p className="text-white text-[10px] font-mono tracking-luxury uppercase leading-tight">
                        {image.alt}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer sign-off */}
        <FadeInSection>
          <div className="mt-20 pt-10 border-t border-white/8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="font-display text-xs tracking-[0.3em] uppercase text-white/20 mb-1">
                Resilient — Est. 2024
              </p>
              <p className="text-[11px] font-mono text-muted-foreground/50 tracking-luxury uppercase">
                Every frame. Every stitch. Every story.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/shop">
                <motion.button
                  className="text-xs font-mono tracking-luxury uppercase border-2 border-accent-blue text-accent-blue px-6 py-3 hover:bg-accent-blue hover:text-white transition-colors duration-200"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  data-testid="button-gallery-shop-cta"
                >
                  Shop the Looks →
                </motion.button>
              </Link>
              <motion.button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="w-11 h-11 flex items-center justify-center border-2 border-white/15 text-white/40 hover:border-accent-blue/60 hover:text-accent-blue transition-colors duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Back to top"
                data-testid="button-gallery-back-to-top"
              >
                <ArrowUp className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </FadeInSection>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {activeLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
            onClick={closeLightbox}
            data-testid="lightbox-overlay"
          >
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />

            {/* Close button */}
            <button
              className="absolute top-5 right-5 z-20 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all border border-white/10"
              onClick={closeLightbox}
              data-testid="button-close-lightbox"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Prev button */}
            <button
              className="absolute left-3 md:left-6 z-20 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all border border-white/10"
              onClick={goPrev}
              data-testid="button-lightbox-prev"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Next button */}
            <button
              className="absolute right-3 md:right-6 z-20 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all border border-white/10"
              onClick={goNext}
              data-testid="button-lightbox-next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Image */}
            <motion.img
              key={activeLightbox.id}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              src={activeLightbox.src}
              alt={activeLightbox.alt}
              className="relative z-10 max-w-[88vw] max-h-[88vh] object-contain"
              onClick={(e) => e.stopPropagation()}
              data-testid="lightbox-image"
            />

            {/* Caption + counter */}
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 z-10 pointer-events-none">
              <p className="text-accent-blue/90 text-[10px] font-mono tracking-luxury uppercase">
                {activeLightbox.alt}
              </p>
              <p className="text-white/30 text-[10px] font-mono">
                {lightboxIndex! + 1} / {GALLERY_IMAGES.length}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
