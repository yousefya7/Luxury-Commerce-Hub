import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
import type { PromoCode } from "@shared/schema";
import {
  Plus, Trash2, ToggleLeft, ToggleRight, Tag, Loader2, X, Check,
  Pencil, AlertCircle, Zap, RefreshCw,
} from "lucide-react";

type PromoType = "percentage" | "fixed" | "free_shipping";

function sanitizePromoCode(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_]/g, "")
    .toUpperCase();
}

function isValidPromoCode(code: string): boolean {
  return /^[A-Z0-9\-_]+$/.test(code);
}

const TYPE_LABELS: Record<PromoType, string> = {
  percentage: "% Off",
  fixed: "$ Off",
  free_shipping: "Free Shipping",
};

type FormState = {
  code: string;
  type: PromoType;
  value: string;
  expirationDate: string;
  usageLimit: string;
  minOrderAmount: string;
  active: boolean;
};

const emptyForm: FormState = {
  code: "",
  type: "percentage",
  value: "",
  expirationDate: "",
  usageLimit: "",
  minOrderAmount: "",
  active: true,
};

function promoToForm(p: PromoCode): FormState {
  return {
    code: p.code,
    type: p.type as PromoType,
    value: p.value ? String(Number(p.value)) : "",
    expirationDate: p.expirationDate ? new Date(p.expirationDate).toISOString().split("T")[0] : "",
    usageLimit: p.usageLimit != null ? String(p.usageLimit) : "",
    minOrderAmount: p.minOrderAmount ? String(Number(p.minOrderAmount)) : "",
    active: p.active,
  };
}

function discountLabel(code: PromoCode) {
  if (code.type === "free_shipping") return "Free Shipping";
  if (code.type === "percentage") return `${Number(code.value)}% off`;
  return `$${Number(code.value).toFixed(2)} off`;
}

