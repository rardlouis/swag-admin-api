import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService sales report periods', () => {
  const service = new AdminService({} as never, {} as never);

  it('creates an inclusive monthly range using an exclusive next-month boundary', () => {
    expect((service as any).salesReportPeriod(2026, 2)).toMatchObject({
      mode: 'monthly', year: 2026, month: 2,
      startDate: '2026-02-01', endDate: '2026-03-01',
      previousStartDate: '2026-01-01', previousEndDate: '2026-02-01',
    });
  });

  it('creates a full calendar-year range and prior-year comparison', () => {
    expect((service as any).salesReportPeriod(2026)).toMatchObject({
      mode: 'annual', year: 2026, month: null,
      startDate: '2026-01-01', endDate: '2027-01-01',
      previousStartDate: '2025-01-01', previousEndDate: '2026-01-01',
    });
  });

  it('rejects invalid report months', () => {
    expect(() => (service as any).salesReportPeriod(2026, 13)).toThrow(BadRequestException);
  });
});
