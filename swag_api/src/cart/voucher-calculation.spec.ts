import { calculateVoucherDiscount } from './cart.service';

describe('voucher discount calculation', () => {
  it('discounts only the product subtotal for percentage vouchers', () => {
    const productSubtotal = 1000;
    const shippingFee = 100;
    const discount = calculateVoucherDiscount(productSubtotal, 'percentage', 10);

    expect(discount).toBe(100);
    expect(productSubtotal - discount + shippingFee).toBe(1000);
  });

  it('caps a fixed discount at the product subtotal', () => {
    expect(calculateVoucherDiscount(75, 'fixed', 100)).toBe(75);
  });

  it('rounds percentage discounts to centavos', () => {
    expect(calculateVoucherDiscount(999.99, 'percentage', 12.5)).toBe(125);
  });
});
