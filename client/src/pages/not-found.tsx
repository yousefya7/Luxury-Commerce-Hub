import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

export default function NotFound() {
  useSEO({
    title: "Page Not Found | Resilient Official",
    description: "The page you're looking for doesn't exist. Head back to Resilient Official and explore our premium streetwear collection.",
  });
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" data-testid="page-not-found">
      <div className="text-center max-w-md">
        <p className="text-accent-blue text-xs font-mono tracking-luxury uppercase mb-4">
          Error 404
        </p>
        <h1 className="font-display text-5xl tracking-luxury uppercase mb-4">
          Not Found
        </h1>
        <p className="text-muted-foreground text-sm font-mono mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase hover:border-accent-blue transition-colors"
          >
            Back to Home
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
