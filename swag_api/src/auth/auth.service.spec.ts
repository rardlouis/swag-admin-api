import { AuthService } from './auth.service';

describe('AuthService addressAutocomplete', () => {
  const originalApiKey = process.env.GEOAPIFY_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.GEOAPIFY_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it('returns normalized suggestions for a Barnabas query', async () => {
    process.env.GEOAPIFY_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          formatted: 'Barnabas Street, Parañaque, Philippines',
          street: 'Barnabas Street',
          suburb: 'Don Bosco',
          city: 'Parañaque',
          state: 'Metro Manila',
          postcode: '1700',
          lat: 14.48,
          lon: 121.02,
        }],
      }),
    }) as typeof fetch;

    const service = new AuthService({} as never);
    await expect(service.addressAutocomplete('barnabas')).resolves.toEqual({
      suggestions: [expect.objectContaining({
        label: 'Barnabas Street, Parañaque, Philippines',
        street: 'Barnabas Street',
        barangay: 'Don Bosco',
        city: 'Parañaque',
        province: '',
        region: 'National Capital Region (NCR)',
        zip: '1700',
      })],
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('text=barnabas'));
  });

  it('reverse geocodes a device location without exposing the Geoapify key', async () => {
    process.env.GEOAPIFY_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ formatted: '1152 Tabora Street, Manila, Philippines', housenumber: '1152', street: 'Tabora Street', suburb: 'Barangay 197', city: 'Manila', state: 'Metro Manila', state_district: 'NCR', postcode: '1012' }],
      }),
    }) as typeof fetch;

    const service = new AuthService({} as never);
    await expect(service.reverseGeocodeAddress('14.5995', '120.9842')).resolves.toEqual({
      address: expect.objectContaining({ houseNo: '1152', street: 'Tabora Street', city: 'Manila', province: '', region: 'National Capital Region (NCR)', zip: '1012' }),
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/geocode/reverse?lat=14.5995&lon=120.9842'));
  });
});
