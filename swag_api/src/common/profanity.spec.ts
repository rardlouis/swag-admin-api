import { BadRequestException } from '@nestjs/common';
import { assertCleanText, containsProfanity, findBannedWord } from './profanity';

describe('profanity filter', () => {
  it('allows ordinary product and message text', () => {
    expect(containsProfanity('Vintage denim jacket in good condition')).toBe(false);
    expect(findBannedWord('Can I ask about the size?')).toBeNull();
  });

  it('blocks English and Tagalog profanity', () => {
    expect(containsProfanity('This is gago behavior')).toBe(true);
    expect(containsProfanity('That was putang ina')).toBe(true);
    expect(containsProfanity('What the sh!!!t')).toBe(true);
  });

  it('throws a user-safe validation error', () => {
    expect(() => assertCleanText('ulol ka', 'Message')).toThrow(BadRequestException);
    expect(() => assertCleanText('ulol ka', 'Message')).toThrow('Message contains words that are not allowed');
  });
});
