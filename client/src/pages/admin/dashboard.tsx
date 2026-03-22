import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Package, Users, ShoppingCart, AlertTriangle,
  Download, DollarSign, Plus, Pencil, Trash2, X, Eye, EyeOff, Save, Upload, Loader2,
  CheckSquare, Square, Layers, Shield, Lock, Settings, GripVertical, Mail, Search, Phone, MapPin, Receipt,
  Truck, ChevronDown, XCircle, RefreshCw, Zap, Copy, TriangleAlert
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import type { Product, Stock, Customer, Order, Category, CustomerWithOrders } from "@shared/schema";

type AdminData = {
  products: (Product & { stock: Stock[] })[];
  customers: CustomerWithOrders[];
  orders: Order[];
  stats: {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    lowStockAlerts: number;
  };
  categories: Category[];
};

import { PromoCodesTab } from "./PromoCodesTab";

type Tab = "overview" | "inventory" | "customers" | "orders" | "categories" | "marketing" | "promo" | "settings" | "contacts";

type ProductForm = {
  name: string;
  description: string;
  price: string;
  category: string;
  images: string[];
  featured: boolean;
  active: boolean;
  stockQuantities: Record<string, number>;
};

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  price: "",
  category: "tees",
  images: [""],
  featured: false,
  active: true,
  stockQuantities: Object.fromEntries(DEFAULT_SIZES.map((s) => [s, 0])),
};

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = ALL_SIZES.indexOf(a);
    const bi = ALL_SIZES.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function NeonBadge({ variant, children }: { variant: "green" | "amber" | "red" | "blue" | "muted"; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    green: "badge-neon-green",
    amber: "badge-neon-amber",
    red: "badge-neon-red",
    blue: "badge-neon-blue",
    muted: "bg-muted text-muted-foreground border border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${classes[variant]}`}>
      {children}
    </span>
  );
}

function RankInput({ productId, initialRank }: { productId: string; initialRank: number }) {
  const [value, setValue] = useState(String(initialRank));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = useCallback(async () => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0 || parsed === initialRank) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/display-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayOrder: parsed }),
      });
      if (!res.ok) throw new Error("Failed to save rank");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data"] });
      toast({ title: `Rank updated to ${parsed}` });
    } catch {
      toast({ title: "Failed to save rank", variant: "destructive" });
      setValue(String(initialRank));
    } finally {
      setSaving(false);
    }
  }, [value, initialRank, productId, toast]);

  return (
    <div className="hidden md:flex flex-col items-center justify-center w-10">
      <Input
        type="number"
        min={0}
        max={999}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        className="w-10 h-8 text-center text-xs border-2 font-mono text-accent-blue bg-transparent border-accent-blue/30 focus:border-accent-blue [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
        data-testid={`input-rank-${productId}`}
      />
      {saving && <Loader2 className="w-2.5 h-2.5 animate-spin text-accent-blue mt-0.5" />}
    </div>
  );
}

