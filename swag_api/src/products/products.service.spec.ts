import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService product gender validation', () => {
  const database = { request: jest.fn() } as any;
  const service = new ProductsService(database);

  beforeEach(() => jest.clearAllMocks());

  it('accepts one of the six supported product gender IDs', async () => {
    database.request.mockResolvedValue([{ count: 1 }]);

    await expect((service as any).validateProductGenderId(1)).resolves.toBeUndefined();
  });

  it('rejects Prefer not to say for a new product', async () => {
    database.request.mockResolvedValue([{ count: 0 }]);

    await expect((service as any).validateProductGenderId(7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported product audience IDs', async () => {
    database.request.mockResolvedValue([{ count: 0 }]);

    await expect((service as any).validateAudienceIds([99])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves an unchanged legacy audience assignment during an edit', async () => {
    await expect((service as any).validateAudienceIds([99], [99])).resolves.toEqual([99]);
    expect(database.request).not.toHaveBeenCalled();
  });

  it('keeps a legacy gender when an existing product is edited without changing it', async () => {
    await expect((service as any).validateProductGenderId(3, 3)).resolves.toBeUndefined();
    expect(database.request).not.toHaveBeenCalled();
  });
});
