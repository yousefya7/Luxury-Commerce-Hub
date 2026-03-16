import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import type { ProductWithStock } from "@shared/schema";
import { useSEO } from "@/hooks/use-seo";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

function isSoldOut(product: ProductWithStock): boolean {
  if (!product.stock || product.stock.length === 0) return true;
  return product.stock.reduce((sum, s) => sum + s.quantity, 0) === 0;
}

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { addItem } = useCart();

  const { data: product, isLoading } = useQuery<ProductWithStock>({
    queryKey: ["/api/products", id],
  });

  useSEO({
    title: product ? `${product.name} | Resilient Official` : "Product | Resilient Official",
    description: product
      ? `${product.description.slice(0, 155)}...`
      : "Shop premium streetwear from Resilient Official. Limited drops, exclusive designs.",
    ogImage: product?.images?.[0] || undefined,
    ogType: "product",
    keywords: product
      ? `${product.name}, resilient official, ${product.category}, streetwear, premium streetwear`
      : "resilient official, streetwear, premium clothing",
    jsonLd: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          image: product.images,
          description: product.description,
          brand: { "@type": "Brand", name: "Resilient Official" },
          offers: {
            "@type": "Offer",
            price: product.price,
            priceCurrency: "USD",
            availability:
              product.stock?.reduce((s, x) => s + x.quantity, 0) > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
          },
        }
      : undefined,
  });

  const scrollToImage = useCallback((index: number) => {
    if (!carouselRef.current) return;
    const child = carouselRef.current.children[index] as HTMLElement;
    if (child) {
      child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const scrollLeft = container.scrollLeft;
    const childWidth = container.children[0]?.clientWidth || 1;
    const newIndex = Math.round(scrollLeft / childWidth);
    setActiveIndex(newIndex);
  }, []);

  useEffect(() => {
    if (!thumbnailRef.current) return;
    const thumb = thumbnailRef.current.children[activeIndex] as HTMLElement;
    if (thumb) {
      thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-32 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <Skeleton className="aspect-[3/4]" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  const getStockForSize = (size: string) => {
    return product.stock.find((s) => s.size === size)?.quantity || 0;
  };

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast({
        title: "Select a Size",
        description: "Please choose a size before adding to cart.",
        variant: "destructive",
      });
      return;
    }

    const stockQty = getStockForSize(selectedSize);
    if (stockQty < quantity) {
      toast({
        title: "Insufficient Stock",
        description: `Only ${stockQty} available in size ${selectedSize}.`,
        variant: "destructive",
      });
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      size: selectedSize,
      quantity,
      image: product.images[0],
    });

    toast({
      title: "Added to Cart",
      description: `${product.name} (${selectedSize}) x${quantity}`,
    });
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-product">
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <Link href="/shop">
          <button className="flex items-center gap-2 text-muted-foreground text-xs font-mono tracking-luxury uppercase mb-12 transition-colors hover:text-accent-blue" data-testid="link-back-to-shop">
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </button>
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="relative group">
              <div
                ref={carouselRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                data-testid="carousel-main"
              >
                {product.images.map((img, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] bg-muted flex-shrink-0 w-full snap-start border-2 border-border/50 overflow-hidden"
                  >
                    <img
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      className="w-full h-full object-cover"
                      data-testid={`img-product-slide-${i}`}
                      draggable={false}
                    />
                  </div>
                ))}
              </div>

              {product.images.length > 1 && (
                <>
                  <button
                    onClick={() => { const prev = Math.max(0, activeIndex - 1); scrollToImage(prev); }}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 border-2 border-white/20 flex items-center justify-center text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity ${activeIndex === 0 ? "hidden" : ""}`}
                    data-testid="button-carousel-prev"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => { const next = Math.min(product.images.length - 1, activeIndex + 1); scrollToImage(next); }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 border-2 border-white/20 flex items-center justify-center text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity ${activeIndex === product.images.length - 1 ? "hidden" : ""}`}
                    data-testid="button-carousel-next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                    {product.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => scrollToImage(i)}
                        className={`w-2 h-2 transition-all ${activeIndex === i ? "bg-accent-blue w-6" : "bg-white/40 hover:bg-white/60"}`}
                        data-testid={`button-dot-${i}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {product.images.length > 1 && (
              <div
                ref={thumbnailRef}
                className="flex gap-2 mt-4 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                data-testid="carousel-thumbnails"
              >
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToImage(i)}
                    className={`flex-shrink-0 w-20 h-20 snap-start bg-muted overflow-hidden border-2 transition-colors ${
                      activeIndex === i ? "border-accent-blue" : "border-border/50 hover:border-border"
                    }`}
                    data-testid={`button-thumbnail-${i}`}
                  >
                    <img src={img} alt={`${product?.name || "Product"} — view ${i + 1}`} className="w-full h-full object-cover" draggable={false} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col"
          >
            <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-3">
              {product.category}
            </p>
            <h1 className="font-display text-3xl tracking-luxury uppercase mb-2" data-testid="text-product-name">
              {product.name}
            </h1>
            <p className="text-2xl font-mono mb-8" data-testid="text-product-price">
              ${Number(product.price).toFixed(0)}
            </p>

            <p className="text-muted-foreground text-sm leading-relaxed mb-10" data-testid="text-product-description">
              {product.description}
            </p>

            <div className="mb-8">
              <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Size</p>
              <div className="flex flex-wrap gap-3">
                {sortSizes(product.stock.map(s => s.size)).map((size) => {
                  const stockQty = getStockForSize(size);
                  const outOfStock = stockQty === 0;
                  return (
                    <button
                      key={size}
                      disabled={outOfStock}
                      onClick={() => setSelectedSize(size)}
                      className={`w-14 h-14 border-2 text-sm font-mono tracking-wide transition-all ${
                        selectedSize === size
                          ? "border-accent-blue bg-accent-blue text-white"
                          : outOfStock
                          ? "border-border/30 text-muted-foreground/30 cursor-not-allowed line-through"
                          : "border-border text-foreground hover:border-accent-blue/50"
                      }`}
                      data-testid={`button-size-${size}`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
              {selectedSize && (
                <p className="text-muted-foreground text-xs font-mono mt-3">
                  {getStockForSize(selectedSize)} in stock
                </p>
              )}
            </div>

            <div className="mb-10">
              <p className="text-xs tracking-luxury uppercase mb-4 font-bold text-accent-blue">Quantity</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 border-2 border-border flex items-center justify-center hover:border-accent-blue/50 transition-colors"
                  data-testid="button-qty-minus"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-mono w-8 text-center" data-testid="text-quantity">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 border-2 border-border flex items-center justify-center hover:border-accent-blue/50 transition-colors"
                  data-testid="button-qty-plus"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isSoldOut(product) ? (
              <Button
                data-testid="button-add-to-cart"
                disabled
                className="w-full h-14 text-xs tracking-luxury uppercase border-2 border-white/20 bg-black text-white cursor-not-allowed opacity-100"
              >
                <span className="tracking-[0.3em] font-heading">SOLD OUT</span>
              </Button>
            ) : (
              <Button
                data-testid="button-add-to-cart"
                onClick={handleAddToCart}
                className="w-full h-14 text-xs tracking-luxury uppercase btn-liquid no-default-hover-elevate no-default-active-elevate border-2 border-accent-blue bg-accent-blue text-white hover:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-shadow"
              >
                Add to Cart — ${(Number(product.price) * quantity).toFixed(0)}
              </Button>
            )}

            <div className="mt-10 pt-10 border-t-2 border-border/50 space-y-4">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-mono tracking-wide uppercase">Material</span>
                <span className="font-mono text-accent-blue">Premium Cotton Blend</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-mono tracking-wide uppercase">Fit</span>
                <span className="font-mono text-accent-blue">Relaxed / Oversized</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-mono tracking-wide uppercase">Care</span>
                <span className="font-mono text-accent-blue">Cold Wash, Hang Dry</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
