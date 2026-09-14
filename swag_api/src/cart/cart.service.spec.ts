import { CartService } from './cart.service';

type ShippingItem = {
  cartItemId: string;
  quantity: number;
  resolvedWeightKg: number | null;
  resolvedBulkUnits: number | null;
};

function shippingDatabase({
  items,
  province = 'Cavite',
  rate = 160,
  config = { package_type: 'Big', max_weight_kg: 8, max_bulk_units: 1 },
}: {
  items: ShippingItem[];
  province?: string;
  rate?: number | null;
  config?: Record<string, unknown>;
}) {
  const sqlTexts: string[] = [];
  const request = {
    input: jest.fn().mockReturnThis(),
    query: jest.fn(async (queryText: string) => {
      sqlTexts.push(queryText);
      if (queryText.includes('FROM USER_ADDRESSES')) return [{ addressId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', province }];
      if (queryText.includes('resolvedWeightKg')) return items;
      if (queryText.includes('FROM SHIPPING_RATES')) return rate === null ? [] : [{ shippingFee: rate }];
      return [];
    }),
  };

  return {
    sqlTexts,
    query: jest.fn(async () => [config]),
    request: jest.fn(async (handler: (value: typeof request) => Promise<unknown>) => handler(request)),
  };
}

describe('CartService shipping evaluation', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('uses product-level shipping values when present', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.8, resolvedBulkUnits: 0.7 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: true, totalWeightKg: 0.8, totalBulkUnits: 0.7 }));
    expect(database.sqlTexts.join('\n')).toContain('COALESCE(p.weight_kg, c.default_weight_kg)');
    expect(database.sqlTexts.join('\n')).toContain('COALESCE(p.bulk_units, c.default_bulk_units)');
  });

  it('uses category fallback values resolved by SQL', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.3, resolvedBulkUnits: 0.5 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: true, totalWeightKg: 0.3, totalBulkUnits: 0.5 }));
  });

  it('multiplies shipping values by cart quantity', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 3, resolvedWeightKg: 0.17, resolvedBulkUnits: 0.22 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ totalWeightKg: 0.51, totalBulkUnits: 0.66 }));
  });

  it('rejects a cart above the Big weight limit', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 2, resolvedWeightKg: 4.1, resolvedBulkUnits: 0.2 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: false, code: 'WEIGHT_EXCEEDED' }));
  });

  it('rejects a cart above the Big bulk limit', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 2, resolvedWeightKg: 0.2, resolvedBulkUnits: 0.6 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: false, code: 'BULK_EXCEEDED' }));
  });

  it('returns the active Big package and shipping fee for an allowed cart', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.79, resolvedBulkUnits: 0.84 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual({
      allowed: true,
      totalWeightKg: 0.79,
      totalBulkUnits: 0.84,
      packageLabel: 'Big',
      shippingFee: 160,
      destinationProvince: 'Cavite',
    });
  });

  it('successfully evaluates the selected checkout cart items', async () => {
    const database = shippingDatabase({
      items: [
        { cartItemId: 'selected-1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.3, resolvedBulkUnits: 0.5 },
        { cartItemId: 'selected-2', productId: 'product-2', productName: 'Product 2', quantity: 1, resolvedWeightKg: 0.2, resolvedBulkUnits: 0.3 },
      ],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(
      userId,
      addressId,
      ['selected-1', 'selected-2'],
    );

    expect(result).toEqual(expect.objectContaining({
      allowed: true,
      totalWeightKg: 0.5,
      totalBulkUnits: 0.8,
      shippingFee: 160,
    }));
  });

  it('uses a trimmed, case-insensitive province rate lookup', async () => {
    const database = shippingDatabase({
      province: '  cAvItE  ',
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.2, resolvedBulkUnits: 0.2 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: true, destinationProvince: 'cAvItE' }));
    expect(database.sqlTexts.join('\n')).toContain('LOWER(LTRIM(RTRIM(destination_province)))');
  });

  it('includes NCR aliases when the saved province is Metro Manila', async () => {
    const database = shippingDatabase({
      province: 'Metro Manila',
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.2, resolvedBulkUnits: 0.2 }],
    });
    await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    const rateRequest = database.request.mock.results
      .map((result) => result.value)
      .find(Boolean);
    expect(database.sqlTexts.join('\n')).toContain('OPENJSON(@locations)');
  });

  it('reports a missing active shipping rate', async () => {
    const database = shippingDatabase({
      rate: null,
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Product 1', quantity: 1, resolvedWeightKg: 0.2, resolvedBulkUnits: 0.2 }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({ allowed: false, code: 'SHIPPING_RATE_NOT_FOUND' }));
  });

  it('reports missing product and category shipping data', async () => {
    const database = shippingDatabase({
      items: [{ cartItemId: '1', productId: 'product-1', productName: 'Missing Shipping Product', quantity: 1, resolvedWeightKg: null, resolvedBulkUnits: null }],
    });
    const result = await new CartService(database as never).evaluateCheckoutShipping(userId, addressId, ['1']);

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      code: 'SHIPPING_DATA_MISSING',
      missingShippingProducts: [{ productId: 'product-1', productName: 'Missing Shipping Product' }],
    }));
  });
});
