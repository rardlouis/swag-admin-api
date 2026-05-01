import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  MdArrowBack,
  MdClose,
  MdKeyboardArrowDown,
  MdOutlineImage,
  MdSave,
  MdUndo,
} from "react-icons/md";
import { apiGet, apiPatch, apiUpload } from "../../api.js";
import "./ProductsForm.css";

const emptyForm = {
  name: "",
  description: "",
  brand: "",
  categoryId: "",
  genderId: "",
  sizeId: "",
  garmentTypeId: "",
  measurements: [],
  colorName: "",
  colorHex: "",
  price: "",
  quantity: "",
  images: [],
  isActive: true,
};

function productToForm(product) {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    brand: product?.brand ?? "",
    categoryId: product?.categoryId ? String(product.categoryId) : "",
    genderId: product?.genderId ? String(product.genderId) : "",
    sizeId: product?.sizeId ? String(product.sizeId) : "",
    garmentTypeId: product?.garmentTypeId ? String(product.garmentTypeId) : "",
    measurements: product?.measurements ?? [],
    colorName: product?.color ?? "",
    colorHex: product?.colorHex ?? "",
    price: product?.price === undefined ? "" : String(product.price),
    quantity: product?.qty === undefined ? "" : String(product.qty),
    images: product?.images?.length
      ? product.images.map((image) => ({ imageUrl: image.imageUrl }))
      : product?.imageUrl
        ? [{ imageUrl: product.imageUrl }]
        : [],
    isActive: Boolean(product?.isActive),
  };
}

