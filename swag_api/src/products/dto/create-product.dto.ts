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
  brand?: string | null;
  colorId?: number | null;
  colorName?: string | null;
  colorHex?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  isActive?: boolean;
}
