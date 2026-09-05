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
  colorId: "",
  colorName: "",
  colorHex: "",
  price: "",
  quantity: "1",
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
    colorId: product?.colorId ? String(product.colorId) : "",
    colorName: product?.colorName ?? product?.color ?? "",
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
  const [lookups, setLookups] = useState({
    categories: [],
    sizes: [],
    garmentTypes: [],
    genders: [],
    colors: [],
  });
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

  const validateForm = () => {
    const price = Number(form.price);
    const quantity = Number(form.quantity);

    if (form.name.trim().length < 2 || form.name.trim().length > 120) {
      return "Product name must be 2 to 120 characters.";
    }
    if (form.description.trim().length > 100) {
      return "Description must be 100 characters or less.";
    }
    if (!form.categoryId) {
      return "Product category is required.";
    }
    if (!Number.isFinite(price) || price <= 0) {
      return "Price must be greater than zero.";
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return "Quantity must be zero or greater.";
    }
    if (form.brand.trim().length > 100) {
      return "Brand must be 100 characters or less.";
    }

    return "";
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
  const selectedColor = lookups.colors.find((color) => String(color.id) === String(form.colorId));

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
    colorId: form.colorId ? Number(form.colorId) : null,
    colorName: selectedColor?.name ?? form.colorName ?? null,
    colorHex: selectedColor?.hex ?? form.colorHex ?? null,
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
    const formError = validateForm();
    if (formError) {
      setError(formError);
      return;
    }
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
              onChange={(e) => updateField("name", e.target.value.slice(0, 120))}
              placeholder="Product Name"
              minLength={2}
              maxLength={120}
              required
            />
          </label>

          <label className="product-add-field product-add-field-full">
            <span>Description</span>
            <input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value.slice(0, 100))}
              placeholder="Description"
              maxLength={100}
            />
            <small className="product-field-hint">{form.description.length}/100</small>
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
              <input value={form.brand} onChange={(e) => updateField("brand", e.target.value.slice(0, 100))} maxLength={100} />
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
                <p>Default measurements come from garment sizes. Edit them here depending on the product's specific measurements in cm.</p>
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
            <label className="product-add-field product-add-select">
              <span>Exact Product Color</span>
              <select value={form.colorId} onChange={(e) => updateField("colorId", e.target.value)}>
                <option value="">Select preset color</option>
                {lookups.colors.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.name} ({color.family})
                  </option>
                ))}
              </select>
              <MdKeyboardArrowDown size={20} />
            </label>

            <div className="color-family-summary">
              <span>User-facing color</span>
              <p>
                {selectedColor ? (
                  <>
                    <i style={{ background: selectedColor.hex }} />
                    {selectedColor.family}
                  </>
                ) : (
                  form.colorName || "Select a color to show its catalog family."
                )}
              </p>
            </div>
          </div>

          <div className="product-add-row product-edit-stock-row">
            <label className="product-add-field">
              <span>Price</span>
              <input
                type="number"
                min="0.01"
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

            <label className="product-add-field product-add-select">
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
          </div>

          {error && <p className="form-error">{error}</p>}
        </section>

        <aside className="product-add-side">
          <section className="product-add-card product-add-images">
            <div className="product-add-card-head">
              <h2>Image Product</h2>
              <p>Upload up to 4 images from your computer. The first image becomes primary.</p>
            </div>

            <div className="product-photo-grid">
              {form.images[0]?.imageUrl ? (
                <div className="product-large-preview">
                  <img src={form.images[0].imageUrl} alt="Primary product preview" />
                </div>
              ) : null}
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