export default function ProductsEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(emptyForm);
  const [savedForm, setSavedForm] = useState(emptyForm);
  const [lookups, setLookups] = useState({ categories: [], sizes: [], garmentTypes: [], genders: [] });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiGet(`/products/${id}`), apiGet("/products/meta/lookups")])
      .then(([product, lookupData]) => {
        const nextForm = productToForm(product);
        setForm(nextForm);
        setSavedForm(nextForm);
        setLookups(lookupData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!form.sizeId || !form.garmentTypeId || isLoading) {
      return;
    }

    apiGet(`/products/meta/measurement-defaults?sizeId=${form.sizeId}&garmentTypeId=${form.garmentTypeId}`)
      .then((defaults) => {
        setForm((prev) => {
          const existingByName = new Map(
            prev.measurements.map((measurement) => [measurement.measurementName, measurement.valueCm]),
          );

          return {
            ...prev,
            measurements: defaults.map((measurement) => ({
              ...measurement,
              valueCm: existingByName.get(measurement.measurementName) ?? measurement.valueCm,
            })),
          };
        });
      })
      .catch((err) => setError(err.message));
  }, [form.sizeId, form.garmentTypeId, isLoading]);

  const selectedSize = lookups.sizes.find((size) => String(size.id) === String(form.sizeId));

  const updateMeasurement = (measurementName, valueCm) => {
    setForm((prev) => ({
      ...prev,
      measurements: prev.measurements.map((measurement) => (
        measurement.measurementName === measurementName
          ? { ...measurement, valueCm }
          : measurement
      )),
    }));
  };

  const handleImageFiles = async (files) => {
    const availableSlots = 4 - form.images.length;
    const selectedFiles = Array.from(files).slice(0, availableSlots);

    if (!selectedFiles.length) return;

    setError("");

    try {
      const uploaded = await apiUpload("/products/uploads", selectedFiles);
      setForm((prev) => ({
        ...prev,
        images: [
          ...prev.images,
          ...uploaded.map((image) => ({
            imageUrl: image.imageUrl,
          })),
        ].slice(0, 4),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const removeImage = (index) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, imageIndex) => imageIndex !== index),
    }));
  };

  const toPayload = () => ({
    name: form.name,
    description: form.description || null,
    brand: form.brand || null,
    categoryId: Number(form.categoryId),
    genderId: form.genderId ? Number(form.genderId) : null,
    sizeId: form.sizeId ? Number(form.sizeId) : null,
    garmentTypeId: form.garmentTypeId ? Number(form.garmentTypeId) : null,
    measurements: form.measurements,
    colorName: form.colorName || null,
    colorHex: form.colorHex || null,
    price: Number(form.price),
    quantity: Number(form.quantity),
    imageUrls: form.images.map((image) => image.imageUrl),
    isActive: form.isActive,
  });

  const discardChanges = () => {
    setForm(savedForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await apiPatch(`/products/${id}`, toPayload());
      navigate("/products/all");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="table-state">Loading product...</p>;
  }

  return (
    <div className="product-add-page">
      <button className="product-add-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="product-add-header">
        <h1 className="product-add-title">Product</h1>
        <p className="product-add-breadcrumb">
          Dashboard <span>›</span> Product <span>›</span> All <span>›</span>{" "}
          <strong>Edit Product</strong>
        </p>
      </div>

      <form className="product-add-layout" onSubmit={handleSubmit}>
        <section className="product-add-card product-add-info">
          <div className="product-add-card-head">
            <h2>Product Information</h2>
            <p>This form edits PRODUCTS and the related size stock/image records.</p>
          </div>

          <label className="product-add-field product-add-field-full">
            <span>Product ID</span>
            <input value={id} readOnly />
          </label>

          <label className="product-add-field product-add-field-full">
            <span>Product Name</span>
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Input product name"
              required
            />
          </label>

          <label className="product-add-field product-add-field-full">
            <span>Description</span>
            <input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Input description"
            />
          </label>

          <div className="product-add-row">
            <label className="product-add-field product-add-select">
              <span>Product Category</span>
              <select
                value={form.categoryId}
                onChange={(e) => updateField("categoryId", e.target.value)}
                required
              >
                <option value="">Select database category</option>
                {lookups.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <MdKeyboardArrowDown size={20} />
            </label>

            <label className="product-add-field product-add-select">
              <span>Gender</span>
              <select value={form.genderId} onChange={(e) => updateField("genderId", e.target.value)}>
                <option value="">No gender</option>
                {lookups.genders.map((gender) => (
                  <option key={gender.id} value={gender.id}>{gender.label}</option>
                ))}
              </select>
              <MdKeyboardArrowDown size={20} />
            </label>
          </div>

          <div className="product-add-row">
            <label className="product-add-field product-add-select">
              <span>Size Standard</span>
              <select value={form.sizeId} onChange={(e) => updateField("sizeId", e.target.value)}>
                <option value="">No size stock</option>
                {lookups.sizes.map((size) => (
                  <option key={size.id} value={size.id}>{size.label}</option>
                ))}
              </select>
              <MdKeyboardArrowDown size={20} />
            </label>

            <label className="product-add-field">
              <span>Brand</span>
              <input value={form.brand} onChange={(e) => updateField("brand", e.target.value)} />
            </label>
          </div>

          <div className="product-add-row">
            <label className="product-add-field product-add-select">
              <span>Garment Type</span>
              <select value={form.garmentTypeId} onChange={(e) => updateField("garmentTypeId", e.target.value)}>
                <option value="">Select garment type</option>
                {lookups.garmentTypes.map((garmentType) => (
                  <option key={garmentType.id} value={garmentType.id}>{garmentType.label}</option>
                ))}
              </select>
              <MdKeyboardArrowDown size={20} />
            </label>

            <div className="size-standard-summary">
              <span>Body Reference</span>
              <p>
                {selectedSize
                  ? `Chest ${selectedSize.chestCmMin ?? "-"}-${selectedSize.chestCmMax ?? "-"} cm, Waist ${selectedSize.waistCmMin ?? "-"}-${selectedSize.waistCmMax ?? "-"} cm`
                  : "Select a size standard to view body ranges."}
              </p>
            </div>
          </div>

          {form.measurements.length > 0 && (
            <section className="measurements-panel">
              <div className="measurements-head">
                <h3>Custom Garment Measurements</h3>
                <p>Defaults come from SIZE_GARMENT_MEASUREMENTS. Edits here save as product-specific cm values.</p>
              </div>
              <div className="measurements-grid">
                {form.measurements.map((measurement) => (
                  <label className="product-add-field" key={measurement.measurementName}>
                    <span>{measurement.measurementName.replaceAll("_", " ")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={measurement.valueCm}
                      onChange={(e) => updateMeasurement(measurement.measurementName, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}

          <div className="product-add-row">
            <label className="product-add-field">
              <span>Color Name</span>
              <input value={form.colorName} onChange={(e) => updateField("colorName", e.target.value)} />
            </label>

            <label className="product-add-field">
              <span>Color Hex</span>
              <input
                value={form.colorHex}
                onChange={(e) => updateField("colorHex", e.target.value)}
                maxLength={7}
              />
            </label>
          </div>

          <div className="product-add-row">
            <label className="product-add-field">
              <span>Price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => updateField("price", e.target.value)}
                required
              />
            </label>

            <label className="product-add-field">
              <span>Quantity</span>
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => updateField("quantity", e.target.value)}
                required
              />
            </label>
          </div>

          <label className="product-add-field product-add-field-full product-add-select">
            <span>Status Product</span>
            <select
              value={form.isActive ? "1" : "0"}
              onChange={(e) => updateField("isActive", e.target.value === "1")}
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
            <MdKeyboardArrowDown size={20} />
          </label>

          {error && <p className="form-error">{error}</p>}
        </section>

        <aside className="product-add-side">
          <section className="product-add-card product-add-images">
            <div className="product-add-card-head">
              <h2>Image Product</h2>
              <p>Upload up to 4 images from your computer. The first image becomes primary.</p>
            </div>

            <div className="product-photo-grid">
              {Array.from({ length: 4 }).map((_, index) => {
                const image = form.images[index];

                return (
                  <label className="product-photo-box" key={index}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      onChange={(event) => handleImageFiles(event.target.files)}
                    />
                    {image ? (
                      <>
                        <img src={image.imageUrl} alt={`Product ${index + 1}`} />
                        <button
                          className="photo-remove-btn"
                          onClick={(event) => {
                            event.preventDefault();
                            removeImage(index);
                          }}
                          type="button"
                        >
                          <MdClose size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <MdOutlineImage size={24} />
                        <span>Photo {index + 1}</span>
                      </>
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          <div className="product-edit-actions">
            <button className="product-discard-btn" type="button" onClick={discardChanges}>
              <MdUndo size={17} />
              Discard Changes
            </button>

            <button className="product-save-btn" disabled={isSaving} type="submit">
              <MdSave size={17} />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
