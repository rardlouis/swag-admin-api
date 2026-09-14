export class CreateProductDto {
  name?: string;
  description?: string;
  categoryId?: number;
  genderId?: number | null;
  sizeId?: number | null;
  garmentTypeId?: number | null;
  measurements?: Array<{
    measurementName?: string;
    valueCm?: number | string;
  }>;
  price?: number;
  quantity?: number;
  weightKg?: number | null;
  bulkUnits?: number | null;
  brand?: string | null;
  styleId?: number | null;
  customStyle?: string | null;
  colorId?: number | null;
  colorName?: string | null;
  colorHex?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  isActive?: boolean;
}