function SortableImageItem({
  id,
  url,
  index,
  isFirst,
  onRemove,
}: {
  id: string;
  url: string;
  index: number;
  isFirst: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style as React.CSSProperties}
      className="relative group"
      data-testid={`image-thumbnail-${index}`}
    >
      <div className={`w-24 h-24 border-2 overflow-hidden bg-muted ${isFirst ? "border-accent-blue" : "border-input"}`}>
        <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
      </div>
      {isFirst && (
        <div className="absolute bottom-0 left-0 right-0 bg-accent-blue text-white text-[9px] font-mono text-center py-0.5 tracking-luxury uppercase">
          Hero
        </div>
      )}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 bg-black/60 text-white w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
        data-testid={`button-drag-image-${index}`}
        title="Drag to reorder"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid={`button-remove-image-${index}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function ImageGalleryInput({
  images,
  onChange,
}: {
  images: string[];
  onChange: (newImages: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const data = await res.json();
      onChange([...images, data.url]);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleMultipleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = images.indexOf(String(active.id));
      const newIndex = images.indexOf(String(over.id));
      onChange(arrayMove(images, oldIndex, newIndex));
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <label
        className="flex items-center justify-center w-full h-12 border-2 border-dashed border-input cursor-pointer hover:border-accent-blue hover:bg-accent-blue/5 transition-all"
        data-testid="button-upload-gallery"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent-blue" />
        ) : (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Upload className="w-4 h-4" />
            Click to upload images or paste URLs below
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => handleMultipleFiles(e.target.files)}
        />
      </label>

      {images.length > 0 && (
        <div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-3">
                {images.map((url, i) => (
                  <SortableImageItem
                    key={url + i}
                    id={url}
                    url={url}
                    index={i}
                    isFirst={i === 0}
                    onRemove={() => removeImage(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <p className="text-[10px] text-muted-foreground font-mono mt-2 flex items-center gap-1">
            <GripVertical className="w-3 h-3" /> Drag thumbnails to reorder — first image is the Hero
          </p>
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">Or paste image URLs:</p>
        <Input
          data-testid="input-image-url-manual"
          placeholder="https://example.com/image.jpg"
          className="border-2 font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              const url = e.currentTarget.value.trim();
              onChange([...images, url]);
              e.currentTarget.value = "";
            }
          }}
        />
        <p className="text-xs text-muted-foreground mt-1">Press Enter to add URL</p>
      </div>
    </div>
  );
}

function ProductFormModal({
  form,
  setForm,
  onSubmit,
  onClose,
  isEditing,
  isPending,
  categories,
}: {
  form: ProductForm;
  setForm: (f: ProductForm) => void;
  onSubmit: () => void;
  onClose: () => void;
  isEditing: boolean;
  isPending: boolean;
  categories: Category[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative z-10 bg-background border-2 border-border/50 w-full max-w-4xl max-h-[75vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-product-form"
      >
        <div className="sticky top-0 bg-background border-b-2 border-border/50 p-6 flex justify-between items-center z-10">
          <h3 className="font-display text-lg tracking-luxury uppercase">
            {isEditing ? "Edit Product" : "Add Product"}
          </h3>
          <button onClick={onClose} data-testid="button-close-modal">
            <X className="w-5 h-5 text-muted-foreground hover:text-accent-blue transition-colors" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Name</label>
              <Input
                data-testid="input-product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="border-2"
                placeholder="Product name"
              />
            </div>
            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Description</label>
              <textarea
                data-testid="input-product-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono min-h-[80px] focus:outline-none focus:ring-1 focus:ring-accent-blue focus:border-accent-blue"
                placeholder="Product description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Price ($)</label>
                <Input
                  data-testid="input-product-price"
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="border-2 font-mono"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Category</label>
                <select
                  data-testid="select-product-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                >
                  {categories.length === 0 && <option value="">No categories</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Images</label>
              <ImageGalleryInput
                images={form.images}
                onChange={(imgs) => setForm({ ...form, images: imgs })}
              />
            </div>

            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-3 block">Stock Per Size</label>
              <div className="grid grid-cols-4 gap-3">
                {sortSizes(Object.keys(form.stockQuantities)).map((sz) => (
                  <div key={sz} className="relative">
                    <div className="flex items-center justify-center mb-1 gap-1">
                      <span className="text-xs font-mono text-center">{sz}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...form.stockQuantities };
                          delete updated[sz];
                          setForm({ ...form, stockQuantities: updated });
                        }}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                        data-testid={`button-remove-size-${sz}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <Input
                      data-testid={`input-stock-${sz}`}
                      type="number"
                      min={0}
                      value={form.stockQuantities[sz] || 0}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          stockQuantities: { ...form.stockQuantities, [sz]: parseInt(e.target.value) || 0 },
                        })
                      }
                      className="border-2 text-center font-mono"
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const activeSizes = Object.keys(form.stockQuantities);
                const availableSizes = ALL_SIZES.filter((s) => !activeSizes.includes(s));
                if (availableSizes.length === 0) return null;
                return (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {availableSizes.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setForm({ ...form, stockQuantities: { ...form.stockQuantities, [sz]: 0 } })}
                        className="text-[10px] font-mono tracking-luxury uppercase border-2 border-dashed border-border/50 px-2 py-1 hover:border-accent-blue hover:text-accent-blue transition-colors"
                        data-testid={`button-add-size-${sz}`}
                      >
                        + {sz}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                  data-testid="checkbox-featured"
                />
                <span className="text-xs font-mono tracking-luxury uppercase">Featured</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  data-testid="checkbox-active"
                />
                <span className="text-xs font-mono tracking-luxury uppercase">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-3 block">Preview</label>
            <div className="border-2 border-border/50 p-4 bg-card">
              <div className="aspect-[3/4] bg-muted overflow-hidden mb-4 relative border-2 border-border/30">
                {form.images[0] ? (
                  <img
                    src={form.images[0]}
                    alt={form.name || "Preview"}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    data-testid="img-product-preview"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs font-mono">
                    No image
                  </div>
                )}
              </div>
              <h3 className="text-sm font-bold tracking-wide uppercase">{form.name || "Product Name"}</h3>
              <p className="text-muted-foreground text-sm mt-1 font-mono">
                ${form.price ? Number(form.price).toFixed(0) : "0"}
              </p>
              <p className="text-muted-foreground text-xs font-mono mt-2 line-clamp-2">
                {form.description || "Description preview..."}
              </p>
              <div className="mt-2 flex gap-2">
                {form.featured && <NeonBadge variant="blue">Featured</NeonBadge>}
                {!form.active && <NeonBadge variant="red">Hidden</NeonBadge>}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-background border-t-2 border-border/50 p-6 flex justify-end gap-3">
          <Button
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase"
            onClick={onClose}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            className="text-xs tracking-luxury uppercase btn-liquid no-default-hover-elevate no-default-active-elevate border-2 border-accent-blue bg-accent-blue text-white"
            onClick={onSubmit}
            disabled={isPending || !form.name || !form.price}
            data-testid="button-save-product"
          >
            <Save className="w-4 h-4 mr-2" />
            {isPending ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type StockEdit = {
  size: string;
  action: string;
  value: string;
};

type MassEditForm = {
  category: string;
  active: string;
  featured: string;
  priceAction: string;
  priceValue: string;
  stockEdits: StockEdit[];
};

const EMPTY_MASS_EDIT: MassEditForm = {
  category: "",
  active: "",
  featured: "",
  priceAction: "",
  priceValue: "",
  stockEdits: [],
};

function MassEditModal({
  selectedCount,
  onSubmit,
  onClose,
  isPending,
  categories,
}: {
  selectedCount: number;
  onSubmit: (updates: any) => void;
  onClose: () => void;
  isPending: boolean;
  categories: Category[];
}) {
  const [form, setForm] = useState<MassEditForm>(EMPTY_MASS_EDIT);

  const handleApply = () => {
    const updates: any = {};
    if (form.category) updates.category = form.category;
    if (form.active !== "") updates.active = form.active === "true";
    if (form.featured !== "") updates.featured = form.featured === "true";
    if (form.priceAction && form.priceValue) {
      updates.priceAction = form.priceAction;
      updates.priceValue = form.priceValue;
    }
    const validStockEdits = form.stockEdits.filter((se) => se.size && se.action && se.value);
    if (validStockEdits.length > 0) {
      updates.stockEdits = validStockEdits;
    }
    if (Object.keys(updates).length === 0) return;
    onSubmit(updates);
  };

  const addStockEdit = () => {
    setForm({ ...form, stockEdits: [...form.stockEdits, { size: "", action: "set", value: "" }] });
  };

  const updateStockEdit = (index: number, field: keyof StockEdit, val: string) => {
    const edits = [...form.stockEdits];
    edits[index] = { ...edits[index], [field]: val };
    setForm({ ...form, stockEdits: edits });
  };

  const removeStockEdit = (index: number) => {
    setForm({ ...form, stockEdits: form.stockEdits.filter((_, i) => i !== index) });
  };

  const validStockEdits = form.stockEdits.filter((se) => se.size && se.action && se.value);
  const hasChanges = form.category || form.active !== "" || form.featured !== "" || (form.priceAction && form.priceValue) || validStockEdits.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative z-10 bg-background border-2 border-border/50 w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-mass-edit"
      >
        <div className="border-b-2 border-border/50 p-6 flex justify-between items-center">
          <div>
            <h3 className="font-display text-lg tracking-luxury uppercase">Mass Edit</h3>
            <p className="text-xs text-muted-foreground font-mono mt-1">{selectedCount} product{selectedCount > 1 ? "s" : ""} selected</p>
          </div>
          <button onClick={onClose} data-testid="button-close-mass-edit">
            <X className="w-5 h-5 text-muted-foreground hover:text-accent-blue transition-colors" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Change Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
              data-testid="select-mass-category"
            >
              <option value="">— No Change —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Adjust Price</label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.priceAction}
                onChange={(e) => setForm({ ...form, priceAction: e.target.value })}
                className="bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                data-testid="select-mass-price-action"
              >
                <option value="">— No Change —</option>
                <option value="increase_percent">Increase by %</option>
                <option value="decrease_percent">Decrease by %</option>
                <option value="increase_fixed">Increase by $</option>
                <option value="decrease_fixed">Decrease by $</option>
                <option value="set">Set to $</option>
              </select>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder={form.priceAction?.includes("percent") ? "e.g. 10" : "e.g. 5.00"}
                value={form.priceValue}
                onChange={(e) => setForm({ ...form, priceValue: e.target.value })}
                className="border-2 font-mono"
                disabled={!form.priceAction}
                data-testid="input-mass-price-value"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Visibility</label>
              <select
                value={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.value })}
                className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                data-testid="select-mass-visibility"
              >
                <option value="">— No Change —</option>
                <option value="true">Visible (Live)</option>
                <option value="false">Hidden</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Featured</label>
              <select
                value={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.value })}
                className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                data-testid="select-mass-featured"
              >
                <option value="">— No Change —</option>
                <option value="true">Featured</option>
                <option value="false">Not Featured</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Adjust Inventory</label>
              <button
                type="button"
                onClick={addStockEdit}
                className="text-[10px] text-accent-blue font-mono tracking-luxury uppercase"
                data-testid="button-add-stock-rule"
              >
                + Add Rule
              </button>
            </div>
            {form.stockEdits.length === 0 && (
              <p className="text-xs text-muted-foreground/60 font-mono">No stock changes. Click "+ Add Rule" to adjust inventory.</p>
            )}
            {form.stockEdits.map((se, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] gap-2 mb-2 items-center" data-testid={`stock-rule-${i}`}>
                <select
                  value={se.size}
                  onChange={(e) => updateStockEdit(i, "size", e.target.value)}
                  className="bg-transparent border-2 border-input px-2 py-1.5 text-xs font-mono h-8 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                  data-testid={`select-stock-size-${i}`}
                >
                  <option value="">Size...</option>
                  <option value="ALL">All Sizes</option>
                  {ALL_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={se.action}
                  onChange={(e) => updateStockEdit(i, "action", e.target.value)}
                  className="bg-transparent border-2 border-input px-2 py-1.5 text-xs font-mono h-8 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                  data-testid={`select-stock-action-${i}`}
                >
                  <option value="set">Set to</option>
                  <option value="increase">Add</option>
                  <option value="decrease">Remove</option>
                </select>
                <Input
                  type="number"
                  min={0}
                  value={se.value}
                  onChange={(e) => updateStockEdit(i, "value", e.target.value)}
                  className="border-2 text-center font-mono h-8 text-xs"
                  placeholder="Qty"
                  data-testid={`input-stock-value-${i}`}
                />
                <button
                  type="button"
                  onClick={() => removeStockEdit(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  data-testid={`button-remove-stock-rule-${i}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t-2 border-border/50 p-6 flex justify-end gap-3">
          <Button
            variant="outline"
            className="border-2 text-xs tracking-luxury uppercase"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="text-xs tracking-luxury uppercase btn-liquid no-default-hover-elevate no-default-active-elevate border-2 border-accent-blue bg-accent-blue text-white"
            onClick={handleApply}
            disabled={isPending || !hasChanges}
            data-testid="button-apply-mass-edit"
          >
            <Save className="w-4 h-4 mr-2" />
            {isPending ? "Applying..." : `Apply to ${selectedCount} Product${selectedCount > 1 ? "s" : ""}`}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [editingStock, setEditingStock] = useState<Record<string, Record<string, number>>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactToDelete, setContactToDelete] = useState<CustomerWithOrders | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ name: "", email: "", phone: "", street: "", city: "", state: "", zip: "" });
  const [contactToEmail, setContactToEmail] = useState<CustomerWithOrders | null>(null);
  const [contactEmailSubject, setContactEmailSubject] = useState("");
  const [contactEmailMessage, setContactEmailMessage] = useState("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AdminData>({
    queryKey: ["/api/admin/dashboard"],
  });

  const createMutation = useMutation({
    mutationFn: async (productData: any) => {
      const res = await apiRequest("POST", "/api/admin/products", productData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast({ title: "Product Created", description: "New product added to inventory." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create product.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast({ title: "Product Updated", description: "Changes saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/products/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product Archived", description: "Product hidden from storefront." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete.", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/customers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setContactToDelete(null);
      toast({ title: "Contact Deleted", description: "Contact and their orders have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete contact.", variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: typeof addContactForm) => {
      const res = await apiRequest("POST", "/api/admin/customers", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setShowAddContact(false);
      setAddContactForm({ name: "", email: "", phone: "", street: "", city: "", state: "", zip: "" });
      toast({ title: "Contact Added", description: "New contact has been saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create contact.", variant: "destructive" });
    },
  });

  const sendContactEmailMutation = useMutation({
    mutationFn: async ({ to, subject, message }: { to: string; subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/admin/contact-email", { to, subject, message });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send email");
      }
      return res.json();
    },
    onSuccess: () => {
      setContactToEmail(null);
      setContactEmailSubject("");
      setContactEmailMessage("");
      toast({ title: "Email Sent", description: "Your message was sent successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stockMutation = useMutation({
    mutationFn: async ({ productId, stockData }: { productId: string; stockData: Record<string, number> }) => {
      const res = await apiRequest("PATCH", `/api/admin/stock/${productId}`, stockData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditingStock({});
      toast({ title: "Stock Updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update stock.", variant: "destructive" });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async ({ productIds, updates }: { productIds: string[]; updates: any }) => {
      const res = await apiRequest("PATCH", "/api/admin/products/batch", { productIds, updates });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowMassEdit(false);
      setSelectedIds(new Set());
      toast({ title: "Mass Update Complete", description: `${data.updated} product${data.updated > 1 ? "s" : ""} updated successfully.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Batch update failed.", variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/products/sync-all", {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Sync failed"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      const failed = data.failed || 0;
      toast({
        title: `Synced ${data.synced} product${data.synced !== 1 ? "s" : ""} to Stripe`,
        description: failed > 0 ? `${failed} product${failed > 1 ? "s" : ""} failed — check server logs` : undefined,
        variant: failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err: any) => {
      toast({ title: "Stripe Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", `/api/admin/products/${productId}/sync`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Sync failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Synced to Stripe" });
    },
    onError: (err: any) => {
      toast({ title: "Stripe Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.products) return;
    if (selectedIds.size === data.products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.products.map((p) => p.id)));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "inventory", label: "Inventory" },
    { key: "categories", label: "Categories" },
    { key: "customers", label: "Customers" },
    { key: "orders", label: "Orders" },
    { key: "contacts", label: "Inquiries" },
    { key: "marketing", label: "Marketing" },
    { key: "promo", label: "Promo Codes" },
    { key: "settings", label: "Settings" },
  ];

  const handleExportCSV = () => {
    if (!data?.customers) return;
    const headers = "Name,Email,Phone,Address,Orders,Total Spent,Last Purchase\n";
    const rows = data.customers
      .map((c) => {
        const latestOrder = c.orders?.[0];
        const addr = (c.shippingAddress as any) || (latestOrder?.shippingAddress as any);
        const address = addr ? `${addr.street || ""} ${addr.city || ""} ${addr.zip || ""}`.trim() : "";
        const orderCount = c.orders?.length || 0;
        return `"${c.name}","${c.email}","${c.phone || ""}","${address}","${orderCount}","${c.totalSpent}","${c.lastPurchase || ""}"`;
      })
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resilient-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEdit = (product: Product & { stock: Stock[] }) => {
    const stockMap: Record<string, number> = {};
    product.stock.forEach((s) => { stockMap[s.size] = s.quantity; });
    setForm({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      images: product.images.length > 0 ? product.images : [""],
      featured: product.featured || false,
      active: product.active !== false,
      stockQuantities: stockMap,
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    const filteredImages = form.images.filter((img) => img.trim() !== "");
    if (filteredImages.length === 0) {
      toast({ title: "Error", description: "At least one image URL is required.", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name,
      description: form.description,
      price: form.price,
      category: form.category,
      images: filteredImages,
      featured: form.featured,
      active: form.active,
      stockQuantities: form.stockQuantities,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 pt-32">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats || { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, lowStockAlerts: 0 };

  return (
    <div className="min-h-screen bg-background" data-testid="page-admin-dashboard">
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-32 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-accent-blue/70 text-xs font-mono tracking-luxury uppercase mb-2">
              Admin
            </p>
            <h1 className="font-display text-3xl tracking-luxury uppercase">
              Dashboard
            </h1>
          </div>
        </div>

        <div className="flex gap-5 mb-10 border-b-2 border-border/50 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 text-xs font-mono tracking-luxury uppercase pb-3 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-2 border-border/50 hover:border-accent-blue/30 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <DollarSign className="w-4 h-4 text-accent-blue" />
                    <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Revenue</span>
                  </div>
                  <p className="text-2xl font-mono" data-testid="text-stat-revenue">
                    ${stats.totalRevenue.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 hover:border-accent-blue/30 transition-colors cursor-pointer" onClick={() => setTab("orders")} data-testid="card-stat-orders">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <ShoppingCart className="w-4 h-4 text-accent-blue" />
                    <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Orders</span>
                  </div>
                  <p className="text-2xl font-mono" data-testid="text-stat-orders">
                    {stats.totalOrders}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 hover:border-accent-blue/30 transition-colors cursor-pointer" onClick={() => setTab("customers")} data-testid="card-stat-customers">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="w-4 h-4 text-accent-blue" />
                    <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Customers</span>
                  </div>
                  <p className="text-2xl font-mono" data-testid="text-stat-customers">
                    {stats.totalCustomers}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 hover:border-accent-blue/30 transition-colors cursor-pointer" onClick={() => setTab("inventory")} data-testid="card-stat-low-stock">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle className="w-4 h-4 text-[hsl(40,100%,50%)]" />
                    <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Low Stock</span>
                  </div>
                  <p className="text-2xl font-mono" data-testid="text-stat-low-stock">
                    {stats.lowStockAlerts}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-4">
                Recent Orders
              </h3>
              <div className="space-y-2">
                {data?.orders?.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-4 py-3 border-b-2 border-border/30"
                    data-testid={`order-row-${order.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{order.id.slice(0, 8)}
                      </span>
                      <NeonBadge variant={statusVariant(order.status)}>
                        {order.status}
                      </NeonBadge>
                    </div>
                    <span className="text-sm font-mono">${Number(order.total).toFixed(0)}</span>
                  </div>
                ))}
                {(!data?.orders || data.orders.length === 0) && (
                  <p className="text-muted-foreground text-sm font-mono py-4">No orders yet.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {tab === "inventory" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center mb-6">
              <p className="text-sm text-muted-foreground font-mono">
                {data?.products?.length || 0} products
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="text-xs tracking-luxury uppercase border-2 border-border/50"
                  onClick={() => syncAllMutation.mutate()}
                  disabled={syncAllMutation.isPending}
                  data-testid="button-sync-all-stripe"
                >
                  {syncAllMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Sync All to Stripe
                </Button>
                <Button
                  className="text-xs tracking-luxury uppercase btn-liquid no-default-hover-elevate no-default-active-elevate border-2 border-accent-blue bg-accent-blue text-white"
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setEditingId(null);
                    setShowForm(true);
                  }}
                  data-testid="button-add-product"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </div>
            </div>

            {(() => {
              const products = data?.products || [];
              const sorted = [...products].sort((a, b) => {
                const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (db !== da) return db - da;
                return a.name.localeCompare(b.name);
              });
              const grouped: Record<string, typeof products> = {};
              const displayNames: Record<string, string> = {};
              sorted.forEach((p) => {
                const raw = (p.category || "uncategorized").trim();
                const key = raw.toLowerCase();
                if (!grouped[key]) {
                  grouped[key] = [];
                  displayNames[key] = raw.charAt(0).toUpperCase() + raw.slice(1);
                }
                grouped[key].push(p);
              });
              const sortedCategories = Object.keys(grouped).sort();

              return (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={toggleSelectAll}
                      className="text-muted-foreground hover:text-accent-blue transition-colors"
                      data-testid="checkbox-select-all"
                    >
                      {products.length > 0 && selectedIds.size === products.length ? (
                        <CheckSquare className="w-4 h-4 text-accent-blue" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">
                      Select All
                    </span>
                  </div>

                  {sortedCategories.map((category) => {
                    const catProducts = grouped[category];
                    if (catProducts.length === 0) return null;
                    const catCount = catProducts.length;
                    const catTotalStock = catProducts.reduce((sum, p) => sum + p.stock.reduce((s, st) => s + st.quantity, 0), 0);

                    return (
                      <div
                        key={category}
                        className="border-2 border-border/30 mb-6 bg-[hsl(0_0%_5%)]"
                        data-testid={`category-section-${category}`}
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border/30 bg-[hsl(0_0%_6%)]">
                          <div className="flex items-center gap-3">
                            <h3 className="font-display text-sm tracking-luxury uppercase">{displayNames[category]}</h3>
                            <span className="text-[10px] font-mono text-muted-foreground">{catCount} product{catCount > 1 ? "s" : ""}</span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{catTotalStock} total units</span>
                        </div>

                        <div className="grid grid-cols-[auto_auto_minmax(0,2fr)_auto_auto_auto] gap-4 text-[9px] font-mono tracking-luxury uppercase text-muted-foreground/60 px-4 py-2 border-b border-border/20 hidden md:grid items-center">
                          <span className="w-4" />
                          <span className="w-10 text-center text-accent-blue">Rank</span>
                          <span>Product</span>
                          <span className="text-center min-w-[160px]">Stock by Size</span>
                          <span className="text-center">Status</span>
                          <span className="text-right">Actions</span>
                        </div>

                        {catProducts.map((product) => {
                          const stockMap: Record<string, number> = {};
                          product.stock.forEach((s) => { stockMap[s.size] = s.quantity; });
                          const productSizes = sortSizes(Object.keys(stockMap));
                          const hasLowStock = productSizes.some((sz) => (stockMap[sz] || 0) > 0 && (stockMap[sz] || 0) < 5);
                          const allOut = productSizes.every((sz) => (stockMap[sz] || 0) === 0);
                          const isEditingStock = !!editingStock[product.id];

                          return (
                            <div
                              key={product.id}
                              className={`border-b border-border/15 last:border-b-0 ${!product.active ? "opacity-50" : ""} ${selectedIds.has(product.id) ? "bg-accent-blue/5" : ""}`}
                              data-testid={`inventory-row-${product.id}`}
                            >
                              {/* Main row — flex on mobile, grid on desktop */}
                              <div className="flex items-center gap-3 py-3 px-3 md:grid md:grid-cols-[auto_auto_minmax(0,2fr)_auto_auto_auto] md:gap-4 md:px-4">
                                {/* Checkbox — desktop only */}
                                <button
                                  onClick={() => toggleSelect(product.id)}
                                  className="text-muted-foreground hover:text-accent-blue transition-colors hidden md:block flex-shrink-0"
                                  data-testid={`checkbox-select-${product.id}`}
                                >
                                  {selectedIds.has(product.id) ? (
                                    <CheckSquare className="w-4 h-4 text-accent-blue" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>

                                {/* Rank — desktop only */}
                                <RankInput productId={product.id} initialRank={product.displayOrder ?? 0} />

                                {/* Product info — flex-1 on mobile to fill space */}
                                <div className="flex items-center gap-3 flex-1 min-w-0 md:flex-none">
                                  <div className="w-10 h-12 bg-muted overflow-hidden flex-shrink-0 border-2 border-border/30">
                                    <img
                                      src={product.images[0]}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold uppercase leading-tight">{product.name}</p>
                                    <p className="text-muted-foreground text-xs font-mono">${Number(product.price).toFixed(0)}</p>
                                    {/* Stripe sync status */}
                                    {product.stripeSyncError ? (
                                      <span
                                        className="flex items-center gap-1 text-[9px] font-mono text-red-400 mt-0.5 cursor-help"
                                        title={product.stripeSyncError}
                                        data-testid={`text-stripe-error-${product.id}`}
                                      >
                                        <TriangleAlert className="w-2.5 h-2.5 flex-shrink-0" />
                                        Sync error
                                      </span>
                                    ) : product.stripeProductId ? (
                                      <button
                                        className="flex items-center gap-1 text-[9px] font-mono text-accent-blue/70 hover:text-accent-blue transition-colors mt-0.5 group"
                                        onClick={() => { navigator.clipboard.writeText(product.stripeProductId!); toast({ title: "Copied Stripe ID" }); }}
                                        title={`${product.stripeProductId}${product.stripeLastSyncedAt ? "\nLast synced: " + new Date(product.stripeLastSyncedAt).toLocaleString() : ""}`}
                                        data-testid={`text-stripe-id-${product.id}`}
                                      >
                                        <Zap className="w-2.5 h-2.5" />
                                        {product.stripeProductId.slice(0, 14)}…
                                        <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </button>
                                    ) : (
                                      <span className="flex items-center gap-1 text-[9px] font-mono text-amber-500/80 mt-0.5" data-testid={`text-stripe-unsynced-${product.id}`}>
                                        <TriangleAlert className="w-2.5 h-2.5" />
                                        Not synced
                                      </span>
                                    )}
                                    {/* Status badge — mobile only, shown inline */}
                                    <div className="md:hidden mt-1">
                                      {!product.active ? (
                                        <NeonBadge variant="muted"><EyeOff className="w-3 h-3 mr-1" /> Hidden</NeonBadge>
                                      ) : allOut ? (
                                        <NeonBadge variant="red">Out</NeonBadge>
                                      ) : hasLowStock ? (
                                        <NeonBadge variant="amber">Low</NeonBadge>
                                      ) : (
                                        <NeonBadge variant="green"><Eye className="w-3 h-3 mr-1" /> Live</NeonBadge>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Stock by size — desktop only */}
                                <div className="hidden md:flex flex-wrap gap-1.5 min-w-[160px] justify-center">
                                  {isEditingStock ? (
                                    productSizes.map((sz) => (
                                      <div key={sz} className="flex flex-col items-center gap-0.5">
                                        <span className="text-[9px] font-mono text-muted-foreground">{sz}</span>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={editingStock[product.id]?.[sz] ?? stockMap[sz] ?? 0}
                                          onChange={(e) =>
                                            setEditingStock({
                                              ...editingStock,
                                              [product.id]: {
                                                ...editingStock[product.id],
                                                [sz]: parseInt(e.target.value) || 0,
                                              },
                                            })
                                          }
                                          className="text-center w-14 h-8 text-xs border-2 font-mono text-white bg-[hsl(0_0%_8%)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          data-testid={`input-inline-stock-${product.id}-${sz}`}
                                        />
                                      </div>
                                    ))
                                  ) : (
                                    productSizes.map((sz) => (
                                      <span
                                        key={sz}
                                        className={`text-[10px] font-mono px-1.5 py-0.5 border border-border/30 ${
                                          (stockMap[sz] || 0) === 0
                                            ? "text-[hsl(0,100%,55%)] border-[hsl(0,100%,55%)]/30"
                                            : (stockMap[sz] || 0) < 5
                                            ? "text-[hsl(40,100%,50%)] border-[hsl(40,100%,50%)]/30"
                                            : "text-foreground"
                                        }`}
                                        data-testid={`stock-badge-${product.id}-${sz}`}
                                      >
                                        {sz}:{stockMap[sz] || 0}
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Status badge — desktop only */}
                                <div className="hidden md:flex justify-center">
                                  {!product.active ? (
                                    <NeonBadge variant="muted"><EyeOff className="w-3 h-3 mr-1" /> Hidden</NeonBadge>
                                  ) : allOut ? (
                                    <NeonBadge variant="red">Out</NeonBadge>
                                  ) : hasLowStock ? (
                                    <NeonBadge variant="amber">Low</NeonBadge>
                                  ) : (
                                    <NeonBadge variant="green"><Eye className="w-3 h-3 mr-1" /> Live</NeonBadge>
                                  )}
                                </div>

                                {/* Action buttons — desktop */}
                                <div className="hidden md:flex justify-end gap-2">
                                  {isEditingStock ? (
                                    <>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2"
                                        onClick={() => { const stockData = editingStock[product.id]; stockMutation.mutate({ productId: product.id, stockData }); }}
                                        disabled={stockMutation.isPending} data-testid={`button-save-stock-${product.id}`}>
                                        <Save className="w-3 h-3 mr-1" /> Save
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2"
                                        onClick={() => { const rest = { ...editingStock }; delete rest[product.id]; setEditingStock(rest); }}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2"
                                        onClick={() => syncProductMutation.mutate(product.id)}
                                        disabled={syncProductMutation.isPending}
                                        title="Sync to Stripe"
                                        data-testid={`button-sync-stripe-${product.id}`}>
                                        {syncProductMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2"
                                        onClick={() => setEditingStock({ ...editingStock, [product.id]: { ...stockMap } })}
                                        data-testid={`button-edit-stock-${product.id}`}>
                                        <Package className="w-3 h-3 mr-1" /> Stock
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2"
                                        onClick={() => openEdit(product)} data-testid={`button-edit-product-${product.id}`}>
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-2 hover:bg-destructive hover:text-white hover:border-destructive"
                                        onClick={() => { if (confirm(`Archive "${product.name}"? It will be hidden from the storefront.`)) { deleteMutation.mutate(product.id); } }}
                                        data-testid={`button-delete-product-${product.id}`}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>

                                {/* Action buttons — mobile (44px touch targets) */}
                                <div className="md:hidden flex gap-1.5 flex-shrink-0">
                                  {isEditingStock ? (
                                    <>
                                      <Button size="sm" className="w-11 h-11 p-0 border-2 border-accent-blue bg-accent-blue text-white flex items-center justify-center"
                                        onClick={() => { const stockData = editingStock[product.id]; stockMutation.mutate({ productId: product.id, stockData }); }}
                                        disabled={stockMutation.isPending} data-testid={`button-save-stock-${product.id}`}>
                                        <Save className="w-4 h-4" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="w-11 h-11 p-0 border-2 flex items-center justify-center"
                                        onClick={() => { const rest = { ...editingStock }; delete rest[product.id]; setEditingStock(rest); }}>
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="outline" className="w-11 h-11 p-0 border-2 flex flex-col items-center justify-center gap-0.5"
                                        onClick={() => setEditingStock({ ...editingStock, [product.id]: { ...stockMap } })}
                                        data-testid={`button-edit-stock-${product.id}`}>
                                        <Package className="w-4 h-4" />
                                        <span className="text-[8px] font-mono leading-none">STK</span>
                                      </Button>
                                      <Button size="sm" variant="outline" className="w-11 h-11 p-0 border-2 flex items-center justify-center"
                                        onClick={() => openEdit(product)} data-testid={`button-edit-product-${product.id}`}>
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="w-11 h-11 p-0 border-2 flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive"
                                        onClick={() => { if (confirm(`Archive "${product.name}"? It will be hidden from the storefront.`)) { deleteMutation.mutate(product.id); } }}
                                        data-testid={`button-delete-product-${product.id}`}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Mobile stock editing panel — shown below the row */}
                              {isEditingStock && (
                                <div className="md:hidden px-3 pb-4 pt-1">
                                  <p className="text-[9px] font-mono tracking-luxury uppercase text-accent-blue mb-2">Edit Stock by Size</p>
                                  <div className="grid grid-cols-4 gap-2">
                                    {productSizes.map((sz) => (
                                      <div key={sz} className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] font-mono text-muted-foreground">{sz}</span>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={editingStock[product.id]?.[sz] ?? stockMap[sz] ?? 0}
                                          onChange={(e) =>
                                            setEditingStock({
                                              ...editingStock,
                                              [product.id]: {
                                                ...editingStock[product.id],
                                                [sz]: parseInt(e.target.value) || 0,
                                              },
                                            })
                                          }
                                          className="text-center w-full h-10 text-xs border-2 font-mono text-white bg-[hsl(0_0%_8%)] border-accent-blue/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          data-testid={`input-inline-stock-${product.id}-${sz}`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              );
            })()}

            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border-2 border-accent-blue px-6 py-3 flex items-center gap-4 shadow-[0_0_20px_hsl(var(--accent-blue)/0.3)]"
                  data-testid="floating-bulk-bar"
                >
                  <span className="text-xs font-mono tracking-luxury uppercase text-accent-blue">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    size="sm"
                    className="text-[10px] tracking-luxury uppercase h-7 border-2 border-accent-blue bg-accent-blue text-white btn-liquid no-default-hover-elevate no-default-active-elevate"
                    onClick={() => setShowMassEdit(true)}
                    data-testid="button-edit-selected"
                  >
                    <Layers className="w-3 h-3 mr-1" /> Edit Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] tracking-luxury uppercase h-7 border-2"
                    onClick={() => setSelectedIds(new Set())}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showMassEdit && (
                <MassEditModal
                  selectedCount={selectedIds.size}
                  onSubmit={(updates) => batchMutation.mutate({ productIds: Array.from(selectedIds), updates })}
                  onClose={() => setShowMassEdit(false)}
                  isPending={batchMutation.isPending}
                  categories={data?.categories || []}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {tab === "customers" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Header row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
              <p className="text-sm text-muted-foreground font-mono">
                {data?.customers?.length || 0} contacts
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-2 text-xs tracking-luxury uppercase"
                  onClick={handleExportCSV}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  className="border-2 text-xs tracking-luxury uppercase bg-accent-blue hover:bg-accent-blue/80 text-white"
                  onClick={() => setShowAddContact((v) => !v)}
                  data-testid="button-add-contact"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </div>

            {/* Add Contact Form */}
            <AnimatePresence>
              {showAddContact && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-2 border-accent-blue/40 p-5 mb-6 space-y-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-mono tracking-luxury uppercase text-accent-blue">New Contact — In-Person</p>
                      <button onClick={() => setShowAddContact(false)} className="text-muted-foreground hover:text-foreground" data-testid="button-close-add-contact">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Name *</label>
                        <Input
                          placeholder="Full name"
                          value={addContactForm.name}
                          onChange={(e) => setAddContactForm((f) => ({ ...f, name: e.target.value }))}
                          className="border-2 font-mono text-sm"
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Email *</label>
                        <Input
                          placeholder="email@example.com"
                          type="email"
                          value={addContactForm.email}
                          onChange={(e) => setAddContactForm((f) => ({ ...f, email: e.target.value }))}
                          className="border-2 font-mono text-sm"
                          data-testid="input-contact-email"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Phone</label>
                        <Input
                          placeholder="+1 (555) 000-0000"
                          type="tel"
                          value={addContactForm.phone}
                          onChange={(e) => setAddContactForm((f) => ({ ...f, phone: e.target.value }))}
                          className="border-2 font-mono text-sm"
                          data-testid="input-contact-phone"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">Street</label>
                        <Input
                          placeholder="123 Main St"
                          value={addContactForm.street}
                          onChange={(e) => setAddContactForm((f) => ({ ...f, street: e.target.value }))}
                          className="border-2 font-mono text-sm"
                          data-testid="input-contact-street"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">City</label>
                        <Input
                          placeholder="Los Angeles"
                          value={addContactForm.city}
                          onChange={(e) => setAddContactForm((f) => ({ ...f, city: e.target.value }))}
                          className="border-2 font-mono text-sm"
                          data-testid="input-contact-city"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">State</label>
                          <Input
                            placeholder="CA"
                            value={addContactForm.state}
                            onChange={(e) => setAddContactForm((f) => ({ ...f, state: e.target.value }))}
                            className="border-2 font-mono text-sm"
                            data-testid="input-contact-state"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">ZIP</label>
                          <Input
                            placeholder="90001"
                            value={addContactForm.zip}
                            onChange={(e) => setAddContactForm((f) => ({ ...f, zip: e.target.value }))}
                            className="border-2 font-mono text-sm"
                            data-testid="input-contact-zip"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <Button
                        className="border-2 text-xs tracking-luxury uppercase bg-accent-blue hover:bg-accent-blue/80 text-white"
                        onClick={() => createContactMutation.mutate(addContactForm)}
                        disabled={!addContactForm.name.trim() || !addContactForm.email.trim() || createContactMutation.isPending}
                        data-testid="button-save-contact"
                      >
                        {createContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Contact
                      </Button>
                      <Button
                        variant="outline"
                        className="border-2 text-xs tracking-luxury uppercase"
                        onClick={() => { setShowAddContact(false); setAddContactForm({ name: "", email: "", phone: "", street: "", city: "", state: "", zip: "" }); }}
                        data-testid="button-cancel-add-contact"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search bar */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or order #..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="pl-9 border-2 font-mono text-sm"
                data-testid="input-contact-search"
              />
              {contactSearch && (
                <button
                  onClick={() => setContactSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Desktop table header */}
            <div className="hidden md:grid grid-cols-12 gap-3 text-xs font-mono tracking-luxury uppercase text-muted-foreground pb-2 border-b-2 border-border/50">
              <span className="col-span-2">Name</span>
              <span className="col-span-3">Email</span>
              <span className="col-span-1">Phone</span>
              <span className="col-span-3">Address</span>
              <span className="col-span-1 text-center">Orders</span>
              <span className="col-span-1 text-right">Spent</span>
              <span className="col-span-1 text-right">Action</span>
            </div>

            {/* Contact rows */}
            <div className="space-y-0">
              {(() => {
                const q = contactSearch.toLowerCase().trim();
                const filtered = q
                  ? (data?.customers || []).filter((c) => {
                      const matchesName = c.name.toLowerCase().includes(q);
                      const matchesEmail = c.email.toLowerCase().includes(q);
                      const matchesOrder = c.orders?.some((o) =>
                        o.id.toLowerCase().includes(q)
                      );
                      return matchesName || matchesEmail || matchesOrder;
                    })
                  : (data?.customers || []);

                if (filtered.length === 0) {
                  return (
                    <p className="text-muted-foreground text-sm font-mono py-8 text-center">
                      {q ? "No contacts match your search." : "No contacts yet."}
                    </p>
                  );
                }

                return filtered.map((customer) => {
                  const latestOrder = customer.orders?.[0];
                  const addr = (customer.shippingAddress as any) || (latestOrder?.shippingAddress as any);
                  const street = addr?.street || "";
                  const city = addr?.city || "";
                  const zip = addr?.zip || "";
                  const hasAddress = street || city || zip;
                  const segment = getSegment(customer);
                  const segmentVariant = segment === "Elite" ? "blue" : segment === "Churn Risk" ? "red" : segment === "Active" ? "green" : "amber";

                  return (
                    <div key={customer.id} data-testid={`contact-row-${customer.id}`}>
                      {/* Desktop row */}
                      <div className="hidden md:grid grid-cols-12 gap-3 items-center py-3 border-b-2 border-border/30 group">
                        <div className="col-span-2">
                          <p className="text-sm font-bold uppercase truncate">{customer.name}</p>
                          <NeonBadge variant={segmentVariant as any} className="mt-1">{segment}</NeonBadge>
                        </div>
                        <div className="col-span-3 flex items-center gap-1 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono truncate">{customer.email}</span>
                          <button
                            onClick={() => { setContactToEmail(customer); setContactEmailSubject(""); setContactEmailMessage(""); }}
                            className="flex-shrink-0 text-accent-blue hover:text-accent-blue/70 transition-colors"
                            title={`Email ${customer.name}`}
                            data-testid={`button-email-${customer.id}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="col-span-1">
                          <span className="text-xs text-muted-foreground font-mono">{customer.phone || "—"}</span>
                        </div>
                        <div className="col-span-3">
                          {hasAddress ? (
                            <div className="text-xs text-muted-foreground font-mono leading-tight">
                              <div className="truncate">{street}</div>
                              <div>{city}{city && zip ? ", " : ""}{zip}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 font-mono">—</span>
                          )}
                        </div>
                        <div className="col-span-1 text-center">
                          <span className="text-sm font-mono text-accent-blue">{customer.orders?.length || 0}</span>
                        </div>
                        <div className="col-span-1 text-right">
                          <span className="text-sm font-mono">${Number(customer.totalSpent).toFixed(0)}</span>
                        </div>
                        <div className="col-span-1 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                            onClick={() => setContactToDelete(customer)}
                            data-testid={`button-delete-contact-${customer.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="md:hidden border-2 border-border/30 p-4 mb-3 space-y-3" data-testid={`contact-card-${customer.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold uppercase">{customer.name}</p>
                            <NeonBadge variant={segmentVariant as any} className="mt-1">{segment}</NeonBadge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 flex-shrink-0"
                            onClick={() => setContactToDelete(customer)}
                            data-testid={`button-delete-contact-mobile-${customer.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <button
                              onClick={() => { setContactToEmail(customer); setContactEmailSubject(""); setContactEmailMessage(""); }}
                              className="text-accent-blue underline-offset-2 hover:underline truncate text-left"
                              data-testid={`link-email-mobile-${customer.id}`}
                            >
                              {customer.email}
                            </button>
                          </div>

                          {customer.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">{customer.phone}</span>
                            </div>
                          )}

                          {hasAddress && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <div className="text-muted-foreground">
                                {street && <div>{street}</div>}
                                <div>{city}{city && zip ? ", " : ""}{zip}</div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Receipt className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground">
                              {customer.orders?.length || 0} order{(customer.orders?.length || 0) !== 1 ? "s" : ""}
                              {latestOrder && (
                                <span className="text-muted-foreground/60 ml-1">
                                  · Latest: #{latestOrder.id.slice(-6).toUpperCase()}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/30">
                          <span className="text-xs text-muted-foreground font-mono">Total spent</span>
                          <span className="text-sm font-mono font-bold">${Number(customer.totalSpent).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        )}

        {/* Send Email Modal */}
        <Dialog open={!!contactToEmail} onOpenChange={(open) => { if (!open) { setContactToEmail(null); setContactEmailSubject(""); setContactEmailMessage(""); } }}>
          <DialogContent className="bg-background border-2 border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-accent-blue" />
                Send Email
              </DialogTitle>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                Sending from <span className="text-foreground">info@resilientofficial.com</span> via Resend
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">To</label>
                <div className="h-9 px-3 flex items-center border-2 border-border/40 bg-muted/30 text-xs font-mono text-muted-foreground">
                  {contactToEmail?.email}
                </div>
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">Subject</label>
                <Input
                  value={contactEmailSubject}
                  onChange={(e) => setContactEmailSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="border-2 border-border/60 bg-background text-xs font-mono h-9"
                  data-testid="input-contact-email-subject"
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">Message</label>
                <Textarea
                  value={contactEmailMessage}
                  onChange={(e) => setContactEmailMessage(e.target.value)}
                  placeholder="Write your message..."
                  className="border-2 border-border/60 bg-background text-xs font-mono min-h-[140px] resize-none"
                  data-testid="input-contact-email-message"
                />
              </div>
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button
                variant="outline"
                onClick={() => { setContactToEmail(null); setContactEmailSubject(""); setContactEmailMessage(""); }}
                className="font-mono text-xs uppercase tracking-widest border-2"
                data-testid="button-cancel-contact-email"
              >
                Cancel
              </Button>
              <Button
                onClick={() => contactToEmail && sendContactEmailMutation.mutate({ to: contactToEmail.email, subject: contactEmailSubject, message: contactEmailMessage })}
                disabled={sendContactEmailMutation.isPending || !contactEmailSubject.trim() || !contactEmailMessage.trim()}
                className="font-mono text-xs uppercase tracking-widest bg-accent-blue hover:bg-accent-blue/80 text-white border-0"
                data-testid="button-send-contact-email"
              >
                {sendContactEmailMutation.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending...</> : "Send Email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Contact Confirmation Dialog */}
        <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
          <AlertDialogContent className="border-2 border-red-500/40">
            <AlertDialogHeader>
              <AlertDialogTitle className="uppercase tracking-luxury">Delete Contact?</AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-sm">
                This will permanently delete <span className="text-foreground font-bold">{contactToDelete?.name}</span> and all of their associated orders. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-2 uppercase tracking-luxury text-xs"
                data-testid="button-cancel-delete-contact"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 border-2 border-red-500 uppercase tracking-luxury text-xs"
                onClick={() => contactToDelete && deleteContactMutation.mutate(contactToDelete.id)}
                data-testid="button-confirm-delete-contact"
              >
                {deleteContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {tab === "orders" && (
          <OrdersTab orders={data?.orders || []} customers={data?.customers || []} />
        )}

        {tab === "categories" && <CategoryManager categories={data?.categories || []} />}

        {tab === "contacts" && <ContactSubmissionsTab />}

        {tab === "marketing" && <MarketingPanel />}

        {tab === "promo" && <PromoCodesTab />}

        {tab === "settings" && <SettingsPanel />}
      </div>

      <AnimatePresence>
        {showForm && (
          <ProductFormModal
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
            onClose={() => {
              setShowForm(false);
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
            isEditing={!!editingId}
            isPending={createMutation.isPending || updateMutation.isPending}
            categories={data?.categories || []}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const ORDER_STATUSES = [
  { value: "pending",    label: "Pending",    color: "amber" as const },
  { value: "paid",       label: "Paid",       color: "green" as const },
  { value: "processing", label: "Processing", color: "blue" as const },
  { value: "shipped",    label: "Shipped",    color: "blue" as const },
  { value: "delivered",  label: "Delivered",  color: "green" as const },
  { value: "cancelled",  label: "Cancelled",  color: "red" as const },
];

function statusVariant(status: string): "green" | "amber" | "red" | "blue" | "muted" {
  switch (status) {
    case "paid":
    case "delivered": return "green";
    case "shipped":
    case "processing": return "blue";
    case "pending": return "amber";
    case "cancelled": return "red";
    default: return "muted";
  }
}

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

function OrdersTab({ orders, customers }: { orders: Order[]; customers: CustomerWithOrders[] }) {
  const { toast } = useToast();
  const [shippingModal, setShippingModal] = useState<{ id: string } | null>(null);
  const [carrier, setCarrier] = useState("USPS");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [cancelModal, setCancelModal] = useState<{ id: string } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<{ id: string } | null>(null);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, carrier, trackingNumber }: { id: string; status: string; carrier?: string; trackingNumber?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/orders/${id}/status`, { status, carrier, trackingNumber });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setShippingModal(null);
      setTrackingNumber("");
      setCarrier("USPS");
      setTrackingError("");
      setCancelModal(null);
      toast({
        title: "Status Updated",
        description: status === "shipped"
          ? "Order marked as shipped. Shipping email sent to customer."
          : status === "cancelled"
          ? "Order cancelled and refund issued. Cancellation email sent to customer."
          : `Order status set to ${status}.`,
      });
    },
    onError: (err: Error) => {
      setCancelModal(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleStatusChange(orderId: string, val: string) {
    if (val === "shipped") {
      setShippingModal({ id: orderId });
      setCarrier("USPS");
      setTrackingNumber("");
      setTrackingError("");
    } else if (val === "cancelled") {
      setCancelModal({ id: orderId });
    } else {
      updateStatus.mutate({ id: orderId, status: val });
    }
  }

  function submitShipping() {
    if (!trackingNumber.trim()) {
      setTrackingError("Tracking number is required.");
      return;
    }
    if (!shippingModal) return;
    updateStatus.mutate({ id: shippingModal.id, status: "shipped", carrier, trackingNumber: trackingNumber.trim() });
  }

  function submitCancellation() {
    if (!cancelModal) return;
    updateStatus.mutate({ id: cancelModal.id, status: "cancelled" });
  }

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/orders/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setOrderToDelete(null);
      toast({ title: "Order Deleted", description: "The order has been permanently removed." });
    },
    onError: (err: Error) => {
      setOrderToDelete(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (orders.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p className="text-muted-foreground text-sm font-mono py-8 text-center">No orders yet.</p>
      </motion.div>
    );
  }

  return (
    <>
      {/* Delete Order Confirmation */}
      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => { if (!open) setOrderToDelete(null); }}>
        <AlertDialogContent className="bg-background border-2 border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase tracking-widest text-sm">Delete Order?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-muted-foreground">
              This will permanently remove the order record. This action cannot be undone. It does <strong>not</strong> issue a Stripe refund — cancel the order first if a refund is needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs uppercase tracking-widest border-2">Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white border-0 font-mono text-xs uppercase tracking-widest"
              onClick={() => orderToDelete && deleteOrder.mutate(orderToDelete.id)}
              data-testid="button-confirm-delete-order"
            >
              {deleteOrder.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Deleting...</> : "Delete Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancellation Confirmation Modal */}
      <Dialog open={!!cancelModal} onOpenChange={(open) => { if (!open && !updateStatus.isPending) setCancelModal(null); }}>
        <DialogContent className="bg-background border-2 border-red-500/60 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-sm flex items-center gap-2 text-red-400">
              <XCircle className="w-4 h-4" />
              Cancel Order
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              Are you sure you want to cancel this order?
            </p>
            <div className="border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-xs font-mono text-red-400 leading-relaxed">
                ⚠ This will issue a full refund to the customer via Stripe and cannot be undone. A cancellation email will be sent automatically.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-2 font-mono text-xs uppercase tracking-widest"
              onClick={() => setCancelModal(null)}
              disabled={updateStatus.isPending}
              data-testid="button-cancel-go-back"
            >
              Go Back
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white border-0 font-mono text-xs uppercase tracking-widest"
              onClick={submitCancellation}
              disabled={updateStatus.isPending}
              data-testid="button-confirm-cancel"
            >
              {updateStatus.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing...</> : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship Order Modal */}
      <Dialog open={!!shippingModal} onOpenChange={(open) => { if (!open) setShippingModal(null); }}>
        <DialogContent className="bg-background border-2 border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-accent-blue" />
              Mark as Shipped
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Carrier */}
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Carrier *</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger className="border-2 border-border/60 bg-background font-mono text-sm" data-testid="select-ship-carrier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-sm">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tracking Number */}
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Tracking Number *</Label>
              <Input
                value={trackingNumber}
                onChange={(e) => { setTrackingNumber(e.target.value); setTrackingError(""); }}
                placeholder="e.g. 9400111899223756765790"
                className="border-2 border-border/60 bg-background font-mono text-sm"
                data-testid="input-tracking-number"
                onKeyDown={(e) => { if (e.key === "Enter") submitShipping(); }}
              />
              {trackingError && <p className="text-xs text-red-500 font-mono">{trackingError}</p>}
            </div>

            <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
              A shipping confirmation email with carrier name, tracking number, and a direct tracking link will be sent to the customer automatically.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-2 font-mono text-xs uppercase tracking-widest" onClick={() => setShippingModal(null)}>
              Cancel
            </Button>
            <Button
              className="bg-accent-blue hover:bg-accent-blue/90 text-white border-0 font-mono text-xs uppercase tracking-widest"
              onClick={submitShipping}
              disabled={updateStatus.isPending}
              data-testid="button-confirm-ship"
            >
              {updateStatus.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : "Confirm & Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-0">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 text-xs font-mono tracking-luxury uppercase text-muted-foreground pb-2 border-b-2 border-border/50 hidden md:grid">
          <span className="col-span-2">Order</span>
          <span className="col-span-3">Customer</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-3">Update Status</span>
          <span className="col-span-2 text-right">Total / Date</span>
        </div>

        {orders.map((order) => {
          const customer = customerMap.get(order.customerId);
          const isPending = updateStatus.isPending && (updateStatus.variables as any)?.id === order.id;
          const trackingUrl = order.trackingNumber && order.carrier
            ? { USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.trackingNumber}`, UPS: `https://www.ups.com/track?tracknum=${order.trackingNumber}`, FedEx: `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber}`, DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${order.trackingNumber}`, Other: "" }[order.carrier] ?? ""
            : "";

          return (
            <div
              key={order.id}
              className="grid grid-cols-12 gap-3 items-center py-4 border-b-2 border-border/30"
              data-testid={`admin-order-row-${order.id}`}
            >
              {/* Order ID */}
              <div className="col-span-6 md:col-span-2">
                <span className="text-xs font-mono text-accent-blue">#{order.id.slice(0, 8).toUpperCase()}</span>
              </div>

              {/* Customer */}
              <div className="col-span-6 md:col-span-3">
                <p className="text-sm font-mono truncate">{customer?.name || "—"}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{customer?.email || order.customerId.slice(0, 8)}</p>
              </div>

              {/* Current Status Badge + tracking / refund info */}
              <div className="col-span-6 md:col-span-2">
                <NeonBadge variant={statusVariant(order.status)}>
                  {order.status === "shipped" && <Truck className="w-2.5 h-2.5 mr-1 inline" />}
                  {order.status === "cancelled" && <XCircle className="w-2.5 h-2.5 mr-1 inline" />}
                  {order.status}
                </NeonBadge>
                {order.statusChangedAt && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">
                    {new Date(order.statusChangedAt).toLocaleDateString()}
                  </p>
                )}
                {order.status === "cancelled" && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] text-red-400 font-mono font-bold">Refunded</p>
                    {(order as any).refundId && (
                      <p className="text-[9px] text-muted-foreground/50 font-mono break-all leading-tight">
                        {(order as any).refundId}
                      </p>
                    )}
                  </div>
                )}
                {order.trackingNumber && (["shipped","delivered"].includes(order.status)) && (
                  <div className="mt-1">
                    <p className="text-[10px] text-muted-foreground font-mono">{order.carrier}: {order.trackingNumber}</p>
                    {trackingUrl && (
                      <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
                         className="text-[10px] text-accent-blue font-mono underline underline-offset-2">
                        Track →
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Status Dropdown */}
              <div className="col-span-6 md:col-span-3">
                <Select
                  value={order.status}
                  onValueChange={(val) => handleStatusChange(order.id, val)}
                  disabled={isPending}
                >
                  <SelectTrigger
                    className="h-8 text-xs border-2 border-border/40 bg-background font-mono"
                    data-testid={`select-order-status-${order.id}`}
                  >
                    {isPending ? (
                      <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs font-mono">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Total + Date + Delete */}
              <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2">
                <div className="text-right">
                  <p className="text-sm font-mono font-bold">${Number(order.total).toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"
                  onClick={() => setOrderToDelete({ id: order.id })}
                  data-testid={`button-delete-order-${order.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </motion.div>
    </>
  );
}

function CategoryManager({ categories }: { categories: Category[] }) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/categories", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewName("");
      toast({ title: "Category created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/categories/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditingId(null);
      toast({ title: "Category renamed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reassignTo }: { id: string; reassignTo: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/categories/${id}`, { reassignTo });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteTarget(null);
      setReassignTo("");
      toast({ title: "Category deleted", description: `${data.movedProducts} product(s) moved to ${data.movedTo.name}` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-heading tracking-luxury uppercase" data-testid="text-categories-title">Category Manager</h2>
      </div>

      <div className="flex gap-3 mb-6">
        <Input
          data-testid="input-new-category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name..."
          className="font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
          }}
        />
        <Button
          data-testid="button-add-category"
          onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
          disabled={!newName.trim() || createMutation.isPending}
          className="bg-accent-blue hover:bg-accent-blue/80 text-white font-mono uppercase tracking-luxury shrink-0"
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Add</>}
        </Button>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            data-testid={`row-category-${cat.id}`}
            className="flex items-center justify-between border-2 border-border bg-card px-4 py-3 group hover:border-accent-blue/50 transition-colors"
          >
            {editingId === cat.id ? (
              <div className="flex items-center gap-2 flex-1 mr-4">
                <Input
                  data-testid="input-rename-category"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="font-mono h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) renameMutation.mutate({ id: cat.id, name: editName.trim() });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  data-testid="button-save-rename"
                  size="sm"
                  onClick={() => editName.trim() && renameMutation.mutate({ id: cat.id, name: editName.trim() })}
                  disabled={!editName.trim() || renameMutation.isPending}
                  className="bg-accent-blue text-white h-8"
                >
                  {renameMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </Button>
                <Button
                  data-testid="button-cancel-rename"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  className="h-8"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Layers className="w-4 h-4 text-accent-blue" />
                  <span className="font-mono text-sm uppercase tracking-luxury">{cat.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">/{cat.slug}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    data-testid={`button-rename-category-${cat.id}`}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    data-testid={`button-delete-category-${cat.id}`}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                    onClick={() => { setDeleteTarget(cat); setReassignTo(""); }}
                    disabled={categories.length <= 1}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-muted-foreground text-sm font-mono py-8 text-center">No categories yet. Add one above.</p>
        )}
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border-2 border-red-500/50 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b-2 border-border flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-heading text-lg tracking-luxury uppercase">Delete "{deleteTarget.name}"</h3>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground font-mono">
                  All products in this category will be moved to the category you select below.
                </p>
                <div>
                  <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground mb-2 block">Reassign Products To</label>
                  <select
                    data-testid="select-reassign-category"
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="w-full bg-transparent border-2 border-input px-3 py-2 text-sm font-mono h-10 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                  >
                    <option value="">Select a category...</option>
                    {categories.filter((c) => c.id !== deleteTarget.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    data-testid="button-confirm-delete-category"
                    onClick={() => reassignTo && deleteMutation.mutate({ id: deleteTarget.id, reassignTo })}
                    disabled={!reassignTo || deleteMutation.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-mono uppercase tracking-luxury"
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete & Reassign
                  </Button>
                  <Button
                    data-testid="button-cancel-delete-category"
                    variant="ghost"
                    onClick={() => setDeleteTarget(null)}
                    className="font-mono uppercase tracking-luxury"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MarketingPanel() {
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery<{
    smsCount: number;
    emailCount: number;
    twilioConfigured: boolean;
    resendConfigured: boolean;
  }>({ queryKey: ["/api/admin/marketing/stats"] });

  const [smsMessage, setSmsMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const smsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sms-blast", { message: smsMessage });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "SMS Blast Sent", description: `Delivered to ${data.sent} of ${data.total} subscribers.` });
      setSmsMessage("");
    },
    onError: (err: any) => {
      toast({ title: "SMS Blast Failed", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email-blast", { subject: emailSubject, body: emailBody });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Email Blast Sent", description: `Delivered to ${data.sent} of ${data.total} subscribers.` });
      setEmailSubject("");
      setEmailBody("");
    },
    onError: (err: any) => {
      toast({ title: "Email Blast Failed", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const smsCharsLeft = 320 - smsMessage.length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Integration Status */}
      <div className="border-2 border-border/30 bg-[hsl(0_0%_5%)]" data-testid="section-integration-status">
        <div className="flex items-center gap-3 px-6 py-4 border-b-2 border-border/30 bg-[hsl(0_0%_6%)]">
          <Shield className="w-4 h-4 text-accent-blue" />
          <h3 className="font-display text-sm tracking-luxury uppercase">Integration Status</h3>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Twilio SMS", ok: stats?.twilioConfigured, envNote: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER" },
            { label: "Resend Email", ok: stats?.resendConfigured, envNote: "RESEND_API_KEY" },
            { label: "Google Analytics", ok: !!import.meta.env.VITE_GA_MEASUREMENT_ID, envNote: "VITE_GA_MEASUREMENT_ID" },
          ].map((item) => (
            <div key={item.label} className="border border-border/20 p-4 bg-[hsl(0_0%_7%)]">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 ${item.ok ? "bg-[hsl(142,70%,45%)]" : "bg-[hsl(0,80%,45%)]"}`} />
                <span className="text-xs font-mono tracking-luxury uppercase text-white">{item.label}</span>
              </div>
              <span className={`text-[10px] font-mono ${item.ok ? "text-[hsl(142,70%,45%)]" : "text-muted-foreground/50"}`}>
                {item.ok ? "Connected" : "Not configured"}
              </span>
              {!item.ok && (
                <p className="text-[9px] font-mono text-muted-foreground/30 mt-1 leading-relaxed">{item.envNote}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SMS Blast */}
      <div className="border-2 border-border/30 bg-[hsl(0_0%_5%)]" data-testid="section-sms-blast">
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border/30 bg-[hsl(0_0%_6%)]">
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-accent-blue" />
            <h3 className="font-display text-sm tracking-luxury uppercase">SMS Blast</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground/60 tracking-luxury uppercase">
              {statsLoading ? "—" : `${stats?.smsCount ?? 0} subscribers`}
            </span>
            {stats && !stats.twilioConfigured && (
              <span className="text-[9px] font-mono text-[hsl(40,100%,50%)] tracking-luxury uppercase border border-[hsl(40,100%,50%)]/30 px-2 py-0.5">
                Not Connected
              </span>
            )}
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono tracking-luxury uppercase text-muted-foreground block mb-2">Message</label>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value.slice(0, 320))}
              rows={4}
              placeholder="Type your SMS message here..."
              className="w-full bg-transparent border-2 border-border/40 focus:border-accent-blue/60 outline-none p-3 text-sm font-mono text-white resize-none transition-colors"
              data-testid="textarea-sms-message"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] font-mono text-muted-foreground/40">
                {smsMessage.length > 160 ? "2 SMS segments" : "1 SMS segment"}
              </span>
              <span className={`text-[10px] font-mono ${smsCharsLeft < 40 ? "text-[hsl(0,80%,55%)]" : "text-muted-foreground/40"}`}>
                {smsCharsLeft} chars remaining
              </span>
            </div>
          </div>
          <Button
            onClick={() => smsMutation.mutate()}
            disabled={smsMutation.isPending || !smsMessage.trim() || (stats !== undefined && !stats.twilioConfigured)}
            className="text-[10px] tracking-luxury uppercase h-10 border-2 border-accent-blue bg-accent-blue text-white btn-liquid no-default-hover-elevate no-default-active-elevate"
            data-testid="button-send-sms-blast"
          >
            {smsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Phone className="w-3 h-3 mr-2" />}
            Send SMS Blast
          </Button>
          {stats && !stats.twilioConfigured && (
            <p className="text-[10px] font-mono text-muted-foreground/40">
              Configure Twilio credentials in environment secrets to enable SMS sending.
            </p>
          )}
        </div>
      </div>

      {/* Email Blast */}
      <div className="border-2 border-border/30 bg-[hsl(0_0%_5%)]" data-testid="section-email-blast">
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border/30 bg-[hsl(0_0%_6%)]">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-accent-blue" />
            <h3 className="font-display text-sm tracking-luxury uppercase">Email Blast</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground/60 tracking-luxury uppercase">
              {statsLoading ? "—" : `${stats?.emailCount ?? 0} recipients`}
            </span>
            {stats && !stats.resendConfigured && (
              <span className="text-[9px] font-mono text-[hsl(40,100%,50%)] tracking-luxury uppercase border border-[hsl(40,100%,50%)]/30 px-2 py-0.5">
                Not Connected
              </span>
            )}
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono tracking-luxury uppercase text-muted-foreground block mb-2">Subject</label>
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Email subject line..."
              className="border-2 font-mono text-sm h-10 text-white bg-transparent"
              data-testid="input-email-subject"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-luxury uppercase text-muted-foreground block mb-2">Body</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              placeholder="Write your email message here. HTML is not supported — plain text only."
              className="w-full bg-transparent border-2 border-border/40 focus:border-accent-blue/60 outline-none p-3 text-sm font-mono text-white resize-none transition-colors"
              data-testid="textarea-email-body"
            />
          </div>
          <Button
            onClick={() => emailMutation.mutate()}
            disabled={emailMutation.isPending || !emailSubject.trim() || !emailBody.trim() || (stats !== undefined && !stats.resendConfigured)}
            className="text-[10px] tracking-luxury uppercase h-10 border-2 border-accent-blue bg-accent-blue text-white btn-liquid no-default-hover-elevate no-default-active-elevate"
            data-testid="button-send-email-blast"
          >
            {emailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Mail className="w-3 h-3 mr-2" />}
            Send Email Blast
          </Button>
          {stats && !stats.resendConfigured && (
            <p className="text-[10px] font-mono text-muted-foreground/40">
              Configure RESEND_API_KEY in environment secrets to enable email sending.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SettingsPanel() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordDirty, setPasswordDirty] = useState(false);

  const { data: settings, isLoading } = useQuery<{
    maintenanceMode: boolean;
    sitePassword: string;
  }>({
    queryKey: ["/api/admin/settings"],
  });

  const settingsMutation = useMutation({
    mutationFn: async (updates: { maintenanceMode?: boolean; sitePassword?: string }) => {
      const res = await apiRequest("PATCH", "/api/admin/settings", updates);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      if (data.sitePassword) {
        setPasswordInput(data.sitePassword);
        setPasswordDirty(false);
      }
      toast({ title: "Settings Updated", description: "Changes saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save settings", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!passwordDirty && settings?.sitePassword) {
      setPasswordInput(settings.sitePassword);
    }
  }, [settings?.sitePassword, passwordDirty]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const isMaintenanceOn = settings?.maintenanceMode ?? true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="border-2 border-border/30 bg-[hsl(0_0%_5%)]" data-testid="section-site-access">
        <div className="flex items-center gap-3 px-6 py-4 border-b-2 border-border/30 bg-[hsl(0_0%_6%)]">
          <Shield className="w-4 h-4 text-accent-blue" />
          <h3 className="font-display text-sm tracking-luxury uppercase">Site Access Controls</h3>
        </div>

        <div className="p-6 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground block mb-1">
                  Maintenance Mode
                </label>
                <p className="text-[11px] text-muted-foreground/60 font-mono">
                  {isMaintenanceOn
                    ? "Password page is active — visitors must enter a code to access the site."
                    : "Site is public — anyone can browse without a password."}
                </p>
              </div>
              <button
                onClick={() => settingsMutation.mutate({ maintenanceMode: !isMaintenanceOn })}
                disabled={settingsMutation.isPending}
                className={`relative w-14 h-7 border-2 transition-all duration-300 flex items-center ${
                  isMaintenanceOn
                    ? "bg-[hsl(0,80%,45%)]/20 border-[hsl(0,80%,45%)]"
                    : "bg-[hsl(142,70%,40%)]/20 border-[hsl(142,70%,40%)]"
                }`}
                data-testid="toggle-maintenance-mode"
              >
                <div
                  className={`w-5 h-5 transition-all duration-300 ${
                    isMaintenanceOn
                      ? "ml-0.5 bg-[hsl(0,80%,45%)]"
                      : "ml-[26px] bg-[hsl(142,70%,40%)]"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className={`w-2 h-2 ${isMaintenanceOn ? "bg-[hsl(40,100%,50%)]" : "bg-[hsl(142,70%,45%)]"}`} />
              <span className={`text-[10px] font-mono tracking-luxury uppercase ${isMaintenanceOn ? "text-[hsl(40,100%,50%)]" : "text-[hsl(142,70%,45%)]"}`}>
                {isMaintenanceOn ? "Password Protected" : "Site Public"}
              </span>
            </div>
          </div>

          <div className="border-t-2 border-border/20 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              <label className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">
                Password Management
              </label>
            </div>
            <div className="flex gap-3 items-start">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 20);
                    setPasswordInput(val);
                    setPasswordDirty(true);
                  }}
                  maxLength={20}
                  placeholder="Enter site password"
                  className="border-2 font-mono text-sm pr-10 h-10 text-white bg-transparent"
                  data-testid="input-site-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-password-visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={() => {
                  if (!passwordInput.trim()) {
                    toast({ title: "Invalid", description: "Password cannot be blank.", variant: "destructive" });
                    return;
                  }
                  settingsMutation.mutate({ sitePassword: passwordInput.trim() });
                }}
                disabled={settingsMutation.isPending || !passwordDirty || !passwordInput.trim()}
                className="text-[10px] tracking-luxury uppercase h-10 border-2 border-accent-blue bg-accent-blue text-white btn-liquid no-default-hover-elevate no-default-active-elevate"
                data-testid="button-update-password"
              >
                {settingsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Update Password
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {passwordInput.length}/20 characters
              </span>
              {!isMaintenanceOn && (
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  Password page is currently disabled
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ContactSubmissionsTab() {
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<{ id: string; email: string; name: string } | null>(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: submissions = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/contact-submissions"],
  });

  const replyMutation = useMutation({
    mutationFn: async ({ to, subject, message }: { to: string; subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/admin/contact-email", { to, subject, message });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to send"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Your reply was sent successfully." });
      setReplyTo(null); setReplySubject(""); setReplyMessage("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/contact-submissions/${id}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Submission removed." });
      setDeleteTarget(null);
      refetch();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b-2 border-border/50">
        <div>
          <p className="text-xs font-mono tracking-luxury uppercase text-muted-foreground">
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <p className="text-muted-foreground text-sm font-mono py-8 text-center">No contact form submissions yet.</p>
      ) : (
        <div className="space-y-0">
          {submissions.map((sub: any) => (
            <div key={sub.id} className="border-b-2 border-border/30" data-testid={`contact-submission-${sub.id}`}>
              <div
                className="grid grid-cols-12 gap-3 items-center py-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
              >
                <div className="col-span-8 md:col-span-5">
                  <p className="text-sm font-mono font-bold truncate">{sub.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{sub.email}</p>
                </div>
                <div className="col-span-12 md:col-span-4 hidden md:block">
                  <p className="text-xs font-mono text-muted-foreground truncate">{sub.subject}</p>
                </div>
                <div className="col-span-4 md:col-span-3 text-right">
                  <p className="text-xs font-mono text-muted-foreground">
                    {new Date(sub.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              {expandedId === sub.id && (
                <div className="pb-4 px-0 space-y-3">
                  <div className="bg-muted/20 border border-border/40 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Subject</p>
                    <p className="text-sm font-mono">{sub.subject}</p>
                  </div>
                  <div className="bg-muted/20 border border-border/40 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Message</p>
                    <p className="text-sm font-mono whitespace-pre-wrap leading-relaxed">{sub.message}</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-8 text-xs font-mono uppercase tracking-widest bg-accent-blue hover:bg-accent-blue/80 text-white border-0"
                      onClick={() => { setReplyTo({ id: sub.id, email: sub.email, name: sub.name }); setReplySubject(`Re: ${sub.subject}`); }}
                      data-testid={`button-reply-submission-${sub.id}`}
                    >
                      <Mail className="w-3 h-3 mr-1" /> Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-mono uppercase tracking-widest border-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(sub.id)}
                      data-testid={`button-delete-submission-${sub.id}`}
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reply Modal */}
      <Dialog open={!!replyTo} onOpenChange={(open) => { if (!open) { setReplyTo(null); setReplySubject(""); setReplyMessage(""); } }}>
        <DialogContent className="bg-background border-2 border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-accent-blue" /> Reply to Inquiry
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground">
              Sending from <span className="text-foreground">info@resilientofficial.com</span> via Resend
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">To</label>
              <div className="h-9 px-3 flex items-center border-2 border-border/40 bg-muted/30 text-xs font-mono text-muted-foreground">
                {replyTo?.name} &lt;{replyTo?.email}&gt;
              </div>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">Subject</label>
              <Input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="border-2 border-border/60 bg-background text-xs font-mono h-9" data-testid="input-reply-subject" />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1.5">Message</label>
              <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="Write your reply..." className="border-2 border-border/60 bg-background text-xs font-mono min-h-[140px] resize-none" data-testid="input-reply-message" />
            </div>
          </div>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => setReplyTo(null)} className="font-mono text-xs uppercase tracking-widest border-2">Cancel</Button>
            <Button
              onClick={() => replyTo && replyMutation.mutate({ to: replyTo.email, subject: replySubject, message: replyMessage })}
              disabled={replyMutation.isPending || !replySubject.trim() || !replyMessage.trim()}
              className="font-mono text-xs uppercase tracking-widest bg-accent-blue hover:bg-accent-blue/80 text-white border-0"
              data-testid="button-send-reply"
            >
              {replyMutation.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending...</> : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-2 border-red-500/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase tracking-luxury text-sm">Delete Submission?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">This will permanently delete the contact form submission.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 uppercase tracking-luxury text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 border-2 border-red-500 uppercase tracking-luxury text-xs"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              data-testid="button-confirm-delete-submission"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function getSegment(customer: Customer): string {
  const spent = Number(customer.totalSpent || 0);
  if (spent >= 500) return "Elite";

  if (customer.lastPurchase) {
    const daysSince =
      (Date.now() - new Date(customer.lastPurchase).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 60) return "Churn Risk";
  }

  if (spent === 0) return "New Lead";

  return "Active";
}
