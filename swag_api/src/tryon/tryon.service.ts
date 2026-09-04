import { Injectable, HttpException } from '@nestjs/common';

type UploadedTryonFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class TryonService {
  private readonly vtonBaseUrl =
    process.env.SWAG_VTON_BASE_URL ??
    process.env.TRY_ON_API_BASE_URL ??
    'https://glisteringly-unsyncopated-ara.ngrok-free.dev';

  async upload(
    body: Record<string, string | string[] | undefined>,
    files: {
      person_image?: UploadedTryonFile[];
      garment_image?: UploadedTryonFile[];
    },
  ) {
    const personImage = files.person_image?.[0];
    const garmentImage = files.garment_image?.[0];

    if (!personImage || !garmentImage) {
      throw new HttpException('Both person_image and garment_image are required.', 400);
    }

    const form = new FormData();
    this.appendFile(form, 'person_image', personImage, 'person.jpg');
    this.appendFile(form, 'garment_image', garmentImage, 'garment.jpg');

    Object.entries(body).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => form.append(key, entry));
        return;
      }

      if (value !== undefined) {
        form.append(key, value);
      }
    });

    return this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/upload`, {
      method: 'POST',
      body: form,
    });
  }

  async uploadThreePiece(
    body: Record<string, string | string[] | undefined>,
    files: {
      person_image?: UploadedTryonFile[];
      dress_image?: UploadedTryonFile[];
      bottom_image?: UploadedTryonFile[];
      top_image?: UploadedTryonFile[];
    },
  ) {
    const personImage = files.person_image?.[0];
    const dressImage = files.dress_image?.[0];
    const bottomImage = files.bottom_image?.[0];
    const topImage = files.top_image?.[0];

    if (!personImage || !dressImage || !bottomImage || !topImage) {
      throw new HttpException('person_image, dress_image, bottom_image, and top_image are required.', 400);
    }

    const form = new FormData();
    this.appendFile(form, 'person_image', personImage, 'person.jpg');
    this.appendFile(form, 'dress_image', dressImage, 'dress.jpg');
    this.appendFile(form, 'bottom_image', bottomImage, 'bottom.jpg');
    this.appendFile(form, 'top_image', topImage, 'top.jpg');

    Object.entries(body).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => form.append(key, entry));
        return;
      }

      if (value !== undefined) {
        form.append(key, value);
      }
    });

    return this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/upload-three-piece`, {
      method: 'POST',
      body: form,
    });
  }

  async progress(jobId: string) {
    return this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/progress/${encodeURIComponent(jobId)}`);
  }

  private appendFile(form: FormData, field: string, file: UploadedTryonFile, fallbackName: string) {
    const filename = file.originalname || fallbackName;
    const arrayBuffer = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: file.mimetype || 'application/octet-stream' });
    form.append(field, blob, filename);
  }

  private async forwardJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'SWAG-Nest-TryOn-Proxy',
        ...init?.headers,
      },
    });

    const text = await response.text();
    const data = this.parseJson(text, response.status);

    if (!response.ok) {
      throw new HttpException(data, response.status);
    }

    return data;
  }

  private parseJson(text: string, status: number) {
    try {
      return JSON.parse(text);
    } catch {
      return {
        statusCode: status,
        message: text || 'Try-on service returned an empty response.',
      };
    }
  }
}