function PromoModal({
  mode,
  initial,
  onClose,
  onSaved,
  editId,
}: {
  mode: "create" | "edit";
  initial: FormState;
  onClose: () => void;
  onSaved: () => void;
  editId?: string;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const field = (k: keyof FormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const cleanCode = sanitizePromoCode(form.code);
    if (!cleanCode) {
      return toast({ title: "Code is required", variant: "destructive" });
    }
    if (!isValidPromoCode(cleanCode)) {
      return toast({ title: "Invalid code", description: "Only letters, numbers, hyphens, and underscores are allowed.", variant: "destructive" });
    }
    if (form.type !== "free_shipping" && !form.value) {
      return toast({ title: "Discount value is required", variant: "destructive" });
    }

    setSaving(true);
    setStripeError(null);

    const payload: Record<string, any> = {
      code: cleanCode,
      type: form.type,
      value: form.type === "free_shipping" ? "0" : form.value,
      active: form.active,
    };
    if (form.expirationDate) payload.expirationDate = new Date(form.expirationDate).toISOString();
    if (form.usageLimit) payload.usageLimit = parseInt(form.usageLimit, 10);
    if (form.minOrderAmount) payload.minOrderAmount = form.minOrderAmount;

    try {
      if (mode === "create") {
        await apiRequest("POST", "/api/admin/promo-codes", payload);
      } else {
        await apiRequest("PATCH", `/api/admin/promo-codes/${editId}`, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({
        title: mode === "create" ? `${cleanCode} created` : "Promo code updated",
        description: mode === "create" ? "Synced to Stripe as a Coupon + Promotion Code." : "Changes saved.",
      });
      onSaved();
    } catch (err: any) {
      const msg: string = err?.message || "Something went wrong";
      if (msg.toLowerCase().includes("stripe")) {
        setStripeError(msg);
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-background border-2 border-border w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-luxury uppercase">
            {mode === "create" ? "Create Promo Code" : `Edit ${initial.code}`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {stripeError && (
          <div className="flex items-start gap-2 border-2 border-red-600/40 bg-red-950/20 p-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Stripe Sync Failed</p>
              <p className="text-xs text-red-400/80 font-mono leading-relaxed">{stripeError}</p>
              <p className="text-xs text-muted-foreground/60 font-mono mt-1">
                The code was NOT saved. Fix the issue above and try again.
              </p>
            </div>
          </div>
        )}

        {/* Code */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
            Code *
          </label>
          <Input
            data-testid="input-promo-code"
            placeholder="e.g. SUMMER20"
            value={form.code}
            onChange={(e) => {
              const raw = e.target.value;
              const sanitized = raw
                .replace(/\s+/g, "_")
                .replace(/[^A-Za-z0-9\-_]/g, "")
                .toUpperCase();
              field("code", sanitized);
            }}
            disabled={mode === "edit"}
            className="h-10 text-sm border-2 font-mono"
          />
          {mode === "create" && (
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
              Only letters, numbers, hyphens and underscores — spaces are automatically converted to underscores.
            </p>
          )}
          {mode === "edit" && (
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">
              Code cannot be changed after creation (Stripe limitation).
            </p>
          )}
        </div>

        {/* Type */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
            Discount Type *
          </label>
          <div className="flex gap-2">
            {(["percentage", "fixed", "free_shipping"] as PromoType[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={mode === "edit"}
                onClick={() => field("type", t)}
                className={`flex-1 h-10 text-[10px] uppercase tracking-widest font-bold border-2 transition-colors ${
                  form.type === t
                    ? "border-accent-blue bg-accent-blue/20 text-accent-blue"
                    : "border-border/40 text-muted-foreground hover:border-accent-blue/40 disabled:opacity-50"
                }`}
                data-testid={`button-promo-type-${t}`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {mode === "edit" && (
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">
              Discount type is locked after creation.
            </p>
          )}
        </div>

        {/* Value */}
        {form.type !== "free_shipping" && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
              {form.type === "percentage" ? "Percent Off (%) *" : "Amount Off ($) *"}
            </label>
            <Input
              data-testid="input-promo-value"
              type="number"
              min="0"
              step={form.type === "percentage" ? "1" : "0.01"}
              max={form.type === "percentage" ? "100" : undefined}
              placeholder={form.type === "percentage" ? "20" : "10.00"}
              value={form.value}
              onChange={(e) => field("value", e.target.value)}
              disabled={mode === "edit"}
              className="h-10 text-sm border-2 font-mono"
            />
          </div>
        )}

        {/* Min order + usage limit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
              Min Order ($)
            </label>
            <Input
              data-testid="input-promo-min"
              type="number"
              min="0"
              step="0.01"
              placeholder="None"
              value={form.minOrderAmount}
              onChange={(e) => field("minOrderAmount", e.target.value)}
              className="h-10 text-sm border-2 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
              Usage Limit
            </label>
            <Input
              data-testid="input-promo-limit"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.usageLimit}
              onChange={(e) => field("usageLimit", e.target.value)}
              className="h-10 text-sm border-2 font-mono"
            />
          </div>
        </div>

        {/* Expiration */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block mb-2">
            Expiration Date
          </label>
          <Input
            data-testid="input-promo-expiry"
            type="date"
            value={form.expirationDate}
            onChange={(e) => field("expirationDate", e.target.value)}
            className="h-10 text-sm border-2 font-mono"
          />
        </div>

        {/* Active */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => field("active", !form.active)}
            className="transition-colors"
            data-testid="toggle-promo-active"
          >
            {form.active ? (
              <ToggleRight className="w-6 h-6 text-accent-blue" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-muted-foreground/40" />
            )}
          </button>
          <span className="text-xs font-mono text-muted-foreground">
            {form.active ? "Active — customers can use this code" : "Inactive — code is disabled"}
          </span>
        </div>

        {/* Stripe note for creates */}
        {mode === "create" && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50 border border-border/20 px-3 py-2">
            <Zap className="w-3 h-3 text-accent-blue/50 flex-shrink-0" />
            Creates a Stripe Coupon + Promotion Code automatically. Code will not be saved if Stripe fails.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="border-2 border-accent-blue bg-accent-blue text-white text-xs tracking-luxury uppercase h-10 px-6 hover:bg-accent-blue/90"
            data-testid="button-submit-promo"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Check className="w-3 h-3 mr-2" />
            )}
            {mode === "create" ? "Create & Sync to Stripe" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-2 text-xs tracking-luxury uppercase h-10 px-5"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PromoCodesTab() {
  const { toast } = useToast();
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<PromoCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);

  const { data: codes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) =>
      toast({ title: "Error updating status", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setDeleteTarget(null);
      toast({ title: "Promo code deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setModalMode("create");
  };

  const openEdit = (code: PromoCode) => {
    setEditTarget(code);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditTarget(null);
  };

  const isExpired = (code: PromoCode) =>
    !!code.expirationDate && new Date(code.expirationDate) < new Date();

  const isAtLimit = (code: PromoCode) =>
    code.usageLimit !== null && code.usageLimit !== undefined && code.usageCount >= code.usageLimit;

  return (
    <div className="space-y-6" data-testid="panel-promo-codes">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl tracking-luxury uppercase">Promo Codes</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Each code syncs to Stripe as a Coupon + Promotion Code.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="border-2 border-accent-blue bg-accent-blue text-white text-xs tracking-luxury uppercase h-10 px-5 hover:bg-accent-blue/90"
          data-testid="button-create-promo"
        >
          <Plus className="w-3 h-3 mr-2" /> New Code
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-accent-blue" />
        </div>
      ) : codes.length === 0 ? (
        <div className="border-2 border-border/30 py-16 text-center">
          <Tag className="w-8 h-8 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground font-mono">No promo codes yet.</p>
          <p className="text-xs text-muted-foreground/50 font-mono mt-1">
            Click "New Code" to create your first one.
          </p>
        </div>
      ) : (
        <div className="border-2 border-border/30 overflow-hidden overflow-x-auto">
          {/* Header */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-3 bg-muted/20 border-b-2 border-border/30 min-w-[800px]">
            {[
              { label: "Code", cols: "col-span-2" },
              { label: "Discount", cols: "col-span-2" },
              { label: "Min Order", cols: "col-span-1" },
              { label: "Expires", cols: "col-span-2" },
              { label: "Usage", cols: "col-span-1" },
              { label: "Stripe", cols: "col-span-2" },
              { label: "Status", cols: "col-span-1" },
              { label: "", cols: "col-span-1" },
            ].map(({ label, cols }) => (
              <div
                key={label}
                className={`${cols} text-[10px] uppercase tracking-widest text-muted-foreground font-bold`}
              >
                {label}
              </div>
            ))}
          </div>

          {codes.map((code, idx) => {
            const expired = isExpired(code);
            const limitHit = isAtLimit(code);
            const broken = expired || limitHit;
            return (
              <div
                key={code.id}
                className={`grid grid-cols-2 lg:grid-cols-12 gap-3 px-4 py-4 items-center transition-colors hover:bg-muted/10 ${
                  idx < codes.length - 1 ? "border-b border-border/20" : ""
                }`}
                data-testid={`row-promo-${code.id}`}
              >
                {/* Code */}
                <div className="col-span-2 lg:col-span-2 flex items-center gap-2 min-w-0">
                  <Tag className="w-3 h-3 text-accent-blue flex-shrink-0" />
                  <span className="font-mono font-bold text-sm truncate">{code.code}</span>
                </div>

                {/* Discount */}
                <div className="lg:col-span-2">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-1 border ${
                      code.type === "percentage"
                        ? "border-accent-blue/40 text-accent-blue bg-accent-blue/10"
                        : code.type === "fixed"
                        ? "border-green-500/40 text-green-400 bg-green-500/10"
                        : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                    }`}
                  >
                    {discountLabel(code)}
                  </span>
                </div>

                {/* Min order */}
                <div className="lg:col-span-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {code.minOrderAmount && Number(code.minOrderAmount) > 0
                      ? `$${Number(code.minOrderAmount).toFixed(2)}`
                      : "—"}
                  </span>
                </div>

                {/* Expires */}
                <div className="lg:col-span-2">
                  {code.expirationDate ? (
                    <span
                      className={`text-xs font-mono ${expired ? "text-red-400" : "text-muted-foreground"}`}
                    >
                      {expired ? "⚠ Expired " : ""}
                      {new Date(code.expirationDate).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground/40">Never</span>
                  )}
                </div>

                {/* Usage */}
                <div className="lg:col-span-1">
                  <span
                    className={`text-sm font-mono ${limitHit ? "text-red-400" : "text-muted-foreground"}`}
                  >
                    {code.usageCount}
                    {code.usageLimit != null ? `/${code.usageLimit}` : ""}
                  </span>
                </div>

                {/* Stripe sync status */}
                <div className="lg:col-span-2 flex flex-col gap-0.5">
                  {code.stripeCouponId ? (
                    <span className="text-[10px] font-mono text-green-400/80 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Coupon ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-500/70 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No coupon
                    </span>
                  )}
                  {(code as any).stripePromoCodeId ? (
                    <span className="text-[10px] font-mono text-green-400/80 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Promo code ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-500/70 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No promo code
                    </span>
                  )}
                </div>

                {/* Active toggle */}
                <div className="lg:col-span-1">
                  <button
                    onClick={() => toggleMutation.mutate({ id: code.id, active: !code.active })}
                    disabled={toggleMutation.isPending}
                    className="transition-colors"
                    data-testid={`toggle-promo-${code.id}`}
                    title={code.active ? "Disable" : "Enable"}
                  >
                    {code.active && !broken ? (
                      <ToggleRight className="w-5 h-5 text-accent-blue" />
                    ) : code.active && broken ? (
                      <ToggleRight className="w-5 h-5 text-amber-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </button>
                </div>

                {/* Edit + Delete */}
                <div className="lg:col-span-1 flex items-center gap-2 justify-end">
                  <button
                    onClick={() => openEdit(code)}
                    className="text-muted-foreground/40 hover:text-accent-blue transition-colors"
                    data-testid={`button-edit-promo-${code.id}`}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(code)}
                    className="text-muted-foreground/40 hover:text-red-400 transition-colors"
                    data-testid={`button-delete-promo-${code.id}`}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <PromoModal
          mode={modalMode}
          initial={modalMode === "edit" && editTarget ? promoToForm(editTarget) : { ...emptyForm }}
          editId={editTarget?.id}
          onClose={closeModal}
          onSaved={closeModal}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-2 border-red-600/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold tracking-luxury uppercase">
              Delete Promo Code?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-mono">
              This will permanently delete{" "}
              <span className="text-white font-bold">{deleteTarget?.code}</span> from the database
              and deactivate it in Stripe. Orders already placed are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 text-xs tracking-luxury uppercase">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-xs tracking-luxury uppercase bg-red-600 hover:bg-red-700 text-white border-2 border-red-600"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-promo"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
