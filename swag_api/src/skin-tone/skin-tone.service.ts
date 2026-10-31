import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class SkinToneService {
  async analyze(image: unknown) {
    if (typeof image !== 'string' || !image.trim()) {
      throw new BadRequestException('A skin-tone image is required.');
    }

    const baseUrl = process.env.SKIN_TONE_API_URL?.trim().replace(/\/$/, '');
    const apiKey = process.env.SKIN_TONE_API_KEY?.trim();
    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException('Skin-tone analysis is temporarily unavailable.');
    }

    try {
      const response = await fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ image }),
        signal: AbortSignal.timeout(30_000),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error('Skin-tone provider rejected the request.');
      return data;
    } catch {
      throw new ServiceUnavailableException('Skin-tone analysis is temporarily unavailable.');
    }
  }
}
