import { Injectable, HttpException } from '@nestjs/common';

type UploadedTryonFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class TryonService {
  private get vtonBaseUrl() {
    return 'https://rardlouis--swag-vton-fastapi-app.us-east.modal.run';
  }

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

    const result = await this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/upload`, {
      method: 'POST',
      body: form,
    });

    return this.localizeResultImages(result);
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

    const result = await this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/upload-three-piece`, {
      method: 'POST',
      body: form,
    });

    return this.localizeResultImages(result);
  }

  async progress(jobId: string) {
    return this.forwardJson(`${this.vtonBaseUrl}/v1/tryon/progress/${encodeURIComponent(jobId)}`);
  }

  async resultImage(filename: string) {
    if (!/^[a-f0-9]{32}\.jpg$/i.test(filename)) {
      throw new HttpException('Try-on result image not found.', 404);
    }

    const response = await fetch(`${this.vtonBaseUrl}/results/${encodeURIComponent(filename)}`, {
      headers: this.modalProxyHeaders(),
    });

    if (!response.ok) {
      throw new HttpException('Could not retrieve the generated try-on image.', response.status);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/jpeg')) {
      throw new HttpException('Try-on service returned an invalid image response.', 502);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new HttpException('Try-on service returned a corrupt JPEG image.', 502);
    }

    return bytes;
  }

  private localizeResultImages(result: unknown) {
    if (!result || typeof result !== 'object') return result;

    const data = result as Record<string, unknown>;
    const source = [data.image_path, data.image_url, data.image].find(
      (value): value is string => typeof value === 'string',
    );
    const proxyPath = source ? this.resultProxyPath(source) : null;

    if (proxyPath) {
      data.image = proxyPath;
      data.image_path = proxyPath;
      data.image_url = proxyPath;
    }

    if (Array.isArray(data.images)) {
      data.images = data.images.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const image = item as Record<string, unknown>;
        const path = [image.path, image.url].find(
          (value): value is string => typeof value === 'string',
        );
        const localizedPath = path ? this.resultProxyPath(path) : null;
        return localizedPath ? { ...image, path: localizedPath, url: localizedPath } : image;
      });
    }

    return data;
  }

  private resultProxyPath(value: string) {
    const match = value.match(/\/results\/([a-f0-9]{32}\.jpg)(?:[?#]|$)/i);
    return match ? `/tryon/results/${match[1]}` : null;
  }

  private modalProxyHeaders() {
    const modalKey = process.env.MODAL_PROXY_TOKEN_ID?.trim();
    const modalSecret = process.env.MODAL_PROXY_TOKEN_SECRET?.trim();
    if (!modalKey || !modalSecret) {
      throw new HttpException('Modal proxy credentials are not configured on the API server.', 503);
    }

    return {
      'User-Agent': 'SWAG-Nest-TryOn-Proxy',
      'Modal-Key': modalKey,
      'Modal-Secret': modalSecret,
    };
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
        ...this.modalProxyHeaders(),
        ...init?.headers,
      },
    });

    const text = await response.text();
    if (/text\/html/i.test(response.headers.get('content-type') ?? '') || /^\s*<!doctype html/i.test(text)) {
      throw new HttpException(
        {
          statusCode: 502,
          message:
            'Try-on service returned an HTML page instead of JSON. Confirm the deployed API is running this Modal-connected NestJS build.',
        },
        502,
      );
    }

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
