import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitText, FadeInSection } from "@/components/split-text";
import { Watermark } from "@/components/watermark";
import type { ProductWithStock, Category } from "@shared/schema";
import { useSEO } from "@/hooks/use-seo";

function isSoldOut(product: ProductWithStock): boolean {
  if (!product.stock || product.stock.length === 0) return true;
  return product.stock.reduce((sum, s) => sum + s.quantity, 0) === 0;
}

export default function Shop() {
  useSEO({
    title: "Shop | Resilient Official",
    description:
      "Browse the full Resilient Official collection. Premium streetwear including graphic tees, hoodies, and jackets — limited drops, built to last.",
    keywords:
      "shop resilient official, buy streetwear, premium hoodies, graphic tees, limited streetwear drops, resilient clothing store",
  });

  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const activeCategory = params.get("category") || "all";

  const { data: products, isLoading } = useQuery<ProductWithStock[]>({
    queryKey: ["/api/products"],
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const categorySlugs = ["all", ...(categories?.map((c) => c.slug) || [])];
  const categoryNames: Record<string, string> = { all: "All" };
  categories?.forEach((c) => { categoryNames[c.slug] = c.name; });

  const filtered = products?.filter((p) => {
    if (activeCategory === "all") return true;
    return p.category === activeCategory;
  }) || [];

  return (
    <div className="relative min-h-screen bg-background" data-testid="page-shop">
      <Watermark />
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24">
        <FadeInSection>
          <p className="text-muted-foreground text-xs font-mono tracking-luxury uppercase mb-3">
            Collection
          </p>
          <h1 className="font-display text-4xl tracking-luxury uppercase mb-12">
            <SplitText text="SHOP ALL" />
          </h1>
        </FadeInSection>

        <div className="flex gap-6 mb-12 overflow-x-auto pb-2">
          {categorySlugs.map((cat) => (
            <Link
              key={cat}
              href={cat === "all" ? "/shop" : `/shop?category=${cat}`}
              data-testid={`filter-category-${cat}`}
            >
              <button
                className={`text-xs tracking-luxury uppercase whitespace-nowrap pb-2 border-b-2 transition-all duration-300 ${
                  activeCategory === cat
                    ? "border-accent-blue text-accent-blue"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {categoryNames[cat] || cat}
              </button>
            </Link>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] mb-4" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground text-sm">No products in this category yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filtered.map((product, i) => {
              const soldOut = isSoldOut(product);
              return (
                <FadeInSection key={product.id} delay={i * 0.05}>
                  <Link href={`/product/${product.id}`}>
                    <div className="group cursor-pointer" data-testid={`card-product-${product.id}`}>
                      <div className="aspect-[2/3] bg-muted mb-4 overflow-hidden relative border-2 border-border/50 group-hover:border-accent-blue/50 transition-colors duration-300">
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-105 ${soldOut ? "grayscale-[80%] opacity-60" : ""}`}
                        />
                        {soldOut && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-red-700 border-2 border-red-500 px-6 py-2 -rotate-12 shadow-[0_0_40px_rgba(185,28,28,0.5)]" data-testid={`badge-sold-out-${product.id}`}>
                              <span className="text-white text-sm font-heading tracking-[0.3em] uppercase">
                                SOLD OUT
                              </span>
                            </div>
                          </div>
                        )}
                        {!soldOut && (
                          <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                            <div
                              className="bg-accent-blue text-white text-center py-3 text-xs tracking-luxury uppercase font-bold"
                              data-testid={`button-quick-add-${product.id}`}
                              onClick={(e) => { e.stopPropagation(); }}
                            >
                              Quick Add
                            </div>
                          </div>
                        )}
                      </div>
                      <h3 className={`text-sm font-bold tracking-wide uppercase ${soldOut ? "text-muted-foreground" : ""}`}>{product.name}</h3>
                      <p className="text-muted-foreground text-sm mt-1 font-mono">
                        ${Number(product.price).toFixed(0)}
                      </p>
                    </div>
                  </Link>
                </FadeInSection>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
