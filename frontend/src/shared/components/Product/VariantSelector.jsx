import { useState, useEffect, useMemo } from "react";
import { FiCheck } from "react-icons/fi";
import { formatPrice } from "../../utils/helpers";
import { getVariantSignature } from "../../utils/variant";

const normalizeAxisName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const toEntries = (value) => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
};

const VariantSelector = ({ variants, onVariantChange, currentPrice, selectedVariant: selectedVariantProp }) => {
  const [selectedVariant, setSelectedVariant] = useState({});

  const axes = useMemo(() => {
    const combined = [];
    const seenKeys = new Set();

    if (Array.isArray(variants?.attributes)) {
      variants.attributes.forEach((attr) => {
        const label = String(attr?.name || "").trim();
        const key = normalizeAxisName(attr?.name);
        const values = Array.isArray(attr?.values) ? attr.values : [];
        if (label && key && values.length > 0) {
          combined.push({ label, key, values });
          seenKeys.add(key);
        }
      });
    }

    const sizes = Array.isArray(variants?.sizes) ? variants.sizes : [];
    if (sizes.length > 0 && !seenKeys.has("size")) {
      combined.push({ label: "Size", key: "size", values: sizes });
      seenKeys.add("size");
    }

    const colors = Array.isArray(variants?.colors) ? variants.colors : [];
    if (colors.length > 0 && !seenKeys.has("color")) {
      combined.push({ label: "Color", key: "color", values: colors });
      seenKeys.add("color");
    }

    const materials = Array.isArray(variants?.materials) ? variants.materials : [];
    if (materials.length > 0 && !seenKeys.has("material")) {
      combined.push({ label: "Material", key: "material", values: materials });
      seenKeys.add("material");
    }

    return combined;
  }, [variants]);

  const getVariantStockValue = (selection) => {
    const entries = toEntries(variants?.stockMap);
    if (!entries.length) return null;
    const key = getVariantSignature(selection);
    if (!key) return null;

    const exact = entries.find(([rawKey]) => String(rawKey).trim() === key);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
    const normalized = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === key.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed)) return parsed;
    }

    // Candidate keys support (e.g. size|color)
    const size = String(selection.size || "").trim().toLowerCase();
    const color = String(selection.color || "").trim().toLowerCase();

    const candidates = [
      `${size}|${color}`,
      `${size}-${color}`,
      `${size}_${color}`,
      `${size}:${color}`,
      size && !color ? size : null,
      color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const exactCandidate = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
      if (exactCandidate) {
        const parsed = Number(exactCandidate[1]);
        if (Number.isFinite(parsed)) return parsed;
      }
      const normalizedCandidate = entries.find(
        ([rawKey]) => String(rawKey).trim().toLowerCase() === candidate
      );
      if (normalizedCandidate) {
        const parsed = Number(normalizedCandidate[1]);
        if (Number.isFinite(parsed)) return parsed;
      }
    }

    return null;
  };

  useEffect(() => {
    const nextSelection = {};
    const defaultSelection = variants?.defaultSelection && typeof variants.defaultSelection === "object"
      ? variants.defaultSelection
      : {};
    axes.forEach((axis) => {
      // Prioritize selectedVariantProp value if present
      const propVal = selectedVariantProp?.[axis.key];
      if (propVal !== undefined && propVal !== null) {
        nextSelection[axis.key] = propVal;
        return;
      }
      const directDefault = String(defaultSelection?.[axis.key] || "").trim();
      const legacyDefault = axis.key === "size"
        ? String(variants?.defaultVariant?.size || "").trim()
        : axis.key === "color"
        ? String(variants?.defaultVariant?.color || "").trim()
        : "";
      const selected = directDefault || legacyDefault;
      if (selected) nextSelection[axis.key] = selected;
    });
    setSelectedVariant(nextSelection);
  }, [axes, variants, selectedVariantProp]);

  useEffect(() => {
    const keys = new Set([...Object.keys(selectedVariant || {}), ...Object.keys(selectedVariantProp || {})]);
    let isDifferent = false;
    for (const key of keys) {
      if (String(selectedVariant?.[key] || '') !== String(selectedVariantProp?.[key] || '')) {
        isDifferent = true;
        break;
      }
    }
    if (isDifferent) {
      onVariantChange?.(selectedVariant || {});
    }
  }, [selectedVariant, selectedVariantProp, onVariantChange]);

  if (!axes.length) return null;

  const handleOptionSelect = (axisKey, value) => {
    setSelectedVariant((prev) => {
      const isSame = String(prev?.[axisKey] || "") === String(value || "");
      const next = { ...(prev || {}) };
      if (isSame) {
        delete next[axisKey];
      } else {
        next[axisKey] = value;
      }
      return next;
    });
  };

  const isOptionAvailable = (axisKey, value) => {
    const previewSelection = { ...(selectedVariant || {}), [axisKey]: value };
    const stock = getVariantStockValue(previewSelection);
    return stock === null ? true : stock > 0;
  };

  const getVariantPrice = () => {
    const base = Number(currentPrice) || 0;
    const entries = toEntries(variants?.prices);
    if (!entries.length) return base;
    const key = getVariantSignature(selectedVariant || {});
    if (!key) return base;
    const exact = entries.find(([rawKey]) => String(rawKey).trim() === key);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === key.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    // Candidate keys support (e.g. size|color)
    const size = String(selectedVariant.size || "").trim().toLowerCase();
    const color = String(selectedVariant.color || "").trim().toLowerCase();

    const candidates = [
      `${size}|${color}`,
      `${size}-${color}`,
      `${size}_${color}`,
      `${size}:${color}`,
      size && !color ? size : null,
      color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const exactCandidate = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
      if (exactCandidate) {
        const parsed = Number(exactCandidate[1]);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
      const normalizedCandidate = entries.find(
        ([rawKey]) => String(rawKey).trim().toLowerCase() === candidate
      );
      if (normalizedCandidate) {
        const parsed = Number(normalizedCandidate[1]);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
    }

    return base;
  };

  return (
    <div className="space-y-6">
      {axes.map((axis) => (
        <div key={axis.key} className="grid grid-cols-[auto,1fr] items-start gap-x-4 gap-y-3">
          <label className="text-sm shrink-0 pt-2">
            <span className="text-gray-500 font-medium">{axis.label}:</span>
          </label>
          <div className="flex flex-wrap gap-3 min-w-0">
            {axis.values.map((option) => {
              const isSelected = selectedVariant?.[axis.key] === option;
              const isAvailable = isOptionAvailable(axis.key, option);
              const isColorAxis = axis.key === "color";

              if (isColorAxis) {
                return (
                  <button
                    key={`${axis.key}-${option}`}
                    onClick={() => handleOptionSelect(axis.key, option)}
                    disabled={!isAvailable}
                    className={`relative w-10 h-10 rounded-full border-2 transition-all duration-300 ${isSelected
                        ? "border-primary-600 scale-110 shadow-md ring-2 ring-primary-500/30"
                        : isAvailable
                          ? "border-transparent hover:border-slate-300"
                          : "border-slate-200 opacity-50 cursor-not-allowed"
                      }`}
                    title={option}
                  >
                    <div
                      className="w-full h-full rounded-full border border-slate-200 shadow-inner"
                      style={{ backgroundColor: option.toLowerCase() }}
                    />
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <FiCheck className={`${['white', '#fff', '#ffffff', 'yellow'].includes(option.toLowerCase()) ? 'text-gray-900' : 'text-white'} text-base font-bold`} />
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={`${axis.key}-${option}`}
                  onClick={() => handleOptionSelect(axis.key, option)}
                  disabled={!isAvailable}
                  className={`relative px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all duration-300 ${isSelected
                      ? "border-primary-600 bg-primary-50/80 text-primary-700 shadow-sm"
                      : isAvailable
                        ? "border-slate-200 hover:border-primary-500/50 bg-white text-gray-800"
                        : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-50"
                    }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {getVariantPrice() !== Number(currentPrice || 0) && (
        <div className="p-4 bg-primary-50/80 rounded-2xl border border-primary-200/80 shadow-sm">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Selected Variant Price:</p>
          <p className="text-xl font-black text-primary-700">{formatPrice(getVariantPrice())}</p>
        </div>
      )}
    </div>
  );
};

export default VariantSelector;

